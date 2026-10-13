# 23 · Horda: un mapa grande, con cosas en el camino

## Qué pidió el usuario

"El mapa más grande así las misiones tienen más sentido y con más props en el mapa."

El Refugio mide 30×15 celdas: las zonas de misión quedan a pocos pasos una de otra y "ir a la antena" no es un
viaje. Y casi no hay con qué cubrirse ni qué rodear.

## Qué hacer

### El mapa

Un mapa nuevo de Horda (`kind: 'horde'`) de unas 64×44 celdas, que pasa a ser el de entrada del juego. El Refugio
queda como el mapa corto.

- **Barrios.** Cinco o seis zonas reconocibles (por ejemplo: el refugio de salida, una calle comercial, un
  estacionamiento, una planta con pasarelas, una plaza, un muelle), unidas entre sí por al menos dos caminos cada
  una. Ningún lugar con una sola entrada donde haya que estar parado para cumplir una misión.
- **Altura.** Al menos dos lugares elevados con rampa (tarea 20). Con el apuntado en altura (tarea 06), subirse
  rinde.
- **Lugares de misión.** Bastantes puntos de zona (`z`) como para que la cadena de misiones no repita lugar, cada
  uno en un barrio distinto.
- **Anchos:** calles de tres celdas o más; pasillos de dos. Respeta las reglas de los planos de
  [MALLA.md](../MALLA.md).

### Cosas en el camino

Hoy lo único con cuerpo es la cobertura que se rompe y los barriles. Hace falta lo que **no** se rompe:

- Una clase nueva de obstáculo fijo del mapa: autos, un camión o contenedor, bloques de hormigón, vallas, cajas
  apiladas. Cada uno con su tamaño en planta (una o dos celdas, girado de a cuartos de vuelta) y su altura.
- **La altura decide para qué sirve:** lo bajo (una valla) frena el paso y deja pasar las balas; lo mediano (un
  bloque, un auto) frena las balas a la altura del pecho y se puede saltar encima para disparar desde arriba; lo
  alto (un contenedor) tapa la vista y las balas y no se sube.
- Se escriben en el plano en una capa propia (como las alturas de la tarea 20), con su leyenda.
- Son obstáculos como los demás para todo el juego: el movimiento choca con ellos, las balas los respetan según su
  altura y los zombis los rodean (el grafo de la tarea 07 los ve solo). No cambian durante la partida, así que el
  cliente los arma desde su copia del mapa.
- Se dibujan con las piezas de `src/render/pieces.ts`, con el estilo de la ambientación de la Horda, y entran al
  catálogo de assets.

### Que el tamaño no rompa el juego

`src/core/horde.ts` elige lugares pensando en un mapa chico:

- **De dónde salen los zombis** (`spawnCell`): hoy, de cualquier borde a más de 9 m. En un mapa grande eso es a 60 m
  o al lado. Pasan a salir de **bocas** marcadas en el plano (alcantarillas, portones) además de los bordes,
  eligiendo las que están entre 16 y 32 m del héroe más cercano.
- **Dónde va cada misión:** la zona siguiente (`pickPoint`), los nidos (`placeNests`) y los bidones (`spread`) hoy
  buscan "lo más lejos posible". Pasan a buscar una distancia de viaje razonable: entre 30 y 70 m del equipo.
- **Saber adónde ir.** Un minimapa (el del Asedio, `src/ui/minimap.ts`, generalizado) con el equipo, el objetivo,
  las mini bases y las cajas; y una flecha en el borde de la pantalla con los metros que faltan cuando el objetivo
  no se ve.
- **Rendimiento:** es el mapa más grande del juego. Medir cuánto tarda en armarse y cuántos triángulos tiene
  contra El Refugio.

## Listo cuando

- Sin pantalla, con terreno orgánico y tres bots, 20 partidas por dificultad: la banda de victorias de la tarea
  04; una partida ganada dura entre 6 y 10 minutos. Anotar los metros que camina el equipo entre misión y misión.
- En esas partidas: los zombis reubicados por trabados siguen bajo el 1 %; ningún zombi sale a menos de 14 m de un
  héroe; ninguna misión cae a menos de 25 m ni a más de 80 m de donde estaba el equipo.
- La comprobación de la malla pasa con 100 semillas, y recalcular el campo de los zombis tarda menos de 4 ms.
- Con un script: una bala disparada a la altura del pecho pasa por encima de una valla y frena en un contenedor; un
  héroe se sube a un auto de un salto; un zombi rodea un camión.
- En pantalla: el minimapa y la flecha llevan al objetivo; capturas del mapa entero y de cada barrio en
  `tests/e2e/out` para el usuario.
- `docs/ZOMBIS.md` describe el mapa nuevo, las cosas en el camino y de dónde salen los zombis. El Refugio sigue
  jugable.
