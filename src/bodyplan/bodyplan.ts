// Genome → BodyPlan: concrete, metric description of a creature in its rest pose.
// The chain runs head → body → tail; nodes are spaced along the creature's spine.
import type { Genome } from '../genetics/genome';
import { hsl, type V3 } from '../core/math';

export interface ChainNode {
  radius: number;
  /** Distance to the previous node in the chain (0 for the head). */
  spacing: number;
  kind: 'head' | 'body' | 'tail';
}

export interface LegPlan {
  node: number; // chain index the hip is attached to
  side: 1 | -1;
  upper: number;
  lower: number;
  thickness: number;
  spread: number;
  phase: number; // gait phase offset 0..1
}

export interface BodyPlan {
  chain: ChainNode[];
  bodyStart: number;
  bodyEnd: number; // exclusive
  head: {
    radius: number;
    length: number;
    jaw: number;
    hornPairs: number;
    hornLength: number;
    eyes: { side: number; up: number; fwd: number; radius: number }[];
    antennaLength: number;
  };
  legs: LegPlan[];
  /** Height of the body's centre line above the ground while standing. */
  rideHeight: number;
  wings: { node: number; span: number; chord: number } | null;
  fins: { node: number; size: number } | null;
  tailFin: number;
  spikes: { node: number; size: number }[];
  glow: { node: number; side: number; radius: number }[];
  glowColor: V3;
  colorA: V3;
  colorB: V3;
  pattern: number;
  patternScale: number;
  softness: number;
  /** Rough volume used as mass by the ability system. */
  mass: number;
}

export const PRIM_BUDGET = 64;

export function buildBodyPlan(genome: Genome): BodyPlan {
  const g = genome.genes;
  const thick = g.bodyThickness;
  const segs = g.bodySegments;
  const segLen = g.bodyLength / segs;

  const headR = thick * g.headSize;
  const chain: ChainNode[] = [{ radius: headR, spacing: 0, kind: 'head' }];
  const bodyStart = 1;
  for (let i = 0; i < segs; i++) {
    const t = segs > 1 ? i / (segs - 1) : 0;
    // Bulge in the middle, taper towards the back.
    const bulge = 1 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.3));
    const r = thick * bulge * (1 - g.bodyTaper * t);
    chain.push({ radius: r, spacing: i === 0 ? headR * 0.9 + r * 0.5 : segLen, kind: 'body' });
  }
  const bodyEnd = chain.length;
  if (g.tailLength > 0) {
    const tailSegs = Math.max(2, Math.round(g.tailLength / 0.3));
    const last = chain[bodyEnd - 1].radius;
    for (let i = 0; i < tailSegs; i++) {
      const t = (i + 1) / tailSegs;
      chain.push({ radius: Math.max(0.025, last * (1 - 0.85 * t)), spacing: g.tailLength / tailSegs, kind: 'tail' });
    }
  }

  const legs: LegPlan[] = [];
  const bodyCount = bodyEnd - bodyStart;
  for (let p = 0; p < g.legPairs; p++) {
    const t = g.legPairs > 1 ? p / (g.legPairs - 1) : 0.3;
    const node = bodyStart + Math.round(t * (bodyCount - 1));
    for (const side of [1, -1] as const) {
      legs.push({
        node,
        side,
        upper: g.legLength * 0.55,
        lower: g.legLength * 0.6,
        thickness: g.legThickness,
        spread: g.legSpread,
        // Alternate sides and neighbouring pairs → diagonal gait.
        phase: ((p % 2) * 0.5 + (side > 0 ? 0 : 0.5)) % 1,
      });
    }
  }
  const rideHeight = g.legPairs > 0 ? g.legLength * 0.78 : thick * 0.85;

  const eyes: BodyPlan['head']['eyes'] = [];
  const er = headR * g.eyeSize;
  if (g.eyeMode === 0) eyes.push({ side: 0, up: 0.45, fwd: 0.75, radius: er * 1.4 });
  else {
    eyes.push({ side: 0.55, up: 0.4, fwd: 0.65, radius: er }, { side: -0.55, up: 0.4, fwd: 0.65, radius: er });
    if (g.eyeMode === 2)
      eyes.push({ side: 0.6, up: 0.15, fwd: 0.8, radius: er * 0.7 }, { side: -0.6, up: 0.15, fwd: 0.8, radius: er * 0.7 });
  }

  const spikes: BodyPlan['spikes'] = [];
  const glow: BodyPlan['glow'] = [];
  const nonHeadNodes = chain.length - 1;
  for (let i = 0; i < g.spikeCount; i++) {
    const node = 1 + Math.round((i / Math.max(1, g.spikeCount - 1)) * (nonHeadNodes - 1) * 0.8);
    spikes.push({ node, size: g.spikeSize * (1 - 0.4 * (i / Math.max(1, g.spikeCount))) });
  }
  for (let i = 0; i < g.glowOrgans; i++) {
    const node = bodyStart + (Math.floor(i / 2) % bodyCount);
    glow.push({ node, side: i % 2 === 0 ? 1 : -1, radius: thick * 0.22 });
  }

  const colorA = hsl(g.hueA, g.saturation, g.lightness);
  const colorB = hsl(g.hueB, g.saturation * 0.9, g.lightness * 0.75);
  const mass = chain.reduce((m, n) => m + n.radius * n.radius * Math.max(n.spacing, n.radius), 0) * 4;

  const plan: BodyPlan = {
    chain,
    bodyStart,
    bodyEnd,
    head: {
      radius: headR,
      length: g.headLength,
      jaw: g.jaw,
      hornPairs: g.hornPairs,
      hornLength: g.hornLength,
      eyes,
      antennaLength: g.antennaLength,
    },
    legs,
    rideHeight,
    wings: g.wingSize > 0 ? { node: bodyStart, span: g.wingSize, chord: g.wingSize * 0.45 } : null,
    fins: g.finSize > 0 ? { node: Math.min(bodyStart + 1, bodyEnd - 1), size: g.finSize } : null,
    tailFin: g.tailLength > 0 ? g.tailFin : 0,
    spikes,
    glow,
    glowColor: hsl(g.glowHue, 0.9, 0.6),
    colorA,
    colorB,
    pattern: g.pattern,
    patternScale: g.patternScale,
    softness: g.softness,
    mass,
  };
  // Keep within the primitive budget by trimming decorations.
  while (estimatePrimCount(plan) > PRIM_BUDGET && (plan.spikes.length || plan.glow.length)) {
    if (plan.spikes.length) plan.spikes.pop();
    else plan.glow.pop();
  }
  return plan;
}

export function estimatePrimCount(p: BodyPlan): number {
  return (
    1 + // head
    (p.head.jaw > 0 ? 1 : 0) +
    p.head.eyes.length +
    p.head.hornPairs * 2 +
    (p.head.antennaLength > 0 ? 2 : 0) +
    (p.chain.length - 1) + // spine segments
    p.legs.length * 2 +
    (p.wings ? 2 : 0) +
    (p.fins ? 2 : 0) +
    (p.tailFin > 0 ? 1 : 0) +
    p.spikes.length +
    p.glow.length
  );
}
