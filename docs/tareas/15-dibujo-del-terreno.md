# 15 · El terreno se dibuja desde los polígonos de la malla

**Leer antes:** [docs/MALLA.md](../MALLA.md) §7 y [docs/TERRENO.md](../TERRENO.md) §1 y §2.

## Qué pasa hoy

`TerrainShaper` (`src/render/terrainShape.ts`) recorre la grilla del plano: para cada celda cuadrada decide qué
esquinas redondea mirando a sus vecinas y cuelga los costados de cada lado que da afuera. `TerrainView`
(`src/render/terrainView.ts`) agrega las rampas y una malla por losa frágil, todo en cuadrados.

Lo que ya sirve tal cual: el terreno se arma por **capas de altura**, y los costados, el neón y la pintura del
borde trabajan sobre una línea de puntos con normales (`Rim[]`, `skirt`, `trim`, `paint`, `neon`).

## Qué hacer

Que las formas salgan de la malla del terreno, sea cuadrada u orgánica. Un solo camino de código.

**En `TerrainShaper`:**

- Las capas son las alturas distintas de las celdas de la malla. Una celda está en una capa con la misma regla de
  hoy (`inLayer`).
- El **contorno** de una capa son los lados de celda que separan lo que está en la capa de lo que no (otra celda
  más baja, una losa frágil, vacío). Se encadenan en líneas; cada tramo sabe qué tiene del otro lado, que es lo
  que decide si cuelga un acantilado, una pared o el hueco de una losa.
- Las esquinas del contorno se cortan con un arco: 0,31 del lado más corto de los dos que la forman, con tope en
  `R_OUT`. En la malla cuadrada eso da el redondeo de hoy. Las esquinas que tocan una losa frágil, una rampa o un
  resorte quedan vivas, como hoy (`blocked`).
- La cara de arriba de cada celda es su polígono, con el corte donde tiene una esquina saliente del contorno y un
  relleno donde el contorno tiene una entrante.
- La sombra de contacto, el neón, la franja pintada del borde y el cordón de las plataformas siguen con sus reglas.
- **Juntas** (nuevo, optativo por ambientación en `TerrainLook`): una línea fina pintada sobre los lados entre
  celdas de la misma capa. Apagadas por defecto.
- El contorno de cada capa, con sus normales, queda disponible para la decoración (lo usa la tarea 16).

**En `TerrainView`:**

- **Rampas:** una pieza por rampa, con la cuña de hoy y el descanso como una losa aparte. En la malla cuadrada el
  descanso coincide con la plataforma y no se dibuja.
- **Losas frágiles:** una malla por losa (por celda frágil del plano, que puede ser varias celdas de la malla),
  con sus grietas repartidas sobre toda la losa. Se sigue cayendo y volviendo como hoy.
- Lo que cuelga por debajo de la isla, igual que hoy.

La regla de TERRENO.md se mantiene: **lo que se dibuja no le miente a la colisión.**

## Cómo verlo

El terreno orgánico se prende desde la consola del juego (`window.__rubble.session.setSettings(...)` con el ajuste
de la tarea 14) antes de empezar la partida. `tests/e2e/maps.mjs` saca las capturas de cada mapa; conviene
sumarle un parámetro para elegir el terreno y la semilla.

## Listo cuando

- **Cuadrada:** capturas de los diez mapas antes y después de la tarea, lado a lado. Se ven iguales salvo
  diferencias de detalle que las Notas de ejecución enumeran.
- **Orgánica:** capturas de los diez mapas con dos semillas cada uno (entero desde arriba, y a la altura de la
  cámara en una costa, al pie de un muro, en una rampa y sobre piso frágil).
- Con un script descartable, en los diez mapas y en los dos modos: ningún vértice de una cara de arriba queda a
  más de 13 cm de piso real de esa altura o más, y el centro de toda celda sólida queda cubierto por una cara
  dibujada.
- Una losa frágil que se cae deja un hueco con la forma exacta de la losa dibujada (captura de una losa caída en
  cada modo).
- Armar el dibujo del terreno de `cornisas` orgánico tarda menos de 300 ms, y tiene como mucho cuatro veces los
  triángulos que hoy. Anotar los dos números.
- Las capturas orgánicas quedan en `tests/e2e/out` para que el usuario las vea. Son la primera vez que ve la malla
  en el juego: en las Notas de ejecución, decir qué mirar.

## Notas de ejecución

**Archivos:** `src/render/contour.ts` (nuevo: contornos de una región de celdas y `MeshAdj`), `src/render/terrainShape.ts` (reescrito sobre la malla), `src/render/terrainPieces.ts` (nuevo: `GeoBuilder` y la losa frágil), `src/render/terrainView.ts`, `tests/e2e/maps.mjs` (parámetros `ORGANIC`, `SEED` y `FALL`, y dos tomas nuevas: rampa y piso frágil), `docs/TERRENO.md` (§1, §2, §5, §6), `docs/MALLA.md` (§7, "Cómo quedó"), `docs/decisiones-web.md` (DW-56) y la línea de `render/` del `README.md`. Cómo quedó, en [MALLA.md](../MALLA.md) §7. No cambió nada de `src/core` ni de la red.

**Lo que quedó distinto del plan**

- **El resorte no es "esquina viva".** La tarea decía "una losa frágil, una rampa o un resorte quedan vivas, como hoy", pero hoy el resorte no está en `blocked` (es un disco que va sobre el piso, no una pieza que tenga que calzar). Quedó como hoy. Lo que sí se suma a las esquinas vivas es una celda que bajó la franja de llegada de una rampa.
- **Esquinas.** Un quiebre de menos de unos 11° no es esquina y el borde sigue derecho (la malla orgánica tiene miles de vértices que giran poco; cortarlos todos sería redondear lo que no lo necesita). La esquina entrante se rellena con 0,2 del lado más corto, tope `R_IN`; la tarea solo daba la regla de la saliente. En la cuadrada dan los 0,62 y 0,4 m de siempre.
- **El descanso de la rampa lo dibuja la capa de arriba**, no `TerrainView`: necesita el costado de roca y el cordón de la plataforma, que ya están ahí. Va levantado 6 mm sobre la plataforma (que lo pisa en parte) para que no le pelee la profundidad, y el cordón y el neón de la plataforma que quedan debajo de él no se pintan. Solo en la orgánica (en la cuadrada coincide con la plataforma). No lleva bisel propio.
- **Losa frágil.** El UV de la textura es el de siempre en la cuadrada. En la orgánica solo se usa el interior de la textura: el borde dibujado en ella es una raya recta que se vería cruzando una losa de contorno irregular. Las grietas son una calcomanía con las mismas celdas de la losa (antes, un plano de 2 × 2 m).
- **Juntas** (`TerrainLook.joints`): hechas, probadas prendiéndolas a mano (cuadrada y orgánica, capturas en `tests/e2e/out/t15-juntas`) y apagadas en las cuatro ambientaciones. El ancho de prueba (5 cm) se ve pesado; una ambientación que las quiera probablemente quiera 2 o 3 cm.
- `GeoBuilder` pasó de `terrainView.ts` a `terrainPieces.ts` y `addCell` quedó como `addWedge` (solo cuñas de rampa, iterando `mesh.ramps`).

**Listo cuando**

| | Cuadrada | Orgánica |
|---|---|---|
| Vértice de una cara de arriba más lejos de piso real de esa altura o más (límite 13 cm), 10 mapas, orgánica con 3 semillas | 11,7 cm (el relleno de las esquinas entrantes, como antes) | 6,8 cm (9,1 cm contando la pintura del borde) |
| Centros de celdas de la malla sin una cara dibujada a su altura | 0 | 0 |
| Vértices revisados en total (caras, losas y pintura) | 1.146.153, sin ningún problema | |
| Hueco de una losa caída: distancia máxima de sus puntos al contorno de la losa | 0,000 mm | 0,000 mm |
| Armar el dibujo de `cornisas` en Edge, la primera vez en una página nueva (mediana de 5, mín. a máx.) | 42 ms (34 a 45); el dibujo de antes, 44 ms (41 a 46) | **83 ms (71 a 89)**; límite 300 ms |
| Triángulos de `cornisas` (caras de arriba, roca, neón y pintura) | 37.476; antes 37.552 | **103.700** (2,8 veces; con otras semillas 100.000 a 113.000, hasta 3,0). Límite 4 veces |
| Triángulos en los otros nueve mapas, contra antes | – | de 2,1 a 3,1 veces |

- **Capturas.** `tests/e2e/out/t15-lado-a-lado/` (antes y ahora de la cuadrada, lado a lado: entero, costa, muro, rampa, piso frágil y losa caída), `t15-antes/` y `t15-despues/` (las originales), `t15-org/` (orgánica, semillas 11 y 2222, los diez mapas: entero, en juego, costa, muro, rampa, piso frágil, losa cayendo y losa caída, donde el mapa tiene de eso) y `t15-galeria.html` con todo junto. `t15-juntas/` tiene las juntas prendidas.
- **Cuadrada: qué cambia respecto de antes.** Comparando por posición la geometría vieja y la nueva en los diez mapas: las caras de arriba y el neón tienen los mismos puntos; la roca es la misma salvo unos pocos puntos de muestreo (47 de unos 5.900 en La Cantera, corridos medio paso porque el tramo recto ahora se muestrea desde la esquina cortada y no desde el principio de cada lado de celda); de unos 2.000 puntos de las caras de arriba de La Cantera, 12 cambian de color en menos de 0,06, y en los lados de celdas con una esquina cortada ya no está el punto del medio (de 16 a 112 puntos de muestreo por mapa). Los triángulos de las caras de arriba, la roca, el neón y la pintura varían menos de 1 % (76 de 37.552 en Las Cornisas, 100 de 26.992 en El Puente). En pantalla, la diferencia píxel a píxel entre antes y ahora la dominan cosas que se animan (el fondo, el neón que pulsa, los personajes y las partidas de bots, que no son las mismas), no el terreno.
- **Losa caída en cada modo:** `*-9-losa-caida.png` en `t15-despues` y en `t15-org`. La pared del hueco es el costado de la losa vecina o el de la capa 0 y cada punto del hueco está sobre el contorno de la losa.
- **Pruebas.** `npm run typecheck` y `npm run build` sin errores. `tests/e2e/moba.mjs` pasa; `tests/e2e/run.mjs` pasó 3 de 3 con este cambio y 3 de 3 con el commit anterior (misma máquina, misma tanda). Una tanda anterior, con la máquina ocupada, dio 0 de 3 con timeouts de render en el multijugador: es la misma fragilidad de siempre. Host y cliente en dos pestañas con la malla orgánica (Horda y Arena): la misma huella en la simulación del host, su vista y la del cliente; el cliente se mueve y no hay errores de página.

**Qué mirar (es la primera vez que se ve la malla orgánica en el juego)**

Se prende desde la consola antes de empezar la partida: `__rubble.session.setSettings({ organic: true })` (sin botón todavía). Las capturas orgánicas ya están en `t15-org`; para ver otra semilla: `ORGANIC=1 SEED=<n> node tests/e2e/maps.mjs <mapa>`.

- **Cuánto se nota lo irregular.** La malla tiene celdas de 1 m y se relaja con unas cuarenta vueltas; ese grado de irregularidad es lo que sigue sin aprobar. Se ve en la costa, en el borde de las plataformas y en la forma de cada losa frágil. Si se pasa de irregular o se queda corto, es un parámetro del generador (`mesh.ts`), no del dibujo.
- **La costa:** que el neón, los pianos de la Carrera y las rayas de peligro de la Horda sigan el borde sin cortarse ni flotar.
- **Las plataformas:** el cordón y las esquinas cortadas, el muro de roca por debajo y, en las rampas, cómo se junta la cuña con el descanso (los costados rectos del descanso contra el borde irregular de la plataforma).
- **Las losas frágiles:** la forma de cada una, la textura (con la orgánica no lleva la raya del borde) y el hueco al caer.
- **Lo que todavía no sigue a la malla** (tarea 16): el pasto y las piedritas, las piezas de la ambientación (almenas, barreras, torres), los artefactos, el minimapa y las tiras de neón del borde de las rampas siguen en las celdas del plano, así que cerca de la costa algo puede quedar medio metro dentro del vacío o dentro de la roca. Los conos de abajo de la isla tampoco.

**Lo que conviene saber**

- **La losa que cae gira alrededor del origen del mundo**, no de su centro (la geometría de cada losa está en coordenadas del mundo y `TerrainView.update` rota el `Mesh`): una losa lejos del centro describe un arco raro los primeros 0,5 s de la caída. Es de antes de esta tarea y no se tocó (la tarea dice "se sigue cayendo y volviendo como hoy"); arreglarlo es dejar la geometría de cada losa alrededor de su centro y poner el `Mesh` ahí.
- **Triángulos.** Casi todo el aumento es roca (el acantilado muestrea cada 0,5 m del contorno, que en la orgánica es más largo y más quebrado). Si hiciera falta bajarlo, la perilla es `STEP` en `terrainShape.ts`.
- **Cada capa dibuja todas sus celdas**, también las que quedan tapadas por una capa de arriba (como antes); no se descartó ninguna.
