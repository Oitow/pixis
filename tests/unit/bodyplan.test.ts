import { describe, expect, it } from 'vitest';
import { buildBodyPlan, estimatePrimCount, PRIM_BUDGET } from '../../src/bodyplan/bodyplan';
import { randomGenome } from '../../src/genetics/genome';
import { Creature } from '../../src/creature/creature';
import { setFlatWorld } from '../../src/core/terrain';

describe('body plan', () => {
  it('respects the primitive budget and is symmetric', () => {
    for (let s = 0; s < 300; s++) {
      const p = buildBodyPlan(randomGenome(s));
      expect(estimatePrimCount(p)).toBeLessThanOrEqual(PRIM_BUDGET);
      expect(p.legs.filter((l) => l.side === 1).length).toBe(p.legs.filter((l) => l.side === -1).length);
      expect(p.chain[0].kind).toBe('head');
      for (const n of p.chain) expect(n.radius).toBeGreaterThan(0);
    }
  });
  it('built primitives match the estimate and are finite', () => {
    setFlatWorld(true);
    for (let s = 0; s < 100; s++) {
      const c = new Creature(randomGenome(s));
      for (let i = 0; i < 30; i++) c.update(1 / 60, { move: [1, 0, 0], jump: false, bite: false, glow: false });
      const prims = c.buildPrims();
      expect(prims.length).toBe(estimatePrimCount(c.plan));
      for (const p of prims) for (const v of [...p.a, ...p.b, ...p.r, ...p.q]) expect(Number.isFinite(v)).toBe(true);
    }
    setFlatWorld(false);
  });
});
