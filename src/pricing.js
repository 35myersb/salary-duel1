export const MIN_SALARY = 2200;
export const MAX_SALARY = 8500;
const POSITION_BASE = { QB: 3600, RB: 3300, WR: 3200, TE: 3000 };
const POSITION_SCALE = { QB: 290, RB: 315, WR: 300, TE: 300 };

export function salaryFromProjection(points, pos="WR", context={}) {
  const p=Math.max(0,Number(points)||0), position=String(pos||"WR").toUpperCase();
  const base=POSITION_BASE[position]??3200, scale=POSITION_SCALE[position]??300;
  const role=Math.max(0,Math.min(1,Number(context.roleScore??0)));
  const matchup=Math.max(-0.12,Math.min(0.12,Number(context.matchupBoost??0)));
  const consistency=Math.max(-0.08,Math.min(0.08,Number(context.consistencyBoost??0)));
  const raw=(base+p*scale)*(1+role*0.06+matchup+consistency);
  const rounded=Math.round(raw/100)*100;
  return Math.min(MAX_SALARY,Math.max(MIN_SALARY,rounded));
}
