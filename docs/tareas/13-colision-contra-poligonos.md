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
