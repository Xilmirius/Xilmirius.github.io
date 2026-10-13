// Controles táctiles: la lógica (palanca, botones y a dónde se apunta), sin pantalla.
import { describe, expect, it } from 'vitest';
import { BTN } from '../src/core/input';
import { CastControl, type CastCheck, type CastKey } from '../src/game/castControl';
import { STICK, stick, TouchInput, type AimKind, type AimSpec } from '../src/game/touchInput';

const DT = 1 / 60;
const DIR: AimSpec = { reach: 12, point: false };
const POINT: AimSpec = { reach: 10, point: true };
const none = () => null;
/** Punto apuntado en un tick, con el mismo alcance para todo. */
const aim = (t: TouchInput, spec: AimSpec = DIR, target: { x: number; z: number } | null = null) => t.aim(DT, () => spec, () => target);

describe('Palanca', () => {
  it('tiene zona muerta y llega a fondo antes del borde', () => {
    expect(stick(0.05, 0.05)).toEqual({ x: 0, y: 0, m: 0 });
    const full = stick(STICK.full, 0);
    expect(full.m).toBe(1);
    expect(full.x).toBeCloseTo(1);
    const over = stick(0, -3);
    expect(over.m).toBe(1);
    expect(over.y).toBeCloseTo(-1);
  });

  it('a medio camino da una fuerza intermedia sin torcer la dirección', () => {
    const s = stick(0.3, 0.3);
    expect(s.m).toBeGreaterThan(0.2);
    expect(s.m).toBeLessThan(0.8);
    expect(s.x).toBeCloseTo(s.y);
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(s.m);
  });
});

describe('Botones táctiles', () => {
  it('un toque más corto que un tick igual se registra, una sola vez', () => {
    const t = new TouchInput();
    t.press(BTN.JUMP);
    t.release(BTN.JUMP);
    expect(t.sample().b & BTN.JUMP).toBe(BTN.JUMP);
    expect(t.sample().b & BTN.JUMP).toBe(0);
  });

  it('mantener un botón lo manda en cada tick hasta soltarlo, junto con la palanca', () => {
    const t = new TouchInput();
    t.move(0.5, -1);
    t.press(BTN.BASIC);
    expect(t.sample()).toEqual({ mx: 0.5, mz: -1, b: BTN.BASIC });
    expect(t.sample().b).toBe(BTN.BASIC);
    t.release(BTN.BASIC);
    expect(t.sample().b).toBe(0);
  });

  it('reset suelta todo', () => {
    const t = new TouchInput();
    t.move(1, 0);
    t.press(BTN.PUSH);
    t.aimStart('push');
    t.reset();
    expect(t.sample()).toEqual({ mx: 0, mz: 0, b: 0 });
    expect(t.aiming).toBeNull();
  });
});

describe('Apuntar con los dedos', () => {
  it('sin tocar nada mira hacia donde camina, y se queda mirando ahí al frenar', () => {
    const t = new TouchInput();
    t.move(1, 0);
    let a = aim(t);
    expect(a.x).toBeGreaterThan(5);
    expect(a.z).toBeCloseTo(0);
    t.move(0, 0);
    a = aim(t);
    expect(a.x).toBeGreaterThan(5);
  });

  it('dedo apoyado sin arrastrar: le apunta al rival que diga la ayuda', () => {
    const t = new TouchInput();
    t.move(1, 0);
    t.aimStart('basic');
    const a = aim(t, DIR, { x: -3, z: 4 });
    expect(a).toEqual({ x: -3, z: 4 });
  });

  it('sin rival al alcance, apunta hacia donde miraba', () => {
    const t = new TouchInput();
    t.move(0, -1);
    aim(t);
    t.aimStart('q');
    const a = aim(t, POINT);
    expect(a.x).toBeCloseTo(0);
    expect(a.z).toBeCloseTo(-POINT.reach * 0.75);
  });

  it('arrastrando apunta hacia donde se arrastra aunque haya un rival para el otro lado', () => {
    const t = new TouchInput();
    t.aimStart('basic');
    t.aimMove('basic', 0, -0.3);
    const a = aim(t, DIR, { x: 5, z: 5 });
    expect(a.x).toBeCloseTo(0);
    // Solo importa la dirección: da igual cuánto se arrastre.
    expect(a.z).toBeCloseTo(-7);
  });

  it('un área en el piso llega tan lejos como se arrastre el dedo, y nunca más allá de su alcance', () => {
    const t = new TouchInput();
    t.aimStart('r');
    t.aimMove('r', 0.5, 0);
    expect(aim(t, POINT).x).toBeCloseTo(5);
    t.aimMove('r', 1, 0);
    expect(aim(t, POINT).x).toBeCloseTo(10);
    // La ayuda tampoco se pasa del alcance.
    const u = new TouchInput();
    u.aimStart('r');
    const far = aim(u, POINT, { x: 0, z: 30 });
    expect(far.z).toBeCloseTo(10);
  });

  it('al soltar sigue apuntando ahí un instante (el lanzamiento sale en el tick siguiente) y queda mirando para ese lado', () => {
    const t = new TouchInput();
    t.move(1, 0);
    aim(t);
    t.move(0, 0);
    t.aimStart('q');
    t.aimMove('q', 0, 1);
    aim(t, POINT);
    t.aimEnd('q');
    expect(t.aiming).toBeNull();
    expect(aim(t, POINT)).toEqual({ x: 0, z: 10 });
    for (let i = 0; i < 40; i++) aim(t, POINT);
    // Ya pasó el instante: mira hacia donde apuntó (no vuelve a donde caminaba antes).
    const a = aim(t, POINT);
    expect(a.x).toBeCloseTo(0);
    expect(a.z).toBeCloseTo(7);
  });

  it('cancelar no deja apuntando ahí', () => {
    const t = new TouchInput();
    t.move(1, 0);
    aim(t);
    t.aimStart('q');
    t.aimMove('q', -1, 0);
    t.aimEnd('q', false);
    // Sigue caminando al este: mira al este.
    expect(aim(t).x).toBeGreaterThan(5);
  });

  it('con dos botones apretados manda el último; al soltarlo vuelve al anterior', () => {
    const t = new TouchInput();
    const specs: Record<string, AimSpec> = { basic: DIR, q: POINT };
    const at = () => t.aim(DT, (k: AimKind) => specs[k], none);
    t.aimStart('basic');
    t.aimMove('basic', 1, 0);
    t.aimStart('q');
    t.aimMove('q', 0, -1);
    expect(t.aiming?.kind).toBe('q');
    expect(at().z).toBeCloseTo(-10);
    t.aimEnd('q');
    expect(t.aiming?.kind).toBe('basic');
    expect(at().x).toBeCloseTo(7);
  });
});

describe('Lanzar con el dedo apoyado', () => {
  const make = (check: (k: CastKey) => CastCheck) => {
    const denied: string[] = [];
    return { c: new CastControl(check, (_k, why) => denied.push(why)), denied };
  };

  it('lo que se apunta queda armado y sale al soltar', () => {
    const { c } = make(() => 'aim');
    expect(c.hold('q')).toBe(true);
    expect(c.armed).toBe('q');
    expect(c.take()).toBe(0);
    expect(c.leftClick()).toBe(true);
    expect(c.take()).toBe(BTN.Q);
    expect(c.armed).toBeNull();
  });

  it('arma aunque esté puesto el lanzamiento rápido (con el dedo siempre se puede apuntar)', () => {
    const { c } = make(() => 'aim');
    c.quick = true;
    expect(c.hold('e')).toBe(true);
    expect(c.take()).toBe(0);
  });

  it('lo que no se apunta sale al toque', () => {
    const { c } = make(() => 'now');
    expect(c.hold('f')).toBe(false);
    expect(c.take()).toBe(BTN.F);
  });

  it('lo que no se puede usar avisa por qué y no queda armado', () => {
    const { c, denied } = make(() => 'lista en 3 s');
    expect(c.hold('r')).toBe(false);
    expect(c.armed).toBeNull();
    expect(c.take()).toBe(0);
    expect(denied).toEqual(['lista en 3 s']);
  });

  it('soltar sobre la ✕ lo cancela', () => {
    const { c } = make(() => 'aim');
    c.hold('i1');
    expect(c.cancel()).toBe(true);
    expect(c.take()).toBe(0);
  });
});
