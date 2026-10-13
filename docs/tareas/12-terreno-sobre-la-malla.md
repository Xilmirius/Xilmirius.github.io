# 12 · El terreno consulta la malla, y las rampas pasan a ser piezas

Primera tarea de la malla que toca el juego. El juego sigue en modo **cuadrado** y se tiene que comportar igual
que antes: lo que cambia es por dónde pasan las preguntas.

**Leer antes:** [docs/MALLA.md](../MALLA.md) §1, §4 y §5.

## Qué pasa hoy

`Terrain` (`src/core/terrain.ts`) es a la vez el plano y la física: `groundAt`, `topAt` y `isSolidCell` hacen
cuentas de grilla, y `CollisionWorld` (`src/core/collision.ts`) arma cajas con `cellBounds`. Las rampas son celdas
con la cara inclinada (`CellType.Ramp`).

## Qué hacer

1. **`Terrain` tiene una malla** (la cuadrada de la tarea 11) y la arma al construirse.
2. **Las preguntas físicas pasan por la malla**, como dice la tabla de MALLA.md §5: si hay piso en un punto y a qué
   altura, contra qué choca un cuerpo, qué frena una bala, qué losa frágil se pisa, si se pisa un resorte.
   El estado de las losas sigue donde está (un valor por celda frágil del plano); una celda de la malla es sólida
   si su losa lo es.
3. **Las preguntas lógicas siguen en el plano:** `cellIndexAt`, `cellCenter`, `cells`, `w`, `h`, `isWalkable` y
   todo lo que recorre la grilla (bots, Horda, Carrera, decoración) no cambian.
4. **Las rampas son piezas.** La celda de rampa del plano conserva su tipo y su dirección (los bots y la
   decoración los leen), pero en la malla es piso llano del nivel de abajo, con la pieza encima: cuña y descanso
   (MALLA.md §4, "Rampas"). El terreno suma las piezas a sus respuestas: la altura del piso sobre una rampa es la
   de la cuña, y un cuerpo choca contra el costado de la cuña cuando no la puede subir. La altura sobre la cuña es
   la misma cuenta de hoy (lineal a lo largo de la dirección, recortada a los extremos).
5. **`CollisionWorld`** deja de calcular índices de grilla: pide a la malla las celdas que puede tocar el círculo.
   El movimiento sigue probando un eje por vez (eso cambia en la tarea 13), así que el contacto todavía informa
   una caja.

Tres lugares que hoy mezclan física con índices del plano y hay que pasar a la malla: el piso flojo de la Carrera
y la caída de quien está parado sobre una losa que se va (`Simulation.updateTiles`), y el resorte en `stepMove`.

El dibujo no cambia en esta tarea: `terrainView.ts` sigue dibujando la rampa como una cuña y el resto desde el
plano.

## Listo cuando

Comparando contra el código de antes de la tarea (un worktree del commit anterior, importado desde el mismo script
descartable), en los diez mapas:

- la altura del piso coincide en 20.000 puntos al azar por mapa (diferencia menor que una millonésima), incluidos
  puntos sobre rampas, plataformas, muros y losas caídas;
- "choca o no choca" coincide para 20.000 combinaciones al azar de punto y altura de pies por mapa;
- "hay algo sólido" coincide para 20.000 puntos 3D al azar por mapa.

Además:

- Sin pantalla, una partida de bots por juego termina, y sus números (duración, ring-outs, llegadas a la meta,
  misiones) quedan dentro de lo habitual. Anotarlos.
- `tests/e2e/run.mjs`, `tests/e2e/moba.mjs` y `npm run test:touch` pasan.
- Una partida de Horda sin pantalla tarda como mucho un 15 % más que antes (medir las dos).
- Ningún archivo fuera de `terrain.ts` y del módulo de la malla hace cuentas con `CELL` para responder una
  pregunta física.
