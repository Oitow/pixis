// Form follows function: abilities are derived from the body plan, never assigned by hand.
import type { BodyPlan } from '../bodyplan/bodyplan';
import { clamp } from '../core/math';

export interface Abilities {
  walkSpeed: number;
  slither: boolean;
  jump: number; // initial upward velocity
  swimSpeed: number;
  flight: 'none' | 'glide' | 'fly';
  lift: number; // wing lift relative to mass
  bite: number; // damage per bite (0 = cannot bite)
  defense: number; // damage reduction 0..0.8
  glow: boolean;
  sight: number; // metres
  maxHp: number;
}

export function deriveAbilities(p: BodyPlan): Abilities {
  const legs = p.legs.length;
  const legLen = legs ? p.legs[0].upper + p.legs[0].lower : 0;
  const slither = legs === 0;
  const walkSpeed = slither ? 1.4 + p.chain.length * 0.08 : 1.2 + legLen * 2.2 + Math.min(legs, 6) * 0.15;
  const jump = slither ? 2.2 : 2.5 + legLen * 3.5;
  const finPower = (p.fins?.size ?? 0) * 2.5 + p.tailFin * 2 + (slither ? 1 : 0);
  const swimSpeed = 0.7 + finPower;
  const wingArea = p.wings ? p.wings.span * p.wings.chord * 2 : 0;
  const lift = wingArea / Math.max(0.05, p.mass);
  const flight = lift > 2.2 ? 'fly' : wingArea > 0 ? 'glide' : 'none';
  const bite = p.head.jaw > 0 ? Math.round(4 + p.head.jaw * 10 + p.head.radius * 8) : 0;
  const defense = clamp(p.spikes.length * 0.06 + p.head.hornPairs * 0.08, 0, 0.8);
  const eyeArea = p.head.eyes.reduce((s, e) => s + e.radius, 0);
  const sight = 4 + eyeArea * 18;
  const maxHp = Math.round(40 + p.mass * 60);
  return { walkSpeed, slither, jump, swimSpeed, flight, lift, bite, defense, glow: p.glow.length > 0, sight, maxHp };
}

export function describeAbilities(a: Abilities): { label: string; value: number; text: string }[] {
  const out = [
    { label: a.slither ? 'Schlängeln' : 'Laufen', value: a.walkSpeed / 5, text: `${a.walkSpeed.toFixed(1)} m/s` },
    { label: 'Springen', value: a.jump / 7, text: `${a.jump.toFixed(1)}` },
    { label: 'Schwimmen', value: a.swimSpeed / 5, text: `${a.swimSpeed.toFixed(1)} m/s` },
  ];
  if (a.flight !== 'none')
    out.push({ label: a.flight === 'fly' ? 'Fliegen' : 'Gleiten', value: Math.min(1, a.lift / 5), text: `Auftrieb ${a.lift.toFixed(1)}` });
  if (a.bite) out.push({ label: 'Beißen', value: a.bite / 25, text: `${a.bite} Schaden` });
  if (a.defense) out.push({ label: 'Panzer', value: a.defense, text: `-${Math.round(a.defense * 100)}%` });
  if (a.glow) out.push({ label: 'Leuchten', value: 1, text: 'ja' });
  out.push({ label: 'Sicht', value: a.sight / 12, text: `${a.sight.toFixed(1)} m` });
  return out.map((o) => ({ ...o, value: clamp(o.value, 0.03, 1) }));
}
