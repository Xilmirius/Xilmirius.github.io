// Fondo del menú: una partida de bots corriendo detrás de la UI ("attract mode").
import { BotBrain } from '../core/bots';
import { DT } from '../core/constants';
import { Simulation } from '../core/sim';
import { F_DEAD, FrameBuffer, buildWorldFrame } from '../core/snapshot';
import { DEFAULT_SETTINGS, HERO_IDS } from '../core/types';
import { GameView } from '../render/gameView';
import { Ticker } from './ticker';

export class AttractMode {
  private sim: Simulation;
  private view: GameView;
  private brains: BotBrain[];
  private ticker: Ticker;
  private frames = new FrameBuffer();
  private raf = 0;
  private last = performance.now();
  private followT = 0;
  private follow = 1;
  private disposed = false;

  constructor(container: HTMLElement) {
    const roster = HERO_IDS.map((hero, i) => ({ pid: 'demo' + i, name: '', hero, team: i % 2, bot: true }));
    this.sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, mode: 'kills', killTarget: 9999, timeLimit: 99999, map: 'cantera' }, roster, seed: Date.now() % 100000 });
    this.brains = this.sim.chars.map((c) => new BotBrain(2, c.id * 7));
    this.view = new GameView(container, 'cantera', this.sim.chars.map((c) => ({ id: c.id, pid: c.pid, name: '', team: c.team, hero: c.hero, bot: true, hat: ['crown', 'party', 'halo', 'horns'][c.id % 4] })), '-', { shadows: false, pixelRatio: 1, post: false, theme: 'neon' });
    this.view.renderer.domElement.classList.add('attract');
    this.ticker = new Ticker(() => {
      this.sim.chars.forEach((c, i) => { c.input = this.brains[i].think(this.sim, c, DT); });
      this.sim.step();
      for (const e of this.sim.drainEvents()) this.view.handleEvent(e);
      this.frames.push(buildWorldFrame(this.sim));
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

  resize() { this.view.resize(); }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ticker.stop();
    this.view.dispose();
  }
}
