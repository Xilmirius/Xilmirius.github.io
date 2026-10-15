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

## Notas de ejecución

**Archivos:** `src/render/support.ts` (nuevo: `Support`), `src/render/pieces.ts` (`base`, `framed` y el recorte de la pintura), `src/render/ambience.ts` (las cuatro ambientaciones), `src/render/decorView.ts`, `src/render/topology.ts` (`CoastSpot` suma el centro de su celda y si es de muro), `src/render/gadgetsView.ts` (puertas, carril, resortes), `src/render/terrainView.ts` (conos de abajo y neón de las rampas), `src/render/gameView.ts` (las partículas de una losa que se rompe), `src/ui/minimap.ts`, `src/core/rng.ts` (`state`), `tests/e2e/maps.mjs`, `docs/TERRENO.md` (§1, §3, §5, §6), `docs/MALLA.md` (§5 "Cómo quedó"), `docs/decisiones-web.md` (DW-57) y la línea de `render/` del `README.md`. Nada de `src/core` salvo `Rng.state`, y nada de la red.

**Lo que quedó distinto del plan**

- **La costa sale de la malla, no de `TerrainShape.contours`.** El plano sigue diciendo qué lado de qué celda da al vacío (`CoastSpot`), pero el punto, la altura y la normal salen de recorrer la malla desde el centro de la celda hasta el borde real (`Support.edgeAt`). Los contornos de la tarea 15 tienen las esquinas cortadas (dibujan hasta unos 25 cm menos piso que el real) y las piezas tienen que apoyarse en el borde real. Con la cuadrada da el punto, la normal y la altura de antes (diferencia máxima 1,2·10^-5 m).
- **Las piezas de arriba de un muro se prueban en seco, no con una huella declarada a mano.** `Pieces.base` corre lo que arma una pieza sin ponerlo y devuelve los puntos de su base; `put` prueba que caigan sobre el muro real, la corre hacia el centro de la celda y, si hace falta, la achica hasta el 60 %. Para que probar no gaste números al azar hizo falta que `Rng` guardara y devolviera su estado (`state`): es lo único que cambia en `src/core`. Las piezas con partes sueltas (el mástil y sus neumáticos, el monolito y su cristal chico) se apoyan cada una por su lado.
- **La pintura se recorta en `Pieces`, no pieza por pieza.** Cualquier calco se achica alrededor de su centro hasta que todos sus vértices y el centro de cada triángulo caen sobre piso llano y firme del nivel de abajo; si tendría que achicarse a menos del 40 % no se pone. Los puentes, además, miden su ancho real para que los tablones, la rejilla y los galones lleguen de borde a borde.
- **La cuadrada no queda idéntica del todo: cuatro cambios a propósito.** (1) Los cristales de la costa de la Arena no se alejan más de 15 cm del borde hacia afuera (antes hasta 35): en La Cantera y El Flipper se mueven 16 vértices de cristales, hasta 3,1 cm. (2) La franja de una puerta es una pieza continua; antes eran cuadrados de 0,96 de la celda, con 8 cm entre uno y otro. (3) El carril de las bolas se arma de tramos de 25 cm (la misma cinta de 1,25 m). (4) El cartel de sponsor de la Carrera se acorta si el borde se curva a sus costados (en la cuadrada no pasa nunca).
- **Se sumaron tres cosas que la tarea 15 había dejado para esta aunque la ficha no las nombra:** los conos de abajo de la isla (cuelgan de piso real: si el desvío al azar cae afuera, van al centro de la celda), las tiras de neón del borde de una rampa (solo donde no hay nada más allá de la cuña: con la orgánica el piso de abajo puede seguir y ya trae su neón) y las partículas de una losa frágil que se rompe (salen de la caja de la losa real).
- **`backdrop.ts` y `ground.ts` no cambiaron:** solo dependen de los límites del mapa y de las líneas del Asedio (revisado).
- **`TerrainShape.contours` no lo usa nadie.** Queda disponible (la tarea 15 lo dejó probado).

**Listo cuando**

| | Resultado |
|---|---|
| Cuadrada: la decoración no se movió | Volcando la geometría de `DecorView` de los diez mapas antes y después: 8 mapas iguales (diferencia máxima 2·10^-5 m, mismas piezas); La Cantera y El Flipper difieren en los 16 vértices de cristales del cambio (1), hasta 3,1 cm. Capturas lado a lado en `tests/e2e/out/t16-lado-a-lado/` (los píxeles que cambian son los que se animan: fondo, bolas, personajes) |
| Orgánica, diez mapas × seis semillas: apoyo sobre muros | 3.924 piezas, 76.824 vértices de base: **0 fuera del muro real**. De 1.938 piezas (tres semillas): 920 se corrieron hacia el centro, 55 se achicaron y 96 (5 %) no encontraron dónde apoyarse y no se ponen |
| Orgánica: pintura de piso | 2.328 calcos, 38.916 vértices: **0 sobre vacío** |
| Orgánica: piezas de costa a menos de 30 cm del contorno | 7.192 piezas de la ambientación: el vértice más cercano está a 21,5 cm (p99) y 26,9 cm (máximo) del borde; las 3.174 rocas del acantilado, a 24,3 cm como mucho (p99 10 cm) |
| Orgánica: pasto, piedritas y flores | 36.989 instancias: todas sobre piso firme, con la altura de la malla |
| Orgánica: la franja de cada puerta de borde a borde | Las cuatro pistas con tres semillas y la cuadrada, con 4.000 puntos al azar por puerta: **0** puntos de piso sin cubrir y **0** cubiertos sin piso. Una toma de cada puerta en `t16-org-11` y `t16-org-2222` (`map-<pista>-10-puerta-N`) |
| Carril de las bolas sobre el piso | Cuadrada: 0 vértices fuera, ningún tramo angosto. Orgánica (Bolera, tres semillas): de ~2.600 vértices, 9 a 12 (0,4 %) quedan hasta 6 cm fuera de piso en la punta del carril; entre 49 y 78 tramos de 25 cm se angostan donde el piso es más angosto |
| Minimapa del Asedio ↔ malla | 2.000 puntos al azar por mapa (el centro del píxel que los contiene; "hay piso" = píxel casi opaco): Puente / Cornisas **99,0 % / 98,2 %** (orgánica, semilla 11), **99,5 % / 98,6 %** (2222) y **99,0 % / 99,0 %** (cuadrada). Con puntos cualquiera, no del centro del píxel, la semilla 11 da 98,7 % / 97,2 %: lo que se pierde es el borde, que mide menos que un píxel |
| Capturas orgánicas | `tests/e2e/out/t16-org-11/` (con la losa cayendo y caída) y `t16-org-2222/`; todo junto en `tests/e2e/out/t16-galeria.html` (cuadrada antes y después, y las dos semillas). Los minimapas, en `t16-minimapa/` |
| `docs/TERRENO.md` §3 | Dice de dónde sale cada cosa, plano o malla |

- **Costo.** Armar `DecorView` en Node: Puente 21 ms antes, 24 ms ahora con la cuadrada y 23 a 34 ms con la orgánica; Cornisas 26 a 32 ms antes, 31 ms con la cuadrada y 32 a 43 ms con la orgánica.
- **Pruebas.** `npm run typecheck` y `npm run build` sin errores. `tests/e2e/moba.mjs` y `tests/e2e/run.mjs` pasan. Las capturas de los diez mapas con la orgánica (dos semillas) no dieron errores de página.
- **Cómo se midió.** Con scripts descartables fuera del repo (no quedan tests): volcar la geometría de `DecorView` y `GadgetsView` antes y después; armar `DecorView` en los diez mapas con la orgánica registrando cada pieza que se arma; medir la base de las piezas contra `wall` y `paint`, y las de costa contra los lados de la malla que dan al vacío; cubrir las puertas con puntos al azar. `maps.mjs` ahora saca una toma de cada puerta (`10-puerta-N`) y el minimapa del Asedio (`11-minimapa`), e imprime cuánto coincide con el terreno.

**Qué mirar**

- **Cuánto se corren las piezas de los muros.** Casi la mitad de las piezas de arriba de un muro (almenas, barreras, bolsas de arena, neumáticos) se arriman hacia el centro de la celda porque el borde real del muro se retira, y 1 de cada 20 no se pone. Si una hilera se ve más rala que en la cuadrada, es eso. Las piezas del borde de un muro siguen alineadas con los ejes del plano aunque el borde real se tuerza hasta unos 30°.
- **Las piezas de un solo punto de apoyo** (torres, monolitos, mástiles) pueden verse hasta un 40 % más chicas que en la cuadrada cuando el muro real es angosto.
- **La costa y las rocas:** que cuelguen del borde sin separarse (la hiedra y las cadenas siguen el borde mata por mata).
- **Las puertas:** la franja es recta del lado del grosor y sigue el borde irregular del piso en el otro.
- **El minimapa:** el borde irregular se ve poco por el tamaño (230 px).
- **Lo que no sigue al borde real, a propósito:** el fondo y las islas lejanas.
