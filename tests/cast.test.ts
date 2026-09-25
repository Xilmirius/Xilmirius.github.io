// Lanzamiento estilo MOBA: tecla arma, clic izquierdo lanza, clic derecho/Esc cancela.
import { describe, expect, it } from 'vitest';
import { BTN } from '../src/core/input';
import { CastControl, type CastCheck, type CastKey } from '../src/game/castControl';

function mk(state: Partial<Record<CastKey, CastCheck>> = {}) {
  const denied: string[] = [];
  const c = new CastControl((k) => state[k] ?? 'aim', (k, why) => denied.push(`${k}:${why}`));
  return { c, denied, state };
}

describe('lanzamiento (tecla → clic izquierdo)', () => {
  it('la tecla arma y el clic izquierdo lanza un pulso de un tick', () => {
    const { c } = mk();
    c.key('q');
    expect(c.armed).toBe('q');
    expect(c.take()).toBe(0);
    expect(c.leftClick()).toBe(true);
    expect(c.armed).toBe(null);
    expect(c.take()).toBe(BTN.Q);
    expect(c.take()).toBe(0);
  });

  it('el clic derecho cancela sin lanzar', () => {
    const { c } = mk();
    c.key('e');
    expect(c.cancel()).toBe(true);
    expect(c.armed).toBe(null);
    expect(c.take()).toBe(0);
    // Sin nada armado, el clic derecho no se "come" (es el empujón).
    expect(c.cancel()).toBe(false);
    // Sin nada armado, el clic izquierdo es el ataque básico.
    expect(c.leftClick()).toBe(false);
  });

  it('las habilidades sin objetivo salen al apretar la tecla', () => {
    const { c } = mk({ f: 'now' });
    c.key('f');
    expect(c.armed).toBe(null);
    expect(c.take()).toBe(BTN.F);
  });

  it('otra tecla cambia lo armado; la misma tecla otra vez lo lanza', () => {
    const { c } = mk();
    c.key('q');
    c.key('r');
    expect(c.armed).toBe('r');
    c.key('r');
    expect(c.armed).toBe(null);
    expect(c.take()).toBe(BTN.R);
  });

  it('si no está disponible avisa por qué y no arma', () => {
    const { c, denied, state } = mk({ q: 'En enfriamiento' });
    c.key('q');
    expect(c.armed).toBe(null);
    expect(denied).toEqual(['q:En enfriamiento']);
    state.q = 'aim';
    c.key('q');
    state.q = 'Te moriste';
    c.revalidate();
    expect(c.armed).toBe(null);
  });

  it('lanzamiento rápido: todo sale al apretar la tecla', () => {
    const { c } = mk();
    c.quick = true;
    c.key('i2');
    expect(c.armed).toBe(null);
    expect(c.take()).toBe(BTN.I2);
  });
});
