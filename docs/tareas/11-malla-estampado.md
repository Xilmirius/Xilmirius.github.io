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

## Notas de ejecución

**Archivo nuevo:** `src/core/terrainMesh.ts` (importa `mesh.ts`, `constants` y `terrain`; no cambia nada del juego). API:
`buildSquareMesh(terrain)`, `buildOrganicMesh(terrain, seed)` → `{ mesh | null, seed, attempts, problems }`, `stampOrganic` (una semilla,
sin comprobar), `checkTerrainMesh(terrain, mesh)` → lista de problemas, `isMirrored`. `TerrainMesh` tiene por celda centro, radio,
clase (`MESH_FLOOR`/`MESH_WALL`), nivel, `src`, `slab` (índice de `Terrain.fragile`), `pad`, `lowered` y vecina por cada lado, más
`ramps` (`RampPiece`: cuña, descanso, celdas bajadas) y `hash`. Consultas: `cellAt`, `cellsNear(x, z, r, out)`, `surfaceAt` (cuña →
rampa de abajo, descanso → piso de arriba, si no la celda), `rampAt`. Cómo quedó, en [MALLA.md](../MALLA.md) §4.

**Lo que quedó distinto del plan**

- **Se retocó La Cantera (aprobado por el usuario).** Sus cuatro rampas estaban pegadas al costado de la plataforma (la regla de
  §4 las prohíbe y la comprobación las rechazaba siempre). En las filas 3 y 11, `^1111^` pasó a `^.11.^` y `v1111v` a `v.11.v`:
  la celda de plataforma que tocaba cada rampa pasó a piso llano. Es lo único que cambió de un mapa.
- **Celdas de la esquina.** Además de la franja de llegada de MALLA.md, baja toda celda de la plataforma que asoma en la esquina de
  la cuña y entra en ella a más de 0,5 m de la línea alta. Sin esto, 6 de cada 20 semillas de El Refugio y 6 de El Islote no pasaban.
- **Borde lejano del descanso:** se prueba en tres puntos del medio (a 0,25 m del eje de la rampa), no a todo lo ancho. Con una rampa
  pegada a un costado de la plataforma, o con un ensanche sobre una plataforma más corta, el borde irregular de la plataforma se
  mete hasta 0,7 m y la comprobación fallaba por nada (La Cantera retocada: 29 de 100 a lo ancho, 93 de 100 a 0,5 m del eje, 199 de 200 a 0,25 m).
- **Pozo:** una celda bajada cuenta como pozo si asoma más de 0,25 m fuera de la cuña y el descanso (antes pasaba a pozo por 1 cm).
- **Espejo:** un centro justo sobre el borde de dos celdas del plano se resolvía distinto en las dos mitades (2 celdas en El Puente, 4 en
  Las Dos Cornisas). Ahora se mira `|x|` y a la gemela se le da la celda espejada.
- El **descanso mide 2 m** (una celda del plano) más allá de la línea alta; en la primera versión medía 4 por un error.

**Listo cuando** (script descartable)

| | |
|---|---|
| Cuadrada: `cellAt` coincide con `Terrain.cellIndexAt` en 10.000 puntos al azar por mapa (vacío = ninguna celda), y la comprobación pasa | pasa en los diez mapas |
| Orgánica, 100 semillas por mapa: comprobación a la primera semilla | 100 de 100 en nueve mapas; 99 de 100 en La Pista (un pozo); nunca se agotan los cinco intentos |
| Misma semilla, misma huella en dos corridas, y otra semilla da otra huella | pasa (El Islote es tan chico que dos semillas seguidas a veces terminan en la misma malla: el generador se salta la que no pasa su revisión) |
| `cornisas` (el mapa más grande) con la comprobación incluida | mediana 10 ms, peor 13 ms (15 corridas); lo más lento es `bolera`, 28 ms de mediana |
| Arena y Asedio: cada celda tiene su gemela con la clase, el nivel, el resorte, la losa y la `src` espejados | pasa en los cinco (`cantera`, `islote`, `flipper`, `puente`, `cornisas`) |

Segunda corrida de 100 semillas por mapa (otras semillas): 100 de 100 a la primera en los diez, así que el 99 de La Pista es azar.

**Para mirar:** ocho SVG en `tests/e2e/out` (`estampado-{cantera,pista,refugio,puente}-{a,b}.svg`). Gris = muro, rosado = losa frágil,
verde = resorte, violeta = celdas bajadas por la franja de llegada, azul = cuña, naranja punteado = descanso; la línea blanca punteada
es la grilla del plano.

**Pendiente de que lo mires:** cómo se ven las rampas sobre el borde irregular (los SVG), y el retoque de La Cantera. Las otras tres
con rampa (`islote`, `flipper`, `refugio`) y `pista` ya cumplían la regla de los costados.
