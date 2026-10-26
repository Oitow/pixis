// Pixis SDF scene: creatures (smooth-blended primitive groups) on a heightfield with a pond.
// Struct layouts MUST match src/sdf/prim.ts and src/render/renderer.ts.

struct Prim {
  a: vec4f,      // xyz, type
  b: vec4f,      // xyz, k
  r: vec4f,      // radii / r1 r2, pattern
  q: vec4f,      // local→world quaternion
  colA: vec4f,   // rgb, pattern scale
  colB: vec4f,
  emis: vec4f,
  pad: vec4f,
};

struct Group {
  bound: vec4f,  // centre xyz, radius
  frame: vec4f,  // pattern origin xyz, yaw
  info: vec4f,   // start, count, highlight, -
};

struct Uniforms {
  camPos: vec4f,   // xyz, tan(fovY/2)
  camFwd: vec4f,   // xyz, aspect
  camRight: vec4f, // xyz, time
  camUp: vec4f,    // xyz, group count
  res: vec4f,      // width, height, tilesX, debug mode
  sun: vec4f,      // xyz, flags (1 = no terrain)
};

@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var<storage, read> prims: array<Prim>;
@group(0) @binding(2) var<storage, read> groups: array<Group>;
@group(0) @binding(3) var<storage, read_write> tileMasks: array<u32>;
@group(0) @binding(4) var<storage, read> tileMasksRO: array<u32>;

const TILE: u32 = 16u;
const WATER: f32 = 0.0;
const POND: vec2f = vec2f(9.0, 7.0);

fn groupCount() -> u32 { return u32(U.camUp.w); }

// ---------------------------------------------------------------- culling (compute)
// One thread per screen tile: build a bitmask of groups whose projected bounding sphere touches it.
@compute @workgroup_size(8, 8)
fn cull(@builtin(global_invocation_id) id: vec3u) {
  let tilesX = u32(U.res.z);
  let tilesY = (u32(U.res.y) + TILE - 1u) / TILE;
  if (id.x >= tilesX || id.y >= tilesY) { return; }
  let tmin = vec2f(f32(id.x * TILE), f32(id.y * TILE));
  let tmax = tmin + vec2f(f32(TILE));
  var mask = 0u;
  for (var g = 0u; g < groupCount(); g++) {
    let b = groups[g].bound;
    let v = b.xyz - U.camPos.xyz;
    let z = dot(v, U.camFwd.xyz);
    if (z < -b.w) { continue; }
    if (z <= b.w * 1.05) { mask |= 1u << g; continue; }
    let tanY = U.camPos.w;
    let tanX = tanY * U.camFwd.w;
    let sx = dot(v, U.camRight.xyz) / (z * tanX);
    let sy = dot(v, U.camUp.xyz) / (z * tanY);
    let rr = b.w / ((z - b.w) * tanY); // conservative radius in NDC-y units
    let cx = (sx * 0.5 + 0.5) * U.res.x;
    let cy = (0.5 - sy * 0.5) * U.res.y;
    let rpx = rr * 0.5 * U.res.y;
    if (cx + rpx >= tmin.x && cx - rpx <= tmax.x && cy + rpx >= tmin.y && cy - rpx <= tmax.y) {
      mask |= 1u << g;
    }
  }
  tileMasks[id.y * tilesX + id.x] = mask;
}

// ---------------------------------------------------------------- helpers
fn qrot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}
fn qinv(q: vec4f) -> vec4f { return vec4f(-q.xyz, q.w); }

fn hash3(p: vec3f) -> f32 {
  var q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3));
  q *= 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
fn noise3(x: vec3f) -> f32 {
  let i = floor(x);
  let f = fract(x);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3f(1, 0, 0)), u.x),
                 mix(hash3(i + vec3f(0, 1, 0)), hash3(i + vec3f(1, 1, 0)), u.x), u.y),
             mix(mix(hash3(i + vec3f(0, 0, 1)), hash3(i + vec3f(1, 0, 1)), u.x),
                 mix(hash3(i + vec3f(0, 1, 1)), hash3(i + vec3f(1, 1, 1)), u.x), u.y), u.z);
}

// ---------------------------------------------------------------- terrain (keep in sync with core/terrain.ts)
fn terrainHeight(x: f32, z: f32) -> f32 {
  var h = 0.7;
  h += 0.35 * sin(x * 0.23) * cos(z * 0.19);
  h += 0.2 * sin(x * 0.51 + z * 0.37);
  h += 0.08 * sin(x * 1.3) * sin(z * 1.1);
  let d = length(vec2f(x, z) - POND);
  h -= 2.2 * (1.0 - smoothstep(3.0, 9.0, d));
  return h;
}
fn sdTerrain(p: vec3f) -> f32 {
  if (U.sun.w > 0.5) { return p.y + 0.0; }
  return (p.y - terrainHeight(p.x, p.z)) * 0.7;
}

// ---------------------------------------------------------------- primitives
fn sdEllipsoid(p: vec3f, r: vec3f) -> f32 {
  let k0 = length(p / r);
  let k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-6);
}
fn sdRoundCone(p: vec3f, a: vec3f, b: vec3f, r1: f32, r2: f32) -> f32 {
  let ba = b - a;
  let l2 = dot(ba, ba);
  if (l2 < 1e-8) { return length(p - a) - max(r1, r2); }
  let rr = r1 - r2;
  let a2 = l2 - rr * rr;
  let il2 = 1.0 / l2;
  let pa = p - a;
  let y = dot(pa, ba);
  let z = y - l2;
  let xv = pa * l2 - ba * y;
  let x2 = dot(xv, xv);
  let y2 = y * y * l2;
  let z2 = z * z * l2;
  let k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) { return sqrt(x2 + z2) * il2 - r2; }
  if (sign(y) * a2 * y2 < k) { return sqrt(x2 + y2) * il2 - r1; }
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
fn sdPrim(p: vec3f, pr: Prim) -> f32 {
  if (pr.a.w < 0.5) {
    return sdEllipsoid(qrot(qinv(pr.q), p - pr.a.xyz), pr.r.xyz);
  }
  return sdRoundCone(p, pr.a.xyz, pr.b.xyz, pr.r.x, pr.r.y);
}
fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = max(k - abs(a - b), 0.0) / max(k, 1e-5);
  return min(a, b) - h * h * k * 0.25;
}

fn sdGroup(p: vec3f, g: u32) -> f32 {
  let info = groups[g].info;
  let start = u32(info.x);
  let count = u32(info.y);
  var d = 1e9;
  for (var i = 0u; i < count; i++) {
    let pr = prims[start + i];
    d = smin(d, sdPrim(p, pr), pr.b.w);
  }
  return d;
}

// Creatures only; returns (distance, group index).
fn mapCreatures(p: vec3f, mask: u32, margin: f32) -> vec2f {
  var best = vec2f(1e9, -1.0);
  for (var g = 0u; g < groupCount(); g++) {
    if ((mask & (1u << g)) == 0u) { continue; }
    let b = groups[g].bound;
    let dc = length(p - b.xyz) - b.w;
    if (dc > margin) { // well outside the bound: the bound is a valid lower bound
      if (dc < best.x) { best = vec2f(dc, -1.0); }
      continue;
    }
    let d = sdGroup(p, g);
    if (d < best.x) { best = vec2f(d, f32(g)); }
  }
  return best;
}

// (distance, id): id -1 = terrain/bound, >=0 creature group
fn map(p: vec3f, mask: u32) -> vec2f {
  let c = mapCreatures(p, mask, 0.25);
  let t = sdTerrain(p);
  if (t < c.x) { return vec2f(t, -2.0); }
  return c;
}

struct Mat { col: vec3f, emis: vec3f, eye: f32 };

fn patternMix(pr: Prim, pc: vec3f, pl: vec3f) -> vec3f {
  let pat = pr.r.w;
  let s = pr.colA.w;
  let A = pr.colA.rgb;
  let B = pr.colB.rgb;
  if (pat < 0.5 || pat > 5.5) { return A; }
  if (pat < 1.5) { // stripes across the creature
    return mix(A, B, smoothstep(0.2, 0.45, sin(pc.x * s * 2.0 + noise3(pc * 3.0) * 2.0)));
  }
  if (pat < 2.5) { // spots
    return mix(A, B, smoothstep(0.62, 0.7, noise3(pc * s * 1.2)));
  }
  if (pat < 3.5) { // scales
    let q = pc * s * 2.5;
    let cell = abs(fract(q.xz + vec2f(0.5 * floor(q.x), 0.0)) - 0.5);
    let e = max(cell.x, cell.y);
    return mix(A, B, smoothstep(0.35, 0.5, e) * 0.8);
  }
  if (pat < 4.5) { // belly gradient (darker back, lighter belly)
    return mix(B, A, smoothstep(-0.1, 0.15, -pc.y + 0.6 * noise3(pc * 6.0) - 0.3));
  }
  // eye: local +x looks outward. iris, pupil and white sclera.
  let n = normalize(pl);
  let c = n.x;
  var col = vec3f(0.95, 0.93, 0.9);
  col = mix(col, A, smoothstep(0.55, 0.62, c));
  col = mix(col, vec3f(0.02), smoothstep(0.82, 0.86, c));
  return col;
}

fn creatureMaterial(p: vec3f, g: u32) -> Mat {
  let info = groups[g].info;
  let start = u32(info.x);
  let count = u32(info.y);
  let fr = groups[g].frame;
  let cy = cos(fr.w);
  let sy = sin(fr.w);
  let rel = p - fr.xyz;
  // pattern space = creature space (rotate by -yaw around Y)
  let pc = vec3f(rel.x * cy - rel.z * sy, rel.y, rel.x * sy + rel.z * cy);
  var d = 1e9;
  var col = vec3f(0.0);
  var emis = vec3f(0.0);
  var eye = 0.0;
  for (var i = 0u; i < count; i++) {
    let pr = prims[start + i];
    let di = sdPrim(p, pr);
    let k = max(pr.b.w, 1e-4);
    let h = clamp(0.5 + 0.5 * (di - d) / k, 0.0, 1.0); // weight of previous
    let pl = qrot(qinv(pr.q), p - pr.a.xyz);
    let ci = patternMix(pr, pc, pl);
    let isEye = select(0.0, 1.0, pr.r.w > 4.5 && pr.r.w < 5.5);
    col = mix(ci, col, h);
    emis = mix(pr.emis.rgb, emis, h);
    eye = mix(isEye, eye, h);
    d = mix(di, d, h) - k * h * (1.0 - h);
  }
  var m: Mat;
  m.col = col;
  m.emis = emis + vec3f(info.z * 0.8, 0.0, 0.0);
  m.eye = eye;
  return m;
}

fn calcNormal(p: vec3f, mask: u32) -> vec3f {
  let e = vec2f(1.0, -1.0) * 0.0015;
  return normalize(e.xyy * map(p + e.xyy, mask).x + e.yyx * map(p + e.yyx, mask).x +
                   e.yxy * map(p + e.yxy, mask).x + e.xxx * map(p + e.xxx, mask).x);
}

fn softShadow(ro: vec3f, rd: vec3f) -> f32 {
  var res = 1.0;
  var t = 0.03;
  for (var i = 0; i < 40; i++) {
    let h = mapCreatures(ro + rd * t, 0xffffffffu, 1.0).x;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.03, 0.5);
    if (res < 0.01 || t > 8.0) { break; }
  }
  // cheap terrain self-shadow: height above surface along the sun direction
  let tp = ro + rd * 1.5;
  let th = clamp((tp.y - terrainHeight(tp.x, tp.z)) * 2.0 + 0.6, 0.0, 1.0);
  return clamp(res, 0.0, 1.0) * select(th, 1.0, U.sun.w > 0.5);
}

fn ambientOcclusion(p: vec3f, n: vec3f, withTerrain: bool) -> f32 {
  var occ = 0.0;
  var w = 1.0;
  for (var i = 1; i <= 5; i++) {
    let h = 0.02 + 0.07 * f32(i);
    let q = p + n * h;
    var d = mapCreatures(q, 0xffffffffu, 0.6).x;
    if (withTerrain) { d = min(d, sdTerrain(q)); }
    occ += (h - min(d, h)) * w;
    w *= 0.7;
  }
  return clamp(1.0 - 1.8 * occ, 0.0, 1.0);
}

fn sky(rd: vec3f) -> vec3f {
  let t = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  var c = mix(vec3f(0.92, 0.86, 0.78), vec3f(0.35, 0.58, 0.9), pow(t, 0.7));
  let s = max(dot(rd, U.sun.xyz), 0.0);
  c += vec3f(1.0, 0.8, 0.5) * (pow(s, 400.0) * 3.0 + pow(s, 8.0) * 0.25);
  return c;
}

fn terrainColor(p: vec3f, n: vec3f) -> vec3f {
  let nz = noise3(p * 1.7) * 0.6 + noise3(p * 7.0) * 0.4;
  var c = mix(vec3f(0.30, 0.52, 0.22), vec3f(0.45, 0.62, 0.25), nz);
  c = mix(c, vec3f(0.42, 0.36, 0.26), smoothstep(0.6, 0.9, 1.0 - n.y)); // slopes: dirt
  c = mix(vec3f(0.78, 0.7, 0.5), c, smoothstep(0.05, 0.35, p.y));         // shore: sand
  c = mix(vec3f(0.35, 0.33, 0.25), c, smoothstep(-0.6, 0.0, p.y));        // pond bed
  if (U.sun.w > 0.5) { // studio floor
    let chk = (floor(p.x) + floor(p.z)) % 2.0;
    c = mix(vec3f(0.72), vec3f(0.78), abs(chk));
  }
  return c;
}

fn terrainNormal(p: vec3f) -> vec3f {
  if (U.sun.w > 0.5) { return vec3f(0.0, 1.0, 0.0); }
  let e = 0.03;
  let hx = terrainHeight(p.x + e, p.z) - terrainHeight(p.x - e, p.z);
  let hz = terrainHeight(p.x, p.z + e) - terrainHeight(p.x, p.z - e);
  return normalize(vec3f(-hx, 2.0 * e, -hz));
}

fn shade(p0: vec3f, rd: vec3f, id: f32, mask: u32) -> vec3f {
  var p = p0;
  var n: vec3f;
  if (id >= 0.0) {
    n = calcNormal(p, mask);
  } else {
    // snap to the exact heightfield surface: avoids banding from the approximate SDF
    p.y = select(terrainHeight(p.x, p.z), 0.0, U.sun.w > 0.5);
    n = terrainNormal(p);
  }
  let L = U.sun.xyz;
  let sh = softShadow(p + n * 0.01, L);
  let ao = ambientOcclusion(p, n, id >= 0.0);
  let dif = max(dot(n, L), 0.0) * sh;
  let skyAmb = 0.5 + 0.5 * n.y;
  var albedo: vec3f;
  var emis = vec3f(0.0);
  var spec = 0.0;
  var rim = 0.0;
  if (id >= 0.0) {
    let m = creatureMaterial(p, u32(id));
    albedo = m.col;
    emis = m.emis;
    let hv = normalize(L - rd);
    spec = pow(max(dot(n, hv), 0.0), mix(24.0, 120.0, m.eye)) * mix(0.25, 1.4, m.eye) * sh;
    rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * 0.35;
    // fake subsurface: light wraps a bit around soft bodies
    let wrap = max(dot(n, L) * 0.5 + 0.5, 0.0);
    albedo *= 1.0;
    let sss = vec3f(1.0, 0.45, 0.3) * wrap * 0.12 * (1.0 - m.eye);
    emis += sss * albedo;
  } else {
    albedo = terrainColor(p, n);
  }
  var col = albedo * (vec3f(1.3, 1.15, 0.95) * dif + vec3f(0.35, 0.45, 0.6) * skyAmb * ao);
  col += vec3f(1.0, 0.95, 0.85) * spec + sky(reflect(rd, n)) * rim * ao + emis;
  return col;
}

// ---------------------------------------------------------------- render
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VOut {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var o: VOut;
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}

fn heat(t: f32) -> vec3f {
  return clamp(vec3f(t * 3.0, t * 3.0 - 1.0, t * 3.0 - 2.0), vec3f(0.0), vec3f(1.0)) + vec3f(0.0, 0.0, 0.3) * (1.0 - t);
}

@fragment
fn fs(vin: VOut) -> @location(0) vec4f {
  let frag = vin.pos.xy;
  let ndc = vec2f(frag.x / U.res.x * 2.0 - 1.0, 1.0 - frag.y / U.res.y * 2.0);
  let tanY = U.camPos.w;
  let rd = normalize(U.camFwd.xyz + U.camRight.xyz * ndc.x * tanY * U.camFwd.w + U.camUp.xyz * ndc.y * tanY);
  let ro = U.camPos.xyz;
  let tile = vec2u(u32(frag.x) / TILE, u32(frag.y) / TILE);
  let mask = tileMasksRO[tile.y * u32(U.res.z) + tile.x];
  let debug = U.res.w;

  var t = 0.05;
  var id = -3.0;
  var steps = 0;
  let tmax = 70.0;
  for (var i = 0; i < 160; i++) {
    steps = i;
    let h = map(ro + rd * t, mask);
    if (abs(h.x) < 0.0007 * t) { id = h.y; break; }
    t += h.x;
    if (t > tmax) { break; }
  }
  var col: vec3f;
  if (debug > 0.5 && debug < 1.5) {
    return vec4f(heat(f32(steps) / 160.0), 1.0);
  }
  if (debug > 3.5) {
    return vec4f(vec3f(f32(countOneBits(mask)) / 8.0, 0.2, 0.4), 1.0);
  }
  if (t > tmax || id < -2.5) {
    col = sky(rd);
  } else {
    let p = ro + rd * t;
    if (debug > 1.5 && debug < 2.5) { return vec4f(select(terrainNormal(p), calcNormal(p, mask), id >= 0.0) * 0.5 + 0.5, 1.0); }
    if (debug > 2.5 && debug < 3.5) {
      let gid = id + 1.0;
      return vec4f(fract(vec3f(gid * 0.37, gid * 0.61, gid * 0.83)) * select(1.0, 0.25, id < 0.0), 1.0);
    }
    col = shade(p, rd, id, mask);
    col = mix(col, sky(rd) * 0.95, 1.0 - exp(-max(t - 12.0, 0.0) * 0.035));
  }
  // water surface
  if (U.sun.w < 0.5 && rd.y < 0.0 && ro.y > WATER) {
    let tw = (WATER - ro.y) / rd.y;
    if (tw < t || t > tmax) {
      let pw = ro + rd * tw;
      if (terrainHeight(pw.x, pw.z) < WATER) {
        let depth = select(t - tw, 5.0, t > tmax);
        let absorb = exp(-depth * vec3f(1.2, 0.55, 0.35));
        let wn = normalize(vec3f(noise3(vec3f(pw.xz * 2.0, U.camRight.w)) - 0.5, 6.0, noise3(vec3f(pw.zx * 2.0, U.camRight.w * 0.8)) - 0.5));
        let fres = 0.04 + 0.96 * pow(1.0 - max(dot(wn, -rd), 0.0), 5.0);
        col = mix(col * absorb + vec3f(0.02, 0.08, 0.1) * (1.0 - absorb), sky(reflect(rd, wn)), fres);
        col += vec3f(1.0, 0.9, 0.7) * pow(max(dot(reflect(rd, wn), U.sun.xyz), 0.0), 200.0) * 2.0;
      }
    }
  }
  // tone map + vignette
  col = col / (1.0 + col * 0.25);
  col = pow(col, vec3f(0.9));
  let v = vin.uv - 0.5;
  col *= 1.0 - dot(v, v) * 0.5;
  return vec4f(col, 1.0);
}
