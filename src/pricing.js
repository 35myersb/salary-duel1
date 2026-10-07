export const MIN_SALARY = 3000;
export const MAX_SALARY = 8500;

// Capped uses an 8-player lineup with a $55,000 cap, so pricing needs to
// create a real spread between stars, mid-tier plays, and value plays.
// The previous model reached $8,500 too quickly, making very different
// projections cost the same.
const POSITION_BASE = { QB: 4200, RB: 3900, WR: 3800, TE: 3600 };
const POSITION_SCALE = { QB: 145, RB: 175, WR: 175, TE: 200 };

export function salaryFromProjection(points, pos = "WR", context = {}) {
  const p = Math.max(0, Number(points) || 0);
  const position = String(pos || "WR").toUpperCase();
  const base = POSITION_BASE[position] ?? 3800;
  const scale = POSITION_SCALE[position] ?? 175;

  // Projection remains the primary driver. Contextual adjustments are kept
  // deliberately modest because some providers do not supply these fields.
  const role = Math.max(0, Math.min(1, Number(context.roleScore ?? 0)));
  const matchup = Math.max(-0.06, Math.min(0.06, Number(context.matchupBoost ?? 0)));
  const consistency = Math.max(-0.04, Math.min(0.04, Number(context.consistencyBoost ?? 0)));

  const contextualMultiplier = 1 + role * 0.04 + matchup + consistency;
  const raw = (base + p * scale) * contextualMultiplier;
  const rounded = Math.round(raw / 100) * 100;

  return Math.min(MAX_SALARY, Math.max(MIN_SALARY, rounded));
}
