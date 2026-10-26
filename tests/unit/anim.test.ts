import { describe, expect, it } from 'vitest';
import { solveTwoBone } from '../../src/anim/ik';
import { dist, type V3 } from '../../src/core/math';

describe('two-bone IK', () => {
  it('keeps bone lengths and reaches reachable targets', () => {
    const hip: V3 = [0, 1, 0];
    for (const target of [[0.3, 0.1, 0.2], [0.5, 0.4, -0.1], [0, 0.2, 0]] as V3[]) {
      const { knee, foot } = solveTwoBone(hip, target, 0.6, 0.6, [0, 1, 0]);
      expect(dist(hip, knee)).toBeCloseTo(0.6, 4);
      expect(dist(knee, foot)).toBeCloseTo(0.6, 4);
      expect(dist(foot, target)).toBeLessThan(1e-3);
      expect(knee[1]).toBeGreaterThan((hip[1] + foot[1]) / 2 - 1e-6); // bends towards the pole
    }
  });
  it('clamps unreachable targets to full extension', () => {
    const { foot } = solveTwoBone([0, 0, 0], [5, 0, 0], 1, 1, [0, 1, 0]);
    expect(dist([0, 0, 0], foot)).toBeCloseTo(2, 3);
  });
});
