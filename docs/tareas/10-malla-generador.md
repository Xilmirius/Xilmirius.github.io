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
