import * as store from "../src/db.js";
import * as L from "../src/league.js";
import {ApiError} from "../src/util.js";
import {getProvider,PROVIDER_NAMES} from "../src/providers/index.js";

const json=(res,status,data)=>{res.statusCode=status;res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");res.end(JSON.stringify(data))};
const body=async req=>{const chunks=[];for await(const c of req)chunks.push(c);return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{}};
const code=req=>String(req.headers["x-team-code"]||"").trim().toUpperCase();
const team=(l,c)=>{const t=l.teams.find(x=>x.code===c);if(!t)throw new ApiError(401,"Invalid team access code");return t};
const pub=l=>({id:l.id,name:l.name,season:l.season,startWeek:l.startWeek,numWeeks:l.numWeeks,budget:l.budget,provider:l.provider,slots:L.SLOTS,groups:L.getGroups(l).map(g=>({id:g.id,name:g.name,teamIds:g.teamIds,standings:L.groupStandings(l,g.id)})),teams:l.teams.map(t=>({id:t.id,name:t.name,isCommish:t.isCommish,groupId:L.getGroups(l).find(g=>g.teamIds.includes(t.id))?.id||null})),weeks:l.weeks.map(w=>({week:w.week,nflWeek:w.nflWeek,status:w.status,lockAt:w.lockAt,poolReadyAt:w.poolReadyAt||null,competitions:w.matchups.map(m=>({id:m.id,groupId:m.groupId,teamIds:m.teamIds,result:m.result||null}))})),standings:L.standings(l)});
async function getLeague(id,c){const l=await store.getLeague(id,c);if(!l)throw new ApiError(404,"League not found");return l}
export default async function(req,res){
 try{
  const u=new URL(req.url,"http://localhost"),p=u.pathname.split("/").filter(Boolean);
  if(p[0]!=="api"||p[1]!=="leagues")throw new ApiError(404,"Not found");
  if(req.method==="POST"&&p.length===2){const l=await store.createLeague(L.createLeague(await body(req)));return json(res,201,{league:pub(l),codes:l.teams.map(t=>({teamId:t.id,name:t.name,code:t.code,isCommish:t.isCommish}))})}
  if(req.method==="GET"&&p.length===3){const l=await store.getPublicLeague(p[2]);if(!l)throw new ApiError(404,"League not found");return json(res,200,pub(l));}
  const accessCode=code(req); const l=await getLeague(p[2],accessCode); const statusChanged=L.refreshStatuses(l); if(statusChanged) l.__version=await store.saveLeague(l,accessCode,l.__version); const t=team(l,accessCode);
  if(req.method==="GET"&&p[3]==="me"){const group=L.getGroups(l).find(g=>g.teamIds.includes(t.id));return json(res,200,{team:{id:t.id,name:t.name,isCommish:t.isCommish,groupId:group?.id||null,groupName:group?.name||"Group A"}});}
  if(req.method==="GET"&&p[3]==="weeks"&&p[5]==="submissions"){const w=L.getWeek(l,p[4]);if(!t.isCommish)throw new ApiError(403,"Commissioner only");const teams=l.teams.map(tm=>{const m=w.matchups.find(x=>x.teamIds?.includes(tm.id));return{id:tm.id,name:tm.name,groupId:L.getGroups(l).find(g=>g.teamIds.includes(tm.id))?.id||null,submitted:!!m?.lineups?.[tm.id],status:w.status}});return json(res,200,{week:{week:w.week,nflWeek:w.nflWeek,status:w.status,poolReadyAt:w.poolReadyAt||null},submitted:teams.filter(x=>x.submitted).length,total:teams.length,teams})}
  if(req.method==="GET"&&p[3]==="weeks"&&p[5]==="live"){
 const w=L.getWeek(l,p[4]),provider=getProvider(l.provider),ids=L.poolIds(w);
 const actuals=await provider.getActuals(l.season,w.nflWeek,ids);
 const schedule=provider.getSchedule?await provider.getSchedule(l.season,w.nflWeek):[];
 const allGamesFinal=Array.isArray(schedule)&&schedule.length>0&&schedule.every(g=>/final|complete|ended/i.test(String(g.status||"")));
 if(w.status==="locked"&&allGamesFinal){
  L.scoreWeek(l,p[4],actuals);
  l.__version=await store.saveLeague(l,code(req),l.__version);
 }
 const matchups=w.matchups.map(m=>{const locked=["locked","final"].includes(w.status);const teams=(m.teamIds||[]).map(id=>{const tm=l.teams.find(x=>x.id===id),own=id===t.id,canSee=own||t.isCommish||locked,lineup=m.lineups[id]||L.emptyLineup(),playerPoints={};for(const pid of L.SLOT_NAMES.flatMap(s=>lineup[s]||[]))playerPoints[pid]=actuals[pid]||0;const score=canSee&&m.lineups[id]?L.SLOT_NAMES.flatMap(s=>lineup[s]||[]).reduce((sum,pid)=>sum+(actuals[pid]||0)*(pid===lineup.multipliers?.ace?2:pid===lineup.multipliers?.impact?1.5:1),0):null;return{id,name:tm?.name||"Unknown",submitted:!!m.lineups[id],score,playerPoints,lineup:canSee&&m.lineups[id]?lineup:null}});return{id:m.id,groupId:m.groupId,teamIds:m.teamIds,bye:false,teams,result:m.result||null};});return json(res,200,{week:{week:w.week,nflWeek:w.nflWeek,status:w.status,lockAt:w.lockAt,poolReadyAt:w.poolReadyAt||null},schedule,matchups,refreshedAt:new Date().toISOString()});
}
  if(req.method==="GET"&&p[3]==="weeks"&&p[5]==="matchups"){const w=L.getWeek(l,p[4]);const locked=["locked","final"].includes(w.status);const matchups=w.matchups.map(m=>({id:m.id,groupId:m.groupId,teamIds:m.teamIds,bye:false,pool:m.pool||[],result:m.result||null,teams:(m.teamIds||[]).map(id=>{const tm=l.teams.find(x=>x.id===id);const canSeeLineup=t.isCommish||locked||id===t.id;return{id,name:tm?.name||"Unknown",submitted:!!m.lineups[id],lineup:canSeeLineup?(m.lineups[id]||L.emptyLineup()):null}})}));return json(res,200,{week:{week:w.week,nflWeek:w.nflWeek,status:w.status,lockAt:w.lockAt,poolReadyAt:w.poolReadyAt||null},matchups})}
  if(req.method==="GET"&&p[3]==="weeks"){const w=L.getWeek(l,p[4]),m=w.matchups.find(x=>x.a===t.id||x.b===t.id),o=m?.a===t.id?m.b:m?.a;return json(res,200,{week:{week:w.week,nflWeek:w.nflWeek,status:w.status,lockAt:w.lockAt,poolReadyAt:w.poolReadyAt||null},matchup:m?{id:m.id,opponent:o?{id:o,name:l.teams.find(x=>x.id===o)?.name}:null,pool:m.pool||[],myLineup:m.lineups[t.id]||L.emptyLineup(),submitted:!!m.lineups[t.id],opponentLineup:(w.status==="locked"||w.status==="final")&&o?m.lineups[o]||L.emptyLineup():null,result:m.result||null}:null})}
  if(req.method==="PUT"&&p[3]==="weeks"&&p[5]==="lineup"){const w=L.getWeek(l,p[4]);if(w.status!=="open")throw new ApiError(409,"Lineups can only be changed while the week is open");const m=w.matchups.find(x=>x.teamIds?.includes(t.id));if(!m)throw new ApiError(409,"You are not assigned to a group this week");const c=L.validateLineup((await body(req)).lineup,m.pool,l.budget);if(!c.ok)throw new ApiError(400,c.errors.join(". "));m.lineups[t.id]=c.lineup;L.checkStandoff(m);l.__version=await store.saveLeague(l,code(req),l.__version);return json(res,200,{...c,submitted:true})}
  if(req.method==="POST"&&p[3]==="weeks"&&p[5]==="open"){if(!t.isCommish)throw new ApiError(403,"Commissioner only");const w=L.getWeek(l,p[4]);L.openWeek(l,p[4]);l.__version=await store.saveLeague(l,code(req),l.__version);return json(res,200,w)}
  if(req.method==="POST"&&p[3]==="weeks"&&p[5]==="generate-pool"){if(!t.isCommish)throw new ApiError(403,"Commissioner only");const w=L.getWeek(l,p[4]);const players=await getProvider(l.provider).getPlayers(l.season,w.nflWeek);L.generatePools(l,p[4],players);l.__version=await store.saveLeague(l,code(req),l.__version);const saved=await store.getLeague(l.id,code(req));const savedWeek=L.getWeek(saved,p[4]);const generatedMatchups=savedWeek.matchups.filter(m=>m.b!==null&&Array.isArray(m.pool)&&m.pool.length>0).length;const expectedMatchups=savedWeek.matchups.filter(m=>m.b!==null).length;if(!savedWeek.poolReadyAt||generatedMatchups!==expectedMatchups)throw new ApiError(500,"Player pool generation did not persist correctly. Please try again.");return json(res,200,{week:savedWeek,poolReady:true,generatedMatchups,expectedMatchups})}
  if(req.method==="POST"&&p[3]==="weeks"&&p[5]==="lock"){if(!t.isCommish)throw new ApiError(403,"Commissioner only");const w=L.getWeek(l,p[4]);L.lockWeek(l,w);l.__version=await store.saveLeague(l,code(req),l.__version);return json(res,200,w)}
  if(req.method==="POST"&&p[3]==="weeks"&&p[5]==="score"){if(!t.isCommish)throw new ApiError(403,"Commissioner only");const w=L.getWeek(l,p[4]);const a=await getProvider(l.provider).getActuals(l.season,w.nflWeek,L.poolIds(w));L.scoreWeek(l,p[4],a);l.__version=await store.saveLeague(l,code(req),l.__version);return json(res,200,{week:w,standings:L.standings(l)})}
  throw new ApiError(404,"Not found");
 }catch(e){return json(res,e.status||500,{error:e.message||"Server error"})}
}
