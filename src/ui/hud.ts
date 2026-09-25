// HUD de partida + Forja (C) + Tabla (Tab) + pantalla de resultados.
import { REPAIR_AMOUNT, REPAIR_COST, STAGE_NAMES, TEAM_COLORS, TEAM_NAMES, MUTATION_LEVELS } from '../core/constants';
import { SLOTS } from '../core/entities';
import type { SimEvent, TimedEvent } from '../core/events';
import { HEROES } from '../core/heroes';
import { ITEMS, ITEM_BY_ID } from '../core/items';
import { MODE_INFO } from '../core/modes';
import { MUTATION_COST, ROUTE_DESC, ROUTE_FLAVOR } from '../core/mutations';
import type { MatchResultInfo, PlayerResult, RosterInfo } from '../core/protocol';
import type { Command } from '../core/sim';
import { F_DEAD, F_ELIMINATED, F_SHIELD, type CharFrame, type MeFrame, type WorldFrame } from '../core/snapshot';
import { FAMILIES, FAMILY_COLORS, FAMILY_NAMES, ROUTE_NAMES, type AbilitySlot, type Family, type Route } from '../core/types';
import { audio } from '../audio/audio';
import { ACH_BY_ID, unlock, xpToNext, type MatchReward } from '../game/profile';
import { HAT_BY_ID } from '../core/cosmetics';
import { clear, colorHex, fmtTime, h } from './dom';

const MAT_ICON: Record<Family, string> = { stone: '🪨', metal: '🔩', crystal: '💎', goo: '🟢' };
const KEYS: Record<string, string> = { basic: 'Clic', push: 'Clic D', q: 'Q', e: 'E', f: 'F', r: 'R', i1: '1', i2: '2', i3: '3' };

export class Hud {
  root: HTMLDivElement;
  private top = h('div', { class: 'hud-top' });
  private feed = h('div', { class: 'hud-feed' });
  private center = h('div', { class: 'hud-center' });
  private sub = h('div', { class: 'hud-sub' });
  private status = h('div', { class: 'hud-status' });
  private body = h('div', { class: 'hud-body' });
  private bar = h('div', { class: 'hud-bar' });
  private mats = h('div', { class: 'hud-mats' });
  private hint = h('div', { class: 'hud-hint' });
  private deny = h('div', { class: 'hud-deny' });
  private net = h('div', { class: 'hud-net' });
  private forge: HTMLDivElement;
  private board: HTMLDivElement;
  private results: HTMLDivElement | null = null;
  private slotEls = new Map<string, { root: HTMLElement; cd: HTMLElement; txt: HTMLElement; lock: HTMLElement; icon: HTMLElement; mut: HTMLElement }>();
  private lastMe: MeFrame | null = null;
  private lastLocal: CharFrame | null = null;
  private forgeTab: 'items' | 'mut' = 'items';
  private forgeKey = '';
  private centerT = 0;
  private denyT = 0;
  forgeOpen = false;
  private byId = new Map<number, RosterInfo>();
  // ── juice ──
  private comboEl = h('div', { class: 'hud-combo' });
  private announceEl = h('div', { class: 'hud-announce' });
  private achEl = h('div', { class: 'hud-ach' });
  private matEls: HTMLElement[] = [];
  private passEl = h('div', { class: 'passives' });
  private combo = 0;
  private comboT = 0;
  private comboTier = -1;
  private queue: { title: string; sub: string; cls: string; speak?: string }[] = [];
  private announceT = 0;
  private achQueue: string[] = [];
  private achT = 0;
  private prevCd: number[] = [];
  private prevMats: number[] = [];
  private prevLv = 0;
  private ultWasReady = true;
  private said = new Set<string>();
  private streaks = new Map<number, number>();
  private multi = new Map<number, { n: number; t: number }>();
  private firstKo = false;
  /** Estadísticas de la partida para el perfil (logros y XP de cuenta). */
  live = { bestCombo: 0, bestMulti: 0, bestStreak: 0, mutations: 0 };
  onFlash: (color: number, amount: number) => void = () => {};

  constructor(
    parent: HTMLElement,
    private roster: RosterInfo[],
    private localId: number,
    private send: (c: Command) => void,
  ) {
    for (const r of roster) this.byId.set(r.id, r);
    this.root = h('div', { class: 'hud' });
    const bottom = h('div', { class: 'hud-bottom' }, this.body, h('div', { class: 'hud-mid' }, this.deny, this.bar, this.hint), h('div', { class: 'hud-right' }, this.mats));
    this.forge = h('div', { class: 'forge hidden' });
    this.board = h('div', { class: 'board hidden' });
    this.root.append(this.top, this.feed, this.center, this.sub, this.status, this.net, this.comboEl, this.announceEl, this.achEl, bottom, this.forge, this.board);
    parent.appendChild(this.root);
    this.buildBar();
    this.buildMats();
    this.hint.innerHTML = '<b>C</b> forja · <b>V</b> reparar · <b>Shift</b> mirar lejos · <b>Tab</b> tabla · <b>Esc</b> menú';
  }

  get me(): RosterInfo | undefined { return this.byId.get(this.localId); }

  private buildBar() {
    const me = this.me;
    if (!me) { this.bar.style.display = 'none'; return; }
    const hero = HEROES[me.hero];
    const mk = (slot: string, icon: string, name: string, desc: string, extra = '') => {
      const cd = h('div', { class: 'cd' });
      const txt = h('div', { class: 'cdt' });
      const lock = h('div', { class: 'lock' });
      const ic = h('div', { class: 'ic' }, icon);
      const mut = h('div', { class: 'mut' });
      const root = h('div', { class: 'slot ' + extra, title: `${name}\n${desc}` }, ic, cd, txt, lock, mut, h('div', { class: 'key' }, KEYS[slot]));
      this.slotEls.set(slot, { root, cd, txt, lock, icon: ic, mut });
      return root;
    };
    this.bar.append(
      mk('basic', hero.basic.kind === 'melee' ? '👊' : '🎯', hero.basic.name, hero.basic.desc, 'small'),
      mk('push', '🫸', 'Empujón', 'Mantené para cargar: más carga, más empuje. Es lo que saca del mapa.', 'small'),
      h('div', { class: 'sep' }),
      ...(['q', 'e', 'f', 'r'] as AbilitySlot[]).map((s) => { const a = hero.abilities[s]; return mk(s, a.icon, a.name, a.desc, s === 'r' ? 'ult' : ''); }),
      h('div', { class: 'sep' }),
      mk('i1', '', 'Ítem 1', 'Fabricá ítems activos en la forja (C).', 'item'),
      mk('i2', '', 'Ítem 2', 'Fabricá ítems activos en la forja (C).', 'item'),
      mk('i3', '', 'Ítem 3', 'Fabricá ítems activos en la forja (C).', 'item'),
    );
  }

  update(w: WorldFrame, local: CharFrame | null, me: MeFrame | null, dt: number, net: { ping: number; fps: number; showFps: boolean; kind: string }) {
    this.lastMe = me;
    this.lastLocal = local;
    this.renderTop(w);
    this.renderCenter(w, local, dt);
    if (local && me) {
      this.renderBody(local, me);
      this.renderBar(local, me);
      this.renderMats(me);
      if (this.forgeOpen) this.renderForge();
    }
    this.denyT -= dt;
    this.deny.style.opacity = this.denyT > 0 ? '1' : '0';
    this.tickJuice(w, local, me, dt);
    this.net.textContent = (net.ping > 0 ? `${Math.round(net.ping)} ms` : net.kind === 'host' ? 'host' : '') + (net.showFps ? ` · ${Math.round(net.fps)} fps` : '');
    if (!this.board.classList.contains('hidden')) this.renderBoard(w);
  }

  private renderTop(w: WorldFrame) {
    const m = w.mode;
    const teams = m.scores.map((s, i) => {
      const r = this.roster.find((x) => x.team === i);
      const label = this.roster.length && this.isFfa() ? (r?.name ?? `J${i + 1}`) : TEAM_NAMES[i];
      return `<span class="score" style="--c:${colorHex(TEAM_COLORS[i % TEAM_COLORS.length])}"><i></i>${label} <b>${s}</b></span>`;
    }).join('');
    const zone = m.zone ? `<div class="zone-info">${m.zone.contested ? '⚔️ Disputada' : m.zone.owner >= 0 ? 'Zona de ' + (this.isFfa() ? this.roster.find((x) => x.team === m.zone!.owner)?.name : TEAM_NAMES[m.zone.owner]) : 'Zona libre'} · se mueve en ${Math.ceil(m.zone.next)} s</div>` : '';
    const html = `<div class="mode">${MODE_INFO[m.id]?.name ?? m.title} · <span class="time">${fmtTime(m.time)}</span> · meta ${m.target} ${m.label}</div><div class="scores">${teams}</div>${zone}`;
    if (this.top.innerHTML !== html) this.top.innerHTML = html;
  }

  private isFfa() {
    const teams = new Set(this.roster.map((r) => r.team));
    return teams.size === this.roster.length && this.roster.length > 2;
  }

  private renderCenter(w: WorldFrame, local: CharFrame | null, dt: number) {
    if (w.phase === 'countdown' && this.centerT <= 0) this.showCenter(String(Math.max(1, Math.ceil(w.phaseT))), 0.3, 'count');
    this.centerT -= dt;
    this.center.style.opacity = this.centerT > 0 ? '1' : '0';
    let sub = '';
    if (local && local.fl & F_DEAD) {
      if (local.fl & F_ELIMINATED) sub = 'Sin vidas — mirando la partida';
      else if (w.phase !== 'end') sub = `Volvés en ${Math.ceil(local.rt)}…`;
    }
    if (!local) sub = 'Espectando';
    if (this.sub.textContent !== sub) this.sub.textContent = sub;
  }

  showCenter(text: string, secs = 1.4, cls = '') {
    const changed = this.center.textContent !== text;
    this.center.textContent = text;
    this.center.className = 'hud-center ' + cls;
    if (changed) restart(this.center);
    this.centerT = secs;
  }

  private renderBody(c: CharFrame, me: MeFrame) {
    const hero = HEROES[this.me!.hero];
    const fam = hero.family;
    const pips = [0, 1, 2, 3].map((i) => `<i class="${i <= c.st ? 'on s' + c.st : ''}"></i>`).join('');
    const xpPct = me.xpNext > me.xpPrev ? Math.min(100, ((me.xp - me.xpPrev) / (me.xpNext - me.xpPrev)) * 100) : 100;
    const repair = me.rep > 0 ? `<div class="repair"><div style="width:${Math.round(me.rep * 100)}%"></div></div>` : '';
    const html = `
      <div class="portrait" style="--c:${colorHex(FAMILY_COLORS[fam])}">
        <div class="lvl">${c.lv}</div>
        <div class="who"><b>${hero.name}</b><span>${FAMILY_NAMES[fam]} · ${hero.role}</span></div>
      </div>
      <div class="bodystate s${c.st}"><span>${STAGE_NAMES[c.st]}</span><div class="pips">${pips}</div><em>${c.heat}</em></div>
      ${c.fl & F_SHIELD ? `<div class="shieldtag">🛡️ Escudo ${c.sh}</div>` : ''}
      ${repair}
      <div class="xp"><div style="width:${xpPct}%"></div></div>
      <div class="xpt">${c.lv >= 10 ? 'Nivel máximo' : `XP ${me.xp}/${me.xpNext}`}${me.slots > Object.keys(me.mut).length ? ' · <b class="glow">¡Mutación disponible! (C)</b>' : ''}</div>`;
    if (this.body.innerHTML !== html) this.body.innerHTML = html;
  }

  private renderBar(c: CharFrame, me: MeFrame) {
    const hero = HEROES[this.me!.hero];
    SLOTS.forEach((slot, i) => {
      const el = this.slotEls.get(slot);
      if (!el) return;
      const rem = me.cd[i], max = me.cdm[i] || 1;
      let locked = false, lockTxt = '';
      if (slot === 'q' || slot === 'e' || slot === 'f' || slot === 'r') {
        const a = hero.abilities[slot];
        if (c.lv < a.unlock) { locked = true; lockTxt = `Nv ${a.unlock}`; }
        const mut = me.mut[slot];
        el.mut.textContent = mut ? ROUTE_NAMES[mut][0] : '';
        el.mut.className = 'mut ' + (mut ?? '');
      }
      if (slot.startsWith('i')) {
        const id = me.act[Number(slot[1]) - 1];
        const it = id ? ITEM_BY_ID[id] : null;
        el.icon.textContent = it ? it.icon : '';
        el.root.title = it ? `${it.name}\n${it.desc}` : 'Vacío: fabricá un ítem activo en la forja (C).';
        el.root.classList.toggle('empty', !it);
      }
      if (slot === 'push') {
        el.root.classList.toggle('charging', c.ch > 0.01 && !!(c.fl & 64));
        el.root.style.setProperty('--charge', String(c.fl & 64 ? c.ch : 0));
      }
      el.lock.textContent = lockTxt;
      el.root.classList.toggle('locked', locked);
      const frac = rem > 0 ? rem / max : 0;
      el.cd.style.background = frac > 0 ? `conic-gradient(rgba(10,6,20,.72) ${frac * 360}deg, transparent 0)` : 'none';
      el.txt.textContent = rem > 0.05 && max > 1 ? (rem >= 1 ? String(Math.ceil(rem)) : rem.toFixed(1)) : '';
    });
  }

  private buildMats() {
    this.matEls = FAMILIES.map((f) => {
      const el = h('div', { class: 'mat', style: { '--c': colorHex(FAMILY_COLORS[f]) }, title: FAMILY_NAMES[f] }, h('span', null, MAT_ICON[f]), h('b', null, '0'));
      this.mats.appendChild(el);
      return el;
    });
    this.mats.appendChild(this.passEl);
  }

  private renderMats(me: MeFrame) {
    me.mats.forEach((v, i) => {
      const el = this.matEls[i];
      const b = el.querySelector('b')!;
      if (b.textContent !== String(v)) b.textContent = String(v);
      if (this.prevMats.length && v > (this.prevMats[i] ?? 0)) bump(el);
    });
    this.prevMats = [...me.mats];
    const html = `${me.pas.map((p) => `<span title="${ITEM_BY_ID[p]?.name}: ${ITEM_BY_ID[p]?.desc}">${ITEM_BY_ID[p]?.icon ?? '?'}</span>`).join('')}${'<span class="empty"></span>'.repeat(3 - me.pas.length)}`;
    if (this.passEl.innerHTML !== html) this.passEl.innerHTML = html;
  }

  /** Un trozo de material vuela desde el mundo hasta el contador (efecto moneda de casino). */
  flyMat(sx: number, sy: number, mat: number) {
    const target = this.matEls[mat];
    if (!target) return;
    const r = target.getBoundingClientRect();
    const el = h('div', { class: 'flycoin' }, MAT_ICON[FAMILIES[mat]]);
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transform = `translate(${r.left + r.width / 2 - sx}px, ${r.top + r.height / 2 - sy}px) scale(0.6) rotate(540deg)`;
      el.style.opacity = '0.9';
    }));
    setTimeout(() => { el.remove(); bump(target); }, 600);
  }

  // ───────────── juice: combos, anuncios, ulti, cooldowns ─────────────

  private tickJuice(w: WorldFrame, local: CharFrame | null, me: MeFrame | null, dt: number) {
    // Combo
    if (this.combo > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        if (this.combo >= 5) this.announce(`COMBO x${this.combo}`, COMBO_TIERS.filter((t) => this.combo >= t[0]).pop()?.[1] ?? '', 'combo-end');
        this.combo = 0;
        this.comboTier = -1;
        this.comboEl.classList.remove('on');
      }
    }
    // Anuncios en cola
    this.announceT -= dt;
    if (this.announceT <= 0 && this.queue.length) {
      const a = this.queue.shift()!;
      this.announceEl.innerHTML = `<div class="a-title">${esc(a.title)}</div>${a.sub ? `<div class="a-sub">${esc(a.sub)}</div>` : ''}`;
      this.announceEl.className = 'hud-announce on ' + a.cls;
      restart(this.announceEl);
      this.announceT = 1.8;
      audio.play('announce', 0.5);
      if (a.speak) audio.say(a.speak);
    } else if (this.announceT <= 0) this.announceEl.classList.remove('on');
    // Logros
    this.achT -= dt;
    if (this.achT <= 0 && this.achQueue.length) {
      const id = this.achQueue.shift()!;
      const a = ACH_BY_ID[id];
      this.achEl.innerHTML = `<div class="ach-ic">${a.icon}</div><div><small>¡LOGRO DESBLOQUEADO!</small><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div>`;
      this.achEl.className = 'hud-ach on';
      restart(this.achEl);
      this.achT = 3;
      audio.play('jackpot', 0.8);
    } else if (this.achT <= 0) this.achEl.classList.remove('on');

    if (!local || !me || !this.me) return;
    // Cooldowns listos: destello + tic. Ulti lista: anuncio grande.
    SLOTS.forEach((slot, i) => {
      const prev = this.prevCd[i] ?? 0;
      const cur = me.cd[i];
      if (prev > 0.25 && cur <= 0 && slot !== 'basic' && slot !== 'push') {
        const el = this.slotEls.get(slot);
        if (el) { el.root.classList.remove('ready'); void el.root.offsetWidth; el.root.classList.add('ready'); }
        if (slot !== 'r') audio.play('ready', 0.5);
      }
    });
    this.prevCd = [...me.cd];
    const ultReady = local.lv >= 5 && me.cd[SLOTS.indexOf('r')] <= 0 && !(local.fl & F_DEAD);
    this.slotEls.get('r')?.root.classList.toggle('ultready', ultReady);
    if (ultReady && !this.ultWasReady) {
      this.announce('¡ULTI LISTA!', `${HEROES[this.me.hero].abilities.r.icon} ${HEROES[this.me.hero].abilities.r.name} · apretá R`, 'ult', '¡Ulti lista!');
      audio.play('ultready', 0.9);
    }
    this.ultWasReady = ultReady;
    if (this.prevLv && local.lv > this.prevLv) {
      const p = this.body.querySelector('.portrait');
      if (p) { p.classList.remove('levelup'); void (p as HTMLElement).offsetWidth; p.classList.add('levelup'); }
    }
    this.prevLv = local.lv;
    this.live.mutations = Object.keys(me.mut).length;
    // Puntos de partido
    const m = w.mode;
    m.scores.forEach((sc, team) => {
      const name = this.isFfa() ? this.roster.find((r) => r.team === team)?.name ?? '' : `Equipo ${TEAM_NAMES[team]}`;
      if (m.id === 'kills' && sc === m.target - 1) this.once(`mp${team}`, () => this.announce('¡PUNTO DE PARTIDO!', name, 'matchpoint', 'Punto de partido'));
      if (m.id === 'koth' && sc >= m.target - 10 && sc < m.target) this.once(`kp${team}`, () => this.announce('¡A 10 PUNTOS!', name, 'matchpoint'));
      if (m.id === 'stock' && sc === 1 && w.phase === 'play') this.once(`lv${team}`, () => this.announce('¡ÚLTIMA VIDA!', name, 'matchpoint', 'Última vida'));
    });
    if (w.phase === 'play' && m.time <= 30) audio.tension = Math.max(audio.tension, 0.7);
  }

  private once(key: string, fn: () => void) {
    if (this.said.has(key)) return;
    this.said.add(key);
    fn();
  }

  announce(title: string, sub = '', cls = '', speak?: string) {
    if (this.queue.length > 4) this.queue.shift();
    this.queue.push({ title, sub, cls, speak });
  }

  private achievement(id: string) {
    if (unlock(id)) this.achQueue.push(id);
  }

  private onComboHit() {
    this.combo++;
    this.comboT = 2.2;
    this.live.bestCombo = Math.max(this.live.bestCombo, this.combo);
    if (this.combo >= 2) {
      const tier = COMBO_TIERS.filter((t) => this.combo >= t[0]).length - 1;
      const label = tier >= 0 ? COMBO_TIERS[tier][1] : '';
      this.comboEl.innerHTML = `<b>x${this.combo}</b><span>${label || 'COMBO'}</span>`;
      this.comboEl.className = `hud-combo on t${Math.max(0, tier)}`;
      restart(this.comboEl);
      audio.play('combo', 0.55, 0, Math.pow(2, Math.min(24, this.combo - 2) / 12));
      if (tier > this.comboTier && tier >= 0) {
        this.comboTier = tier;
        audio.say(label.replace(/[¡!]/g, ''));
        this.onFlash([0xffe14a, 0xff8a3d, 0xff4f8b, 0xb070ff, 0x4fd1ff, 0xffffff][tier] ?? 0xffffff, 0.12 + tier * 0.04);
      }
    }
    if (this.combo >= 10) this.achievement('combo10');
    if (this.combo >= 25) this.achievement('combo25');
  }

  onEvent(e: SimEvent | TimedEvent) {
    const t = 't' in e ? e.t : 0;
    const me = this.localId;
    switch (e.k) {
      case 'hit':
        if (e.a === me && me >= 0 && e.h > 0 && e.id !== me) this.onComboHit();
        if (e.l && e.a === me && me >= 0) audio.say('¡Letal!', true);
        break;
      case 'body': if (e.a === me && me >= 0) this.achievement('billiards'); break;
      case 'save':
        if (e.id === me) { this.announce('¡SALVADA ÉPICA!', 'te salvaste de salir volando', 'good', '¡Salvada épica!'); this.achievement('save'); }
        break;
      case 'final':
        this.showCenter(String(e.n), 0.9, 'final');
        audio.tension = 1;
        if (e.n <= 3) audio.say(String(e.n), true);
        break;
      case 'feed': {
        const k = e.a >= 0 ? this.byId.get(e.a) : null;
        const v = this.byId.get(e.v);
        if (!v) break;
        const col = (r: RosterInfo) => colorHex(TEAM_COLORS[r.team % TEAM_COLORS.length]);
        const row = h('div', { class: 'feed-row' + (e.v === this.localId || e.a === this.localId ? ' me' : '') });
        row.innerHTML = k
          ? `<b style="color:${col(k)}">${esc(k.name)}</b> 💥 sacó a <b style="color:${col(v)}">${esc(v.name)}</b>${e.as.length ? ` <small>+${e.as.map((a) => esc(this.byId.get(a)?.name ?? '')).join(', ')}</small>` : ''}`
          : `<b style="color:${col(v)}">${esc(v.name)}</b> se cayó solo 🙈`;
        this.feed.prepend(row);
        while (this.feed.children.length > 5) this.feed.lastChild?.remove();
        setTimeout(() => row.classList.add('out'), 6000);
        setTimeout(() => row.remove(), 6600);
        row.classList.add('in');
        if (e.v === this.localId) this.showCenter('¡RING-OUT!', 1.4, 'bad');
        else if (e.a === this.localId) this.showCenter('¡Lo sacaste!', 1.2, 'good');
        // Rachas y multi-kills (se calculan igual en todas las pantallas)
        const vs = this.streaks.get(e.v) ?? 0;
        this.streaks.set(e.v, 0);
        if (k) {
          if (!this.firstKo) {
            this.firstKo = true;
            this.announce('¡PRIMER RING-OUT!', k.name, 'first', 'Primer ring out');
          }
          if (vs >= 3) this.announce('¡RACHA CORTADA!', `${k.name} frenó a ${v.name}`, 'shutdown', 'Racha cortada');
          const st = (this.streaks.get(k.id) ?? 0) + 1;
          this.streaks.set(k.id, st);
          const mk = this.multi.get(k.id);
          const n = mk && t - mk.t <= 240 ? mk.n + 1 : 1;
          this.multi.set(k.id, { n, t });
          const multiTxt = ['', '', '¡DOBLE RING-OUT!', '¡TRIPLE RING-OUT!', '¡MASACRE!', '¡¡IMPARABLE!!'][Math.min(5, n)];
          if (multiTxt) this.announce(multiTxt, k.name, 'multi', multiTxt.replace(/[¡!]/g, ''));
          const streakTxt: Record<number, string> = { 3: '¡EN RACHA!', 5: '¡IMPARABLE!', 7: '¡LEYENDA!', 10: '¡DIOS DE LA CANTERA!' };
          if (streakTxt[st]) this.announce(streakTxt[st], `${k.name} · ${st} seguidos`, 'streak', streakTxt[st].replace(/[¡!]/g, ''));
          if (k.id === this.localId) {
            this.live.bestMulti = Math.max(this.live.bestMulti, n);
            this.live.bestStreak = Math.max(this.live.bestStreak, st);
            this.achievement('first_ko');
            if (n >= 2) this.achievement('double');
            if (n >= 3) this.achievement('triple');
            if (st >= 5) this.achievement('streak5');
            if (!multiTxt) audio.say('¡Afuera!');
          }
        }
        break;
      }
      case 'msg':
        this.showCenter(e.tx, 2, /FIN|Fin|Empate/.test(e.tx) ? 'fin' : '');
        if (/30/.test(e.tx)) { audio.tension = 0.7; audio.say('Últimos treinta segundos'); }
        else if (/minuto/.test(e.tx)) audio.say('Último minuto');
        else if (/Fin/.test(e.tx)) audio.say('¡Fin de la partida!', true);
        else if (/zona/.test(e.tx)) audio.say('La zona se movió');
        break;
      case 'count':
        if (e.n === 0) { this.showCenter('¡PELEEN!', 1, 'go'); audio.say('¡A pelear!', true); }
        else { this.showCenter(String(e.n), 0.95, 'count'); audio.say(String(e.n), true); }
        break;
      case 'lvl': if (e.id === this.localId) {
        const lv = e.l;
        const hero = HEROES[this.me!.hero];
        const unlocked = (['q', 'e', 'f', 'r'] as AbilitySlot[]).find((s) => hero.abilities[s].unlock === lv);
        const mutation = MUTATION_LEVELS.includes(lv);
        this.showCenter(`Nivel ${lv}${unlocked ? ` · ¡${hero.abilities[unlocked].name}!` : ''}${mutation ? ' · mutación disponible' : ''}`, 1.8, 'good');
      } break;
      case 'deny': if (e.id === this.localId) { this.deny.textContent = e.w; this.denyT = 1.6; } break;
      case 'stage': if (e.id === this.localId && e.s >= 2) this.showCenter(e.s >= 3 ? '¡DESTROZADO! Reparate (V)' : 'Quebrado', 1.2, 'bad'); break;
      case 'craft': if (e.id === this.localId) {
        const it = ITEM_BY_ID[e.w];
        this.showCenter(it ? `${it.icon} ${it.name}` : '🧬 ¡Mutación!', 1.2, 'good');
      } break;
    }
  }

  // ───────────── forja ─────────────

  toggleForge(open?: boolean) {
    this.forgeOpen = open ?? !this.forgeOpen;
    this.forge.classList.toggle('hidden', !this.forgeOpen);
    this.forgeKey = '';
    if (this.forgeOpen) this.renderForge();
  }

  private renderForge() {
    const me = this.lastMe, c = this.lastLocal;
    if (!me || !c || !this.me) return;
    const key = JSON.stringify([this.forgeTab, me.mats, me.pas, me.act, me.mut, me.slots, c.lv]);
    if (key === this.forgeKey) return;
    this.forgeKey = key;
    clear(this.forge);
    const hero = HEROES[this.me.hero];
    const fam = hero.family;
    const matsOf = (cost: Partial<Record<Family, number>>) => (Object.keys(cost) as Family[]).map((f) => {
      const have = me.mats[FAMILIES.indexOf(f)];
      return h('span', { class: 'cost' + (have >= (cost[f] ?? 0) ? '' : ' short'), style: { '--c': colorHex(FAMILY_COLORS[f]) } }, `${MAT_ICON[f]} ${cost[f]}`);
    });
    const tabs = h('div', { class: 'tabs' },
      h('button', { class: 'tab' + (this.forgeTab === 'items' ? ' on' : ''), onclick: () => { this.forgeTab = 'items'; this.forgeKey = ''; this.renderForge(); } }, 'Ítems'),
      h('button', { class: 'tab' + (this.forgeTab === 'mut' ? ' on' : ''), onclick: () => { this.forgeTab = 'mut'; this.forgeKey = ''; this.renderForge(); } }, `Mutaciones (${Object.keys(me.mut).length}/${me.slots})`),
      h('button', { class: 'x', onclick: () => this.toggleForge(false) }, '✕'),
    );
    const matsRow = h('div', { class: 'forge-mats' }, FAMILIES.map((f, i) => h('span', { class: 'cost', style: { '--c': colorHex(FAMILY_COLORS[f]) } }, `${MAT_ICON[f]} ${me.mats[i]}`)));
    let content: HTMLElement;
    if (this.forgeTab === 'items') {
      const owned = [...me.pas, ...me.act.filter(Boolean) as string[]];
      content = h('div', { class: 'items' },
        h('div', { class: 'owned' }, h('span', null, 'Equipado:'),
          owned.length ? owned.map((id) => h('button', { class: 'chip', title: 'Desarmar (devuelve 50%)', onclick: () => this.send({ c: 'sell', id }) }, `${ITEM_BY_ID[id].icon} ${ITEM_BY_ID[id].name} ✕`)) : h('em', null, 'nada todavía')),
        ...(['passive', 'active'] as const).map((kind) => h('div', { class: 'group' },
          h('h4', null, kind === 'passive' ? `Pasivos (${me.pas.length}/3)` : `Activos (${me.act.filter(Boolean).length}/3) · teclas 1-2-3`),
          ITEMS.filter((it) => it.kind === kind).map((it) => {
            const has = owned.includes(it.id);
            const full = kind === 'passive' ? me.pas.length >= 3 : !me.act.includes(null);
            const afford = (Object.keys(it.cost) as Family[]).every((f) => me.mats[FAMILIES.indexOf(f)] >= (it.cost[f] ?? 0));
            return h('div', { class: 'item' + (has ? ' has' : '') },
              h('div', { class: 'iicon' }, it.icon),
              h('div', { class: 'idesc' }, h('b', null, it.name, it.cd ? h('small', null, ` · ${it.cd}s`) : null), h('span', null, it.desc), h('div', { class: 'costs' }, matsOf(it.cost))),
              h('button', { class: 'btn small', disabled: has || full || !afford, onclick: () => this.send({ c: 'craft', id: it.id }) }, has ? 'Tenés' : 'Fabricar'),
            );
          }),
        )),
      );
    } else {
      const free = me.slots - Object.keys(me.mut).length;
      content = h('div', { class: 'muts' },
        h('p', { class: 'note' }, `Cada nivel ${MUTATION_LEVELS.join(', ')} habilita una mutación. Cuesta ${MUTATION_COST} ${MAT_ICON[fam]} ${FAMILY_NAMES[fam]} (tu material). Elegí cómo evoluciona una habilidad: ${free > 0 ? `te ${free === 1 ? 'queda 1' : `quedan ${free}`}.` : 'ahora no tenés slots libres.'}`),
        ...(['q', 'e', 'f', 'r'] as AbilitySlot[]).map((s) => {
          const a = hero.abilities[s];
          const cur = me.mut[s];
          const lockedA = c.lv < a.unlock;
          return h('div', { class: 'mutrow' + (cur ? ' done' : '') },
            h('div', { class: 'mname' }, h('span', { class: 'k' }, s.toUpperCase()), `${a.icon} ${a.name}`, cur ? h('em', { class: 'mut ' + cur }, ` · ${ROUTE_FLAVOR[fam][cur]} (${ROUTE_NAMES[cur]})`) : null),
            h('div', { class: 'routes' }, (['tank', 'carry', 'support'] as Route[]).map((r) =>
              h('button', {
                class: 'btn small route ' + r, title: ROUTE_DESC[r],
                disabled: !!cur || lockedA || free <= 0 || me.mats[FAMILIES.indexOf(fam)] < MUTATION_COST,
                onclick: () => this.send({ c: 'mutate', slot: s, route: r }),
              }, `${ROUTE_FLAVOR[fam][r]}`, h('small', null, ROUTE_NAMES[r])))),
          );
        }),
        h('div', { class: 'routeinfo' }, (['tank', 'carry', 'support'] as Route[]).map((r) => h('div', null, h('b', { class: 'mut ' + r }, ROUTE_NAMES[r] + ': '), ROUTE_DESC[r]))),
      );
    }
    this.forge.append(tabs, matsRow, content,
      h('div', { class: 'forge-foot' }, `V (mantener): reparar tu cuerpo · ${REPAIR_COST} ${MAT_ICON[fam]} → −${REPAIR_AMOUNT} heat. Rompé cobertura del mapa para juntar materiales.`));
  }

  // ───────────── tabla ─────────────

  showBoard(show: boolean) {
    this.board.classList.toggle('hidden', !show);
  }

  private renderBoard(w: WorldFrame) {
    const rows = [...this.roster].sort((a, b) => a.team - b.team).map((r) => {
      const c = w.chars.find((x) => x.id === r.id);
      const col = colorHex(TEAM_COLORS[r.team % TEAM_COLORS.length]);
      return `<tr class="${r.id === this.localId ? 'me' : ''}"><td><i style="background:${col}"></i>${esc(r.name)}${r.bot ? ' 🤖' : ''}</td><td>${HEROES[r.hero].name}</td><td>${c?.lv ?? 1}</td><td>${c?.k ?? 0}</td><td>${c?.d ?? 0}</td><td>${c?.a ?? 0}</td><td>${w.mode.id === 'stock' ? (c?.lives ?? 0) : '–'}</td></tr>`;
    }).join('');
    this.board.innerHTML = `<table><thead><tr><th>Jugador</th><th>Héroe</th><th>Nv</th><th>Sacó</th><th>Cayó</th><th>Asist.</th><th>Vidas</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ───────────── resultados ─────────────

  showResults(res: MatchResultInfo, isHost: boolean, onBack: () => void, onLeave: () => void, reward: MatchReward | null = null) {
    this.results?.remove();
    this.centerT = 0;
    this.center.style.opacity = '0';
    const me = this.me;
    const won = !res.draw && me && me.team === res.winner;
    const winnerName = res.draw ? 'Empate' : res.teams === 'ffa' ? res.players.find((p) => p.team === res.winner)?.name ?? '?' : `Equipo ${TEAM_NAMES[res.winner]}`;
    const score = (p: PlayerResult) => p.kills * 3 + p.assists + p.heatDealt / 100 + p.lethals + p.billiards * 2 + p.saves * 2;
    const mvp = [...res.players].sort((a, b) => score(b) - score(a))[0];
    const rows = [...res.players].sort((a, b) => a.team - b.team || b.kills - a.kills).map((p) => {
      const col = colorHex(TEAM_COLORS[p.team % TEAM_COLORS.length]);
      const hat = p.hat && p.hat !== 'none' ? HAT_BY_ID[p.hat]?.icon ?? '' : '';
      return `<tr class="${p.id === this.localId ? 'me' : ''}"><td><i style="background:${col}"></i>${hat} ${esc(p.name)}${p.bot ? ' 🤖' : ''}${p === mvp ? ' <span class="mvp">MVP</span>' : ''}</td><td>${HEROES[p.hero].name}</td><td>${p.level}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.assists}</td><td>${Math.round(p.heatDealt)}</td></tr>`;
    }).join('');
    // Premios: cada categoría la gana alguien (si hay algo que premiar).
    const award = (icon: string, title: string, key: (p: PlayerResult) => number, fmt: (v: number) => string) => {
      const best = [...res.players].sort((a, b) => key(b) - key(a))[0];
      if (!best || key(best) <= 0) return '';
      return `<div class="award${best.id === this.localId ? ' mine' : ''}"><div class="aw-ic">${icon}</div><b>${title}</b><span>${esc(best.name)}</span><em>${fmt(key(best))}</em></div>`;
    };
    const awards = [
      award('💥', 'Rey del ring-out', (p) => p.kills, (v) => `${v} sacados`),
      award('☠️', 'Verdugo', (p) => p.lethals, (v) => `${v} golpes letales`),
      award('🎱', 'Billarista', (p) => p.billiards, (v) => `${v} carambolas`),
      award('🚀', 'Cañón humano', (p) => p.bestLaunch, (v) => `lanzó a ${v} m/s`),
      award('🔨', 'Demoledor', (p) => p.destroyed, (v) => `${v} coberturas`),
      award('💎', 'Coleccionista', (p) => p.pickups, (v) => `${v} materiales`),
      award('🪂', 'Fénix', (p) => p.saves, (v) => `${v} salvadas`),
      award('🔥', 'Horno', (p) => p.heatDealt, (v) => `${Math.round(v)} de heat`),
    ].filter(Boolean).join('');

    const box = h('div', { class: 'results' });
    box.innerHTML = `
      <div class="res-title ${res.draw ? '' : won ? 'win' : 'lose'}">${res.draw ? '🤝 Empate' : won ? '🏆 ¡VICTORIA!' : me ? '💀 Derrota' : '🏁 Fin'}</div>
      <div class="res-sub" style="color:${res.draw ? '#fff' : colorHex(TEAM_COLORS[res.winner % TEAM_COLORS.length])}">${res.draw ? '' : 'Ganó: ' + esc(winnerName)}</div>
      <div class="res-reason">${esc(res.reason)} · duró ${fmtTime(res.duration)}</div>
      <div class="awards">${awards}</div>
      <table><thead><tr><th>Jugador</th><th>Héroe</th><th>Nv</th><th>Sacó</th><th>Cayó</th><th>Asist.</th><th>Heat</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="reward"></div>`;
    const btns = h('div', { class: 'res-buttons' },
      isHost ? h('button', { class: 'btn primary', onclick: onBack }, 'Volver al lobby') : h('div', { class: 'wait' }, 'Esperando que el host vuelva al lobby…'),
      h('button', { class: 'btn', onclick: onLeave }, 'Salir al menú'),
    );
    box.appendChild(btns);
    this.results = box;
    this.root.appendChild(box);
    if (won) this.confettiRain(120);
    if (reward) this.animateReward(box.querySelector('.reward') as HTMLElement, reward);
  }

  /** Desglose de XP de cuenta que suma de a una línea, con barra que se llena y sube de nivel. */
  private animateReward(el: HTMLElement, r: MatchReward) {
    el.innerHTML = `<div class="rw-lines"></div><div class="rw-total">+0 XP</div>
      <div class="rw-level"><span class="rw-lv">Nv ${r.fromLevel}</span><div class="rw-bar"><div></div></div><span class="rw-next"></span></div>
      <div class="rw-unlocks"></div>`;
    const lines = el.querySelector('.rw-lines')!, total = el.querySelector('.rw-total')!, bar = el.querySelector('.rw-bar div') as HTMLElement;
    const lvEl = el.querySelector('.rw-lv')!, nextEl = el.querySelector('.rw-next')!, unlocks = el.querySelector('.rw-unlocks')!;
    let sum = 0;
    let level = r.fromLevel, xp = r.fromXp;
    const setBar = () => {
      bar.style.width = `${Math.min(100, (xp / xpToNext(level)) * 100)}%`;
      lvEl.textContent = `Nv ${level}`;
      nextEl.textContent = `${Math.floor(xp)}/${xpToNext(level)}`;
    };
    setBar();
    r.xp.forEach((line, i) => {
      setTimeout(() => {
        lines.appendChild(h('div', { class: 'rw-line' }, h('span', null, line.label), h('b', null, `+${line.amount}`)));
        sum += line.amount;
        total.textContent = `+${sum} XP`;
        bump(total as HTMLElement);
        audio.play('coin', 0.5, 0, Math.pow(2, i / 12));
        // la barra avanza con cada línea
        xp += line.amount;
        while (xp >= xpToNext(level)) {
          xp -= xpToNext(level);
          level++;
          audio.play('levelup', 1);
          audio.say(`Nivel de cuenta ${level}`, true);
          const lvUp = h('div', { class: 'rw-levelup' }, `¡NIVEL DE CUENTA ${level}!`);
          el.appendChild(lvUp);
          this.confettiRain(60);
        }
        setBar();
      }, 700 + i * 380);
    });
    const after = 700 + r.xp.length * 380 + 300;
    setTimeout(() => {
      for (const id of r.newAchievements) {
        const a = ACH_BY_ID[id];
        if (a) unlocks.appendChild(h('div', { class: 'rw-unlock' }, `${a.icon} Logro: ${a.name}`));
      }
      for (const id of r.newHats) {
        const hat = HAT_BY_ID[id];
        if (hat) unlocks.appendChild(h('div', { class: 'rw-unlock hat' }, `${hat.icon} Sombrero nuevo: ${hat.name} (elegilo en el lobby)`));
      }
      if (r.newAchievements.length || r.newHats.length) audio.play('jackpot', 0.9);
    }, after);
  }

  /** Lluvia de confeti en pantalla (DOM, barato). */
  confettiRain(n: number) {
    const colors = ['#ff4f8b', '#ffe14a', '#4fd1ff', '#7dff6a', '#b070ff', '#ff8a3d'];
    for (let i = 0; i < n; i++) {
      const c = h('i', { class: 'confetti' });
      c.style.left = `${Math.random() * 100}vw`;
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = `${Math.random() * 0.8}s`;
      c.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
      c.style.setProperty('--dx', `${(Math.random() - 0.5) * 200}px`);
      c.style.setProperty('--rot', `${Math.random() * 1080 - 540}deg`);
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4000);
    }
  }

  dispose() { this.root.remove(); }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const COMBO_TIERS: [number, string][] = [[3, '¡Combo!'], [5, '¡Brutal!'], [8, '¡Salvaje!'], [12, '¡Bestial!'], [16, '¡INHUMANO!'], [22, '¡¡RUBBLE!!']];

/** Reinicia la animación CSS de un elemento. */
function restart(el: HTMLElement) {
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

function bump(el: HTMLElement) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}
