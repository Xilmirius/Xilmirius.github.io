// Texturas 100% procedurales (canvas): cero assets externos que descargar.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { Family } from '../core/types';
import { assetTexture } from '../assets/registry';

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function tex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function toonGradient(): THREE.Texture {
  const k = 'toon';
  if (cache.has(k)) return cache.get(k)!;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  cache.set(k, t);
  return t;
}

/** Suelo natural (sin juntas de losa): un moteado que se repite. Va en el piso firme; las losas quedan para lo que se rompe y las rampas. */
export function groundTexture(seed = 1): THREE.Texture {
  const k = 'ground' + seed;
  if (cache.has(k)) return cache.get(k)!;
  const S = 256;
  const { c, g } = canvas(S, S);
  const r = new Rng(seed * 13 + 5);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  // Cada mancha se dibuja también corrida un tamaño de textura: así no se nota la costura al repetirla.
  const blot = (x: number, y: number, rad: number, style: string) => {
    g.fillStyle = style;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath();
      g.ellipse(x + ox, y + oy, rad, rad * r.range(0.55, 1), r.range(0, 3), 0, Math.PI * 2);
      g.fill();
    }
  };
  for (let i = 0; i < 46; i++) { const v = 226 + r.int(-12, 10); blot(r.range(0, S), r.range(0, S), r.range(14, 38), `rgba(${v},${v},${v},0.32)`); }
  for (let i = 0; i < 900; i++) { const v = 214 + r.int(-34, 30); blot(r.range(0, S), r.range(0, S), r.range(0.8, 2.6), `rgb(${v},${v},${v})`); }
  for (let i = 0; i < 60; i++) blot(r.range(0, S), r.range(0, S), r.range(1.5, 3.2), 'rgba(90,70,50,0.35)');
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(k, t);
  return t;
}

/** Atlas del terreno: mitad izquierda = baldosa del piso, mitad derecha = estratos de roca. */
export function terrainAtlas(seed = 1): THREE.Texture {
  const file = assetTexture('terrain.atlas');
  if (file) return file;
  const k = 'terrain' + seed;
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(512, 256);
  const r = new Rng(seed);
  // Piso
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const v = 215 + r.int(-30, 25);
    g.fillStyle = `rgb(${v},${v},${v})`;
    const s = r.range(2, 7);
    g.fillRect(r.range(0, 256), r.range(0, 256), s, s);
  }
  // Losas
  g.strokeStyle = 'rgba(70,55,40,0.55)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 250);
  g.strokeStyle = 'rgba(70,55,40,0.22)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(128, 6); g.lineTo(128 + r.range(-10, 10), 250);
  g.moveTo(6, 128); g.lineTo(250, 128 + r.range(-10, 10));
  g.stroke();
  // Estratos
  for (let y = 0; y < 256; y += 4) {
    const band = Math.floor(y / 24) % 2;
    const v = band ? 150 : 185;
    const jitter = r.int(-12, 12);
    g.fillStyle = `rgb(${v + jitter},${v + jitter - 8},${v + jitter - 18})`;
    g.fillRect(256, y, 256, 4);
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(40,30,20,${r.range(0.05, 0.25)})`;
    g.fillRect(256 + r.range(0, 256), r.range(0, 256), r.range(3, 14), r.range(1, 4));
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(k, t);
  return t;
}

function drawCracks(g: CanvasRenderingContext2D, r: Rng, w: number, h: number, count: number, width: number, style: string) {
  g.strokeStyle = style;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = 0; i < count; i++) {
    let x = r.range(0, w), y = r.range(h * 0.1, h * 0.9);
    let a = r.range(0, Math.PI * 2);
    g.lineWidth = width * r.range(0.6, 1.2);
    g.beginPath();
    g.moveTo(x, y);
    const segs = r.int(4, 9);
    for (let s = 0; s < segs; s++) {
      a += r.range(-0.9, 0.9);
      const l = r.range(6, 20);
      x += Math.cos(a) * l;
      y += Math.sin(a) * l;
      g.lineTo(x, y);
      if (r.chance(0.3)) {
        // rama
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a + 1.2) * l * 0.6, y + Math.sin(a + 1.2) * l * 0.6);
        g.moveTo(x, y);
      }
    }
    g.stroke();
  }
}

/** Piel del bean: color base de la familia + grietas según la etapa de daño (D-0015). */
export function beanSkin(family: Family, stage: number, base: number): { map: THREE.Texture; glow: THREE.Texture } {
  const k = `bean-${family}-${stage}-${base}`;
  if (cache.has(k)) return { map: cache.get(k)!, glow: cache.get(k + 'g')! };
  const fileMap = assetTexture(`skin.${family}.${stage}`);
  if (fileMap) {
    const fileGlow = assetTexture(`skin.${family}.${stage}.glow`);
    return { map: fileMap, glow: fileGlow ?? beanSkinProcedural(family, stage, base).glow };
  }
  return beanSkinProcedural(family, stage, base);
}

function beanSkinProcedural(family: Family, stage: number, base: number): { map: THREE.Texture; glow: THREE.Texture } {
  const k = `bean-${family}-${stage}-${base}`;
  if (cache.has(k)) return { map: cache.get(k)!, glow: cache.get(k + 'g')! };
  const W = 256, H = 128;
  const { c, g } = canvas(W, H);
  const { c: cg, g: gg } = canvas(W, H);
  const r = new Rng(family.length * 97 + 13);
  g.fillStyle = hex(base);
  g.fillRect(0, 0, W, H);
  gg.fillStyle = '#000';
  gg.fillRect(0, 0, W, H);
  // Patrón de superficie por familia
  if (family === 'stone') {
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${r.chance(0.5) ? '255,255,255' : '0,0,0'},${r.range(0.04, 0.14)})`;
      g.beginPath();
      g.arc(r.range(0, W), r.range(0, H), r.range(2, 8), 0, Math.PI * 2);
      g.fill();
    }
  } else if (family === 'metal') {
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    for (let x = 0; x < W; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    g.beginPath(); g.moveTo(0, H * 0.45); g.lineTo(W, H * 0.45); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let x = 8; x < W; x += 32) { g.beginPath(); g.arc(x, H * 0.45 + 6, 2.5, 0, 7); g.fill(); }
  } else if (family === 'crystal') {
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${r.range(0.05, 0.3)})`;
      g.beginPath();
      const x = r.range(0, W), y = r.range(0, H), s = r.range(8, 24);
      g.moveTo(x, y - s); g.lineTo(x + s * 0.6, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.6, y);
      g.fill();
    }
  } else {
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(255,255,255,${r.range(0.08, 0.3)})`;
      g.beginPath();
      g.arc(r.range(0, W), r.range(0, H), r.range(2, 9), 0, Math.PI * 2);
      g.fill();
    }
  }
  if (stage > 0) {
    const counts = [0, 5, 12, 22];
    const widths = [0, 2.2, 3, 3.8];
    const dark = family === 'crystal' ? 'rgba(150,90,255,0.95)' : family === 'goo' ? 'rgba(20,60,10,0.9)' : 'rgba(25,15,10,0.95)';
    const cr = new Rng(stage * 31 + family.length);
    drawCracks(g, cr, W, H, counts[stage], widths[stage], dark);
    const cr2 = new Rng(stage * 31 + family.length);
    gg.shadowColor = '#fff';
    gg.shadowBlur = 6;
    drawCracks(gg, cr2, W, H, counts[stage], widths[stage] * 0.8, '#fff');
    if (family === 'goo') {
      // El goo se derrite: gotas que chorrean
      g.fillStyle = 'rgba(30,90,20,0.6)';
      for (let i = 0; i < stage * 6; i++) {
        const x = r.range(0, W);
        g.fillRect(x, H * 0.55, r.range(3, 7), r.range(10, 40));
      }
    }
    if (family === 'metal') {
      // Abolladuras
      for (let i = 0; i < stage * 5; i++) {
        const grd = g.createRadialGradient(0, 0, 1, 0, 0, 14);
        grd.addColorStop(0, 'rgba(0,0,0,0.45)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.save();
        g.translate(r.range(0, W), r.range(10, H - 10));
        g.fillStyle = grd;
        g.fillRect(-14, -14, 28, 28);
        g.restore();
      }
    }
  }
  const map = tex(c);
  const glow = tex(cg, false);
  cache.set(k, map);
  cache.set(k + 'g', glow);
  return { map, glow };
}

/** Grietas para baldosas frágiles (transparente). */
export function tileCracks(stage: number): THREE.Texture {
  const k = 'tilecrack' + stage;
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(128, 128);
  const r = new Rng(stage * 7 + 3);
  const n = [3, 7, 13, 18][stage] ?? 3;
  drawCracks(g, r, 128, 128, n, 1.5 + stage * 0.8, stage >= 2 ? 'rgba(60,20,5,0.9)' : 'rgba(60,40,20,0.7)');
  if (stage >= 2) {
    const r2 = new Rng(stage * 7 + 3);
    g.shadowColor = '#ff6a1a';
    g.shadowBlur = 5;
    drawCracks(g, r2, 128, 128, n, 1, 'rgba(255,120,40,0.8)');
  }
  const t = tex(c);
  cache.set(k, t);
  return t;
}

/** Gradiente radial blanco para halos, sombras y partículas suaves. */
export function softDisc(): THREE.Texture {
  const k = 'disc';
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = tex(c);
  cache.set(k, t);
  return t;
}

/** Nubes suaves que se repiten sin costura (blanco con alfa): el color lo pone el material. */
export function cloudTexture(): THREE.Texture {
  const k = 'clouds';
  if (cache.has(k)) return cache.get(k)!;
  const S = 512;
  const { c, g } = canvas(S, S);
  const r = new Rng(77);
  for (let i = 0; i < 46; i++) {
    const x = r.range(0, S), y = r.range(0, S), rad = r.range(28, 92), a = r.range(0.1, 0.34);
    // Cada mancha se dibuja también corrida una textura entera en cada eje: así los bordes empalman.
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grd.addColorStop(0, `rgba(255,255,255,${a})`);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(k, t);
  return t;
}

/** Una celda de grilla (líneas finas con halo) que se repite: el piso de neón del abismo. */
export function gridTexture(): THREE.Texture {
  const k = 'grid';
  if (cache.has(k)) return cache.get(k)!;
  const S = 128;
  const { c, g } = canvas(S, S);
  for (const [w, a] of [[14, 0.1], [7, 0.22], [2.5, 1]]) {
    g.strokeStyle = `rgba(255,255,255,${a})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(S, 0);
    g.moveTo(0, S); g.lineTo(S, S);
    g.moveTo(0, 0); g.lineTo(0, S);
    g.moveTo(S, 0); g.lineTo(S, S);
    g.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(k, t);
  return t;
}

export function ringTexture(): THREE.Texture {
  const k = 'ring';
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(128, 128);
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.arc(64, 64, 55, 0, Math.PI * 2);
  g.fill();
  const t = tex(c);
  cache.set(k, t);
  return t;
}

export function hazardStripes(): THREE.Texture {
  const k = 'hazard';
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(128, 128);
  g.fillStyle = '#8a97a6';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(0, 60, 128, 4);
  for (let i = -128; i < 256; i += 32) {
    g.fillStyle = '#ffc94a';
    g.beginPath();
    g.moveTo(i, 100); g.lineTo(i + 16, 100); g.lineTo(i + 44, 128); g.lineTo(i + 28, 128);
    g.fill();
  }
  g.fillStyle = '#222';
  g.fillRect(0, 96, 128, 4);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  for (const [x, y] of [[10, 10], [118, 10], [10, 50], [118, 50]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  const t = tex(c);
  cache.set(k, t);
  return t;
}
