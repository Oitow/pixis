import { add, cross, dot, len, madd, norm, scale, sub, type V3 } from '../core/math';

/**
 * Analytic two-bone IK. Returns the knee position and the (possibly clamped) foot.
 * `pole` is the direction the knee should bend towards.
 */
export function solveTwoBone(hip: V3, target: V3, l1: number, l2: number, pole: V3): { knee: V3; foot: V3 } {
  const toT = sub(target, hip);
  const d0 = len(toT);
  const dir = d0 > 1e-6 ? scale(toT, 1 / d0) : ([0, -1, 0] as V3);
  const d = Math.min(Math.max(d0, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  let p = sub(pole, scale(dir, dot(pole, dir)));
  if (len(p) < 1e-5) p = cross(dir, [0, 0, 1]);
  p = norm(p);
  const knee = add(madd(hip, dir, a), scale(p, h));
  const foot = madd(hip, dir, d);
  return { knee, foot };
}
