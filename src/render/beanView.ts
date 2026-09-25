// El "bean": un único rig para todos (GDD §8). Cambia la piel según la familia y se rompe por etapas.
import * as THREE from 'three';
import { STAGE_NAMES } from '../core/constants';
import { HEROES } from '../core/heroes';
import { Rng } from '../core/rng';
import { assetModel } from '../assets/registry';
import { F_ARMOR, F_CHARGING, F_DASH, F_DEAD, F_GROUNDED, F_INVULN, F_KBIMM, F_REPAIRING, F_SHIELD, F_STUN, F_TUMBLE, F_ULTREADY, type CharFrame } from '../core/snapshot';
import { FAMILY_COLORS, FAMILY_CRACK, type Family, type HeroId } from '../core/types';
import { beanSkin, softDisc, toonGradient } from './textures';

const OUTLINE_BASE = new THREE.Color(0x1a1420);
const STAGE_OUTLINE = [0x1a1420, 0x2a1a10, 0xff7a1a, 0xff1a2a];
/** Color del destello al recibir un golpe (tiñe el cuerpo; nunca blanco). */
const HIT_TINT = new THREE.Color(1, 0.42, 0.3);
const WHITE = new THREE.Color(1, 1, 1);
const DEG = Math.PI / 180;

/** Animaciones de brazos que dispara la vista (golpes, empujón, disparos). */
export type ArmMove = 'hook' | 'wide' | 'shove' | 'slam' | 'throw';
const ARM_DUR: Record<ArmMove, number> = { hook: 0.2, wide: 0.26, shove: 0.2, slam: 0.24, throw: 0.16 };

/** Posición local de una mano sobre un arco alrededor del cuerpo. a: 0 = al frente, + = lado +X (mano "R"). */
function onArc(out: THREE.Vector3, a: number, r: number, y: number) {
  return out.set(Math.sin(a) * r, y, Math.cos(a) * r);
}
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

/** Sombreros cosméticos (se ganan subiendo el nivel de cuenta). Si hay GLB (hat.<id>), se usa ese. */
export function buildHat(id: string): THREE.Object3D | null {
  if (id !== 'none') { const file = assetModel(`hat.${id}`); if (file) return file; }
  return buildHatProcedural(id);
}

function buildHatProcedural(id: string): THREE.Object3D | null {
  const tg = toonGradient();
  const g = new THREE.Group();
  const toon = (c: number, e = 0) => new THREE.MeshToonMaterial({ color: c, gradientMap: tg, emissive: c, emissiveIntensity: e });
  switch (id) {
    case 'party': {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 16), toon(0xff4fa3, 0.25));
      cone.position.y = 0.21;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), toon(0xffe14a, 0.6));
      pom.position.y = 0.44;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 16), toon(0x4fd1ff, 0.4));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.12;
      g.add(cone, pom, band);
      g.rotation.z = 0.2;
      break;
    }
    case 'horns':
      for (const sx of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 10), toon(0xd62a2a, 0.35));
        h.position.set(sx * 0.2, 0.08, 0);
        h.rotation.z = -sx * 0.45;
        g.add(h);
      }
      break;
    case 'tophat': {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 18), toon(0x1c1c22));
      top.position.y = 0.2;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 20), toon(0x1c1c22));
      brim.position.y = 0.03;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.07, 18), toon(0xc9243a, 0.3));
      band.position.y = 0.08;
      g.add(top, brim, band);
      break;
    }
    case 'halo': {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23f).multiplyScalar(1.3), toneMapped: false }));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.35;
      halo.name = 'spin';
      g.add(halo);
      break;
    }
    case 'propeller': {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x3a7bff));
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), toon(0xffe14a));
      stick.position.y = 0.26;
      const blades = new THREE.Group();
      for (const [c, r] of [[0xff4f4f, 0], [0x4fff7a, Math.PI]] as [number, number][]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.07), toon(c, 0.3));
        b.position.x = Math.cos(r) * 0.17;
        blades.add(b);
      }
      blades.position.y = 0.33;
      blades.name = 'spin';
      g.add(cap, stick, blades);
      break;
    }
    case 'viking': {
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x9aa3ad));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 20), toon(0xc99a3a, 0.3));
      rim.rotation.x = Math.PI / 2;
      g.add(helm, rim);
      for (const sx of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 10), toon(0xf4ecd8));
        h.position.set(sx * 0.3, 0.14, 0);
        h.rotation.z = -sx * 1.0;
        g.add(h);
      }
      break;
    }
    case 'crown': {
      const gold = new THREE.MeshToonMaterial({ color: 0xffc629, gradientMap: tg, emissive: 0xffa800, emissiveIntensity: 0.9 });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.14, 16, 1, true), gold);
      ring.position.y = 0.07;
      g.add(ring);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 6), gold);
        sp.position.set(Math.cos(a) * 0.2, 0.2, Math.sin(a) * 0.2);
        g.add(sp);
      }
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a6a).multiplyScalar(1.3), toneMapped: false }));
      gem.position.set(0, 0.08, 0.21);
      g.add(gem);
      break;
    }
    default:
      return null;
  }
  return g;
}

function bodyGeometry(family: Family): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(0.42, 0.5, 6, 14);
  if (family === 'stone') {
    // Rugosidad: desplazar vértices con ruido determinista.
    const r = new Rng(5);
    const p = g.attributes.position as THREE.BufferAttribute;
    const seen = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      let k = seen.get(key);
      if (k === undefined) { k = r.range(0.95, 1.07); seen.set(key, k); }
      p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
    }
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    flat.translate(0, 0.72, 0);
    return flat;
  }
  g.translate(0, 0.72, 0);
  return g;
}

export class BeanView {
  root = new THREE.Group();
  private tilt = new THREE.Group(); // lean / tumble
  private body: THREE.Mesh;
  private bodyMat: THREE.MeshToonMaterial;
  private outline: THREE.Mesh;
  private outlineMat: THREE.MeshBasicMaterial;
  private hat: THREE.Object3D | null = null;
  private aura: THREE.Mesh;
  private eyes: THREE.Group;
  private handL: THREE.Mesh;
  private handR: THREE.Mesh;
  private footL: THREE.Mesh;
  private footR: THREE.Mesh;
  private shield: THREE.Mesh;
  private armor: THREE.Mesh;
  private stars: THREE.Group;
  private chargeCone: THREE.Mesh;
  private ring: THREE.Mesh;
  private shadow: THREE.Mesh;
  private extras = new THREE.Group();
  private stage = -1;
  private flash = 0;
  private squash = 0;
  private walk = 0;
  private blinkT = 2;
  private spin = 0;
  private arm: { move: ArmMove; hand: number; t: number; dur: number } | null = null;
  private nextHand = 1;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private chargeColor: THREE.Color;
  readonly family: Family;
  readonly hero: HeroId;
  label: HTMLDivElement;
  private labelBar: HTMLDivElement;
  private labelName: HTMLDivElement;
  lastFrame: CharFrame | null = null;
  /** Fin de partida: festeja (ganó), llora (perdió) o se encoge de hombros (empate). null = jugando. */
  emote: 'win' | 'lose' | 'draw' | null = null;

  constructor(hero: HeroId, public team: number, teamColor: number, name: string, isLocal: boolean, hat = 'none') {
    const def = HEROES[hero];
    this.hero = hero;
    this.family = def.family;
    this.chargeColor = new THREE.Color(teamColor);
    const base = FAMILY_COLORS[def.family];
    const skin = beanSkin(def.family, 0, base);
    this.bodyMat = new THREE.MeshToonMaterial({
      map: skin.map, gradientMap: toonGradient(), emissive: new THREE.Color(FAMILY_CRACK[def.family]), emissiveMap: skin.glow, emissiveIntensity: 0,
      transparent: def.family === 'goo' || def.family === 'crystal', opacity: def.family === 'goo' ? 0.88 : def.family === 'crystal' ? 0.92 : 1,
    });
    const geo = bodyGeometry(def.family);
    this.body = new THREE.Mesh(geo, this.bodyMat);
    this.body.castShadow = true;
    this.outlineMat = new THREE.MeshBasicMaterial({ color: OUTLINE_BASE, side: THREE.BackSide, toneMapped: false });
    this.outline = new THREE.Mesh(geo, this.outlineMat);
    this.outline.scale.setScalar(1.07);
    this.outline.position.y = -0.05;

    // Ojos
    this.eyes = new THREE.Group();
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), white);
      e.scale.set(1, 1.25, 0.6);
      e.position.set(sx * 0.15, 0, 0);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), black);
      p.position.set(sx * 0.15, -0.01, 0.055);
      this.eyes.add(e, p);
    }
    this.eyes.position.set(0, 1.02, 0.36);

    // Manos (guantes con el color del héroe: se leen los golpes) y pies
    const limbMat = new THREE.MeshToonMaterial({ color: new THREE.Color(base).multiplyScalar(0.85), gradientMap: toonGradient() });
    const gloveMat = new THREE.MeshToonMaterial({ color: new THREE.Color(def.color).lerp(new THREE.Color(base), 0.25), gradientMap: toonGradient() });
    const handG = new THREE.SphereGeometry(0.15, 12, 10);
    handG.scale(1, 0.9, 1.1);
    this.handL = new THREE.Mesh(handG, gloveMat);
    this.handR = new THREE.Mesh(handG, gloveMat);
    this.handL.castShadow = this.handR.castShadow = true;
    const footG = new THREE.SphereGeometry(0.14, 10, 8);
    footG.scale(1, 0.6, 1.3);
    this.footL = new THREE.Mesh(footG, limbMat);
    this.footR = new THREE.Mesh(footG, limbMat);

    const extras = assetModel(`hero.${hero}`);
    if (extras) this.extras.add(extras);
    else this.buildExtras(hero, base);
    if (hero === 'remache') this.handR.add(buildWrench());

    // Escudo / piel de roca / aturdimiento
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x9ff7ff, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.shield.position.y = 0.75;
    this.shield.visible = false;
    this.armor = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.35, depthWrite: false }));
    this.armor.scale.setScalar(1.14);
    this.armor.position.y = -0.1;
    this.armor.visible = false;
    this.stars = new THREE.Group();
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe14a });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), starMat);
      s.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.35, 0, Math.sin((i / 3) * Math.PI * 2) * 0.35);
      this.stars.add(s);
    }
    this.stars.position.y = 1.65;
    this.stars.visible = false;

    // Cono de carga del empujón (telegrafía: el otro lo ve venir).
    this.chargeCone = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20, Math.PI / 2 - 0.83, 1.66),
      new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.chargeCone.rotation.x = -Math.PI / 2;
    this.chargeCone.position.y = 0.06;
    this.chargeCone.visible = false;

    // Anillo de equipo y sombra
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, isLocal ? 0.72 : 0.66, 32),
      new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: isLocal ? 0.95 : 0.75, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({ map: softDisc(), color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;

    this.tilt.add(this.body, this.outline, this.eyes, this.handL, this.handR, this.footL, this.footR, this.extras, this.armor, this.shield);
    const hatObj = buildHat(hat);
    if (hatObj) {
      hatObj.position.y = hero === 'remache' ? 1.44 : hero === 'prisma' ? 1.36 : 1.3;
      this.hat = hatObj;
      this.tilt.add(hatObj);
    }
    // Aura de ulti lista: anillo brillante en el piso con el color del equipo.
    this.aura = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.95, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(teamColor).multiplyScalar(1.3), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }),
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.visible = false;
    this.root.add(this.tilt, this.stars);

    // Etiqueta HTML
    this.label = document.createElement('div');
    this.label.className = 'nametag' + (isLocal ? ' me' : '');
    this.labelName = document.createElement('div');
    this.labelName.className = 'nt-name';
    this.labelName.textContent = name;
    this.labelName.style.color = '#' + teamColor.toString(16).padStart(6, '0');
    this.labelBar = document.createElement('div');
    this.labelBar.className = 'nt-bar';
    for (let i = 0; i < 4; i++) this.labelBar.appendChild(document.createElement('i'));
    this.label.append(this.labelName, this.labelBar);
  }

  /** Objetos que viven en el suelo (no se inclinan con el personaje). */
  groundObjects() { return [this.ring, this.shadow, this.chargeCone, this.aura]; }

  private buildExtras(hero: HeroId, base: number) {
    const g = this.extras;
    const tg = toonGradient();
    if (hero === 'canto') {
      const m = new THREE.MeshToonMaterial({ color: new THREE.Color(base).multiplyScalar(0.8), gradientMap: tg });
      for (const [x, y, z, s] of [[-0.36, 1.05, -0.05, 0.2], [0.34, 1.1, -0.1, 0.17], [0.05, 1.33, -0.18, 0.16]]) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s), m);
        r.position.set(x, y, z);
        r.castShadow = true;
        g.add(r);
      }
      // Cejas gruesas
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.08), new THREE.MeshBasicMaterial({ color: 0x2a2320 }));
      brow.position.set(0, 1.17, 0.36);
      brow.rotation.x = -0.2;
      g.add(brow);
    } else if (hero === 'prisma') {
      const m = new THREE.MeshToonMaterial({ color: 0xbff6ff, emissive: 0x3fd8ff, emissiveIntensity: 0.6, gradientMap: tg, transparent: true, opacity: 0.9 });
      for (const [x, z, h, rz] of [[0, -0.05, 0.55, 0], [-0.18, 0, 0.38, 0.4], [0.2, -0.02, 0.42, -0.35], [0.05, -0.2, 0.3, 0.1]]) {
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), m);
        c.scale.set(0.8, h / 0.12 / 2, 0.8);
        c.position.set(x, 1.3 + h * 0.3, z);
        c.rotation.z = rz;
        g.add(c);
      }
    } else if (hero === 'gloop') {
      const m = new THREE.MeshToonMaterial({ color: new THREE.Color(base).multiplyScalar(1.05), gradientMap: tg, transparent: true, opacity: 0.85 });
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), m);
      drop.scale.set(1, 1.3, 1);
      drop.position.set(0.05, 1.3, -0.05);
      g.add(drop);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 10), m);
      tip.position.set(0.05, 1.5, -0.05);
      g.add(tip);
      for (let i = 0; i < 5; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.035 + i * 0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd8ffc0, transparent: true, opacity: 0.6 }));
        b.position.set(Math.sin(i * 2.1) * 0.22, 0.45 + i * 0.12, Math.cos(i * 2.1) * 0.22);
        g.add(b);
      }
    } else {
      // Remache: casco de obra y bulones
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xffc94a, gradientMap: tg }));
      helmet.position.y = 1.12;
      helmet.scale.set(1.02, 0.75, 1.02);
      helmet.castShadow = true;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.04, 20), helmet.material);
      brim.position.set(0, 1.13, 0.06);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10), new THREE.MeshBasicMaterial({ color: 0xfff6c0 }));
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(0, 1.28, 0.4);
      g.add(helmet, brim, lamp);
      const boltM = new THREE.MeshToonMaterial({ color: 0x5b6570, gradientMap: tg });
      for (const sx of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 6), boltM);
        b.rotation.z = Math.PI / 2;
        b.position.set(sx * 0.45, 0.72, 0);
        g.add(b);
      }
    }
  }

  setStage(stage: number) {
    if (stage === this.stage) return;
    this.stage = stage;
    const skin = beanSkin(this.family, stage, FAMILY_COLORS[this.family]);
    this.bodyMat.map = skin.map;
    this.bodyMat.emissiveMap = skin.glow;
    this.bodyMat.emissiveIntensity = [0, 0.35, 0.8, 1.3][stage] ?? 0;
    this.bodyMat.needsUpdate = true;
    const pips = this.labelBar.children;
    for (let i = 0; i < pips.length; i++) (pips[i] as HTMLElement).className = i <= stage ? 'on s' + stage : '';
    this.labelBar.title = STAGE_NAMES[stage];
  }

  hitFlash(power: number) {
    this.flash = 0.12;
    this.squash = Math.min(0.35, 0.1 + power * 0.01);
  }

  /** Dispara una animación de brazos. hook alterna manos como un boxeador (derecha, izquierda...). */
  armMove(move: ArmMove) {
    let hand = 0;
    if (move === 'hook' || move === 'throw') { hand = this.nextHand; this.nextHand = -this.nextHand; }
    else if (move === 'wide') hand = 1;
    this.arm = { move, hand, t: 0, dur: ARM_DUR[move] };
  }

  /** Mano que está golpeando ahora (para la estela): +1 = derecha del modelo (+X), -1 = izquierda, 0 = ambas. */
  get lastHand() { return -this.nextHand; }

  /** Aplica la animación activa sobre las posiciones de reposo de las manos. */
  private applyArm(dt: number) {
    const a = this.arm;
    if (!a) return;
    a.t += dt;
    const u = Math.min(1, a.t / a.dur);
    // 0..0.55: sale el golpe siguiendo el arco; 0.55..1: vuelve a la guardia.
    const out = u < 0.55 ? easeOut(u / 0.55) : 1;
    const back = u < 0.55 ? 0 : (u - 0.55) / 0.45;
    const blend = (hand: THREE.Mesh, target: THREE.Vector3, scale: number) => {
      hand.position.lerp(target, 1 - back);
      hand.scale.setScalar(1 + (scale - 1) * (1 - back));
    };
    const P = this.tmp, Q = this.tmp2;
    switch (a.move) {
      case 'hook': {
        // Gancho: el puño viaja desde el costado hacia el frente describiendo un arco.
        const s = a.hand;
        const ang = s * (85 - 100 * out) * DEG;
        onArc(P, ang, 0.55 + 0.7 * out, 0.68 + 0.14 * out);
        blend(s > 0 ? this.handR : this.handL, P, 1 + 0.6 * out);
        break;
      }
      case 'wide': {
        // Llavazo: barrido amplio de derecha a izquierda con el brazo extendido.
        const ang = (105 - 190 * out) * DEG;
        onArc(P, ang, 0.85, 0.8);
        blend(this.handR, P, 1.2);
        break;
      }
      case 'throw': {
        // Tiro: estocada recta hacia adelante.
        const s = a.hand;
        P.set(s * (0.38 - 0.24 * out), 0.75 + 0.08 * out, 0.2 + 0.75 * out);
        blend(s > 0 ? this.handR : this.handL, P, 1 + 0.25 * out);
        break;
      }
      case 'shove':
        // Empujón: las dos palmas al frente.
        P.set(0.26, 0.78, 0.25 + 0.8 * out);
        Q.set(-0.26, 0.78, 0.25 + 0.8 * out);
        blend(this.handR, P, 1.3);
        blend(this.handL, Q, 1.3);
        break;
      case 'slam':
        // Martillazo: de arriba de la cabeza al piso, adelante.
        P.set(0.22, 1.35 - 1.0 * out, 0.1 + 0.8 * out);
        Q.set(-0.22, 1.35 - 1.0 * out, 0.1 + 0.8 * out);
        blend(this.handR, P, 1.35);
        blend(this.handL, Q, 1.35);
        break;
    }
    if (u >= 1) { this.arm = null; this.handL.scale.setScalar(1); this.handR.scale.setScalar(1); }
  }

  update(f: CharFrame, dt: number, groundY: number, time: number) {
    this.lastFrame = f;
    const dead = (f.fl & F_DEAD) !== 0;
    this.root.visible = !dead;
    for (const o of this.groundObjects()) o.visible = !dead;
    this.label.style.display = dead ? 'none' : '';
    if (dead) return;
    this.setStage(f.st);

    this.root.position.set(f.x, f.y, f.z);
    const grounded = (f.fl & F_GROUNDED) !== 0;
    const tumble = (f.fl & F_TUMBLE) !== 0;
    const speed = Math.hypot(f.vx, f.vz);

    // Rotación hacia donde mira
    this.root.rotation.y = f.f;

    // Caminar
    if (grounded && speed > 0.5) this.walk += dt * speed * 2.2;
    const step = grounded && speed > 0.5 ? Math.sin(this.walk) : 0;
    this.footL.position.set(-0.18, 0.08 + Math.max(0, step) * 0.12, step * 0.18);
    this.footR.position.set(0.18, 0.08 + Math.max(0, -step) * 0.12, -step * 0.18);
    const bob = grounded ? Math.abs(Math.sin(this.walk)) * 0.05 : 0;

    // Inclinación / tumble
    if (tumble) {
      this.spin += dt * Math.min(18, speed * 0.9 + 4);
      const lx = f.vx, lz = f.vz;
      // girar alrededor del eje perpendicular a la velocidad (en espacio local)
      const yaw = f.f;
      const localX = lx * Math.cos(yaw) - lz * Math.sin(yaw);
      const localZ = lx * Math.sin(yaw) + lz * Math.cos(yaw);
      const l = Math.hypot(localX, localZ) || 1;
      this.tilt.rotation.set((localZ / l) * this.spin, 0, (-localX / l) * this.spin);
    } else if (f.ac === 'roll') {
      this.spin += dt * 16;
      this.tilt.rotation.set(this.spin, 0, 0);
    } else if (f.fl & F_DASH) {
      // Dash: se inclina fuerte hacia donde va.
      this.spin = 0;
      const yaw = f.f;
      const fwd = f.vx * Math.sin(yaw) + f.vz * Math.cos(yaw);
      const side = f.vx * Math.cos(yaw) - f.vz * Math.sin(yaw);
      const l = Math.hypot(fwd, side) || 1;
      this.tilt.rotation.set((fwd / l) * 0.55, 0, (-side / l) * 0.55);
    } else {
      this.spin = 0;
      const yaw = f.f;
      const fwd = f.vx * Math.sin(yaw) + f.vz * Math.cos(yaw);
      const side = f.vx * Math.cos(yaw) - f.vz * Math.sin(yaw);
      this.tilt.rotation.set(THREE.MathUtils.clamp(fwd * 0.025, -0.25, 0.25), 0, THREE.MathUtils.clamp(-side * 0.025, -0.2, 0.2));
    }

    // Squash & stretch
    this.squash = Math.max(0, this.squash - dt * 1.5);
    let sy = 1 - this.squash + (grounded ? 0 : Math.min(0.12, Math.abs(f.vy) * 0.008));
    let sxz = 1 + this.squash * 0.6;
    if (f.ac === 'roll') { sy = 0.8; sxz = 1.1; }
    if (this.family === 'goo') {
      const w = Math.sin(time * 6 + f.id) * 0.03;
      sy += w;
      sxz -= w * 0.5;
    }
    this.tilt.scale.set(sxz, sy, sxz);
    this.tilt.position.y = bob;

    // Manos según acción
    const charging = (f.fl & F_CHARGING) !== 0;
    const repairing = (f.fl & F_REPAIRING) !== 0;
    let hx = 0.5, hy = 0.62, hz = 0.1;
    if (charging) { hx = 0.3; hy = 0.75; hz = -0.15 - f.ch * 0.2; }
    else if (f.ac === 'wind' || f.ac === 'slam') { hx = 0.35; hy = 1.35; hz = 0.1; }
    else if (f.ac === 'aim') { hx = 0.15; hy = 0.85; hz = 0.55; }
    else if (f.ac === 'dash') { hx = 0.3; hy = 0.8; hz = 0.55; }
    else if (repairing) { hx = 0.3; hy = 0.6 + Math.sin(time * 20) * 0.08; hz = 0.4; }
    else if (grounded) { hz = 0.1 - step * 0.15; }
    this.handL.position.set(-hx, hy, hz);
    this.handR.position.set(hx, hy, grounded && !charging && !f.ac ? 0.1 + step * 0.15 : hz);
    if (f.fl & F_DASH) { this.handL.position.set(-0.4, 0.7, -0.35); this.handR.position.set(0.4, 0.7, -0.35); }
    this.applyArm(dt);
    this.chargeCone.visible = charging;
    if (charging) {
      const r = 1.7 + 0.8 * f.ch;
      this.chargeCone.scale.setScalar(r);
      this.chargeCone.position.set(f.x, groundY + 0.07, f.z);
      this.chargeCone.rotation.z = f.f + Math.PI;
      const m = this.chargeCone.material as THREE.MeshBasicMaterial;
      m.opacity = 0.15 + f.ch * 0.45;
      if (f.ch > 0.95) m.color.setHex(0xff5040); else m.color.copy(this.chargeColor);
    }

    // Parpadeo de ojos
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    const stunned = (f.fl & F_STUN) !== 0;
    this.eyes.scale.y = blink || stunned ? 0.15 : 1;

    this.stars.visible = stunned;
    if (stunned) this.stars.rotation.y += dt * 6;
    this.shield.visible = (f.fl & F_SHIELD) !== 0;
    if (this.shield.visible) this.shield.scale.setScalar(1 + Math.sin(time * 5) * 0.03);
    this.armor.visible = (f.fl & (F_ARMOR | F_KBIMM)) !== 0 && f.ac !== 'leap' && f.ac !== 'roll';

    // Flash de golpe / invulnerable / etapa 3 pulsante
    this.flash = Math.max(0, this.flash - dt);
    const invuln = (f.fl & F_INVULN) !== 0;
    this.body.visible = !invuln || Math.floor(time * 12) % 2 === 0;
    const baseGlow = [0, 0.45, 1.1, 1.8][f.st] ?? 0;
    this.bodyMat.emissiveIntensity = f.st >= 3 ? baseGlow * (0.7 + 0.5 * Math.sin(time * 10)) : baseGlow;
    // Contorno por etapa: se lee de un vistazo quién está a punto de volar.
    const oc = STAGE_OUTLINE[f.st] ?? STAGE_OUTLINE[0];
    this.outlineMat.color.setHex(oc);
    if (f.st >= 3) this.outlineMat.color.multiplyScalar(1.05 + Math.sin(time * 12) * 0.25);
    // Sombrero que gira (aureola, hélice)
    if (this.hat) this.hat.traverse((o) => { if (o.name === 'spin') o.rotation.y += dt * (o.parent === this.hat ? 14 : 2); });
    // Aura de ulti
    const ult = (f.fl & F_ULTREADY) !== 0;
    this.aura.visible = ult;
    if (ult) {
      this.aura.position.set(f.x, (groundY > -100 ? groundY : f.y) + 0.08, f.z);
      this.aura.scale.setScalar(1 + Math.sin(time * 6) * 0.08);
      this.aura.rotation.z = time;
      (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(time * 6) * 0.3;
    }
    this.bodyMat.color.copy(WHITE).lerp(HIT_TINT, this.flash > 0 ? Math.min(1, this.flash / 0.12) : 0);
    if (this.emote) this.applyEmote(time, f.id);

    // Suelo: anillo de equipo y sombra
    const gy = groundY > -100 ? groundY : f.y;
    this.ring.position.set(f.x, gy + 0.05, f.z);
    this.shadow.position.set(f.x, gy + 0.04, f.z);
    const h = Math.max(0, f.y - gy);
    this.shadow.scale.setScalar(Math.max(0.3, 1 - h * 0.08));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.1, 0.35 - h * 0.02);
    this.ring.visible = groundY > -100;
    this.shadow.visible = groundY > -100;
  }

  /** Animaciones de fin de partida: mira a la cámara y festeja, llora o se encoge de hombros. */
  private applyEmote(time: number, seed: number) {
    const t = time + seed * 0.37;
    this.root.rotation.y = 0; // de frente a la cámara
    this.arm = null;
    this.handL.scale.setScalar(1);
    this.handR.scale.setScalar(1);
    this.tilt.rotation.set(0, 0, 0);
    switch (this.emote) {
      case 'win': {
        // Saltitos con los brazos arriba, saludando.
        const hop = Math.abs(Math.sin(t * 6));
        this.tilt.position.y = hop * 0.5;
        this.tilt.scale.set(1 - hop * 0.05, 1 + hop * 0.08, 1 - hop * 0.05);
        this.tilt.rotation.z = Math.sin(t * 3) * 0.12;
        const wave = Math.sin(t * 12) * 0.12;
        this.handL.position.set(-0.38 + wave, 1.5 + hop * 0.1, 0.05);
        this.handR.position.set(0.38 - wave, 1.5 + hop * 0.1, 0.05);
        this.footL.position.set(-0.18, 0.08 + hop * 0.1, 0);
        this.footR.position.set(0.18, 0.08 + hop * 0.1, 0);
        this.eyes.scale.y = 0.45; // ojos felices (achinados)
        break;
      }
      case 'lose': {
        // Encorvado, las manos en la cara y sollozando (se sacude un poco).
        const sob = Math.sin(t * 16) * 0.02 + Math.max(0, Math.sin(t * 2.2)) * 0.03;
        this.tilt.rotation.x = 0.42;
        this.tilt.position.y = -0.06 + sob;
        this.tilt.scale.set(1.04, 0.86, 1.04);
        this.handL.position.set(-0.13, 0.98 + sob, 0.42);
        this.handR.position.set(0.13, 0.98 + sob, 0.42);
        this.eyes.scale.y = 0.2;
        break;
      }
      case 'draw': {
        // Se encoge de hombros con las palmas para arriba: "y bueno".
        const shrug = Math.max(0, Math.sin(t * 2.4));
        this.tilt.rotation.z = Math.sin(t * 1.2) * 0.1;
        this.tilt.position.y = shrug * 0.06;
        this.handL.position.set(-0.62, 0.7 + shrug * 0.2, 0.2);
        this.handR.position.set(0.62, 0.7 + shrug * 0.2, 0.2);
        this.eyes.scale.y = 0.8;
        break;
      }
    }
  }

  /** Posición del mundo de la cara (para las lágrimas). */
  facePos(out: THREE.Vector3) {
    return this.eyes.getWorldPosition(out);
  }

  dispose() {
    this.root.removeFromParent();
    for (const o of this.groundObjects()) o.removeFromParent();
    this.label.remove();
  }
}

/** Llave de Remache (va en la mano derecha y acompaña el barrido). */
function buildWrench(): THREE.Object3D {
  const tg = toonGradient();
  const m = new THREE.MeshToonMaterial({ color: 0x9aa7b4, gradientMap: tg });
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.55), m);
  handle.position.z = 0.3;
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 12, Math.PI * 1.5), m);
  head.position.z = 0.6;
  head.rotation.x = Math.PI / 2;
  head.rotation.z = Math.PI * 0.75;
  g.add(handle, head);
  g.castShadow = true;
  return g;
}
