# Malla irregular: diseño

> Estado: **plan**, con lo ya hecho anotado en los "Cómo quedó" (tareas 10 a 16). Es la referencia de las tareas 10 a 17 de
> [docs/tareas](tareas/README.md). Reemplaza la nota "quedó afuera a propósito" de [TERRENO.md](TERRENO.md) §6. Cuando la
> tarea 17 termine, este documento pasa a describir lo que hay.

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
borde de la plataforma ya coincide con la línea alta. Es el mismo código por un camino trivial, y es lo que el
juego usa hasta que la orgánica esté validada.

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
- **Esquinas.** En cada vértice del contorno se mira cuánto gira. Menos de unos 11°: sigue derecho. Si no, y el vértice no es de los que
  no se cortan, una **saliente** (gira hacia adentro) se corta con un arco tangente de 0,31 del lado más corto (tope `R_OUT`) y una
  **entrante** se rellena con un arco de 0,2 (tope `R_IN`). Una esquina viva parte el borde en dos y apaga el relieve del acantilado
  a 0,8 m de ella. En la cuadrada (lados de 2 m) los radios son los de siempre; en la orgánica (lados de 1 m) las esquinas salen de
  unos 0,3 m y el relleno de 0,2 m.
- **Cara de arriba.** Cada celda de la capa es un abanico desde su centro. A la celda que toca una esquina saliente cortada se le recorta
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

- **El ajuste** es `MatchSettings.organic` (apagado por defecto, sin botón en la sala: se prende desde la consola con
  `__rubble.session.setSettings({ organic: true })` o en un script con `settings: { ..., organic: true }`).
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
- **Cómo se mide:** `npm run tool:race`, `tool:horde` y `tool:stuck` aceptan `--organic`; `npm run tool:mesh [--organic]` corre Arena y
  Asedio con bots, mide la simetría de la malla de cada mapa y imprime la huella de cada mapa con cinco semillas.

## 9. Lo que no entra

- Un editor de mapas sobre la malla. Los mapas se siguen escribiendo como planos.
- Generadores de mapas por juego: son las tareas 24 y 25.
- Celdas de la malla con cara inclinada. Las pendientes son piezas (rampas).
