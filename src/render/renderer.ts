// WebGPU renderer: uploads primitive groups, runs the tile-culling compute pass and the raymarch pass.
import shaderSrc from './shaders/scene.wgsl?raw';
import { groupBounds, packPrim, PRIM_FLOATS, type PrimGroup } from '../sdf/prim';
import type { OrbitCamera } from './camera';
import { norm, type V3 } from '../core/math';

export const MAX_GROUPS = 32;
export const MAX_PRIMS = 4096;
const TILE = 16;

export interface RenderOptions {
  debug: number; // 0 shaded, 1 steps, 2 normals, 3 ids, 4 tile mask
  studio: boolean; // flat neutral floor, no water
  time: number;
}

export class Renderer {
  private pipeline!: GPURenderPipeline;
  private cullPipeline!: GPUComputePipeline;
  private uniformBuf!: GPUBuffer;
  private primBuf!: GPUBuffer;
  private groupBuf!: GPUBuffer;
  private tileBuf!: GPUBuffer;
  private tileCap = 0;
  private renderBG!: GPUBindGroup;
  private cullBG!: GPUBindGroup;
  private primData = new Float32Array(MAX_PRIMS * PRIM_FLOATS);
  private groupData = new Float32Array(MAX_GROUPS * 12);
  private format: GPUTextureFormat;
  static onLost?: (msg: string) => void;
  sun: V3 = norm([0.55, 0.75, 0.35]);
  lastPrimCount = 0;

  private offscreen: GPUTexture | null = null;

  private constructor(private device: GPUDevice, private ctx: GPUCanvasContext | null, readonly canvas: HTMLCanvasElement) {
    this.format = ctx ? navigator.gpu.getPreferredCanvasFormat() : 'rgba8unorm';
    ctx?.configure({ device, format: this.format, alphaMode: 'opaque' });
  }

  /** `offscreen` renders into a texture that can be read back (used by screenshot tests). */
  static async create(canvas: HTMLCanvasElement, offscreen = false): Promise<Renderer> {
    if (!navigator.gpu) throw new Error('WebGPU wird von diesem Browser nicht unterstützt.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('Kein WebGPU-Adapter gefunden.');
    const device = await adapter.requestDevice();
    device.lost.then((info) => {
      console.error('GPU device lost', info.message);
      if (info.reason !== 'destroyed' || !offscreen) Renderer.onLost?.(info.message);
    });
    const ctx = offscreen ? null : canvas.getContext('webgpu');
    if (!ctx && !offscreen) throw new Error('WebGPU-Canvas konnte nicht erstellt werden.');
    const r = new Renderer(device, ctx, canvas);
    await r.init();
    return r;
  }

  private async init() {
    const d = this.device;
    const module = d.createShaderModule({ code: shaderSrc });
    const info = await module.getCompilationInfo();
    for (const m of info.messages) console[m.type === 'error' ? 'error' : 'warn'](`WGSL ${m.lineNum}:${m.linePos} ${m.message}`);
    this.pipeline = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.cullPipeline = d.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'cull' } });
    this.uniformBuf = d.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.primBuf = d.createBuffer({ size: this.primData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.groupBuf = d.createBuffer({ size: this.groupData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  }

  private ensureTiles(count: number) {
    if (count <= this.tileCap) return;
    this.tileBuf?.destroy();
    this.tileCap = Math.ceil(count * 1.5);
    this.tileBuf = this.device.createBuffer({ size: this.tileCap * 4, usage: GPUBufferUsage.STORAGE });
    const d = this.device;
    this.renderBG = d.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: { buffer: this.primBuf } },
        { binding: 2, resource: { buffer: this.groupBuf } },
        { binding: 4, resource: { buffer: this.tileBuf } },
      ],
    });
    this.cullBG = d.createBindGroup({
      layout: this.cullPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 2, resource: { buffer: this.groupBuf } },
        { binding: 3, resource: { buffer: this.tileBuf } },
      ],
    });
  }

  render(groups: PrimGroup[], cam: OrbitCamera, opt: RenderOptions) {
    const w = this.canvas.width, h = this.canvas.height;
    const tilesX = Math.ceil(w / TILE), tilesY = Math.ceil(h / TILE);
    this.ensureTiles(tilesX * tilesY);

    let primCount = 0;
    const gs = groups.slice(0, MAX_GROUPS);
    gs.forEach((g, gi) => {
      const start = primCount;
      for (const p of g.prims) {
        if (primCount >= MAX_PRIMS) break;
        packPrim(p, this.primData, primCount * PRIM_FLOATS);
        primCount++;
      }
      const b = groupBounds(g.prims);
      const o = gi * 12;
      this.groupData.set([b.c[0], b.c[1], b.c[2], b.r, g.origin[0], g.origin[1], g.origin[2], g.yaw, start, primCount - start, g.highlight, 0], o);
    });
    this.lastPrimCount = primCount;
    const q = this.device.queue;
    if (primCount) q.writeBuffer(this.primBuf, 0, this.primData, 0, primCount * PRIM_FLOATS);
    if (gs.length) q.writeBuffer(this.groupBuf, 0, this.groupData, 0, gs.length * 12);

    const { pos, fwd, right, up } = cam.basis();
    const u = new Float32Array([
      pos[0], pos[1], pos[2], Math.tan(cam.fovY / 2),
      fwd[0], fwd[1], fwd[2], w / h,
      right[0], right[1], right[2], opt.time,
      up[0], up[1], up[2], gs.length,
      w, h, tilesX, opt.debug,
      this.sun[0], this.sun[1], this.sun[2], opt.studio ? 1 : 0,
    ]);
    q.writeBuffer(this.uniformBuf, 0, u);

    const enc = this.device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(this.cullPipeline);
    cp.setBindGroup(0, this.cullBG);
    cp.dispatchWorkgroups(Math.ceil(tilesX / 8), Math.ceil(tilesY / 8));
    cp.end();
    const rp = enc.beginRenderPass({
      colorAttachments: [{ view: this.target(w, h).createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    rp.setPipeline(this.pipeline);
    rp.setBindGroup(0, this.renderBG);
    rp.draw(3);
    rp.end();
    q.submit([enc.finish()]);
  }

  private target(w: number, h: number): GPUTexture {
    if (this.ctx) return this.ctx.getCurrentTexture();
    if (!this.offscreen || this.offscreen.width !== w || this.offscreen.height !== h) {
      this.offscreen?.destroy();
      this.offscreen = this.device.createTexture({
        size: [w, h],
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
    }
    return this.offscreen;
  }

  /** Read back the offscreen frame as RGBA pixels. */
  async capture(): Promise<ImageData> {
    const tex = this.offscreen;
    if (!tex) throw new Error('capture() needs an offscreen renderer');
    const w = tex.width, h = tex.height;
    const bpr = Math.ceil((w * 4) / 256) * 256;
    const buf = this.device.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const out = new ImageData(w, h);
    for (let y = 0; y < h; y++) out.data.set(src.subarray(y * bpr, y * bpr + w * 4), y * w * 4);
    buf.destroy();
    return out;
  }

  /** Resolves when the GPU has finished all submitted work (used for frame timing). */
  done() {
    return this.device.queue.onSubmittedWorkDone();
  }
}
