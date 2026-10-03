import test from "node:test";
import assert from "node:assert/strict";
import {createLeague,openWeek,validateLineup,SLOTS} from "../src/league.js";

function players(){
 const out=[];
 for(let i=0;i<8;i++)out.push({id:"qb"+i,name:"QB "+i,pos:"QB",team:"T"+i,proj:10+i});
 for(let i=0;i<14;i++)out.push({id:"rb"+i,name:"RB "+i,pos:"RB",team:"T"+i,proj:8+i/2});
 for(let i=0;i<18;i++)out.push({id:"wr"+i,name:"WR "+i,pos:"WR",team:"T"+i,proj:8+i/2});
 for(let i=0;i<10;i++)out.push({id:"te"+i,name:"TE "+i,pos:"TE",team:"T"+i,proj:7+i/2});
 return out;
}
test("creates an 8-player lineup structure",()=>{
 const l=createLeague({name:"Test",season:2026,startWeek:4,numWeeks:2,budget:50000,provider:"mock",teams:["A","B"]});
 assert.equal(l.teams.length,2); assert.equal(l.weeks.length,2); assert.deepEqual(SLOTS,{QB:1,RB:2,WR:3,FLEX:2});
 openWeek(l,1,players());
 const pool=l.weeks[0].matchups[0].pool;
 assert.equal(pool.length,50);
 const qb=pool.filter(p=>p.pos==="QB").slice(0,1).map(p=>p.id);
 const rb=pool.filter(p=>p.pos==="RB").slice(0,2).map(p=>p.id);
 const wr=pool.filter(p=>p.pos==="WR").slice(0,3).map(p=>p.id);
 const flex=pool.filter(p=>p.pos==="TE").slice(0,2).map(p=>p.id);
 const v=validateLineup({QB:qb,RB:rb,WR:wr,FLEX:flex},pool,50000);
 assert.equal(v.ok,true); assert.equal(v.complete,true);
});
