# 10 · Generador de la malla irregular

Primera pieza de la malla. Es un archivo nuevo y puro: no toca nada del juego, así que puede avanzar a la par de
las tareas 01 a 07.

**Leer antes:** [docs/MALLA.md](../MALLA.md) §1 a §3.

## Qué construir

Un módulo en `src/core` que, dada una región y una semilla, devuelve una malla de cuadriláteros irregulares:

- **Entrada:** el rectángulo a cubrir (en metros), el lado buscado (1 m), la semilla y si va espejada sobre `x = 0`.
- **Salida:** los vértices (x, z) y los cuadriláteros (cuatro índices de vértice cada uno, todos en el mismo
  sentido de giro, que queda documentado en el módulo).

El algoritmo es el de MALLA.md §3: trama de triángulos, apareo al azar, subdivisión, relajado, redondeo.

### El relajado

En cada vuelta, para cada cuadrilátero:

1. `c` es el promedio de sus cuatro vértices y `d0..d3` los vectores de `c` a cada uno.
2. Se gira `d1` un cuarto de vuelta hacia atrás, `d2` media vuelta y `d3` tres cuartos, para que los cuatro
   apunten como `d0`, y se promedian: sale `a`. Un cuarto de vuelta es intercambiar las coordenadas y cambiar un
   signo.
3. Para emparejar tamaños, el largo de `a` se acerca a medio camino del largo ideal (media diagonal de un
   cuadrado de 1 m de lado).
4. El lugar ideal de cada vértice es `c` más `a` girado de vuelta. La diferencia con donde está es su tirón.

Cada vértice se mueve la mitad del promedio de los tirones que recibió. Los del borde de la trama quedan fijos; la
trama cubre 3 m más que la región para que esa rigidez quede afuera.

### El espejo

Para que `x = 0` sea una línea de la trama, los triángulos se orientan con un lado vertical. Se genera la mitad
`x ≥ 0`: los triángulos solo se aparean con vecinos de su mitad, y los vértices del eje se relajan moviéndose
únicamente a lo largo de él. La otra mitad es la copia con `x` cambiado de signo.

### Determinismo

Las operaciones permitidas y por qué están en MALLA.md §3. Es la restricción más fácil de romper sin darse cuenta.

## Listo cuando

Con un script descartable, sobre 200 semillas y tres regiones (20×20 m, 164×18 m y 130×90 m), con y sin espejo:

- cada malla pasa la revisión de MALLA.md §3 (convexos, ángulos, lados, radio menor que 0,97 m) y no tiene
  cuadriláteros dados vuelta (área con signo positiva en todos);
- todo punto de la región cae dentro de exactamente un cuadrilátero (10.000 puntos al azar por malla; los que caen
  justo sobre un lado no cuentan);
- la misma semilla da los mismos arreglos, número por número, en dos corridas;
- en las espejadas, cada vértice tiene su gemelo exacto;
- el generador no usa ninguna función fuera de las permitidas (se comprueba leyendo el archivo);
- la región de 130×90 m se genera en menos de 80 ms.

Y para mirar: el script escribe un SVG por malla. Dejar seis en `tests/e2e/out` (dos por región, una espejada)
para que el usuario vea cómo quedan las celdas.

## Notas de ejecución

**Archivo nuevo:** `src/core/mesh.ts` (solo importa `Rng`). `generateMesh({ region, seed, mirror?, side? })` devuelve `QuadMesh`:
`vx`, `vz` (`Float64Array`), `quads` (`Int32Array`, cuatro índices por cuadrilátero), `seed` (la que pasó la revisión) y `attempts`.
También exporta `checkMesh`, `checkQuad`, `quadArea`, `meshQuadCount` y `buildMesh` (una semilla, sin revisar: para herramientas).
Sentido de giro: el que lleva de +x hacia +z (área con signo positiva); está documentado arriba del archivo. En las espejadas la región
tiene que ser simétrica y se genera `x ≥ 0` con los vértices del eje deslizando solo en `z`.

**Lo que quedó distinto del plan**

- El plan decía apareo al azar y relajado como en MALLA.md §3; con eso, **ninguna semilla pasaba la revisión** (ni a 20×20). La causa
  son los vértices de la trama sin ninguna diagonal (seis cuadriláteros de 60°, radio de 1,0 a 1,1 m) y, después, los que quedan al lado
  de un vértice de valencia 5. Se agregaron una **reparación del apareo** y un **peso extra a los cuadriláteros que van mal** en el
  relajado; los dos están explicados en MALLA.md §3. Un apareo perfecto (sin triángulos sueltos) también se probó y se descartó: sale una
  grilla cuadrada perfecta.
- El **largo de `a`** se acerca a medio camino del ideal, como pedía el plan. El ideal sale del área real de la trama repartida entre
  los cuadriláteros (no de un lado de 1 m justo): da un radio ideal de 0,66 m en vez de 0,71.
- La malla devuelta es **solo lo que toca la región**; la franja de 3 m de margen se usa para generar y se descarta. La arista de 1 m
  que asoma más allá de la región no hace falta guardarla: lo que cae fuera del plano es vacío igual.

**Listo cuando** (script descartable, 200 semillas × 3 regiones × con y sin espejo = 1.200 mallas)

| | |
|---|---|
| Revisión (convexos, 35° a 145°, lados > 0,35 m, radio < 0,97 m) y área con signo positiva | pasa en las 1.200 |
| 10.000 puntos al azar por malla (20 por región y modo): cada uno cae en exactamente un cuadrilátero | pasa |
| Misma semilla, mismos arreglos número por número (20 por región y modo) | pasa |
| Espejadas: cada vértice y cada cuadrilátero con su gemelo exacto (40 por región) | pasa |
| El archivo solo usa `sqrt`, `floor`/`ceil`/`round`/`abs`/`min`/`max` y el `Rng` (se comprobó leyéndolo, sin `**` ni trigonometría) | pasa |
| 130×90 m en menos de 80 ms | mediana 43 ms, peor 61 ms sin espejo; 23 y 45 ms espejada (máquina lenta, contando las semillas de más) |

Semillas que hubo que probar: de 1.200 mallas, 1.159 a la primera, 37 a la segunda y 4 a la tercera. Una malla de 130×90 m tiene unos
14.600 cuadriláteros, y de 164×18 m unos 3.900. De la primera semilla de 130×90 pasan 34 de 40 (sin espejo) y 34 de 40 (espejada).

**Para mirar:** seis SVG en `tests/e2e/out` (`malla-20x20-a`, `malla-20x20-espejo`, `malla-164x18-a`, `malla-164x18-espejo`,
`malla-130x90-a`, `malla-130x90-espejo`; los de 130×90 muestran un recorte). La línea punteada roja es la región; la azul, el eje del espejo.

**Pendiente de que lo mires:** si el grado de irregularidad te gusta (hay triángulos sueltos y esquinas de cinco cuadriláteros, pero entre
ellos las filas se ven bastante derechas). Se puede subir sacando de la reparación del apareo los casos menos graves, a costa de que
más semillas no pasen la revisión.

