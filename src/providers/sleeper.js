import {cached} from "./cache.js";
import {scoreHalfPPR} from "../scoring.js";
const BASE="https://api.sleeper.app/v1";
const POS=["QB","RB","WR","TE"];
async function getJSON(url){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error("Sleeper responded "+r.status);return r.json()}
const statsEndpoint=(s,w)=>BASE+"/stats/nfl/regular/"+s+"/"+w+"?season_type=regular";
const playersEndpoint=()=>BASE+"/players/nfl";

function fantasy(stats){return Number(stats?.pts_half_ppr??scoreHalfPPR(stats||{}))||0;}

async function historicalProjections(season, week, players){
  // Sleeper does not reliably publish a forward-looking projection feed.
  // Build a practical projection from the most recent available NFL production.
  const weeks = [];
  if (week > 1) {
    for (let w=Math.max(1,week-4); w<week; w++) weeks.push([season,w]);
  } else {
    // Week 1: use the most recent completed weeks from the prior season.
    for (let w=14; w<=18; w++) weeks.push([season-1,w]);
  }
  const datasets = await Promise.all(weeks.map(([s,w]) =>
    cached("hist-"+s+"-"+w,21600000,()=>getJSON(statsEndpoint(s,w))).catch(()=>[])
  ));
  const totals = new Map(), counts = new Map();
  for (const rows of datasets) {
    const entries = Array.isArray(rows)
      ? rows.map((row) => [row.player_id, row])
      : Object.entries(rows || {});
    for (const [key, row] of entries) {
      const id = row?.player_id || key;
      const pts = fantasy(row?.stats || row);
      if (!id || pts <= 0) continue;
      totals.set(id,(totals.get(id)||0)+pts);
      counts.set(id,(counts.get(id)||0)+1);
    }
  }
  return players.map(p=>{
    const avg=counts.has(p.player_id)?totals.get(p.player_id)/counts.get(p.player_id):0;
    return {...p,proj:Number(avg.toFixed(1)),injuryStatus:p.injuryStatus||null};
  });
}

export default {
 name:"sleeper",label:"Real NFL data (Sleeper)",
 async getPlayers(s,w){
  const players=await cached("players-nfl",86400000,()=>getJSON(playersEndpoint()));
  const metaPlayers=Object.entries(players||{}).map(([id,p])=>({
    player_id:id,
    full_name:p.full_name||[p.first_name,p.last_name].filter(Boolean).join(" "),
    position:p.position,
    team:p.team,
    injuryStatus:p.injury_status||p.injury_statuses?.[0]||null
  })).filter(p=>POS.includes(p.position)&&p.team);
  
  let projected=[];
  // Keep the direct projection attempt, but fall back to recent real production.
  try {
    const r=await getJSON(BASE+"/projections/nfl/regular/"+s+"/"+w+"?season_type=regular");
    if(Array.isArray(r)) projected=r;
  } catch {}
  
  if (projected.length) {
    const byId=new Map(metaPlayers.map(p=>[p.player_id,p]));
    return projected.map(i=>{
      const meta=byId.get(i.player_id)||{};
      const stats=i.stats||i;
      return {id:"sl-"+i.player_id,name:meta.full_name||i.player_id,pos:meta.position,team:meta.team,proj:fantasy(stats),injuryStatus:meta.injuryStatus||null};
    }).filter(p=>POS.includes(p.pos)&&p.team&&p.proj>=2);
  }

  const historical=await historicalProjections(s,w,metaPlayers);
  const out=historical
    .filter(p=>p.proj>=2)
    .map(p=>({id:"sl-"+p.player_id,name:p.full_name,pos:p.position,team:p.team,proj:p.proj,injuryStatus:p.injuryStatus||null}));
  return addOpponents(out,s,w);
 },
 async getLockAt(s,w){
  try {
    const games=await cached("schedule-"+s,21600000,()=>getJSON("https://api.sleeper.app/schedule/nfl/regular/"+s));
    const weekGames=(Array.isArray(games)?games:[]).filter(g=>Number(g.week)===Number(w)&&g.date);
    if(!weekGames.length)return null;
    const firstKickoff=Math.min(...weekGames.map(g=>Date.parse(g.date)).filter(Number.isFinite));
    if(!Number.isFinite(firstKickoff))return null;
    // Lock five minutes before the earliest scheduled game of the week.
    return new Date(firstKickoff-5*60*1000).toISOString();
  } catch { return null; }
 },
 async getActuals(s,w,ids){
  const items=await getJSON(statsEndpoint(s,w));
  const map=new Map((Array.isArray(items)?items:[]).map(i=>["sl-"+i.player_id,fantasy(i.stats||i)]));
  return Object.fromEntries(ids.map(id=>[id,map.get(id)||0]));
 }
};
