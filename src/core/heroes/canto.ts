// Canto — familia Piedra. Iniciador/Tanque: el único que rompe cobertura activamente.
import { NO_MODS } from '../mutations';
import type { HeroDef } from './types';

export const canto: HeroDef = {
  id: 'canto',
  name: 'Canto',
  family: 'stone',
  role: 'Iniciador / Tanque',
  color: 0xff8a3d,
  speed: 6.1,
  preferredRange: 1.6,
  desc: 'Un canto rodado con ganas de pelea. Entra primero, rompe todo y deja al rival servido.',
  passive: 'Piedra: volás 20% menos, pero te agrietás 20% más rápido y sos algo más lento.',
  basic: {
    name: 'Piñazo',
    desc: 'Golpe cuerpo a cuerpo. Suma heat.',
    kind: 'melee',
    cd: 0.45,
    range: 2.0,
    cast(sim, ch) {
      sim.meleeArc(ch, { range: 2.0, angle: 100, heat: 7, kb: 5, destruct: 16, fx: 'punch' }, NO_MODS);
    },
  },
  abilities: {
    q: {
      name: 'Embestida', icon: '🐏', cd: 7, unlock: 1, range: 8, aim: 'dir', shape: { k: 'line', w: 1.2 }, bot: 'engage',
      desc: 'Carga hacia adelante. El primer enemigo que toca queda aturdido y sale despedido. Rompe lo que encuentra.',
      cast(sim, ch, ax, az, m) {
        const a = sim.clampAim(ch, ax, az, 8);
        sim.dash(ch, {
          dirX: a.dx, dirZ: a.dz, dist: 8 * Math.sqrt(m.area), speed: 26, destruct: 30,
          onHit: (t) => {
            sim.hit(t, ch, { heat: 10 * m.heat, kb: 9 * m.kb, dirX: a.dx, dirZ: a.dz, stun: 0.7 * m.stun, fx: 'ram' });
            return true;
          },
        });
      },
    },
    e: {
      name: 'Rompemuros', icon: '🔨', cd: 9, unlock: 2, range: 4, aim: 'dir', shape: { k: 'cone', deg: 70 }, bot: 'poke',
      desc: 'Golpe al piso en cono. Destroza cobertura y baldosas frágiles, y empuja fuerte.',
      cast(sim, ch, _ax, _az, m) {
        sim.windup(ch, 0.22, () => {
          sim.meleeArc(ch, { range: 4 * m.area, angle: 70, heat: 14 * m.heat, kb: 14 * m.kb, destruct: 60, tile: 45, fx: 'slam' }, m);
        }, { lock: true, kind: 'slam' });
      },
    },
    f: {
      name: 'Piel de roca', icon: '🪨', cd: 14, unlock: 3, range: 0, aim: 'self', shape: { k: 'self', r: 0 }, bot: 'buff',
      desc: 'Te endurecés: 2.2 s sin knockback y 35% menos heat.',
      cast(sim, ch, _ax, _az, m) {
        const d = 2.2 * m.dur;
        ch.kbImmune = Math.max(ch.kbImmune, d);
        ch.armorT = d;
        ch.armorAmt = 0.35;
        sim.emit({ k: 'shield', id: ch.id });
      },
    },
    r: {
      name: 'Avalancha', icon: '⛰️', cd: 45, unlock: 5, range: 11, aim: 'point', radius: 4, shape: { k: 'circle', r: 4 }, bot: 'finisher',
      desc: 'Salto enorme al punto marcado. Al caer, onda sísmica que lanza a todos y abre agujeros en el piso frágil.',
      cast(sim, ch, ax, az, m) {
        const a = sim.clampAim(ch, ax, az, 11);
        const r = 4 * m.area;
        sim.telegraph('quake', ch.team, a.x, sim.groundY(a.x, a.z, ch.pos.y), a.z, r, 0.7);
        sim.leap(ch, a.x, a.z, 0.7, 4.5, () => {
          sim.blast(ch, ch.team, ch.pos.x, ch.pos.y, ch.pos.z, {
            radius: r, heat: 22 * m.heat, kb: 20 * m.kb, up: 3, destruct: 80, tile: 999, tileRadius: 3 * m.area, fx: 'quake',
          }, m);
        });
      },
    },
  },
};
