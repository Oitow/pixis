// M1: a hand-built test creature (~20 primitives) used to tune the renderer's look.
import { ellipsoid, roundCone, Pattern, type Prim, type PrimGroup } from '../sdf/prim';
import { quatFromBasis, type V3 } from '../core/math';

export function testCreature(time: number): PrimGroup {
  const A: V3 = [0.85, 0.45, 0.25], B: V3 = [0.35, 0.2, 0.45];
  const q = quatFromBasis([1, 0, 0], [0, 1, 0]);
  const k = 0.12;
  const breathe = 1 + 0.03 * Math.sin(time * 2);
  const prims: Prim[] = [
    ellipsoid([0, 0.8, 0], [0.55 * breathe, 0.38 * breathe, 0.4 * breathe], q, k, A, B, Pattern.Stripes, 4),
    ellipsoid([0.65, 1.0, 0], [0.32, 0.27, 0.28], q, k, A, B, Pattern.Stripes, 4),
    ellipsoid([0.85, 0.9, 0], [0.22, 0.08, 0.2], q, 0.05, B, A, Pattern.Plain, 1),
    roundCone([-0.4, 0.8, 0], [-0.9, 0.6, 0], 0.25, 0.12, k, A, B, Pattern.Stripes, 4),
    roundCone([-0.9, 0.6, 0], [-1.3, 0.35 + 0.05 * Math.sin(time * 3), 0.1], 0.12, 0.04, k, A, B, Pattern.Stripes, 4),
  ];
  for (const s of [1, -1]) {
    const eq = quatFromBasis([0.8, 0.1, s * 0.6].map((v) => v / Math.hypot(0.8, 0.1, 0.6)) as V3, [0, 1, 0]);
    prims.push(ellipsoid([0.82, 1.12, s * 0.17], [0.09, 0.09, 0.09], eq, 0.01, [0.2, 0.7, 0.3], [0, 0, 0], Pattern.Eye, 1));
    for (const x of [0.35, -0.3]) {
      const hip: V3 = [x, 0.65, s * 0.3];
      const knee: V3 = [x + 0.08, 0.45, s * 0.5];
      const foot: V3 = [x, 0.05, s * 0.48];
      prims.push(roundCone(hip, knee, 0.1, 0.08, 0.08, A, B, Pattern.None, 1));
      prims.push(roundCone(knee, foot, 0.08, 0.09, 0.04, B, A, Pattern.Plain, 1));
    }
    prims.push(roundCone([0.6, 1.2, s * 0.12], [0.45, 1.55, s * 0.3], 0.06, 0.01, 0.04, [0.92, 0.88, 0.76], A, Pattern.Plain, 1));
  }
  return { prims, origin: [0, 0, 0], yaw: 0, highlight: 0 };
}
