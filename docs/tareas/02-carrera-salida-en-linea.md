# 02 · Carrera: salida en una sola línea

## Qué pasa hoy

Las cuatro pistas marcan las salidas (`*`) en dos columnas de tres. `Simulation.spawnPoint` reparte los puntos de
`terrain.spawns.ffa` en orden de lectura, así que la mitad de los corredores arranca una columna (4 m) más
adelante que la otra mitad.

## Qué hacer

Todos salen sobre una misma línea, a la misma distancia de la primera puerta, repartidos parejo a lo ancho.

- En el plano de cada pista (`src/core/maps/index.ts`: `pista`, `serpentin`, `bolera`, `derrumbe`) las `*` pasan a
  ser **una sola columna** que cubre todo el ancho de la zona de salida (cinco celdas en las cuatro).
- La línea de salida es el segmento que va del centro de la primera `*` al centro de la última. Los corredores se
  reparten equidistantes sobre ese segmento: con uno solo, al medio; con seis, a 1,6 m uno de otro. Sus posiciones
  ya no son centros de celda.
- El orden sobre la línea se sortea en cada carrera con el `rng` de la simulación, para que nadie tenga siempre el
  mismo carril. Todos arrancan mirando hacia la primera puerta.
- El lugar natural es `RaceMode.init`, que ya recorre a los corredores: `Simulation` arma los personajes antes de
  llamar a `mode.init`, así que el modo los puede reubicar (posición, posición anterior y hacia dónde miran).
- Un mapa de Carrera con las `*` desparramadas (no alineadas en una fila o una columna) tiene que seguir andando:
  ahí se usa el reparto de hoy.

Las partidas de la vitrina del menú (`game/attract.ts`) usan el mismo camino y tienen que verse bien.

## Listo cuando

Con un script descartable, en las cuatro pistas y con 1 a 6 corredores:

- todos quedan sobre piso firme, separados por al menos 1,2 m;
- la distancia por la pista hasta la primera puerta (el mismo campo que usa `RaceMode.progress`) difiere menos de
  media celda entre el que más cerca y el que más lejos sale;
- dos carreras con semillas distintas reparten los carriles distinto.

Además: una captura de la salida de cada pista con seis corredores (`tests/e2e/maps.mjs` muestra cómo sacarlas), y
`docs/CARRERA.md` §2 dice cómo se marca la salida.
