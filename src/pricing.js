export const MIN_SALARY = 3000;
export const MAX_SALARY = 10000;

// Salary follows projected Half-PPR fantasy production instead of the old
// quadratic, which inflated mid/high projections too aggressively. Anchors
// are tuned for CAPPED's $55,000 budget and eight roster spots.
const SALARY_CURVE = [
  [0, 3000],
  [4, 3000],
  [6, 3400],
  [8, 4000],
  [10, 4600],
  [12, 5200],
  [15, 6000],
  [18, 6800],
  [21, 7600],
  [24, 8400],
  [27, 9200],
  [30, 9700],
  [33, 10000]
];

export function salaryFromProjection(points) {
  const p = Math.max(0, Number(points) || 0);
  let raw = SALARY_CURVE[SALARY_CURVE.length - 1][1];

  if (p <= SALARY_CURVE[0][0]) {
    raw = SALARY_CURVE[0][1];
  } else {
    for (let i = 1; i < SALARY_CURVE.length; i++) {
      const [rightPoints, rightSalary] = SALARY_CURVE[i];
      const [leftPoints, leftSalary] = SALARY_CURVE[i - 1];
      if (p <= rightPoints) {
        const ratio = (p - leftPoints) / (rightPoints - leftPoints);
        raw = leftSalary + ratio * (rightSalary - leftSalary);
        break;
      }
    }
  }

  return Math.min(MAX_SALARY, Math.max(MIN_SALARY, Math.round(raw / 100) * 100));
}
