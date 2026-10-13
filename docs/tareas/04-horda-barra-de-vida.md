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
