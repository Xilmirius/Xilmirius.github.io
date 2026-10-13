# Carrera de obstáculos

Todos contra todos hasta la meta, de 1 a 6. Sin poderes de héroe: golpes, empujón, salto, dash y los ítems de un solo uso que dan las cajas. Caerse no elimina: reaparecés en la última puerta que pasaste.

Este documento dice cómo está hecho el juego y dónde tocar cada cosa. La plataforma en general está en [PLATAFORMA_Y_MODOS.md](PLATAFORMA_Y_MODOS.md).

## 1. Cómo se corre

- Las **puertas** (franjas amarillas) se pasan en orden y la última es la **meta**. La flecha marca la que te toca.
- Cuando llega el primero quedan **25 s** para que terminen los demás. El que no llega queda ordenado por lo que avanzó.
- Arriba se ve la pista en una tira con un punto por corredor, y a la izquierda tu **puesto** en grande. El puesto se mide por el camino de la pista, no en línea recta: en una curva cerrada va adelante el que más recorrió.
- Las **cajas ❓** reparten según cómo vas: al primero le tocan ítems para molestar (frasco, muralla, onda, ancla) y a la mitad de atrás, para alcanzar (parpadeo, garfio).

Reglas propias de la Carrera (`RULESETS.race` en `src/core/rules.ts`):

| Regla | Qué hace |
|---|---|
| `abilities: false` | Las habilidades del héroe no se usan. El héroe se elige por su peso y su velocidad. |
| `itemBoxes` | Las cajas del mapa dan un ítem. |
| `tileStep` | El **piso flojo** se cae 0,8 s después de pisarlo y vuelve a los 4 s. Se ve más claro y agrietado. |
| `dashBreak: 50` | El **dash rompe la cobertura** contra la que choca: goo y cristal caen de una embestida; la roca, de dos. Los barriles explotan. |

## 2. Las pistas

Cada pista tiene su tema visual, que entra solo al elegirla (`theme` en el mapa).

| Pista | Tema | Qué tiene de propio |
|---|---|---|
| **La Pista** | Cantera | La clásica, en línea recta: pasillo de rotores, campo de paragolpes, zigzag de géiseres con atajo por resorte, plataforma con rotor y recta final con barriles. |
| **El Serpentín** | Atardecer | Tres rectas unidas por dos curvas cerradas. Aceleradores, y dos atajos que cortan las curvas: una viga angosta con un géiser y un puente de piso flojo que se cae detrás del primero que pasa. El tramo final cruza un campo entero de piso flojo. |
| **La Bolera** | Neón | Bolas que ruedan contra vos. Un calentamiento con dos carriles, el callejón (cuatro carriles de bolas y, en los carriles libres, paragolpes que te obligan a cruzarlos), un cruce con bolas que van de lado a lado y los pinos antes de la meta. Es la más corta. |
| **El Derrumbe** | Noche | Una espiral que termina en el centro. Tres paredes para romper a puro dash (la de roca conviene volarla con los barriles), un campo de piso flojo con barriles, eslalon entre rocas, dos zanjas para saltar y una última pared justo antes de la meta. |

Las pistas se escriben en ASCII en `src/core/maps/index.ts` (la leyenda está al principio del archivo). Una pista lleva `kind: 'race'`, una columna de cinco salidas (`*`) que cubre el ancho de la zona de salida, puertas numeradas del `2` al `9` y la meta `F`. Los corredores no aparecen en el centro de esas celdas: `RaceMode.init` los reparte equidistantes sobre el segmento que va del centro de la primera a la de la última, con el orden sorteado en cada carrera (`src/core/race.ts`). Si las `*` de un mapa no están en una sola fila o columna, se usa el reparto por celda de siempre (`Simulation.spawnPoint`).

## 3. Piezas de pista

Además de las que ya tenía la Arena (resortes, paragolpes, rotores, géiseres, barriles), la Carrera suma:

| Pieza | En el mapa | Qué hace |
|---|---|---|
| **Acelerador** | `a` | Pisarlo da 60 % más de velocidad por 1,6 s. |
| **Lanzabolas** | `N` `S` `E` `W` | Tira una bola cada 2,6 s que rueda hacia ese lado hasta donde se termina el piso llano. Te lleva puesto; se salta o se esquiva. El carril se ve pintado en el piso. |
| **Piso flojo** | `,` | El piso frágil de siempre, que con las reglas de la Carrera se cae al pisarlo. |

Los números están en `src/core/gadgets.ts` (`BOOST`, `ROLLER`). Las bolas, como los rotores y los géiseres, salen del mapa y del tick: no viajan por la red y host y clientes las ven en el mismo lugar.

## 4. Copa

En la sala, **Formato** elige entre una carrera suelta y una copa de 3 o de 4 pistas. La copa corre la pista elegida y las que le siguen, cada una con su tema.

- Puntos por puesto: **10, 7, 5, 4, 3, 2**. A igualdad de puntos va adelante el que ganó más carreras.
- Entre pista y pista se ve la tabla; la siguiente larga sola a los 15 s (el host la puede adelantar o terminar la copa). Al final, el podio.
- La copa la lleva el host entre partida y partida (`HostSession.cup` en `src/net/host.ts`). Las cuentas, que no dependen de la red, están en `src/core/cup.ts`.
- Se guardan tu **mejor tiempo en cada pista** y las **copas ganadas**, y se ven en la tarjeta del juego.

## 5. Bots

Corren por el camino a pie hacia la próxima puerta (`decideRace` y `navigate` en `src/core/bots.ts`). Además:

- saltan los rotores y las bolas (los fáciles a veces no las ven venir) y esperan a que dispare el géiser que tienen adelante;
- saltan los huecos de una celda (una zanja o una baldosa caída);
- embisten con el dash la cobertura que les tapa el camino y le pegan hasta que cae; a los barriles no los tocan;
- prefieren los carriles sin bolas y empujan al rival que tienen pegado;
- según la dificultad corren al 86 % (fácil), al 94 % (normal) o a fondo (difícil).

En las partidas de prueba (cinco o seis bots), el primero llega entre los 22 y los 44 s según la pista y la dificultad, el último entre los 30 y los 60, y casi siempre alguno se cae. Llegaron todos en las 204 corridas.

## 6. Lo que falta o hay que decidir jugando

- **Probarlo con gente.** Los tiempos y la dificultad salen de partidas de bots. No se sabe todavía si los atajos del Serpentín le dan demasiada ventaja al que va primero ni si El Derrumbe frena lo suficiente al que abre las paredes.
- Los héroes rompen cobertura a golpes a distinta velocidad (los de cuerpo a cuerpo, más rápido). El dash lo empareja, pero no del todo.
- Plataformas móviles y más pistas.

## 7. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Puertas, puesto, llegada, cajas según el puesto | `src/core/race.ts` |
| Puntos y tabla de la copa | `src/core/cup.ts` |
| Acelerador, bolas y demás artefactos | `src/core/gadgets.ts`, y sus efectos en `updateGadgets` (`src/core/sim.ts`) |
| Reglas (piso flojo, dash que rompe) | `src/core/rules.ts` |
| Pistas | `src/core/maps/index.ts` |
| Cómo se ven los artefactos | `src/render/gadgetsView.ts` |
| Puesto, tira de la pista, resultados y podio | `src/ui/hud.ts` |
| Récords y XP | `src/game/profile.ts` |
