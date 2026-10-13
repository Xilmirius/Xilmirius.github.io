# 03 · Carrera: sin salto, agarrar en vez de pegar y dash que tarda en volver

## Qué pidió el usuario

En la Carrera saltar "lo hace muy fácil" y los golpes sobran. Queda así:

| Entrada | Hoy | Queda |
|---|---|---|
| Clic izquierdo | Golpe básico del héroe | **Agarrar** al rival que se tiene adelante |
| Clic derecho | Empujón | Empujón (igual) |
| Espacio | Salto y segundo salto | Nada |
| Shift | Dash, vuelve en 1,3 s | Dash, vuelve en **5 s** |
| Cajas de ítems | Dan un ítem | Igual |

El dash pasa a ser el recurso que se administra: cruzar una zanja, abrir una pared o soltarse de un agarre.

## Reglas nuevas

Tres banderas en `Ruleset` (`src/core/rules.ts`), que solo la Carrera cambia:

- `jump` (hoy siempre hay salto): apagada en la Carrera.
- `dashCd`: segundos que tarda en volver el dash. 5 en la Carrera; en las demás, el valor de hoy (`DASH_CD`).
- `grab`: el botón de golpe agarra en vez de usar el básico del héroe.

El salto y el dash viven en `stepMove` (`src/core/movement.ts`), que también corre en la predicción del cliente:
las dos cosas entran por `MoveParams` y viajan en `MeFrame`, como ya viaja `dsh`. El casillero del dash en el HUD
tiene que llenar su reloj con la recarga de las reglas, no con la constante.

Los resortes, los géiseres y trepar un borde en el aire siguen igual: no son saltos.

## Agarrar

Como en Fall Guys: quien agarra frena al otro mientras lo sostiene, y también se frena.

- **Empieza** con el clic mantenido, el agarre disponible y un rival a no más de 1,7 m (entre centros), dentro de
  los 60° hacia donde se mira y a una altura parecida. Entre varios, el más cercano.
- **Mientras dura**, el agarrado se mueve al 25 % de su velocidad y el que agarra al 50 %. Los dos pueden girar y
  empujar. No suma heat.
- **Se corta** al soltar el clic, a los 1,5 s, si se separan más de 2,3 m, si el agarrado hace un dash, si al que
  agarra lo golpea o lo empuja cualquier cosa, o si alguno de los dos cae, llega a la meta o queda invulnerable.
- **Después**, el que agarró espera 3 s para volver a agarrar (es el enfriamiento del casillero del golpe) y el
  agarrado no puede ser agarrado por nadie durante 2,5 s.
- A los que ya llegaron a la meta no se los agarra.

La velocidad sale de `Simulation.charSpeed`, que ya viaja al cliente para la predicción. El estado se ve en los
demás con dos banderas nuevas en `CharFrame.fl` (agarrando y agarrado) y con eventos al empezar y al cortarse.

En pantalla: los brazos del que agarra hacia el agarrado (o una línea entre los dos), un cartel para el agarrado
que diga cómo soltarse ("¡Te agarraron! Dash para soltarte") y un sonido en cada extremo.

## Lo que hay que rehacer porque dependía del salto o del golpe

- **Bots** (`BotBrain.decideRace`, `dodgeBalls`, `navigate` y `findPath` en `src/core/bots.ts`). Hoy saltan los
  rotores, las bolas y los huecos de una celda, suben un nivel saltando y rompen la cobertura a golpes. Ahora:
  a los rotores se les pasa por el costado o acompañando el giro, las bolas se esquivan cambiando de carril, un
  hueco se cruza con dash si está listo y si no se rodea, las subidas son solo por rampa, y la cobertura se abre
  con dash o a empujones. Los bots también agarran (más seguido los difíciles) y, agarrados, usan el dash si lo
  tienen.
- **Pistas** (`src/core/maps/index.ts`). Lo mínimo para que se puedan terminar sin saltar; el rediseño grande es
  la tarea 22. La regla: **toda zanja que hoy es obligatoria gana un paso angosto o de piso flojo al costado**, y
  la zanja queda como atajo para el que tiene el dash. Hoy las únicas obligatorias son las dos de El Derrumbe.
- **Cobertura.** Sin golpe básico, las paredes se abren con el dash. `dashBreak` sube a 80 para que una embestida
  abra cualquier cobertura (la roca tiene 70): el primero que llega paga el dash y los demás pasan por el hueco.
- **Pantalla.** El casillero del golpe muestra el agarre y su enfriamiento; el botón de salto de los controles
  táctiles desaparece donde no hay salto (`Hud.buildBar`); los textos de ayuda del juego (`ui/tips.ts`,
  `RULESETS.race.desc`, `GAMES.race`) dicen lo nuevo.

## Listo cuando

- Sin pantalla, 30 carreras por pista con seis bots (10 por dificultad): llegan todos en al menos 27. Anotar
  cuánto tarda el primero y el último en cada pista.
- En esas carreras los bots agarran y se sueltan (contar los eventos): al menos un agarre por carrera en promedio.
- En pantalla, con dos pestañas (host y cliente): el cliente agarra al host y el host se suelta con un dash; el
  agarrado ve el cartel; el dash del cliente tarda 5 s en volver y su reloj en el HUD lo muestra; la tecla de
  salto no hace nada y el personaje del cliente no da saltitos de predicción.
- Arena, Asedio y Horda siguen saltando y con el dash de siempre (`tests/e2e/run.mjs` y `tests/e2e/moba.mjs` pasan).
- `npm run test:touch` pasa, con el botón de salto ausente en la Carrera.
- `docs/CARRERA.md` (controles, reglas, bots) y la fila de la Carrera en `docs/PLATAFORMA_Y_MODOS.md` §4 están al día.

## Notas de ejecución

Hecho como lo planteaba la tarea, con estos desvíos y datos:

- **Banderas.** `Ruleset` gana `jump`, `dashCd` y `grab`; `MoveParams` gana `jump` y `dashCd`, y `MeFrame` suma `jmp` y `dcdMax` (el casillero del dash del HUD llena su reloj con `me.dcdMax`). `CharFrame` suma `gb` (el otro del agarre) al final del arreglo posicional, con `?? -1` al decodificar. `PROTOCOL_VERSION` pasó de 11 a 12.
- **Evento `grab`.** El campo del agarrado se llama `tg`, no `t`: `t` está reservado para el tick en `TimedEvent` y lo pisaba, con lo que el cartel del agarrado nunca habría salido. Hay que tenerlo presente al agregar eventos.
- **Enfriamiento del agarre.** Reusa `cds.basic` / `cdMax.basic` (3 s al soltar), así el anillo del casillero del golpe en el HUD funciona sin tocar nada más. Los números están en `GRAB` (`src/core/sim.ts`).
- **Se corta también** si al que agarra lo aturden o lo golpean con hitstun (no solo con tumbo): `updateGrab` corre solo cuando puede actuar, así que en el `else` de ese bloque se lo llama con el clic soltado. Un agarre no empieza si el que agarra tiene invulnerabilidad (si no, se cortaba en el acto y gastaba los 3 s).
- **Visual simplificada.** En vez de brazos hay una línea de chispas entre los dos (`F_GRABBING`) más el cartel «¡Te agarraron! Shift para soltarte» para el agarrado y un sonido en cada extremo. Falta pulir si el usuario quiere brazos de verdad.
- **Pistas** (lo mínimo, como pedía la tarea; el rediseño grande es la 22): El Derrumbe gana una franja de piso en la columna 6, filas 6 a 12, que rodea las dos zanjas (siguen sirviendo de atajo con el dash). En la Pista se ensancharon las filas 2 y 6 (columnas 14 a 24) porque el pasillo de tres filas de rotores no dejaba lugar para pasarles por el costado: **este cambio no estaba en la tarea**, se hizo porque sin salto los bots no terminaban esa pista.
- **Bots.** `decideRace` agarra y se suelta con el dash; `dodgeRotor` pasa por el costado del barrido (solo hacia donde hay piso); `findPath(canHop)` bloquea el radio del rotor y cruza huecos de una celda solo si el dash está listo; el temporizador de atasco no corre en la cuenta regresiva (disparaba un dash al salir). Las bolas ya no se saltan: queda solo la preferencia de carriles de `findPath` (`dodgeBalls` no hace nada sin salto).
- **Herramientas.** `scripts/botstats.ts` suma el modo `race` (`npm run tool:race`). `tests/e2e/touch.mjs` se adaptó: ya no busca el botón de salto en la Carrera y el personaje del test esquiva el rotor 1.

**Mediciones** (`npm run tool:race`, 10 carreras por pista y dificultad, seis bots): llegaron todos en 29/30 en la Pista, 29/30 en el Serpentín, 30/30 en la Bolera y 30/30 en El Derrumbe (el mínimo pedido era 27/30). El primero llega entre 26,7 s (Bolera, difícil) y 39,3 s (Derrumbe, fácil); el último, entre 38,7 s (Bolera, difícil) y 49,2 s (Derrumbe, fácil). Hay entre 9 y 19 agarres por carrera (el mínimo era 1). En las corridas que no terminaron hay un bot trabado (dificultad 2).

**Pantalla** (host y cliente en dos pestañas, Edge): el cliente agarra al host (velocidad del host 1,48 con base 6), el host ve el cartel, se suelta con el dash, el dash del cliente queda en ~4,7 s tras usarlo con el reloj del HUD lleno, y Espacio no mueve la predicción del cliente (`y` 0,00 → 0,00).

**Pendiente de que el usuario lo juegue:** si 5 s de dash y 1,5 s de agarre se sienten bien (están en `RULESETS.race.dashCd` y `GRAB`), si abrir cobertura con el dash alcanza o cansa, y si hay que hacer más vistosa la línea de agarre.
