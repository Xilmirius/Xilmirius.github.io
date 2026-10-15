# Malla irregular: diseño

> Estado: **hecho** (tareas 10 a 17 de [docs/tareas](tareas/README.md)). La malla orgánica es el terreno de los cuatro juegos; la
> cuadrada queda como opción de la sala ("Terreno: Cuadrado") y como respaldo si una semilla no pasa su comprobación. Este
> documento dice cómo está hecho: el diseño, lo que cambió al construirlo ("Cómo quedó" de cada tarea) y, en el §10, los números
> reales. Reemplazó la nota "quedó afuera a propósito" de [TERRENO.md](TERRENO.md) §6.

## 1. La idea: dos capas

El usuario pidió que el mapa deje de verse como una grilla: celdas de formas distintas, estilo Townscaper, y que no
sea siempre igual. Deformar la grilla obligaba a rehacer colisión, bots, red y mapas. La salida es separar lo que
hoy está pegado:

- **El plano** es la grilla de 2 m que se escribe en ASCII (`src/core/maps/index.ts`). Sigue siendo la entrada, y
  es la capa **lógica**: dónde va cada cosa, por dónde se camina, puertas, zonas, caminos de bots, decoración.
- **La malla** son cuadriláteros irregulares de más o menos 1 m de lado, generados en cada partida desde una
  semilla. Es la capa **física y visual**: dónde hay piso, contra qué se choca y qué se dibuja.

Cada celda de la malla toma su clase (vacío, piso de tal nivel, muro) de la celda del plano que tiene debajo de su
centro, y recuerda de cuál salió (`src`). El borde de cada región sigue las aristas de la malla: por eso sale
irregular y distinto en cada partida, sin que nadie redibuje el mapa.

La malla orgánica es lo que se juega: una partida nueva de cualquiera de los cuatro juegos la arma con la semilla de la
partida (`MatchSettings.organic` viene prendido y la sala tiene la opción "Terreno: Orgánico / Cuadrado"). La cuadrada es el
mismo código por un camino trivial (§4, "Modo cuadrado") y sigue sirviendo para comparar y de salida si algo anda mal.

## 2. La regla que sostiene todo

Llamemos **radio** de una celda de la malla a la distancia de su centro a su vértice más lejano.

> **Si el radio de todas las celdas es menor que media celda del plano (1 m), la malla conserva la forma del plano.**

De ahí salen tres garantías:

1. La celda de la malla que contiene el centro de una celda del plano salió de esa celda del plano. Todo lo que
   se apoya en un centro (una salida, una cobertura, una torre) cae en piso de la clase correcta.
2. Caminar en línea recta entre los centros de dos celdas vecinas del plano de la misma clase pisa siempre celdas
   de esa clase. Todas las celdas de la malla que toca ese segmento tienen el centro a menos de 1 m de él, o sea
   dentro de las dos celdas del plano.
3. Una franja de vacío (o de muro) de una celda de ancho sigue separando sus dos lados: cualquier camino que la
   cruce pasa por una celda de la malla que tiene el centro dentro de la franja.

Consecuencia práctica: **lo que hoy se calcula sobre la grilla y se ejecuta caminando de centro a centro sigue
valiendo** (caminos de bots, campo de la Horda, progreso de la Carrera, líneas del Asedio). Lo único que tiene que
aprender la malla es la física y el dibujo.

Lo que la regla no garantiza es el ancho: un puente de una celda puede quedar de 0,5 m en su punto más angosto o
de 3 m en el más ancho. Donde el ancho importa, el plano usa dos celdas.

## 3. Cómo se genera

Lo de Townscaper:

1. Una trama de triángulos equiláteros de 2 m de lado que cubre el mapa con un margen.
2. Se juntan al azar triángulos vecinos de a pares para formar rombos; los que quedan sueltos siguen triángulos.
3. Cada rombo se parte en cuatro cuadriláteros y cada triángulo en tres (centro de la cara y mitad de cada lado).
   Ahora todo son cuadriláteros de 1 m de lado.
4. Se relaja: en cada vuelta, cada cuadrilátero tira de sus vértices hacia el cuadrado más parecido a él. Unas
   cuarenta vueltas. Los vértices del borde de la trama no se mueven.
5. Se redondean las coordenadas a 1/256 de metro.

**Espejo.** Los mapas de Arena y de Asedio son justos porque son simétricos. Para ellos se genera la mitad derecha,
con los vértices del eje clavados en `x = 0`, y se espeja.

**Tiene que dar lo mismo en el host y en cada cliente**, porque el cliente predice su movimiento contra su propia
copia. Por eso el generador usa solo sumas, restas, multiplicaciones, divisiones, `Math.sqrt` y el `Rng` del
proyecto. Nada de senos, cosenos, `atan2`, `hypot` o potencias, que pueden diferir en el último bit entre
navegadores. Las rotaciones que hacen falta son de 90°, que son intercambios de coordenadas.

**El generador se revisa a sí mismo:** todos los cuadriláteros convexos, ángulos entre 35° y 145°, lados de más de
0,35 m y radio menor que 0,97 m. Si una semilla no cumple, se prueba la siguiente.

**Cómo quedó en `src/core/mesh.ts`** (tarea 10). Para que la revisión pase en mallas de 15.000 cuadriláteros hizo falta
agregar dos cosas a lo de arriba:

- **Reparación del apareo.** Un vértice de la trama que no queda con ninguna diagonal (ningún rombo lo toca por un
  lado compartido) termina con seis cuadriláteros de 60° y un radio de 1,0 a 1,1 m, que ninguna relajación arregla.
  Después del apareo al azar se recorre la trama y, donde pasa eso, se juntan dos triángulos vecinos de ese vértice.
  Siguen quedando triángulos sueltos y vértices de valencia 3 y 5: de ahí sale lo irregular. Un apareo perfecto no sirve:
  en una franja de trama es único y sale una grilla cuadrada.
- **Peso extra a los cuadriláteros que van mal.** En el relajado, uno que se acerca a lo que la revisión no tolera
  (radio mayor que 0,86 m, lado menor que 0,5 m o ángulo a menos de unos 5° del límite) pesa 8 veces más en el tirón
  de sus vértices: se arregla a costa de los vecinos, que tienen margen. Con esto una semilla de 130×90 m pasa la
  revisión 9 de cada 10 veces; sin esto, nunca.

La malla devuelta es solo lo que toca la región (los cuadriláteros de la franja de 3 m de margen se descartan). Las
dos conversiones de coordenadas del espejo son exactas: se redondea a 1/256 antes de copiar con el signo cambiado.

## 4. Cómo se estampa el plano

1. A cada celda de la malla se le mira el centro: la celda del plano que hay ahí le da la clase y queda como su
   `src`. Las que caen en vacío se descartan.
2. **Losas frágiles.** Las celdas de la malla que salieron de la misma celda frágil del plano forman **una losa**:
   se agrietan y se caen juntas. La cantidad de losas y su estado son los de hoy (una por celda frágil del plano),
   así que lo que viaja por la red no crece.
3. **Resortes.** Una celda de la malla es resorte si su `src` lo es.
4. **Rampas.** Dejan de ser celdas inclinadas y pasan a ser **piezas apoyadas** sobre piso llano, que es como ya
   se dibujan (ver abajo).
5. **Limpieza.** Un grupito de celdas caminables que quedó sin conexión a pie con el resto y que no contiene el
   centro de ninguna celda del plano se elimina.
6. **Vecindades** y un índice por baldes para encontrar rápido qué celda hay en un punto.

### Rampas

El borde de una plataforma queda irregular, y una rampa tiene que llegar justo a él. Si la plataforma se asoma
sobre la rampa, le tapa la subida; si se retira, queda un hueco. Se resuelve así:

- La pieza tiene dos partes: la **cuña**, que ocupa la celda de rampa del plano y sube de un nivel al siguiente, y
  el **descanso**, una losa llana al nivel de arriba que sigue 2 m más allá de la línea alta. Es un bloque sólido
  desde el piso.
- **Franja de llegada:** las celdas de la malla con el centro en el primer metro de plataforma después de la línea
  alta, a lo ancho de la rampa, se bajan al nivel de abajo. Como el radio es menor que 1 m, ninguna celda de la
  plataforma llega ya a taparle la subida a la cuña. Una celda de la plataforma que asoma en la esquina de la cuña
  (centro fuera de la franja, pero con un pedazo a más de 0,5 m de la línea alta) también baja: el descanso la tapa.
- El descanso tapa la franja bajada. Para tapar también lo que esas celdas sobresalen hacia los costados, el
  descanso se ensancha 1 m de cada lado donde la plataforma sigue.
- **Regla para los planos:** una rampa no va embutida en una plataforma. A sus costados hay piso del nivel de
  abajo, vacío u otra rampa. Y conviene que la plataforma siga a los costados de la celda de llegada: si la rampa
  queda pegada al borde lateral de la plataforma, el borde irregular se mete hasta 0,7 m en el descanso.

Una celda alta de al lado puede asomar en la esquina de la cuña. No molesta mientras entre menos de 0,5 m antes de
la línea alta: ahí la cuña ya está a menos de un escalón del nivel de arriba.

### Modo cuadrado

No se genera nada: la malla es un cuadrado por celda del plano, y las rampas no bajan ninguna franja porque el
borde de la plataforma ya coincide con la línea alta. Es el mismo código por un camino trivial. Se usa si el host
elige "Terreno: Cuadrado" en la sala, en los scripts sin pantalla con `--square` y cuando una malla orgánica no pasa su
comprobación en cinco semillas (`Terrain.meshFellBack`; en 1.000 semillas al azar no pasó nunca, §10).

### Cómo quedó en `src/core/terrainMesh.ts` (tarea 11)

`buildSquareMesh(terrain)` arma la cuadrada; `buildOrganicMesh(terrain, seed)` prueba hasta cinco semillas
(`seed + k·65537`) y devuelve `{ mesh, seed, attempts, problems }` con `mesh: null` si ninguna pasa. Las dos dan un
`TerrainMesh` con `cellAt`, `cellsNear` (para la colisión), `surfaceAt`, `rampAt` y `hash`. Detalles que el diseño no decía:

- **Bajo una rampa** la malla es piso llano del nivel de abajo, con `src` la celda de rampa. La pieza (`RampPiece`) se
  apoya encima: `wedge` y `landing` son rectángulos y `lowered` lista las celdas que bajó la franja.
- **Espejo.** Un centro que cae justo sobre el borde de dos celdas del plano se resuelve igual en las dos mitades (se
  mira con `|x|` y a la gemela se le da la celda espejada); sin esto un par de celdas por mapa salían asimétricas.
- **El descanso mide 2 m** más allá de la línea alta (una celda del plano), no más.
- **El pozo** es una celda bajada que asoma más de 0,25 m fuera de la cuña y el descanso y no toca piso del nivel de
  abajo: una rendija más angosta que un cuerpo (0,5 m de diámetro) no lo atrapa.

### Quién responde (tarea 12)

`Terrain.mesh` es la malla cuadrada y el juego la usa: `Terrain.groundAt`, `groundCellAt`, `blockAt`, `isPad` y `fragileIndexAt` la consultan (con las cuñas de las rampas), y `CollisionWorld` ya no hace cuentas de grilla. El plano sigue respondiendo lo lógico. Un punto justo sobre el borde entre dos celdas es de la de abajo y la de la derecha, en la malla y en las cuñas.

### Comprobación

Después de estampar se verifican las tres garantías de §2 sobre el mapa real, que cada cosa del
mapa quedó sobre piso del nivel que esperaba y que cada rampa se puede subir (`checkTerrainMesh`; el borde lejano del
descanso se prueba en el medio, a 0,25 m del eje de la rampa a cada lado, porque el borde de la plataforma es irregular). Si falla, se prueba la semilla
siguiente; a la quinta, la partida se juega en modo cuadrado y queda un aviso en la consola. Host y clientes
llegan a la misma malla porque corren la misma comprobación con la misma semilla.

## 5. A quién se le pregunta cada cosa

| Pregunta | Responde |
|---|---|
| ¿Hay piso acá, y a qué altura? | La malla, las rampas y los obstáculos |
| ¿Contra qué choca un cuerpo? ¿Qué frena una bala? | La malla, las rampas y los obstáculos |
| ¿Qué losa frágil estoy pisando? ¿Es un resorte? | La malla, por el `src` de la celda |
| ¿En qué celda del plano estoy? | El plano |
| Puertas de la Carrera, zonas, progreso por la pista | El plano |
| Caminos de bots, campo de la Horda, grafo de navegación | Nodos del plano; las aristas se prueban contra la malla |
| Dónde va cada cosa (salidas, cobertura, artefactos, torres) | Centros de celda del plano |
| Hileras de muros, puentes, claros (decoración) | El plano; las piezas se apoyan sobre la malla |
| Costa, acantilados, contornos | La malla |

Una puerta de la Carrera incluye también las celdas de vacío del plano pegadas a ella: la malla puede asomar hasta
1 m más allá del borde del plano, y quien pase por ese alero tiene que contar.

### Cómo quedó (tarea 16)

`src/render/support.ts` (`Support`) es el que le pregunta a la malla si en un punto hay de verdad lo que una pieza necesita:
`wall` (cara de arriba de un muro), `land` (piso o rampa de cualquier nivel), `ground` (piso firme o rampa, sin losas frágiles) y `paint`
(piso llano del nivel de abajo y firme, donde va la pintura). Todo se mide con `surfaceAt`, así que cuenta lo mismo que cuenta la
física. Con la malla cuadrada el borde real es el lado de la celda del plano; la lectura del plano (`topology.ts`) no cambió.

- **Borde real que da al vacío** (`edgeAt`). Desde el centro de una celda del plano, que por §2 siempre es piso o muro de su clase, se
  avanza por la normal del lado que daba al vacío hasta salir de la región (pasos de 5 cm y después se afina a la milésima). Ahí tiene que haber
  vacío 12 cm más allá, si no se prueba más cerca del medio del lado. De vuelta salen el punto, la altura (la de la celda de la malla que forma
  el borde) y la normal real (la del lado de esa celda que da al vacío). En la orgánica el borde queda hasta ~1 m del lado del plano.
- **Piezas de arriba de un muro** (`put` en `ambience.ts`). Se prueba en seco lo que va a armar (`Pieces.base`: los puntos de su base, es decir
  los vértices a menos de 3 cm de la cara de arriba) y se busca, en este orden, que todos caigan sobre el muro real: la pieza donde iba; corrida
  hacia el centro de la celda en pasos del 5 % del camino; y así a 0,9, 0,8, 0,7 y 0,6 de su tamaño. Si ninguna entra no se pone. La prueba
  no gasta números al azar (`Rng.state` guarda y devuelve el estado), así que con la malla cuadrada, donde todo entra a la primera, la
  decoración sale idéntica.
- **Pintura sobre el piso.** `Pieces` achica cada calco alrededor de su centro hasta que todos sus vértices y el centro de cada triángulo
  caen sobre `paint`; bajo el 40 % del tamaño no se pone. Los puentes miden además su ancho real (`span`) para que tablones y rejilla lleguen de
  borde a borde y lo que cuelga (ménsulas, caños, postes de la guirnalda) quede pegado al borde.
- **Costa.** Cada pieza se pega al borde real con `edgeAt`, a su propia distancia a lo largo del lado, con la normal real para girarla. Los cristales
  de la Arena no se alejan más de 15 cm del borde hacia afuera (antes hasta 35) y el cartel de la Carrera se acorta si el borde se curva a sus costados.
- **Pasto, piedritas, flores y rocas del acantilado.** Siguen saliendo por celda del plano con los mismos números al azar; solo se ponen si el punto
  cae sobre piso firme (`ground`) y la altura es la de la malla (`Terrain.groundAt`). Las rocas del acantilado se pegan al borde real.
- **Puertas.** La franja de cada puerta es el piso real de la malla en el grosor de las celdas de la puerta (recortado a ese grosor, con el alero de hasta
  1 m a los lados), a la altura de cada celda, con el UV de la textura sobre la grilla del plano. Con la cuadrada son las mismas celdas de siempre, pero
  sin los 8 cm de separación entre una y otra.
- **Carril de las bolas.** Una cinta de 1,25 m que se angosta donde el piso real es más angosto (y sus dos vértices de cada tramo siempre caen sobre piso);
  el largo es `GadgetSpawn.len` de la tarea 14.
- **Resorte, minimapa, conos y neón.** El resorte se dibuja a la altura del piso real del centro de su celda. El minimapa dibuja los polígonos de la malla
  (un trazo por color). Los conos de abajo de la isla cuelgan de piso real, las tiras de neón del borde de una rampa solo van donde no hay nada más allá de la cuña,
  y las partículas de una losa frágil que se rompe salen de la caja de la losa.

## 6. Colisión

Antes el movimiento probaba un eje por vez contra cajas alineadas (`moveAxis` en `src/core/movement.ts`). Con paredes
en cualquier ángulo eso se traba. Pasó a **mover y deslizar** (tarea 13, abajo está cómo quedó):

- Se avanza el paso completo y se busca contra qué quedó encimado el círculo del cuerpo: celdas de la malla más
  altas de lo que puede subir, rampas y obstáculos.
- Por cada contacto se saca al cuerpo por el camino más corto, que da una **normal** y una profundidad. A la
  velocidad se le quita la parte que va contra la normal; un cuerpo lanzado rebota contra esa normal.
- De cada celda solo cuentan los **lados expuestos**: los que dan a una celda que no bloquea. Así una pared hecha
  de muchas celdas se comporta como una sola superficie y el cuerpo no se engancha en las juntas.
- Las normales reemplazan a los "chocó en X / chocó en Z" en todo lo que los usa: el golpe contra una pared, el
  rebote de Gloop, atravesar una cobertura rota, trepar un borde.

Mejora de paso algo de hoy: contra la esquina de una caja el cuerpo ahora la rodea en vez de frenarse.

### Cómo quedó (tarea 13)

`CollisionWorld.contacts(x, z, r, feetY)` devuelve la lista de `Contact` de un círculo: `nx, nz` (unitaria, **de la superficie hacia el
cuerpo**), `depth`, `top` (la cara de arriba), `kind` (`CONTACT_CELL`, `CONTACT_RAMP` o `CONTACT_OBSTACLE`), `cell` (la celda del
plano de la que salió, -1 en un obstáculo) y `obstacle`. Bloquea lo mismo que `blockAt`, que sigue para las preguntas de sí o no
(bots, salidas, separación entre cuerpos). Los objetos de la lista se reusan en la próxima pregunta. La geometría vive en
`Terrain.contacts` (celdas y rampas) y en `src/core/contact.ts` (un círculo contra un rectángulo).

- **Celdas de la malla.** Un lado es *expuesto* si la vecina de ese lado no bloquea para esa altura de pies. De cada lado expuesto
  que el cuerpo tiene por delante sale un contacto: de frente si el centro cae en su tramo, y si cae más allá del principio, por el
  vértice (cada vértice del contorno lo da el lado que sale de él, así que la esquina cuenta una sola vez). Es lo que hace que el
  cuerpo rodee una esquina. Si el centro está *adentro* de la celda, un solo contacto: el lado expuesto más cercano.
- **Rampas y obstáculos** son rectángulos. La cuña bloquea según su altura en el punto de la caja más cercano al centro (como antes);
  el descanso, en la orgánica, con su altura fija.
- **`stepMove`.** En cada subpaso (los de siempre: hasta 0,3 m) el cuerpo avanza entero y `slide` mira los contactos hasta tres veces.
  Cada vuelta saca al cuerpo por la normal del más profundo (más 1 mm, para que no quede justo sobre el borde), quita de la velocidad
  lo que iba contra esa normal y, si era un cuerpo lanzado, la rebota con su restitución. Cada contacto contra el que el cuerpo
  venía (más de 1 mm/s) deja un `WallHit` con la normal real y la velocidad contra ella. Si pasadas las vueltas sigue metido más de
  2 cm (un hueco más angosto que el cuerpo), no avanza: vuelve a donde estaba antes del subpaso.
- **Trepar un borde** es lo mismo de antes con "empujando contra la normal" (`-(wx·nx + wz·nz) > 0,3`) en lugar de "empujando en el
  eje", y salta 0,6 m más allá en la dirección de la normal.
- **`depenetrate`** (salir de adentro de un obstáculo que apareció encima) no cambió: los obstáculos siguen siendo cajas, así que
  sus cuatro salidas ya son las normales de la caja, y además elige la que tiene piso firme.
- **Quien usaba "chocó en X o en Z"** ahora lee la normal: el rebote de Gloop refleja su dirección contra ella, y el cuerpo que atraviesa
  una cobertura rota sigue de largo contra la normal a 0,6 de la velocidad del golpe.

## 7. Dibujo

`src/render/terrainShape.ts` ya arma el terreno por capas de altura y cuelga los costados de tramos de borde. Lo
que cambia es de dónde sale el borde:

- En cada capa, el **contorno** son los lados de celda que separan lo que está en la capa de lo que no. Se
  encadenan en líneas.
- Las esquinas del contorno se **cortan** con un arco chico (0,31 del lado más corto, con tope en el radio de hoy)
  salvo junto a una losa frágil, una rampa o un resorte, donde las piezas tienen que calzar.
- Las caras de arriba son los polígonos de las celdas, con el corte en las esquinas salientes y un relleno en las
  entrantes.
- Los costados (acantilado, pared, hueco de losa), el neón y la pintura del borde ya trabajan sobre una línea con
  normales: se alimentan del contorno.

Vale la regla de [TERRENO.md](TERRENO.md): **lo que se dibuja no le miente a la colisión.** Un corte en una
esquina saliente dibuja menos piso del que hay; un relleno en una entrante dibuja de más, pero nunca más de 12 cm.

Sobre el piso firme no se ven las celdas, como hoy. Cada ambientación puede pedir que se pinten las **juntas**
(un empedrado irregular) donde le quede bien.

### Cómo quedó (tarea 15)

`TerrainShaper` ya no mira la grilla del plano: recibe la malla del terreno (`Terrain.mesh`, cuadrada u orgánica) y arma el
dibujo con un solo camino de código. Es solo dibujo: la física no cambió.

- **`contour.ts`** (nuevo). `boundarySegs` saca los lados de las celdas de una región que dan a otra cosa y `traceLoops` los
  encadena en lazos (donde dos celdas se tocan solo en una punta, sigue el lado que da la vuelta más cerrada alrededor de la región:
  cada rincón queda como un lazo propio). `MeshAdj` guarda lo que el dibujo pide de la malla: las celdas de cada vértice, la altura de
  lo más alto que lo toca (la sombra de contacto) y los vértices donde no se corta nada (los que tocan una losa frágil, una celda de
  rampa o una celda que bajó la franja de llegada).
- **Capas y contorno.** Las capas son las alturas distintas de las celdas de la malla. Una celda está en la capa h si no es de una losa
  frágil y es de altura h o más (en la capa 0, todas). El contorno de la capa son sus lados expuestos; cada tramo sabe qué hay del otro
  lado (nada, una losa frágil o piso más bajo) y si la cara de arriba que lo toca es de la altura de la capa (de eso depende el neón y
  la pintura del borde).
- **Esquinas.** En cada vértice del contorno se mira cuánto gira. Menos de unos 11° (17° en la orgánica, desde la tarea 17): sigue derecho. Si no, y el vértice no es de los que
  no se cortan, una **saliente** (gira hacia adentro) se corta con un arco tangente de 0,31 del lado más corto (tope `R_OUT`) y una
  **entrante** se rellena con un arco de 0,2 (tope `R_IN`). Una esquina viva parte el borde en dos y apaga el relieve del acantilado
  a 0,8 m de ella. En la cuadrada (lados de 2 m) los radios son los de siempre; en la orgánica (lados de 1 m) las esquinas salen de
  unos 0,3 m y el relleno de 0,2 m.
- **Cara de arriba.** Cada celda de la capa es un abanico desde su centro (desde la tarea 17, con la orgánica, una celda sin recortes ni puntos de más son dos triángulos). A la celda que toca una esquina saliente cortada se le recorta
  el polígono con las cuerdas del arco (solo a las celdas del cono de adentro de esa esquina); a las entrantes se les suma el abanico del
  relleno. Los lados de más de 1,5 m se parten cada metro para que el color del suelo se tome como siempre.
- **Descanso de rampa** (solo orgánica). Una losa llana al nivel de arriba, levantada 6 mm sobre la plataforma (que la pisa en parte) para
  que no le pelee la profundidad. Cuelga su costado de roca solo donde no hay plataforma, cuña ni otro descanso que lo tape; el cordón y
  el neón del borde de la plataforma que quedan debajo de ella no se pintan.
- **Losas frágiles** (`terrainPieces.ts`). Una pieza por losa: las celdas de la malla que salieron de la misma celda frágil, con los
  vértices del contorno metidos un bisel (9 cm, esquinas con inglete) y el costado hasta el fondo de la isla. Las grietas son una
  calcomanía con las mismas celdas y el UV de la caja de la losa. El hueco que deja una losa caída lo arma el contorno de la capa 0 contra
  esa losa: cada punto está sobre el contorno de la losa (verificado, a menos de 0,001 mm).
- **Juntas.** `TerrainLook.joints` (color y ancho). Líneas finas sobre los lados entre dos celdas de la capa, recortadas por las esquinas
  cortadas. Apagadas en las cuatro ambientaciones.
- **Contornos.** `TerrainShape.contours`: cada tramo del contorno de cada capa con `h`, qué hay afuera (`out`), si la cara es de la
  capa (`mine`) y los puntos con su normal hacia afuera, ya con las esquinas cortadas. `MeshAdj` y `ShapeContour` salen de `contour.ts` y `terrainShape.ts`.
  La decoración de la tarea 16 no los usa: mide el borde real directamente sobre la malla (con las esquinas cortadas el dibujo queda unos centímetros
  dentro del borde real, y las piezas se apoyan en el real).
- **Medido** (script descartable, diez mapas × cuadrada y orgánica con tres semillas): ningún vértice de una cara de arriba, de una losa o de la
  pintura queda a más de 11,7 cm de piso real de esa altura o más (11,7 cm es el relleno de las esquinas entrantes de la cuadrada; en
  la orgánica, 6,8 cm en las caras y 9,1 cm en la pintura) y el centro de toda celda de la malla queda cubierto por una cara dibujada
  a su altura. Armar el dibujo de `cornisas` en Edge, la primera vez en una página recién abierta:
  83 ms con la orgánica (máx. 89 en cinco corridas), 42 ms con la cuadrada y 44 ms el dibujo de antes; la orgánica tiene 2,8 veces los
  triángulos de antes (103.700 contra 37.500; 3,0 veces con la semilla que dio más).

## 8. Red

- La semilla de la malla sale de la que ya viaja en `MatchInit`.
- Un ajuste de la partida dice si el terreno es orgánico o cuadrado.
- `MatchInit` lleva una huella de la malla del host. El cliente la compara con la suya al armarla y, si difieren,
  avisa: jugar con mallas distintas es caminar sobre piso que el host no ve.

### Cómo quedó (tarea 14)

- **El ajuste** es `MatchSettings.organic`. La tarea 14 lo dejó apagado y sin botón; desde la tarea 17 viene prendido y la sala tiene la
  opción "Terreno: Orgánico / Cuadrado" (`LOBBY_OPTIONS.organic`, la toca el host). Una copa arma una malla nueva en cada pista.
- **Quién arma la malla.** `new Terrain(mapId, { organic, seed })`. La simulación (`Simulation`) usa la semilla de la
  partida (`SimConfig.seed`, que es `MatchInit.seed`); la vista del host y la de cada cliente (`GameView`, con
  `ViewOptions.organic` y `.seed`) usan la de `MatchInit`; la vitrina del menú, la suya. Arena y Asedio piden la malla
  espejada (`isMirrored`). Si la orgánica no pasa su comprobación en cinco semillas, la partida usa la cuadrada y deja un
  aviso en la consola (`Terrain.meshFellBack`).
- **La huella** viaja en `MatchInit.mesh` (`TerrainMesh.hash`). El cliente la compara al armar su vista
  (`MatchRunner.checkMesh`) y, si no coincide, lo dice en pantalla y en la consola. `PROTOCOL_VERSION` subió a 19.
- **Lo que suponía que el piso termina donde termina la celda del plano**, revisado:
  - *Puertas de la Carrera:* `Gate.cells` sigue siendo la franja real (reaparecer, medir el avance) y `Gate.detect` es la que
    cuenta para saber si alguien la pasó; con la orgánica suma las celdas de vacío del plano pegadas a la puerta.
  - *Carriles de bolas:* con la orgánica `GadgetSpawn.len` se mide caminando el piso real desde el lanzabolas (en pasos de
    10 cm, afinando el borde al milímetro); con la cuadrada sigue contando celdas, así que no cambia nada.
  - *Losa que se rearma:* "hay alguien encima" mira la caja de la losa real (`Terrain.slabBounds`: todas las celdas de la malla que
    salieron de esa celda frágil) y no la de la celda del plano.
  - *Salidas y reapariciones:* son centros de celda del plano, que la regla de §2 deja siempre sobre piso. La excepción eran los
    héroes que no entran en los puntos de salida y aparecen 0,95 m al costado (`Simulation.spawnPoint`): con la orgánica, si ese
    lugar no tiene un piso parejo con el del punto o está tapado, salen en el punto.
  - *Bots y zombis:* caminan de centro a centro del plano y siguen sirviendo sin cambios (medido en la tarea).
- **Costo.** En la orgánica `cellsNear` probaba la forma de todas las celdas de alrededor y se llevaba la mitad del tiempo de una
  partida de Horda (3 veces más lenta que la cuadrada). Ahora `blockAt` y `contacts` le piden solo las celdas más altas que los
  pies del cuerpo (`cellsNear(..., above)`), cada balde del índice recuerda la celda más alta que tiene (`bTop`) y los baldes pasaron
  de 2 m a 1 m; las celdas llevan sus lados precalculados. Quedó en +15 % sobre la cuadrada.
- **Cómo se mide:** `npm run tool:race`, `tool:horde`, `tool:stuck` y `tool:mesh` arman la malla orgánica (desde la tarea 17; con `--square` arman
  la cuadrada, para comparar). `tool:mesh` corre Arena y Asedio con bots, mide la simetría de la malla de cada mapa y imprime la huella de
  cada mapa con cinco semillas.

## 9. Lo que no entra

- Un editor de mapas sobre la malla. Los mapas se siguen escribiendo como planos.
- Generadores de mapas por juego: son las tareas 24 y 25.
- Celdas de la malla con cara inclinada. Las pendientes son piezas (rampas).

## 10. Cómo salió: los números (tarea 17)

Medido con herramientas sin pantalla (`npm run tool:*`) y scripts descartables sobre los diez mapas; ya no hay tests que lo vuelvan a comprobar.

### Armarla

Cien semillas al azar por mapa, en Node (`new Terrain(mapa, { organic: true, seed })`, que incluye generar, estampar y comprobar):

| Mapa | Plano | Celdas de la malla (cuadrada → orgánica) | Armarla: mediana · p95 · máx |
|---|---|---|---|
| La Cantera | 44×30 m | 298 → 1.416–1.478 | 4 · 8 · 26 ms |
| El Islote | 28×22 m | 126 → 590–636 | 2 · 3 · 3 ms |
| El Flipper | 48×26 m | 264 → 1.248–1.312 | 3 · 6 · 12 ms |
| El Refugio | 60×30 m | 398 → 1.918–1.969 | 7 · 10 · 12 ms |
| La Pista | 164×18 m | 362 → 1.724–1.785 | 10 · 17 · 19 ms |
| El Serpentín | 88×50 m | 682 → 3.272–3.358 | 20 · 29 · 42 ms |
| La Bolera | 100×64 m | 445 → 2.137–2.201 | 22 · 30 · 46 ms |
| El Derrumbe | 72×58 m | 567 → 2.719–2.789 | 16 · 20 · 34 ms |
| El Puente | 120×42 m | 486 → 2.326–2.408 | 13 · 15 · 31 ms |
| Las Dos Cornisas | 120×58 m | 694 → 3.318–3.446 | 18 · 21 · 29 ms |

La malla cuadrada tarda 0 a 2 ms. El costo es de unos 3 a 5 ms por cada 1.000 m². De 1.000 semillas, **ninguna cayó a la cuadrada**: la comprobación del estampado pasó al primer intento todas las veces. En 32 el generador (`mesh.ts`) tuvo que pasar a la semilla siguiente (La Bolera 7 de 100, El Refugio 5, Las Cornisas 4, El Derrumbe 4, El Puente 6, el resto 0 a 2), así que dos semillas contiguas pueden dar la misma malla (a una partida real con semilla al azar no le pasa).

### Los pasos angostos

Ciento veinte semillas por mapa. Para cada par de celdas vecinas de piso o rampa del mismo nivel se camina el segmento entre sus centros y se mide el piso de lado a lado, perpendicular al segmento (hasta 2 m a cada lado). Se cuentan los pasos que alguna vez midieron menos de 3,9 m:

| Mapa | Ancho de piso: más angosto · p1 · p5 · mediana (m) | Dónde |
|---|---|---|
| La Cantera | 0,96 · 1,60 · 2,00 · 2,68 | los pasos de la primera y la última fila de plataformas (columnas 1-2 y 19-20) |
| El Islote | 0,92 · 1,48 · 2,00 · 2,76 | las puntas de la isla (columnas 3-4 y 9-10, filas 0 y 10) |
| El Flipper | 2,00 · 2,00 · 2,32 · 2,72 | – |
| El Refugio | 2,00 · 2,00 · 2,36 · 2,68 | – |
| La Pista | 1,04 · 1,36 · 2,36 · 2,64 | el recodo de la columna 40 |
| El Serpentín | 0,96 · 1,64 · 2,36 · 2,60 | la bajada de la columna 30 (filas 5 a 10) |
| La Bolera | 0,92 · 1,36 · 2,32 · 2,60 | el callejón de las columnas 5 a 7 (filas 26 a 30) |
| El Derrumbe | 0,96 · 1,88 · 2,36 · 2,60 | la columna 6 (filas 7 a 12) |
| El Puente | 1,12 · 1,92 · 2,40 · 2,64 | – |
| Las Dos Cornisas | 0,88 · 1,08 · 1,64 · 2,60 | las líneas de afuera (fila 14, columnas 16 a 41) |

**Ningún paso quedó angosto de verdad**: en las 120 semillas de los diez mapas el piso más angosto fue de 0,88 m (el cuerpo mide 1 m, pero lo que tiene que estar sobre el piso es su centro), y el que baja de 1,2 m lo hace en una de cada tres semillas como mucho. Por eso **no se ensanchó ningún puente del plano**. Una zanja de una celda mide entre 1,0 y 3,1 m de vacío (en La Bolera, El Derrumbe y El Puente, que son los que tienen), y un salto de la Carrera cubre unos 4,4 m corriendo. Las reglas para quien dibuja un plano están en la leyenda de `src/core/maps/index.ts`.

### Partidas de bots

Las mismas mediciones de la tarea 14, con el terreno orgánico de entrada (`npm run tool:*`; cada partida es otra malla):

| | Cuadrada | Orgánica |
|---|---|---|
| Carrera: llegan todos, de 30 carreras por pista (pista / serpentín / bolera / derrumbe) | 29 / 28 / 30 / 30 | 30 / 27 / 28 / 30 |
| Carrera, 60 carreras más (nivel 2) en serpentín / bolera | 58 / 60 y 60 / 60 | 56 / 60 y 59 / 60 |
| Carrera: puertas que alguien cruzó sin que se le contara | 0 | **0** |
| Horda, 20 partidas por dificultad: victorias (Fácil / Normal / Difícil) | 19 / 13 / 5 | 16 / 11 / 3 |
| Horda, 10 partidas por dificultad, tres veces: ms por segundo simulado (Fácil / Normal / Difícil) | 2,44 / 2,86 / 3,06 | 3,18 / 3,34 / 3,53 (+31 % / +17 % / +15 %; **+20 %** en total) |
| Horda, `tool:stuck` (20 partidas): zombis reubicados por trabados / segundos sin avanzar | 0 / 0,57 % | 10 (0,10 %) / 0,41 % |
| Arena (3 mapas) y Asedio (2), 5 semillas: terminan | 25 / 25 | 25 / 25 |
| Asedio: el esbirro que más se acercó a una torre rival | – | 0,0 a 0,7 m |
| Mapa simétrico: celdas de la malla sin gemela, 5 mapas × 5 semillas | – | **0** |
| Héroes que caen al vacío donde aparecieron en los 3 s siguientes | 0 | **0** (de unas 2.200 apariciones) |
| Mallas que cayeron a la cuadrada por fallar la comprobación | – | 0 |

El costo de la orgánica en la Horda es el de probar celdas de 1 m en vez de una caja de 2 m por cada cuerpo (en la tarea 14 quedó en +15 %; el borde de lo que pedía, +25 %, lo pasa Fácil, que tiene menos zombis y por eso pesa más lo fijo). En números absolutos, el simulador entero cuesta unos 0,055 ms por tick de 16,7 ms: no se nota.

Los bots que no llegan en El Serpentín y La Bolera (1 a 4 de 60) son de dos clases, las dos también con la cuadrada: se quedan dando vueltas sin trabarse, o caen una y otra vez en el mismo lugar (el mismo bot, junto a un paragolpes de la segunda recta del Serpentín). La orgánica no los multiplica de forma que se note con esta muestra (56 contra 58 de 60 en El Serpentín). En la Horda la orgánica gana algo menos en Fácil y Difícil y más en Normal que la cuadrada, dentro de la banda de la tarea 04 en Normal y en el borde en Fácil (16 de 20 con la orgánica): con 20 partidas por dificultad no se distingue de ruido.

### Dibujar

Triángulos del terreno solo (sin decoración, personajes ni fondo), con una semilla:

| | Cuadrada | Orgánica de la tarea 15 | Orgánica de la tarea 17 |
|---|---|---|---|
| La Cantera | 14.520 | 32.912 | 17.046 |
| El Refugio | 16.768 | 38.705 | 19.590 |
| La Pista | 18.244 | 49.875 | 24.779 |
| El Puente | 26.892 | 75.764 | 35.778 |

La orgánica de la tarea 15 llevaba 2,3 a 2,8 veces los triángulos de la cuadrada y, en un teléfono emulado (844×390, render por software
en Edge, bots, sin otra cosa corriendo), entre 12 y 21 % menos cuadros por segundo y la calidad automática bajaba sola. Una esquina cada metro
hacía que el borde llevara el doble de puntos por metro, y cada celda de 1 m era un abanico de cuatro triángulos. La tarea 17 lo bajó a
1,2 a 1,4 veces con dos cambios en `terrainShape.ts` que casi no se ven y que solo valen para la orgánica:

- **El borde lleva menos puntos.** Un quiebre de menos de 0,3 rad (17°) sigue derecho y un arco no tiene tramos de menos de 0,3 m
  (`MIN_TURN_ORG` y `ARC_LEN_ORG`). El borde queda un poco más anguloso.
- **Una celda sin recortes ni puntos de más son dos triángulos** y no el abanico de cuatro desde el centro.

El dibujo no se aparta más del piso real que antes (los vértices más lejanos siguen a la misma distancia, y ningún centro de celda quedó sin su cara
dibujada: 0 de 59.901 en los diez mapas con tres semillas). Con la cuadrada no cambia nada.

Cuadros por segundo en el teléfono emulado (844×390, tres partidas por mapa y por malla, intercaladas; con una malla y con la otra):

| | Cuadrada | Orgánica (tarea 15) | Orgánica (tarea 17) | Triángulos de toda la escena (cuadrada → orgánica) |
|---|---|---|---|---|
| La Cantera | 33,3 | 28,3 | 33,2 | 40.0 mil → 42,3 mil |
| El Refugio | 31,9 | 27,2 | 31,0 | 47,5 mil → 50,8 mil |
| La Pista | 46,8 | 36,0 | 44,6 | 41,7 mil → 48,5 mil |
| El Puente | 30,1 | 23,2 | 29,1 | 67,8 mil → 74,2 mil |

La calidad automática (baja un escalón si pasa unos segundos por debajo de 28 cuadros) no bajó en ninguna de las 12 partidas de cada malla; con la
orgánica de la tarea 15 bajaba en las dos partidas de El Puente, que es el mapa que más cerca anda del límite, y en una de El Refugio. (La columna de la
tarea 15 es de otra tanda de mediciones, con la cuadrada en 33,5, 30,8, 45,5 y 29,1.)

### Red

Host y cliente en dos pestañas, copa de tres pistas (La Pista, El Serpentín, La Bolera), una malla nueva en cada pista, seis corridas (18 pistas): la huella de la malla de la simulación del host, la de su vista, la de `MatchInit` y la de la vista del cliente es la misma en todas, el cliente no avisa y las tres huellas de cada copa son distintas entre sí. En las dos últimas corridas (con el recorrido ya ajustado para no salirse del piso) el cliente corre unos 13 m junto a la costa en cada pista, a 0,05 a 1 m del vacío, sin caerse, y su predicción lo corrige como mucho 0,013 m por cuadro. Las únicas correcciones de más de 0,3 m (0,35 m por cuadro) son las de El Serpentín a menos de 8 m de un acelerador: el envión lo pone el host y el cliente no lo predice. Pasa igual con la cuadrada (no es de la malla).
