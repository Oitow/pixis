// World height function. MUST stay in sync with `terrainHeight` in render/shaders/scene.wgsl.
import { smoothstep } from './math';

export const WATER_LEVEL = 0;
export const POND_CENTER: [number, number] = [9, 7];

export function terrainHeight(x: number, z: number): number {
  if (flat) return 0;
  let h = 0.7;
  h += 0.35 * Math.sin(x * 0.23) * Math.cos(z * 0.19);
  h += 0.2 * Math.sin(x * 0.51 + z * 0.37);
  h += 0.08 * Math.sin(x * 1.3) * Math.sin(z * 1.1);
  const d = Math.hypot(x - POND_CENTER[0], z - POND_CENTER[1]);
  h -= 2.2 * (1 - smoothstep(3, 9, d));
  return h;
}

export const isWater = (x: number, z: number) => !flat && terrainHeight(x, z) < WATER_LEVEL - 0.15;

let flat = false;
/** Studio mode: a perfectly flat floor without water (gallery / test scenes). */
export function setFlatWorld(on: boolean) {
  flat = on;
}
export const isFlatWorld = () => flat;
