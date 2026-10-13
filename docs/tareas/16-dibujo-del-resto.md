# 16 · Decoración, artefactos y minimapa siguen a la malla

**Leer antes:** [docs/MALLA.md](../MALLA.md) §5 y §7, y [docs/TERRENO.md](../TERRENO.md) §3.

Después de la tarea 15 el terreno orgánico se ve bien, pero lo que se apoya en él todavía se ubica con las cuentas
del plano: una pieza al borde de un muro queda en el aire si el muro real termina antes, la costa decorada no
sigue a la costa real, y el minimapa dibuja cuadrados.

## Qué hacer

La regla de MALLA.md §5: **qué va y dónde lo decide el plano; sobre qué se apoya lo decide la malla.**

- **Lectura del mapa** (`src/render/topology.ts`): hileras de muros, puentes y claros se siguen leyendo del plano,
  que es donde están las intenciones del mapa. Lo que cambia es la **costa**: los puntos de borde salen del
  contorno real de la capa del piso (lo deja disponible la tarea 15), con su normal, en lugar de salir de los
  lados de las celdas del plano.
- **Piezas de cada ambientación** (`src/render/ambience.ts`, `decorView.ts`): cada pieza se apoya en un punto de la
  malla que sea lo que espera. Una pieza de arriba de un muro se corre hacia el centro de su celda hasta quedar
  entera sobre el muro real; la pintura de un claro se achica hasta entrar en piso real; lo que cuelga del
  acantilado se cuelga del contorno. Lo que no encuentra dónde apoyarse no se pone.
- **Pasto, piedritas, flores y rocas del acantilado** (`DecorView`): se siembran sobre piso real (la altura sale de
  la malla) y las rocas asoman del contorno real.
- **Artefactos** (`src/render/gadgetsView.ts`):
  - las **puertas** de la Carrera hoy son un cuadrado pintado por celda del plano; pasan a ser una franja que
    cubre el piso real de lado a lado;
  - el **carril pintado** de las bolas y su punto de caída siguen el largo real (tarea 14);
  - el **resorte** se dibuja sobre el piso real en el centro de su celda.
- **Minimapa** (`src/ui/minimap.ts`): la capa fija dibuja los polígonos de la malla (piso, plataformas, muros,
  frágiles, huecos) en lugar de cuadrados del plano.
- **Fondo y suelo** (`backdrop.ts`, `ground.ts`): revisar que solo dependan de los límites del mapa.

Con la malla cuadrada todo tiene que quedar donde está hoy.

## Listo cuando

- **Cuadrada:** capturas de los diez mapas antes y después, lado a lado: la decoración no se movió.
- **Orgánica**, diez mapas con dos semillas: con un script descartable que recorre las piezas colocadas, ninguna
  pieza de arriba de un muro tiene su apoyo fuera del muro real, ninguna pintura de piso cae sobre vacío, y toda
  pieza de costa está a menos de 30 cm del contorno real.
- En las cuatro pistas orgánicas, la franja de cada puerta llega de un borde al otro del piso (captura de cada
  puerta desde arriba).
- El minimapa del Asedio coincide con el terreno: en 2.000 puntos al azar, "hay piso" en el minimapa y en la malla
  coinciden en al menos el 98 %.
- Capturas orgánicas de los diez mapas en `tests/e2e/out` para el usuario, con la decoración puesta.
- `docs/TERRENO.md` §3 dice de dónde sale cada cosa (plano o malla).
