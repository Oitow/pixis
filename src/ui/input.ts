// Keyboard, mouse and touch input. Left screen half = movement stick, right half = camera.
import type { OrbitCamera } from '../render/camera';

export class Input {
  keys = new Set<string>();
  stick: [number, number] = [0, 0];
  buttons = { jump: false, bite: false, glow: false };
  private stickId: number | null = null;
  private stickOrigin: [number, number] = [0, 0];
  private camId: number | null = null;
  private last: [number, number] = [0, 0];
  private knob: HTMLElement;
  private base: HTMLElement;
  onTap?: (x: number, y: number) => void;

  constructor(el: HTMLElement, cam: OrbitCamera, useStick: boolean) {
    this.base = document.getElementById('stick')!;
    this.knob = document.getElementById('knob')!;
    addEventListener('keydown', (e) => this.keys.add(e.code));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('wheel', (e) => {
      cam.distance = Math.min(30, Math.max(1.5, cam.distance * Math.exp(e.deltaY * 0.001)));
      e.preventDefault();
    }, { passive: false });
    let downAt: [number, number, number] = [0, 0, 0];
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      downAt = [e.clientX, e.clientY, performance.now()];
      if (useStick && e.pointerType === 'touch' && e.clientX < innerWidth / 2 && this.stickId === null) {
        this.stickId = e.pointerId;
        this.stickOrigin = [e.clientX, e.clientY];
        this.base.style.display = 'block';
        this.base.style.left = `${e.clientX - 50}px`;
        this.base.style.top = `${e.clientY - 50}px`;
        this.knob.style.transform = 'translate(0px,0px)';
      } else if (this.camId === null) {
        this.camId = e.pointerId;
        this.last = [e.clientX, e.clientY];
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) {
        let dx = e.clientX - this.stickOrigin[0], dy = e.clientY - this.stickOrigin[1];
        const l = Math.hypot(dx, dy);
        if (l > 45) (dx *= 45 / l), (dy *= 45 / l);
        this.knob.style.transform = `translate(${dx}px,${dy}px)`;
        this.stick = [dx / 45, -dy / 45];
      } else if (e.pointerId === this.camId) {
        cam.yaw += (e.clientX - this.last[0]) * 0.008;
        cam.pitch = Math.min(1.45, Math.max(0.05, cam.pitch + (e.clientY - this.last[1]) * 0.006));
        this.last = [e.clientX, e.clientY];
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) {
        this.stickId = null;
        this.stick = [0, 0];
        this.base.style.display = 'none';
      }
      if (e.pointerId === this.camId) this.camId = null;
      if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 8 && performance.now() - downAt[2] < 350) this.onTap?.(e.clientX, e.clientY);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    for (const [id, key] of [['btn-jump', 'jump'], ['btn-bite', 'bite'], ['btn-glow', 'glow']] as const) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.addEventListener('pointerdown', (e) => { this.buttons[key] = true; e.stopPropagation(); });
      b.addEventListener('pointerup', () => (this.buttons[key] = false));
      b.addEventListener('pointerleave', () => (this.buttons[key] = false));
    }
  }

  /** Movement vector in screen space (x right, y forward). */
  move(): [number, number] {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (!x && !y) [x, y] = this.stick;
    const l = Math.hypot(x, y);
    return l > 1 ? [x / l, y / l] : [x, y];
  }
  get jump() { return this.keys.has('Space') || this.buttons.jump; }
  get bite() { return this.keys.has('KeyE') || this.keys.has('KeyF') || this.buttons.bite; }
  get glow() { return this.keys.has('KeyG') || this.buttons.glow; }
}
