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

## Notas de ejecución

**Archivos:** `src/core/terrain.ts` (`Terrain.mesh`, y las preguntas físicas: `groundAt`, `groundCellAt`, `blockAt`, `isPad`, `fragileIndexAt`), `src/core/terrainMesh.ts` (grilla de acceso directo en la cuadrada, cajas y altura por celda, `wedgeTop`), `src/core/collision.ts` (ya no calcula índices de grilla: pregunta al terreno), `src/core/math.ts` (`circleOverlapsBox` se mudó acá para que `terrain.ts` no importe `collision.ts`; `collision.ts` lo sigue exportando), `src/core/sim.ts` (la caída de una losa suelta a quien estaba encima según la losa, no según la celda).

**Cómo quedó**

- `Terrain` arma `mesh = buildSquareMesh(this)` al construirse. El plano (`cells`, `cellIndexAt`, `cellCenter`, `isWalkable`, `topAt(i, x, z)`, `isSolidCell`, `cellBounds`) no cambió: son preguntas lógicas, y el dibujo y los bots siguen usándolas.
- `groundAt(x, z)`: primero las piezas de las rampas (la cuña sube lineal, recortada a sus extremos, igual que antes), después la celda de la malla. `blockAt` junta las celdas de la malla que toca el círculo y las cuñas, y devuelve lo primero que no se puede subir, en el orden de filas de antes. En la orgánica el descanso también cuenta (todavía no se usa: la cuadrada ya lo tiene como celda de plataforma, y si lo contara taparía una losa caída).
- En la cuadrada, `cellAt` y `cellsNear` no buscan: indexan una grilla (la celda de la malla de cada celda del plano). En la orgánica buscan por baldes.
- **Bordes.** Un punto justo sobre el borde entre dos celdas es de una sola, la de arriba y la de la izquierda no (como en la grilla). Con el borde de la cuña contado en las dos, un zombi que caminaba por la esquina de una rampa veía otro camino y la Horda se separaba del código viejo a los 130 s; con el borde de un solo lado, las partidas dan lo mismo número por número.

**Listo cuando** (comparando contra el commit anterior en un worktree, importado desde el mismo script descartable; 20.000 puntos por mapa y por pregunta, la mitad pegados a bordes de a 0,5 m, con losas caídas o flojas al azar y 25 obstáculos al azar)

| | |
|---|---|
| Altura del piso (también con `cw.groundAt` y tope), en los diez mapas | igual (difieren menos de 1e-6 en 0 puntos) |
| Choca o no choca, con su caja, su altura y su celda | igual en los 20.000 de cada mapa (de 300 a 3.000 choques por mapa) |
| "Hay algo sólido" en puntos 3D, con su celda y su obstáculo | igual |
| Resorte y losa frágil en cada punto | igual |
| Puntos que cayeron sobre rampas (cantera, islote, flipper, refugio, pista) | 85 a 430 por mapa, todos iguales |
| Una partida por juego, cuerpo por cuerpo, a cada tick | idéntica: Horda 300 s, Asedio (`cornisas`) 300 s |
| `tool:bots` (Arena), `tool:race` (las cuatro pistas) y `tool:horde` (6 partidas por dificultad) | números idénticos a los de antes |
| `tool:stuck` | 11.211 zombis, 18 reubicados (0,16 %), 250 s sin avanzar (0,21 %): los mismos que antes de la tarea |
| Horda sin pantalla | 2,99 a 3,03 ms por segundo simulado contra 2,68 a 2,75 de antes: **+11 a 12 %** (límite 15 %). Lo que más pesa: `cellsNear` y `blockAt` |
| `tests/e2e/run.mjs`, `moba.mjs`, `maps.mjs` | pasan |
| `npm run test:touch` | falla a veces en "soltar la palanca → se frena", como antes de esta tarea (ver nota de la tarea 07) |
| Fuera de `terrain.ts` y `terrainMesh.ts`, nadie usa `CELL` para una pregunta física | `collision.ts` y `movement.ts` ya no lo importan; `nav.ts` lo usa para buscar celdas del plano (es lógica) |

**Queda para la tarea 13:** `blockAt` todavía devuelve una caja y `moveAxis` prueba un eje por vez. La orgánica ya está lista para recibirlo (las celdas traen su caja y sus vecinas).
