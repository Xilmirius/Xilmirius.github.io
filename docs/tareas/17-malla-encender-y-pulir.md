# 17 · La malla orgánica queda prendida

Última tarea de la malla: pasa a ser cómo se ve y se juega RUBBLE.

**Leer antes:** [docs/MALLA.md](../MALLA.md) y las Notas de ejecución de las tareas 10 a 16.

## Qué hacer

1. **Prenderla.** El terreno orgánico es el valor de entrada de los cuatro juegos. La sala gana una opción
   "Terreno: Orgánico / Cuadrado" (`LOBBY_OPTIONS` en `src/core/games.ts`) para poder comparar y para tener una
   salida si aparece un problema.
2. **Correr todo sobre la orgánica.** Las mismas mediciones sin pantalla de la tarea 14, y además todos los scripts
   de `tests/e2e/` con el terreno orgánico.
3. **Ajustar lo que se vea mal** en las capturas: cuántas vueltas de relajado, el tamaño del corte de las esquinas,
   el ancho mínimo de los pasos angostos de los mapas (donde el plano tenga un puente de una celda que quedó
   injugable, se le da una segunda celda).
4. **Juntas.** Sacar capturas de una pista de Carrera y de El Refugio con las juntas prendidas y apagadas, y
   preguntarle al usuario cuál quiere en cada juego. Es una decisión de gusto.
5. **Limpiar.** Borrar lo que quedó solo para la grilla y ya nadie usa.
6. **Documentar.**
   - `docs/MALLA.md`: de plan a "cómo está hecho", con los números reales.
   - `docs/TERRENO.md`: §1 y §2 describen el terreno por polígonos, y §6 ya no lista la grilla irregular como pendiente.
   - La leyenda de `src/core/maps/index.ts` suma las reglas para dibujar planos: una rampa no va embutida en una
     plataforma, y donde el ancho importa van dos celdas.
   - `docs/PLATAFORMA_Y_MODOS.md` §6 ("el terreno es una grilla de 2 m") y §7 (editor de mapas) quedan al día.
   - `README.md`: la estructura de carpetas y la sección de agregar un mapa.

## Listo cuando

- Una partida nueva de cualquiera de los cuatro juegos arranca con terreno orgánico, y dos partidas seguidas en el
  mismo mapa tienen el borde distinto (dos capturas).
- Las mediciones de la tarea 14 se repiten con el terreno prendido de entrada y siguen en banda.
- `tests/e2e/run.mjs`, `tests/e2e/moba.mjs`, `npm run test:touch`, `tests/e2e/showcase.mjs` y `tests/e2e/maps.mjs`
  pasan con terreno orgánico.
- Con dos pestañas, host y cliente ven el mismo borde (misma huella) en una copa de tres pistas, y el cliente corre
  junto a la costa sin que su predicción lo corrija más de 0,3 m.
- En un teléfono emulado (`npm run test:touch`) la partida no baja la calidad sola por falta de cuadros más de lo
  que la bajaba antes.
- El usuario eligió las juntas, y su elección está aplicada.
- Las Notas de ejecución dicen qué tiene que mirar el usuario al jugarlo: si la costa irregular se lee bien en
  movimiento, si los pasos angostos son justos y si alguna pista quedó más difícil de lo que era.
