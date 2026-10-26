// A living creature instance: physics state, procedural animation, and per-frame SDF primitives.
import { buildBodyPlan, type BodyPlan } from '../bodyplan/bodyplan';
import { deriveAbilities, type Abilities } from '../abilities/abilities';
import { creatureName, type Genome } from '../genetics/genome';
import {
  add, clamp, dist, frame, lerp, lerpV, madd, norm, quatFromBasis, rotateAxis, scale, sub, yawDir, len,
  type V3,
} from '../core/math';
import { Rng, hash32 } from '../core/rng';
import { isWater, terrainHeight, WATER_LEVEL } from '../core/terrain';
import { solveTwoBone } from '../anim/ik';
import { Spring3 } from '../anim/spring';
import { ellipsoid, roundCone, Pattern, type Prim } from '../sdf/prim';

export type Mode = 'ground' | 'air' | 'water';

export interface CreatureInput {
  /** Desired horizontal movement in world space, magnitude 0..1. */
  move: V3;
  /** Held: jump / flap / glide. */
  jump: boolean;
  bite: boolean;
  glow: boolean;
}

export const NO_INPUT: CreatureInput = { move: [0, 0, 0], jump: false, bite: false, glow: false };

interface LegState {
  foot: V3;
  from: V3;
  swinging: boolean;
  hip: V3;
  knee: V3;
}

const GRAVITY = 9.8;
const BONE: V3 = [0.92, 0.88, 0.76];

export class Creature {
  readonly plan: BodyPlan;
  readonly abilities: Abilities;
  readonly name: string;
  pos: V3;
  vel: V3 = [0, 0, 0];
  yaw: number;
  mode: Mode = 'ground';
  nodes: V3[] = [];
  legs: LegState[] = [];
  hp: number;
  time = 0;
  gaitPhase = 0;
  flapPhase = 0;
  swimPhase = 0;
  biteT = 0;
  biteCooldown = 0;
  blinkT = 0;
  nextBlink: number;
  glowOn = false;
  hurtT = 0;
  private prevJump = false;
  private prevGlow = false;
  private antennae: Spring3[] = [];
  private rng: Rng;

  constructor(readonly genome: Genome, pos: V3 = [0, 0, 0], yaw = 0) {
    this.plan = buildBodyPlan(genome);
    this.abilities = deriveAbilities(this.plan);
    this.name = creatureName(genome);
    this.rng = new Rng(hash32(`creature:${genome.seed}`));
    this.nextBlink = this.rng.range(1, 4);
    this.hp = this.abilities.maxHp;
    this.yaw = yaw;
    this.pos = [pos[0], terrainHeight(pos[0], pos[2]) + this.plan.rideHeight, pos[2]];
    this.mode = isWater(pos[0], pos[2]) ? 'water' : 'ground';
    this.resetPose();
  }

  get alive() {
    return this.hp > 0;
  }
  get speed() {
    return Math.hypot(this.vel[0], this.vel[2]);
  }
  get forward(): V3 {
    return yawDir(this.yaw);
  }
  get headPos(): V3 {
    return this.nodes[0];
  }

  resetPose() {
    const back = scale(yawDir(this.yaw), -1);
    this.nodes = [];
    let p: V3 = madd(this.pos, back, -this.plan.chain[1].spacing);
    for (let i = 0; i < this.plan.chain.length; i++) {
      if (i > 0) p = madd(p, back, this.plan.chain[i].spacing);
      this.nodes.push([...p]);
    }
    this.nodes[1] = [...this.pos];
    this.settleNodes(1);
    this.legs = this.plan.legs.map((l) => {
      const hip = this.hipPos(l.node, l.side);
      const foot = this.restFoot(l.node, l.side, l.spread * (l.upper + l.lower));
      return { foot, from: foot, swinging: false, hip, knee: hip };
    });
    this.antennae = this.plan.head.antennaLength > 0 ? [new Spring3(this.nodes[0]), new Spring3(this.nodes[0])] : [];
  }

  private nodeFrame(i: number) {
    const a = this.nodes[Math.max(0, i - 1)], b = this.nodes[Math.min(this.nodes.length - 1, i === 0 ? 1 : i)];
    const f = i === 0 ? yawDir(this.yaw) : sub(a, b);
    return frame(len(f) > 1e-5 ? f : yawDir(this.yaw));
  }

  private hipPos(node: number, side: number): V3 {
    const { u, r } = this.nodeFrame(node);
    const R = this.plan.chain[node].radius;
    return add(add(this.nodes[node], scale(r, side * R * 0.7)), scale(u, -R * 0.25));
  }

  private restFoot(node: number, side: number, reach: number): V3 {
    const { r } = this.nodeFrame(node);
    const p = madd(this.hipPos(node, side), [r[0], 0, r[2]], side * reach * 0.75);
    p[1] = terrainHeight(p[0], p[2]);
    return p;
  }

  private heightProfile(i: number, ground: number): number {
    const c = this.plan.chain;
    if (!this.alive) return ground + c[i].radius * 0.8;
    if (c[i].kind === 'tail') {
      const nTail = c.length - this.plan.bodyEnd;
      const t = (i - this.plan.bodyEnd + 1) / nTail;
      const bodyY = ground + this.plan.rideHeight;
      return lerp(bodyY, ground + c[i].radius + 0.02, Math.min(1, t * 0.9));
    }
    const nb = this.plan.bodyEnd - this.plan.bodyStart;
    const t = c[i].kind === 'head' ? 0 : (i - this.plan.bodyStart) / Math.max(1, nb - 1);
    const arch = this.genome.genes.bodyArch * Math.sin(Math.PI * t) * 0.6;
    const headLift = c[i].kind === 'head' ? c[i].radius * 0.5 : 0;
    return ground + this.plan.rideHeight + arch + headLift;
  }

  /** Make nodes follow the leader and conform to ground/water. */
  private settleNodes(start: number, dt = 1) {
    const c = this.plan.chain;
    for (let i = start + 1; i < c.length; i++) {
      const d = sub(this.nodes[i], this.nodes[i - 1]);
      const l = len(d);
      const dir: V3 = l > 1e-5 ? scale(d, 1 / l) : scale(yawDir(this.yaw), -1);
      this.nodes[i] = madd(this.nodes[i - 1], dir, c[i].spacing);
    }
    const k = 1 - Math.exp(-dt * 14);
    for (let i = 0; i < c.length; i++) {
      const n = this.nodes[i];
      const g = terrainHeight(n[0], n[2]);
      if (this.mode === 'ground') {
        if (i !== 1) n[1] = lerp(n[1], this.heightProfile(i, g), dt >= 1 ? 1 : k);
      } else if (this.mode === 'water') {
        if (i !== 1) n[1] = lerp(n[1], Math.max(g + c[i].radius, WATER_LEVEL - c[i].radius * 0.3), k);
      }
      n[1] = Math.max(n[1], g + c[i].radius * 0.6);
    }
  }

  /** Advance simulation by dt. Returns true when a bite lands this frame. */
  update(dt: number, input: CreatureInput): { bit: boolean } {
    const ab = this.abilities;
    this.time += dt;
    let bit = false;
    const alive = this.alive;
    const move: V3 = alive ? input.move : [0, 0, 0];
    const mag = Math.min(1, Math.hypot(move[0], move[2]));
    const jumpPressed = alive && input.jump && !this.prevJump;
    this.prevJump = input.jump;

    // --- steering
    if (mag > 0.1) {
      const targetYaw = Math.atan2(-move[2], move[0]);
      let dy = targetYaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const turn = (ab.slither ? 3.5 : 5) * dt;
      this.yaw += clamp(dy, -turn, turn);
    }
    const fwd = yawDir(this.yaw);
    // Move mostly where we face (creatures can't strafe freely).
    const facing = Math.max(0, fwd[0] * move[0] + fwd[2] * move[2]) * 0.8 + mag * 0.2;

    // --- locomotion per mode
    const ground = terrainHeight(this.pos[0], this.pos[2]);
    const inWater = isWater(this.pos[0], this.pos[2]);
    let topSpeed = ab.walkSpeed, accel = 8;
    if (this.mode === 'water') topSpeed = ab.swimSpeed, accel = 3;
    if (this.mode === 'air') topSpeed = ab.flight === 'fly' ? ab.walkSpeed * 1.2 + 2 : ab.walkSpeed * 0.9, accel = ab.flight === 'none' ? 1.5 : 4;
    const want = scale(fwd, facing * topSpeed);
    const ka = 1 - Math.exp(-accel * dt);
    this.vel[0] = lerp(this.vel[0], want[0], ka);
    this.vel[2] = lerp(this.vel[2], want[2], ka);

    if (this.mode === 'ground' || this.mode === 'water') {
      if (jumpPressed) {
        this.vel[1] = this.mode === 'water' ? ab.jump * 0.6 + (ab.flight === 'fly' ? 2 : 0) : ab.jump;
        this.mode = 'air';
      } else {
        this.vel[1] = 0;
        const targetY = this.mode === 'water'
          ? Math.max(ground + this.plan.chain[1].radius, WATER_LEVEL - this.plan.chain[1].radius * 0.3 + Math.sin(this.time * 2) * 0.03)
          : this.heightProfile(1, ground);
        this.pos[1] = lerp(this.pos[1], targetY, 1 - Math.exp(-dt * 12));
      }
    }
    if (this.mode === 'air') {
      this.vel[1] -= GRAVITY * dt;
      if (input.jump && ab.flight === 'fly') this.vel[1] = Math.min(this.vel[1] + (GRAVITY + 8) * dt, 4);
      if (input.jump && ab.flight === 'glide' && this.vel[1] < -1.2) this.vel[1] = -1.2;
      this.pos[1] += this.vel[1] * dt;
      const floor = inWater ? WATER_LEVEL : ground + this.plan.rideHeight;
      if (this.vel[1] <= 0 && this.pos[1] <= floor) {
        this.pos[1] = Math.max(this.pos[1], inWater ? this.pos[1] : floor);
        this.mode = inWater ? 'water' : 'ground';
        this.vel[1] = 0;
      }
      this.pos[1] = Math.min(this.pos[1], 14);
    } else {
      this.mode = inWater ? 'water' : 'ground';
    }
    this.pos[0] += this.vel[0] * dt;
    this.pos[2] += this.vel[2] * dt;
    this.pos[1] = Math.max(this.pos[1], terrainHeight(this.pos[0], this.pos[2]) + this.plan.chain[1].radius * 0.6);

    // --- spine
    this.nodes[1] = [...this.pos];
    this.settleNodes(1, dt);
    const headDir = rotateAxis(fwd, frame(fwd).r, this.biteT > 0 ? -0.35 * Math.sin((Math.PI * this.biteT) / 0.35) : 0);
    this.nodes[0] = madd(this.nodes[1], headDir, this.plan.chain[1].spacing);
    if (this.mode === 'ground') this.nodes[0][1] = lerp(this.nodes[0][1], this.heightProfile(0, terrainHeight(this.nodes[0][0], this.nodes[0][2])), 0.5);

    // --- legs
    this.updateLegs(dt);

    // --- timers & actions
    this.gaitPhase %= 1000;
    const speed = this.speed;
    this.swimPhase += dt * (this.mode === 'water' || this.plan.legs.length === 0 ? 3 + speed * 3 : 2);
    if (this.mode === 'air' && this.abilities.flight === 'fly' && input.jump) this.flapPhase += dt * 16;
    else this.flapPhase += dt * (this.mode === 'air' ? 3 : 1.2);
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = 0.14;
      this.nextBlink = this.rng.range(2, 5);
    }
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.biteCooldown = Math.max(0, this.biteCooldown - dt);
    if (this.biteT > 0) {
      const before = this.biteT;
      this.biteT = Math.max(0, this.biteT - dt);
      if (before > 0.15 && this.biteT <= 0.15) bit = true; // jaws snap shut mid-animation
    }
    if (alive && input.bite && ab.bite > 0 && this.biteCooldown <= 0) {
      this.biteT = 0.35;
      this.biteCooldown = 0.6;
    }
    if (alive && input.glow && !this.prevGlow && ab.glow) this.glowOn = !this.glowOn;
    this.prevGlow = input.glow;
    this.hurtT = Math.max(0, this.hurtT - dt);

    const head = this.nodes[0];
    const { f, u, r } = frame(headDir);
    const hr = this.plan.chain[0].radius;
    this.antennae.forEach((s, i) => {
      const side = i === 0 ? 1 : -1;
      const dir = norm(add(add(scale(u, 1), scale(f, 0.6)), scale(r, side * 0.5)));
      s.step(madd(madd(head, u, hr * 0.8), dir, this.plan.head.antennaLength), dt);
    });
    return { bit };
  }

  private updateLegs(dt: number) {
    const speed = this.speed;
    const grounded = this.mode === 'ground' && this.alive;
    let maxErr = 0;
    const targets: V3[] = [];
    this.plan.legs.forEach((l, i) => {
      const leg = this.legs[i];
      leg.hip = this.hipPos(l.node, l.side);
      const legLen = l.upper + l.lower;
      const t = this.restFoot(l.node, l.side, l.spread * legLen);
      const lead = madd(t, [this.vel[0], 0, this.vel[2]], 0.18);
      lead[1] = terrainHeight(lead[0], lead[2]);
      targets.push(lead);
      maxErr = Math.max(maxErr, dist(leg.foot, lead) / legLen);
    });
    const stepLen = this.plan.legs.length ? (this.plan.legs[0].upper + this.plan.legs[0].lower) * 0.8 : 1;
    let freq = clamp(speed / stepLen, 0, 4);
    const anySwing = this.legs.some((l) => l.swinging);
    if (freq < 0.4 && (maxErr > 0.25 || anySwing)) freq = 1.6;
    this.gaitPhase += freq * dt;
    const duty = 0.4;

    this.plan.legs.forEach((l, i) => {
      const leg = this.legs[i];
      const legLen = l.upper + l.lower;
      const { f, u, r } = this.nodeFrame(l.node);
      if (!grounded) {
        const paddle = this.mode === 'water' ? Math.sin(this.swimPhase * 2 + l.phase * 6) * 0.3 : 0;
        const tuck = this.alive ? 0.55 : 0.2;
        leg.foot = add(add(madd(leg.hip, u, -legLen * tuck), scale(f, -legLen * (0.25 + paddle))), scale(r, l.side * legLen * 0.3));
        leg.from = leg.foot;
        leg.swinging = false;
      } else {
        const ph = (((this.gaitPhase + l.phase) % 1) + 1) % 1;
        const swing = freq > 0 && ph < duty;
        if (swing && !leg.swinging) leg.from = [...leg.foot];
        if (swing) {
          const s = ph / duty;
          const e = s * s * (3 - 2 * s);
          leg.foot = lerpV(leg.from, targets[i], e);
          leg.foot[1] += Math.sin(Math.PI * s) * legLen * 0.25;
        } else if (leg.swinging) {
          leg.foot = targets[i];
        }
        leg.swinging = swing;
        const gy = terrainHeight(leg.foot[0], leg.foot[2]);
        leg.foot[1] = Math.max(leg.foot[1], gy + l.thickness * 0.6);
      }
      const pole = norm(add(add(scale(r, l.side * 0.5), u), scale(f, 0.2)));
      const ik = solveTwoBone(leg.hip, leg.foot, l.upper, l.lower, pole);
      leg.knee = ik.knee;
      if (!grounded) leg.foot = ik.foot;
      // Feet that are over-stretched slide (no pinning past reach).
      if (dist(ik.foot, leg.foot) > 1e-3) leg.foot = ik.foot;
    });
  }

  takeDamage(amount: number) {
    if (!this.alive) return 0;
    const dmg = Math.max(1, Math.round(amount * (1 - this.abilities.defense)));
    this.hp = Math.max(0, this.hp - dmg);
    this.hurtT = 0.3;
    return dmg;
  }

  /** Build this frame's SDF primitives. */
  buildPrims(): Prim[] {
    const P = this.plan;
    const prims: Prim[] = [];
    const k = P.softness;
    const A = P.colorA, B = P.colorB;
    const pat = P.pattern as Pattern, ps = P.patternScale;
    const n = this.nodes.length;
    const time = this.time;

    // Displayed spine with lateral undulation (swimming / slithering / idle tail sway).
    const waveAmp = this.mode === 'water' ? 0.22 : P.legs.length === 0 ? 0.16 * Math.min(1, this.speed) + 0.03 : 0.05;
    const disp: V3[] = this.nodes.map((p, i) => {
      if (i < 2) return p;
      const t = (i - 1) / Math.max(1, n - 2);
      const { r } = this.nodeFrame(i);
      const w = Math.sin(this.swimPhase * 2.2 - i * 0.9) * waveAmp * t * (0.3 + t);
      return madd(p, r, w);
    });
    const breathe = 1 + 0.035 * Math.sin(time * 2.2);
    const radius = (i: number) => P.chain[i].radius * (P.chain[i].kind === 'body' ? breathe : 1);

    // Head
    const head = disp[0];
    const hf = norm(sub(head, disp[1]));
    const { f, u, r } = frame(hf);
    const hr = P.chain[0].radius;
    const hx = hr * P.head.length * 0.75, hy = hr * 0.85, hz = hr * 0.9;
    prims.push(ellipsoid(head, [hx, hy, hz], quatFromBasis(f, u), k, A, B, pat, ps));

    // Neck + spine + tail as a chain of round cones
    const neckStart = madd(head, f, -hx * 0.4);
    prims.push(roundCone(neckStart, disp[1], hr * 0.65, radius(1), k * 1.4, A, B, pat, ps));
    for (let i = 1; i < n - 1; i++) prims.push(roundCone(disp[i], disp[i + 1], radius(i), radius(i + 1), k, A, B, pat, ps));

    // Jaw
    if (P.head.jaw > 0) {
      const open = this.biteT > 0 ? Math.sin((Math.PI * (0.35 - this.biteT)) / 0.35) * 0.75 : 0.06 + 0.04 * Math.sin(time * 1.3);
      const pivot = add(madd(head, f, -hx * 0.25), scale(u, -hy * 0.35));
      const jf = rotateAxis(f, r, -open), ju = rotateAxis(u, r, -open);
      const jc = madd(pivot, jf, hx * 0.72);
      prims.push(ellipsoid(jc, [hx * 0.7, hy * (0.22 + P.head.jaw * 0.2), hz * 0.72], quatFromBasis(jf, ju), k * 0.5, B, A, Pattern.Plain, ps));
    }

    // Eyes
    const iris = add(scale(P.glowColor, 0.6), scale(B, 0.4));
    const blink = this.blinkT > 0 || !this.alive ? 0.12 : 1;
    for (const e of P.head.eyes) {
      const lx = e.fwd * hx, ly = e.up * hy, lz = e.side * hz;
      const s = Math.hypot(lx / hx, ly / hy, lz / hz) || 1;
      const surf = add(add(madd(head, f, (lx / s) * 0.9), scale(u, (ly / s) * 0.9)), scale(r, (lz / s) * 0.9));
      const look = norm(add(add(f, scale(r, e.side * 0.6)), scale(u, 0.15)));
      const lf = frame(look, u);
      prims.push(ellipsoid(surf, [e.radius, e.radius * blink, e.radius], quatFromBasis(lf.f, lf.u), 0.015, iris, [0, 0, 0], Pattern.Eye, 1));
    }

    // Horns
    for (let h = 0; h < P.head.hornPairs; h++) {
      for (const side of [1, -1]) {
        const base = add(add(madd(head, u, hy * 0.7), scale(r, side * hz * 0.45)), scale(f, -hx * (0.1 + 0.35 * h)));
        const dir = norm(add(add(u, scale(f, -0.5 - h * 0.3)), scale(r, side * 0.55)));
        const L = P.head.hornLength * hr * 3 * (1 - h * 0.25);
        prims.push(roundCone(base, madd(base, dir, L), hr * 0.16, 0.012, 0.04, BONE, BONE, Pattern.Plain, 1));
      }
    }

    // Antennae (spring tips)
    this.antennae.forEach((s, i) => {
      const side = i === 0 ? 1 : -1;
      const base = add(madd(head, u, hy * 0.75), scale(r, side * hz * 0.25));
      prims.push(roundCone(base, s.pos, 0.02, 0.035, 0.03, B, B, Pattern.Plain, 1));
    });

    // Legs
    this.plan.legs.forEach((l, i) => {
      const leg = this.legs[i];
      prims.push(roundCone(leg.hip, leg.knee, l.thickness, l.thickness * 0.75, k * 0.8, A, B, pat, ps));
      prims.push(roundCone(leg.knee, leg.foot, l.thickness * 0.75, l.thickness * 0.95, k * 0.4, B, A, Pattern.Plain, ps));
    });

    // Wings
    if (P.wings) {
      const w = P.wings;
      const fr = this.nodeFrame(w.node);
      const R = P.chain[w.node].radius;
      const shoulder = madd(disp[w.node], fr.u, R * 0.6);
      let a: number;
      if (this.mode === 'air') a = this.abilities.flight === 'fly' ? 0.15 + 0.75 * Math.sin(this.flapPhase) : 0.12 + 0.05 * Math.sin(this.flapPhase);
      else a = 0.7 + 0.08 * Math.sin(time * 1.5);
      for (const side of [1, -1]) {
        const out = add(scale(fr.r, side * Math.cos(a)), scale(fr.u, Math.sin(a)));
        const wu = add(scale(fr.u, Math.cos(a)), scale(fr.r, -side * Math.sin(a)));
        const c = add(madd(shoulder, out, w.span * 0.5), scale(fr.f, -w.chord * 0.25));
        prims.push(ellipsoid(c, [w.chord * 0.5, 0.025, w.span * 0.5], quatFromBasis(fr.f, wu), 0.06, B, A, Pattern.Stripes, 9));
      }
    }

    // Side fins
    if (P.fins) {
      const fr = this.nodeFrame(P.fins.node);
      const R = P.chain[P.fins.node].radius;
      const s = P.fins.size;
      for (const side of [1, -1]) {
        const a = -0.35 + Math.sin(this.swimPhase * 3 + (side > 0 ? 0 : 1.5)) * (this.mode === 'water' ? 0.4 : 0.1);
        const out = add(scale(fr.r, side * Math.cos(a)), scale(fr.u, Math.sin(a)));
        const wu = add(scale(fr.u, Math.cos(a)), scale(fr.r, -side * Math.sin(a)));
        const c = add(madd(disp[P.fins.node], out, R + s * 0.3), scale(fr.f, -s * 0.15));
        prims.push(ellipsoid(c, [s * 0.4, 0.02, s * 0.45], quatFromBasis(fr.f, wu), 0.06, B, A, Pattern.Stripes, 12));
      }
    }

    // Tail fin
    if (P.tailFin > 0 && n > 2) {
      const dir = norm(sub(disp[n - 1], disp[n - 2]));
      const s = P.tailFin * 0.6;
      const tf = frame(dir);
      prims.push(ellipsoid(madd(disp[n - 1], dir, s * 0.35), [s * 0.45, s * 0.5, 0.025], quatFromBasis(tf.f, tf.u), 0.05, B, A, Pattern.Stripes, 10));
    }

    // Back spikes
    for (const sp of P.spikes) {
      const fr = this.nodeFrame(sp.node);
      const R = radius(sp.node);
      const base = madd(disp[sp.node], fr.u, R * 0.75);
      const tip = madd(base, norm(add(fr.u, scale(fr.f, -0.6))), sp.size * 2.2);
      prims.push(roundCone(base, tip, sp.size * 0.45, 0.01, 0.05, BONE, B, Pattern.Belly, 1));
    }

    // Glow organs
    const pulse = 0.8 + 0.2 * Math.sin(time * 3.2);
    for (const gl of P.glow) {
      const fr = this.nodeFrame(gl.node);
      const R = radius(gl.node);
      const c = add(madd(disp[gl.node], fr.r, gl.side * R * 0.8), scale(fr.u, R * 0.15));
      const pr = ellipsoid(c, [gl.radius, gl.radius, gl.radius], quatFromBasis(fr.f, fr.u), 0.03, P.glowColor, P.glowColor, Pattern.Plain, 1);
      pr.emissive = scale(P.glowColor, this.glowOn ? 2.4 * pulse : 0.35);
      prims.push(pr);
    }
    return prims;
  }
}
