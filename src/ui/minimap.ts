// Minimapa del Asedio: el mapa entero desde arriba con líneas, torres, núcleos, esbirros, neutrales y
// héroes. La capa del terreno se dibuja una vez; lo que se mueve se redibuja ~15 veces por segundo.
import { BASE_RADIUS, CELL, TEAM_COLORS } from '../core/constants';
import { UNIT_KINDS } from '../core/entities';
import { F_DEAD, S_INVULN, type WorldFrame } from '../core/snapshot';
import { CellType, Terrain, TILE_GONE } from '../core/terrain';
import { colorHex } from './dom';

const NEUTRAL = '#ffc629';
const ME = '#ffe14a';
const WIDTH = 230;

export class Minimap {
  el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private k: number; // px por metro
  private w: number;
  private h: number;
  private t = 0;
  private tiles = '';
  private readonly dpr = Math.min(2, window.devicePixelRatio || 1);

  constructor(private terrain: Terrain, private myTeam: number) {
    const b = terrain.bounds();
    this.k = WIDTH / (b.maxX - b.minX);
    this.w = WIDTH;
    this.h = Math.round((b.maxZ - b.minZ) * this.k);
    this.el = document.createElement('canvas');
    this.el.className = 'minimap';
    this.el.width = this.w * this.dpr;
    this.el.height = this.h * this.dpr;
    this.el.style.width = `${this.w}px`;
    this.el.style.height = `${this.h}px`;
    this.ctx = this.el.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.base.width = this.el.width;
    this.base.height = this.el.height;
    this.drawBase();
  }

  private px(x: number) { return (x - this.terrain.originX) * this.k; }
  private pz(z: number) { return (z - this.terrain.originZ) * this.k; }

  /** Capa fija: piso, muros, piso frágil (y los agujeros), bases y líneas. */
  private drawBase() {
    const t = this.terrain;
    const c = this.base.getContext('2d')!;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    const s = CELL * this.k;
    for (let iz = 0; iz < t.h; iz++) {
      for (let ix = 0; ix < t.w; ix++) {
        const i = iz * t.w + ix;
        const cell = t.cells[i];
        if (cell.type === CellType.Void) continue;
        if (cell.fragile >= 0 && t.tileState[cell.fragile] === TILE_GONE) continue;
        c.fillStyle = cell.type === CellType.Wall ? '#4c4458' : cell.fragile >= 0 ? '#7a6a58' : cell.level > 0 ? '#9c8a74' : '#8a7a66';
        c.fillRect(ix * s, iz * s, s + 0.5, s + 0.5);
      }
    }
    // Líneas: un trazo tenue por el recorrido de los esbirros.
    c.strokeStyle = 'rgba(255, 225, 150, 0.35)';
    c.lineWidth = 2;
    for (const lane of t.lanes) {
      c.beginPath();
      lane.forEach((p, i) => (i ? c.lineTo(this.px(p.x), this.pz(p.z)) : c.moveTo(this.px(p.x), this.pz(p.z))));
      c.stroke();
    }
    // Bases
    for (const team of [0, 1]) {
      const pts = t.spawns.team[team] ?? [];
      if (!pts.length) continue;
      const x = pts.reduce((a, p) => a + p.x, 0) / pts.length, z = pts.reduce((a, p) => a + p.z, 0) / pts.length;
      c.strokeStyle = colorHex(TEAM_COLORS[team]);
      c.globalAlpha = 0.7;
      c.beginPath();
      c.arc(this.px(x), this.pz(z), BASE_RADIUS * this.k, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }
    this.tiles = t.tileString();
  }

  draw(w: WorldFrame, localId: number, dt: number) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1 / 15;
    if (w.tiles !== this.tiles) this.drawBase();
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.el.width, this.el.height);
    c.drawImage(this.base, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const team = (t: number) => (t >= 2 ? NEUTRAL : colorHex(TEAM_COLORS[t % TEAM_COLORS.length]));
    // Escombros de lo destruido
    for (const [x, z] of w.mode.moba?.down ?? []) {
      c.strokeStyle = '#3a3344';
      c.lineWidth = 2;
      const X = this.px(x), Z = this.pz(z);
      c.beginPath(); c.moveTo(X - 4, Z - 4); c.lineTo(X + 4, Z + 4); c.moveTo(X + 4, Z - 4); c.lineTo(X - 4, Z + 4); c.stroke();
    }
    // Torres y núcleos: cuadrados del color del equipo; con borde si están protegidos.
    for (const s of w.structs) {
      if (s.k !== 'tower' && s.k !== 'core') continue;
      const r = s.k === 'core' ? 6 : 4.5;
      const X = this.px(s.x), Z = this.pz(s.z);
      c.fillStyle = '#14101d';
      c.fillRect(X - r - 1, Z - r - 1, r * 2 + 2, r * 2 + 2);
      c.fillStyle = team(s.tm);
      const hh = (r * 2) * Math.max(0.15, s.hp);
      c.fillRect(X - r, Z + r - hh, r * 2, hh);
      if (s.fl & S_INVULN) { c.strokeStyle = '#4fd1ff'; c.lineWidth = 1.5; c.strokeRect(X - r - 2, Z - r - 2, r * 2 + 4, r * 2 + 4); }
    }
    // Esbirros y neutrales
    for (const u of w.units) {
      const kind = UNIT_KINDS[u.k];
      const big = kind === 'coloso';
      c.fillStyle = team(u.tm);
      const r = big ? 5 : kind === 'siege' ? 2.4 : 1.7;
      c.beginPath();
      c.arc(this.px(u.x), this.pz(u.z), r, 0, Math.PI * 2);
      c.fill();
      if (big) { c.strokeStyle = '#1c1428'; c.lineWidth = 1.5; c.stroke(); }
    }
    // Héroes (vos: más grande y con aro amarillo)
    for (const ch of w.chars) {
      if (ch.fl & F_DEAD) continue;
      const me = ch.id === localId;
      const X = this.px(ch.x), Z = this.pz(ch.z);
      c.fillStyle = '#1c1428';
      c.beginPath(); c.arc(X, Z, me ? 5.5 : 4.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = team(this.teamOf(w, ch.id));
      c.beginPath(); c.arc(X, Z, me ? 4 : 3.2, 0, Math.PI * 2); c.fill();
      if (me) {
        c.strokeStyle = ME; c.lineWidth = 1.5;
        c.beginPath(); c.arc(X, Z, 7, 0, Math.PI * 2); c.stroke();
        // Lo que ves en pantalla (aprox.)
        c.strokeStyle = 'rgba(255, 225, 74, 0.45)';
        c.lineWidth = 1;
        c.strokeRect(X - 19 * this.k, Z - 13 * this.k, 38 * this.k, 22 * this.k);
      }
    }
  }

  private teamCache = new Map<number, number>();
  setTeams(teams: Map<number, number>) { this.teamCache = teams; }
  private teamOf(_w: WorldFrame, id: number) { return this.teamCache.get(id) ?? (this.myTeam === 0 ? 1 : 0); }
}
