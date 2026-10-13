# 21 · Obstáculos nuevos para la Carrera

El usuario pidió "más mecánicas de obstáculos". Sin salto (tarea 03), los obstáculos se pasan esquivando, eligiendo
el momento o gastando el dash.

## Reglas para cualquier obstáculo nuevo

Son las que ya cumplen los rotores, los géiseres y las bolas (`src/core/gadgets.ts`):

- **Sale del mapa y del tick.** Su estado en un instante se calcula con el número de tick, como `rotorAngle`.
  Nada nuevo viaja en el snapshot.
- **Lo que empuja de forma continua se predice.** Una fuerza que actúa mientras se está encima o adentro tiene que
  vivir en `stepMove` o salir del terreno, como el resorte: si solo la aplica el host, el cliente se ve tironeado.
  Un golpe suelto (como el del rotor) lo puede dar el host.
- **Lo que es propiedad del piso** (hielo, cinta) se marca en la celda del plano y se consulta por la malla, igual
  que el resorte ([MALLA.md](../MALLA.md) §5).
- **Se pasa sin saltar**, y se ve venir: aviso antes de pegar.
- **Los bots lo entienden** (`BotBrain.decideRace` y sus caminos).
- **Tiene su pieza** en `src/render/gadgetsView.ts`, su sonido, y su entrada en el catálogo de assets
  (`src/assets/catalog.ts`, y después `npm run assets:doc`).
- Se escribe en el plano con un carácter libre y queda en la leyenda de `src/core/maps/index.ts`.

## Los obstáculos, en orden

Cada uno se puede terminar y commitear por separado dentro de la tarea.

1. **Hielo.** Celdas con poca tracción: cuesta frenar y doblar. Es terreno, así que se predice. El más simple, y
   cambia mucho un tramo con borde al vacío.
2. **Cinta.** Celdas que arrastran hacia un lado (cuatro direcciones) a unos 4 m/s. A favor es un atajo; en contra
   o de costado, un problema. Terreno, predicho.
3. **Ventilador.** Sopla a lo largo de una franja y empuja de costado. Se le gana caminando contra el viento; en
   el aire empuja más. Predicho.
4. **Martillo.** Un péndulo que barre un carril de lado a lado. Pega como el rotor (un golpe del host), pero deja
   un hueco de tiempo claro para pasar. Su sombra avisa.
5. **Barrera.** Un tramo de pared que sube y baja a ritmo fijo, con aviso antes de subir. Mientras está arriba
   tapa el paso. Es colisión que depende del tick: el host y el cliente la calculan cada uno con su tick.
6. **Plataforma móvil.** Va y viene entre dos puntos, sobre el vacío, y lleva a quien tiene encima. Es la difícil:
   el piso depende del tick y hay que arrastrar al cuerpo igual en el host y en la predicción
   (`docs/PLATAFORMA_Y_MODOS.md` §6 ya lo anota). Va última. Si no cierra con buena sensación en el cliente, se
   deja afuera, se anota por qué y se avisa al usuario.

Cada obstáculo se estrena en una de las pistas de hoy, en un tramo que ahora es liso, para poder probarlo. La
tarea 22 después los reparte.

## Listo cuando

Por cada obstáculo terminado:

- con dos pestañas, el cliente lo atraviesa y la corrección de su predicción no pasa de 0,4 m (0,8 m al subirse o
  bajarse de la plataforma móvil);
- sin pantalla, los bots de las tres dificultades pasan el tramo donde está, y la pista sigue en la banda de la
  tarea 03;
- una captura del obstáculo en la pista.

Y al final: `docs/CARRERA.md` §3 lista las piezas nuevas con sus números, el catálogo de assets está regenerado, y
las Notas de ejecución dicen qué obstáculos quedaron y cuáles no.
