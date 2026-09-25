// Mini helper de DOM (sin framework: el juego manda, la UI es una capa fina).
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, any>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let toastBox: HTMLElement | null = null;
export function toast(msg: string, kind: 'info' | 'error' | 'ok' = 'info', ms = 3200) {
  if (!toastBox) {
    toastBox = h('div', { class: 'toasts' });
    document.body.appendChild(toastBox);
  }
  const t = h('div', { class: 'toast ' + kind }, msg);
  toastBox.appendChild(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export function modal(title: string, body: Node, buttons: { label: string; kind?: string; onClick?: () => void }[] = [{ label: 'Cerrar' }], cls = ''): () => void {
  const close = () => { wrap.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  const wrap = h('div', { class: 'modal-wrap', onclick: (e: MouseEvent) => { if (e.target === wrap) close(); } },
    h('div', { class: 'modal ' + cls },
      h('h2', null, title),
      h('div', { class: 'modal-body' }, body),
      h('div', { class: 'modal-buttons' }, buttons.map((b) => h('button', { class: 'btn ' + (b.kind ?? ''), onclick: () => { b.onClick?.(); close(); } }, b.label))),
    ),
  );
  document.body.appendChild(wrap);
  document.addEventListener('keydown', esc);
  return close;
}

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
};

export const colorHex = (n: number) => '#' + n.toString(16).padStart(6, '0');
