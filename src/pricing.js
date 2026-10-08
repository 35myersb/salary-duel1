export const MIN_SALARY = 3000;
export const MAX_SALARY = 10000;

// Capped has 8 roster spots and a $55,000 cap. The price-per-point ratio is
// derived from the league budget and a target average of 17.25 projected
// points per roster spot. At the default $55,000 cap this is about $400/pt.
// This keeps the model transparent: consensus projection is the main input.
export const TARGET_PROJ_PER_SLOT = 17.25;

export function salaryFromProjection(points, pos = "WR", context = {}) {
  const p = Math.max(0, Number(points) || 0);
  const budget = Math.max(1, Number(context.budget ?? 55000));
  const totalSlots = Math.max(1, Number(context.totalSlots ?? 8));
  const dollarsPerPoint = (budget / totalSlots) / TARGET_PROJ_PER_SLOT;

  // No positional multipliers: a player's projected fantasy production is
  // what drives salary. Round every salary to the nearest $100.
  const rounded = Math.round((p * dollarsPerPoint) / 100) * 100;
  return Math.min(MAX_SALARY, Math.max(MIN_SALARY, rounded));
}
