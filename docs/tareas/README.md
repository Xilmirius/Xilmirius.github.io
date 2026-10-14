# Tareas de pulido (octubre 2026)

Cada archivo de esta carpeta es una tarea para un agente. El análisis y el diseño ya están hechos: la tarea dice
qué construir, por qué y cómo se comprueba. Lo que no dice queda a criterio de quien la ejecuta.

## Cómo trabajar una tarea

1. Leer esta página y la tarea entera antes de tocar código. Si la tarea nombra otro documento, leerlo también.
2. Ubicar el código con CodeGraph (`codegraph_explore`): las tareas nombran símbolos, no líneas, porque las líneas
   se mueven con cada tarea anterior.
3. Revisar las **Notas de ejecución** de las tareas de las que depende: ahí está lo que cambió respecto del plan.
4. Hacer el trabajo y comprobar cada punto de **Listo cuando**. Una tarea con un punto sin comprobar no está lista.
5. Actualizar los documentos que la tarea nombra, en el mismo cambio.
6. Agregar al final del archivo de la tarea una sección **Notas de ejecución**: qué quedó distinto del plan, qué
   números se ajustaron y con qué mediciones, y qué queda pendiente de que el usuario lo juegue.
7. Marcar la tarea en la tabla de abajo (`[x]`) y hacer **un commit** con todo, en `main`, sin push.

### Reglas del proyecto

- **Probar sin dejar tests.** El repo no tiene unit tests y no los va a tener. Para comprobar un valor o una
  mecánica puntual se escribe un script descartable fuera del repo (en el scratchpad de la sesión), se corre con
  `npx tsx` contra `src/core` y se borra.
- **Medir con herramientas.** Las partidas de bots sin pantalla que varias tareas repiten (victorias, tiempos,
  llegadas a la meta, zombis trabados) se corren con una herramienta de `scripts/`, como `scripts/botstats.ts`:
  imprime números y no afirma nada. La primera tarea que necesita una medición la agrega ahí con su entrada en
  `package.json`; las siguientes la reusan en vez de reescribirla.
- **Comprobar en pantalla.** `npm run typecheck` y `npm run build` siempre. Para ver el juego: los scripts de
  `tests/e2e/` (necesitan el build) con
  `CHROMIUM="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"`. El juego expone `window.__rubble`
  (`.session.sim`, `.session.setSettings(...)`, `.match.view`) para armar la situación antes de la captura. Las
  capturas van a `tests/e2e/out` (ignorada por git). Los scripts de `tests/e2e/` se mantienen andando: si la tarea
  cambia algo que usan, se corrigen.
- **Red.** Si cambia algo que viaja entre host y cliente (`InputFrame`, `MeFrame`, `CharFrame`, mensajes de
  `protocol.ts`, eventos), se sube `PROTOCOL_VERSION` en 1. Los índices que viajan (armas, mejoras, tipos de
  unidad) solo crecen por el final.
- **Capas.** `src/core` no importa nada de navegador. La simulación pregunta por banderas de `Ruleset`
  (`sim.rules.x`), nunca por el nombre del modo.
- **Movimiento predicho.** `stepMove` corre igual en el host y en la predicción del cliente. Todo lo que cambie
  cómo se mueve un héroe tiene que salir de `MoveParams` o del terreno, y viajar en `MeFrame` si el cliente no lo
  puede deducir solo.
- **Números.** Los valores que dan las tareas son un punto de partida. Se ajustan con partidas de bots sin
  pantalla hasta cumplir lo que pide **Listo cuando**, y el resultado se anota en las Notas de ejecución.
- **Decisiones de diseño.** Lo que la tarea da por decidido lo eligió el usuario. Si al implementarlo algo no
  cierra o aparece una decisión de gusto que la tarea no cubre, se frena y se le pregunta.

## Orden

Dos pistas pueden avanzar a la par: **A** (01 a 07, en fila) y **B** (10 y 11, archivos nuevos que no chocan con
nadie). Desde la 12 todo va en fila, en el orden de la tabla, porque toca los mismos archivos que la pista A.

| | Tarea | Depende de | Qué resuelve |
|---|---|---|---|
| [x] | [01](01-copa-cliente-sin-controles.md) | – | En una copa en multijugador, el que no es host no se puede mover desde la segunda pista |
| [x] | [02](02-carrera-salida-en-linea.md) | – | Los corredores salen en dos filas y los de adelante llevan ventaja |
| [x] | [03](03-carrera-sin-salto-y-agarrar.md) | 02 | Carrera con salto flotante y sin golpes: agarrar, empujar y un dash que tarda en volver |
| [x] | [04](04-horda-barra-de-vida.md) | – | La Horda pasa del heat a una barra de vida |
| [ ] | [05](05-horda-armas-chatarra-taller.md) | 04 | Se llevan todas las armas que se juntan y se mejoran con chatarra |
| [ ] | [06](06-apuntado-con-altura.md) | 05 | Las balas van al punto del mundo que marca el cursor, también en altura |
| [ ] | [07](07-navegacion-de-zombis.md) | 04 | Los zombis se traban: caminos que respetan rampas y obstáculos |
| [ ] | [10](10-malla-generador.md) | – | Generador de la malla irregular (archivo nuevo, sin tocar el juego) |
| [ ] | [11](11-malla-estampado.md) | 10 | El plano del mapa estampado sobre la malla, con consultas y garantías |
| [ ] | [12](12-terreno-sobre-la-malla.md) | 07, 11 | El terreno consulta la malla (todavía cuadrada) y las rampas pasan a ser piezas |
| [ ] | [13](13-colision-contra-poligonos.md) | 12 | El movimiento choca contra polígonos y desliza con la normal real |
| [ ] | [14](14-malla-organica-en-el-nucleo.md) | 13 | La simulación corre sobre la malla orgánica, sembrada por partida |
| [ ] | [15](15-dibujo-del-terreno.md) | 14 | El terreno se dibuja desde los polígonos: costa, acantilados, muros, losas |
| [ ] | [16](16-dibujo-del-resto.md) | 15 | Decoración, artefactos y minimapa siguen a la malla |
| [ ] | [17](17-malla-encender-y-pulir.md) | 16 | La malla orgánica queda prendida en los cuatro juegos |
| [ ] | [20](20-plano-con-alturas.md) | 17 | Mapas con más de dos niveles y rampas largas |
| [ ] | [21](21-carrera-obstaculos-nuevos.md) | 03, 20 | Obstáculos nuevos de Carrera que no dependen de saltar |
| [ ] | [22](22-carrera-pistas-largas.md) | 17, 21 | Pistas más largas, con altura y más obstáculos |
| [ ] | [23](23-horda-mapa-grande.md) | 07, 17, 20 | Un mapa grande para la Horda, con cosas en el camino, minimapa y flecha al objetivo |
| [ ] | [24](24-generador-de-pistas.md) | 22 | *Borrador.* Pistas de Carrera armadas con tramos al azar |
| [ ] | [25](25-generador-de-mapas-horda.md) | 23 | *Borrador.* Mapas de Horda generados |

Las dos últimas son borradores: se escribieron antes de que exista aquello sobre lo que se apoyan. Quien las tome
las revisa con el usuario antes de empezar.

## Lo que decidió el usuario (2026-10-13)

- **Horda:** barra de vida en vez de heat. En cero se cae, se pierde una vida y se reaparece en la mini base. Los
  golpes empujan poco y siempre igual; caer al vacío también cuesta una vida.
- **Armas:** se llevan todas las que se juntan. Los zombis sueltan chatarra y con ella se sube de nivel cada arma
  en un taller.
- **Apuntado:** las armas apuntan adonde está el cursor, también en altura, para que disparar desde arriba rinda.
- **Carrera:** se va el golpe básico del héroe y el salto pasa a ser flotante y torpe, como en Fall Guys: un solo salto, más bajo, que cae despacio y sin doble salto (el usuario aclaró después que no quería quitarlo). El clic izquierdo agarra (frena
  al rival mientras se lo sostiene, como en Fall Guys), el derecho sigue empujando y el dash tarda mucho más en
  volver. Las cajas de ítems se quedan. La salida es en una sola línea.
- **Mapas:** malla irregular de verdad, estilo Townscaper, distinta en cada partida. Los mapas se siguen dibujando
  como un plano simple que se estampa sobre la malla; los generadores por juego vienen después.
- **Orden:** primero lo rápido (bugs y reglas), la malla en paralelo, y los mapas nuevos al final, ya sobre la malla.

## Valores que eligió el plan (se pueden cambiar)

El usuario no opinó sobre estos números; son el punto de partida de cada tarea.

| Qué | Valor | Tarea |
|---|---|---|
| Recarga del dash en la Carrera | 5 s (hoy 1,3 s) | 03 |
| Agarre | hasta 1,5 s; el agarrado va al 25 % y el que agarra al 50 %; 3 s para volver a agarrar | 03 |
| Salto de la Carrera | fuerza ×0,75 y gravedad ×0,75 (sube ~1,4 m en ~0,7 s), sin doble salto | 03 |
| Vida de un héroe en la Horda | 150 (el plan decía 100; ver tarea 04); se recupera sola a 5 por segundo tras 3 s sin recibir daño | 04 |
| Niveles de un arma | 5, a 15 / 30 / 50 / 80 de chatarra | 05 |
| Dónde se usa el taller | en una mini base o en el campamento de salida | 05 |
| La chatarra es del equipo | la junta uno y suma para todos | 05 |
| Tamaño de las celdas de la malla | lado de 1 m (el plano sigue en celdas de 2 m) | 10 |
| Duración de una pista larga | 60 a 90 s para un buen corredor (hoy 22 a 44 s) | 22 |

## Propuestas sin aprobar

Aparecieron al leer el código. No son tareas: son para que el usuario diga cuáles quiere.

- **Cámara que anticipa.** Hoy solo sigue al personaje. En pistas largas y en un mapa grande ayudaría que se
  adelante hacia donde se corre (Carrera) o hacia donde se apunta (Horda). Hoy es una decisión explícita que la
  cámara no se mueva sola (ver el comentario al principio de `render/gameView.ts`).
- **Mirar a los demás al llegar a la meta.** Hoy el que llega queda quieto mirando su personaje.
- **Recarga de cargador en la Horda.** Hoy solo hay munición total. Está anotado como duda en `docs/ZOMBIS.md` §9.
- **Zombis que rompen la cobertura** que les tapa el paso, en vez de rodearla siempre.
- **Sonidos de las armas.** Se escribieron sin poder escucharlos; falta una pasada con alguien que los oiga.
- **Agarrar también en la Arena**, para llevar a alguien hasta el borde.
