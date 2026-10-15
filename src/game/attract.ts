// Fondo del menú: una partida de bots del juego elegido corriendo detrás de la UI ("attract mode").
import { BotBrain } from '../core/bots';
import { DT } from '../core/constants';
import { GAMES, mapsFor, normalizeSettings, themeOf, type GameId } from '../core/games';
import { Simulation } from '../core/sim';
import { F_DEAD, FrameBuffer, buildWorldFrame } from '../core/snapshot';
import { DEFAULT_SETTINGS, HERO_IDS } from '../core/types';
import { GameView } from '../render/gameView';
import { Ticker } from './ticker';

/** Segundos que se deja ver el final de una partida de vitrina antes de arrancar otra. */
const REPLAY_AFTER = 4;

export class AttractMode {
  private sim!: Simulation;
  private view!: GameView;
  private brains: BotBrain[] = [];
  private ticker: Ticker;
  private frames = new FrameBuffer();
  private raf = 0;
  private last = performance.now();
  private followT = 0;
  private follow = 1;
  private endT = 0;
  /** Cuántas veces se armó la partida (para ir cambiando de mapa). */
  private round = Math.floor(Math.random() * 8);
  private disposed = false;

  constructor(private container: HTMLElement, readonly game: GameId = 'arena') {
    this.build();
    this.ticker = new Ticker(() => {
      this.sim.chars.forEach((c, i) => { c.input = this.brains[i].think(this.sim, c, DT); });
      this.sim.step();
      for (const e of this.sim.drainEvents()) this.view.handleEvent(e);
      this.frames.push(buildWorldFrame(this.sim));
      // Las partidas que terminan (una carrera, una horda) vuelven a empezar solas.
      if (this.sim.phase === 'end' && (this.endT += DT) > REPLAY_AFTER) { this.view.dispose(); this.build(); }
    });
    this.ticker.start();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const w = this.frames.sample(this.sim.tick - 1 + this.ticker.alpha);
      if (!w) return;
      this.followT -= dt;
      let c = w.chars.find((x) => x.id === this.follow);
      if (!c || c.fl & F_DEAD || this.followT < 0) {
        const alive = w.chars.filter((x) => !(x.fl & F_DEAD));
        if (alive.length) { c = alive[Math.floor(Math.random() * alive.length)]; this.follow = c.id; this.followT = 8; }
      }
      this.view.render(w, dt, c ?? null, null);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Arma la partida de vitrina: el modo de entrada del juego, en su mapa y con su tema, sin final por puntos ni por tiempo. */
  private build() {
    const g = GAMES[this.game];
    const roster = Array.from({ length: g.demo.bots }, (_, i) => ({ pid: 'demo' + i, name: '', hero: HERO_IDS[i % HERO_IDS.length], team: i % 2, bot: true }));
    // Los juegos con recorrido muestran un mapa distinto cada vez, con el tema que le queda.
    const maps = mapsFor(g);
    const map = g.demo.tour ? maps[this.round++ % maps.length] : g.demo.map;
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS, mode: g.id === 'arena' ? 'kills' : g.modes[0], map, theme: (g.demo.tour && themeOf(map)) || g.demo.theme,
      killTarget: 9999, timeLimit: 99999, lives: 5,
    });
    const seed = Date.now() % 100000;
    this.sim = new Simulation({ settings, roster, seed });
    this.brains = this.sim.chars.map((c) => new BotBrain(2, c.id * 7));
    this.view = new GameView(this.container, settings.map, this.sim.chars.map((c) => ({ id: c.id, pid: c.pid, name: '', team: c.team, hero: c.hero, bot: true, hat: ['crown', 'party', 'halo', 'horns'][c.id % 4] })), '-', { shadows: false, pixelRatio: 1, post: false, theme: settings.theme, organic: settings.organic, seed });
    this.view.renderer.domElement.classList.add('attract');
    this.frames = new FrameBuffer();
    this.endT = 0;
    this.followT = 0;
  }

  resize() { this.view.resize(); }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ticker.stop();
    this.view.dispose();
  }
}
