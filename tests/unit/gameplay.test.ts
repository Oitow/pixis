import { describe, expect, it } from 'vitest';
import { Creature, NO_INPUT } from '../../src/creature/creature';
import { randomGenome, GENE_NAMES, type Genome } from '../../src/genetics/genome';
import { setFlatWorld, isWater, POND_CENTER } from '../../src/core/terrain';
import { deriveAbilities } from '../../src/abilities/abilities';
import { buildBodyPlan } from '../../src/bodyplan/bodyplan';
import { World } from '../../src/game/world';

const DT = 1 / 60;
function custom(overrides: Partial<Genome['genes']>): Genome {
  const g = randomGenome(1);
  return { ...g, genes: { ...g.genes, ...overrides } };
}
const walker = custom({ legPairs: 2, legLength: 0.9, wingSize: 0, finSize: 0, tailFin: 0, jaw: 0.8 });
const flyer = custom({ legPairs: 1, wingSize: 1.6, bodyThickness: 0.22, bodyLength: 0.8, bodySegments: 2, tailLength: 0, headSize: 0.8 });
const swimmer = custom({ legPairs: 0, tailLength: 1.4, tailFin: 1, finSize: 0.8, wingSize: 0 });

describe('abilities follow form', () => {
  it('derives distinct abilities', () => {
    const w = deriveAbilities(buildBodyPlan(walker));
    const f = deriveAbilities(buildBodyPlan(flyer));
    const s = deriveAbilities(buildBodyPlan(swimmer));
    expect(w.flight).toBe('none');
    expect(f.flight).toBe('fly');
    expect(s.slither).toBe(true);
    expect(s.swimSpeed).toBeGreaterThan(w.swimSpeed);
    expect(w.walkSpeed).toBeGreaterThan(s.walkSpeed);
    expect(w.bite).toBeGreaterThan(0);
  });
  it('every gene name is used by the generator', () => {
    expect(GENE_NAMES.length).toBeGreaterThan(20);
  });
});

describe('creature simulation', () => {
  it('walks forward and stays on the ground', () => {
    setFlatWorld(true);
    const c = new Creature(walker, [0, 0, 0], 0);
    for (let i = 0; i < 180; i++) c.update(DT, { ...NO_INPUT, move: [1, 0, 0] });
    expect(c.pos[0]).toBeGreaterThan(2);
    expect(c.mode).toBe('ground');
    // feet stay near the ground
    for (const l of c.legs) expect(l.foot[1]).toBeLessThan(0.5);
    setFlatWorld(false);
  });
  it('flyers gain height while flapping, walkers fall back down', () => {
    setFlatWorld(true);
    const f = new Creature(flyer), w = new Creature(walker);
    const h0 = f.pos[1];
    for (let i = 0; i < 120; i++) {
      f.update(DT, { ...NO_INPUT, jump: i > 1 });
      w.update(DT, { ...NO_INPUT, jump: i === 2 });
    }
    expect(f.mode).toBe('air');
    expect(f.pos[1]).toBeGreaterThan(h0 + 1.5);
    expect(w.mode).toBe('ground');
    setFlatWorld(false);
  });
  it('enters swim mode in the pond and fins make it faster', () => {
    const start: [number, number, number] = [POND_CENTER[0] - 1.5, 0, POND_CENTER[1]];
    expect(isWater(start[0], start[2])).toBe(true);
    const s = new Creature(swimmer, start, 0), w = new Creature(walker, start, 0);
    for (let i = 0; i < 60; i++) {
      s.update(DT, { ...NO_INPUT, move: [1, 0, 0] });
      w.update(DT, { ...NO_INPUT, move: [1, 0, 0] });
    }
    expect(s.mode).toBe('water');
    expect(s.pos[0] - start[0]).toBeGreaterThan(w.pos[0] - start[0]);
  });
  it('bites deal damage in the world', () => {
    const world = new World(walker, 1, 0);
    const victim = new Creature(swimmer, [world.player.pos[0] + 1.0, 0, world.player.pos[2]], 0);
    world.creatures.push(victim);
    world.player.yaw = 0;
    const hp = victim.hp;
    for (let i = 0; i < 90; i++) world.step(DT, { ...NO_INPUT, move: [0.3, 0, 0], bite: true });
    expect(victim.hp).toBeLessThan(hp);
  });
  it('simulation is deterministic', () => {
    const run = () => {
      const w = new World(randomGenome(9), 3);
      for (let i = 0; i < 300; i++) w.step(DT, { ...NO_INPUT, move: [0.5, 0, 0.5] });
      return w.creatures.map((c) => c.pos.map((v) => v.toFixed(6)).join(',')).join('|');
    };
    expect(run()).toBe(run());
  });
});

describe('performance budget (CPU)', () => {
  it('updates and builds 10 creatures well under a frame', () => {
    const world = new World(randomGenome(5), 1, 9);
    const t0 = performance.now();
    const N = 120;
    for (let i = 0; i < N; i++) {
      world.step(DT, NO_INPUT);
      world.groups();
    }
    const per = (performance.now() - t0) / N;
    expect(per).toBeLessThan(4);
  });
});
