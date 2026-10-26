// CPU-side SDF primitive description and its GPU layout.
// GPU layout MUST match `struct Prim` in render/shaders/scene.wgsl (8 × vec4f = 128 bytes).
import { QUAT_ID, type Quat, type V3 } from '../core/math';

export const enum PrimType {
  Ellipsoid = 0,
  RoundCone = 1,
}

export const enum Pattern {
  None = 0,
  Stripes = 1,
  Spots = 2,
  Scales = 3,
  Belly = 4,
  Eye = 5,
  Plain = 6, // never patterned (colorA only)
}

export interface Prim {
  type: PrimType;
  a: V3; // ellipsoid centre / cone start
  b: V3; // cone end
  r: V3; // ellipsoid radii / (r1, r2, -)
  k: number; // smooth-union radius with what came before
  q: Quat; // local→world rotation (ellipsoid orientation, pattern frame)
  colA: V3;
  colB: V3;
  pattern: Pattern;
  pscale: number;
  emissive: V3;
}

export const PRIM_FLOATS = 32;

export function ellipsoid(a: V3, r: V3, q: Quat, k: number, colA: V3, colB: V3, pattern: Pattern, pscale: number): Prim {
  return { type: PrimType.Ellipsoid, a, b: a, r, k, q, colA, colB, pattern, pscale, emissive: [0, 0, 0] };
}

export function roundCone(a: V3, b: V3, r1: number, r2: number, k: number, colA: V3, colB: V3, pattern: Pattern, pscale: number): Prim {
  return { type: PrimType.RoundCone, a, b, r: [r1, r2, 0], k, q: QUAT_ID, colA, colB, pattern, pscale, emissive: [0, 0, 0] };
}

export function packPrim(p: Prim, out: Float32Array, offset: number) {
  const o = offset;
  out[o + 0] = p.a[0]; out[o + 1] = p.a[1]; out[o + 2] = p.a[2]; out[o + 3] = p.type;
  out[o + 4] = p.b[0]; out[o + 5] = p.b[1]; out[o + 6] = p.b[2]; out[o + 7] = p.k;
  out[o + 8] = p.r[0]; out[o + 9] = p.r[1]; out[o + 10] = p.r[2]; out[o + 11] = p.pattern;
  out[o + 12] = p.q[0]; out[o + 13] = p.q[1]; out[o + 14] = p.q[2]; out[o + 15] = p.q[3];
  out[o + 16] = p.colA[0]; out[o + 17] = p.colA[1]; out[o + 18] = p.colA[2]; out[o + 19] = p.pscale;
  out[o + 20] = p.colB[0]; out[o + 21] = p.colB[1]; out[o + 22] = p.colB[2]; out[o + 23] = 0;
  out[o + 24] = p.emissive[0]; out[o + 25] = p.emissive[1]; out[o + 26] = p.emissive[2]; out[o + 27] = 0;
  out[o + 28] = 0; out[o + 29] = 0; out[o + 30] = 0; out[o + 31] = 0;
}

/** Conservative bounding sphere of a primitive. */
export function primBounds(p: Prim): { c: V3; r: number } {
  if (p.type === PrimType.Ellipsoid) return { c: p.a, r: Math.max(p.r[0], p.r[1], p.r[2]) };
  const c: V3 = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2];
  const h = Math.hypot(p.a[0] - p.b[0], p.a[1] - p.b[1], p.a[2] - p.b[2]) / 2;
  return { c, r: h + Math.max(p.r[0], p.r[1]) };
}

/** A group = one creature: primitives are smooth-blended inside a group, hard-unioned between groups. */
export interface PrimGroup {
  prims: Prim[];
  origin: V3; // pattern frame origin
  yaw: number; // pattern frame heading
  highlight: number;
}

export function groupBounds(prims: Prim[]): { c: V3; r: number } {
  if (!prims.length) return { c: [0, -1000, 0], r: 0 };
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    const b = primBounds(p);
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], b.c[i] - b.r);
      hi[i] = Math.max(hi[i], b.c[i] + b.r);
    }
  }
  const c: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  let r = 0;
  let maxK = 0;
  for (const p of prims) {
    const b = primBounds(p);
    r = Math.max(r, Math.hypot(b.c[0] - c[0], b.c[1] - c[1], b.c[2] - c[2]) + b.r);
    maxK = Math.max(maxK, p.k);
  }
  return { c, r: r + maxK * 0.25 + 0.01 };
}
