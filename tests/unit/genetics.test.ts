import { describe, expect, it } from 'vitest';
import { crossover, GENE_NAMES, GENE_SPECS, mutate, randomGenome, validateGenome, creatureName } from '../../src/genetics/genome';
import { Rng } from '../../src/core/rng';

const inRange = (g: ReturnType<typeof randomGenome>) => {
  for (const n of GENE_NAMES) {
    const s = GENE_SPECS[n] as { min: number; max: number; int?: boolean; zeroChance?: number };
    const v = g.genes[n];
    if (s.zeroChance && v === 0) continue;
    expect(v, n).toBeGreaterThanOrEqual(s.min);
    expect(v, n).toBeLessThanOrEqual(s.max);
    if (s.int) expect(Number.isInteger(v), n).toBe(true);
  }
};

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(5), b = new Rng(5);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
});

describe('genome', () => {
  it('same seed → same genome', () => {
    expect(randomGenome(42)).toEqual(randomGenome(42));
    expect(randomGenome(42)).not.toEqual(randomGenome(43));
  });
  it('random genomes are valid and can move', () => {
    for (let s = 0; s < 300; s++) {
      const g = randomGenome(s);
      inRange(g);
      expect(g.genes.legPairs > 0 || g.genes.tailLength > 0).toBe(true);
    }
  });
  it('mutation and crossover stay valid and deterministic', () => {
    for (let s = 0; s < 100; s++) {
      const a = randomGenome(s), b = randomGenome(s + 1000);
      const m = mutate(a, 7);
      inRange(m);
      expect(mutate(a, 7)).toEqual(m);
      const c = crossover(a, b, 3);
      inRange(c);
      for (const n of GENE_NAMES) {
        const lo = Math.min(a.genes[n], b.genes[n]), hi = Math.max(a.genes[n], b.genes[n]);
        expect(c.genes[n]).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(c.genes[n]).toBeLessThanOrEqual(hi + 1e-9);
      }
    }
  });
  it('validate repairs broken input', () => {
    const g = validateGenome({ version: 0, seed: 1, genes: { legPairs: 99, bodyLength: NaN } as never });
    inRange(g);
    expect(g.genes.legPairs).toBe(4);
  });
  it('names are stable', () => {
    expect(creatureName(randomGenome(1))).toBe(creatureName(randomGenome(1)));
  });
});
