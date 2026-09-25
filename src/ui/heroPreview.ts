// Vista previa 3D del héroe elegido (lobby).
import * as THREE from 'three';
import { TEAM_COLORS } from '../core/constants';
import type { CharFrame } from '../core/snapshot';
import { F_GROUNDED } from '../core/snapshot';
import type { HeroId } from '../core/types';
import { BeanView } from '../render/beanView';

export class HeroPreview {
  renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private bean: BeanView | null = null;
  private raf = 0;
  private t = 0;
  private stage = 0;
  private stageT = 0;
  private hero: HeroId | null = null;
  private hat = 'none';
  private team = 0;

  constructor(private el: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xfff1e0, 0x4a3860, 1.8));
    const d = new THREE.DirectionalLight(0xffffff, 2.2);
    d.position.set(3, 5, 4);
    this.scene.add(d);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
    disc.rotation.x = -Math.PI / 2;
    this.scene.add(disc);
    this.camera.position.set(0, 1.6, 4.4);
    this.camera.lookAt(0, 0.8, 0);
    const loop = () => { this.raf = requestAnimationFrame(loop); this.render(); };
    this.raf = requestAnimationFrame(loop);
  }

  /** Mueve el canvas a otro contenedor (el lobby se re-renderiza). */
  mount(el: HTMLElement) {
    this.el = el;
    el.appendChild(this.renderer.domElement);
  }

  set(hero: HeroId, team: number, hat = 'none') {
    if (hero === this.hero && team === this.team && hat === this.hat) return;
    this.hat = hat;
    this.hero = hero;
    this.team = team;
    if (this.bean) this.bean.dispose();
    this.bean = new BeanView(hero, team, TEAM_COLORS[team % TEAM_COLORS.length], '', false, hat);
    this.scene.add(this.bean.root);
    this.stage = 0;
    this.stageT = 0;
  }

  private render() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    const c = this.renderer.domElement;
    if (c.width !== Math.floor(w * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.t += 1 / 60;
    this.stageT += 1 / 60;
    if (this.stageT > 1.6) { this.stageT = 0; this.stage = (this.stage + 1) % 4; }
    if (this.bean) {
      const f: CharFrame = {
        id: 1, x: 0, y: 0, z: 0, f: Math.sin(this.t * 0.8) * 0.9, vx: 0, vy: 0, vz: 0, fl: F_GROUNDED, heat: 0, st: this.stage, lv: 1,
        ac: '', ap: 0, ch: 0, sh: 0, k: 0, d: 0, a: 0, lives: 0, rt: 0, cs: 0,
      };
      this.bean.update(f, 1 / 60, -999, this.t);
      this.bean.label.style.display = 'none';
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.bean?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
