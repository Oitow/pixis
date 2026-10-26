// Simple NPC brains: wander, flee from stronger creatures, chase and bite weaker ones.
import { Creature, type CreatureInput, NO_INPUT } from '../creature/creature';
import { dist, norm, sub, type V3 } from '../core/math';
import { Rng } from '../core/rng';

export class Brain {
  private target: V3;
  private retarget = 0;
  constructor(private rng: Rng, private home: V3) {
    this.target = [...home];
  }

  think(self: Creature, others: Creature[], dt: number): CreatureInput {
    if (!self.alive) return NO_INPUT;
    const a = self.abilities;
    let threat: Creature | null = null, prey: Creature | null = null;
    let td = Infinity, pd = Infinity;
    for (const o of others) {
      if (o === self || !o.alive) continue;
      const d = dist(o.pos, self.pos);
      if (d > a.sight) continue;
      const theirPower = o.abilities.bite * (1 - a.defense);
      const myPower = a.bite * (1 - o.abilities.defense);
      if (theirPower > myPower && d < td) (threat = o), (td = d);
      else if (a.bite > 0 && myPower >= theirPower && self.hp > a.maxHp * 0.4 && d < pd) (prey = o), (pd = d);
    }
    if (threat && td < a.sight * 0.8) {
      const away = norm(sub(self.pos, threat.pos));
      return { move: [away[0], 0, away[2]], jump: a.flight !== 'none' && td < 2, bite: false, glow: false };
    }
    if (prey) {
      const to = sub(prey.pos, self.pos);
      const d = Math.hypot(to[0], to[2]);
      const near = d < self.plan.chain[0].radius * 2 + prey.plan.chain[1].radius + 0.6;
      return { move: near ? [to[0] * 0.1, 0, to[2] * 0.1] : [to[0] / d, 0, to[2] / d], jump: false, bite: near, glow: false };
    }
    this.retarget -= dt;
    if (this.retarget <= 0 || dist(this.target, self.pos) < 0.7) {
      this.retarget = this.rng.range(3, 8);
      this.target = [this.home[0] + this.rng.range(-8, 8), 0, this.home[2] + this.rng.range(-8, 8)];
    }
    const to = sub(this.target, self.pos);
    const d = Math.hypot(to[0], to[2]);
    const lazy = this.rng.next() < 0.002 ? 0 : 0.6;
    return { move: [(to[0] / d) * lazy, 0, (to[2] / d) * lazy], jump: false, bite: false, glow: false };
  }
}
