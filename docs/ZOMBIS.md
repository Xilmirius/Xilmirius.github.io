# Horda: cooperativo con armas

> Estado: **implementado**. Este documento cuenta cómo quedó, dónde vive cada cosa y qué falta.
> La dificultad está ajustada con partidas de bots sin pantalla, no con gente: los números son un punto de partida.

## 1. La idea

Cooperativo de 1 a 6 contra zombis, **con armas en vez de poderes**. Las oleadas salen por tiempo y no paran de crecer, así que no se gana "limpiando todo": se gana cumpliendo una cadena de **misiones** en el mapa y llegando a la **extracción**. Se pierde cuando a nadie le quedan vidas.

Pilares:

1. **Las armas se sienten**: ráfaga de uzi, escopetazo que tira para atrás, cohete y C4 que mandan zombis al vacío.
2. **Siempre hay algo que hacer además de sobrevivir**: un objetivo marcado que obliga a moverse y a defender una posición.
3. **Lo que ganás queda**: cada zona asegurada es una **mini base** que ayuda en lo que sigue, y cada misión cumplida te da una **mejora** a elegir.

## 2. Dónde vive cada cosa

| Pieza | Dónde |
|---|---|
| El juego en la plataforma (reglas fijas, cooperativo, dificultad, vitrina) | `src/core/games.ts` (`GAMES.horde`) |
| Su mapa, **El Refugio** (`kind: 'horde'`) | `src/core/maps/index.ts` |
| Reglas: sin poderes, con armas (`weapons`), piso frágil que se rearma en 12 s | `src/core/rules.ts` (`horde`) |
| Armas, disparo instantáneo, cohete y C4 | `src/core/weapons.ts` |
| Mejoras: la lista y sus números | `src/core/perks.ts` |
| Oleadas, IA de zombis, misiones, nidos, jefe, mini bases y cajas | `src/core/horde.ts` |
| Grafo de celdas caminables, campo de distancias y ruta de los zombis (§10) | `src/core/nav.ts` |
| Bots que disparan, van al objetivo, juntan cajas y plantan C4 | `src/core/bots.ts` (`decideHorde`) |
| Trazas, C4 en el piso, cajas, mini bases y arma en la mano | `src/render/hordeView.ts`, `src/render/beanView.ts` |
| Nido y Mole Madre | `src/render/propsView.ts`, `src/render/mobaView.ts` |
| Arma y munición, misión en curso, cartas de mejora, racha, resultados | `src/ui/hud.ts` |
| Récords personales | `src/game/profile.ts` |
| Sonidos de las armas | `src/audio/audio.ts` |

## 3. Controles

| Entrada | En la Horda |
|---|---|
| Clic izquierdo (mantener) | **Disparar** el arma que tenés en la mano |
| Clic derecho | Empujón (saca zombis de encima sin gastar balas) |
| Tecla de la primera habilidad (`Q`), rueda del mouse, teclas `1` a `4` | **Cambiar** de arma: `Q` y la rueda pasan a la siguiente que tenga balas, `1` a `4` eligen directo (pistola, uzi, escopeta, lanzacohetes; con una mejora para elegir en pantalla, esas teclas son de la mejora) |
| Tecla de la forja (`C`) o el botón ⚒️ | Abrir el **taller** de armas |
| Tecla de la ulti (`E`) | **Plantar C4** |
| Shift / Espacio | Dash / salto |

Los héroes se diferencian por su peso y su velocidad, no por poderes. Las otras dos teclas de habilidad avisan que acá no se usan.

## 4. Armas

Se empieza con la pistola, un arma cargada (uzi o escopeta, alternadas entre los héroes) y una carga de C4. Se llevan **todas** las armas que se juntan: una caja de un arma que no tenías la suma en nivel 1 y la saca; una de un arma que ya tenías le suma balas (hasta el triple de una caja) y, si estaba vacía, la saca. Un arma sin balas **no se pierde** (ni su nivel): se pasa sola a la pistola y queda vacía hasta la próxima caja.

| Arma | Cadencia | Daño | Empuje | Alcance | Balas por caja | Paso al disparar |
|---|---|---|---|---|---|---|
| **Pistola** | 0,30 s | 11 | 2,5 | 19 m | infinitas | 85 % |
| **Uzi** | 0,07 s | 5 | 1 | 16 m | 120 | 70 % |
| **Escopeta** | 0,70 s | 8 × 7 perdigones | 4,5 c/u (tope 15) | 9,5 m | 18 | 75 % |
| **Lanzacohetes** | 1,0 s | 48 en área (3,3 m) | 17 | 26 m | 6 | 60 % |
| **C4** | — | 65 en área (4,6 m) | 22 | a tus pies | 2 cargas (hasta 4) | — |

El daño a zombis se multiplica por `HORDE.heroVsUnit` (1,6). **Disparar frena**: mientras tirás te movés a una fracción de tu velocidad, así que hay que elegir entre correr y tirar. Los zombis comunes son más lentos que un héroe, los Corredores no.

### Chatarra, niveles y taller

Los zombis sueltan **chatarra** (🔩): trozos que se juntan pasando cerca, con el imán de siempre (`rules.pickups === 'scrap'`, `Simulation.dropMaterials` / `updatePickups`). Zombi y corredor 1, escupidor 2, Mole 6, Mole Madre 30 y nido 10 (`ZOMBIES[...].scrap`, `HORDE.nestScrap`); los que caen al vacío la sueltan en el último lugar firme que pisaron. **Es del equipo**: la que junta uno se suma al contador de todos los que siguen en juego, y cada uno gasta el suyo.

Cada arma tiene **cinco niveles**; subir de nivel cuesta 15, 30, 50 y 80 de chatarra (`UPGRADE_COST`):

| Nivel | Qué da |
|---|---|
| 2 y 4 | +35 % de daño cada uno |
| 3 | Lo propio del arma y 50 % más balas por caja |
| 5 | El remate del arma |

| Arma | Nivel 3 | Nivel 5 |
|---|---|---|
| Pistola | La bala atraviesa un zombi más | Cada bala explota en chico al dar |
| Uzi | 30 % más de cadencia | Balas incendiarias: el zombi arde 3 s |
| Escopeta | 3 perdigones más | Derriba: el doble de empuje y 25 % más de alcance |
| Lanzacohetes | Explosión 30 % más grande | Racimo: tres explosiones chicas alrededor un instante después |

Las cuentas están en `weaponStats` (`weapons.ts`); las mejoras de misión se aplican encima. El nivel se ve (traza más gruesa y larga, y rosa en el 5; el arma de la mano brilla) y se oye (más grave y fuerte).

El **taller** es una mini base o el campamento de salida (el centro de los puntos de aparición, con el mismo radio `HORDE.baseR`). Se abre con la tecla de la forja o el botón ⚒️, no frena la partida y lo valida la simulación (`upgradeWeapon`): comprar fuera de un taller, sin chatarra o sin el arma no cambia nada. La fila de arriba de la barra muestra las cuatro armas (nivel, balas, cuál está en la mano) y la chatarra; tocar una ficha saca esa arma.

### Cómo se resuelven los disparos

- **Se apunta adonde marca el cursor, también en altura.** El cliente manda `ay` junto con `ax` y `az` (`InputFrame`, al final del arreglo de la red): el pecho del rival si el cursor lo tiene encima (el rayo de la cámara pasa a menos de 0,7 m de su pecho; con los dedos, a menos de 0,6 m del punto apuntado), o el piso bajo el cursor. Los bots mandan el pecho de su blanco. Sin `ay` el tiro sale horizontal.
- **Pistola, uzi y escopeta: impacto instantáneo** en el host (`castRay`). La bala sale del pecho del héroe hacia el punto apuntado (si es piso, 0,8 m por encima: un pecho; con el piso parejo el tiro es casi horizontal, como antes). Un cuerpo es un **cilindro**: le da si pasa a menos de su radio y, ahí, entre sus pies y su cabeza con 0,35 m de perdón. El rayo se recorre en pasos de 0,3 m contra `CollisionWorld.solidAt` (3D): una bala que baja desde una plataforma pasa por encima de la cobertura baja, y el piso la frena. El alcance se mide sobre el rayo. El desvío y los perdigones siguen siendo un abanico horizontal.
- Cada disparo viaja como un evento **`shot`** con el punto de llegada de cada bala y qué tocó. Con eso los clientes dibujan la traza, el fogonazo y el impacto. No hay proyectiles en el snapshot.
- Los perdigones de la escopeta que dan en el mismo cuerpo son **un solo golpe**: de cerca lanza a un zombi.
- Las balas de la uzi no generan además el evento de golpe (`HitSpec.quiet`): alcanza con la traza y evita inundar el canal.
- Una bala que da en un obstáculo le hace daño: **los barriles explotan a tiros** y los nidos se rompen a balazos.
- **Cohete**: proyectil con explosión que vuela **recto** hacia el punto apuntado, con su pendiente (no abraza el piso como los demás proyectiles; el snapshot trae su `vy` y el modelo se inclina), y explota contra lo primero que toca o al final del alcance. Apuntado al piso explota en el piso. **C4**: aviso en el piso, mecha de 2,2 s y explosión. Ninguna explosión propia lastima al equipo; sí rompen piso frágil y hacen estallar barriles.

## 5. Misiones

Una a la vez, anunciada en pantalla y con su barra arriba. La lista está en `MISSIONS` (`horde.ts`).

| # | Misión | Qué hay que hacer |
|---|---|---|
| 1 | **Encender el generador** | 30 s acumulados con alguien dentro de la zona |
| 2 | **Destruir los nidos** | 3 nidos en los bordes (2 jugando solo); mientras vivan, escupen zombis |
| 3 | **Asegurar la antena** | Otra zona, lejos de la primera, 34 s |
| 4 | **Juntar el combustible** | 3 bidones repartidos por el mapa: pasar por encima |
| 5 | **Derribar a la Mole Madre** | Un jefe con escolta; su golpe avisa el área antes de caer |
| 6 | **Extracción** | 20 s con la mitad de los que siguen en juego dentro de la zona. **Se gana.** |

Con zombis dentro de la zona, avanza a la mitad. Las zonas salen de los puntos de zona del mapa y del centro de cada grupo de salida; cada una, lo más lejos posible de la anterior.

### Mini bases

Cada zona asegurada queda como mini base: una **torreta** que no vence, un lugar donde **curarse** más rápido (+7 de vida por segundo), el punto donde **reaparecen** los que caen, y una caja de suministros de premio.

### El mapa

La Horda se juega en su propio mapa, **El Refugio**, y no en las arenas del brawler: un fuerte elevado en el centro con dos entradas, pasillos entre muros, cobertura y barriles. Los mapas de la Horda **no llevan artefactos de pista** (resortes, paragolpes, rotores, géiseres): son de la Arena y de la Carrera, y en un juego de zombis no pintan nada. Hay un test que lo exige. Los barriles sí van, porque explotan a tiros.

## 6. Mejoras

Al cumplir cada misión (menos la extracción), **cada héroe elige una mejora entre tres**. Se acumulan hasta el final, así que cada partida arma un personaje distinto: el que tira rápido, el de las explosiones, el que aguanta. Son cinco elecciones por partida.

- Aparecen tres cartas sobre la barra. Se elige con las teclas `1`, `2` y `3` o con un clic. Hay 20 s; si no elegís, se te da la primera. La partida no se frena, pero al cumplir una misión la próxima oleada no sale antes de 7 s.
- La oferta se sortea por peso entre las que todavía podés subir. Si se cumplen dos misiones seguidas, la segunda oferta espera a que elijas la primera.
- Las que ya tenés se ven en una fila sobre la barra, con su nivel. Lo que eligen los demás aparece en el costado.
- Los bots eligen solos (al azar) al segundo.

| Mejora | Qué hace | Niveles |
|---|---|---|
| 🔥 **Pólvora brava** | +25 % de daño con todas las armas | 3 |
| ⚡ **Gatillo fácil** | Disparás 20 % más rápido | 3 |
| 🦅 **Ojo de halcón** | 15 % de golpes críticos: daño ×2,5 y más empuje | 3 |
| 🎯 **Balas perforantes** | Cada bala atraviesa un zombi más | 2 |
| 💣 **Reacción en cadena** | El zombi que bajás explota y lastima a los de al lado; los que caen por esa explosión explotan también | 2 |
| 🎒 **Bandolera** | Las cajas traen 50 % más balas, y te recarga todas las armas al elegirla | 2 |
| ❄️ **Sangre fría** | Cada zombi que bajás te cura 2,5 de vida | 2 |
| 🛡️ **Piel curtida** | Recibís 20 % menos de daño y te empujan menos | 2 |
| 🧨 **Demoledor** | +2 cargas de C4 ahora, llevás 2 más y explotan más grande | 2 |
| ❤️ **Segundo aliento** | +1 vida; si hay un compañero eliminado, vuelve al juego con una vida | 2 |
| 👟 **Piernas livianas** | Disparar ya no te frena y corrés 8 % más | 1 |
| 🔫 **Pistolas gemelas** | La pistola dispara de a dos balas | 1 |
| 🗼 **Torreta de bolsillo** | Planta una torreta a tu lado por 90 s | sin tope |

La lista y los números están en `src/core/perks.ts`; quién las ofrece y lo que hacen al elegirlas, en `horde.ts` (`tickPerks`, `onPerk`); lo que cambian de las armas, en `weapons.ts`. La elección viaja como un comando (`perk`) y el estado, en el frame propio de cada jugador (`MeFrame.pk`, `of`, `ot`).

**La horda también crece.** Con las mejoras solas el final era un paseo (en las pruebas, los bots ganaban siempre sin caerse), así que por cada misión cumplida los zombis aguantan 30 % más, pegan 8 % más y salen 20 % más (`HORDE.threatHp`, `threatDmg`, `threatCount`; con armas que suben de nivel los números anteriores, 15 / 7 / 15, quedaban cortos). Vale también para los nidos que escupen, la escolta y el jefe.

### Que disparar se sienta

- **Marca en el cursor**: blanca cuando tus balas dan, dorada si fue crítico y roja cuando bajás a uno. Cada una con su sonido; las bajas seguidas suenan cada vez más agudas.
- **Racha de bajas**: desde tres bajas seguidas (sin que pasen 3,5 s) aparece el contador, con sus escalones (¡Racha!, ¡Carnicería!, ¡Masacre!...).
- Un crítico se ve en la traza (más gruesa y dorada) y siempre muestra su número, aunque el arma sea la uzi.

## 7. Resultados y récords

La pantalla de resultados de la Horda es propia: dice hasta qué oleada y cuántas misiones llegó el equipo, y cuenta zombis, cosas rotas, cajas y caídas en vez de ring-outs. Cada juego define sus columnas y sus premios (`BRAWL_RESULTS`, `HORDE_RESULTS` en `ui/hud.ts`).

Se guardan **récords personales** en el perfil local: extracción más rápida y oleada más alta (por dificultad), más zombis en una partida y racha más larga. Al superarlos se avisa en los resultados, y se ven en la tarjeta del juego en la vitrina.

## 8. Oleadas, cajas y dificultad

- **Oleadas**: la primera a los 5 s y después una cada 22 s, sin esperar a que se limpie la anterior (si no queda ningún zombi, la siguiente sale en 4 s). Crecen con el número de oleada y con la cantidad de héroes; después de la 12 siguen creciendo a la mitad del ritmo.
- **Zombis**: Zombi (lento), Corredor (rápido y frágil), Escupidor (a distancia, avisa dónde cae) y Mole (enorme, golpe en área que se ve venir). Hay un tope de zombis vivos a la vez que sube con los héroes.
- **Cajas**: cae una cada 15 s (hasta 3 en el mapa) con uzi, escopeta, lanzacohetes, C4 o un botiquín que cura a los de alrededor. Se agarran pasando por encima. Viajan en el estado del modo (`ModeHud.horde.crates`).
- **Vida**: acá los héroes tienen **barra de vida** (150) en vez de heat; es la regla `health` de `Ruleset`, que solo prende la Horda. Cada golpe de zombi resta su daño (`ZOMBIES[...].dmg`: 8 zombi, 5 corredor, 7 escupidor, 14 mole, 19 Mole Madre, por la dificultad y por la misión en curso). En cero el héroe **se rompe en el lugar**, pierde una vida y reaparece en la última mini base con la vida llena; caer al vacío también cuesta una vida. Los golpes **empujan siempre igual y poco** (`HEALTH_KB` = 0,45, sin etapas): un zombi común apenas corre al héroe, la Mole Madre y los barriles sí lo lanzan. La barra se cura sola (5 por segundo tras 3 s sin recibir golpes), en una mini base (+7 por segundo), con un botiquín (+60 a él y a los que tenga cerca) y al cumplir una misión (+30 a todos). Cada misión cumplida también **sube la vida máxima de todos en 15** (`HORDE.missionMaxHp`) y cura esa cantidad: con las seis llegan a 240. El cuerpo se agrieta al perder vida (la etapa sale de la fracción: 66 %, 33 %, 15 %), así que el latido y el borde rojo de peligro siguen andando. Lo que lo implementa: `Simulation.applyHeat` (daño), `coolHeat` (cura), `hit` (empuje) y `die(ch, true)` (evento `broke`). Arena, Asedio y Carrera siguen con heat.
- **Dificultad** (la elige el host): Fácil, Normal y Difícil cambian cuántos zombis salen y cuánto pegan (`HORDE_LEVELS`).

Con la vida en 150 y tres bots en El Refugio (20 partidas por dificultad, `npm run tool:horde`), ganan 16 a 18 de 20 en Fácil, 13 en Normal y 6 a 9 en Difícil (con armas que suben de nivel y la vida máxima por misión); el equipo pierde de 1 a 8 vidas por partida y una partida dura unos 220 a 270 s. Con 100 de vida ganaban 14, 3 y 2, y con heat (antes de la tarea 04) ganaban casi todas. El resultado cambia mucho de una partida a otra, más que entre dificultades.

## 9. Lo que falta o hay que decidir jugando

- **Probarlo con gente**: todo el ajuste viene de bots, que apuntan mejor y se organizan peor que una persona. Vale el doble para las mejoras: los bots eligen al azar, una persona va a armar combinaciones (cadena + perforantes + crítico) y hay que ver si alguna rompe el juego.
- **Más mapas**: hay uno solo.
- **Más misiones**: escoltar una carga, llevar algo de un punto a otro, proteger a un sobreviviente.
- ¿El C4 con mecha alcanza, o conviene detonarlo a distancia?
- ¿Recarga de cargador, o solo munición total como está?
- ¿Las explosiones propias deberían empujar (sin daño) a los compañeros?

## 10. Cómo caminan los zombis

Un módulo propio, `src/core/nav.ts` (`Nav`), que `HordeMode` usa en lugar del viejo campo por celdas y de `steer` (los esbirros del Asedio siguen con `steer`). Solo corre en el host.

- **El grafo.** Los nodos son las celdas caminables del plano. Hay una arista a cada vecina (las ocho) si un cuerpo **la puede caminar de verdad**: `Nav.walk` recorre el segmento entre los dos centros de a 0,25 m contra el mismo `CollisionWorld` del movimiento, siguiendo el piso. Falla si no hay piso, si hay que subir más de `STEP_UP` o si un cuerpo de radio `CHAR_RADIUS` choca con algo. Bajar es una arista de un solo sentido (hasta 2 m, cuesta un poco más). Las diagonales piden que las dos celdas de los costados también sean nodos. Con esa única regla las rampas se entran por la punta baja y se salen por la alta, y la cobertura, los nidos y las torretas cortan las aristas que tapan. Las celdas pegadas al vacío cuestan más.
- **Cuándo se rehace.** `Simulation.obstacleRev` sube cada vez que cambia la lista de obstáculos; `Nav.update` compara con la lista anterior y las losas que se cayeron, y rehace solo las aristas a una celda de lo que cambió.
- **El campo.** Distancia a pie al héroe vivo más cercano (en celdas), con un montículo y hacia atrás por las aristas, cada 0,4 s. Cada héroe siembra su celda; si no es un nodo (está sobre un muro o una cobertura), el nodo más cercano a no más de 3 m. Así, con un héroe fuera de alcance, los zombis se juntan al pie. Los bordes por donde salen los zombis que el campo no alcanza (cerrados por un nido, una cobertura o piso caído) no se usan: dejaban al zombi encerrado.
- **Seguir el campo.** Cada 0,2 s el zombi elige el vecino que más baja y, de los dos nodos siguientes, el más lejano que se alcanza en línea recta (corta las esquinas). Con el blanco a menos de 2,6 m y camino libre va derecho. A la dirección se le suma un empuje que lo aleja de los zombis a menos de 1 m. El escupidor retrocede por el grafo (el vecino que más lo aleja).
- **Trabado, por avance.** Cada zombi recuerda cuánto le faltaba (por el camino) la última vez que se acercó medio metro. Si en 2,5 s no mejoró (ni se movió 2 m), prueba el segundo mejor vecino un segundo (`HORDE.stuckAfter`, `stuckAlt`); si a los 6 s sigue igual (`HORDE.stuck`) reaparece por otro borde, que es el último recurso. No cuenta como trabado estar peleando, esperar a menos de 3 m del héroe por el camino ni hacer cola detrás de dos zombis más cerca.
- **Medirlo:** `npm run tool:stuck [mapa] [partidas]` corre partidas de Horda con tres bots y cuenta zombis salidos, reubicados, segundos-zombi sin avanzar y caídos solos al vacío. Con El Refugio, 20 partidas: antes 4,52 % reubicados y 10,34 % de segundos sin avanzar; después 0,16 % y 0,21 %.
- Un cuerpo que cae pegado a una pared (de una rampa, de una plataforma) queda encimado y `moveAxis` le prohibía moverse en cualquier dirección. Ahora alejarse del obstáculo con el que está encimado siempre se permite (`src/core/movement.ts`).
