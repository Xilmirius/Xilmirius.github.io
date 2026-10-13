# 14 · La simulación corre sobre la malla orgánica

Hasta acá el juego usa la malla cuadrada. Esta tarea deja a la simulación lista para la orgánica, comprobada **sin
pantalla**: el dibujo todavía muestra el plano cuadrado (tareas 15 y 16), así que el ajuste queda apagado y sin
botón en la sala.

**Leer antes:** [docs/MALLA.md](../MALLA.md) entero.

## Qué hacer

**Elegir la malla y sembrarla.**

- Un ajuste nuevo de la partida (`MatchSettings`) dice si el terreno es orgánico. Apagado por defecto.
- La semilla sale de la de la partida (`SimConfig.seed` / `MatchInit.seed`). Tienen que armar el mismo terreno la
  simulación del host, la vista del host y la vista de cada cliente (`GameView`), porque el cliente predice contra
  la suya. También la vitrina del menú (`game/attract.ts`).
- Los mapas de Arena y de Asedio piden la malla espejada.
- Si la orgánica no pasa su comprobación en cinco semillas, esa partida usa la cuadrada, con un aviso en la consola.
- `MatchInit` lleva la huella de la malla del host. El cliente la compara con la suya al armarla y, si difieren,
  avisa en pantalla.

**Lo que suponía que el piso termina donde termina la celda del plano.** Con la orgánica el piso puede asomar
hasta 1 m más allá de la celda o quedarse 1 m corto. Revisar, como mínimo:

- **Puertas de la Carrera** (`Gate` en `terrain.ts`, `RaceMode.tick`). Para detectar el paso, la puerta suma las
  celdas de vacío del plano pegadas a ella. Son dos listas distintas: las celdas reales de la puerta siguen
  sirviendo para reaparecer (`RaceMode.respawnAt`) y para medir el avance (`distanceField`); la ampliada, solo
  para detectar.
- **Carriles de las bolas** (`GadgetSpawn.len`): el largo se mide caminando el piso real desde el lanzabolas, no
  contando celdas del plano.
- **Losa que se rearma** (`Simulation.updateTiles`): "hay alguien parado encima" mira la losa real.
- **Reaparecer y aparecer:** siempre en centros de celda del plano (ya es así; comprobarlo).
- **Bots:** caminan de centro a centro, que está garantizado. Donde un bot corta camino en línea recta hacia un
  objetivo (`BotBrain.navigate`), ya comprueba que haya piso adelante; verificar que alcanza.

Cualquier otro lugar que aparezca al correr las partidas de prueba se arregla acá y se anota.

## Listo cuando

Sin pantalla, con el terreno orgánico y **cinco semillas por mapa**:

- **Carrera** (cuatro pistas, seis bots): llegan todos en al menos 9 de cada 10 carreras; nadie cruza una puerta
  sin que se le cuente (se detecta porque su avance se queda atrás mientras su posición sigue).
- **Horda** (El Refugio, tres bots): la banda de victorias de la tarea 04, y los zombis reubicados por trabados
  siguen por debajo del 1 % (la medición de la tarea 07).
- **Arena** (tres mapas) y **Asedio** (dos): las partidas terminan; los esbirros llegan a las torres rivales; el
  mapa es simétrico (la huella de la mitad izquierda espejada coincide con la derecha).
- En ninguna partida un héroe cae al vacío en los tres segundos siguientes a aparecer o reaparecer.
- Host y cliente arman la misma huella (se arma el terreno dos veces con la misma semilla en procesos distintos).
- Con el ajuste apagado, todo se comporta como al terminar la tarea 13.
- Una partida de Horda orgánica sin pantalla tarda como mucho un 25 % más que una cuadrada.
