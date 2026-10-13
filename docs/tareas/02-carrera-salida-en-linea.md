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

## Notas de ejecución

Tal como lo planteaba la tarea, sin desvíos de diseño. En las cuatro pistas las `*` pasaron de dos columnas de
tres a una sola columna de cinco celdas (las mismas cinco filas de piso que ya existían alrededor de la columna
vieja, así que no hizo falta agrandar la zona de salida). El primer intento de editar los mapas corrió un
carácter la columna de la puerta `2?`/`F` en algunas filas (una sustitución mal hecha metió un `.` de más); se
detectó comparándolo contra una fila sin tocar y se corrigió con un script descartable que recalculaba las cadenas
carácter por carácter antes de aplicarlas — vale la pena anotarlo porque es fácil pisar la alineación de columnas
al editar estos mapas ASCII a mano.

`RaceMode.init` gana `placeOnStartLine(sim)`: si los puntos de `terrain.spawns.ffa` están todos en una fila o una
columna (chequeo por igualdad de `x` o de `z`), reposiciona a los corredores equidistantes entre el centro del
primero y el del último (ya no en centros de celda), sortea el orden con `sim.rng.int` (Fisher-Yates) y los hace
mirar hacia `terrain.gates[0]` (que ya trae su centro promediado, no hizo falta calcularlo de nuevo) con
`Math.atan2`, siguiendo la convención de `facing` que ya usaba el resto de `sim.ts`. Si las `*` no están alineadas,
la función no hace nada y queda el reparto por celda de `Simulation.spawnPoint` de siempre. No hizo falta tocar
`Simulation` ni `game/attract.ts`: la vitrina arma su `Simulation` igual que cualquier partida, así que pasa por el
mismo camino.

**Medido con un script descartable** (`npx tsx` contra `src/core`, con `new Simulation(...)` y sin pantalla), en
las cuatro pistas y de 1 a 6 corredores:
- todos quedan sobre piso firme (`cw.groundAt` no da `-Infinity` y `pos.y` coincide);
- con 6 corredores la separación da siempre 1,60 m (8 m de línea ÷ 5 huecos), por encima del mínimo de 1,2 m;
- la distancia por la pista hasta la primera puerta difiere como mucho 0,42 celda entre el que sale más cerca y
  el que sale más lejos (menos de la media celda pedida; en Serpentín y Derrumbe da 0 porque sus primeras puertas
  caen justo enfrente de la columna entera);
- dos semillas distintas (1 y 2) dan órdenes de salida distintos en las cuatro pistas.

**Capturas.** Con un script descartable que arranca una práctica de Carrera con 5 bots (6 corredores) en cada
pista y congela la cámara sobre la línea de salida, se vio a los seis en una sola fila, parejos y mirando hacia la
pista, en las cuatro pistas. `tests/e2e/maps.mjs pista,serpentin,bolera,derrumbe` (capturas generales del mapa)
también pasa sin errores. Ninguna captura se commitea (van a `tests/e2e/out*`, ignorado por git).

`npm run typecheck`, `npm run build` y `tests/e2e/run.mjs` sin errores.

Pendiente de que el usuario lo juegue: no se probó con corredores humanos reales (solo bots y verificación
numérica), así que falta confirmar que la fila de salida se sienta bien al apretar para arrancar los seis a la
vez.
