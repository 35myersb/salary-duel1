import crypto from 'node:crypto';
import { ApiError, seededRng, shuffle, round2 } from './util.js';
import { salaryFromProjection } from './pricing.js';
import { PROVIDER_NAMES } from './providers/index.js';

export const SLOTS = { QB: 1, FLEX: 7 };
export const SLOT_NAMES = Object.keys(SLOTS);
export const FLEX_POS = ['RB', 'WR', 'TE'];
export const POOL_SIZES = { QB: 8, RB: 14, WR: 18, TE: 10 };
export const POOL_CANDIDATES = { QB: 32, RB: 70, WR: 90, TE: 35 };
export const MIN_BUDGET = 25000;
export const MAX_BUDGET = 100000;
const TOTAL_SLOTS = Object.values(SLOTS).reduce((a, b) => a + b, 0);
export const STANDOFF_DEFAULTS = { mutualPenalty: 10, foldPenalty: 3, holdBonus: 3 };
export const standoffRules = (league) => ({ ...STANDOFF_DEFAULTS, ...(league.standoff || {}) });
const lineupIds = (lineup) => (lineup ? SLOT_NAMES.flatMap((s) => lineup[s] || []) : []);
export const lineupKey = (lineup) => lineupIds(lineup).sort().join('|');
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomString(len) { return [...crypto.randomBytes(len)].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join(''); }
export const makeCode = () => randomString(8);
export const makeLeagueId = () => randomString(6).toLowerCase();
export const emptyLineup = () => ({ QB: [], FLEX: [], multipliers: { ace: null, impact: null } });
function wholeNumber(value, min, max, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(400, `${label} must be a whole number from ${min} to ${max}`);
  return n;
}
export function createLeague(input) {
  const name=String(input?.name||'').trim();
  if(!name||name.length>60)throw new ApiError(400,'League name is required (60 characters max)');
  const season=wholeNumber(input.season,2000,2100,'Season'),startWeek=wholeNumber(input.startWeek,1,18,'First NFL week'),numWeeks=wholeNumber(input.numWeeks,1,18,'Number of weeks');
  if(startWeek+numWeeks-1>18)throw new ApiError(400,'The schedule runs past NFL week 18');
  const budget=wholeNumber(input.budget??55000,MIN_BUDGET,MAX_BUDGET,'Budget'),provider=input.provider??'mock';
  if(!PROVIDER_NAMES.includes(provider))throw new ApiError(400,'Unknown data source');
  const names=(Array.isArray(input.teams)?input.teams:[]).map(s=>String(s).trim()).filter(Boolean);
  if(names.length<2||names.length>20)throw new ApiError(400,'A league needs 2 to 20 teams');
  if(names.some(n=>n.length>40))throw new ApiError(400,'Team names are 40 characters max');
  if(new Set(names.map(n=>n.toLowerCase())).size!==names.length)throw new ApiError(400,'Team names must be unique');
  const teams=names.map((n,i)=>({id:`t${i+1}`,name:n,code:randomString(8),isCommish:i===0,notifications:{email:true,sms:false}}));
  const groupCount=wholeNumber(input.groupCount??(teams.length>=8?2:1),1,Math.min(4,teams.length),'Groups');
  const groups=Array.from({length:groupCount},(_,i)=>({id:`g${i+1}`,name:`Group ${String.fromCharCode(65+i)}`,teamIds:[]}));
  teams.forEach((team,i)=>groups[i%groupCount].teamIds.push(team.id));
  const weeks=Array.from({length:numWeeks},(_,idx)=>({week:idx+1,nflWeek:startWeek+idx,status:'pending',lockAt:null,matchups:groups.map(g=>({id:`w${idx+1}${g.id}`,groupId:g.id,teamIds:[...g.teamIds],pool:null,lineups:{},result:null}))}));
  return{id:makeLeagueId(),name,season,startWeek,numWeeks,budget,provider,groups,createdAt:new Date().toISOString(),teams,weeks};
}
export function getWeek(league, weekNo) {
  const w = league.weeks.find((x) => x.week === Number(weekNo)); if (!w) throw new ApiError(404, 'No such week'); return w;
}
export function refreshStatuses(league, now = Date.now()) {
  let changed = false;
  for (const w of league.weeks) if (w.status === 'open' && w.lockAt && Date.parse(w.lockAt) <= now) { lockWeek(league, w); changed = true; }
  return changed;
}
export function checkStandoff(m) {
  if (m.b === null || m.standoff) return;
  const la = m.lineups[m.a], lb = m.lineups[m.b];
  if (!la || !lb || lineupIds(la).length !== TOTAL_SLOTS || lineupIds(lb).length !== TOTAL_SLOTS) return;
  if (lineupKey(la) !== lineupKey(lb)) return;
  m.standoff = { shared: lineupKey(la), triggeredAt: new Date().toISOString(), outcome: null };
}
export function backupLineup(pool) {
  const sorted = [...pool].sort((x, y) => x.salary - y.salary || x.proj - y.proj || x.id.localeCompare(y.id));
  const lineup = emptyLineup(), used = new Set();
  const take = (slot, eligible) => { for (const p of sorted) { if (lineup[slot].length >= SLOTS[slot]) break; if (used.has(p.id) || !eligible(p)) continue; lineup[slot].push(p.id); used.add(p.id); } };
  take('QB', (p) => p.pos === 'QB'); take('RB', (p) => p.pos === 'RB'); take('WR', (p) => p.pos === 'WR'); take('FLEX', (p) => FLEX_POS.includes(p.pos)); return lineup;
}
function scheduleAdjustment(league, fromWeek, teamId, points, reason) {
  if (!points) return null;
  for (const w of league.weeks) {
    if (w.week <= fromWeek || w.status === 'final') continue;
    const plays = w.matchups.some((m) => (m.a === teamId || m.b === teamId) && m.b !== null);
    if (!plays) continue;
    w.adjustments ||= {}; (w.adjustments[teamId] ||= []).push({ points, reason, fromWeek }); return w.week;
  }
  return null;
}
function resolveStandoff(league, w, m) {
  const rules = standoffRules(league), sd = m.standoff;
  const ka = lineupKey(m.lineups[m.a]), kb = lineupKey(m.lineups[m.b]);
  const outcome = { type: 'both-fold', folder: null, holder: null, adjustments: [] };
  const adjust = (teamId, points, reason) => outcome.adjustments.push({ teamId, points, appliesToWeek: scheduleAdjustment(league, w.week, teamId, points, reason) });
  if (ka === kb && lineupIds(m.lineups[m.a]).length === TOTAL_SLOTS) {
    outcome.type = 'mutual'; outcome.originalLineups = { [m.a]: m.lineups[m.a], [m.b]: m.lineups[m.b] };
    m.lineups[m.a] = backupLineup(m.pool); m.lineups[m.b] = backupLineup(m.pool);
    const reason = `Standoff in week ${w.week}: both held`; adjust(m.a, -rules.mutualPenalty, reason); adjust(m.b, -rules.mutualPenalty, reason);
  } else {
    const aFolded = ka !== sd.shared, bFolded = kb !== sd.shared;
    if (aFolded !== bFolded) { outcome.type = 'fold'; outcome.folder = aFolded ? m.a : m.b; outcome.holder = aFolded ? m.b : m.a; adjust(outcome.folder, -rules.foldPenalty, `Standoff in week ${w.week}: you folded`); adjust(outcome.holder, rules.holdBonus, `Standoff in week ${w.week}: your opponent folded`); }
  }
  sd.outcome = outcome;
}
export function lockWeek(league, w) { w.status = 'locked'; for (const m of w.matchups) if (m.standoff && !m.standoff.outcome) resolveStandoff(league, w, m); }
function buildPool(players, rng) {
  const pool = [];
  const unavailable = new Set(["out","ir","doubtful","inactive","injured_reserve"]);
  for (const pos of Object.keys(POOL_SIZES)) {
    const candidates = players
      .filter((p) => p.pos === pos && !unavailable.has(String(p.injuryStatus||"").toLowerCase()))
      .sort((a, b) => b.proj - a.proj)
      .slice(0, POOL_CANDIDATES[pos]);
    if (candidates.length < POOL_SIZES[pos]) throw new ApiError(502, `Not enough ${pos}s available from the data source to build a pool`);
    // Draw from projection tiers instead of randomly sampling the entire candidate list.
    // This keeps group pools comparable in quality while still making them meaningfully different.
    const n = POOL_SIZES[pos], tierCount = Math.ceil(candidates.length / 3);
    const tiers = [
      candidates.slice(0, tierCount),
      candidates.slice(tierCount, tierCount * 2),
      candidates.slice(tierCount * 2)
    ].filter(Boolean);
    const quotas = tiers.length === 3
      ? [Math.ceil(n * 0.4), Math.floor(n * 0.35), n - Math.ceil(n * 0.4) - Math.floor(n * 0.35)]
      : tiers.length === 2
        ? [Math.ceil(n * 0.55), n - Math.ceil(n * 0.55)]
        : [n];
    tiers.forEach((tier, i) => {
      const take = Math.min(quotas[i] || 0, tier.length);
      for (const p of shuffle(tier, rng).slice(0, take)) {
        pool.push({
          id: p.id, name: p.name, pos: p.pos, team: p.team, proj: p.proj,
          salary: salaryFromProjection(p.proj, p.pos, {
            roleScore: p.roleScore, matchupBoost: p.matchupBoost, consistencyBoost: p.consistencyBoost
          }),
          injuryStatus: p.injuryStatus || "healthy"
        });
      }
    });
    // If a small tier could not fill its quota, top up from the remaining candidates.
    if (pool.filter(p => p.pos === pos).length < n) {
      const chosen = new Set(pool.filter(p => p.pos === pos).map(p => p.id));
      for (const p of shuffle(candidates.filter(p => !chosen.has(p.id)), rng)) {
        pool.push({
          id: p.id, name: p.name, pos: p.pos, team: p.team, proj: p.proj,
          salary: salaryFromProjection(p.proj, p.pos, {
            roleScore: p.roleScore, matchupBoost: p.matchupBoost, consistencyBoost: p.consistencyBoost
          }),
          injuryStatus: p.injuryStatus || "healthy"
        });
        if (pool.filter(x => x.pos === pos).length >= n) break;
      }
    }
  }
  const order = Object.keys(POOL_SIZES);
  return pool.sort((a, b) => order.indexOf(a.pos) - order.indexOf(b.pos) || b.salary - a.salary);
}
function cheapestCompleteLineup(pool) {
  const sorted = [...pool].sort((a, b) => a.salary - b.salary || a.proj - b.proj);
  const lineup = emptyLineup(), used = new Set();
  const take = (slot, count, eligible) => {
    for (const p of sorted) {
      if (lineup[slot].length >= count) break;
      if (used.has(p.id) || !eligible(p)) continue;
      lineup[slot].push(p.id); used.add(p.id);
    }
  };
  take("QB", 1, p => p.pos === "QB");
  take("FLEX", 7, p => FLEX_POS.includes(p.pos));
  const ids = SLOT_NAMES.flatMap(s => lineup[s]);
  return ids.length === TOTAL_SLOTS
    ? ids.reduce((sum, id) => sum + (pool.find(p => p.id === id)?.salary || 0), 0)
    : Infinity;
}
export function getGroups(league) {
  return league.groups?.length ? league.groups : [{id:'g1',name:'Group A',teamIds:league.teams.map(t=>t.id)}];
}
export function groupStandings(league, groupId) {
  const ids=new Set(getGroups(league).find(g=>g.id===groupId)?.teamIds||[]);
  return standings(league).filter(r=>ids.has(r.teamId));
}
export function openWeek(league, weekNo, lockAt = null) {
  const w = getWeek(league, weekNo); if (w.status !== 'pending') throw new ApiError(409, 'That week is already open');
  w.poolReadyAt = null;
  w.lockAt = lockAt || null;
  w.status = "open";
}

export function generatePools(league,weekNo,players){
 const w=getWeek(league,weekNo);if(w.status!=='open')throw new ApiError(409,'Open the week before generating player pools');
 for(const group of getGroups(league)){const seed=league.id+'-'+league.season+'-'+w.week+'-'+group.id,pool=buildPool(players,seededRng(seed));if(cheapestCompleteLineup(pool)>league.budget)throw new ApiError(502,'The generated player pool cannot produce a complete lineup under the '+league.budget.toLocaleString()+' salary cap');const m=w.matchups.find(x=>x.groupId===group.id);if(m)m.pool=pool.map(p=>({...p}));}
 w.poolReadyAt=new Date().toISOString();
}
export function validateLineup(raw, pool, budget) {
  const errors = [], byId = new Map(pool.map((p) => [p.id, p])), lineup = emptyLineup(), seen = new Set(), input = raw && typeof raw === 'object' ? raw : {};
  let salary = 0;
  for (const slot of SLOT_NAMES) {
    const ids = input[slot] ?? [];
    if (!Array.isArray(ids)) { errors.push(`${slot} must be a list`); continue; }
    if (ids.length > SLOTS[slot]) errors.push(`Too many players in ${slot} (max ${SLOTS[slot]})`);
    for (const id of ids.slice(0, SLOTS[slot])) {
      const p = byId.get(id); if (!p) { errors.push('A player in your lineup is not in this matchup’s pool'); continue; }
      if (seen.has(id)) { errors.push(`${p.name} is in your lineup twice`); continue; }
      const eligible = slot === 'FLEX' ? FLEX_POS.includes(p.pos) : p.pos === slot;
      if (!eligible) { errors.push(`${p.name} (${p.pos}) can’t play ${slot}`); continue; }
      seen.add(id); lineup[slot].push(id); salary += p.salary;
    }
  }
  const rawMultipliers = input.multipliers && typeof input.multipliers === "object" ? input.multipliers : {};
  const ace = rawMultipliers.ace || null, impact = rawMultipliers.impact || rawMultipliers.champion || null;
  const ids = new Set(lineupIds(lineup));
  if (ace && !ids.has(ace)) errors.push("ACE must be one of your lineup players");
  if (impact && !ids.has(impact)) errors.push("IMPACT must be one of your lineup players");
  if (ace && impact && ace === impact) errors.push("ACE and IMPACT must be different players");
  if (complete && !ace) errors.push("Choose an ACE for your lineup");
  if (complete && !impact) errors.push("Choose a IMPACT for your lineup");
  lineup.multipliers = { ace, impact };
  if (salary > budget) errors.push(`Over budget by ${(salary - budget).toLocaleString("en-US")}`);
  return { ok: errors.length === 0, errors, lineup, salary, complete: seen.size === TOTAL_SLOTS };
}
export function poolIds(week){const ids=new Set();for(const m of week.matchups)for(const p of m.pool||[])ids.add(p.id);return[...ids];}
export function scoreWeek(league,weekNo,actuals){
 const w=getWeek(league,weekNo);if(w.status!=='locked'&&w.status!=='final')throw new ApiError(409,'Lock the week before scoring it');
 for(const m of w.matchups){
  const points={},playerPoints={};
  for(const teamId of m.teamIds||[]){const lineup=m.lineups[teamId]||emptyLineup(),ids=SLOT_NAMES.flatMap(s=>lineup[s]||[]),ace=lineup.multipliers?.ace,impact=lineup.multipliers?.impact;points[teamId]=round2(ids.reduce((sum,id)=>sum+(actuals[id]||0)*(id===ace?2:id===impact?1.5:1),0));}
  for(const p of m.pool||[])playerPoints[p.id]=actuals[p.id]||0;
  const rankings=(m.teamIds||[]).map(id=>({teamId:id,score:points[id]||0})).sort((a,b)=>b.score-a.score||a.teamId.localeCompare(b.teamId));
  const placementPoints={};rankings.forEach((r,i)=>placementPoints[r.teamId]=rankings.length-i);
  m.result={points,playerPoints,placementPoints,rankings};
 }
 w.status='final';
}
export function standings(league){
 const rows=new Map(league.teams.map(t=>[t.id,{teamId:t.id,name:t.name,standingsPoints:0,pf:0}]));
 for(const w of league.weeks)if(w.status==='final')for(const m of w.matchups)for(const teamId of m.teamIds||[]){const r=rows.get(teamId);if(!r)continue;r.pf+=Number(m.result?.points?.[teamId]||0);r.standingsPoints+=Number(m.result?.placementPoints?.[teamId]||0);}
 return[...rows.values()].map(r=>({...r,pf:round2(r.pf),pts:r.standingsPoints})).sort((a,b)=>b.standingsPoints-a.standingsPoints||b.pf-a.pf);
}
