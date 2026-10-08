export const MIN_SALARY = 3000;
export const MAX_SALARY = 10000;

// Capped has 8 roster spots and a $55,000 budget. Salary is determined only
// from projected fantasy points. The curve is calibrated so a typical
// 15-point player costs about $6,900, putting an average 8-player lineup
// right around the cap. It is intentionally non-linear so premium projections
// cost meaningfully more and users cannot simply stack the highest scorers.
// Salaries are always rounded to the nearest $100.
const CURVE = { a: -5.1020408163, b: 545.918367347, c: -40.816326531 };

export function salaryFromProjection(points) {
  const p = Math.max(0, Number(points) || 0);
  const raw = CURVE.a * p * p + CURVE.b * p + CURVE.c;
  const rounded = Math.round(raw / 100) * 100;
  return Math.min(MAX_SALARY, Math.max(MIN_SALARY, rounded));
}
