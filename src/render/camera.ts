import { add, cross, norm, scale, sub, type V3 } from '../core/math';

/** Orbit camera around a target point. */
export class OrbitCamera {
  target: V3 = [0, 0.5, 0];
  yaw = 0.8;
  pitch = 0.35;
  distance = 5;
  fovY = 50 * (Math.PI / 180);

  get position(): V3 {
    const cp = Math.cos(this.pitch);
    return add(this.target, [Math.cos(this.yaw) * cp * this.distance, Math.sin(this.pitch) * this.distance, Math.sin(this.yaw) * cp * this.distance]);
  }

  basis() {
    const pos = this.position;
    const fwd = norm(sub(this.target, pos));
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    return { pos, fwd, right, up };
  }

  /** Converts a screen-space stick (x right, y forward) to a world XZ direction. */
  stickToWorld(x: number, y: number): V3 {
    const { fwd, right } = this.basis();
    const f = norm([fwd[0], 0, fwd[2]]);
    const r = norm([right[0], 0, right[2]]);
    return add(scale(f, y), scale(r, x));
  }
}

/** Project a world point to CSS pixel coordinates (null if behind the camera). */
export function projectToScreen(cam: OrbitCamera, p: V3, w: number, h: number): [number, number] | null {
  const { pos, fwd, right, up } = cam.basis();
  const v = sub(p, pos);
  const z = v[0] * fwd[0] + v[1] * fwd[1] + v[2] * fwd[2];
  if (z < 0.1) return null;
  const t = Math.tan(cam.fovY / 2);
  const sx = (v[0] * right[0] + v[1] * right[1] + v[2] * right[2]) / (z * t * (w / h));
  const sy = (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / (z * t);
  return [(sx * 0.5 + 0.5) * w, (0.5 - sy * 0.5) * h];
}
