import * as store from "../src/db.js";
import * as L from "../src/league.js";
import {ApiError} from "../src/util.js";
import {getProvider,PROVIDER_NAMES} from "../src/providers/index.js";

const json=(res,status,data)=>{res.statusCode=status;res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");res.end(JSON.stringify(data))};
const body=async req=>{const chunks=[];for await(const c of req)chunks.push(c);return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{}};
const code=req=>String(req.headers["x-team-code"]||"").trim().toUpperCase();
const team=(l,c)=>{const t=l.teams.find(x=>x.code===c);if(!t)throw new ApiError(401,"Invalid team access code");return t};
const pub=l=>({id:l.id,name:l.name,season:l.season,startWeek:l.startWeek,numWeeks:l.numWeeks,budget:l.budget,provider:l.provider,slots:L.SLOTS,teams:l.teams.map(t=>({id:t.id,name:t.name,isCommish:t.isCommish})),weeks:l.weeks.map(w=>({week:w.week,nflWeek:w.nflWeek,status:w.status,lockAt:w.lockAt,matchups:w.matchups.map(m=>({id:m.id,a:l.teams.find(t=>t.id===m.a)?.name||null,b:l.teams.find(t=>t.id===m.b)?.name||null,bye:m.b===null,winner:m.result?.winner||null,points:m.result?.points||null}))})),standings:L.standings(l)});
async function getLeague(id,c){const l=await store.getLeague(id,c);if(!l)throw new ApiError(404,"League not found");return l}
export default async function(req,res){
 try{
  const u=new URL(req.url,"http://localhost"),p=u.pathname.split("/").filter(Boolean);
  if(p[0]!=="api"||p[1]!=="leagues")throw new ApiError(404,"Not found");
  if(req.method==="POST"&&p.length===2){const l=await store.createLeague(L.createLeague(await body(req)));return json(res,201,{league:pub(l),codes:l.teams.map(t=>({teamId:t.id,name:t.name,code:t.code,isCommish:t.isCommish}))})}
  if(req.method==="GET"&&p.length===3){const l=await store.getPublicLeague(p[2]);if(!l)throw new ApiError(404,"League not found");return json(res,200,pub(l));}
  const l=await getLeague(p[2],code(req)),t=team(l,code(req));
  if(req.method==="GET"&&p[3]==="me")return json(res,200,{team:{id:t.id,name:t.name,isCommish:t.isCommish}});
  if(req.method==="GET"&&p[3]==="weeks"){const w=L.getWeek(l,p[4]),m=w.matchups.find(x=>x.a===t.id||x.b===t.id),o=m?.a===t.id?m.b:m?.a;return json(res,200,{week:{week:w.week,nflWeek:w.nflWeek,status:w.status,lockAt:w.lockAt},matchup:m?{id:m.id,opponent:o?{id:o,name:l.teams.find(x=>x.id===o)?.name}:null,pool:m.pool||[],myLineup:m.lineups[t.id]||L.emptyLineup(),opponentLineup:(w.status==="locked"||w.status==="final")&&o?m.lineups[o]||L.emptyLineup():null,result:m.result||null}:null})}
  if(req.method==="PUT"&&p[3]==="weeks"&&p[5]==="lineup"){const w=L.getWeek(l,p[4]);if(w.status!=="open")throw new ApiError(409,"Lineups can only be changed while the week is open");const m=w.matchups.find(x=>x.a===t.id||x.b===t.id);if(!m||m.b===null)throw new ApiError(409,"You do not have a matchup this week");const c=L.validateLineup((await body(req)).lineup,m.pool,l.budget);if(!c.ok)throw new ApiError(400,c.errors.join(". "));m.lineups[t.id]=c.lineup;L.checkStandoff(m);l.__version=await store.saveLeague(l,code(req),l.__version);return json(res,200,c)}
  if(req.method==="POST"&&p[3]==="weeks"&&p[5]==="open"){if(!t.isCommish)throw new ApiError(403,"Commissioner only");const w=L.getWeek(l,p[4]);const players=await getProvider(l.provider).getPlayers(l.season,w.nflWeek);L.openWeek(l,p[4],players);l.__version=await store.saveLeague(l,code(req),l.__version);return json(res,200,w)}
  if(req.method==="POST"&&p[3]==="weeks"&&p[5]==="lock"){if(!t.isCommish)throw new ApiError(403,"Commissioner only");const w=L.getWeek(l,p[4]);L.lockWeek(l,w);l.__version=await store.saveLeague(l,code(req),l.__version);return json(res,200,w)}
  if(req.method==="POST"&&p[3]==="weeks"&&p[5]==="score"){if(!t.isCommish)throw new ApiError(403,"Commissioner only");const w=L.getWeek(l,p[4]);const a=await getProvider(l.provider).getActuals(l.season,w.nflWeek,L.poolIds(w));L.scoreWeek(l,p[4],a);l.__version=await store.saveLeague(l,code(req),l.__version);return json(res,200,{week:w,standings:L.standings(l)})}
  throw new ApiError(404,"Not found");
 }catch(e){return json(res,e.status||500,{error:e.message||"Server error"})}
}