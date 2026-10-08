export const MIN_SALARY = 3000;
export const MAX_SALARY = 10000;

// Salary is a mathematical function of projected Half-PPR fantasy points.
// The curve is calibrated to the $55,000 / 8-player format: roughly
// 15 projected points -> $6,800, 22 -> $9,200, 25 -> $10,000.
// Premium projections become increasingly expensive, while value players
// remain usable. Salaries are always rounded to the nearest $100.
const CURVE = { a: -7.619047619, b: 624.761904762, c: -857.142857143 };

export function salaryFromProjection(points) {
  const p = Math.max(0, Number(points) || 0);
  const raw = CURVE.a * p * p + CURVE.b * p + CURVE.c;
  const rounded = Math.round(raw / 100) * 100;
  return Math.min(MAX_SALARY, Math.max(MIN_SALARY, rounded));
}
