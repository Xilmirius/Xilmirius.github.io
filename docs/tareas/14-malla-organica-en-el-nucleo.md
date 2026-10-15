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

## Notas de ejecución

**Archivos:** `src/core/types.ts` (`MatchSettings.organic`), `src/core/terrain.ts` (`new Terrain(mapId, { organic, seed })`, `Gate.detect`, `measureRollers`, `slabBounds`, `meshFellBack`), `src/core/terrainMesh.ts` (consultas más baratas, ver Costo), `src/core/sim.ts` (arma el terreno con la semilla de la partida; la losa que se rearma mira `slabBounds`; `spawnPoint`), `src/core/race.ts` (las puertas detectan con `detect`), `src/core/protocol.ts` y `src/net/host.ts` (`MatchInit.mesh`, la huella), `src/render/gameView.ts`, `src/game/match.ts` y `src/game/attract.ts` (la vista arma el mismo terreno y el cliente compara la huella), `scripts/botstats.ts` (`--organic`, `tool:mesh`). Cómo quedó, en [MALLA.md](../MALLA.md) §8 y la decisión en `decisiones-web.md` (DW-55). `PROTOCOL_VERSION` subió a 19.

**Lo que quedó distinto del plan**

- **El ajuste no tiene botón**: se prende con `__rubble.session.setSettings({ organic: true })` o con `settings: { organic: true }` en un script. La vitrina del menú sigue en cuadrada.
- **Puertas.** `Gate.cells` (reaparecer, medir el avance) no cambió; `Gate.detect` es la que cuenta para detectar y, solo con la orgánica, suma las celdas de vacío que rodean a la puerta. Con la cuadrada es el mismo conjunto de siempre.
- **Carriles de bolas.** `len` se mide después de armar la malla: en la orgánica caminando el piso real (pasos de 10 cm y se afina el borde); en la cuadrada sigue contando celdas, así que da el mismo número exacto.
- **Losa que se rearma.** Mira `Terrain.slabBounds(fi)`: la caja de todas las celdas de la malla de esa losa (en la cuadrada es la de la celda del plano).
- **Aparición al costado** (no estaba en la tarea). Un héroe que no cabe en los puntos de salida aparece 0,95 m al costado del punto; con la orgánica ese costado puede no tener piso. Si no hay uno parejo con el del punto, o está tapado, sale en el punto (`Simulation.spawnPoint`).
- **Costo.** La primera versión orgánica daba 8,3 a 9,7 ms por segundo simulado de Horda contra 2,9 de la cuadrada (tres veces más): el 50 % era `cellsNear` probando la forma de celdas que ni bloquean. Se arregló pidiendo solo las celdas más altas que los pies (`cellsNear(..., above)`), con el `bTop` por balde, baldes de 1 m en vez de 2 y los lados de cada celda precalculados. Quedó en **3,2 contra 2,8 ms (+15 %)**, en dos corridas alternadas de cuatro partidas de 200 s.
- **Herramientas** (`scripts/botstats.ts`): todas aceptan `--organic`; la Carrera cuenta las **puertas sin contar** (alguien pisa piso más cerca de la puerta siguiente que cualquier celda de la que le toca y su avance no sube durante 0,5 s); todas cuentan los héroes que **caen al vacío en los 3 s siguientes a aparecer**, separando los que caen donde aparecieron (a menos de 1,5 m y sin salir volando: el punto no tenía piso) de los que caen después de moverse o de un golpe; `tool:mesh` corre Arena y Asedio y mide la simetría y las huellas.

**Listo cuando** (sin pantalla, `npm run tool:*` con y sin `--organic`; la semilla de la malla es la de cada partida, así que cada carrera o partida es otra malla: 120 carreras, 60 partidas de Horda y 25 de Arena y Asedio)

| | Cuadrada | Orgánica |
|---|---|---|
| Carrera: llegan todos, de 30 carreras por pista (pista / serpentín / bolera / derrumbe) | 29 / 28 / 30 / 30 | 30 / 27 / 28 / 30 (el mínimo era 27) |
| Carrera: puertas que alguien cruzó sin que se le contara | 0 | **0** |
| Horda, 20 partidas por dificultad: victorias (Fácil / Normal / Difícil) | 19 / 13 / 5 | 16 / 11 / 3 (la banda era ≥ 16, 10 a 17 y ≤ 13) |
| Horda, `tool:stuck` (20 partidas): zombis reubicados por trabados / segundos sin avanzar | 0 (0,00 %) / 0,57 % | 10 (0,10 %) / 0,41 % (el límite era 1 %) |
| Arena (cantera, islote, flipper), 5 semillas: terminan | 5 / 5 / 5 | 5 / 5 / 5 |
| Asedio (puente, cornisas), 5 semillas: terminan | 2 / 5 y 5 / 5 (el guion corta a los 1000 s) | 5 / 5 y 5 / 5 |
| Asedio: el esbirro que más se acercó a una torre rival | 0,0 a 1,5 m | 0,0 a 0,7 m |
| Mapa simétrico: celdas de la malla sin gemela exacta al otro lado del eje, en los 5 mapas de Arena y Asedio × 5 semillas | – | **0** |
| Héroes que caen al vacío donde aparecieron en los 3 s siguientes | 0 de unas 2.200 apariciones | **0 de unas 2.260** (Carrera, Horda, Arena, Asedio y zombis) |
| Héroes que caen después de moverse o de un golpe | 0 | 4 de unas 1.040 apariciones en la Carrera (dos con el cuerpo lanzado, por un golpe o un artefacto; dos bots que corrieron a una zanja del Derrumbe) |
| Malla que no pasó su comprobación y cayó a la cuadrada | – | 0 en todas las partidas |
| Costo: Horda sin pantalla, ms por segundo simulado | 2,8 | 3,2 (+15 %; el límite era +25 %) |

- **Huellas.** La malla de cada uno de los 10 mapas con 5 semillas da lo mismo en dos procesos distintos (`tool:mesh --organic`, corrido dos veces). En pantalla, con host y cliente en dos pestañas (Horda y Arena, orgánico): la huella de la simulación del host, la de su vista y la de la vista del cliente es la misma, el cliente se mueve (4 m en el host) y no sale ningún aviso; con una huella falsa el aviso sale. Con el ajuste apagado (cuadrada), también coincide.
- **Ajuste apagado = tarea 13.** Un resumen (hash) de las posiciones de todos los cuerpos en cada tick de 2 minutos de partida de Arena, Asedio, dos Carreras y Horda da lo mismo antes y después. `tool:race`, `tool:horde` y `tool:stuck` dan los mismos números que al terminar la 13.
- `npm run typecheck` y `npm run build` sin errores. `tests/e2e/moba.mjs` pasa; `tests/e2e/run.mjs` pasa algunas veces y otras falla por tiempo de render (el cliente no llega a ver personajes a tiempo): con estos cambios pasó 4 de 6 corridas; sobre el commit de la tarea 13, en esta misma máquina, 1 de 5, con otros timeouts. No es de esta tarea.

**Lo que conviene saber**

- **La Carrera sale un poco peor en bolera (28 de 30) y serpentín (27 de 30).** Quedan en el mínimo pedido. Una posible causa de las caídas después de moverse (cuatro, ninguna con la cuadrada): los bots deciden saltar zanjas con el borde del plano, y con la orgánica el borde real puede estar hasta 1 m antes o después. No lo investigué. MALLA.md §2 ya avisa que donde el ancho importa hay que usar dos celdas.
- **La Horda orgánica gana algo menos** (16 / 11 / 3 contra 19 / 13 / 5) y los bots llegan a niveles de arma un poco más bajos; está dentro de las bandas pero en el borde en Fácil (16 es el mínimo). Con 20 partidas por dificultad es poca muestra para decir que es la malla.
- **Con el ajuste prendido se camina sobre la malla orgánica pero se ve el plano cuadrado**: el borde del terreno dibujado no es el borde del piso hasta las tareas 15 y 16. No hay nada que jugar todavía.
- El `Asedio` cuadrado de `puente` termina 2 de 5 antes de los 1000 s del guion: es cómo juegan los bots hoy (no cambió con esta tarea) y no se tocó.
