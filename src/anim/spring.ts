import { add, scale, sub, type V3 } from '../core/math';

/** Critically-damped-ish spring that follows a moving target (secondary motion). */
export class Spring3 {
  pos: V3;
  vel: V3 = [0, 0, 0];
  constructor(start: V3, public stiffness = 120, public damping = 12) {
    this.pos = [...start];
  }
  step(target: V3, dt: number) {
    const f = sub(scale(sub(target, this.pos), this.stiffness), scale(this.vel, this.damping));
    this.vel = add(this.vel, scale(f, dt));
    this.pos = add(this.pos, scale(this.vel, dt));
    return this.pos;
  }
}
