export const MIN_SALARY = 3000;
export const MAX_SALARY = 10000;

// Capped has 8 roster spots and a $55,000 cap. A $450-per-projected-point
// baseline means an average 15-point player costs about $6,750, leaving the
// cap tight enough to force meaningful choices without making value plays
// unusable. Salaries are always rounded to the nearest $100.
export const SALARY_PER_POINT = 450;

export function salaryFromProjection(points) {
  const p = Math.max(0, Number(points) || 0);
  const raw = p * SALARY_PER_POINT;
  const rounded = Math.round(raw / 100) * 100;
  return Math.min(MAX_SALARY, Math.max(MIN_SALARY, rounded));
}
