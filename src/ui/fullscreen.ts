// Pantalla completa. Al entrar se "traba" Esc (Chrome/Edge): así Esc sigue siendo del juego (menú,
// cancelar) y para salir de pantalla completa se mantiene apretado. En otros navegadores Esc sale directo.

type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };

export const fullscreenSupported = () => !!document.documentElement.requestFullscreen;
export const isFullscreen = () => !!document.fullscreenElement;

export async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    const kb = (navigator as unknown as { keyboard?: KeyboardLock }).keyboard;
    await kb?.lock?.(['Escape']).catch(() => {});
  } catch (e) {
    console.warn('[fullscreen]', e);
  }
}

/** Botón ⛶ que refleja el estado (entrar / salir). */
export function fullscreenButton(cls = 'btn ghost'): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls + ' fs-btn';
  const sync = () => {
    b.textContent = isFullscreen() ? '🗗 Salir de pantalla completa' : '⛶ Pantalla completa';
    b.title = isFullscreen() ? 'Mantené Esc o hacé clic para salir' : 'Pantalla completa';
  };
  b.onclick = (e) => { e.stopPropagation(); void toggleFullscreen(); };
  document.addEventListener('fullscreenchange', sync);
  sync();
  if (!fullscreenSupported()) b.style.display = 'none';
  return b;
}
