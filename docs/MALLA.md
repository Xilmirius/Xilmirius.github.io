# Malla irregular: diseño

> Estado: **plan**. Es la referencia de las tareas 10 a 17 de [docs/tareas](tareas/README.md). Reemplaza la nota
> "quedó afuera a propósito" de [TERRENO.md](TERRENO.md) §6. Cuando la tarea 17 termine, este documento pasa a
> describir lo que hay.

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

## 6. Colisión

Hoy el movimiento prueba un eje por vez contra cajas alineadas (`moveAxis` en `src/core/movement.ts`). Con paredes
en cualquier ángulo eso se traba. Pasa a **mover y deslizar**:

- Se avanza el paso completo y se busca contra qué quedó encimado el círculo del cuerpo: celdas de la malla más
  altas de lo que puede subir, rampas y obstáculos.
- Por cada contacto se saca al cuerpo por el camino más corto, que da una **normal** y una profundidad. A la
  velocidad se le quita la parte que va contra la normal; un cuerpo lanzado rebota contra esa normal.
- De cada celda solo cuentan los **lados expuestos**: los que dan a una celda que no bloquea. Así una pared hecha
  de muchas celdas se comporta como una sola superficie y el cuerpo no se engancha en las juntas.
- Las normales reemplazan a los "chocó en X / chocó en Z" en todo lo que los usa: el golpe contra una pared, el
  rebote de Gloop, atravesar una cobertura rota, trepar un borde.

Mejora de paso algo de hoy: contra la esquina de una caja el cuerpo ahora la rodea en vez de frenarse.

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

## 8. Red

- La semilla de la malla sale de la que ya viaja en `MatchInit`.
- Un ajuste de la partida dice si el terreno es orgánico o cuadrado.
- `MatchInit` lleva una huella de la malla del host. El cliente la compara con la suya al armarla y, si difieren,
  avisa: jugar con mallas distintas es caminar sobre piso que el host no ve.

## 9. Lo que no entra

- Un editor de mapas sobre la malla. Los mapas se siguen escribiendo como planos.
- Generadores de mapas por juego: son las tareas 24 y 25.
- Celdas de la malla con cara inclinada. Las pendientes son piezas (rampas).
