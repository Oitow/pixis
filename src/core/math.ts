// Small allocation-friendly vector/quaternion helpers. Y is up, creatures face +X locally.
export type V3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const madd = (a: V3, b: V3, s: number): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: V3, b: V3) => len(sub(a, b));
export const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : [1, 0, 0];
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const UP: V3 = [0, 1, 0];

/** Forward vector on the XZ plane for a yaw angle (yaw 0 = +X). */
export const yawDir = (yaw: number): V3 => [Math.cos(yaw), 0, -Math.sin(yaw)];

/** Rotate v around a unit axis by angle (Rodrigues). */
export function rotateAxis(v: V3, axis: V3, angle: number): V3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  const d = dot(axis, v);
  const cr = cross(axis, v);
  return [
    v[0] * c + cr[0] * s + axis[0] * d * (1 - c),
    v[1] * c + cr[1] * s + axis[1] * d * (1 - c),
    v[2] * c + cr[2] * s + axis[2] * d * (1 - c),
  ];
}

/** Orthonormal frame from a forward direction and an up hint. */
export function frame(fwd: V3, upHint: V3 = UP): { f: V3; u: V3; r: V3 } {
  const f = norm(fwd);
  let r = cross(f, upHint);
  if (len(r) < 1e-4) r = cross(f, [1, 0, 0]);
  r = norm(r);
  const u = cross(r, f);
  return { f, u, r };
}

/** Quaternion whose rotation maps local X→f, Y→u, Z→cross(f,u). */
export function quatFromBasis(f: V3, u: V3): Quat {
  const r = cross(f, u);
  const m00 = f[0], m10 = f[1], m20 = f[2];
  const m01 = u[0], m11 = u[1], m21 = u[2];
  const m02 = r[0], m12 = r[1], m22 = r[2];
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
  }
  return [x, y, z, w];
}

/** Rotate v by unit quaternion q. */
export function quatRotate(q: Quat, v: V3): V3 {
  const qv: V3 = [q[0], q[1], q[2]];
  const t = scale(cross(qv, v), 2);
  return add(add(v, scale(t, q[3])), cross(qv, t));
}

export const QUAT_ID: Quat = [0, 0, 0, 1];

export function hsl(h: number, s: number, l: number): V3 {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
