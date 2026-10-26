// Pixis entry: game, gallery and test-creature modes.
import { Renderer } from './render/renderer';
import { OrbitCamera, projectToScreen } from './render/camera';
import { World } from './game/world';
import { Creature, NO_INPUT } from './creature/creature';
import { mutate, randomGenome, validateGenome, type Genome } from './genetics/genome';
import { setFlatWorld } from './core/terrain';
import { lerpV, type V3 } from './core/math';
import { Input } from './ui/input';
import { Hud } from './ui/hud';
import { testCreature } from './demos/testcreature';
import { hash32 } from './core/rng';
import type { PrimGroup } from './sdf/prim';

declare global {
  interface Window { __pixisReady?: boolean; __pixisError?: string }
}

const params = new URLSearchParams(location.search);
const mode = (params.get('mode') ?? 'game') as 'game' | 'gallery' | 'test';
const debug = Number(params.get('debug') ?? 0);
const frozenSteps = params.has('frozen') ? Number(params.get('frozen') || 60) : -1;
const fixedScale = params.has('scale') ? Number(params.get('scale')) : null;
const DT = 1 / 60;
// Test/demo helpers: `at=x,z` spawns the player there, `hold=fwd,jump,bite,glow` holds inputs.
const spawnAt = params.get('at')?.split(',').map(Number) as [number, number] | undefined;
const held = new Set((params.get('hold') ?? '').split(',').filter(Boolean));

function genomeFromUrl(): Genome {
  const g = params.get('g');
  if (g) {
    try {
      return validateGenome(JSON.parse(atob(g.replace(/-/g, '+').replace(/_/g, '/'))));
    } catch { /* fall through to seed */ }
  }
  const s = params.get('seed');
  return randomGenome(s ? Number(s) || hash32(s) : (Date.now() % 1e9) >>> 0);
}

function setParam(updates: Record<string, string | null>) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(updates)) v === null ? p.delete(k) : p.set(k, v);
  return `${location.pathname}?${p}`;
}

async function main() {
  document.body.classList.add(`mode-${mode}`);
  if (frozenSteps >= 0 && !params.has('hud')) document.body.classList.add('frozen');
  const canvas = document.getElementById('gfx') as HTMLCanvasElement;
  let renderer: Renderer;
  const fail = (msg: string) => {
    const el = document.getElementById('error')!;
    el.hidden = false;
    el.innerHTML = `<div><h2>Pixis braucht WebGPU</h2><p>${msg}</p><p>Bitte einen aktuellen Chrome, Edge oder Safari (ab 26) verwenden.</p></div>`;
    window.__pixisError = msg;
  };
  Renderer.onLost = (msg) => fail(`Die Grafikkarte wurde getrennt: ${msg}`);
  try {
    renderer = await Renderer.create(canvas, frozenSteps >= 0);
  } catch (e) {
    fail((e as Error).message);
    return;
  }

  const cam = new OrbitCamera();
  const input = new Input(canvas, cam, mode === 'game');
  const hud = new Hud();
  (document.getElementById('mode-select') as HTMLSelectElement).value = mode;
  (document.getElementById('debug-select') as HTMLSelectElement).value = String(debug);
  document.getElementById('mode-select')!.addEventListener('change', (e) => (location.href = setParam({ mode: (e.target as HTMLSelectElement).value })));
  document.getElementById('debug-select')!.addEventListener('change', (e) => (location.href = setParam({ debug: (e.target as HTMLSelectElement).value })));

  // ---- scene setup per mode
  let world: World | null = null;
  const gallery: Creature[] = [];
  const studio = mode !== 'game';
  setFlatWorld(studio);

  if (mode === 'game') {
    world = new World(genomeFromUrl(), hash32(params.get('world') ?? 'pixis'));
    if (spawnAt) {
      const p = world.player;
      p.pos = [spawnAt[0], p.pos[1], spawnAt[1]];
      world.setPlayer(p.genome);
    }
    cam.distance = 4.5 + world.player.plan.chain.length * 0.15;
    cam.target = [...world.player.pos];
    hud.showCreature(world.player);
    const reset = (g: Genome) => {
      world!.setPlayer(g);
      history.replaceState(null, '', setParam({ seed: String(g.seed), g: null }));
    };
    document.getElementById('btn-new')!.onclick = () => reset(randomGenome(hash32(`${Date.now()}`) % 1e9));
    document.getElementById('btn-mutate')!.onclick = () => {
      const g = mutate(world!.player.genome, Date.now() % 1e6);
      world!.setPlayer(g);
      history.replaceState(null, '', setParam({ seed: null, g: btoa(JSON.stringify(g)).replace(/\+/g, '-').replace(/\//g, '_') }));
    };
  } else if (mode === 'gallery') {
    const base = Number(params.get('seed') ?? 1);
    for (let i = 0; i < 16; i++) {
      const pos: V3 = [((i % 4) - 1.5) * 3.2, 0, (Math.floor(i / 4) - 1.5) * 3.2];
      gallery.push(new Creature(randomGenome(base + i), pos, 0.9));
    }
    cam.target = [0, 0.3, 0];
    cam.distance = 15;
    cam.pitch = 0.75;
    cam.yaw = 1.2;
    document.getElementById('btn-new')!.onclick = () => (location.href = setParam({ seed: String(base + 16) }));
    input.onTap = (x, y) => {
      let best: Creature | null = null, bd = 60;
      for (const c of gallery) {
        const s = projectToScreen(cam, c.pos, innerWidth, innerHeight);
        if (s && Math.hypot(s[0] - x, s[1] - y) < bd) (bd = Math.hypot(s[0] - x, s[1] - y)), (best = c);
      }
      if (best) location.href = setParam({ mode: 'game', seed: String(best.genome.seed) });
    };
  } else {
    cam.target = [0, 0.7, 0];
    cam.distance = 3.6;
    cam.pitch = 0.25;
    document.getElementById('btn-new')!.style.display = 'none';
  }
  document.getElementById('btn-share')!.onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); document.getElementById('btn-share')!.textContent = '✓ Kopiert'; } catch { prompt('Link', location.href); }
  };

  // ---- resolution (dynamic in normal play)
  let scale = fixedScale ?? Math.min(devicePixelRatio, 1.5) * 0.75;
  const resize = () => {
    canvas.width = Math.max(64, Math.round(canvas.clientWidth * scale));
    canvas.height = Math.max(64, Math.round(canvas.clientHeight * scale));
  };
  addEventListener('resize', resize);
  resize();

  const labels = document.getElementById('labels')!;
  let simTime = 0;
  const step = () => {
    simTime += DT;
    if (world) {
      const [sx, sy] = input.move();
      const move = held.has('fwd') ? world.player.forward : cam.stickToWorld(sx, sy);
      world.step(DT, {
        move,
        jump: input.jump || held.has('jump'),
        bite: input.bite || held.has('bite'),
        glow: input.glow || held.has('glow'),
      });
    }
    for (const c of gallery) c.update(DT, NO_INPUT);
  };
  const groups = (): PrimGroup[] => {
    if (world) return world.groups();
    if (gallery.length) return gallery.map((c) => ({ prims: c.buildPrims(), origin: c.pos, yaw: c.yaw, highlight: 0 }));
    return [testCreature(simTime)];
  };
  const follow = (k: number) => {
    if (world) cam.target = lerpV(cam.target, [world.player.pos[0], world.player.pos[1] + 0.2, world.player.pos[2]], k);
    if (mode === 'test' && frozenSteps < 0) cam.yaw += 0.003;
  };

  // Deterministic single frame for screenshot tests.
  if (frozenSteps >= 0) {
    for (let i = 0; i < frozenSteps; i++) step();
    follow(1);
    renderer.render(groups(), cam, { debug, studio, time: simTime });
    if (world) hud.update(world.player, { fps: 0, ms: 0, prims: renderer.lastPrimCount, scale: 1, score: world.score, log: world.events.map((e) => e.text) });
    const img = await renderer.capture();
    canvas.getContext('2d')!.putImageData(img, 0, 0);
    window.__pixisReady = true;
    return;
  }

  let acc = 0, last = performance.now(), fps = 60, ms = 16, frameCount = 0;
  const frame = async (now: number) => {
    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += elapsed;
    let n = 0;
    while (acc >= DT && n < 5) (step(), (acc -= DT), n++);
    if (n === 5) acc = 0;
    follow(1 - Math.exp(-elapsed * 6));
    const t0 = performance.now();
    try {
      renderer.render(groups(), cam, { debug, studio, time: simTime });
    } catch (e) {
      if (frameCount === 0) console.error('render failed', e);
    }
    fps = fps * 0.95 + (1 / Math.max(elapsed, 1e-3)) * 0.05;
    if (++frameCount % 10 === 0) {
      await renderer.done();
      ms = ms * 0.7 + (performance.now() - t0) * 0.3;
      // Dynamic resolution: aim for ~60 fps.
      if (fixedScale === null && frameCount > 30) {
        const target = Math.min(devicePixelRatio, 1.5);
        if (fps < 50 && scale > 0.35) (scale = Math.max(0.35, scale * 0.9)), resize();
        else if (fps > 58 && ms < 10 && scale < target) (scale = Math.min(target, scale * 1.05)), resize();
      }
    }
    if (world) {
      hud.update(world.player, { fps, ms, prims: renderer.lastPrimCount, scale, score: world.score, log: world.events.map((e) => e.text) });
    } else {
      document.getElementById('stats')!.textContent = `${fps.toFixed(0)} fps · ${renderer.lastPrimCount} Prims · ${(scale * 100).toFixed(0)}%`;
    }
    if (gallery.length) {
      labels.innerHTML = gallery
        .map((c) => {
          const s = projectToScreen(cam, [c.pos[0], c.pos[1] + 1.1, c.pos[2]], innerWidth, innerHeight);
          return s ? `<div style="left:${s[0]}px;top:${s[1]}px">${c.name}</div>` : '';
        })
        .join('');
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__pixisReady = true;
}

main();
