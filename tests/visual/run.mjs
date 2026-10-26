// Visual regression tests: renders fixed seeds with a frozen simulation and compares to golden images.
// Usage: node tests/visual/run.mjs [--update] [--only name]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = join(root, 'dist');
const goldenDir = join(root, 'tests/visual/golden');
const outDir = join(root, 'tests/visual/out');
const update = process.argv.includes('--update');
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

export const SCENES = [
  { name: 'test-creature', query: 'mode=test&frozen=30' },
  { name: 'gallery-1', query: 'mode=gallery&seed=1&frozen=90' },
  { name: 'game-seed-7', query: 'mode=game&seed=7&frozen=120' },
  { name: 'game-seed-42', query: 'mode=game&seed=42&frozen=120' },
  { name: 'debug-steps', query: 'mode=game&seed=7&frozen=60&debug=1' },
  { name: 'fly-seed-113', query: 'mode=game&seed=113&frozen=100&hold=jump,fwd' },
  { name: 'swim-seed-3', query: 'mode=game&seed=3&frozen=80&at=7,7&hold=fwd,glow' },
];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wgsl': 'text/plain' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const data = await readFile(join(dist, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'text/html' });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
page.on('console', (m) => m.type() === 'error' && console.log('  [console]', m.text()));
await mkdir(outDir, { recursive: true });
await mkdir(goldenDir, { recursive: true });

let failed = 0;
for (const s of SCENES) {
  if (only && s.name !== only) continue;
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/?${s.query}&scale=1`);
  await page.waitForFunction(() => window.__pixisReady || window.__pixisError, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__pixisError);
  if (err) {
    console.log(`✗ ${s.name}: ${err}`);
    failed++;
    continue;
  }
  const buf = await page.locator('#gfx').screenshot();
  await writeFile(join(outDir, `${s.name}.png`), buf);
  const golden = join(goldenDir, `${s.name}.png`);
  const exists = await access(golden).then(() => true, () => false);
  if (update || !exists) {
    await writeFile(golden, buf);
    console.log(`↻ ${s.name}: golden written (${Date.now() - t0} ms)`);
    continue;
  }
  const a = PNG.sync.read(buf), b = PNG.sync.read(await readFile(golden));
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`✗ ${s.name}: size changed`);
    failed++;
    continue;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const bad = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.15 });
  const ratio = bad / (a.width * a.height);
  if (ratio > 0.01) {
    await writeFile(join(outDir, `${s.name}.diff.png`), PNG.sync.write(diff));
    console.log(`✗ ${s.name}: ${(ratio * 100).toFixed(2)}% pixels differ (see tests/visual/out)`);
    failed++;
  } else console.log(`✓ ${s.name} (${(ratio * 100).toFixed(2)}% diff, ${Date.now() - t0} ms)`);
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
