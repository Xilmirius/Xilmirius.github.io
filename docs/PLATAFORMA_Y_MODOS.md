# RUBBLE como plataforma: un núcleo, muchos juegos

> Estado: **visión + hoja de ruta**. Lo que ya está implementado se marca con ✅; lo demás es plan.
> Complementa [GDD.md §11](GDD.md) ("núcleo agnóstico al objetivo de victoria") y [decisiones-web.md](decisiones-web.md).

## 1. La idea en una frase

Un **núcleo de juego en el navegador** (física de knockback, mapa destructible, personajes "bean", red P2P, bots y feedback) sobre el que se **arman modos de juego eligiendo piezas**, como en un Roblox curado: cada modo usa solo los sistemas que le sirven. El brawler es el primer modo, no el producto entero.

¿Por qué así y no un juego por modo? Porque el costo caro (red, física, render, bots, herramientas) se paga **una vez**, y cada modo nuevo es combinación y contenido. Es el mismo razonamiento que el pilar 1 del GDD ("escalar sin rehacer"), llevado de héroes a modos.

## 2. Cómo está armado hoy (✅)

Lo que ve el jugador son **juegos**: Arena, Asedio, Carrera y Horda. El menú es una vitrina con una tarjeta por juego, y cada juego se declara en una sola tabla, `GAMES` en `src/core/games.ts`: qué modos tiene, qué reglas admite, en qué mapas se juega, cómo se reparten los jugadores (equipos, todos contra todos o cooperativo), cuántos hacen falta, con qué ajustes se entra y qué opciones puede tocar el host. El menú, la sala, el host y la pantalla le preguntan a esa tabla; ninguno compara el nombre del modo.

Por dentro, un juego se arma con **reglas de victoria** + **sistemas prendidos** + **tipo de mapa**.

| Capa | Dónde | Qué decide | Ejemplo |
|---|---|---|---|
| **GameDef** | `src/core/games.ts` | Qué es el juego: modos, reglas, mapas, formato, opciones de la sala, vitrina | Arena, Asedio, Carrera, Horda |
| **GameMode** | `src/core/modes.ts` | Cómo se gana, cuándo se reaparece, qué muestra el marcador | Vidas, Ring-outs, Control de zona, Asedio, Carrera, Horda |
| **Ruleset** | `src/core/rules.ts` | Qué sistemas del núcleo están prendidos | Brawler, Completo, Asedio, Carrera, Horda |
| **Mapa** | `src/core/maps/` | Terreno, coberturas, zonas, spawns (y en Asedio: torres, núcleos, líneas) | La Cantera, El Islote, El Puente, Las Dos Cornisas |
| **Contenido** | `src/core/heroes/`, `items.ts`, `mutations.ts` | Héroes, ítems, rutas de mutación | 4 héroes, 13 ítems |

La simulación **nunca pregunta "¿estoy en el modo X?"**: pregunta "¿está prendido el sistema Y?" (`sim.rules.crafting`, `sim.rules.dash`...). Por eso un modo nuevo no toca combate ni red.

### Reglas disponibles

Además de estas tres, la **Carrera** y la **Horda** traen las suyas, atadas al juego: sin poderes de héroe, con las cajas de ítems (Carrera) o con armas (Horda, bandera `weapons`).

| Sistema | ⚡ Brawler | 🧬 Completo | 🏰 Asedio |
|---|---|---|---|
| Niveles y XP en la partida (desbloquean habilidades) | – (todo desde el inicio) | ✔ | ✔ (XP ×0.55) |
| Forja: ítems pasivos/activos y mutaciones | – | ✔ | ✔ solo en la base |
| Reparar el cuerpo (V) | – | ✔ | ✔ |
| Trozos que sueltan las coberturas | cargan la ulti | materiales | materiales |
| Ulti | se carga pegando | nivel 5 + enfriamiento | nivel 5 + enfriamiento |
| Dash (Shift) | ✔ | ✔ | ✔ |
| Volver a la base (B) | – | – | ✔ |
| Piso frágil que se rearma | – | – | ✔ (25 s) |

**Brawler** es la respuesta a "en una partida rápida no da el tiempo para administrar recursos, upgrades, ítems y niveles": queda el combate puro (romper → entrar → sacar), más movilidad (dash) y una sola barra que mirar (la ulti). **Completo** guarda intacto todo lo que se diseñó para partidas largas, y **Asedio** son las reglas del MOBA (vienen atadas al modo: necesitan bases).

## 3. Catálogo de piezas del núcleo

Lo que ya existe y cualquier modo puede reutilizar:

| Pieza | Estado | Notas |
|---|---|---|
| Combate de heat + knockback por etapas, ring-out | ✅ | El corazón. Sin barra de vida. |
| Cuerpo lanzado como proyectil (billar, paredes) | ✅ | |
| Mapa destructible por etapas + baldosas frágiles | ✅ | Coberturas reaparecen a los 40 s. |
| Materiales / trozos | ✅ | Configurable por reglas. |
| Forja de ítems y mutaciones | ✅ | Solo en Completo. |
| Niveles y XP dentro de la partida | ✅ | Solo en Completo. |
| Carga de ulti | ✅ | Brawler. |
| Dash, segundo salto, trepar bordes | ✅ | Movimiento predicho en el cliente. |
| Construcciones (muros, torretas) con equipo y vida | ✅ | Las torres y núcleos del Asedio son estructuras fijas del mapa. |
| Zonas y telegrafías | ✅ | Base para zona que se cierra (battle royale). |
| Bots con el mismo input que un humano | ✅ | También juegan el Asedio (línea, remate, torres, volver a la base). |
| Unidades con cuerpo (esbirros, neutrales) | ✅ | Misma física y knockback que los héroes, con vida e IA propia. Base para hordas. |
| Red P2P host-autoritativa (hasta 6) | ✅ | Más jugadores → servidor dedicado (ver §6). |
| Feedback: efectos, sonido, locutor, combos, logros | ✅ | Todo por eventos: lo nuevo lo hereda. |
| Registro de assets reemplazables | ✅ | Ver [ASSETS_CATALOGO.md](ASSETS_CATALOGO.md). |
| Artefactos del mapa: resortes, paragolpes, rotores, géiseres, barriles explosivos, cajas de ítems | ✅ | `core/gadgets.ts`. Rotores y géiseres son deterministas por tick; el resorte es terreno y se predice en el cliente. |
| Plataformas móviles | ⬜ | Hay que arrastrar a quien está encima y predecirlo igual en host y cliente. |
| Puertas en orden, reaparición en la última y llegada con cuenta regresiva | ✅ | Carrera (`core/race.ts`). |
| Rondas/eliminatorias entre mapas | ⬜ | Para torneos y carreras de varias rondas. |
| Inventario/loot en el piso | ⬜ | Necesario para battle royale. |
| Carriles, oleadas y objetivos de base | ✅ | Asedio: ver [MOBA.md](MOBA.md). |
| Minimapa | ✅ | Asedio. Reutilizable para battle royale. |

## 4. Modos propuestos y qué piezas usan

| Modo | Victoria (GameMode) | Reglas (sistemas) | Mapa | Piezas nuevas que hacen falta |
|---|---|---|---|---|
| **Brawler** ✅ | Vidas / Ring-outs / Zona | Brawler | Arenas chicas-medianas | – |
| **Asedio (MOBA)** ✅ | Destruir el núcleo rival | Asedio (niveles, forja en base, B, piso que se rearma) | 1 línea (2v2) o 2 líneas (3v3) | Hecho: oleadas, torres, núcleo, base, Coloso, campamentos, minimapa. Falta: niebla de guerra, 5v5 (servidor). Ver [MOBA.md](MOBA.md) |
| **Battle Royale** | Último en pie | Brawler + loot | Mapa grande, zona que se cierra | Zona que achica (una `Zone` que daña afuera), cofres/loot en el piso (pickups con ítems), caída inicial, más jugadores |
| **Carrera de obstáculos** ✅ (tipo Fall Guys) | Llegar primero a la meta | Carrera: sin habilidades; golpes, empujón, dash e ítems de caja | Pistas (`kind: 'race'`): La Pista | Hecho: puertas, rotores, paragolpes, géiseres, resortes, cajas. Falta: plataformas móviles, más pistas y rondas eliminatorias |
| **Fútbol de knockback** (idea) | Goles | Brawler | Cancha con arcos | Pelota = cuerpo físico con knockback (reusar `stepPickup`/proyectil), arcos como zonas |
| **Horda (zombis)** ✅ | Cumplir la cadena de misiones y llegar a la extracción (cooperativo) | Horda: armas en vez de poderes | Propios (`kind: 'horde'`): El Refugio | Hecho: pistola, uzi, escopeta, lanzacohetes y C4; cajas de suministros; misiones de zona, nidos, combustible y jefe; mini bases con torreta; tres dificultades. Falta: más mapas. Ver [ZOMBIS.md](ZOMBIS.md) |

Orden sugerido (menor costo → mayor aprendizaje):

1. **Pulir Brawler** con jugadores reales (lo que tenemos). Medir: ¿dura bien una partida? ¿se entiende la ulti?
2. **Obstáculos**: la pieza nueva (cinemáticos + rondas) es acotada y el modo es muy "compartible" con amigos.
3. **Battle Royale chico** (6–10): reutiliza casi todo; lo nuevo es la zona que cierra y el loot.
4. **MOBA** ✅ (primera versión, 1v1 a 3v3): lo que sigue es probarlo con gente, niebla de guerra y 5v5 con servidor dedicado.

## 5. Más assets según el modo

El registro de assets ([ASSETS_CATALOGO.md](ASSETS_CATALOGO.md), menú → 🧩 Assets) hace que cada pieza procedural se pueda reemplazar de a una. Cada modo nuevo suma entradas al catálogo:

| Modo | Assets nuevos |
|---|---|
| MOBA | Torres (3 niveles de daño), núcleo/base, creeps (melee y a distancia), jungla (campamentos), íconos de ítems nuevos, minimapa |
| Battle Royale | Cofres, loot en el piso, zona que cierra (shader/borde), bioma grande (rocas, árboles), avión/caída inicial |
| Obstáculos | Plataformas, rotores, martillos, cintas, rampas, meta, checkpoints, decoración de pista |
| Todos | Personajes con rig y animaciones (ver [MEJORAS_CON_ASSETS.md](MEJORAS_CON_ASSETS.md) §1.1), música por modo, locutor por modo |

## 6. Límites técnicos a tener en cuenta

- **Jugadores por partida:** el host P2P aguanta 6 cómodo. MOBA 5v5 o battle royale de 10+ piden **servidor dedicado**. La simulación (`src/core`) ya es TS puro sin DOM: se muda a Node/Bun cambiando solo `src/net` (ver [arquitectura.md §6](arquitectura.md)).
- **Mapas grandes:** el terreno es una grilla de 2 m; mapas grandes necesitan partir el render en trozos y culling (hoy es una sola malla).
- **Cinemáticos:** la colisión (`collision.ts`) hoy es estática + obstáculos AABB. Las plataformas móviles necesitan velocidad propia y "arrastrar" a quien está encima; hay que predecirlas igual en host y cliente (son deterministas por tiempo, así que se puede).

## 7. Editor de mapas (anotado para el futuro)

La idea: un editor **en el mismo juego** (web), para que armar un mapa sea tan fácil como jugarlo.

- **Formato:** hoy los mapas son ASCII (`src/core/maps/index.ts`). El editor debería exportar el mismo formato (o un JSON equivalente) para no tocar la simulación.
- **Qué se edita:** celdas (piso, alto, rampa, frágil, vacío), coberturas por familia, spawns por equipo, zonas de control; más adelante obstáculos cinemáticos y carriles.
- **Flujo:** pintar con el mouse sobre la grilla en vista isométrica → **"Probar"** abre una práctica con bots en ese mapa al instante → **"Compartir"** lo sube a Supabase (Storage o una tabla `maps`) y genera un link.
- **Validación:** reutilizar el test `mapas` (spawns, zonas, frágiles) para avisar en vivo si al mapa le falta algo.
- **Por qué vale la pena:** convierte a los jugadores en creadores de contenido (el efecto Roblox) y es la herramienta que después usamos nosotros para los mapas de MOBA, battle royale y obstáculos.

## 8. Cómo se agrega un juego o un modo (receta)

0. **Juego:** si es un juego nuevo (no una forma más de ganar dentro de uno que ya existe), sumar su entrada a `GAMES` en `src/core/games.ts`. Con eso aparece en la vitrina del menú, la sala muestra solo sus opciones y el host valida cuántos hacen falta.
1. **Victoria:** implementar `GameMode` en `src/core/modes.ts` (init, onDeath, canRespawn, tick, result, hud) y sumarlo a `ModeId` y a `MODE_INFO` (en `games.ts`, diciendo de qué juego es y qué opciones tiene).
2. **Sistemas:** elegir un `Ruleset` existente o agregar uno en `src/core/rules.ts`. Si hace falta un sistema nuevo, agregarlo como **flag** en `Ruleset` y preguntar por el flag en la simulación (nunca por el modo).
3. **Mapa:** agregar el mapa (ASCII hoy, editor mañana) y, si el modo necesita piezas de mapa nuevas, sumarlas a la leyenda.
4. **HUD:** `Hud` ya se adapta a las reglas; el marcador sale de `GameMode.hud()`.
5. **Bots:** `BotBrain` consulta `sim.rules` y `mode.hud()` (por ejemplo, va a la zona si hay zona).
6. **Tests:** una partida headless de bots con el modo nuevo en `tests/sim.test.ts`.
7. **Assets:** si hay piezas visuales nuevas, sumarlas a `src/assets/catalog.ts` y regenerar la checklist (`npm run assets:doc`).
