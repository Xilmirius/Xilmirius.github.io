# 04 · Horda: barra de vida en vez de heat

## Qué pidió el usuario

La Horda usa hoy el sistema del brawler: los zombis suman heat, cuanto más heat más lejos se vuela, y solo se
pierde una vida al caer al vacío. Para un juego de zombis no se lee. Queda así:

- Cada héroe tiene una **barra de vida**. Los zombis la bajan.
- En cero el héroe cae, pierde una de sus vidas y reaparece (en la última mini base, como hoy).
- Los golpes **empujan poco y siempre igual**: ya no hay etapas ni se vuela más por estar lastimado.
- Caer al vacío sigue costando una vida.

Las vidas (cuántas veces se puede caer) no cambian: las sigue eligiendo el host.

## Diseño

Una bandera nueva en `Ruleset`, `health`, que solo prende la Horda. Con ella prendida, para los héroes:

- **El daño baja vida en vez de sumar heat.** `Character` ya tiene `hp` y `maxHp` (hoy solo los usan las unidades).
  El punto único es `Simulation.applyHeat`: ahí el daño a un héroe resta vida, y en cero el héroe muere por el
  mismo camino que una caída (`die` → `mode.onDeath`). Al reaparecer vuelve con la vida llena.
- **Curarse** reemplaza a enfriarse. `Simulation.coolHeat` es lo que llaman la mini base, el botiquín, el premio
  de misión, la recuperación sola y la mejora "Sangre fría": con `health` prendida, cura.
- **El empuje es fijo.** `Simulation.hit` multiplica el empuje por la etapa de la víctima; con `health` usa un
  multiplicador constante (punto de partida: 0,45). Con eso un zombi común apenas corre al héroe, y la Mole Madre
  y los barriles todavía lo lanzan.
- **Lo que ven los demás.** `CharFrame` gana la vida (como fracción). La etapa que viaja en el frame (`st`) sale de
  la vida: más del 66 % → 0, más del 33 % → 1, más del 15 % → 2, menos → 3. Así el cuerpo se agrieta al perder
  vida, y el latido y el borde rojo de peligro, que ya miran la etapa, funcionan sin tocarlos. La etapa de la
  simulación (`Character.stage`) queda en 0.
- **Morir por vida en cero se ve distinto** de caer al vacío: el cuerpo se rompe en el lugar.

### Números de partida

| Qué | Valor |
|---|---|
| Vida de un héroe | 100 |
| Daño por golpe: zombi / corredor / escupidor / mole / Mole Madre | 8 / 5 / 7 / 14 / 19 (los `heat` de `ZOMBIES`, que pasan a ser daño) |
| Recuperación sola | 5 por segundo después de 3 s sin recibir daño |
| En una mini base | +7 por segundo |
| Botiquín | +60 a quien lo agarra y a los que tenga cerca |
| Al cumplir una misión | +30 a todo el equipo |
| Sangre fría | +2,5 de vida por zombi bajado, por nivel |
| Piel curtida | 20 % menos de daño y de empuje, por nivel |

La dificultad (`HORDE_LEVELS`) y el crecimiento de la horda (`HORDE.threatDmg`) siguen multiplicando el daño.

## Qué tocar además de la simulación

- **HUD** (`Hud.renderBody` en `src/ui/hud.ts`): donde hoy dice "Intacto / Agrietado" con el número de heat, una
  barra de vida grande con su número. La vida de los compañeros se ve sobre sus cabezas, junto al nombre.
  Un destello al recibir daño.
- **Bots** (`BotBrain.decideHorde`): vuelven a la mini base y buscan botiquines según el heat; ahora según la
  vida. Lo mismo el sorteo de cajas (`HordeMode.rollCrate`), que da más botiquines con el equipo lastimado.
- **Textos**: las mejoras (`src/core/perks.ts`), la ayuda del juego (`ui/tips.ts`) y `docs/ZOMBIS.md` (la idea, la
  tabla de mejoras y la sección de dificultad, que hoy explica el heat).

Arena, Asedio y Carrera no cambian: siguen con heat.

## Listo cuando

- Sin pantalla, en El Refugio con tres bots, 20 partidas por dificultad: en Fácil ganan al menos 16, en Normal
  entre 10 y 17, en Difícil no más de 13. Anotar cuántas vidas pierde el equipo por partida y cuánto dura.
- En esas partidas ningún héroe termina con heat distinto de cero y todas las muertes por vida en cero descuentan
  una vida.
- En pantalla, con dos pestañas: la barra del cliente baja cuando lo muerde un zombi, sube en la mini base, y la
  del compañero se ve sobre su cabeza. Capturas del HUD con la vida llena, a la mitad y casi en cero.
- Una partida de Arena sigue mostrando el heat y las etapas (`tests/e2e/run.mjs` pasa).
- `docs/ZOMBIS.md` no menciona el heat como algo que le pasa a los héroes.

## Notas de ejecución

Hecho como lo planteaba la tarea, con estos desvíos y datos:

- **Vida de 150, no de 100.** Con 100 los bots ganaban 14, 3 y 2 de 20 (Fácil, Normal, Difícil); con 150, 19, 12 y 3 (y 18, 12 y 5 con otra tanda de semillas). Es la única cifra de la tabla que se cambió: los daños, las curas y el empuje quedaron como en el plan. Está en `HERO_HP` (`constants.ts`). Con 140 daba 17/9/4 y con 160, 18/11/6.
- **Banderas.** `Ruleset.health`, solo en la Horda. `Character.hp`/`maxHp` los usan ahora también los héroes (se cargan en el constructor de `Simulation` y al reaparecer). `Simulation.applyHeat` resta vida; `coolHeat` cura; `hit` usa `HEALTH_KB` (0,45) en vez de las etapas; `isHurt` y `heroStage` son helpers nuevos. `ZombieDef.heat` pasó a llamarse `dmg` y las constantes de `HORDE` de "enfriar" pasaron a "curar" (`medHeal`, `baseHeal`, `missionHeal`, `healAfter`, `healRate`).
- **Red.** `CharFrame.hp` (fracción) al final del arreglo posicional, con `?? 1` al decodificar; la etapa `st` sale de la vida (`healthStage`: 66 %, 33 %, 15 %). Evento nuevo `broke` (el cuerpo se rompe en el lugar) y campo `br` en `feed` para que el aviso diga "quedó sin vida" y no "se cayó solo". `PROTOCOL_VERSION` pasó de 13 a 14.
- **Piel curtida** ahora recibe 20 % menos de empuje (`skinKb` 0,8; antes 0,85), como pide la tarea; sus textos y los de Sangre fría hablan de daño y de cura.
- **HUD.** Barra de vida con número en el panel del héroe, tooltip propio (`healthTip`), destello rojo en el panel al recibir daño, y una barra bajo el nombre de cada héroe (`BeanView.useHealthBar`, activada con `ViewOptions.health`).
- **Bots.** Vuelven a la mini base con menos de 30 de vida (y siguen hasta 60) y buscan botiquines con menos de 70. El sorteo de cajas da más botiquines si la vida promedio del equipo está por debajo del 60 %.
- **Herramienta.** `scripts/botstats.ts` suma el modo `horde` (`npm run tool:horde [mapa] [partidas] [semilla]`).

**Mediciones** (`npm run tool:horde`, El Refugio, tres bots, 20 partidas por dificultad, vida 150): Fácil 18 a 19 victorias, Normal 12, Difícil 3 a 5. El equipo pierde de 0,7 a 1,2 vidas por partida en Fácil, 4,5 a 5,3 en Normal y 7,7 a 8,4 en Difícil (el contador resta las vidas que gana la mejora "Segundo aliento"); duran unos 220, 250 y 265 s. Ningún héroe terminó con heat distinto de cero (`heat máx 0`) y las muertes por vida en cero y por caída suman las vidas que se pierden.

**Pantalla** (Edge, una pestaña y dos pestañas con host y cliente): la barra del cliente baja de 150 a 103 con un golpe de 40 de daño, vuelve a 150 al curarlo, y desde su pantalla se ve la barra del compañero sobre su cabeza (42 % cuando el host tenía 40 %). Capturas del HUD con la vida llena, a la mitad y casi en cero, y del cuerpo roto, en `tests/e2e/out` (`04-*.png`). `tests/e2e/run.mjs` (Arena) pasa.

**Pendiente de que el usuario lo juegue:** si 150 de vida y los daños del plan se sienten bien, si el empujón fijo de 0,45 alcanza para que la Mole y los barriles se sientan peligrosos (la Mole común, con 13 de empuje, queda justo por debajo del umbral de vuelo), y el efecto de "se rompe en el lugar", que no se pudo ver en movimiento.
