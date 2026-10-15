# Terreno y ambientación

Cómo se dibuja el mapa. La idea viene de Townscaper: **la entrada es simple** (qué hay en cada celda) y **un
algoritmo decide la forma** mirando a las vecinas. Desde la tarea 15 la entrada son las celdas de la **malla** del
terreno (cuadrada u orgánica, ver [MALLA.md](MALLA.md)) y no las de la grilla del plano: es el mismo código para las dos.
Desde la tarea 17 lo que se juega es la orgánica (la cuadrada es una opción de la sala), así que el borde de cada región es
irregular y distinto en cada partida. Todo lo que describe este documento es solo visual: la colisión, los bots, la red y el
formato de los mapas no dependen de él.

## 1. Las tres capas

| Capa | Archivo | Qué hace |
|---|---|---|
| Formas | `src/render/terrainShape.ts` (con `contour.ts` y `terrainPieces.ts`) | Arma el dibujo del terreno desde los polígonos de la malla: costa cortada en las esquinas, acantilados, muros y plataformas; las losas frágiles como piezas |
| Lectura del mapa | `src/render/topology.ts` | Dice qué hay en cada lugar: hilera de muros, muro suelto, macizo, puente, claro, borde al vacío (siempre desde el plano) |
| Apoyo | `src/render/support.ts` | Dice si en un punto hay de verdad muro, piso firme o borde sobre la malla, para que las piezas se apoyen donde hay con qué |
| Ambientación | `src/render/ambience.ts` | Una por juego: colores de la roca, piezas para cada cosa que la lectura encuentra y fondo |

`terrainView.ts` dibuja las formas (y las cuñas de las rampas), `decorView.ts` siembra el pasto y coloca las piezas, y
`backdrop.ts` arma el fondo. `pieces.ts` es la caja de formas simples con la que se construyen las piezas (y, con un `Support`,
achica la pintura hasta que entra en piso real).

## 2. Formas desde el contorno

El terreno se arma por **capas de altura**: el piso, las plataformas y los muros. Una capa incluye todo lo que es de su
altura o más (menos las losas frágiles, que son piezas aparte), así que donde una plataforma corta la esquina se ve el piso
que tiene debajo. El **contorno** de una capa son los lados de celda que separan lo que está en la capa de lo que no
(`contour.ts`), encadenados en lazos; cada tramo sabe qué hay del otro lado (vacío, una losa frágil o piso más bajo), y eso
decide lo que cuelga: un acantilado, una pared recta o una pared de muro. En cada vértice del contorno se mira cómo gira:

- **Esquina saliente** (el contorno gira hacia adentro): se corta con un arco de 0,31 del lado más corto de los dos que la
  forman, con tope en `R_OUT` (0,62 m). La cara de arriba de las celdas que tocan ese vértice se recorta con las cuerdas del arco.
- **Esquina entrante** (gira hacia afuera): lleva un relleno curvo de 0,2 del lado más corto, con tope en `R_IN` (0,4 m).
- **Quiebre chico** (menos de unos 11°; de 17° en la orgánica): no es esquina, el borde sigue derecho.
- **Esquina viva:** donde hay una losa frágil o una rampa, o muy cerrada, no se corta nada.
- **Borde que da al vacío:** cuelga un acantilado de roca, con una franja de tierra arriba.

En la malla cuadrada (lados de 2 m) todo eso da los radios de siempre; en la orgánica (lados de 1 m) las esquinas salen más
chicas y siguen la forma irregular, y para no cargar de triángulos el borde (que llevaba el doble de puntos por metro) un arco no tiene
tramos de menos de 0,3 m (`MIN_TURN_ORG` y `ARC_LEN_ORG`) y una celda sin recortes se dibuja con dos triángulos y no cuatro ([MALLA.md](MALLA.md) §10). El contorno de cada capa, con la normal de cada punto, queda en `TerrainShape.contours`
(la decoración no lo usa: mide el borde real directamente sobre la malla, ver §3).

El piso firme no tiene juntas de losa: sobre él no se ven las celdas. Cada ambientación puede pedir **juntas**
(`TerrainLook.joints`: una línea fina pintada sobre los lados entre celdas de la misma capa, un empedrado irregular).
El usuario las vio prendidas en la Carrera, el Refugio, la Cantera y el Puente (octubre 2026) y las dejó **apagadas en los cuatro
juegos**: el piso queda liso y lo pintado encima (flechas, puertas, claros) se lee sin fondo. La opción sigue ahí para quien
quiera probarla. Las losas quedan para lo que se rompe y para las rampas, que así se leen como piezas aparte:

- **Losa frágil** (`terrainPieces.ts`): una pieza por celda frágil del plano, que puede ser varias celdas de la malla. Su cara
  de arriba se mete un bisel desde el contorno, el borde baja hacia la junta y los costados llegan al fondo de la isla (es una
  columna entera que se cae). Las grietas son una calcomanía con la forma de la losa.
- **Rampa:** la cuña de siempre (un rectángulo con bisel) y, en la malla orgánica, su **descanso**: una losa llana al nivel de
  arriba que tapa la franja de llegada que bajó la malla. Se levanta 6 mm sobre la plataforma y cuelga su costado de roca solo
  donde no hay plataforma que lo tape. En la cuadrada el descanso coincide con la plataforma y no se dibuja.

### Lo que se dibuja no le miente a la colisión

- Se cortan **solo las esquinas**. El borde recto de cada celda está exactamente donde está el borde real.
- Una esquina saliente cortada dibuja *menos* piso del que hay (como mucho unos 25 cm en la punta, en la malla cuadrada).
  Una entrante dibuja *de más*, pero el relleno sobresale apenas 12 cm (menos de 6 cm en la orgánica).
- El acantilado se abulta y se afina **por debajo** del borde, nunca a la altura del piso.
- Al lado de una losa frágil o de una rampa **no se corta nada**, para que las piezas sueltas calcen justas.
  Por eso no hay que recalcular nada cuando una losa se cae: el hueco es el de la losa.

Ningún vértice de una cara de arriba debe quedar a más de 13 cm de piso real de esa altura o más, y el centro de toda celda
sólida debe quedar cubierto por una cara dibujada (se verificó en los diez mapas, con las dos mallas, con un script
descartable; ya no hay test que lo vuelva a comprobar).

## 3. Decoración contextual

`analyze()` clasifica el mapa y cada ambientación responde con sus piezas:

| Lo que encuentra | Arena | Asedio | Carrera | Horda |
|---|---|---|---|---|
| Hilera de muros | Pretil de bloques | Almenas | Barrera a rayas y neumáticos | Bolsas de arena y alambre de púa |
| Punta de hilera o muro suelto | Monolito con cristal, mástil | Torreón con techo y bandera | Mástil con bandera a cuadros | Torre de reflector |
| Codo o cruce | Peñasco con cristal | Bastión con brasero | Neumáticos | Puesto de guardia |
| Macizo (2×2 o más) | Peñascos | Torreón cuadrado | Tribuna | Contenedor |
| Puente | Losa y ménsulas | Tablones y puntales | Galones y guirnalda | Rejilla y caños |
| Claro | Círculo de combate | Plaza empedrada | Flechas con el sentido de la pista | Estacionamiento despintado |
| Borde al vacío | Cristales y enredaderas | Estandartes y hiedra | Carteles; pianos rojos y blancos | Caños, cadenas; rayas de peligro |
| Islas del fondo | Ruinas de columnas | Atalayas | Carteleras y globos | Edificios en ruinas, antenas, bruma |

En el Asedio los techos, banderas y estandartes toman el color del equipo de ese lado del mapa. En la Carrera
las flechas salen de un campo de distancias a la meta, así que siguen la pista aunque dé vueltas.

### De dónde sale cada cosa: plano o malla

La regla de [MALLA.md](MALLA.md) §5: **qué va y dónde lo decide el plano; sobre qué se apoya lo decide la malla.** La lectura
(`topology.ts`) sigue mirando el plano, que es donde están las intenciones del mapa; lo que mide el apoyo real es `support.ts`
(`Support`), que le pregunta a la malla (`surfaceAt`) si en un punto hay muro, piso firme, piso llano o vacío. Con la malla cuadrada el
borde real es el lado de la celda del plano y todo queda donde estaba; con la orgánica, el contorno irregular.

| Cosa | La decide el plano | Se apoya en la malla |
|---|---|---|
| Hileras de muros, codos, muros sueltos, macizos | cuál es cada uno y qué pieza lleva (`WallSpot`) | cada pieza de arriba de un muro se prueba en seco (`Pieces.base`: los puntos de su base). Si no cae entera sobre el muro real se corre hacia el centro de la celda y, si todavía no, se achica (hasta el 60 %). Si no entra, no se pone |
| Pintura sobre el piso (claros, galones, flechas, rejillas) | dónde va (`Clearing`, `BridgeSpot`) | `Pieces` achica cada calco alrededor de su centro hasta que todos sus vértices y el centro de cada triángulo caen sobre piso llano y firme del nivel de abajo. Bajo el 40 % de su tamaño no se pone |
| Puentes: tablones, rejilla, ménsulas, caños, postes de la guirnalda | cuáles celdas son puente y hacia dónde van | el ancho de piso a cada lado del centro de la celda (`Support.span`): los tablones llegan de borde a borde y lo que cuelga va pegado al borde real |
| Costa: cristales, enredaderas, estandartes, carteles, cadenas, caños, y las rocas del acantilado | cada lado de celda que da al vacío (`CoastSpot`) | el borde real que da al vacío (`Support.edgeAt`): desde el centro de la celda se avanza hacia afuera hasta salir del muro o del piso, con la altura y la normal del lado de la malla que lo forma. Cada pieza suelta se pega al borde donde le toca |
| Pasto, piedritas, flores | cuántas hay por celda y de qué color | solo si el punto cae sobre piso firme (o rampa); la altura es la de la malla |
| Franja de cada puerta de la Carrera | cuáles celdas son la puerta | las celdas de la malla que caen en su grosor, recortadas a él: llega de borde a borde del piso real, también el que asoma |
| Carril de las bolas y su punto de caída | dónde está el lanzabolas y hacia dónde rueda | el largo real (`GadgetSpawn.len`, tarea 14) y una cinta que se angosta donde el piso es más angosto |
| Resorte | en qué celda está | la altura del piso real en el centro de la celda |
| Minimapa | – | los polígonos de la malla (piso, plataformas, muros, losas frágiles; los huecos de las caídas no se dibujan) |
| Fondo e islas lejanas, suelo (`ground.ts`) | – | solo dependen de los límites del mapa y de las líneas del Asedio, no de las celdas |

### Nada parece un obstáculo que no es

Las piezas no colisionan, así que **sobre el piso que se pisa solo va pintura** (y el pasto chico de siempre).
Lo que tiene volumen va arriba de los muros, colgado del acantilado por debajo del borde, o por encima de las
cabezas. No hay barandas en los bordes: un borde con baranda del que igual te caés sería una trampa.

Las piezas salen de una semilla fija por mapa: todos los jugadores ven lo mismo.

## 4. Ambientación y tema

Son dos cosas distintas y se combinan:

- La **ambientación** depende del juego (de la clase del mapa, `kind`): piezas, colores de la roca y fondo.
- El **tema** (Neón, Cantera, Atardecer, Noche) sigue siendo elegible en la sala: cielo, luces, niebla y neón.

Cada juego entra con el tema que le queda (`defaults.theme` en `core/games.ts`, o el del mapa).

## 5. Cómo sumar o cambiar

- **Ambientación de un juego nuevo:** una entrada en `AMBIENCES` (`ambience.ts`) con `wall`, `bridge`,
  `coast`, `clearing` y, si hace falta, `island`, `floaters`, `fog` y `mist`.
- **Una pieza nueva:** se arma con `Pieces` (cajas, cilindros, telas, calcos). Si necesita una situación que la
  lectura todavía no distingue, se suma a `topology.ts`.
- **Revisar cómo quedó:** `npm run build && node tests/e2e/maps.mjs [mapa,mapa|all] [tema]` saca capturas de
  cada mapa (entero, en juego, costa, muro, rampa y piso frágil) en `tests/e2e/out`; en las pistas de Carrera suma una toma de
  cada puerta, y en los mapas de Asedio el minimapa (e imprime cuánto coincide con el terreno). El terreno es el orgánico: con
  `SEED=n` se fija su semilla, con `SQUARE=1` se arma la malla cuadrada y con `FALL=1` suma las capturas de una losa frágil cayendo y caída.
- **Qué detecta en cada mapa:** `npm run tool:clearings`.

## 6. Lo que falta

- **Probarlo jugando.** Está revisado con capturas, no en partidas con gente. Lo primero a mirar: si el borde
  redondeado se lee bien con el personaje en movimiento y si alguna pieza distrae en plena pelea.
- **Mirar la malla orgánica en movimiento.** Está medida y revisada con capturas ([MALLA.md](MALLA.md) §10), no jugada con gente: si la
  costa irregular se lee bien corriendo, si los pasos angostos son justos y si alguna pista quedó más difícil de lo que era.
- **Las piezas del borde de un muro siguen alineadas con los ejes del plano** aunque el borde real se tuerza (hasta unos 30°); se
  corren o se achican para caer sobre el muro real, pero no giran con él.
- Los mapas de Arena sin muros (El Islote, El Flipper) muestran poco de su ambientación: casi todo lo vistoso
  va sobre los muros.
- Las piezas son estáticas: banderas y guirnaldas no flamean.
