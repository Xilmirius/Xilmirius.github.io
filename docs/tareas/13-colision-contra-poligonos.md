# 13 · El movimiento choca contra polígonos y desliza

**Leer antes:** [docs/MALLA.md](../MALLA.md) §6.

## Qué pasa hoy

`stepMove` (`src/core/movement.ts`) mueve primero en X y después en Z (`moveAxis`). Si el eje choca, anula la
velocidad en ese eje (o la invierte, si el cuerpo viene lanzado) y avisa un golpe con normal `±X` o `±Z`. Sirve
porque todo lo que bloquea es una caja alineada. Contra una pared en diagonal el cuerpo avanza a los tirones.

## Qué hacer

**Mover y deslizar**, como describe MALLA.md §6. Es el mismo código para el host y para la predicción del cliente.

- `CollisionWorld` responde, para un círculo y una altura de pies, **los contactos**: por cada cosa que bloquea,
  la normal, la profundidad, la altura de su cara de arriba y qué es (celda, rampa u obstáculo). De una celda solo
  cuentan los lados expuestos.
- En cada subpaso se avanza entero y se resuelven los contactos, del más profundo al menos, hasta tres vueltas.
- A la velocidad se le quita lo que va contra la normal. Un cuerpo lanzado rebota contra la normal con su
  restitución.
- Cada contacto en el que el cuerpo venía contra la superficie produce un golpe (`WallHit`) con la normal real y
  la velocidad contra ella.
- **Trepar un borde** (hoy dentro de `moveAxis`): mismas condiciones, con "empujando contra la normal" en lugar de
  "empujando en el eje".
- **Salir de adentro de un obstáculo** (`depenetrate`): por la normal del contacto.

Lo que usa las normales en `src/core/sim.ts` y hoy mira si es `X` o `Z`:

- `Simulation.onWallHit`: el rebote de Gloop refleja su dirección contra la normal; el cuerpo que atraviesa una
  cobertura rota sigue de largo contra la normal.
- El dash que rompe cobertura y el golpe contra la pared no cambian de regla, solo reciben la normal nueva.

`Simulation.predictLethal` y la predicción del cliente (`MatchRunner.reconcile`) usan `stepMove` tal cual: no
necesitan cambios, pero son los primeros en mostrar una diferencia.

## Listo cuando

Con un script descartable, comparando contra el código de antes (worktree del commit anterior) en modo cuadrado:

- caminar de frente contra un muro: frena a la misma distancia (±2 cm);
- caminar en diagonal contra un muro: desliza a la misma velocidad (±3 %);
- un cuerpo lanzado contra un muro: mismo evento de golpe, misma velocidad de rebote (±5 %);
- trepar el borde de una plataforma cayendo contra él: trepa en los mismos casos;
- el rodar de Gloop rebota en el mismo ángulo contra un muro recto;
- contra la esquina de una cobertura, caminando a 45°: antes frenaba, ahora la rodea (la mejora buscada).

Y con una malla de prueba armada en el script, con un muro a 30° de los ejes:

- caminando contra él a 6 m/s, el cuerpo avanza a lo largo del muro a la velocidad que corresponde a su ángulo
  (±5 %), sin retroceder en ningún tick;
- un cuerpo lanzado rebota con el ángulo espejado respecto de la normal (±5°).

Además:

- en pantalla, con dos pestañas, el cliente corre pegado a los muros de El Refugio durante 20 s y la corrección
  de su predicción nunca pasa de 0,3 m (se lee del `MatchRunner` desde la consola);
- una partida de bots sin pantalla por juego termina con números habituales; `tests/e2e/run.mjs` y
  `tests/e2e/moba.mjs` pasan;
- `docs/decisiones-web.md` anota el cambio de modelo de colisión, que es una decisión de diseño.

## Notas de ejecución

**Archivos:** `src/core/contact.ts` (nuevo: `ContactSink`, `rectContact`, los tres `CONTACT_*`), `src/core/terrain.ts` (`Terrain.contacts` y `cellContacts`), `src/core/collision.ts` (`Contact`, `CollisionWorld.contacts`), `src/core/movement.ts` (`moveAxis` desapareció; `slide` lo reemplaza), `src/core/sim.ts` (`onWallHit` con la normal). Cómo quedó, en [MALLA.md](../MALLA.md) §6; la decisión, en `decisiones-web.md` (DW-54). No cambia nada que viaje por la red: `PROTOCOL_VERSION` sigue igual.

**Lo que quedó distinto del plan**

- **`blockAt` se queda.** Sigue siendo la pregunta de sí o no (bots, salidas, `nudge`, el destino de trepar); `contacts` es la pregunta con normal. Bloquean lo mismo.
- **`depenetrate` no cambió.** Los obstáculos siguen siendo cajas, así que sus cuatro salidas ya son las normales de la caja, y además elige la que tiene piso firme. Con el movimiento por contactos ya no hace falta la regla de "si ya está encimado, se permite el paso que lo aleja" de la tarea 07: el cuerpo encimado sale por la normal.
- **Cada vuelta resuelve un solo contacto**, el más profundo, y vuelve a preguntar (hasta tres veces). Es más simple que repartir una lista ordenada con posiciones que ya cambiaron, y en la práctica da lo mismo: una esquina de dos paredes necesita dos vueltas.
- **El 1 mm de piel** (`SKIN`) deja al cuerpo apenas separado de la pared, para que `blockAt` (que cuenta el borde como libre) no lo vea encimado. Por eso frena a 1 mm y no a 8 mm como antes (el viejo se quedaba a una fracción de paso).
- **Un hueco más angosto que el cuerpo** no se cruza: si después de las tres vueltas sigue metido más de 2 cm, el subpaso se deshace (`FIT_TOL`). Sin esto, dos paredes que dejan 0,8 m dejarían pasar a un cuerpo de 1 m empujando de lado.
- **Contactos de vértice.** De cada lado expuesto sale un contacto de frente si el centro cae en su tramo; si cae antes de su principio, el contacto es contra el vértice, y cada vértice lo da solo el lado que sale de él (así no se cuenta dos veces). Un lado interno (la vecina también bloquea) no cuenta, ni sus vértices.

**Listo cuando** (scripts descartables, contra el código del commit anterior en un worktree; mapas reales, modo cuadrado)

| | Antes | Ahora |
|---|---|---|
| De frente contra un muro (3 mapas), a 6 m/s | queda a 0,0083 m del muro | a 0,001 m (±2 cm: pasa) |
| Diagonal a 45° contra un muro: velocidad a lo largo | 4,2426 m/s | 4,2426 m/s |
| Lanzado a 15 m/s contra un muro: tick, normal, velocidad del golpe, velocidad de salida | tick 8, (-1, 0), 12,911, -3,873 | idéntico |
| Trepar el borde de una plataforma cayendo contra él | trepa en el tick 4, a (5,537; 1,5) | idéntico |
| Rodar de Gloop a 0°, 25° y -40° contra un muro | rebota en t = 12, 13 y 16 con la dirección espejada | los mismos ticks y las mismas direcciones |
| Esquina de un muro o de una cobertura, a 45° con 0,1 m de desvío | frena en la esquina | la rodea y sigue (a los 200 ticks está a 10,8 m de la esquina en x y 8,0 en z) |
| Esquina a 45° justo por la diagonal (sin desvío) | frena | frena (es un equilibrio inestable: no hay hacia dónde rodear) |
| Muro a 30° (malla armada a mano), caminando de frente a 6 m/s | – | 5,196 m/s a lo largo del muro, que es 6·cos 30° (±0,00 %); 0 ticks con retroceso |
| El mismo muro a -30°, 60° y 10° | – | 5,196, 3,000 y 5,912 m/s, igual a lo que corresponde (±0,05 %); 0 retrocesos |
| Cuerpo lanzado (restitución 1) contra ese muro | – | sale a 60,00°, 120,00°, -60,00° y 20,00°: el espejo exacto; la normal del golpe coincide con la del muro |

**Partidas de bots sin pantalla** (`npm run tool:*`, mismas semillas en las dos versiones; las partidas se separan a los pocos milisegundos de diferencia, así que se comparan los números y no las partidas)

| | Antes | Ahora |
|---|---|---|
| Horda, 20 partidas por dificultad (Fácil / Normal / Difícil) | 19 / 13 / 8 victorias | 19 / 13 / 5 |
| Horda: precisión de las balas | 62,7 / 62,6 / 65,1 % | 64,1 / 66,7 / 65,3 % |
| `tool:stuck` (20 partidas): reubicados, segundos-zombi sin avanzar, caídos solos | 18 (0,16 %), 250 (0,21 %), 321 (2,86 %) | 0 (0,00 %), 629 (0,57 %), 329 (3,23 %) |
| `tool:race` (cuatro pistas, tres niveles, 10 carreras): llegaron todos | 8 a 10 de 10 | 9 a 10 de 10 |
| `tool:bots` (Arena, tres niveles) | golpes contra pared 40 / 59 / 36 | 41 / 39 / 42 |

El Difícil de la Horda (5 de 20) está dentro del ruido de 20 partidas (otras tandas dieron entre 3 y 11). Los segundos sin avanzar subieron (de 0,21 % a 0,57 %) pero siguen lejos del 3 % de la tarea 07, y los reubicados por trabados bajaron a cero. No investigué de dónde sale la diferencia; lo más probable es que sean zombis que ahora se deslizan junto a una pared en vez de quedar parados contra ella.

**Costo.** Horda sin pantalla (6 partidas de 200 s, `sim.step` solamente): 3,00 y 2,98 ms por segundo simulado antes; 2,81 y 2,89 ahora (en el ruido: no hay costo extra).

**Predicción del cliente.**

- *Sin red* (reproduciendo lo que hace `MatchRunner.reconcile`: estado del host redondeado a 2 decimales, seis ticks antes, más los inputs pendientes, a lo largo de 90 s pegado a los muros de El Refugio): error medio 0,0061 m antes y 0,0036 m ahora; muestras con más de 1 cm, 205 antes y 42 ahora; los máximos (0,92 m antes y 0,39 m ahora) son casos sueltos junto al borde del fuerte con el cuerpo en el aire; no investigué cada uno.
- *En pantalla con dos pestañas* (Edge, host + cliente en El Refugio, cinco tramos pegado a los muros de 6 s cada uno): **no se cumple** lo de "nunca pasa de 0,3 m", **ni con el código de antes**. Con el build de antes, los tramos dieron máximos de 0,05 / 0,01 / 0,65 / 0,25 / 1,03 m y snapshots por encima de 0,3 m: 0 / 0 / 4 / 0 / 15; con el de ahora, 0,06 / 0,72 / 1,02 / 0,80 / 1,43 m y 0 / 1 / 6 / 3 / 11. Son corridas de una sola vez, en un entorno lento (render por software, el cliente llega a tener 23 inputs pendientes) y el error aparece con inputs pendientes, o sea con cambios de dirección y retraso; con el mismo ruido en las dos versiones no puedo atribuirle diferencia a este cambio ni a su ausencia. Pendiente de que lo juegues con dos personas de verdad.

**Otras comprobaciones:** `npm run typecheck` y `npm run build` sin errores; `tests/e2e/run.mjs` (con revancha y reconexión) y `tests/e2e/moba.mjs` pasan. `npm run test:touch` no se corrió en esta tarea (falla a veces sin relación, ver las notas de las tareas 07 y 12).

**Pendiente de que lo juegues:**

- Si rozar paredes y esquinas se siente mejor. Lo que cambió a propósito es que una esquina (de una pared o de una cobertura) se rodea en vez de frenar; a 45° justo contra el vértice sigue frenando.
- Todo se probó en el plano cuadrado de hoy y con una malla de prueba a mano: la malla orgánica de verdad (con sus polígonos irregulares) entra recién en la tarea 14.
- Un zombi o un héroe pegado a una pared ahora se desliza con la velocidad que le toca por el ángulo; los bots y los zombis lo llevan sin cambios, pero conviene ver si algún camino del campo de la Horda queda raro.
