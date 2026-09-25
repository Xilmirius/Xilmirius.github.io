// Gloop — familia Goo. Control/Support: terreno pegajoso, rebotes y la ola que saca gente.
import { NO_MODS } from '../mutations';
import type { HeroDef } from './types';

export const gloop: HeroDef = {
  id: 'gloop',
  name: 'Gloop',
  family: 'goo',
  role: 'Control / Support',
  color: 0x7bea4f,
  speed: 6.2,
  preferredRange: 7,
  desc: 'Una gota de resina con mucha personalidad. Pega, frena, rebota y protege a los suyos.',
  passive: 'Goo: rebotás contra las paredes sin lastimarte y tenés 60% más control en el aire.',
  basic: {
    name: 'Pegote',
    desc: 'Bola de goo a distancia media. Suma heat y frena un poco.',
    kind: 'ranged',
    cd: 0.5,
    range: 11,
    cast(sim, ch, ax, az) {
      const a = sim.clampAim(ch, ax, az, 11);
      sim.fireProjectile(ch, {
        kind: 'glob', speed: 17, range: 11, radius: 0.42, heat: 5, kb: 3, slow: [0.25, 1], destruct: 8,
        dirX: a.dx, dirZ: a.dz,
      }, NO_MODS);
    },
  },
  abilities: {
    q: {
      name: 'Charco', icon: '🫧', cd: 8, unlock: 1, range: 10, aim: 'point', radius: 3, shape: { k: 'circle', r: 3 }, bot: 'zone',
      desc: 'Tira un charco pegajoso: los enemigos adentro van 55% más lentos y se derriten de a poco. Tus aliados van más rápido.',
      cast(sim, ch, ax, az, m) {
        const a = sim.clampAim(ch, ax, az, 10);
        const r = 3 * m.area;
        sim.lob(ch, 'goolob', a.x, a.z, 0.45, (x, y, z) => {
          sim.addZone(ch, 'puddle', x, y, z, r, 4 * m.dur, (zn, dt) => {
            for (const e of sim.enemiesInRadius(ch.team, zn.x, zn.z, zn.r, zn.y)) {
              e.slowT = Math.max(e.slowT, 0.3);
              e.slowAmt = Math.max(e.slowAmt, 0.55);
              sim.dot(e, ch, 3 * m.heat * dt);
            }
            for (const al of sim.alliesInRadius(ch.team, zn.x, zn.z, zn.r, zn.y)) {
              al.hasteT = Math.max(al.hasteT, 0.3);
              al.hasteAmt = Math.max(al.hasteAmt, 0.15);
            }
          });
        });
      },
    },
    e: {
      name: 'Rebote', icon: '🏀', cd: 10, unlock: 2, range: 14, aim: 'dir', shape: { k: 'line', w: 1.2 }, bot: 'engage',
      desc: 'Te hacés pelota y rodás a toda velocidad rebotando en las paredes. Atropellás enemigos y no te pueden empujar.',
      cast(sim, ch, ax, az, m) {
        const a = sim.clampAim(ch, ax, az, 10);
        sim.roll(ch, a.dx, a.dz, 1.4 * m.dur, 15, (t, dx, dz) => {
          sim.hit(t, ch, { heat: 8 * m.heat, kb: 13 * m.kb, dirX: dx, dirZ: dz, fx: 'goo' });
        });
      },
    },
    f: {
      name: 'Burbuja', icon: '🛡️', cd: 12, unlock: 3, range: 8, aim: 'ally', shape: { k: 'point', r: 1 }, bot: 'buff',
      desc: 'Envuelve al aliado más cercano al cursor (o a vos) en una burbuja que absorbe 35 de heat y reduce el empuje.',
      cast(sim, ch, ax, az, m) {
        const t = sim.allyNearPoint(ch, ax, az, 8) ?? ch;
        sim.giveShield(t, 35 * m.dur, 4 * m.dur);
      },
    },
    r: {
      name: 'Marea', icon: '🌊', cd: 45, unlock: 5, range: 16, aim: 'dir', shape: { k: 'line', w: 4.8 }, bot: 'finisher',
      desc: 'Una ola de goo que avanza arrastrando a todos los enemigos. Ideal para sacarlos del mapa.',
      cast(sim, ch, ax, az, m) {
        const a = sim.clampAim(ch, ax, az, 16);
        sim.fireProjectile(ch, {
          kind: 'wave', speed: 14, range: 16, radius: 2.4 * m.area, heat: 12 * m.heat, kb: 18 * m.kb, up: 1, pierce: true,
          destruct: 30, slow: [0.4, 1.5], dirX: a.dx, dirZ: a.dz, ignoreSolid: true,
        }, m);
      },
    },
  },
};
