# 17 · La malla orgánica queda prendida

Última tarea de la malla: pasa a ser cómo se ve y se juega RUBBLE.

**Leer antes:** [docs/MALLA.md](../MALLA.md) y las Notas de ejecución de las tareas 10 a 16.

## Qué hacer

1. **Prenderla.** El terreno orgánico es el valor de entrada de los cuatro juegos. La sala gana una opción
   "Terreno: Orgánico / Cuadrado" (`LOBBY_OPTIONS` en `src/core/games.ts`) para poder comparar y para tener una
   salida si aparece un problema.
2. **Correr todo sobre la orgánica.** Las mismas mediciones sin pantalla de la tarea 14, y además todos los scripts
   de `tests/e2e/` con el terreno orgánico.
3. **Ajustar lo que se vea mal** en las capturas: cuántas vueltas de relajado, el tamaño del corte de las esquinas,
   el ancho mínimo de los pasos angostos de los mapas (donde el plano tenga un puente de una celda que quedó
   injugable, se le da una segunda celda).
4. **Juntas.** Sacar capturas de una pista de Carrera y de El Refugio con las juntas prendidas y apagadas, y
   preguntarle al usuario cuál quiere en cada juego. Es una decisión de gusto.
5. **Limpiar.** Borrar lo que quedó solo para la grilla y ya nadie usa.
6. **Documentar.**
   - `docs/MALLA.md`: de plan a "cómo está hecho", con los números reales.
   - `docs/TERRENO.md`: §1 y §2 describen el terreno por polígonos, y §6 ya no lista la grilla irregular como pendiente.
   - La leyenda de `src/core/maps/index.ts` suma las reglas para dibujar planos: una rampa no va embutida en una
     plataforma, y donde el ancho importa van dos celdas.
   - `docs/PLATAFORMA_Y_MODOS.md` §6 ("el terreno es una grilla de 2 m") y §7 (editor de mapas) quedan al día.
   - `README.md`: la estructura de carpetas y la sección de agregar un mapa.

## Listo cuando

- Una partida nueva de cualquiera de los cuatro juegos arranca con terreno orgánico, y dos partidas seguidas en el
  mismo mapa tienen el borde distinto (dos capturas).
- Las mediciones de la tarea 14 se repiten con el terreno prendido de entrada y siguen en banda.
- `tests/e2e/run.mjs`, `tests/e2e/moba.mjs`, `npm run test:touch`, `tests/e2e/showcase.mjs` y `tests/e2e/maps.mjs`
  pasan con terreno orgánico.
- Con dos pestañas, host y cliente ven el mismo borde (misma huella) en una copa de tres pistas, y el cliente corre
  junto a la costa sin que su predicción lo corrija más de 0,3 m.
- En un teléfono emulado (`npm run test:touch`) la partida no baja la calidad sola por falta de cuadros más de lo
  que la bajaba antes.
- El usuario eligió las juntas, y su elección está aplicada.
- Las Notas de ejecución dicen qué tiene que mirar el usuario al jugarlo: si la costa irregular se lee bien en
  movimiento, si los pasos angostos son justos y si alguna pista quedó más difícil de lo que era.

## Notas de ejecución

**Archivos:** `src/core/types.ts` (`DEFAULT_SETTINGS.organic` en `true`), `src/core/games.ts` (`LOBBY_OPTIONS.organic` y la opción en los seis modos de `MODE_INFO`), `src/app.ts` (el selector de la sala acepta la opción sí/no), `src/render/terrainShape.ts` (`MIN_TURN_ORG`, `ARC_LEN_ORG` y las dos caras de arriba), `src/render/support.ts` (se borró lo de las huellas), `src/core/maps/index.ts` (la leyenda), los comentarios de cabecera de `terrain.ts` y `collision.ts`, `scripts/botstats.ts` (`--square`), `tests/e2e/maps.mjs` (`SQUARE=1`), `tests/e2e/touch.mjs` (`SQUARE=1`; cuenta cuántas veces baja la calidad automática y a cuántos cuadros va; la prueba de frenado se hace en la salida), `docs/MALLA.md` (estado y §10, con los números), `docs/TERRENO.md`, `docs/PLATAFORMA_Y_MODOS.md` (§6 y §7), `docs/decisiones-web.md` (DW-58) y `README.md`. Nada de la red: `PROTOCOL_VERSION` sigue en 19 (el ajuste ya viajaba en `MatchSettings`). Nada de `src/core` fuera de lo de arriba.

**Lo que quedó distinto del plan**

- **Lo que hubo que ajustar fue el dibujo, no la malla.** El plan pedía mirar las vueltas de relajado, el corte de las esquinas y el ancho de los pasos. Las capturas de los diez mapas con tres semillas (y las de la tarea 15 y 16) se ven bien, así que el relajado y los radios del corte no se tocaron. Ningún puente del plano se ensanchó: en 120 semillas de cada mapa el piso más angosto fue de 0,88 m (Las Dos Cornisas, fila 14) y ninguna malla cayó a la cuadrada en 1.000 semillas ([MALLA.md](../MALLA.md) §10). Lo que no pasaba era lo del **teléfono emulado**: la orgánica de la tarea 15 llevaba 2,3 a 2,8 veces los triángulos del terreno y daba entre 12 y 21 % menos cuadros, y en El Puente la calidad automática bajaba sola en las dos partidas medidas (con la cuadrada, en ninguna). Se bajó el costo sin cambiar la forma: con la orgánica, un quiebre del borde de menos de 17° sigue derecho, un arco no tiene tramos de menos de 0,3 m y una celda sin recortes se dibuja con dos triángulos y no cuatro (solo con la orgánica; la cuadrada no cambió). El terreno quedó en 1,2 a 1,4 veces la cuadrada y los cuadros, entre 0 y 5 % por debajo. A la vista el borde queda un poco más anguloso.
- **Las juntas las eligió el usuario: apagadas en los cuatro juegos.** Vio la Carrera (La Pista), la Horda (El Refugio), la Arena (La Cantera) y el Asedio (El Puente) con y sin juntas (`tests/e2e/out/t17-sheets/juntas-A.png` y `juntas-B.png`) y dejó el piso liso. `TerrainLook.joints` sigue disponible y apagada.
- **La opción de la sala es un sí o no** (`LOBBY_OPTIONS.organic` con valores 1 y 0 y los nombres Orgánico y Cuadrado; `app.ts` la convierte a booleano). Está en los seis modos. El host la elige y el cliente la ve.
- **La vitrina del menú y la práctica contra bots también son orgánicas** (usan `DEFAULT_SETTINGS`). La vitrina sale de `Date.now()`, así que el borde de lo que se ve en el menú cambia cada vez que vuelve a empezar.
- **Se borró lo que nadie usaba:** de `Support` (tarea 16) todo lo de las huellas (`Foot`, `footPoints`, `fits`, `overhang`, `OVERHANG`), que quedó de la primera versión y que ya no llamaba nadie. No quedó nada de la grilla en el código que dibuja o que choca. Lo que sigue mirando el plano es a propósito (bots, campo de la Horda, puertas, progreso: [MALLA.md](../MALLA.md) §5). `TerrainShape.contours` (nadie lo usa desde la tarea 16) se dejó: no es de la grilla y está documentado en MALLA.md §7.
- **`npm run test:touch` fallaba también con la cuadrada** ("soltar la palanca → se frena", la palanca llegaba al primer rotor de La Pista, que empuja a quien pasa a su alcance según el momento). La prueba de frenado ahora se hace de vuelta en la salida. No era de la malla.
- **Herramientas:** los scripts sin pantalla arman la orgánica de entrada y aceptan `--square` (`--organic` ya no hace falta); `maps.mjs` y `touch.mjs` también (`SQUARE=1`). `touch.mjs` ahora imprime cuántas veces baja la calidad y a cuántos cuadros va cada juego.

**Listo cuando**

| | Resultado |
|---|---|
| Una partida nueva de los cuatro juegos arranca orgánica; dos seguidas, borde distinto | La sala de los cuatro juegos trae "Terreno: Orgánico" (`settings.organic` en `true`; elegir Cuadrado y volver a Orgánico lo cambia). Dos partidas seguidas en el mismo mapa: La Cantera huellas 2652216865 y 995105383, La Pista 846932567 y 439725673 (`tests/e2e/out/t17-dos/dos-partidas-cantera.png` y `dos-partidas-pista.png`) |
| Las mediciones de la tarea 14, con la orgánica de entrada | Las mismas que la tarea 14, en banda: Carrera 30 / 27 / 28 / 30 de 30 carreras por pista llegan todos y 0 puertas sin contar; Horda 16 / 11 / 3 victorias de 20 y zombis reubicados por trabados 0,10 %; Arena (3) y Asedio (2) terminan 25 de 25; simetría 0; ningún héroe cae donde apareció (unas 2.200 apariciones); ninguna malla cayó a la cuadrada. Costo de la Horda **+20 %** en total (Fácil +31 %, Normal +17 %, Difícil +15 %; en la tarea 14 +15 %): son 0,055 ms por tick. Tabla completa en [MALLA.md](../MALLA.md) §10 |
| `run.mjs`, `moba.mjs`, `test:touch`, `showcase.mjs` y `maps.mjs` con la orgánica | `maps.mjs` (los diez mapas con la orgánica, dos corridas completas), `moba.mjs`, `showcase.mjs` (los cuatro héroes) y `test:touch` (los cuatro juegos) pasan con la orgánica. `run.mjs` pasó 3 de 6 corridas con la orgánica: dos fallaron en el contador de carteles del cliente (`cliente ve personajes ≥ 2` dependía de que el otro personaje quedara a la vista de su cámara; ahora cuenta los personajes del último snapshot que recibió) y una por tiempo (`.results` no apareció en 20 s, el mismo flake de la tarea 14); con el cambio pasó 2 de 3 |
| Host y cliente, copa de tres pistas: misma huella; corrida junto a la costa sin corrección de más de 0,3 m | La Pista, El Serpentín y La Bolera, seis corridas (18 pistas): la huella de la simulación del host, la de su vista, la de `MatchInit` y la del cliente coinciden en todas, el cliente no avisa y las tres mallas de cada copa son distintas. En las dos últimas corridas el cliente corre 13 m junto a la costa de cada pista (a 0,05 a 1 m del vacío) sin caerse y su predicción lo corrige como mucho 0,013 m. Hay correcciones de 0,35 m por cuadro a menos de 8 m de los aceleradores de El Serpentín: el envión lo pone el host y el cliente no lo predice; pasa igual con la cuadrada, no es de la malla |
| Teléfono emulado: la calidad no baja más que antes | Con la orgánica de la tarea 17 la calidad automática no bajó en ninguna de las 12 partidas medidas (cuadrada, 0 de 12); los cuadros quedaron entre 0 y 5 % por debajo de la cuadrada (33,2 contra 33,3, 31,0 contra 31,9, 44,6 contra 46,8 y 29,1 contra 30,1). Con la de la tarea 15 bajaba en las dos partidas de El Puente |
| Las juntas | Las eligió el usuario: apagadas en los cuatro juegos |
| Qué mirar al jugarlo | Abajo |

**Qué tiene que mirar el usuario al jugarlo**

- **Si la costa irregular se lee bien en movimiento.** Está revisada con capturas y medida, no jugada. El borde de la Carrera (los pianos rojos y blancos) y el neón de la Horda zigzaguean ahora cada metro. Si distrae, el ajuste está en `MIN_TURN_ORG` y `ARC_LEN_ORG` (`terrainShape.ts`): subirlos lo vuelve más anguloso y más barato; bajarlos, más redondeado y más caro.
- **Si los pasos angostos son justos.** Los más angostos de cada mapa, con 0,9 a 1,1 m en una de cada tres o cuatro semillas como mucho: Las Dos Cornisas (las líneas de afuera, 0,88 m), La Bolera (el callejón de las columnas 5 a 7), El Serpentín (la bajada de la columna 30), La Pista (el recodo de la columna 40), El Derrumbe (la columna 6), La Cantera y El Islote (las puntas). Cada semilla es un borde distinto: si alguna se siente injusta, anotar el mapa y la zona y se le da una segunda celda en el plano.
- **Si alguna pista quedó más difícil de lo que era.** Con bots la orgánica da lo mismo que la cuadrada en las cuatro pistas (El Serpentín y La Bolera quedan en 27 y 28 de 30, como en la tarea 14). En dos carreras de El Serpentín un bot cayó tres o cuatro veces seguidas en el mismo lugar, junto a un paragolpes de la segunda recta; el borde real ahí está medio metro más lejos que el del plano (z 5,1 a 5,4 contra 5,0), así que no es piso que falte.
- **La Horda gana algo menos con bots en Fácil** (16 de 20 contra 19 de 20 con la cuadrada); con 20 partidas por dificultad es dudoso que sea la malla, pero si el Fácil se siente más duro, ahí está.
- **Los cuadros en un teléfono de verdad.** Con la orgánica la escena lleva 1,06 a 1,16 veces los triángulos de la cuadrada y hasta 5 % menos cuadros en el teléfono emulado (que es el navegador de escritorio con render por software, no un teléfono).

**Para quien siga**

- Los aceleradores de la Carrera hacen que el cliente corrija 0,35 m por cuadro mientras dura el envión (también con la cuadrada): el cliente no predice el envión. Anotado, no tocado.
- La decoración no depende del contorno que se dibuja (mide el borde real sobre la malla), así que lo que cambió en `terrainShape.ts` no mueve los números de la tarea 16; se revisó con capturas de los diez mapas y con un script descartable que mide el dibujo contra el piso real.
