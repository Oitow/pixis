// Genome v1: a flat record of numeric genes described by GENE_SPECS.
// Flat genes keep mutation, crossover, validation and serialisation generic.
import { Rng, hash32 } from '../core/rng';
import { clamp } from '../core/math';

export interface GeneSpec {
  min: number;
  max: number;
  int?: boolean;
  /** Probability that a random genome has this gene "off" (= 0). */
  zeroChance?: number;
}

export const GENE_SPECS = {
  bodySegments: { min: 2, max: 6, int: true },
  bodyLength: { min: 0.8, max: 2.2 },
  bodyThickness: { min: 0.22, max: 0.48 },
  bodyTaper: { min: 0, max: 0.5 },
  bodyArch: { min: -0.15, max: 0.25 },
  headSize: { min: 0.75, max: 1.4 },
  headLength: { min: 0.9, max: 1.7 },
  jaw: { min: 0.2, max: 1, zeroChance: 0.25 },
  hornPairs: { min: 0, max: 2, int: true, zeroChance: 0.5 },
  hornLength: { min: 0.1, max: 0.45 },
  eyeMode: { min: 0, max: 2, int: true }, // 0 cyclops, 1 pair, 2 two pairs
  eyeSize: { min: 0.18, max: 0.38 },
  antennaLength: { min: 0.2, max: 0.8, zeroChance: 0.55 },
  legPairs: { min: 1, max: 4, int: true, zeroChance: 0.12 },
  legLength: { min: 0.35, max: 1.0 },
  legThickness: { min: 0.05, max: 0.11 },
  legSpread: { min: 0.2, max: 0.8 },
  tailLength: { min: 0.3, max: 1.6, zeroChance: 0.15 },
  tailFin: { min: 0.2, max: 1, zeroChance: 0.55 },
  wingSize: { min: 0.5, max: 1.6, zeroChance: 0.65 },
  finSize: { min: 0.2, max: 0.8, zeroChance: 0.6 },
  spikeCount: { min: 1, max: 8, int: true, zeroChance: 0.5 },
  spikeSize: { min: 0.05, max: 0.22 },
  glowOrgans: { min: 1, max: 4, int: true, zeroChance: 0.6 },
  glowHue: { min: 0, max: 1 },
  hueA: { min: 0, max: 1 },
  hueB: { min: 0, max: 1 },
  saturation: { min: 0.25, max: 0.85 },
  lightness: { min: 0.35, max: 0.65 },
  pattern: { min: 0, max: 4, int: true }, // 0 none, 1 stripes, 2 spots, 3 scales, 4 belly gradient
  patternScale: { min: 2, max: 8 },
  softness: { min: 0.06, max: 0.18 },
} satisfies Record<string, GeneSpec>;

export type GeneName = keyof typeof GENE_SPECS;
export type Genes = Record<GeneName, number>;
export const GENE_NAMES = Object.keys(GENE_SPECS) as GeneName[];
export const GENOME_VERSION = 1;

export interface Genome {
  version: number;
  seed: number;
  genes: Genes;
}

const spec = (n: GeneName): GeneSpec => GENE_SPECS[n];

function sampleGene(rng: Rng, s: GeneSpec): number {
  if (s.zeroChance && rng.chance(s.zeroChance)) return 0;
  return s.int ? rng.int(s.min, s.max) : rng.range(s.min, s.max);
}

/** Clamp/round a gene into its valid domain (0 is allowed when the gene can be off). */
export function sanitizeGene(n: GeneName, v: number): number {
  const s = spec(n);
  if (!Number.isFinite(v)) v = s.min;
  if (s.zeroChance && v <= s.min * 0.5) return 0;
  v = clamp(v, s.min, s.max);
  return s.int ? Math.round(v) : v;
}

export function randomGenome(seed: number): Genome {
  const rng = new Rng(hash32(`genome:${seed}`));
  const genes = {} as Genes;
  for (const n of GENE_NAMES) genes[n] = sampleGene(rng, spec(n));
  // A creature always needs some way to move: no legs and no tail → give it a tail.
  if (genes.legPairs === 0 && genes.tailLength === 0) genes.tailLength = 0.9;
  return { version: GENOME_VERSION, seed, genes };
}

export function validateGenome(g: Genome): Genome {
  const genes = {} as Genes;
  for (const n of GENE_NAMES) genes[n] = sanitizeGene(n, g.genes?.[n] ?? spec(n).min);
  return { version: GENOME_VERSION, seed: g.seed >>> 0, genes };
}

/** Mutate each gene with probability `rate`; steps are ~`strength` of the gene range. */
export function mutate(g: Genome, seed: number, rate = 0.25, strength = 0.15): Genome {
  const rng = new Rng(hash32(`mutate:${g.seed}:${seed}`));
  const genes = { ...g.genes };
  for (const n of GENE_NAMES) {
    if (!rng.chance(rate)) continue;
    const s = spec(n);
    if (s.zeroChance && rng.chance(0.12)) {
      genes[n] = genes[n] === 0 ? sampleGene(new Rng(rng.int(0, 1e9)), { ...s, zeroChance: 0 }) : 0;
      continue;
    }
    if (genes[n] === 0 && s.zeroChance) continue;
    const step = s.int ? (rng.chance(0.5) ? 1 : -1) : rng.normal() * (s.max - s.min) * strength;
    genes[n] = genes[n] + step;
    if (s.zeroChance && genes[n] < s.min) genes[n] = s.min;
  }
  return validateGenome({ version: GENOME_VERSION, seed: hash32(`${g.seed}:${seed}`), genes });
}

/** Uniform crossover with occasional blending of continuous genes. */
export function crossover(a: Genome, b: Genome, seed: number): Genome {
  const rng = new Rng(hash32(`cross:${a.seed}:${b.seed}:${seed}`));
  const genes = {} as Genes;
  for (const n of GENE_NAMES) {
    const s = spec(n);
    const va = a.genes[n], vb = b.genes[n];
    if (!s.int && va !== 0 && vb !== 0 && rng.chance(0.4)) genes[n] = va + (vb - va) * rng.next();
    else genes[n] = rng.chance(0.5) ? va : vb;
  }
  return validateGenome({ version: GENOME_VERSION, seed: hash32(`${a.seed}x${b.seed}:${seed}`), genes });
}

const SYL = ['pi', 'xo', 'lu', 'ka', 'mi', 'zor', 'blu', 'fen', 'ti', 'gra', 'nok', 'sa', 'vu', 'rel', 'qui', 'dra'];
export function creatureName(g: Genome): string {
  const rng = new Rng(hash32(`name:${g.seed}`));
  const n = rng.int(2, 3);
  let s = '';
  for (let i = 0; i < n; i++) s += rng.pick(SYL);
  return s[0].toUpperCase() + s.slice(1);
}
