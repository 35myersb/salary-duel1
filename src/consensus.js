import {cached} from "./cache.js";

const SOURCES = [
  {name:"FantasyPros", url:(pos,season,week)=>`https://www.fantasypros.com/nfl/projections/${pos.toLowerCase()}.php?week=${week}&scoring=HALF`},
  {name:"4for4", url:(pos,season,week)=>`https://www.4for4.com/fantasy-football-projections/half-ppr-6pt-patd/${pos.toLowerCase()}/${season}/week${week}`}
];

const POS=["QB","RB","WR","TE"];

function decode(s){
  return String(s||"")
    .replace(/&amp;/g,"&").replace(/&#39;|&apos;/g,"'")
    .replace(/&quot;/g,'"').replace(/&nbsp;/g," ")
    .replace(/&#x27;/gi,"'");
}
function text(s){
  return decode(String(s||"").replace(/<script[\s\S]*?<\/script>/gi,"")
    .replace(/<style[\s\S]*?<\/style>/gi,"")
    .replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());
}
function norm(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function parseCells(row){
  return [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>text(m[1]));
}
function numberAt(s){
  const m=String(s||"").replace(/,/g,"").match(/-?\d+(?:\.\d+)?/);
  return m?Number(m[0]):null;
}
function parseTables(html){
  const out=[];
  const rows=[...String(html||"").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>parseCells(m[1])).filter(r=>r.length>=3);
  for(let i=0;i<rows.length;i++){
    const h=rows[i].map(x=>x.toLowerCase());
    const playerIdx=h.findIndex(x=>x.includes("player"));
    const projIdx=h.findIndex(x=>/fpts|ff pts|fan points|proj(?:ected)?(?: pts| points)?$/.test(x.replace(/[^a-z ]/g,"").trim()));
    if(playerIdx<0||projIdx<0)continue;
    const tdIdx=h.findIndex(x=>x==="patd"||x.includes("passing td"));
    for(let j=i+1;j<rows.length;j++){
      const r=rows[j]; if(r.length<=Math.max(playerIdx,projIdx)) break;
      const playerCell=r[playerIdx], rawProj=numberAt(r[projIdx]);
      if(!playerCell||!Number.isFinite(rawProj)||rawProj<0||rawProj>60)continue;
      const raw=playerCell.replace(/\s+/g," ").trim();
      const tm=(r.find(x=>/^[A-Z]{2,3}$/.test(x.trim()))||"").trim();
      let name=raw.replace(/\s+\(([A-Z]{2,3})\)\s*$/,"").trim();
      name=name.replace(/\s+([A-Z]{2,3})\s*$/,"").trim();
      const rb=raw.match(/^(.+?)\s+(?:QB|RB|WR|TE)\s*[·-]\s*([A-Z]{2,3})$/);
      if(rb)name=rb[1].trim();
      // 4for4's page is explicitly 6-point passing-TD scoring. Capped uses 4 points,
      // so convert QB projections before averaging.
      const passTd=tdIdx>=0?numberAt(r[tdIdx]):null;
      const proj=passTd!=null&&h.some(x=>x.includes("patd")||x.includes("passing td")) ? rawProj-(2*passTd) : rawProj;
      if(name&&name.toLowerCase()!=="player"&&Number.isFinite(proj)&&proj>=0)out.push({name,team:tm,proj});
    }
  }
  return out;
}
async function fetchSource(source,pos,season,week){
  try{
    const r=await fetch(source.url(pos,season,week),{signal:AbortSignal.timeout(12000),headers:{"user-agent":"Capped/1.0"}});
    if(!r.ok)return [];
    return parseTables(await r.text());
  }catch{return [];}
}
export async function getConsensusProjections(season,week){
  const result=new Map();
  const all=await Promise.all(POS.map(async pos=>{
    const sets=await Promise.all(SOURCES.map(s=>cached(`proj-${s.name}-${season}-${week}-${pos}`,3600000,()=>fetchSource(s,pos,season,week))));
    return {pos,sets};
  }));
  for(const {pos,sets} of all){
    const byKey=new Map();
    sets.forEach((rows,si)=>{
      for(const row of rows){
        const key=norm(row.name)+"|"+norm(row.team);
        if(!byKey.has(key))byKey.set(key,[]);
        byKey.get(key).push({source:SOURCES[si].name,proj:row.proj});
      }
    });
    for(const [key,vals] of byKey){
      if(vals.length<2)continue;
      const avg=vals.reduce((a,v)=>a+v.proj,0)/vals.length;
      result.set(pos+"|"+key.split("|")[0],{projection:Number(avg.toFixed(1)),sources:vals.map(v=>v.source)});
    }
  }
  return result;
}
export function consensusForPlayer(map,p){
  return map.get(String(p.pos).toUpperCase()+"|"+norm(p.name))?.projection??null;
}
