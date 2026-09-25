// Reloj de simulación. Corre en un Web Worker porque los navegadores frenan los setInterval de
// pestañas en segundo plano (si el host cambia de pestaña, el juego no se congela para los demás).
import { TICK_RATE } from '../core/constants';

export class Ticker {
  private worker: Worker | null = null;
  private interval: number | null = null;
  private last = 0;
  private acc = 0;
  private stepMs = 1000 / TICK_RATE;

  constructor(private onStep: () => void) {}

  start() {
    this.last = performance.now();
    this.acc = 0;
    const pump = () => this.pump();
    try {
      const src = 'let i=setInterval(()=>postMessage(0),4);onmessage=e=>{if(e.data==="stop"){clearInterval(i);close()}}';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      this.worker = new Worker(url);
      this.worker.onmessage = pump;
      // Si el entorno bloquea workers desde blob: (CSP estricta), caer a setInterval.
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
        if (this.interval === null) this.interval = window.setInterval(pump, 4);
      };
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.interval = window.setInterval(pump, 4);
    }
  }

  /** Fracción del próximo tick (para interpolar el render). */
  get alpha() { return Math.min(1, this.acc / this.stepMs); }

  private pump() {
    const now = performance.now();
    this.acc += now - this.last;
    this.last = now;
    let n = 0;
    while (this.acc >= this.stepMs && n < 30) {
      this.acc -= this.stepMs;
      this.onStep();
      n++;
    }
    if (n >= 30) this.acc = 0; // estuvimos congelados (>0.5 s): no intentar ponernos al día
  }

  stop() {
    this.worker?.postMessage('stop');
    this.worker?.terminate();
    this.worker = null;
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
  }
}
