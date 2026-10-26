import { describeAbilities } from '../abilities/abilities';
import type { Creature } from '../creature/creature';

const $ = (id: string) => document.getElementById(id)!;
const MODE_LABEL = { ground: 'an Land', air: 'in der Luft', water: 'im Wasser' };

export class Hud {
  private shownFor: Creature | null = null;

  showCreature(c: Creature) {
    $('c-name').textContent = c.name;
    $('c-seed').textContent = `#${c.genome.seed}`;
    $('abilities').innerHTML = describeAbilities(c.abilities)
      .map((a) => `<div class="ab"><span>${a.label}</span><div class="bar"><i style="width:${a.value * 100}%"></i></div><em>${a.text}</em></div>`)
      .join('');
    $('btn-bite').toggleAttribute('disabled', c.abilities.bite === 0);
    $('btn-glow').toggleAttribute('disabled', !c.abilities.glow);
    $('btn-jump').textContent = c.abilities.flight === 'fly' ? '🪽 Flug' : c.abilities.flight === 'glide' ? '🪽 Sprung' : '⤴ Sprung';
    this.shownFor = c;
  }

  update(c: Creature, info: { fps: number; ms: number; prims: number; scale: number; score: number; log: string[] }) {
    if (this.shownFor !== c) this.showCreature(c);
    $('hp').style.width = `${(c.hp / c.abilities.maxHp) * 100}%`;
    $('c-mode').textContent = c.alive ? MODE_LABEL[c.mode] : 'ohnmächtig';
    $('stats').textContent = `${info.fps.toFixed(0)} fps · ${info.ms.toFixed(1)} ms · ${info.prims} Prims · ${(info.scale * 100).toFixed(0)}% · Punkte ${info.score}`;
    $('log').innerHTML = info.log.map((l) => `<div>${l}</div>`).join('');
  }
}
