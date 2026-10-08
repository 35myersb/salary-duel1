import {cached} from "./cache.js";
import {scoreHalfPPR} from "../scoring.js";
import {getConsensusProjections,consensusForPlayer} from "../consensus.js";
const BASE="https://api.sleeper.app/v1";
const POS=["QB","RB","WR","TE"];
async function getJSON(url){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error("Sleeper responded "+r.status);return r.json()}
const statsEndpoint=(s,w)=>BASE+"/stats/nfl/regular/"+s+"/"+w+"?season_type=regular";
const playersEndpoint=()=>BASE+"/players/nfl";

function fantasy(stats){return Number(stats?.pts_half_ppr??scoreHalfPPR(stats||{}))||0;}
const QB_UNAVAILABLE=new Set(["out","ir","doubtful","inactive","injured_reserve"]);

function markLikelyStarters(players){
  const byTeam=new Map();
  for(const p of players.filter(x=>x.position==="QB"&&x.team)){
    if(!byTeam.has(p.team))byTeam.set(p.team,[]);
    byTeam.get(p.team).push(p);
  }
  for(const qbs of byTeam.values()){
    const ordered=qbs
      .filter(q=>Number.isFinite(Number(q.depthChartOrder)))
      .sort((a,b)=>Number(a.depthChartOrder)-Number(b.depthChartOrder));
    let starter=ordered.find(q=>Number(q.depthChartOrder)===1)||ordered[0];
    const status=String(starter?.injuryStatus||"").toLowerCase();
    if(starter && QB_UNAVAILABLE.has(status)){
      starter=ordered.find(q=>Number(q.depthChartOrder)>Number(starter.depthChartOrder)
        && !QB_UNAVAILABLE.has(String(q.injuryStatus||"").toLowerCase()));
    }
    if(starter) for(const q of qbs) q.likelyStarter=q.player_id===starter.player_id;
    else {
      // If depth-chart data is missing for a team, don't label every QB a starter.
      // The highest-projection QB is the conservative fallback.
      const fallback=[...qbs].sort((a,b)=>Number(b.proj||0)-Number(a.proj||0))[0];
      for(const q of qbs) q.likelyStarter=q.player_id===fallback?.player_id;
    }
  }
  return players;
}

async function historicalProjections(season, week, players){
  const weeks = [];
  if (week > 1) for (let w=Math.max(1,week-4); w<week; w++) weeks.push([season,w]);
  else for (let w=14; w<=18; w++) weeks.push([season-1,w]);
  const datasets = await Promise.all(weeks.map(([s,w]) =>
    cached("hist-"+s+"-"+w,21600000,()=>getJSON(statsEndpoint(s,w))).catch(()=>[])
  ));
  const totals = new Map(), counts = new Map();
  for (const rows of datasets) {
    const entries = Array.isArray(rows) ? rows.map(row=>[row.player_id,row]) : Object.entries(rows||{});
    for (const [key,row] of entries) {
      const id=row?.player_id||key, pts=fantasy(row?.stats||row);
      if(!id||pts<=0)continue;
      totals.set(id,(totals.get(id)||0)+pts); counts.set(id,(counts.get(id)||0)+1);
    }
  }
  return markLikelyStarters(players.map(p=>{
    const avg=counts.has(p.player_id)?totals.get(p.player_id)/counts.get(p.player_id):0;
    return {...p,proj:Number(avg.toFixed(1)),injuryStatus:p.injuryStatus||null};
  }));
}

async function addOpponents(players, season, week){
  try {
    const games=await cached("schedule-"+season,21600000,()=>getJSON("https://api.sleeper.app/schedule/nfl/regular/"+season));
    const weekGames=(Array.isArray(games)?games:[]).filter(g=>Number(g.week)===Number(week));
    const byTeam=new Map();
    for(const g of weekGames){
      if(g.home)byTeam.set(g.home,{opponent:g.away,homeAway:"vs"});
      if(g.away)byTeam.set(g.away,{opponent:g.home,homeAway:"@"});
    }
    return players.map(p=>({
      ...p,
      ...(byTeam.get(p.team)||{}),
      onBye: !byTeam.has(p.team)
    }));
  } catch { return players; }
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
    injuryStatus:p.injury_status||p.injury_statuses?.[0]||null,
    depthChartOrder:Number.isFinite(Number(p.depth_chart_order))?Number(p.depth_chart_order):null,
    depthChartPosition:p.depth_chart_position||null
  })).filter(p=>POS.includes(p.position)&&p.team);

  markLikelyStarters(metaPlayers);
  let consensus=null;
  try { consensus=await getConsensusProjections(s,w); } catch { consensus=null; }
  let projected=[];
  try {
    const r=await getJSON(BASE+"/projections/nfl/regular/"+s+"/"+w+"?season_type=regular");
    if(Array.isArray(r))projected=r;
  } catch {}

  if(projected.length){
    const byId=new Map(metaPlayers.map(p=>[p.player_id,p]));
    return addOpponents(projected.map(i=>{
      const meta=byId.get(i.player_id)||{}, stats=i.stats||i;
      const baseProj=fantasy(stats);
      const temp={name:meta.full_name||i.player_id,pos:meta.position};
      const consensusProj=consensus?consensusForPlayer(consensus,temp):null;
      return {id:"sl-"+i.player_id,name:meta.full_name||i.player_id,pos:meta.position,team:meta.team,
        proj:consensusProj??baseProj,baseProj,consensusProj,
        injuryStatus:meta.injuryStatus||null,likelyStarter:meta.likelyStarter!==false,
        depthChartOrder:meta.depthChartOrder};
    }).filter(p=>POS.includes(p.pos)&&p.team&&p.proj>=2),s,w).then(rows=>rows.filter(p=>!p.onBye));
  }

  const historical=await historicalProjections(s,w,metaPlayers);
  if (consensus) {
    for (const p of historical) {
      const cp=consensusForPlayer(consensus,{name:p.full_name,pos:p.position});
      if (cp!=null) p.proj=cp;
    }
  }
  const out=historical.filter(p=>p.proj>=2).map(p=>({
    id:"sl-"+p.player_id,name:p.full_name,pos:p.position,team:p.team,proj:p.proj,
    injuryStatus:p.injuryStatus||null,likelyStarter:p.likelyStarter!==false,depthChartOrder:p.depthChartOrder
  }));
  return (await addOpponents(out,s,w)).filter(p=>!p.onBye);
 },
 async getLockAt(s,w){
  try {
    const games=await cached("schedule-"+s,21600000,()=>getJSON("https://api.sleeper.app/schedule/nfl/regular/"+s));
    const weekGames=(Array.isArray(games)?games:[]).filter(g=>Number(g.week)===Number(w)&&g.date);
    if(!weekGames.length)return null;
    const firstKickoff=Math.min(...weekGames.map(g=>Date.parse(g.date)).filter(Number.isFinite));
    if(!Number.isFinite(firstKickoff))return null;
    return new Date(firstKickoff-5*60*1000).toISOString();
  } catch { return null; }
 },
 async getSchedule(s,w){
 try{
  const games=await cached("schedule-"+s,30000,()=>getJSON("https://api.sleeper.app/schedule/nfl/regular/"+s));
  return (Array.isArray(games)?games:[]).filter(g=>Number(g.week)===Number(w)).map(g=>({
    id:g.game_id||g.game_id_str,home:g.home,away:g.away,date:g.date,status:g.status||null,
    homeScore:Number(g.home_score??0),awayScore:Number(g.away_score??0)
  }));
 }catch{return [];}
 },
 async getActuals(s,w,ids){
  const items=await getJSON(statsEndpoint(s,w));
  const map=new Map((Array.isArray(items)?items:[]).map(i=>["sl-"+i.player_id,fantasy(i.stats||i)]));
  return Object.fromEntries(ids.map(id=>[id,map.get(id)||0]));
 }
};
