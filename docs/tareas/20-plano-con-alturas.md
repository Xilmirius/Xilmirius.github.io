# 20 · Planos con más de dos niveles y rampas largas

El usuario pidió pistas "con altura". Hoy un mapa tiene piso (nivel 0), plataformas (nivel 1) y muros, y las rampas
solo van de 0 a 1 en una celda. Esta tarea agranda el plano; los mapas que lo usan son las tareas 22 y 23.

## Qué hacer

**Una capa de alturas en el plano.** `MapDef` (`src/core/maps/index.ts`) gana una capa optativa, `heights`, con
las mismas filas y columnas que `rows`: un dígito por celda con su nivel (0 a 9). Donde no hay dígito vale lo que
ya dice el carácter de `rows` (un `1` es nivel 1, una cobertura en mayúscula está en nivel 1, etc.). Los mapas de
hoy no la necesitan y no cambian.

- Cada nivel mide `LEVEL_H`.
- Un **muro** se levanta desde el nivel de su celda.
- Una **rampa** sube del nivel de su celda al siguiente, hacia donde apunta su flecha.
- **Rampa larga:** varias celdas de rampa seguidas en el sentido de la flecha y con el mismo nivel forman **una**
  rampa que sube un nivel en todo su largo. Es la pendiente suave.
- Todo lo que se apoya en una celda (cobertura, artefactos, salidas, puntos de zona) se apoya en su nivel.

**Lo que hoy da por hecho que solo hay dos niveles.** Revisar al menos:

- **Caminos de los bots** (`BotBrain.findPath` en `src/core/bots.ts`). Trata la rampa como "medio nivel" y sube un
  nivel saltando. Con rampas largas y varios niveles esa cuenta no alcanza: los bots pasan a pedirle los caminos al
  grafo de `src/core/nav.ts` (tarea 07), cuyas aristas ya se prueban contra el mundo real. Los saltos son aristas
  propias de los bots: subir un nivel saltando solo donde las reglas tienen salto, y cruzar un hueco con dash.
- **Terreno dibujado** (`terrainShape.ts`): las capas ya son genéricas; comprobar el color y la sombra de contacto
  con tres o más niveles, y que una plataforma alta pegada al vacío cuelgue bien su costado.
- **Minimapa:** un tono por nivel.
- **Comprobación de la malla** (tarea 11): las rampas largas cumplen las mismas reglas que las cortas.

## Cómo probarlo

Con un plano de prueba que **no se commitea**: tres niveles, una rampa larga de tres celdas, una rampa corta, una
torre de nivel 3 pegada al vacío y un muro sobre una plataforma.

## Listo cuando

- En el plano de prueba, sin pantalla: un bot sube del nivel 0 al 3 por las rampas y baja; con las reglas de la
  Carrera (sin salto) no intenta subir donde no hay rampa; un zombi llega a un héroe parado en el nivel 3.
- La comprobación de la malla pasa en el plano de prueba con 50 semillas.
- Capturas del plano de prueba (cuadrado y orgánico): las tres alturas, la rampa larga y el muro sobre plataforma.
- Los diez mapas de hoy se ven y se juegan igual: `tests/e2e/run.mjs` y `tests/e2e/moba.mjs` pasan, y los bots de
  la Carrera siguen en la banda de la tarea 03.
- La leyenda de `src/core/maps/index.ts` explica la capa de alturas y las rampas largas.
