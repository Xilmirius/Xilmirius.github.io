// Prisma — familia Cristal. Burst/Carry: frágil pero preciso, ulti de explosión en área.
import { NO_MODS } from '../mutations';
import type { HeroDef } from './types';

export const prisma: HeroDef = {
  id: 'prisma',
  name: 'Prisma',
  family: 'crystal',
  role: 'Burst / Carry',
  color: 0x7fe3ff,
  speed: 6.4,
  preferredRange: 8,
  desc: 'Cristal tallado a mano, filoso y vanidoso. Pega de lejos y fuerte, pero se quiebra fácil.',
  passive: 'Cristal: +15% heat infligido, volás 10% más. Al quedar Destrozado, estallás una vez empujando a todos.',
  basic: {
    name: 'Esquirla',
    desc: 'Disparo de cristal a distancia. Suma heat (no empuja: los disparos básicos rompen, no alejan).',
    kind: 'ranged',
    cd: 0.38,
    range: 14,
    cast(sim, ch, ax, az) {
      const a = sim.clampAim(ch, ax, az, 14);
      const spreads = ch.refractT > 0 ? [-0.2, 0, 0.2] : [0];
      for (const s of spreads) {
        const c = Math.cos(s), sn = Math.sin(s);
        sim.fireProjectile(ch, {
          kind: 'shard', speed: 25, range: 14, radius: 0.3, heat: 4, kb: 0, destruct: 8,
          dirX: a.dx * c - a.dz * sn, dirZ: a.dx * sn + a.dz * c,
        }, NO_MODS);
      }
    },
  },
  abilities: {
    q: {
      name: 'Lanza de cuarzo', icon: '🔹', cd: 6, unlock: 1, range: 18, aim: 'dir', shape: { k: 'line', w: 0.9 }, bot: 'poke',
      desc: 'Tras cargar un instante, dispara una lanza que atraviesa a todos y empuja fuerte.',
      cast(sim, ch, ax, az, m) {
        sim.windup(ch, 0.25, () => {
          const a = sim.clampAim(ch, ch.input.ax, ch.input.az, 18);
          sim.fireProjectile(ch, {
            kind: 'lance', speed: 38, range: 18, radius: 0.45 * m.area, heat: 13 * m.heat, kb: 13 * m.kb, pierce: true, destruct: 25,
            dirX: a.dx, dirZ: a.dz,
          }, m);
        }, { slow: 0.5, kind: 'aim' });
        void ax; void az;
      },
    },
    e: {
      name: 'Destello', icon: '✨', cd: 9, unlock: 2, range: 6, aim: 'point', shape: { k: 'blink', r: 2.6 }, bot: 'escape',
      desc: 'Parpadeo hacia el cursor. Donde estabas queda una mina de cristal que explota enseguida.',
      cast(sim, ch, ax, az, m) {
        const ox = ch.pos.x, oy = ch.pos.y, oz = ch.pos.z;
        if (!sim.blink(ch, ax, az, 6)) return false;
        const r = 2.6 * m.area;
        sim.telegraph('mine', ch.team, ox, oy, oz, r, 0.6);
        sim.schedule(0.6, () => {
          sim.blast(ch, ch.team, ox, oy + 0.5, oz, { radius: r, heat: 10 * m.heat, kb: 11 * m.kb, destruct: 20, fx: 'crystal' }, m);
        });
      },
    },
    f: {
      name: 'Refracción', icon: '🔆', cd: 16, unlock: 3, range: 0, aim: 'self', shape: { k: 'self', r: 0 }, bot: 'buff',
      desc: 'Por 4 s tus esquirlas se dividen en tres.',
      cast(sim, ch, _ax, _az, m) {
        ch.refractT = 4 * m.dur;
        sim.emit({ k: 'shield', id: ch.id });
      },
    },
    r: {
      name: 'Supernova', icon: '💎', cd: 50, unlock: 5, range: 12, aim: 'point', radius: 5, shape: { k: 'circle', r: 5 }, bot: 'finisher',
      desc: 'Lanza un cristal gigante que cae en el punto marcado y estalla en un área enorme.',
      cast(sim, ch, ax, az, m) {
        const a = sim.clampAim(ch, ax, az, 12);
        const r = 5 * m.area;
        const gy = sim.groundY(a.x, a.z, ch.pos.y);
        sim.telegraph('nova', ch.team, a.x, gy, a.z, r, 0.9);
        sim.lob(ch, 'nova', a.x, a.z, 0.9, (x, y, z) => {
          sim.blast(ch, ch.team, x, y + 0.5, z, { radius: r, heat: 28 * m.heat, kb: 22 * m.kb, up: 2, destruct: 70, tile: 60, tileRadius: r * 0.7, fx: 'nova' }, m);
        });
      },
    },
  },
};
