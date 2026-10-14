// HUD de partida + Forja + Tabla + pantalla de resultados. Las teclas que muestra salen de game/keybinds.ts.
import { DASH_CD, REPAIR_AMOUNT, REPAIR_COST, STAGE_NAMES, TEAM_COLORS, TEAM_NAMES, MUTATION_LEVELS } from '../core/constants';
import { SLOTS } from '../core/entities';
import type { SimEvent, TimedEvent } from '../core/events';
import { HEROES } from '../core/heroes';
import { ITEMS, ITEM_BY_ID, ITEM_TAGS, type ItemTag } from '../core/items';
import { gameOf, LOBBY_OPTIONS, MODE_INFO } from '../core/games';
import { CRATE_INFO, CRATE_KINDS, MISSIONS } from '../core/horde';
import type { CupInfo } from '../core/cup';
import { MAPS } from '../core/maps';
import { lapTime } from '../core/race';
import { PERK_IDS, PERKS } from '../core/perks';
import { SHOT_CRIT, WEAPON_IDS, WEAPONS } from '../core/weapons';
import { MUTATION_COST, ROUTE_DESC, ROUTE_FLAVOR } from '../core/mutations';
import type { MatchResultInfo, PlayerResult, RosterInfo } from '../core/protocol';
import type { Command } from '../core/sim';
import { F_DEAD, F_ELIMINATED, F_SHIELD, F_ULTREADY, type CharFrame, type MeFrame, type WorldFrame } from '../core/snapshot';
import { unlockLevel, usesUltCharge, type Ruleset } from '../core/rules';
import { iconHtml, iconNode } from '../assets/registry';
import { tip } from './tooltip';
import { abilityTip, basicTip, c4Tip, dashTip, grabTip, gunTip, itemIdTip, itemTip, levelTip, matTip, perkTip, pushTip, recallTip, routeTip, healthTip, stageTip, swapTip, ultBarTip } from './tips';
import { FAMILIES, FAMILY_COLORS, FAMILY_NAMES, ROUTE_NAMES, type AbilitySlot, type Family, type Route } from '../core/types';
import { audio } from '../audio/audio';
import { ACH_BY_ID, unlock, xpToNext, type MatchContext, type MatchReward } from '../game/profile';
import { HAT_BY_ID } from '../core/cosmetics';
import { clear, colorHex, fmtTime, h } from './dom';
import { Minimap } from './minimap';
import { fullscreenButton } from './fullscreen';
import { keyName, type ActionId } from '../game/keybinds';
import type { Terrain } from '../core/terrain';
import { F_RECALL } from '../core/snapshot';
import { RECALL_TIME } from '../core/constants';

const MAT_ICON: Record<Family, string> = { stone: '🪨', metal: '🔩', crystal: '💎', goo: '🟢' };
/** Tecla que se muestra en cada casillero: el mouse es fijo, el resto sale de las teclas asignadas. */
/** Avisos del host que llegan como código (los que son texto se muestran tal cual). */
const DENY_TEXT: Record<string, string> = {
  weapon: 'Todavía no tenés otra arma: agarrá una caja de suministros',
  c4: 'Sin cargas de C4: vienen en las cajas 🧨',
};
const keyFor = (slot: string) => (slot === 'basic' ? 'Clic' : slot === 'push' ? 'Clic D' : keyName(slot as ActionId));

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
  private gunEl: HTMLElement | null = null;
  // Mejoras de la Horda: las tres cartas para elegir, la fila de las que ya tenés y la marca de impacto en el cursor.
  private perkEl = h('div', { class: 'hud-perks' });
  private perkRow = h('div', { class: 'perkrow' });
  private hitEl = h('div', { class: 'hud-hit' });
  // Carrera: el puesto en grande, la pista y la copa que se está corriendo.
  private posEl = h('div', { class: 'hud-pos' });
  private lastRank = 0;
  private mapName = '';
  private cup: CupInfo | null = null;
  private nextTimer: ReturnType<typeof setInterval> | null = null;
  private mouse = { x: 0, y: 0 };
  private hitT = 0;
  /** Controles táctiles a la vista: cambia el acomodo y los carteles ya no nombran teclas. */
  touch = false;
  /** Botón de pausa de los controles táctiles (con teclado es Esc). */
  onPause: () => void = () => {};
  /** Bajas seguidas con armas (se corta al rato sin bajar a nadie). */
  private spree = 0;
  private spreeT = 0;
  private spreeTier = -1;
  private slotEls = new Map<string, { root: HTMLElement; cd: HTMLElement; txt: HTMLElement; lock: HTMLElement; icon: HTMLElement; mut: HTMLElement }>();
  private lastMe: MeFrame | null = null;
  private lastLocal: CharFrame | null = null;
  private lastMode = '';
  private forgeTab: 'items' | 'mut' = 'items';
  private forgeFilter: ItemTag | 'all' = 'all';
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
  live = { bestCombo: 0, bestMulti: 0, bestStreak: 0, mutations: 0, bestSpree: 0 };
  onFlash: (color: number, amount: number) => void = () => {};

  constructor(
    parent: HTMLElement,
    private roster: RosterInfo[],
    private localId: number,
    private rules: Ruleset,
    private send: (c: Command) => void,
    terrain?: Terrain,
  ) {
    for (const r of roster) this.byId.set(r.id, r);
    this.root = h('div', { class: 'hud' });
    const bottom = h('div', { class: 'hud-bottom' }, this.body, h('div', { class: 'hud-mid' }, this.perkEl, this.deny, this.perkRow, this.bar, this.hint), h('div', { class: 'hud-right' }, this.mats));
    this.forge = h('div', { class: 'forge hidden' });
    this.board = h('div', { class: 'board hidden' });
    // Botón chico de pantalla completa arriba a la derecha (el menú de pausa también lo tiene).
    const fs = fullscreenButton('fs-mini');
    // Con los dedos no hay Esc ni Tab: van como botones (solo se ven con los controles táctiles).
    const corner = h('div', { class: 'touch-top' },
      h('button', { class: 'tt-btn', onclick: () => this.onPause() }, '☰'),
      h('button', { class: 'tt-btn', onclick: () => this.showBoard(this.board.classList.contains('hidden')) }, '📋'));
    this.root.append(this.top, this.feed, this.center, this.sub, this.status, this.net, fs, corner, this.comboEl, this.posEl, this.announceEl, this.achEl, bottom, this.forge, this.board);
    this.root.classList.toggle('guns', rules.weapons);
    this.root.classList.toggle('no-abil', !rules.abilities && !rules.weapons);
    this.root.classList.toggle('has-mats', rules.pickups === 'materials');
    this.mapName = terrain?.def.name ?? '';
    if (rules.weapons) {
      this.root.append(this.hitEl);
      window.addEventListener('mousemove', this.onMouse, { passive: true });
    }
    parent.appendChild(this.root);
    this.buildBar();
    if (rules.pickups === 'materials') this.buildMats();
    else this.mats.style.display = 'none';
    if (terrain && terrain.cores.length) {
      this.minimap = new Minimap(terrain, this.me?.team ?? 0);
      this.minimap.setTeams(new Map(roster.map((r) => [r.id, r.team])));
      this.mats.parentElement?.prepend(this.minimap.el);
    }
    this.renderHints();
    tip(this.body, () => this.bodyTip());
    this.body.addEventListener('mouseover', (e) => {
      const part = (e.target as HTMLElement).closest?.('[data-part]') as HTMLElement | null;
      this.hoverPart = (part?.dataset.part as typeof this.hoverPart) ?? null;
    });
  }

  /** Tooltip del panel de tu personaje: según dónde esté el mouse (etapa, nivel/ulti). */
  private hoverPart: 'stage' | 'level' | 'ult' | null = null;
  private bodyTip(): string {
    const c = this.lastLocal, me = this.lastMe, r = this.me;
    if (!c || !me || !r) return '';
    if (this.hoverPart === 'level' && this.rules.progression) return levelTip(c.lv, me.xp, me.xpNext, r.hero);
    if (this.hoverPart === 'ult' && this.rules.ultCharge) return ultBarTip(me.ult);
    return this.rules.health ? healthTip(c.hp, c.mh, c.st) : stageTip(c.st, c.heat);
  }

  get me(): RosterInfo | undefined { return this.byId.get(this.localId); }

  /** Pone o saca el acomodo para controles táctiles. */
  setTouch(on: boolean) {
    this.touch = on;
    this.root.classList.toggle('touch', on);
  }

  /** El casillero de una acción (los controles táctiles los usan de botones). */
  slot(id: string): HTMLElement | null {
    return id === 'basic' && this.gunEl ? this.gunEl : this.slotEls.get(id)?.root ?? null;
  }

  /** Con controles táctiles no hay cursor: la marca de impacto va donde se está apuntando. */
  pointer(x: number, y: number) {
    const r = this.root.getBoundingClientRect();
    this.mouse.x = x + r.left;
    this.mouse.y = y + r.top;
  }

  /** " (tecla)" para los carteles. Con controles táctiles no hay teclas que nombrar. */
  private keyTag(a: ActionId) { return this.touch ? '' : ` (${keyName(a)})`; }

  private renderHints() {
    const r = this.rules;
    const k = (a: ActionId) => `<b>${keyName(a)}</b>`;
    const hints = [r.weapons ? `<b>clic izq</b> disparar (mantené) · <b>clic der</b> empujón · ${k('q')} cambiar arma · ${k('r')} C4` : r.abilities ? `${k('q')} ${k('e')} ${k('f')} ${k('r')} apuntan · <b>clic izq</b> lanza · <b>clic der</b> cancela` : '<b>clic izq</b> golpe · <b>clic der</b> empujón', r.itemBoxes && `${k('i1')} ${k('i2')} ${k('i3')} ítems de las cajas`, r.dash && `${k('dash')} dash`, r.recall && `${k('recall')} volver a la base`, r.crafting && `${k('forge')} forja${r.forgeAtBase ? ' (en tu base)' : ''}`, r.repair && `${k('repair')} reparar`, `${k('board')} tabla`, '<b>Esc</b> menú'];
    this.hint.innerHTML = hints.filter(Boolean).join(' · ');
  }

  /** Se cambiaron las teclas (Ajustes): actualizar lo que las muestra. */
  refreshKeys() {
    for (const [slot, el] of this.slotEls) {
      const key = el.root.querySelector('.key');
      if (key) key.textContent = keyFor(slot);
    }
    this.renderHints();
  }

  private minimap: Minimap | null = null;
  /** ¿Tu personaje está en tu base? (Asedio: la forja solo funciona ahí). Lo actualiza la partida. */
  atBase = true;

  /** Aviso local (no hace falta ir al host): "no se puede lanzar esto ahora". */
  localDeny(text: string) {
    this.deny.textContent = text;
    this.denyT = 1.6;
  }

  private armedKey: string | null = null;
  /** Resalta la habilidad/ítem armado (se está apuntando). */
  setArmed(k: string | null) {
    if (k === this.armedKey) return;
    if (this.armedKey) this.slotEls.get(this.armedKey)?.root.classList.remove('armed');
    this.armedKey = k;
    if (k) this.slotEls.get(k)?.root.classList.add('armed');
  }

  private buildBar() {
    const me = this.me;
    if (!me) { this.bar.style.display = 'none'; return; }
    const hero = HEROES[me.hero];
    const mk = (slot: string, icon: Node, content: () => string, extra = '') => {
      const cd = h('div', { class: 'cd' });
      const txt = h('div', { class: 'cdt' });
      const lock = h('div', { class: 'lock' });
      const ic = h('div', { class: 'ic' }, icon);
      const mut = h('div', { class: 'mut' });
      const root = tip(h('div', { class: 'slot ' + extra, 'data-slot': slot }, ic, cd, txt, lock, mut, h('div', { class: 'key' }, keyFor(slot))), content);
      this.slotEls.set(slot, { root, cd, txt, lock, icon: ic, mut });
      return root;
    };
    const abilityContent = (s: AbilitySlot) => () => abilityTip(me.hero, s, this.rules, { mut: this.lastMe?.mut[s], level: this.lastLocal?.lv, ult: this.lastMe?.ult });
    // Lo que con teclado no necesita casillero (saltar, reparar, abrir la forja) y con los dedos sí.
    const only = (slot: string, icon: string, what: string) => { const el = mk(slot, document.createTextNode(icon), () => what, 'touch-only'); return el; };
    const extra = [
      this.rules.jump ? only('jump', '⬆️', this.rules.maxAirJumps > 0 ? '<b>Saltar</b><p>En el aire: segundo salto.</p>' : '<b>Saltar</b><p>Un solo salto, flotante.</p>') : null,
      this.rules.repair ? only('repair', '🔧', '<b>Reparar</b><p>Mantené apretado.</p>') : null,
      this.rules.crafting ? only('forge', '⚒️', '<b>Forja</b>') : null,
    ];
    if (this.rules.weapons) {
      // Armas: el arma en la mano con sus balas y las dos teclas que quedan (cambiar de arma y C4).
      this.gunEl = tip(h('div', { class: 'gunbox', 'data-slot': 'basic' }), () => gunTip(this.lastLocal?.wp ?? 0));
      this.bar.append(...[
        this.gunEl,
        mk('push', iconNode('icon.push', '🫸'), pushTip, 'small'),
        this.rules.dash ? mk('dash', iconNode('icon.dash', '💨'), () => dashTip(this.rules.dashCd), 'small') : null,
        h('div', { class: 'sep' }),
        mk('q', document.createTextNode('🔁'), () => swapTip(this.lastLocal?.wp === 0 ? this.lastMe?.pri ?? -1 : 0)),
        mk('r', document.createTextNode('🧨'), c4Tip),
        ...extra,
      ].filter((x): x is HTMLDivElement => !!x));
      return;
    }
    this.bar.append(...[
      this.rules.grab
        ? mk('basic', document.createTextNode('🤝'), grabTip, 'small')
        : mk('basic', iconNode(`icon.basic.${me.hero}`, hero.basic.kind === 'melee' ? '👊' : '🎯'), () => basicTip(me.hero), 'small'),
      mk('push', iconNode('icon.push', '🫸'), pushTip, 'small'),
      this.rules.dash ? mk('dash', iconNode('icon.dash', '💨'), () => dashTip(this.rules.dashCd), 'small') : null,
      this.rules.recall ? mk('recall', iconNode('icon.recall', '🏠'), recallTip, 'small') : null,
      this.rules.abilities ? h('div', { class: 'sep' }) : null,
      ...(this.rules.abilities ? (['q', 'e', 'f', 'r'] as AbilitySlot[]).map((s) => mk(s, iconNode(`icon.ability.${me.hero}.${s}`, hero.abilities[s].icon), abilityContent(s), s === 'r' ? 'ult' : '')) : []),
      this.rules.crafting || this.rules.itemBoxes ? [
        h('div', { class: 'sep' }),
        ...[0, 1, 2].map((i) => mk(`i${i + 1}`, document.createTextNode(''), () => itemIdTip(this.lastMe?.act[i] ?? null), 'item')),
      ] : [],
      ...extra,
    ].flat().filter((x): x is HTMLDivElement => !!x));
  }

  update(w: WorldFrame, local: CharFrame | null, me: MeFrame | null, dt: number, net: { ping: number; fps: number; showFps: boolean; kind: string }) {
    this.lastMe = me;
    this.lastLocal = local;
    this.lastMode = w.mode.id;
    this.renderTop(w);
    this.renderCenter(w, local, dt);
    this.minimap?.draw(w, this.localId, dt);
    if (local && me) {
      this.renderBody(local, me);
      this.renderBar(local, me);
      this.renderMats(me);
      if (this.forgeOpen) this.renderForge();
    }
    if (this.rules.weapons) this.renderPerks(me, w.phase === 'play');
    this.denyT -= dt;
    this.deny.style.opacity = this.denyT > 0 ? '1' : '0';
    this.tickJuice(w, local, me, dt);
    this.net.textContent = (net.ping > 0 ? `${Math.round(net.ping)} ms` : net.kind === 'host' ? 'host' : '') + (net.showFps ? ` · ${Math.round(net.fps)} fps` : '');
    if (!this.board.classList.contains('hidden')) this.renderBoard(w);
  }

  private renderTop(w: WorldFrame) {
    const m = w.mode;
    if (m.moba) { this.renderMobaTop(w); return; }
    if (m.horde) {
      // Horda: la oleada, las vidas del equipo y la misión en curso con su barra.
      const hd = m.horde;
      const mi = MISSIONS[Math.min(hd.step, MISSIONS.length - 1)];
      const pct = Math.round(hd.p * 100);
      const boss = mi.kind === 'boss';
      let state: string;
      if (hd.step >= MISSIONS.length) state = '¡adentro!';
      else if (mi.kind === 'nests') state = hd.nests === 1 ? 'queda 1' : `quedan ${hd.nests}`;
      else if (mi.kind === 'fetch') state = `${Math.round(hd.p * mi.need)}/${mi.need}`;
      else if (boss) state = `${100 - pct}% de vida`;
      else if (hd.in < hd.need) state = mi.kind === 'extract' ? `adentro ${hd.in} de ${hd.need}` : 'entrá a la zona';
      else state = m.zone?.contested ? `⚔️ con zombis adentro · ${pct}%` : `${pct}%`;
      const wave = hd.wave === 0 ? `la horda llega en ${hd.next} s` : `oleada ${hd.wave} · próxima en ${hd.next} s · ${hd.left} zombis`;
      const html = `<div class="mode">Horda · ${wave}</div>`
        + `<div class="scores"><span class="score" style="--c:${colorHex(TEAM_COLORS[0])}"><i></i>Vidas <b>${hd.lives}</b></span><span class="score" style="--c:#8fd14f"><i></i>Zombis caídos <b>${m.scores[1] ?? 0}</b></span></div>`
        + `<div class="mission${boss ? ' boss' : ''}"><em>Misión ${Math.min(hd.step + 1, MISSIONS.length)}/${MISSIONS.length}</em><b>${mi.title}</b><span class="mbar"><i style="width:${boss ? 100 - pct : pct}%"></i></span><small>${state}</small></div>`;
      if (this.top.innerHTML !== html) this.top.innerHTML = html;
      return;
    }
    if (m.race) {
      const rc = m.race;
      const idx = this.roster.findIndex((r) => r.id === this.localId);
      const place = rc.order.indexOf(this.localId);
      const rank = idx >= 0 ? rc.rank[idx] ?? 0 : 0;
      const col = (r: RosterInfo) => colorHex(TEAM_COLORS[r.team % TEAM_COLORS.length]);
      const cup = this.cup ? ` · 🏆 pista ${this.cup.round + 1}/${this.cup.maps.length}` : '';
      const clock = rc.end >= 0 ? `<b class="bad">termina en ${Math.ceil(m.time)} s</b>` : `<span class="time">${lapTime(rc.t)}</span>`;
      // La pista en una tira: un punto por corredor, de la salida a la meta (el tuyo va arriba de todos).
      const dots = this.roster.map((r, i) => ({ r, s: m.scores[i] ?? 0 })).sort((a, b) => +(a.r.id === this.localId) - +(b.r.id === this.localId))
        .map(({ r, s }) => `<i class="${r.id === this.localId ? 'me' : ''}" style="left:${s}%;--c:${col(r)}"></i>`).join('');
      const board = this.roster.map((r, i) => ({ r, rk: rc.rank[i] ?? 0, fin: rc.order.indexOf(r.id) })).sort((a, b) => a.rk - b.rk)
        .map(({ r, rk, fin }) => `<span class="score${r.id === this.localId ? ' me' : ''}" style="--c:${col(r)}"><em>${rk}º</em>${esc(r.name)}${fin >= 0 ? ` <b>🏁 ${lapTime(rc.times[fin] ?? 0)}</b>` : ''}</span>`).join('');
      const html = `<div class="mode">🏁 ${esc(this.mapName || 'Carrera')}${cup} · ${clock}</div><div class="rstrip">${dots}<b>🏁</b></div><div class="scores race">${board}</div>`;
      if (this.top.innerHTML !== html) this.top.innerHTML = html;
      // El puesto, bien grande: es lo que mirás de reojo mientras corrés.
      const show = idx >= 0 && this.roster.length > 1 && w.phase !== 'end';
      this.posEl.classList.toggle('on', show);
      if (show) {
        const pos = `<b>${rank}<sup>º</sup></b><span>${place >= 0 ? '¡llegaste!' : `de ${this.roster.length} · puerta ${Math.min((rc.next[idx] ?? 0) + 1, rc.gates)}/${rc.gates}`}</span>`;
        if (this.posEl.innerHTML !== pos) this.posEl.innerHTML = pos;
        this.posEl.classList.toggle('p1', rank === 1);
        if (rank !== this.lastRank) {
          // Pasaste a alguien (o te pasaron).
          if (this.lastRank && w.phase === 'play' && place < 0) {
            if (rank < this.lastRank) { bump(this.posEl); audio.play('coin', 0.5, 0, 1.6); } else audio.play('tick', 0.35, 0, 0.7);
          }
          this.lastRank = rank;
        }
      }
      return;
    }
    const teams = m.scores.map((s, i) => {
      const r = this.roster.find((x) => x.team === i);
      const label = this.roster.length && this.isFfa() ? esc(r?.name ?? `J${i + 1}`) : TEAM_NAMES[i];
      return `<span class="score" style="--c:${colorHex(TEAM_COLORS[i % TEAM_COLORS.length])}"><i></i>${label} <b>${s}</b></span>`;
    }).join('');
    const zone = m.zone ? `<div class="zone-info">${m.zone.contested ? '⚔️ Disputada' : m.zone.owner >= 0 ? 'Zona de ' + (this.isFfa() ? esc(this.roster.find((x) => x.team === m.zone!.owner)?.name ?? '') : TEAM_NAMES[m.zone.owner]) : 'Zona libre'} · se mueve en ${Math.ceil(m.zone.next)} s</div>` : '';
    const html = `<div class="mode">${MODE_INFO[m.id]?.name ?? m.title} · <span class="time">${fmtTime(m.time)}</span> · meta ${m.target} ${m.label}</div><div class="scores">${teams}</div>${zone}`;
    if (this.top.innerHTML !== html) this.top.innerHTML = html;
  }

  /** Asedio: torres y núcleo de cada equipo, próxima oleada y estado del Coloso. */
  private renderMobaTop(w: WorldFrame) {
    const m = w.mode, mb = m.moba!;
    const side = (t: number) => {
      const col = colorHex(TEAM_COLORS[t % TEAM_COLORS.length]);
      const towers = w.structs.filter((s) => s.k === 'tower' && s.tm === t);
      const core = w.structs.find((s) => s.k === 'core' && s.tm === t);
      const lost = Math.max(0, m.target - 1 - towers.length);
      const pips = towers.map((s) => `<i class="tw${s.fl & 1 ? ' prot' : ''}" title="Torre" style="--h:${Math.round(s.hp * 100)}%"></i>`).join('') + '<i class="tw down"></i>'.repeat(lost);
      const coreTxt = core ? `<span class="core${core.fl & 1 ? ' prot' : ''}"><em style="width:${Math.round(core.hp * 100)}%"></em>${core.fl & 1 ? '🛡️' : '💠'} ${Math.round(core.hp * 100)}%</span>` : '<span class="core down">💥</span>';
      return `<span class="side" style="--c:${col}"><b>${TEAM_NAMES[t]}</b>${pips}${coreTxt}</span>`;
    };
    const [alive, colosoT, bless, blessT] = mb.coloso;
    const extra = mb.sudden ? '<b class="bad">⚠️ ¡MUERTE SÚBITA! Núcleos expuestos</b>'
      : bless >= 0 ? `✨ Bendición del Coloso: <b style="color:${colorHex(TEAM_COLORS[bless])}">${TEAM_NAMES[bless]}</b> · ${fmtTime(blessT)}`
      : alive ? '🗿 <b>¡El Coloso está despierto!</b>' : colosoT > 0 ? `🗿 Coloso en ${fmtTime(colosoT)}` : '';
    const html = `<div class="mode">Asedio · <span class="time">${fmtTime(m.time)}</span> · oleada en ${mb.wave} s</div>
      <div class="moba-bar">${side(0)}<span class="vs">⚔️</span>${side(1)}</div>${extra ? `<div class="zone-info">${extra}</div>` : ''}`;
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
    else if (local.fl & F_RECALL) sub = `🏠 Volviendo a la base… ${Math.max(0, (1 - local.ch) * RECALL_TIME).toFixed(1)} s`;
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
    const state = this.rules.health
      ? `<div class="hpbar s${c.st}" data-part="stage"><div class="fill" style="width:${Math.round(c.hp * 100)}%"></div><span>❤ ${Math.ceil(c.hp * c.mh)}</span></div>`
      : `<div class="bodystate s${c.st}" data-part="stage"><span>${STAGE_NAMES[c.st]}</span><div class="pips">${pips}</div><em>${c.heat}</em></div>`;
    const repair = me.rep > 0 ? `<div class="repair"><div style="width:${Math.round(me.rep * 100)}%"></div></div>` : '';
    let progress: string;
    if (this.rules.progression) {
      const xpPct = me.xpNext > me.xpPrev ? Math.min(100, ((me.xp - me.xpPrev) / (me.xpNext - me.xpPrev)) * 100) : 100;
      progress = `<div class="xp" data-part="level"><div style="width:${xpPct}%"></div></div>
      <div class="xpt" data-part="level">${c.lv >= 10 ? 'Nivel máximo' : `Nivel ${c.lv} · XP ${me.xp}/${me.xpNext}`}${this.rules.crafting && me.slots > Object.keys(me.mut).length ? ` · <b class="glow">¡Mutación disponible!${this.keyTag('forge')}</b>` : ''}</div>`;
    } else if (this.rules.ultCharge) {
      const full = me.ult >= 1;
      progress = `<div class="xp ult${full ? ' full' : ''}" data-part="ult"><div style="width:${Math.round(me.ult * 100)}%"></div></div>
      <div class="xpt" data-part="ult">${full ? `<b class="glow">⚡ ¡Ulti lista!${this.keyTag('r')}</b>` : `⚡ Ulti ${Math.floor(me.ult * 100)}%`}</div>`;
    } else progress = '';
    const html = `
      <div class="portrait" style="--c:${colorHex(FAMILY_COLORS[fam])}">
        <div class="lvl" data-part="level">${this.rules.progression ? c.lv : iconHtml(`icon.mat.${fam}`, MAT_ICON[fam])}</div>
        <div class="who"><b>${hero.name}</b><span>${FAMILY_NAMES[fam]} · ${hero.role}</span></div>
      </div>
      ${state}
      ${c.fl & F_SHIELD ? `<div class="shieldtag">🛡️ Escudo ${c.sh}</div>` : ''}
      ${repair}
      ${progress}`;
    if (this.body.innerHTML !== html) this.body.innerHTML = html;
    // Destello al recibir daño: el panel se sacude y se tiñe de rojo un instante.
    if (this.rules.health && c.hp < this.lastHp - 0.001) { this.body.classList.add('flash'); restart(this.body); }
    this.lastHp = c.hp;
  }

  private lastHp = 1;

  /** Armas: el arma en la mano con sus balas, a cuál cambia la tecla y cuántas cargas de C4 quedan. */
  private renderGuns(c: CharFrame, me: MeFrame) {
    const cur = WEAPONS[WEAPON_IDS[c.wp] ?? 'pistol'];
    const ammo = cur.ammo > 0 ? String(me.am) : '∞';
    const key = `${cur.id}|${ammo}`;
    if (this.gunEl && this.gunEl.dataset.k !== key) {
      const low = cur.ammo > 0 && me.am <= cur.ammo * 0.2;
      this.gunEl.dataset.k = key;
      this.gunEl.innerHTML = `<span class="gun-ic">${cur.icon}</span><div class="gun-info"><b>${cur.name}</b><span class="gun-ammo${low ? ' low' : ''}">${ammo}</span></div><div class="key">Clic</div>`;
    }
    const q = this.slotEls.get('q');
    if (q) {
      const other = c.wp === 0 ? (me.pri >= 0 ? WEAPONS[WEAPON_IDS[me.pri]] : null) : WEAPONS.pistol;
      if (q.icon.dataset.item !== (other?.id ?? '')) { q.icon.dataset.item = other?.id ?? ''; q.icon.textContent = other ? other.icon : '🔁'; }
      q.root.classList.toggle('off', !other);
      // Las balas del arma que tenés guardada.
      q.mut.textContent = other && other.ammo > 0 ? String(me.am) : '';
      q.mut.className = 'mut ammo';
    }
    const r = this.slotEls.get('r');
    if (r) {
      r.mut.textContent = `×${me.c4}`;
      r.mut.className = 'mut ammo';
      r.root.classList.toggle('off', me.c4 <= 0);
    }
  }

  /** Mejoras: las cartas para elegir (si hay una oferta) y la fila de las que ya tenés. */
  private renderPerks(me: MeFrame | null, playing: boolean) {
    const offer = playing && me ? me.of : [];
    const key = offer.join(',');
    if (this.perkEl.dataset.k !== key) {
      this.perkEl.dataset.k = key;
      clear(this.perkEl);
      this.perkEl.classList.toggle('on', offer.length > 0);
      if (offer.length && me) {
        this.perkEl.append(
          h('div', { class: 'perk-head' }, 'Elegí una mejora ', h('b', null, '')),
          h('div', { class: 'perk-cards' }, offer.map((idx, i) => {
            const p = PERKS[PERK_IDS[idx]];
            const lv = me.pk[idx] ?? 0;
            return h('button', { class: 'perk-card', onclick: () => this.pickPerk(i) },
              h('span', { class: 'pk-key' }, String(i + 1)),
              h('span', { class: 'pk-ic' }, p.icon),
              h('b', null, p.name),
              h('small', null, p.desc),
              p.max > 1 && p.max < 10 ? h('em', null, lv ? `nivel ${lv} → ${lv + 1}` : `hasta nivel ${p.max}`) : null);
          })),
        );
        audio.play('perkoffer', 0.7);
      }
    }
    if (offer.length && me) {
      const b = this.perkEl.querySelector('.perk-head b');
      const t = `${me.ot} s`;
      if (b && b.textContent !== t) { b.textContent = t; b.classList.toggle('low', me.ot <= 5); }
    }
    const owned = me ? me.pk.map((n, i) => (n > 0 ? `${i}:${n}` : '')).filter(Boolean).join(',') : this.perkRow.dataset.k ?? '';
    if (this.perkRow.dataset.k !== owned) {
      this.perkRow.dataset.k = owned;
      clear(this.perkRow);
      me?.pk.forEach((n, i) => {
        const p = PERKS[PERK_IDS[i]];
        if (n > 0 && p) this.perkRow.append(tip(h('span', { class: 'pk' }, p.icon, n > 1 ? h('i', null, String(n)) : null), () => perkTip(p.id, n)));
      });
    }
  }

  private pickPerk(i: number) {
    if (!this.perkEl.classList.contains('on')) return;
    // Se esconden ya: la respuesta del host tarda un instante y no hay que elegir dos veces.
    this.perkEl.classList.remove('on');
    this.send({ c: 'perk', i });
  }

  /** Con una oferta en pantalla, las teclas 1, 2 y 3 eligen. Devuelve true si la tecla se usó para eso. */
  perkKey(code: string): boolean {
    const m = /^(?:Digit|Numpad)([1-3])$/.exec(code);
    if (!m || !this.perkEl.classList.contains('on') || Number(m[1]) > (this.lastMe?.of.length ?? 0)) return false;
    this.pickPerk(Number(m[1]) - 1);
    return true;
  }

  private onMouse = (e: MouseEvent) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; };

  /** Marca en el cursor: tus balas dieron (0), fue un crítico (1) o bajaste a uno (2). La más importante gana por un instante. */
  private hitMark(rank: 0 | 1 | 2) {
    const now = performance.now();
    if (rank < this.hitRank && now - this.hitT < 140) return;
    this.hitT = now;
    this.hitRank = rank;
    const r = this.root.getBoundingClientRect();
    this.hitEl.style.left = `${this.mouse.x - r.left}px`;
    this.hitEl.style.top = `${this.mouse.y - r.top}px`;
    this.hitEl.className = 'hud-hit on ' + ['', 'crit', 'kill'][rank];
    restart(this.hitEl);
  }
  private hitRank = 0;

  /** Bajaste a un zombi: suma a la racha, que se muestra donde va el combo. */
  private onSpree() {
    this.spree++;
    this.spreeT = SPREE_TIME;
    this.live.bestSpree = Math.max(this.live.bestSpree, this.spree);
    if (this.spree < 3) return;
    const tier = SPREE_TIERS.filter((t) => this.spree >= t[0]).length - 1;
    const label = tier >= 0 ? SPREE_TIERS[tier][1] : 'bajas';
    this.comboEl.innerHTML = `<b>x${this.spree}</b><span>${label}</span>`;
    this.comboEl.className = `hud-combo on t${Math.max(0, tier)}`;
    restart(this.comboEl);
    if (tier > this.spreeTier) {
      this.spreeTier = tier;
      audio.play('combo', 0.6, 0, Math.pow(2, tier / 6));
      audio.say(label.replace(/[¡!]/g, ''));
      this.onFlash([0xffe14a, 0xff8a3d, 0xff4f8b, 0xb070ff, 0x4fd1ff, 0xffffff][tier] ?? 0xffffff, 0.12 + tier * 0.04);
    }
  }

  private renderBar(c: CharFrame, me: MeFrame) {
    const hero = HEROES[this.me!.hero];
    if (this.rules.weapons) this.renderGuns(c, me);
    SLOTS.forEach((slot, i) => {
      const el = this.slotEls.get(slot);
      if (!el) return;
      const rem = me.cd[i], max = me.cdm[i] || 1;
      let locked = false, lockTxt = '';
      if (this.rules.abilities && (slot === 'q' || slot === 'e' || slot === 'f' || slot === 'r')) {
        const a = hero.abilities[slot];
        const lvl = unlockLevel(this.rules, a);
        if (c.lv < lvl) { locked = true; lockTxt = `Nv ${lvl}`; }
        const mut = me.mut[slot];
        el.mut.textContent = mut ? ROUTE_NAMES[mut][0] : '';
        el.mut.className = 'mut ' + (mut ?? '');
        if (usesUltCharge(this.rules, slot)) {
          // Ulti por carga: el relleno sube desde abajo a medida que se carga.
          const u = Math.min(1, me.ult);
          el.cd.style.background = u < 1 ? `linear-gradient(to top, transparent ${u * 100}%, rgba(10,6,20,.72) ${u * 100}%)` : 'none';
          el.txt.textContent = u < 1 ? `${Math.floor(u * 100)}%` : '';
          el.txt.classList.toggle('pct', u < 1);
          el.lock.textContent = '';
          el.root.classList.remove('locked');
          return;
        }
      }
      if (slot.startsWith('i')) {
        const id = me.act[Number(slot[1]) - 1];
        const it = id ? ITEM_BY_ID[id] : null;
        const key = it ? it.id : '';
        if (el.icon.dataset.item !== key) {
          el.icon.dataset.item = key;
          el.icon.innerHTML = it ? iconHtml(`icon.item.${it.id}`, it.icon) : '';
        }
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
    const rc = this.slotEls.get('recall');
    if (rc) {
      const on = (c.fl & F_RECALL) !== 0;
      rc.cd.style.background = on ? `conic-gradient(rgba(79, 209, 255, .55) ${c.ch * 360}deg, transparent 0)` : 'none';
    }
    const dash = this.slotEls.get('dash');
    if (dash) {
      const r = me.dcd;
      dash.cd.style.background = r > 0 ? `conic-gradient(rgba(10,6,20,.72) ${(r / (me.dcdMax || DASH_CD)) * 360}deg, transparent 0)` : 'none';
    }
  }

  private buildMats() {
    const mine = this.me ? HEROES[this.me.hero].family : 'stone';
    this.matEls = FAMILIES.map((f) => {
      const el = tip(h('div', { class: 'mat', style: { '--c': colorHex(FAMILY_COLORS[f]) } }, h('span', null, iconNode(`icon.mat.${f}`, MAT_ICON[f])), h('b', null, '0')), () => matTip(f, this.rules, mine));
      this.mats.appendChild(el);
      return el;
    });
    this.mats.appendChild(this.passEl);
  }

  private renderMats(me: MeFrame) {
    if (this.rules.pickups !== 'materials') return;
    me.mats.forEach((v, i) => {
      const el = this.matEls[i];
      const b = el.querySelector('b')!;
      if (b.textContent !== String(v)) b.textContent = String(v);
      if (this.prevMats.length && v > (this.prevMats[i] ?? 0)) bump(el);
    });
    this.prevMats = [...me.mats];
    const key = me.pas.join(',');
    if (this.passEl.dataset.k !== key) {
      this.passEl.dataset.k = key;
      clear(this.passEl);
      for (const id of me.pas) {
        const it = ITEM_BY_ID[id];
        if (it) this.passEl.append(tip(h('span', { html: iconHtml(`icon.item.${id}`, it.icon) }), () => itemTip(it)));
      }
      for (let i = me.pas.length; i < 3; i++) this.passEl.append(tip(h('span', { class: 'empty' }), `<b>Pasivo vacío</b><p>Fabricá un ítem pasivo en la forja (${keyName('forge')}).</p>`));
    }
  }

  /** Un trozo de material vuela desde el mundo hasta el contador (efecto moneda de casino). */
  flyMat(sx: number, sy: number, mat: number) {
    // Con materiales: vuela al contador. Con carga de ulti: vuela a la tecla R.
    const target = this.rules.pickups === 'materials' ? this.matEls[mat] : this.slotEls.get('r')?.root;
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
    // Racha de bajas (armas)
    if (this.spree > 0) {
      this.spreeT -= dt;
      if (this.spreeT <= 0) {
        if (this.spree >= SPREE_TIERS[0][0]) this.announce(`RACHA x${this.spree}`, SPREE_TIERS.filter((t) => this.spree >= t[0]).pop()?.[1] ?? '', 'combo-end');
        this.spree = 0;
        this.spreeTier = -1;
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
      if (prev > 0.25 && cur <= 0 && slot !== 'basic' && slot !== 'push' && !(slot === 'r' && this.rules.ultCharge)) {
        const el = this.slotEls.get(slot);
        if (el) { el.root.classList.remove('ready'); void el.root.offsetWidth; el.root.classList.add('ready'); }
        if (slot !== 'r') audio.play('ready', 0.5);
      }
    });
    this.prevCd = [...me.cd];
    const ultReady = (local.fl & F_ULTREADY) !== 0 && !(local.fl & F_DEAD);
    this.slotEls.get('r')?.root.classList.toggle('ultready', ultReady);
    if (ultReady && !this.ultWasReady) {
      this.announce('¡ULTI LISTA!', `${HEROES[this.me.hero].abilities.r.icon} ${HEROES[this.me.hero].abilities.r.name}${this.touch ? '' : ` · apretá ${keyName('r')}`}`, 'ult', '¡Ulti lista!');
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

  /** Carrera: presenta la pista (y cómo viene la copa, si se está corriendo una). */
  introRace(cup: CupInfo | undefined) {
    this.cup = cup ?? null;
    this.announce(this.mapName.toUpperCase(), cup ? `🏆 copa · pista ${cup.round + 1} de ${cup.maps.length}` : 'el primero que llega a la meta gana', 'good', this.mapName);
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
        if (e.a === me && me >= 0 && e.h > 0 && e.id !== me && this.byId.has(e.id)) this.onComboHit();
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
          : e.br ? `<b style="color:${col(v)}">${esc(v.name)}</b> quedó sin vida 💀`
          : `<b style="color:${col(v)}">${esc(v.name)}</b> se cayó solo 🙈`;
        this.feed.prepend(row);
        while (this.feed.children.length > 5) this.feed.lastChild?.remove();
        setTimeout(() => row.classList.add('out'), 6000);
        setTimeout(() => row.remove(), 6600);
        row.classList.add('in');
        if (e.v === this.localId) this.showCenter(e.br ? '¡Sin vida!' : '¡RING-OUT!', 1.4, 'bad');
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
        if (e.n === 0) {
          // Cada juego larga a su manera (core/games.ts).
          const [text, say] = gameOf(this.lastMode).go;
          this.showCenter(text, 1, 'go');
          audio.say(say, true);
        }
        else { this.showCenter(String(e.n), 0.95, 'count'); audio.say(String(e.n), true); }
        break;
      case 'lvl': if (e.id === this.localId) {
        const lv = e.l;
        const hero = HEROES[this.me!.hero];
        const unlocked = (['q', 'e', 'f', 'r'] as AbilitySlot[]).find((s) => hero.abilities[s].unlock === lv);
        const mutation = MUTATION_LEVELS.includes(lv);
        this.showCenter(`Nivel ${lv}${unlocked ? ` · ¡${hero.abilities[unlocked].name}!` : ''}${mutation ? ' · mutación disponible' : ''}`, 1.8, 'good');
      } break;
      case 'deny': if (e.id === this.localId) { this.deny.textContent = DENY_TEXT[e.w] ?? e.w; this.denyT = 1.6; } break;
      case 'wpn': if (e.id === this.localId && e.e) this.localDeny('Sin balas: volvés a la pistola'); break;
      case 'shot': {
        if (e.id !== me || me < 0) break;
        let rank = -1;
        for (let i = 3; i < e.p.length; i += 4) rank = Math.max(rank, e.p[i] === SHOT_CRIT ? 1 : e.p[i] === 1 ? 0 : -1);
        if (rank >= 0) this.hitMark(rank as 0 | 1);
        break;
      }
      case 'udie':
        if (e.by === me && me >= 0 && this.rules.weapons) { this.hitMark(2); this.onSpree(); }
        break;
      case 'perk': {
        const p = PERKS[PERK_IDS[e.p]];
        const who = this.byId.get(e.id);
        if (!p || !who) break;
        if (e.id === me) this.showCenter(`${p.icon} ${p.name}`, 1.5, 'good');
        else {
          // Lo que eligen los demás, en el costado: sirve para saber con quién contás para qué.
          const row = h('div', { class: 'feed-row in' });
          row.innerHTML = `<b style="color:${colorHex(TEAM_COLORS[who.team % TEAM_COLORS.length])}">${esc(who.name)}</b> ${p.icon} ${esc(p.name)}`;
          this.feed.prepend(row);
          while (this.feed.children.length > 5) this.feed.lastChild?.remove();
          setTimeout(() => row.classList.add('out'), 5000);
          setTimeout(() => row.remove(), 5600);
        }
        break;
      }
      case 'loot': if (e.id === this.localId) {
        const c = CRATE_INFO[CRATE_KINDS[e.c]];
        if (c) this.showCenter(`${c.icon} ${c.name}`, 1.1, 'good');
      } break;
      case 'alert': this.onAlert(e.w, e.tm); break;
      case 'gate': {
        const name = this.byId.get(e.id)?.name ?? '';
        if (e.fin === 1) this.announce(e.id === this.localId ? '¡LLEGASTE PRIMERO!' : '¡HAY GANADOR!', e.id === this.localId ? 'esperá a los demás' : `${name} llegó a la meta: apurate`, 'good', 'Llegó el primero');
        else if (e.id !== this.localId) break;
        else if (e.fin > 0) this.showCenter(`🏁 ¡Llegaste ${e.fin}º!`, 2.2, 'good');
        else this.showCenter(`✔ Puerta ${e.i + 1}/${e.n}`, 1.1, 'good');
        break;
      }
      case 'recall': if (e.id === this.localId && e.s === 0) this.localDeny('Se cortó la vuelta a la base'); break;
      case 'grab':
        if (e.s === 1 && e.tg === this.localId) this.showCenter(`¡Te agarraron! ${keyName('dash')} para soltarte`, 1.6, 'bad');
        break;
      case 'stage': if (e.id === this.localId && e.s >= 2) this.showCenter(e.s >= 3 ? (this.rules.repair ? `¡DESTROZADO! Reparate (${keyName('repair')})` : '¡DESTROZADO! Cuidado con los bordes') : 'Quebrado', 1.2, 'bad'); break;
      case 'craft': if (e.id === this.localId) {
        const it = ITEM_BY_ID[e.w];
        this.showCenter(it ? `${it.icon} ${it.name}` : '🧬 ¡Mutación!', 1.2, 'good');
      } break;
    }
  }

  /** Avisos del Asedio, contados desde tu equipo. */
  private onAlert(w: string, team: number) {
    const my = this.me?.team ?? -1;
    const ours = team === my;
    switch (w) {
      // Horda: en estos avisos `team` trae un número (la oleada, la misión o los nidos que quedan).
      case 'horde_wave':
        if (team === 1) this.announce('¡AHÍ VIENEN!', 'clic para disparar · las armas caen en cajas', 'bad', 'Ahí vienen');
        else this.showCenter(`Oleada ${team}`, 1, 'bad');
        break;
      case 'horde_obj': {
        const mi = MISSIONS[team];
        if (mi) this.announce(`MISIÓN ${team + 1}: ${mi.title.toUpperCase()}`, mi.hint, mi.kind === 'extract' ? 'matchpoint' : 'ult', mi.title);
        break;
      }
      case 'horde_done': {
        const mi = MISSIONS[team];
        if (mi) this.showCenter(`✔ ${mi.title}${mi.kind === 'hold' ? ' · mini base lista' : ''}`, 2, 'good');
        audio.play('craft', 0.9);
        break;
      }
      case 'horde_nest': this.showCenter(team > 0 ? `Nido destruido · ${team === 1 ? 'queda 1' : `quedan ${team}`}` : '¡Nidos destruidos!', 1.6, 'good'); break;
      case 'wave': this.once('wave1', () => this.announce('¡SALEN LOS ESBIRROS!', 'acompañá a tu oleada y empujá la línea', 'good', 'Salen los esbirros')); break;
      case 'tower_down':
        if (ours) this.announce('¡PERDIMOS UNA TORRE!', 'defendé la línea', 'bad', 'Perdimos una torre');
        else this.announce('¡TORRE RIVAL DESTRUIDA!', '+1 de cada material para tu equipo', 'good', 'Torre destruida');
        break;
      case 'core_open':
        if (ours) this.announce('¡NUESTRO NÚCLEO ESTÁ EXPUESTO!', 'volvé a defender la base', 'matchpoint', 'Núcleo expuesto');
        else this.announce('¡NÚCLEO RIVAL EXPUESTO!', 'a romperlo', 'good', 'Núcleo expuesto');
        break;
      case 'coloso_up': this.announce('¡EL COLOSO DESPERTÓ!', 'derrotalo: tus esbirros pegan y aguantan más', 'ult', 'El Coloso despertó'); break;
      case 'coloso_down':
        if (ours) this.announce('¡BENDICIÓN DEL COLOSO!', 'tus esbirros pegan y aguantan más por 90 s', 'good', 'Bendición del Coloso');
        else this.announce('EL RIVAL TIENE LA BENDICIÓN', 'sus esbirros vienen más fuertes', 'bad');
        break;
      case 'sudden': this.announce('¡MUERTE SÚBITA!', 'los núcleos quedan expuestos', 'matchpoint', 'Muerte súbita'); break;
      case 'tower_hit': if (ours) this.localDeny('⚠️ ¡Nuestra torre está bajo ataque!'); break;
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
    const locked = this.rules.forgeAtBase && !this.atBase && !(c.fl & F_DEAD);
    const key = JSON.stringify([this.forgeTab, this.forgeFilter, me.mats, me.pas, me.act, me.mut, me.slots, c.lv, locked]);
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
      // Lo equipado: 3 casilleros de pasivos y 3 de activos (clic = desarmar, devuelve 50%).
      const slotCell = (id: string | null, label: string) => id
        ? tip(h('button', { class: 'eqslot full', onclick: () => this.send({ c: 'sell', id }) }, h('span', { html: iconHtml(`icon.item.${id}`, ITEM_BY_ID[id].icon) }), h('em', null, '✕')), () => itemTip(ITEM_BY_ID[id]) + '<p class="tt-hint">Clic: desarmar (te devuelve la mitad).</p>')
        : h('div', { class: 'eqslot' }, h('small', null, label));
      const equipped = h('div', { class: 'equipped' },
        h('div', null, h('span', { class: 'eqlabel' }, 'Pasivos'), ...[0, 1, 2].map((i) => slotCell(me.pas[i] ?? null, ''))),
        h('div', null, h('span', { class: 'eqlabel' }, 'Activos'), ...[0, 1, 2].map((i) => slotCell(me.act[i] ?? null, this.touch ? String(i + 1) : keyName((['i1', 'i2', 'i3'] as const)[i])))),
      );
      // Filtro por tipo.
      const filters = h('div', { class: 'ifilters' },
        h('button', { class: 'chip' + (this.forgeFilter === 'all' ? ' on' : ''), onclick: () => { this.forgeFilter = 'all'; this.forgeKey = ''; this.renderForge(); } }, 'Todos'),
        ...ITEM_TAGS.map((t) => h('button', {
          class: 'chip' + (this.forgeFilter === t.id ? ' on' : ''), style: { '--c': colorHex(t.color) },
          onclick: () => { this.forgeFilter = t.id; this.forgeKey = ''; this.renderForge(); },
        }, `${t.icon} ${t.name}`)),
      );
      const card = (it: (typeof ITEMS)[number]) => {
        const has = owned.includes(it.id);
        const full = it.kind === 'passive' ? me.pas.length >= 3 : !me.act.includes(null);
        const afford = (Object.keys(it.cost) as Family[]).every((f) => me.mats[FAMILIES.indexOf(f)] >= (it.cost[f] ?? 0));
        const tag = ITEM_TAGS.find((t) => t.id === it.tag)!;
        const can = !has && !full && afford && !locked;
        const state = has ? '✔ Tenés' : locked ? '🔒 En tu base' : full ? 'Sin lugar' : !afford ? 'Te falta' : 'Fabricar';
        // div (no <button disabled>): los botones deshabilitados no reciben hover y el tooltip tiene que andar siempre.
        return tip(h('div', {
          class: 'icard' + (has ? ' has' : can ? ' can' : ' cant'), style: { '--c': colorHex(tag.color) }, role: 'button', 'aria-disabled': String(!can),
          onclick: () => { if (can) this.send({ c: 'craft', id: it.id }); },
        },
        h('span', { class: 'itag', title: tag.name }, tag.icon),
        h('div', { class: 'iicon', html: iconHtml(`icon.item.${it.id}`, it.icon) }),
        h('b', null, it.name),
        h('div', { class: 'costs' }, matsOf(it.cost)),
        h('small', { class: 'istate' }, state),
        ), () => itemTip(it));
      };
      const shown = ITEMS.filter((it) => this.forgeFilter === 'all' || it.tag === this.forgeFilter);
      content = h('div', { class: 'items' },
        equipped, filters,
        ...(['passive', 'active'] as const).map((kind) => {
          const list = shown.filter((it) => it.kind === kind);
          if (!list.length) return null;
          return h('div', { class: 'group' },
            h('h4', null, kind === 'passive' ? `Pasivos (${me.pas.length}/3) · siempre activos` : `Activos (${me.act.filter(Boolean).length}/3)${this.touch ? '' : ` · teclas ${keyName('i1')} ${keyName('i2')} ${keyName('i3')}`}`),
            h('div', { class: 'igrid' }, list.map(card)));
        }),
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
              tip(h('button', {
                class: 'btn small route ' + r,
                disabled: !!cur || lockedA || free <= 0 || me.mats[FAMILIES.indexOf(fam)] < MUTATION_COST || locked,
                onclick: () => this.send({ c: 'mutate', slot: s, route: r }),
              }, `${ROUTE_FLAVOR[fam][r]}`, h('small', null, ROUTE_NAMES[r])), () => routeTip(r, fam)))),
          );
        }),
        h('div', { class: 'routeinfo' }, (['tank', 'carry', 'support'] as Route[]).map((r) => h('div', null, h('b', { class: 'mut ' + r }, ROUTE_NAMES[r] + ': '), ROUTE_DESC[r]))),
      );
    }
    const banner = locked ? h('div', { class: 'forge-lock' }, '🔒 La fragua solo funciona en tu base (o mientras esperás para volver). Apretá ', h('kbd', null, this.touch ? '🏠' : keyName('recall')), ` y quedate quieto ${RECALL_TIME} s para volver. Podés mirar y planear tu compra.`) : null;
    this.forge.append(tabs, ...(banner ? [banner] : []), matsRow, content,
      h('div', { class: 'forge-foot' }, `${this.touch ? '🔧' : keyName('repair')} (mantener): reparar tu cuerpo · ${REPAIR_COST} ${MAT_ICON[fam]} → −${REPAIR_AMOUNT} heat. Rompé cobertura del mapa para juntar materiales.`));
  }

  // ───────────── tabla ─────────────

  showBoard(show: boolean) {
    this.board.classList.toggle('hidden', !show);
  }

  private renderBoard(w: WorldFrame) {
    // La última columna es la del modo (vidas, esbirros, zombis), si tiene una.
    const stat = MODE_INFO[w.mode.id]?.stat;
    const rows = [...this.roster].sort((a, b) => a.team - b.team).map((r) => {
      const c = w.chars.find((x) => x.id === r.id);
      const col = colorHex(TEAM_COLORS[r.team % TEAM_COLORS.length]);
      const last = stat ? `<td>${(stat.key === 'cs' ? c?.cs : c?.lives) ?? 0}</td>` : '';
      return `<tr class="${r.id === this.localId ? 'me' : ''}"><td><i style="background:${col}"></i>${esc(r.name)}${r.bot ? ' 🤖' : ''}</td><td>${HEROES[r.hero].name}</td><td>${c?.lv ?? 1}</td><td>${c?.k ?? 0}</td><td>${c?.d ?? 0}</td><td>${c?.a ?? 0}</td>${last}</tr>`;
    }).join('');
    this.board.innerHTML = `<table><thead><tr><th>Jugador</th><th>Héroe</th><th>Nv</th><th>Sacó</th><th>Cayó</th><th>Asist.</th>${stat ? `<th>${stat.label}</th>` : ''}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ───────────── resultados ─────────────

  /** onStop: cortar una copa por la mitad y volver a la sala (el botón principal sigue con la próxima pista). */
  showResults(res: MatchResultInfo, isHost: boolean, onBack: () => void, onLeave: () => void, reward: MatchReward | null = null, ctx: MatchContext | null = null, onStop?: () => void) {
    this.results?.remove();
    this.posEl.classList.remove('on');
    this.centerT = 0;
    this.center.style.opacity = '0';
    this.comboEl.classList.remove('on');
    this.perkEl.classList.remove('on');
    const me = this.me;
    const won = !res.draw && me && me.team === res.winner;
    const game = gameOf(this.lastMode);
    const coop = game.coopNames;
    // Cada juego cuenta su partida con sus columnas y sus premios.
    const view = game.id === 'horde' ? HORDE_RESULTS : game.id === 'race' ? RACE_RESULTS : BRAWL_RESULTS;
    const winnerName = res.draw ? 'Empate' : coop ? coop[res.winner === 0 ? 0 : 1]
      : res.teams === 'ffa' ? res.players.find((p) => p.team === res.winner)?.name ?? '?' : `Equipo ${TEAM_NAMES[res.winner]}`;
    const mvp = [...res.players].sort((a, b) => view.mvp(b) - view.mvp(a))[0];
    const rows = [...res.players].sort(view.order ?? ((a, b) => a.team - b.team || view.mvp(b) - view.mvp(a))).map((p) => {
      const col = colorHex(TEAM_COLORS[p.team % TEAM_COLORS.length]);
      const hat = p.hat && p.hat !== 'none' ? HAT_BY_ID[p.hat]?.icon ?? '' : '';
      return `<tr class="${p.id === this.localId ? 'me' : ''}"><td><i style="background:${col}"></i>${hat} ${esc(p.name)}${p.bot ? ' 🤖' : ''}${p === mvp && !view.order ? ' <span class="mvp">MVP</span>' : ''}</td><td>${HEROES[p.hero].name}</td>${view.cols.map(([, get]) => `<td>${get(p)}</td>`).join('')}</tr>`;
    }).join('');
    // Premios: cada categoría la gana alguien (si hay algo que premiar).
    const awards = view.awards.map(([icon, title, key, fmt]) => {
      const best = [...res.players].sort((a, b) => key(b) - key(a))[0];
      if (!best || key(best) <= 0) return '';
      return `<div class="award${best.id === this.localId ? ' mine' : ''}"><div class="aw-ic">${icon}</div><b>${title}</b><span>${esc(best.name)}</span><em>${fmt(key(best))}</em></div>`;
    }).filter(Boolean).join('');
    let title = res.draw ? '🤝 Empate' : won ? '🏆 ¡VICTORIA!' : me ? '💀 Derrota' : '🏁 Fin';
    let sub = res.draw ? '' : 'Ganó: ' + esc(winnerName);
    if (game.id === 'horde' && !res.draw && ctx) {
      // Horda: lo que importa es hasta dónde llegó el equipo.
      title = res.winner === 0 ? '🚁 ¡EXTRACCIÓN!' : '🧟 Los alcanzó la horda';
      const level = LOBBY_OPTIONS.difficulty.names?.[ctx.difficulty - 1];
      sub = `Oleada ${Math.max(1, ctx.wave)} · ${ctx.step} de ${MISSIONS.length} misiones${level ? ' · ' + level : ''}`;
    }
    let cls = res.draw ? '' : won ? 'win' : 'lose';
    let champion = false;
    let cupHtml = '';
    const cup = res.cup;
    if (game.id === 'race') {
      // Carrera: tu puesto y tu tiempo; en copa, además, la tabla.
      const mine = res.players.find((p) => p.id === this.localId);
      const arrived = (mine?.time ?? -1) > 0;
      if (mine) {
        title = mine.place === 1 ? '🏆 ¡GANASTE LA CARRERA!' : arrived ? `🏁 Llegaste ${mine.place}º` : '⏱️ No llegaste a la meta';
        cls = mine.place === 1 ? 'win' : arrived ? '' : 'lose';
      }
      sub = esc(this.mapName) + (arrived ? ` · ${lapTime(mine!.time!)}` : '');
      if (cup) {
        const at = cup.table.findIndex((r) => r.pid === me?.pid);
        if (cup.final) {
          champion = at === 0;
          title = champion ? '🏆 ¡CAMPEÓN DE LA COPA!' : `🏆 Copa para ${esc(cup.table[0]?.name ?? '?')}`;
          cls = champion ? 'win' : '';
          sub = at > 0 ? `Terminaste ${at + 1}º con ${cup.table[at].total} puntos` : `${cup.table[0]?.total ?? 0} puntos en ${cup.maps.length} pistas`;
        }
        // Entre pista y pista, cómo viene la copa; al final, el podio.
        const next = MAPS[cup.maps[cup.round + 1]]?.name;
        const step = (i: number) => { const r = cup.table[i]; return r ? `<div class="pod p${i + 1}${r.pid === me?.pid ? ' me' : ''}"><span>${esc(r.name)}</span><b>${MEDALS[i]}</b><em>${r.total}</em></div>` : ''; };
        cupHtml = cup.final ? `<div class="podium">${step(1)}${step(0)}${step(2)}</div>`
          : `<div class="cup-line">🏆 Copa · pista ${cup.round + 1} de ${cup.maps.length}${next ? ` · próxima: <b>${esc(next)}</b>` : ''}</div>`;
      }
    }
    const records = (reward?.records ?? []).map((r) => `<div class="record"><b>${esc(r.label)}: ${esc(r.value)}</b>${r.old ? `<small>antes ${esc(r.old)}</small>` : ''}</div>`).join('');

    const box = h('div', { class: 'results' });
    box.innerHTML = `
      <div class="res-title ${cls}">${title}</div>
      <div class="res-sub" style="color:${res.draw || game.id === 'race' ? '#fff' : colorHex(TEAM_COLORS[res.winner % TEAM_COLORS.length])}">${sub}</div>
      <div class="res-reason">${esc(res.reason)} · duró ${fmtTime(res.duration)}</div>
      ${records ? `<div class="records"><span>🏅 ${reward!.records.length === 1 ? 'Récord personal' : 'Récords personales'}</span>${records}</div>` : ''}
      ${cupHtml}
      <div class="awards">${awards}</div>
      ${game.id === 'race' ? this.raceTable(res) : `<table><thead><tr><th>Jugador</th><th>Héroe</th>${view.cols.map(([name]) => `<th>${name}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`}
      <div class="reward"></div>`;
    // En copa quedan pistas: la próxima larga sola a los pocos segundos (el host la puede adelantar o cortar la copa).
    const more = !!cup && !cup.final;
    const main = isHost
      ? h('button', { class: 'btn primary', onclick: () => { this.stopNext(); onBack(); } }, more ? 'Siguiente pista ▶' : 'Volver al lobby')
      : h('div', { class: 'wait' }, more ? 'La próxima pista ya larga…' : 'Esperando que el host vuelva al lobby…');
    const btns = h('div', { class: 'res-buttons' },
      main,
      more && isHost && onStop ? h('button', { class: 'btn', onclick: () => { this.stopNext(); onStop(); } }, 'Terminar la copa') : null,
      h('button', { class: 'btn', onclick: () => { this.stopNext(); onLeave(); } }, 'Salir al menú'),
    );
    this.stopNext();
    if (more) {
      let left = CUP_NEXT;
      const tick = () => {
        main.textContent = isHost ? `Siguiente pista ▶ (${left})` : `La próxima pista larga en ${left} s…`;
        if (left-- <= 0) { this.stopNext(); if (isHost) onBack(); }
      };
      tick();
      this.nextTimer = setInterval(tick, 1000);
    }
    box.appendChild(btns);
    this.results = box;
    this.root.appendChild(box);
    this.root.classList.add('ended');
    if (won || champion) this.confettiRain(champion ? 200 : 120);
    if (records) audio.play('jackpot', 0.7);
    if (reward) this.animateReward(box.querySelector('.reward') as HTMLElement, reward);
  }

  /** Carrera: una sola tabla con el puesto, el tiempo y, en copa, los puntos. Al terminar la copa se ordena por su tabla. */
  private raceTable(res: MatchResultInfo): string {
    const cup = res.cup;
    const pts = new Map((cup?.table ?? []).map((r, i) => [r.pid, { gained: r.gained, total: r.total, at: i }]));
    const at = (p: PlayerResult) => pts.get(p.pid)?.at ?? 99;
    const rows = [...res.players].sort((a, b) => (cup?.final ? at(a) - at(b) : 0) || (a.place ?? 99) - (b.place ?? 99)).map((p) => {
      const col = colorHex(TEAM_COLORS[p.team % TEAM_COLORS.length]);
      const hat = p.hat && p.hat !== 'none' ? HAT_BY_ID[p.hat]?.icon ?? '' : '';
      const c = pts.get(p.pid);
      const first = cup?.final ? MEDALS[at(p)] ?? `${at(p) + 1}º` : p.place ? `${p.place}º` : '—';
      return `<tr class="${p.id === this.localId ? 'me' : ''}"><td class="pl">${first}</td><td><i style="background:${col}"></i>${hat} ${esc(p.name)}${p.bot ? ' 🤖' : ''}</td>`
        + `<td>${(p.time ?? -1) > 0 ? lapTime(p.time!) : 'no llegó'}</td><td>${p.deaths}</td><td>${p.kills}</td>${cup ? `<td class="gain">${c?.gained ? '+' + c.gained : ''}</td><td class="tot">${c?.total ?? 0}</td>` : ''}</tr>`;
    }).join('');
    return `<table class="race-table"><thead><tr><th>${cup?.final ? 'Copa' : 'Puesto'}</th><th>Jugador</th><th>Tiempo</th><th>Caídas</th><th>Tiró</th>${cup ? '<th>Puntos</th><th>Total</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`;
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

  private stopNext() {
    if (this.nextTimer !== null) clearInterval(this.nextTimer);
    this.nextTimer = null;
  }

  dispose() {
    this.stopNext();
    window.removeEventListener('mousemove', this.onMouse);
    this.root.remove();
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

type Award = [icon: string, title: string, key: (p: PlayerResult) => number, fmt: (v: number) => string];
/** Cómo cuenta su partida cada juego en la pantalla de resultados: columnas, premios y a quién se destaca. */
/** order: cómo se ordena la tabla (por defecto, por equipo y por quién se destacó más). */
interface ResultView { cols: [string, (p: PlayerResult) => string | number][]; awards: Award[]; mvp: (p: PlayerResult) => number; order?: (a: PlayerResult, b: PlayerResult) => number }

const MEDALS = ['🥇', '🥈', '🥉'];
/** Copa: segundos entre los resultados de una pista y la largada de la siguiente. */
const CUP_NEXT = 15;

const BRAWL_RESULTS: ResultView = {
  cols: [['Nv', (p) => p.level], ['Sacó', (p) => p.kills], ['Cayó', (p) => p.deaths], ['Asist.', (p) => p.assists], ['Heat', (p) => Math.round(p.heatDealt)]],
  awards: [
    ['💥', 'Rey del ring-out', (p) => p.kills, (v) => `${v} sacados`],
    ['🧹', 'Farmeador', (p) => p.cs ?? 0, (v) => `${v} esbirros rematados`],
    ['☠️', 'Verdugo', (p) => p.lethals, (v) => `${v} golpes letales`],
    ['🎱', 'Billarista', (p) => p.billiards, (v) => `${v} carambolas`],
    ['🚀', 'Cañón humano', (p) => p.bestLaunch, (v) => `lanzó a ${v} m/s`],
    ['🔨', 'Demoledor', (p) => p.destroyed, (v) => `${v} coberturas`],
    ['💎', 'Coleccionista', (p) => p.pickups, (v) => `${v} materiales`],
    ['🪂', 'Fénix', (p) => p.saves, (v) => `${v} salvadas`],
    ['🔥', 'Horno', (p) => p.heatDealt, (v) => `${Math.round(v)} de heat`],
  ],
  mvp: (p) => p.kills * 3 + p.assists + p.heatDealt / 100 + p.lethals + p.billiards * 2 + p.saves * 2,
};

const HORDE_RESULTS: ResultView = {
  cols: [['Zombis', (p) => p.cs ?? 0], ['Rompió', (p) => p.destroyed], ['Cajas', (p) => p.pickups], ['Cayó', (p) => p.deaths]],
  awards: [
    ['🧟', 'Exterminador', (p) => p.cs ?? 0, (v) => (v === 1 ? '1 zombi' : `${v} zombis`)],
    ['🔨', 'Demoledor', (p) => p.destroyed, (v) => `rompió ${v} entre nidos y coberturas`],
    ['📦', 'Acaparador', (p) => p.pickups, (v) => (v === 1 ? '1 caja' : `${v} cajas`)],
    ['🚀', 'Cañón humano', (p) => p.bestLaunch, (v) => `lanzó a ${v} m/s`],
    ['🛡️', 'Intocable', (p) => (p.deaths === 0 ? 1 : 0), () => 'no cayó nunca'],
  ],
  mvp: (p) => (p.cs ?? 0) + p.destroyed * 4 + p.pickups - p.deaths * 5,
};

/** La tabla de la Carrera se arma aparte (raceTable): acá van los premios. */
const RACE_RESULTS: ResultView = {
  cols: [],
  awards: [
    ['🪂', 'Equilibrista', (p) => (p.deaths === 0 && (p.time ?? -1) > 0 ? 1 : 0), () => 'llegó sin caerse'],
    ['💥', 'Mal compañero', (p) => p.kills, (v) => (v === 1 ? 'tiró a 1 rival' : `tiró a ${v} rivales`)],
    ['🔨', 'Demoledor', (p) => p.destroyed, (v) => (v === 1 ? 'rompió 1 cobertura' : `rompió ${v} coberturas`)],
    ['🚀', 'Cañón humano', (p) => p.bestLaunch, (v) => `lanzó a ${v} m/s`],
    ['🕳️', 'Imán del vacío', (p) => p.deaths, (v) => (v === 1 ? 'se cayó 1 vez' : `se cayó ${v} veces`)],
  ],
  mvp: (p) => -(p.place ?? 99),
  order: (a, b) => (a.place ?? 99) - (b.place ?? 99),
};

const COMBO_TIERS: [number, string][] = [[3, '¡Combo!'], [5, '¡Brutal!'], [8, '¡Salvaje!'], [12, '¡Bestial!'], [16, '¡INHUMANO!'], [22, '¡¡RUBBLE!!']];
/** Racha de bajas con armas: se corta a los SPREE_TIME segundos sin bajar a nadie. */
const SPREE_TIERS: [number, string][] = [[6, '¡Racha!'], [12, '¡Carnicería!'], [20, '¡Masacre!'], [30, '¡Exterminio!'], [45, '¡IMPARABLE!'], [65, '¡¡LEYENDA!!']];
const SPREE_TIME = 3.5;

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
