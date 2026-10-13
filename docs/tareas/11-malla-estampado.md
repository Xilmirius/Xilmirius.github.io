# 11 · El plano estampado sobre la malla

Segunda pieza de la malla. También es código nuevo que nadie usa todavía: lee un `Terrain` de hoy sin cambiarlo.

**Leer antes:** [docs/MALLA.md](../MALLA.md) §1, §2, §4 y §5.

## Qué construir

Un módulo en `src/core` que arma la **malla del terreno** de un mapa: celdas con forma, clase y vecinas, y las
consultas que después va a usar la física.

**Cada celda de la malla** tiene: sus vértices, la celda vecina por cada lado (o ninguna), su centro, la celda del
plano de la que salió (`src`), si es piso o muro y de qué nivel, a qué losa frágil pertenece (o ninguna) y si es
resorte.

**Dos formas de armarla**, con el mismo resultado hacia afuera:

- **Cuadrada:** un cuadrado por cada celda no vacía del plano. Sin generador.
- **Orgánica:** la malla de la tarea 10 sobre la región del mapa (espejada si el mapa es de Arena o de Asedio),
  estampada como dice MALLA.md §4.

**Consultas:**

- qué celda hay en un punto (ninguna si es vacío);
- qué celdas puede tocar un círculo (centro y radio), para la colisión;
- una huella de la malla (un número que cambia si cambia un vértice o una clase), para comparar host y cliente.

**Las rampas.** El plano marca celdas de rampa con una dirección. De cada una sale una pieza, como dice MALLA.md
§4 ("Rampas"): el rectángulo de la cuña, el descanso con sus ensanches, el nivel de abajo y el de arriba. En la
malla orgánica se baja la franja de llegada y se hace la limpieza. Esta tarea produce la lista de piezas; la
física de las rampas llega en la tarea 12.

**La comprobación** de MALLA.md §4, como una función que devuelve la lista de problemas (vacía si está todo bien).
Para ella, un punto que cae dentro de un descanso está al nivel de arriba de esa rampa.

- El centro de cada celda no vacía del plano cae en una celda de la malla que salió de ella.
- El radio de toda celda es menor que 1 m (solo en la orgánica).
- Entre cada par de celdas vecinas del plano de la misma clase y nivel, el segmento entre centros, recorrido de a
  10 cm, pisa siempre esa clase y ese nivel.
- Cada cosa del mapa (salidas, cobertura, artefactos, puntos de zona, torres, núcleos, campamentos) está sobre
  piso del nivel que esperaba.
- Ninguna rampa está embutida en una plataforma.
- Ninguna celda más alta que el nivel de abajo entra en una cuña más de 0,5 m antes de su línea alta.
- Toda celda bajada por una franja de llegada queda cubierta entera por la cuña y el descanso, o comparte un lado
  con piso de su mismo nivel. Si no, es un pozo.
- El borde lejano de cada descanso cae sobre celdas del nivel de arriba.

La orgánica prueba semillas sucesivas hasta que la comprobación pasa (cinco intentos) y dice cuál usó; si ninguna
pasa, lo dice, y quien la pidió usa la cuadrada.

## Listo cuando

Con un script descartable, sobre los diez mapas:

- **Cuadrada:** "qué celda hay en un punto" coincide con `Terrain.cellIndexAt` en 10.000 puntos al azar por mapa
  (salvo donde el plano tiene vacío), y la comprobación pasa.
- **Orgánica**, 100 semillas por mapa: la comprobación pasa con la primera semilla en al menos 95 de cada 100 y
  nunca se agotan los cinco intentos. Si un mapa no llega, anotar cuál y por qué: es un dato para el diseño.
- La misma semilla da la misma huella en dos corridas.
- Armar la malla orgánica de `cornisas` (el mapa más grande) tarda menos de 150 ms.
- En los mapas de Arena y Asedio la malla es simétrica: cada celda tiene su gemela con la clase espejada.

Y para mirar: un SVG por mapa con las celdas pintadas por clase (vacío, piso por nivel, muro, frágil) y las piezas
de rampa encima. Dejar en `tests/e2e/out` los de `cantera`, `pista`, `refugio` y `puente`, con dos semillas cada uno.
