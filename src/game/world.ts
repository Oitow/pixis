// Game world: player + NPC creatures, bites, fainting and respawning.
import { Creature, NO_INPUT, type CreatureInput } from '../creature/creature';
import { randomGenome, type Genome } from '../genetics/genome';
import { Brain } from './ai';
import { Rng, hash32 } from '../core/rng';
import { add, dist, madd, scale, type V3 } from '../core/math';
import type { PrimGroup } from '../sdf/prim';

export interface WorldEvent {
  text: string;
  t: number;
}

export class World {
  creatures: Creature[] = [];
  brains = new Map<Creature, Brain>();
  player: Creature;
  events: WorldEvent[] = [];
  score = 0;
  time = 0;
  private rng: Rng;
  private respawn = new Map<Creature, number>();

  constructor(playerGenome: Genome, readonly worldSeed: number, npcCount = 7) {
    this.rng = new Rng(hash32(`world:${worldSeed}`));
    this.player = new Creature(playerGenome, [0, 0, 0], 0.6);
    this.creatures.push(this.player);
    for (let i = 0; i < npcCount; i++) this.spawnNpc();
  }

  private spawnNpc() {
    const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(5, 16);
    const pos: V3 = [Math.cos(a) * r, 0, Math.sin(a) * r];
    const c = new Creature(randomGenome(this.rng.int(1, 1e9)), pos, this.rng.range(0, 6.28));
    this.creatures.push(c);
    this.brains.set(c, new Brain(new Rng(this.rng.int(1, 1e9)), pos));
    return c;
  }

  setPlayer(g: Genome) {
    const old = this.player;
    const p = new Creature(g, [old.pos[0], 0, old.pos[2]], old.yaw);
    this.creatures[this.creatures.indexOf(old)] = p;
    this.player = p;
  }

  log(text: string) {
    this.events.push({ text, t: this.time });
    if (this.events.length > 5) this.events.shift();
  }

  step(dt: number, playerInput: CreatureInput) {
    this.time += dt;
    for (const c of this.creatures) {
      const input = c === this.player ? playerInput : (this.brains.get(c)?.think(c, this.creatures, dt) ?? NO_INPUT);
      const { bit } = c.update(dt, input);
      if (bit) this.resolveBite(c);
    }
    this.separate();
    // Fainted NPCs are replaced by newcomers after a while; the player recovers.
    for (const c of this.creatures) {
      if (c.alive) continue;
      const t = (this.respawn.get(c) ?? 0) + dt;
      this.respawn.set(c, t);
      if (t > 4) {
        this.respawn.delete(c);
        if (c === this.player) {
          c.hp = c.abilities.maxHp;
          this.log(`${c.name} ist wieder auf den Beinen.`);
        } else {
          this.creatures.splice(this.creatures.indexOf(c), 1);
          this.brains.delete(c);
          const n = this.spawnNpc();
          this.log(`${n.name} taucht auf.`);
        }
      }
    }
  }

  private resolveBite(biter: Creature) {
    const mouth = madd(biter.headPos, biter.forward, biter.plan.chain[0].radius * 1.4);
    let best: Creature | null = null, bd = Infinity;
    for (const o of this.creatures) {
      if (o === biter || !o.alive) continue;
      for (let i = 0; i < o.nodes.length; i++) {
        const d = dist(o.nodes[i], mouth) - o.plan.chain[i].radius;
        if (d < 0.35 && d < bd) (bd = d), (best = o);
      }
    }
    if (!best) return;
    const dmg = best.takeDamage(biter.abilities.bite);
    const push = scale(biter.forward, 2.5);
    best.vel = add(best.vel, [push[0], 0, push[2]]);
    if (biter === this.player) this.log(`Biss! ${best.name} −${dmg} HP`);
    if (best === this.player) this.log(`${biter.name} beißt dich: −${dmg} HP`);
    if (!best.alive) {
      if (biter === this.player) this.score++;
      this.log(`${best.name} ist ohnmächtig.`);
    }
  }

  /** Cheap creature–creature collision so bodies don't overlap. */
  private separate() {
    const cs = this.creatures;
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], b = cs[j];
        const dx = b.pos[0] - a.pos[0], dz = b.pos[2] - a.pos[2];
        const d = Math.hypot(dx, dz);
        const min = a.plan.chain[1].radius + b.plan.chain[1].radius + 0.15;
        if (d > 1e-4 && d < min && Math.abs(a.pos[1] - b.pos[1]) < 1) {
          const push = (min - d) / 2;
          a.pos[0] -= (dx / d) * push; a.pos[2] -= (dz / d) * push;
          b.pos[0] += (dx / d) * push; b.pos[2] += (dz / d) * push;
        }
      }
  }

  groups(): PrimGroup[] {
    return this.creatures.map((c) => ({ prims: c.buildPrims(), origin: c.pos, yaw: c.yaw, highlight: c.hurtT > 0 ? c.hurtT * 2 : 0 }));
  }
}
