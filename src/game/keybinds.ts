// Teclas asignables. Cada acción del juego tiene una tecla (código físico, `KeyboardEvent.code`),
// guardada en este navegador. Todo lo que muestra una tecla (HUD, tooltips, ayuda, lobby) la lee de acá,
// así que si la cambiás en Ajustes cambia en todos lados.
//
// Por defecto (pedido del jugador): habilidades en Q, 2, 3 y la ulti en E; ítems activos en 1, R y F.
// Los ids internos de las habilidades siguen siendo q/e/f/r (1ª, 2ª, 3ª y ulti) aunque la tecla sea otra.

export type ActionId =
  | 'up' | 'down' | 'left' | 'right' | 'jump' | 'dash'
  | 'q' | 'e' | 'f' | 'r'
  | 'i1' | 'i2' | 'i3'
  | 'recall' | 'repair' | 'forge' | 'board';

export interface ActionDef { id: ActionId; label: string; group: string }

export const ACTIONS: ActionDef[] = [
  { id: 'q', label: 'Habilidad 1', group: 'Habilidades' },
  { id: 'e', label: 'Habilidad 2', group: 'Habilidades' },
  { id: 'f', label: 'Habilidad 3', group: 'Habilidades' },
  { id: 'r', label: 'Ulti', group: 'Habilidades' },
  { id: 'i1', label: 'Ítem activo 1', group: 'Ítems' },
  { id: 'i2', label: 'Ítem activo 2', group: 'Ítems' },
  { id: 'i3', label: 'Ítem activo 3', group: 'Ítems' },
  { id: 'up', label: 'Arriba', group: 'Movimiento' },
  { id: 'down', label: 'Abajo', group: 'Movimiento' },
  { id: 'left', label: 'Izquierda', group: 'Movimiento' },
  { id: 'right', label: 'Derecha', group: 'Movimiento' },
  { id: 'jump', label: 'Saltar', group: 'Movimiento' },
  { id: 'dash', label: 'Dash', group: 'Movimiento' },
  { id: 'recall', label: 'Volver a la base (Asedio)', group: 'Otros' },
  { id: 'repair', label: 'Reparar (mantener)', group: 'Otros' },
  { id: 'forge', label: 'Forja', group: 'Otros' },
  { id: 'board', label: 'Tabla (mantener)', group: 'Otros' },
];

export type Binds = Record<ActionId, string>;

const BASE: Omit<Binds, 'q' | 'e' | 'f' | 'r' | 'i1' | 'i2' | 'i3'> = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', dash: 'ShiftLeft',
  recall: 'KeyB', repair: 'KeyV', forge: 'KeyC', board: 'Tab',
};

export const PRESETS: Record<string, { name: string; binds: Binds }> = {
  recomendado: {
    name: 'Recomendado (Q 2 3 · E ulti · ítems 1 R F)',
    binds: { ...BASE, q: 'KeyQ', e: 'Digit2', f: 'Digit3', r: 'KeyE', i1: 'Digit1', i2: 'KeyR', i3: 'KeyF' },
  },
  anterior: {
    name: 'Anterior (Q E F R · ítems 1 2 3)',
    binds: { ...BASE, q: 'KeyQ', e: 'KeyE', f: 'KeyF', r: 'KeyR', i1: 'Digit1', i2: 'Digit2', i3: 'Digit3' },
  },
};
export const DEFAULT_BINDS: Binds = PRESETS.recomendado.binds;

/** Teclas que no se pueden asignar: Esc es el menú y cancelar. */
export const RESERVED = new Set(['Escape']);

const LS = 'rubble.keys';
let binds: Binds = load();
let byCode = index(binds);
const listeners = new Set<() => void>();

function load(): Binds {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) ?? 'null');
    if (raw && typeof raw === 'object') {
      const b = { ...DEFAULT_BINDS };
      for (const a of ACTIONS) if (typeof raw[a.id] === 'string' && !RESERVED.has(raw[a.id])) b[a.id] = raw[a.id];
      return b;
    }
  } catch { /* sin localStorage (tests, modo privado) */ }
  return { ...DEFAULT_BINDS };
}

function index(b: Binds) {
  const m = new Map<string, ActionId>();
  for (const a of ACTIONS) m.set(b[a.id], a.id);
  return m;
}

function save() {
  byCode = index(binds);
  try { localStorage.setItem(LS, JSON.stringify(binds)); } catch { /* */ }
  for (const f of listeners) f();
}

/** Las dos teclas de Shift/Ctrl/Alt valen igual. */
function normalize(code: string) {
  return code.replace(/Right$/, 'Left');
}

export const getBinds = (): Readonly<Binds> => binds;
export const keyOf = (a: ActionId) => binds[a];

/** Acción asignada a una tecla, o null. */
export function actionOf(code: string): ActionId | null {
  return byCode.get(code) ?? byCode.get(normalize(code)) ?? null;
}

/**
 * Asigna una tecla a una acción. Si esa tecla ya la usaba otra acción, se intercambian
 * (así nunca quedan dos acciones en la misma tecla ni una acción sin tecla).
 */
export function setBind(action: ActionId, code: string): boolean {
  if (RESERVED.has(code)) return false;
  const other = actionOf(code);
  if (other && other !== action) binds = { ...binds, [other]: binds[action] };
  binds = { ...binds, [action]: code };
  save();
  return true;
}

export function applyPreset(id: string) {
  const p = PRESETS[id];
  if (!p) return;
  binds = { ...p.binds };
  save();
}

/** Nombre del preset que coincide con la configuración actual, o null si es personalizada. */
export function currentPreset(): string | null {
  for (const [id, p] of Object.entries(PRESETS)) if (ACTIONS.every((a) => p.binds[a.id] === binds[a.id])) return id;
  return null;
}

export function onBindsChange(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const NAMES: Record<string, string> = {
  Space: 'Espacio', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
  Tab: 'Tab', Enter: 'Enter', Backspace: '⌫', CapsLock: 'Bloq Mayús', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: 'Ñ', Quote: "'", Backslash: '\\', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

/** Cómo se muestra una tecla: 'KeyQ' → 'Q', 'Digit2' → '2', 'ShiftLeft' → 'Shift'. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return NAMES[code] ?? code;
}

/** Etiqueta de la tecla de una acción. */
export const keyName = (a: ActionId) => keyLabel(binds[a]);

/** Solo para tests: volver a lo de fábrica sin tocar el almacenamiento. */
export function _resetForTests() {
  binds = { ...DEFAULT_BINDS };
  byCode = index(binds);
}
