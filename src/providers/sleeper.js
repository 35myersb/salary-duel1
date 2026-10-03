import {cached} from "./cache.js";
import {scoreHalfPPR} from "../scoring.js";
const BASE="https://api.sleeper.app/v1";
const POS=["QB","RB","WR","TE"];
async function getJSON(url){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error("Sleeper responded "+r.status);return r.json()}
const endpoint=(kind,s,w)=>kind==="players"?BASE+"/players/nfl":BASE+"/"+kind+"/nfl/regular/"+s+"/"+w+"?season_type=regular&order_by=pts_half_ppr&"+POS.map(p=>"position[]="+p).join("&");
export default {
 name:"sleeper",label:"Real NFL data (Sleeper)",
 async getPlayers(s,w){
  const [items,players]=await Promise.all([
   cached("proj-"+s+"-"+w,21600000,()=>getJSON(endpoint("projections",s,w))),
   cached("players-nfl",86400000,()=>getJSON(endpoint("players")))
  ]);
  if(!Array.isArray(items)||!items.length)throw new Error("No Sleeper projections posted for that week");
  return items.map(i=>{
   const meta=players?.[i.player_id]||{};
   const stats=i.stats||i;
   return {id:"sl-"+i.player_id,name:meta.full_name||[meta.first_name,meta.last_name].filter(Boolean).join(" ")||i.player_id,pos:meta.position||i.position,team:meta.team||i.team||"FA",proj:Number(stats.pts_half_ppr||0)};
  }).filter(p=>POS.includes(p.pos)&&p.team&&p.proj>=2);
 },
 async getActuals(s,w,ids){
  const items=await getJSON(endpoint("stats",s,w));
  const map=new Map(items.map(i=>["sl-"+i.player_id,Number((i.stats||i).pts_half_ppr??scoreHalfPPR(i.stats||i))]));
  return Object.fromEntries(ids.map(id=>[id,map.get(id)||0]));
 }
};