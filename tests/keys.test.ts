// Teclas asignables: distribución recomendada, intercambio al chocar y nombres para mostrar.
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetForTests, actionOf, applyPreset, currentPreset, keyLabel, keyName, keyOf, setBind } from '../src/game/keybinds';

describe('teclas asignables', () => {
  beforeEach(() => _resetForTests());

  it('por defecto: habilidades Q 2 3, ulti E; ítems 1 R F', () => {
    expect([keyName('q'), keyName('e'), keyName('f'), keyName('r')]).toEqual(['Q', '2', '3', 'E']);
    expect([keyName('i1'), keyName('i2'), keyName('i3')]).toEqual(['1', 'R', 'F']);
    expect(actionOf('KeyE')).toBe('r');
    expect(actionOf('KeyF')).toBe('i3');
    expect(currentPreset()).toBe('recomendado');
  });

  it('asignar una tecla usada intercambia las dos acciones', () => {
    setBind('q', 'KeyE');
    expect(keyOf('q')).toBe('KeyE');
    expect(keyOf('r')).toBe('KeyQ');
    expect(actionOf('KeyQ')).toBe('r');
    expect(currentPreset()).toBe(null);
  });

  it('Esc no se puede asignar; Shift derecho vale como Shift', () => {
    expect(setBind('dash', 'Escape')).toBe(false);
    expect(actionOf('ShiftRight')).toBe('dash');
  });

  it('distribución anterior disponible', () => {
    applyPreset('anterior');
    expect([keyName('q'), keyName('e'), keyName('f'), keyName('r')]).toEqual(['Q', 'E', 'F', 'R']);
    expect([keyName('i1'), keyName('i2'), keyName('i3')]).toEqual(['1', '2', '3']);
  });

  it('nombres de teclas', () => {
    expect(keyLabel('Space')).toBe('Espacio');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('Digit7')).toBe('7');
    expect(keyLabel('ArrowUp')).toBe('↑');
  });
});
