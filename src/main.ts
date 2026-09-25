import './ui/styles.css';
import { App } from './app';
import { ensureUniqueTabId } from './config';

ensureUniqueTabId();

// El clic derecho es del juego (empujón, cancelar): nunca abre el menú del navegador.
// Solo se deja en campos de texto (copiar y pegar el nombre o el chat).
window.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  e.preventDefault();
}, { capture: true });

const root = document.getElementById('app')!;
const app = new App(root);
app.start();
(window as any).__rubble = app;
