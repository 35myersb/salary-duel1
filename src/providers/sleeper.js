import {cached} from "./cache.js";
import {scoreHalfPPR} from "../scoring.js";
const BASE="https://api.sleeper.app";
const POS=["QB","RB","WR","TE"];
async function getJSON(url){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error("Sleeper responded "+r.status);return r.json()}
function endpoint(kind,s,w){return BASE+"/"+kind+"/nfl/"+s+"/"+w+"?season_type=regular&order_by=pts_half_ppr&"+POS.map(p=>"position[]="+p).join("&")}
export default {
 name:"sleeper",label:"Real NFL data (Sleeper)",
 async getPlayers(s,w){
  const items=await cached("proj-"+s+"-"+w,21600000,()=>getJSON(endpoint("projections",s,w)));
  if(!Array.isArray(items)||!items.length)throw new Error("No projections posted");
  return items.map(i=>({id:"sl-"+i.player_id,name:i.player?.full_name||i.player_id,pos:i.player?.position||i.position,team:i.player?.team||i.team||"FA",proj:Number(i.stats?.pts_half_ppr||0)})).filter(p=>POS.includes(p.pos)&&p.proj>=2);
 },
 async getActuals(s,w,ids){
  const items=await getJSON(endpoint("stats",s,w));
  const map=new Map(items.map(i=>["sl-"+i.player_id,Number(i.stats?.pts_half_ppr??scoreHalfPPR(i.stats||{}))]));
  return Object.fromEntries(ids.map(id=>[id,map.get(id)||0]));
 }
};