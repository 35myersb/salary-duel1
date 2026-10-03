// Salary = how good the player is expected to be this week, DFS style.
// The cap and pricing are intentionally compressed so a legal 8-player lineup
// is always practical at the default $50,000 budget.
export const MIN_SALARY = 2200;
export const MAX_SALARY = 8500;
export const PER_POINT = 300;

export function salaryFromProjection(points) {
  const raw = MIN_SALARY + Math.max(0, Number(points) || 0) * PER_POINT;
  const rounded = Math.round(raw / 100) * 100;
  return Math.min(MAX_SALARY, Math.max(MIN_SALARY, rounded));
}
