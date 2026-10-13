// Tooltips: un solo sistema para todo (habilidades, ítems, materiales, niveles, héroes, logros...).
// Uso: tip(el, '<b>Título</b>...') o tip(el, () => html) si el contenido cambia (se arma al mostrarse).
// El contenido es HTML armado por el juego: escapar con esc() cualquier texto que venga de jugadores.
// Con los dedos no hay "pasar por arriba": el tooltip sale manteniendo apretado (y ese toque no cuenta como clic).

type Content = string | (() => string);

const registry = new WeakMap<Element, Content>();
let box: HTMLDivElement | null = null;
let current: Element | null = null;
let showT = 0;
let lastX = 0, lastY = 0;
const DELAY = 120;
/** Táctil: cuánto hay que mantener apretado (ms) y cuánto se puede mover el dedo sin que cuente como arrastrar (px). */
const HOLD = 420, SLOP = 12;
/** Después de un toque el navegador inventa eventos de mouse: durante este rato (ms) no se les hace caso. */
const GHOST = 900;
let touchAt = -1e9, holdT = 0, held = false, sx = 0, sy = 0;

function ensure() {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'tooltip';
  document.body.appendChild(box);
  document.addEventListener('mouseover', onOver);
  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('mousedown', hide, true);
  window.addEventListener('blur', hide);
  document.addEventListener('pointerdown', onTouchDown, true);
  document.addEventListener('pointermove', onTouchMove, true);
  document.addEventListener('pointerup', onTouchEnd, true);
  document.addEventListener('pointercancel', onTouchEnd, true);
  document.addEventListener('click', onClick, true);
  return box;
}

/** Asocia un tooltip a un elemento. Devuelve el mismo elemento (para encadenar con h()). */
export function tip<T extends Element>(el: T, content: Content): T {
  ensure();
  registry.set(el, content);
  el.classList.add('has-tip');
  return el;
}

/** Saca el tooltip de un elemento. */
export function untip(el: Element) {
  registry.delete(el);
  el.classList.remove('has-tip');
  if (current === el) hide();
}

function find(t: EventTarget | null): Element | null {
  let el = t as Element | null;
  while (el && el !== document.body) {
    if (registry.has(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function onTouchDown(e: PointerEvent) {
  if (e.pointerType !== 'touch') return;
  touchAt = performance.now();
  clearTimeout(holdT);
  hide();
  held = false;
  const el = find(e.target);
  // Los botones de los controles táctiles son para jugar, no para leer.
  if (!el || el.closest('.tbtn')) return;
  sx = e.clientX; sy = e.clientY;
  holdT = window.setTimeout(() => {
    lastX = sx; lastY = sy - 26;
    current = el;
    show(el);
    held = !!box?.classList.contains('on');
  }, HOLD);
}

function onTouchMove(e: PointerEvent) {
  if (e.pointerType !== 'touch' || Math.hypot(e.clientX - sx, e.clientY - sy) < SLOP) return;
  clearTimeout(holdT);
  if (held) hide();
}

function onTouchEnd(e: PointerEvent) {
  if (e.pointerType !== 'touch') return;
  touchAt = performance.now();
  clearTimeout(holdT);
  if (held) hide();
}

/** El toque que mostró un tooltip era para leer: no cuenta como clic en el botón. */
function onClick(e: MouseEvent) {
  if (!held) return;
  held = false;
  e.stopPropagation();
  e.preventDefault();
}

function onOver(e: MouseEvent) {
  if (performance.now() - touchAt < GHOST) return;
  const el = find(e.target);
  if (el === current) return;
  current = el;
  clearTimeout(showT);
  if (!el) { hide(); return; }
  lastX = e.clientX; lastY = e.clientY;
  showT = window.setTimeout(() => show(el), DELAY);
}

let lastHtml = '';
let refreshT = 0;

function show(el: Element) {
  if (current !== el || !el.isConnected) return;
  const html = render(el);
  if (!html) { hide(); return; }
  const b = ensure();
  if (html !== lastHtml) { b.innerHTML = html; lastHtml = html; }
  b.classList.add('on');
  place();
  // Contenido vivo (enfriamientos, carga de ulti): se refresca mientras está abierto.
  clearInterval(refreshT);
  if (typeof registry.get(el) === 'function') refreshT = window.setInterval(() => {
    if (current !== el || !el.isConnected) { hide(); return; }
    const h = render(el);
    if (h && h !== lastHtml) { b.innerHTML = h; lastHtml = h; place(); }
  }, 250);
}

function render(el: Element) {
  const c = registry.get(el);
  return typeof c === 'function' ? c() : c ?? '';
}

function onMove(e: MouseEvent) {
  if (performance.now() - touchAt < GHOST) return;
  lastX = e.clientX; lastY = e.clientY;
  if (box?.classList.contains('on')) {
    if (current && !current.isConnected) { hide(); return; }
    if (current) {
      const h = render(current);
      if (h !== lastHtml) { box.innerHTML = h; lastHtml = h; }
    }
    place();
  }
}

function place() {
  const b = box!;
  const pad = 14;
  const w = b.offsetWidth, h = b.offsetHeight;
  let x = lastX + pad, y = lastY - h - pad;
  if (y < 8) y = lastY + pad + 6;
  if (x + w > window.innerWidth - 8) x = lastX - w - pad;
  b.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, Math.min(window.innerHeight - h - 8, y))}px)`;
}

function hide() {
  clearTimeout(showT);
  clearInterval(refreshT);
  box?.classList.remove('on');
  current = null;
}

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
