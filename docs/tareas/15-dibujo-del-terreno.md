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
