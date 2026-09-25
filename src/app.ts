// Orquestador: menú ↔ lobby ↔ partida. Maneja la sesión (host o cliente) y las pantallas.
import { audio } from './audio/audio';
import { clearConfig, getConfig, getPrefs, hasSupabase, saveConfig, savePrefs } from './config';
import { GAME_SUBTITLE, GAME_TITLE, TEAM_COLORS, TEAM_NAMES } from './core/constants';
import { HEROES } from './core/heroes';
import { MAPS } from './core/maps';
import { MODE_INFO } from './core/modes';
import type { LobbyState, MatchInit, MatchResultInfo } from './core/protocol';
import { FAMILY_COLORS, FAMILY_NAMES, HERO_IDS, type HeroId, type MatchSettings, type ModeId } from './core/types';
import { db } from './db/persistence';
import { AttractMode } from './game/attract';
import { MatchRunner } from './game/match';
import { ACHIEVEMENTS, getProfile, setHat, xpToNext } from './game/profile';
import { HATS, HAT_BY_ID } from './core/cosmetics';
import { ClientSession } from './net/client';
import { HostSession, MAX_PLAYERS } from './net/host';
import { createDirectory, type Directory, type RoomInfo } from './net/signaling';
import { clear, colorHex, fmtTime, h, modal, toast } from './ui/dom';
import { HeroPreview } from './ui/heroPreview';
import { THEMES } from './render/themes';
import { getRules, RULESETS, RULESET_IDS, unlockLevel, type RulesetId } from './core/rules';
import { assetsReady, loadAssets } from './assets/registry';
import { tip } from './ui/tooltip';
import { abilityTip, heroTip, modeTip, rulesTip } from './ui/tips';
import { openGallery } from './ui/gallery';

type Session = HostSession | ClientSession;

export class App {
  private stage: HTMLElement;
  private ui: HTMLElement;
  private session: Session | null = null;
  private match: MatchRunner | null = null;
  private attract: AttractMode | null = null;
  private dir: Directory | null = null;
  private rooms: RoomInfo[] = [];
  private preview: HeroPreview | null = null;
  private chatLog: { from: string; text: string }[] = [];
  private lobbyEl: HTMLElement | null = null;
  private escMenu: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.stage = h('div', { class: 'stage' });
    this.ui = h('div', { class: 'ui' });
    root.append(this.stage, this.ui);
    const unlock = () => { audio.unlock(); const p = getPrefs(); audio.setVolumes({ master: p.volMaster, music: p.volMusic, sfx: p.volSfx }); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('resize', () => this.attract?.resize());
    // Cada botón suena al pasar el mouse: la UI también "se siente".
    let lastHover: Element | null = null;
    document.addEventListener('mouseover', (e) => {
      const b = (e.target as HTMLElement).closest?.('.btn, .herocard, .room, .hatbtn, .tab');
      if (b && b !== lastHover && !(b as HTMLButtonElement).disabled) audio.play('hover', 0.25);
      lastHover = b;
    });
    window.addEventListener('beforeunload', () => { void this.session?.close(); });
  }

  start() {
    void loadAssets();
    const code = new URLSearchParams(location.search).get('sala');
    this.showMenu();
    if (code) setTimeout(() => this.join(code.toUpperCase()), 300);
  }

  // ───────────── menú ─────────────

  private showMenu() {
    this.preview?.dispose();
    this.preview = null;
    this.lobbyEl = null;
    if (!this.attract) {
      try { this.attract = new AttractMode(this.stage); } catch (e) { console.warn('attract', e); }
    }
    audio.setMusic('menu');
    const p = getPrefs();
    clear(this.ui);
    const name = h('input', { class: 'input', maxlength: 16, value: p.name, placeholder: 'Tu nombre', oninput: (e: Event) => savePrefs({ name: (e.target as HTMLInputElement).value.trim() || p.name }) });
    const code = h('input', { class: 'input code', maxlength: 5, placeholder: 'CÓDIGO', oninput: (e: Event) => { const el = e.target as HTMLInputElement; el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); } });
    const roomsBox = h('div', { class: 'rooms' });
    const renderRooms = () => {
      clear(roomsBox);
      const open = this.rooms.filter((r) => !r.inMatch || r.players < r.max);
      if (!open.length) { roomsBox.append(h('div', { class: 'muted' }, 'No hay salas abiertas ahora. ¡Creá una!')); return; }
      for (const r of open) {
        roomsBox.append(h('button', { class: 'room', onclick: () => this.join(r.code) },
          h('b', null, r.code), h('span', null, `${r.host} · ${MODE_INFO[r.mode as ModeId]?.name ?? r.mode} · ${MAPS[r.map]?.name ?? r.map}`),
          h('em', null, `${r.players}/${r.max}${r.inMatch ? ' · jugando' : ''}`)));
      }
    };
    if (!this.dir) {
      this.dir = createDirectory();
      this.dir.subscribe((rooms) => { this.rooms = rooms; if (roomsBox.isConnected) renderRooms(); });
    }
    renderRooms();

    const netInfo = hasSupabase()
      ? h('div', { class: 'netinfo ok' }, '🟢 Online: Supabase configurado')
      : h('div', { class: 'netinfo warn' }, '🟡 Modo local: solo entre pestañas de este navegador. ', h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); this.showSettings(true); } }, 'Configurar Supabase'), ' para jugar con amigos.');

    this.ui.append(h('div', { class: 'menu' },
      h('div', { class: 'logo' }, h('h1', null, ...GAME_TITLE.split('').map((c, i) => h('span', { style: { animationDelay: `${i * 0.08}s` } }, c))), h('p', null, GAME_SUBTITLE)),
      this.profileCard(),
      h('div', { class: 'panel' },
        h('label', null, 'Nombre'), name,
        h('div', { class: 'row' },
          h('button', { class: 'btn primary big', onclick: () => this.host(false) }, '🎮 Crear sala'),
          h('button', { class: 'btn big', onclick: () => this.host(true) }, '🤖 Práctica vs bots'),
        ),
        h('div', { class: 'row join' }, code, h('button', { class: 'btn', onclick: () => code.value.length >= 4 ? this.join(code.value) : toast('Poné el código de 5 letras', 'error') }, 'Unirse')),
        h('h3', null, 'Salas abiertas'), roomsBox,
        h('div', { class: 'row small' },
          h('button', { class: 'btn ghost', onclick: () => this.showHelp() }, '❓ Cómo se juega'),
          h('button', { class: 'btn ghost', onclick: () => this.showHeroes() }, '🧱 Héroes'),
          h('button', { class: 'btn ghost', onclick: () => this.showHistory() }, '🏆 Historial'),
          h('button', { class: 'btn ghost', onclick: () => this.showAchievements() }, '🏅 Logros'),
          h('button', { class: 'btn ghost', onclick: () => this.showSettings() }, '⚙️ Ajustes'),
          h('button', { class: 'btn ghost', title: 'Todo lo que hoy es procedural y cómo reemplazarlo por archivos', onclick: () => openGallery() }, '🧩 Assets'),
        ),
        netInfo,
      ),
      h('div', { class: 'credits' }, 'WASD mover · Espacio saltar · Clic pegar · Clic derecho empujar (mantené) · Q E F R habilidades'),
    ));
    if (!getPrefs().seenHelp) { savePrefs({ seenHelp: true }); setTimeout(() => this.showHelp(), 600); }
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) {
      toast('RUBBLE se juega con teclado y mouse 🖱️⌨️', 'info', 6000);
    }
  }

  private stopAttract() {
    this.attract?.dispose();
    this.attract = null;
  }

  // ───────────── sesiones ─────────────

  private callbacks() {
    return {
      onLobby: (l: LobbyState) => this.onLobby(l),
      onStart: (init: MatchInit) => this.onStart(init),
      onEnd: (res: MatchResultInfo) => this.onEnd(res),
      onBack: () => this.onBack(),
      onChat: (from: string, text: string) => this.onChat(from, text),
      onToast: (m: string) => toast(m),
      onClosed: (reason: string) => this.onClosed(reason),
      onSnapshot: (w: any, me: any, ack: number) => this.match?.onSnapshot(w, me, ack),
      onEvents: (l: any) => this.match?.onEvents(l),
      onStatus: (s: string) => { const el = document.querySelector('.connecting-status'); if (el) el.textContent = s; },
    };
  }

  private async host(offline: boolean) {
    audio.play('ui');
    const p = getPrefs();
    const s = new HostSession({ pid: p.pid, name: p.name, hero: p.hero as HeroId, hat: getProfile().hat }, offline, this.callbacks());
    this.session = s;
    this.chatLog = [];
    this.showConnecting(offline ? 'Preparando práctica…' : 'Creando sala…');
    try {
      await s.open();
      if (offline) s.setSettings({ bots: 3, botLevel: 2 });
    } catch (e: any) {
      toast('No se pudo crear la sala: ' + (e?.message ?? e), 'error', 6000);
      this.session = null;
      this.showMenu();
    }
  }

  private async join(code: string) {
    audio.play('ui');
    const p = getPrefs();
    const c = new ClientSession(code, { pid: p.pid, name: p.name }, this.callbacks());
    this.session = c;
    this.chatLog = [];
    this.showConnecting(`Uniéndote a ${code}…`, () => { void c.close(); this.session = null; this.showMenu(); });
    try {
      await c.connect();
      c.pick(p.hero as HeroId, undefined, getProfile().hat);
      setRoomParam(code);
    } catch (e: any) {
      if (this.session === c) {
        setRoomParam(null);
        toast(e?.message ?? String(e), 'error', 7000);
        void c.close();
        this.session = null;
        this.showMenu();
      }
    }
  }

  private showConnecting(text: string, onCancel?: () => void) {
    clear(this.ui);
    this.ui.append(h('div', { class: 'menu' }, h('div', { class: 'panel center' },
      h('div', { class: 'spinner' }), h('div', { class: 'connecting-status' }, text),
      onCancel ? h('button', { class: 'btn ghost', onclick: onCancel }, 'Cancelar') : null)));
  }

  private async leave() {
    setRoomParam(null);
    const s = this.session;
    this.session = null;
    this.match?.dispose();
    this.match = null;
    this.escMenu?.();
    await s?.close();
    this.showMenu();
  }

  private onClosed(reason: string) {
    if (!this.session) return;
    if (!/perdida|cortó/.test(reason)) setRoomParam(null);
    toast(reason, 'error', 6000);
    this.session = null;
    this.match?.dispose();
    this.match = null;
    this.escMenu?.();
    this.showMenu();
  }

  private onChat(from: string, text: string) {
    this.chatLog.push({ from, text });
    if (this.chatLog.length > 40) this.chatLog.shift();
    const box = document.querySelector('.chat-log');
    if (box) { box.append(h('div', null, h('b', null, from + ': '), text)); box.scrollTop = box.scrollHeight; }
    else if (this.match) toast(`${from}: ${text}`, 'info', 4000);
    audio.play('ui', 0.5);
  }

  // ───────────── lobby ─────────────

  private onLobby(l: LobbyState) {
    if (this.match || l.inMatch) return;
    this.renderLobby(l);
  }

  private renderLobby(l: LobbyState) {
    const s = this.session;
    if (!s) return;
    const isHost = s.isHost;
    const me = l.players.find((p) => p.pid === s.localPid);
    const offline = isHost && (s as HostSession).offline;
    const first = !this.lobbyEl;
    if (first) {
      clear(this.ui);
      this.lobbyEl = h('div', { class: 'lobby' });
      this.ui.append(this.lobbyEl);
    }
    const root = this.lobbyEl!;
    const prevChat = root.querySelector('.chat-input') as HTMLInputElement | null;
    const chatDraft = prevChat?.value ?? '';
    const chatFocused = document.activeElement === prevChat;
    clear(root);

    const link = `${location.origin}${location.pathname}?sala=${l.code}`;
    const header = h('div', { class: 'lobby-head' },
      h('button', { class: 'btn ghost', onclick: () => this.leave() }, '← Salir'),
      offline
        ? h('div', { class: 'codebox' }, h('span', null, 'Práctica'), h('b', { style: { letterSpacing: '1px' } }, 'vs bots'))
        : h('div', { class: 'codebox' }, h('span', null, 'Código de sala'), h('b', null, l.code),
          h('button', { class: 'btn small', onclick: () => { void navigator.clipboard?.writeText(link).then(() => toast('Link copiado: pasáselo a tus amigos', 'ok')); } }, '🔗 Copiar link')),
      h('div', { class: 'lobby-net' }, offline ? '' : hasSupabase() ? '🟢 Online' : '🟡 Local (pestañas)'),
    );

    // Equipos
    const teamMode = l.settings.teams === 'teams';
    const humans = l.players;
    const botsN = l.settings.bots;
    const teamsBox = h('div', { class: 'teams' });
    const cols = teamMode ? [0, 1] : [-1];
    for (const t of cols) {
      const list = teamMode ? humans.filter((p) => p.team === t) : humans;
      const col = h('div', { class: 'team', style: { '--c': t >= 0 ? colorHex(TEAM_COLORS[t]) : '#bbb' } },
        h('h3', null, t >= 0 ? `Equipo ${TEAM_NAMES[t]}` : 'Todos contra todos'),
        ...list.map((p) => h('div', { class: 'pl' + (p.pid === s.localPid ? ' me' : '') + (p.connected ? '' : ' off') },
          h('span', { class: 'dot', style: { background: colorHex(FAMILY_COLORS[HEROES[p.hero].family]) } }),
          p.hat && p.hat !== 'none' ? h('span', { class: 'hat-ic' }, HAT_BY_ID[p.hat]?.icon ?? '') : null,
          h('b', null, p.name), p.host ? h('em', null, '👑') : null,
          h('span', { class: 'hero' }, HEROES[p.hero].name),
          p.ping ? h('small', null, `${p.ping} ms`) : null)),
        teamMode && me && me.team !== t ? h('button', { class: 'btn small ghost', onclick: () => this.pick(undefined, t) }, 'Cambiarme acá') : null,
      );
      teamsBox.append(col);
    }
    if (botsN > 0) teamsBox.append(h('div', { class: 'bots-note' }, `+ ${botsN} bot${botsN > 1 ? 's' : ''} (${['', 'fácil', 'normal', 'difícil'][l.settings.botLevel]})`));

    // Héroes
    const heroesBox = h('div', { class: 'heroes' });
    const previewBox = h('div', { class: 'preview' });
    const rules = getRules(l.settings.rules);
    for (const id of HERO_IDS) {
      const hd = HEROES[id];
      heroesBox.append(tip(h('button', {
        class: 'herocard' + (me?.hero === id ? ' on' : ''), style: { '--c': colorHex(FAMILY_COLORS[hd.family]) },
        onclick: () => this.pick(id),
      }, h('b', null, hd.name), h('span', null, `${FAMILY_NAMES[hd.family]} · ${hd.role}`)), () => heroTip(id, rules)));
    }
    const sel = me ? HEROES[me.hero] : HEROES.canto;
    const heroInfo = h('div', { class: 'heroinfo' },
      h('h3', null, sel.name, h('small', null, ` · ${FAMILY_NAMES[sel.family]} · ${sel.role}`)),
      h('p', null, sel.desc),
      h('p', { class: 'passive' }, '⚙️ ', sel.passive),
      h('ul', null,
        h('li', null, h('b', null, `Clic · ${sel.basic.name}: `), sel.basic.desc),
        h('li', null, h('b', null, 'Clic derecho · Empujón: '), 'mantené para cargar. Es lo que saca rivales del mapa.'),
        rules.dash ? h('li', null, h('b', null, 'Shift · Dash: '), 'ráfaga corta para entrar, esquivar o recuperarte.') : null,
        ...(['q', 'e', 'f', 'r'] as const).map((k) => {
          const a = sel.abilities[k];
          const meta = k === 'r' && rules.ultCharge ? ' (se carga pegando)' : rules.progression ? ` (nv ${unlockLevel(rules, a)}, ${a.cd}s)` : ` (${a.cd}s)`;
          return tip(h('li', null, h('b', null, `${k.toUpperCase()} · ${a.icon} ${a.name}`, h('small', null, meta), ': '), a.desc), () => abilityTip(sel.id, k, rules));
        }),
      ),
    );

    // Ajustes (host)
    const st = l.settings;
    const dis = !isHost;
    const set = (patch: Partial<MatchSettings>) => { if (isHost) (s as HostSession).setSettings(patch); };
    const select = (value: string, opts: [string, string][], on: (v: string) => void) =>
      h('select', { class: 'input', disabled: dis, onchange: (e: Event) => on((e.target as HTMLSelectElement).value) },
        opts.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
    const humansN = humans.filter((p) => p.connected).length;
    const settings = h('div', { class: 'settings' },
      h('h3', null, 'Partida', isHost ? null : h('small', null, ' (la configura el host)')),
      tip(h('label', null, 'Reglas ⓘ'), () => rulesTip(rules.id)),
      select(rules.id, RULESET_IDS.map((r) => [r, `${RULESETS[r].icon} ${RULESETS[r].name}`]), (v) => set({ rules: v as RulesetId })),
      h('p', { class: 'muted small' }, rules.desc),
      tip(h('label', null, 'Modo ⓘ'), () => modeTip(st.mode)), select(st.mode, (Object.keys(MODE_INFO) as ModeId[]).map((m) => [m, MODE_INFO[m].name]), (v) => set({ mode: v as ModeId })),
      h('p', { class: 'muted small' }, MODE_INFO[st.mode].desc),
      h('label', null, 'Mapa'), select(st.map, Object.values(MAPS).map((m) => [m.id, `${m.name} (${m.players})`]), (v) => set({ map: v })),
      h('label', null, 'Tema visual'), select(st.theme ?? 'neon', THEMES.map((t) => [t.id, `${t.icon} ${t.name}`]), (v) => set({ theme: v })),
      h('label', null, 'Formato'), select(st.teams, [['teams', 'Equipos (2)'], ['ffa', 'Todos contra todos']], (v) => set({ teams: v as 'teams' | 'ffa' })),
      st.mode === 'stock' ? [h('label', null, 'Vidas'), select(String(st.lives), [1, 2, 3, 4, 5].map((n) => [String(n), String(n)]), (v) => set({ lives: +v }))] : null,
      st.mode === 'kills' ? [h('label', null, 'Ring-outs para ganar'), select(String(st.killTarget), [5, 10, 15, 20].map((n) => [String(n), String(n)]), (v) => set({ killTarget: +v }))] : null,
      st.mode === 'koth' ? [h('label', null, 'Puntos para ganar'), select(String(st.kothTarget), [60, 100, 150].map((n) => [String(n), String(n)]), (v) => set({ kothTarget: +v }))] : null,
      h('label', null, 'Tiempo límite'), select(String(st.timeLimit), [300, 480, 600, 900].map((n) => [String(n), fmtTime(n)]), (v) => set({ timeLimit: +v })),
      h('label', null, `Bots (máx ${MAX_PLAYERS - humansN})`), select(String(st.bots), Array.from({ length: MAX_PLAYERS - humansN + 1 }, (_, i) => [String(i), String(i)]), (v) => set({ bots: +v })),
      h('label', null, 'Dificultad de bots'), select(String(st.botLevel), [['1', 'Fácil'], ['2', 'Normal'], ['3', 'Difícil']], (v) => set({ botLevel: +v as 1 | 2 | 3 })),
    );

    const startBtn = isHost
      ? h('button', { class: 'btn primary big', onclick: () => { const err = (s as HostSession).startMatch(); if (err) toast(err, 'error', 4500); } }, '▶ Empezar partida')
      : h('div', { class: 'wait' }, 'Esperando que el host empiece…');

    const chat = offline ? null : h('div', { class: 'chat' },
      h('div', { class: 'chat-log' }, this.chatLog.map((m) => h('div', null, h('b', null, m.from + ': '), m.text))),
      h('input', { class: 'input chat-input', placeholder: 'Escribí y Enter…', maxlength: 140, value: chatDraft, onkeydown: (e: KeyboardEvent) => {
        const el = e.target as HTMLInputElement;
        if (e.key === 'Enter' && el.value.trim()) { s.chat(el.value.trim()); el.value = ''; }
      } }),
    );

    root.append(header, h('div', { class: 'lobby-body' },
      h('div', { class: 'col left' }, teamsBox, h('h3', null, 'Elegí tu héroe'), heroesBox, h('div', { class: 'herorow' }, previewBox, heroInfo), this.hatPicker(me?.hat ?? 'none')),
      h('div', { class: 'col right' }, settings, startBtn, chat),
    ));
    const log = root.querySelector('.chat-log');
    if (log) log.scrollTop = log.scrollHeight;
    if (chatFocused) (root.querySelector('.chat-input') as HTMLInputElement | null)?.focus();

    if (!this.preview) this.preview = new HeroPreview(previewBox);
    else this.preview.mount(previewBox);
    if (me) this.preview.set(me.hero, teamMode ? me.team : 0, me.hat);
  }

  private pick(hero?: HeroId, team?: number) {
    audio.play('ui');
    if (hero) savePrefs({ hero });
    this.session?.pick(hero, team);
  }

  // ───────────── partida ─────────────

  private onStart(init: MatchInit) {
    // Los assets opcionales (public/assets) se precargan desde el menú; si todavía no terminaron,
    // se espera un poco (con tope) para que la partida ya arranque con ellos.
    void assetsReady().then(() => this.startMatch(init));
  }

  private startMatch(init: MatchInit) {
    const s = this.session;
    if (!s) return;
    this.stopAttract();
    this.preview?.dispose();
    this.preview = null;
    this.lobbyEl = null;
    this.match?.dispose();
    clear(this.ui);
    this.match = new MatchRunner(this.stage, s, init, { onEscape: () => this.escapeMenu() });
    this.match.start();
  }

  private escapeMenu() {
    if (this.escMenu) { this.escMenu(); this.escMenu = null; return; }
    const isHost = this.session?.isHost;
    const body = h('div', null,
      h('p', null, isHost ? 'Sos el host: si salís, la partida termina para todos.' : 'Podés volver a entrar con el mismo link: un bot te cubre mientras tanto.'),
      h('p', { class: 'muted' }, 'La partida sigue corriendo mientras este menú está abierto.'),
    );
    const close = modal('Pausa', body, [
      { label: 'Seguir jugando', kind: 'primary', onClick: () => { this.escMenu = null; } },
      { label: '⚙️ Ajustes', onClick: () => { this.escMenu = null; this.showSettings(); } },
      { label: isHost ? 'Cerrar sala' : 'Salir', kind: 'danger', onClick: () => { this.escMenu = null; void this.leave(); } },
    ]);
    this.escMenu = close;
  }

  private onEnd(res: MatchResultInfo) {
    this.match?.showResults(res, () => (this.session as HostSession).backToLobby(), () => void this.leave());
  }

  private onBack() {
    this.match?.dispose();
    this.match = null;
    this.escMenu?.();
    this.escMenu = null;
    const l = this.session?.lobby;
    if (!this.attract) {
      try { this.attract = new AttractMode(this.stage); } catch { /* */ }
    }
    audio.setMusic('menu');
    if (l) this.renderLobby(l);
  }

  // ───────────── modales ─────────────

  /** Tarjeta de perfil del menú: nivel de cuenta, XP y logros. */
  private profileCard() {
    const pr = getProfile();
    const pct = Math.min(100, (pr.xp / xpToNext(pr.level)) * 100);
    const hat = HAT_BY_ID[pr.hat];
    return h('div', { class: 'profile-card', onclick: () => this.showAchievements() },
      h('div', { class: 'pc-lv' }, String(pr.level)),
      h('div', { class: 'pc-info' },
        h('b', null, `${hat && hat.id !== 'none' ? hat.icon + ' ' : ''}${getPrefs().name}`),
        h('div', { class: 'pc-bar' }, h('div', { style: { width: `${pct}%` } })),
        h('span', null, `${pr.wins} victorias · ${pr.kills} ring-outs · 🏅 ${pr.achievements.length}/${ACHIEVEMENTS.length}`)),
    );
  }

  private hatPicker(current: string) {
    const lv = getProfile().level;
    return h('div', { class: 'hats' }, h('h3', null, 'Sombrero ', h('small', null, `(nivel de cuenta ${lv})`)),
      h('div', { class: 'hatrow' }, HATS.map((hd) => {
        const locked = hd.level > lv;
        return h('button', {
          class: 'hatbtn' + (hd.id === current ? ' on' : '') + (locked ? ' locked' : ''), disabled: locked,
          title: locked ? `Se desbloquea en nivel de cuenta ${hd.level}` : hd.name,
          onclick: () => { setHat(hd.id); audio.play('ui'); this.session?.pick(undefined, undefined, hd.id); },
        }, h('span', null, locked ? '🔒' : hd.icon), h('small', null, locked ? `Nv ${hd.level}` : hd.name));
      })));
  }

  private showAchievements() {
    const pr = getProfile();
    const body = h('div', { class: 'ach-list' },
      h('div', { class: 'ach-sum' }, `Nivel de cuenta ${pr.level} · ${pr.matches} partidas · ${pr.wins} victorias · mejor combo x${pr.bestCombo} · mejor racha ${pr.bestStreak}`),
      h('div', { class: 'ach-grid' }, ACHIEVEMENTS.map((a) => {
        const got = pr.achievements.includes(a.id);
        return h('div', { class: 'ach-item' + (got ? ' got' : '') }, h('div', { class: 'ach-big' }, got ? a.icon : '🔒'), h('b', null, a.name), h('span', null, a.desc));
      })),
      h('h4', null, 'Sombreros'),
      h('div', { class: 'ach-grid' }, HATS.filter((x) => x.id !== 'none').map((x) => {
        const got = x.level <= pr.level;
        return h('div', { class: 'ach-item' + (got ? ' got' : '') }, h('div', { class: 'ach-big' }, got ? x.icon : '🔒'), h('b', null, x.name), h('span', null, `Nivel de cuenta ${x.level}`));
      })),
    );
    modal('Logros', body, [{ label: 'Cerrar' }], 'wide');
  }

  private showHelp() {
    const body = h('div', { class: 'help' });
    body.innerHTML = `
      <div class="help-grid">
        <div>
          <h4>Controles</h4>
          <table>
            <tr><td><kbd>W A S D</kbd></td><td>Moverte (hacia donde mirás es más rápido)</td></tr>
            <tr><td><kbd>Mouse</kbd></td><td>Apuntar: siempre mirás al cursor</td></tr>
            <tr><td><kbd>Espacio</kbd></td><td>Saltar · en el aire: <b>segundo salto</b> (te salva de caer)</td></tr>
            <tr><td><kbd>Clic</kbd></td><td>Ataque básico: <b>rompe</b> (suma heat)</td></tr>
            <tr><td><kbd>Clic derecho</kbd></td><td><b>Empujón</b>: mantené para cargar, soltá para <b>sacar</b></td></tr>
            <tr><td><kbd>Q E F</kbd> <kbd>R</kbd></td><td>Habilidades y ulti: <b>mantené</b> para ver el área, <b>soltá</b> para usarla</td></tr>
            <tr><td><kbd>Shift</kbd></td><td><b>Dash</b>: ráfaga corta (en el aire, después del segundo salto)</td></tr>
            <tr><td><kbd>Tab</kbd></td><td>Tabla de jugadores</td></tr>
            <tr><td colspan="2" class="muted small">Solo con reglas <b>Completo</b>: <kbd>1 2 3</kbd> ítems activos · <kbd>C</kbd> forja · <kbd>V</kbd> reparar</td></tr>
          </table>
          <p class="muted small">Pasá el mouse por cualquier ícono (habilidades, ítems, tu cuerpo, héroes) para ver qué hace.</p>
        </div>
        <div>
          <h4>Cómo se gana una pelea</h4>
          <p><b>No hay barra de vida.</b> Cada golpe te agrieta: <span class="s1">Intacto</span> → <span class="s2">Agrietado</span> → <span class="s3">Quebrado</span> → <span class="s4">Destrozado</span>. Cuanto más roto estás, <b>más lejos volás</b>.</p>
          <p>Se muere solo por <b>ring-out</b>: saliendo del mapa. El ritmo es: <b>romper</b> (clic), <b>entrar</b> y <b>sacar</b> (empujón cargado).</p>
          <p>El cuerpo lanzado es un <b>proyectil</b>: rompe cobertura, se estampa contra paredes y voltea a otros. Mientras volás podés corregir con WASD y usar el segundo salto o trepar el borde.</p>
          <h4>Reglas</h4>
          <p><b>⚡ Brawler</b> (la de siempre): todo desbloqueado desde el principio y la <b>ulti se carga pegando</b> y juntando los trozos que sueltan las coberturas. Nada que administrar: a pelear.</p>
          <p><b>🧬 Completo</b>: niveles, materiales, forja de ítems y mutaciones, reparación. Es la base del futuro modo MOBA.</p>
          <p>Ojo: el piso frágil se rompe y deja agujeros.</p>
        </div>
      </div>`;
    modal('Cómo se juega', body, [{ label: '¡Entendido!', kind: 'primary' }], 'wide');
  }

  private showHeroes() {
    const body = h('div', { class: 'heroes-modal' }, HERO_IDS.map((id) => {
      const hd = HEROES[id];
      return h('div', { class: 'hm', style: { '--c': colorHex(FAMILY_COLORS[hd.family]) } },
        h('h3', null, hd.name, h('small', null, ` · ${FAMILY_NAMES[hd.family]} · ${hd.role}`)),
        h('p', null, hd.desc), h('p', { class: 'passive' }, hd.passive),
        h('ul', null, (['q', 'e', 'f', 'r'] as const).map((k) => h('li', null, h('b', null, `${k.toUpperCase()} ${hd.abilities[k].icon} ${hd.abilities[k].name}: `), hd.abilities[k].desc))));
    }));
    modal('Héroes', body, [{ label: 'Cerrar' }], 'wide');
  }

  private async showHistory() {
    const body = h('div', { class: 'history' }, h('div', { class: 'spinner' }));
    modal('Historial', body, [{ label: 'Cerrar' }]);
    if (!db.enabled()) {
      clear(body);
      body.append(h('p', null, 'El historial se guarda en Supabase (Postgres). Configurá Supabase y corré la migración SQL (ver README).'));
      return;
    }
    const [lb, recent] = await Promise.all([db.leaderboard(), db.recent()]);
    clear(body);
    if (!lb.length && !recent.length) { body.append(h('p', null, 'Todavía no hay partidas guardadas (o falta correr supabase/migrations/0001_init.sql).')); return; }
    body.append(
      h('h4', null, 'Ranking'),
      h('table', null, h('tr', null, h('th', null, 'Jugador'), h('th', null, 'Victorias'), h('th', null, 'Partidas'), h('th', null, 'Ring-outs')),
        lb.map((r) => h('tr', null, h('td', null, r.player_name), h('td', null, r.wins), h('td', null, r.matches), h('td', null, r.kills)))),
      h('h4', null, 'Últimas partidas'),
      h('table', null, recent.map((m) => h('tr', null, h('td', null, new Date(m.ended_at).toLocaleString()), h('td', null, MODE_INFO[m.mode as ModeId]?.name ?? m.mode), h('td', null, MAPS[m.map]?.name ?? m.map), h('td', null, fmtTime(m.duration_s)),
        h('td', null, m.draw ? 'Empate' : `Ganó ${TEAM_NAMES[m.winner_team ?? 0] ?? m.winner_team}`)))),
    );
  }

  private showSettings(advanced = false) {
    const p = getPrefs();
    const c = getConfig();
    const slider = (label: string, v: number, on: (x: number) => void) => h('div', { class: 'srow' }, h('label', null, label),
      h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: v, oninput: (e: Event) => on(+(e.target as HTMLInputElement).value) }));
    const check = (label: string, v: boolean, on: (x: boolean) => void) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: v, onchange: (e: Event) => on((e.target as HTMLInputElement).checked) }), label);
    const url = h('input', { class: 'input', placeholder: 'https://xxxx.supabase.co', value: c.supabaseUrl });
    const key = h('input', { class: 'input', placeholder: 'anon / publishable key', value: c.supabaseKey });
    const ice = h('textarea', { class: 'input', rows: 3, placeholder: '[{"urls":"turn:...","username":"...","credential":"..."}]' }, JSON.stringify(c.iceServers));
    const adv = h('details', { open: advanced }, h('summary', null, 'Avanzado: Supabase y TURN'),
      h('p', { class: 'muted small' }, 'Si el build ya trae Supabase configurado no hace falta tocar esto. Se guarda solo en este navegador.'),
      h('label', null, 'Supabase URL'), url, h('label', null, 'Supabase anon key'), key,
      h('label', null, 'Servidores ICE (STUN/TURN, JSON)'), ice,
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => {
          let iceServers: RTCIceServer[] | undefined;
          try { iceServers = JSON.parse(ice.value); } catch { toast('JSON de ICE inválido', 'error'); return; }
          saveConfig({ supabaseUrl: url.value.trim(), supabaseKey: key.value.trim(), iceServers });
          toast('Guardado. Recargando…', 'ok');
          setTimeout(() => location.reload(), 700);
        } }, 'Guardar y recargar'),
        h('button', { class: 'btn small ghost', onclick: () => { clearConfig(); toast('Config local borrada. Recargando…'); setTimeout(() => location.reload(), 700); } }, 'Usar la del build'),
      ),
    );
    const body = h('div', { class: 'settings-modal' },
      slider('Volumen general', p.volMaster, (x) => { savePrefs({ volMaster: x }); audio.setVolumes({ master: x }); }),
      slider('Música', p.volMusic, (x) => { savePrefs({ volMusic: x }); audio.setVolumes({ music: x }); }),
      slider('Efectos', p.volSfx, (x) => { savePrefs({ volSfx: x }); audio.setVolumes({ sfx: x }); }),
      check('Sombras (desactivar si va lento)', p.shadows, (x) => savePrefs({ shadows: x })),
      check('Alta resolución (pantallas retina)', p.hiDpi, (x) => savePrefs({ hiDpi: x })),
      check('Mostrar FPS', p.showFps, (x) => savePrefs({ showFps: x })),
      check('Brillos y postproceso (bloom, destellos) — desactivar si va lento', p.post, (x) => savePrefs({ post: x })),
      check('Locutor (voz que anuncia combos y rachas)', p.announcer, (x) => { savePrefs({ announcer: x }); audio.announcer = x; }),
      h('p', { class: 'muted small' }, 'Sombras y resolución se aplican en la próxima partida.'),
      adv,
    );
    modal('Ajustes', body, [{ label: 'Listo', kind: 'primary' }]);
  }
}

/** Mantiene ?sala=CODIGO en la URL: si el cliente recarga la página, vuelve a entrar solo. */
function setRoomParam(code: string | null) {
  try {
    const u = new URL(location.href);
    if (code) u.searchParams.set('sala', code); else u.searchParams.delete('sala');
    history.replaceState(null, '', u.toString());
  } catch { /* */ }
}
