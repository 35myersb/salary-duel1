const cache=new Map();
export async function cached(key,ttlMs,fn){
  const hit=cache.get(key);
  if(hit&&Date.now()-hit.at<ttlMs)return hit.value;
  const value=await fn(); cache.set(key,{at:Date.now(),value}); return value;
}