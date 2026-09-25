// Remache — familia Metal. Constructor/Utilidad: pone cobertura, torretas y engancha gente.
import { NO_MODS } from '../mutations';
import type { HeroDef } from './types';

export const remache: HeroDef = {
  id: 'remache',
  name: 'Remache',
  family: 'metal',
  role: 'Constructor / Utilidad',
  color: 0xffc94a,
  speed: 6.0,
  preferredRange: 2,
  desc: 'Chatarra reciclada con casco de obra. Construye lo que Canto rompe y te trae de las pestañas.',
  passive: 'Metal: volás 15% menos, sos algo más lento y tus construcciones aguantan 30% más.',
  basic: {
    name: 'Llavazo',
    desc: 'Golpe amplio con la llave. Suma heat.',
    kind: 'melee',
    cd: 0.55,
    range: 2.3,
    cast(sim, ch) {
      sim.meleeArc(ch, { range: 2.3, angle: 120, heat: 6, kb: 6, destruct: 18, fx: 'wrench' }, NO_MODS);
    },
  },
  abilities: {
    q: {
      name: 'Muro', icon: '🧱', cd: 9, unlock: 1, range: 9, aim: 'point', radius: 1.8, bot: 'zone',
      desc: 'Levanta un muro de chapa perpendicular a tu mirada. Frena proyectiles y sirve para estamparlos contra algo.',
      cast(sim, ch, ax, az, m) {
        const a = sim.clampAim(ch, ax, az, 9);
        sim.buildWall(ch, 'wall', 'metal', a.x, a.z, a.dx, a.dz, 90 * m.dur, 10 * m.dur, Math.round(3 * Math.min(1.34, m.area)));
      },
    },
    e: {
      name: 'Torreta', icon: '🔩', cd: 14, unlock: 2, range: 6, aim: 'point', bot: 'zone',
      desc: 'Planta una torreta que dispara al enemigo más cercano durante 8 s.',
      cast(sim, ch, ax, az, m) {
        const a = sim.clampAim(ch, ax, az, 6);
        return sim.buildTurret(ch, a.x, a.z, 70 * m.dur, 8 * m.dur, m);
      },
    },
    f: {
      name: 'Gancho', icon: '🪝', cd: 10, unlock: 3, range: 12, aim: 'dir', bot: 'engage',
      desc: 'Lanza un gancho: si engancha a un enemigo, lo trae hacia vos; si engancha una pared o cobertura, te tira hacia ella.',
      cast(sim, ch, ax, az, m) {
        const a = sim.clampAim(ch, ax, az, 12);
        sim.fireProjectile(ch, {
          kind: 'hook', speed: 32, range: 12, radius: 0.4, heat: 0, kb: 0, destruct: 0, dirX: a.dx, dirZ: a.dz,
          onHit: (t) => sim.pullTo(t, ch, 6 * m.heat, 0.35 * m.stun),
          onSolid: (p) => sim.zip(ch, p.x - a.dx * 0.9, p.z - a.dz * 0.9, 24, 0.8),
        }, m);
      },
    },
    r: {
      name: 'Imán', icon: '🧲', cd: 50, unlock: 5, range: 10, aim: 'point', radius: 6, bot: 'finisher',
      desc: 'Un campo magnético que chupa a los enemigos hacia el centro y después los repele con una explosión.',
      cast(sim, ch, ax, az, m) {
        const a = sim.clampAim(ch, ax, az, 10);
        const r = 6 * m.area;
        const gy = sim.groundY(a.x, a.z, ch.pos.y);
        sim.telegraph('magnet', ch.team, a.x, gy, a.z, r, 1.5);
        sim.addZone(ch, 'magnet', a.x, gy, a.z, r, 1.5, (zn, dt) => {
          for (const e of sim.enemiesInRadius(ch.team, zn.x, zn.z, zn.r, zn.y, 3)) {
            if (e.kbImmune > 0) continue;
            const dx = zn.x - e.pos.x, dz = zn.z - e.pos.z;
            const d = Math.hypot(dx, dz) || 1;
            const pull = Math.min(d * 6, 9);
            e.vel.x += ((dx / d) * pull - e.vel.x) * Math.min(1, 8 * dt);
            e.vel.z += ((dz / d) * pull - e.vel.z) * Math.min(1, 8 * dt);
            e.hitSlide = 0.2;
          }
        }, (zn) => {
          sim.blast(ch, ch.team, zn.x, zn.y + 0.5, zn.z, { radius: r * 0.8, heat: 20 * m.heat, kb: 22 * m.kb, up: 2, destruct: 50, tile: 30, tileRadius: 2.5, fx: 'magnet' }, m);
        });
      },
    },
  },
};
