# 06 · Las armas apuntan al punto que marca el cursor, también en altura

## Qué pidió el usuario

"Las armas deberían apuntar a donde está el mouse y a la altura que está el mouse, así disparar desde alto se
siente mejor."

## Qué pasa hoy

- El cliente ya calcula el punto 3D bajo el cursor (`GameView.aimPoint` recorre el rayo de la cámara contra el
  terreno), pero al armar el input (`MatchRunner.buildInput`) solo manda `ax` y `az`. La altura se tira.
- En el host, `castRay` (`src/core/weapons.ts`) dispara **horizontal** desde el pecho. Si encuentra un rival sobre
  la línea, sube o baja sola hasta su pecho, pero solo si está a menos de 2,4 m de altura de diferencia. El cohete
  es un proyectil que "abraza" el piso (`Simulation.updateProjectiles`).

Resultado: desde una plataforma se le pega a lo que está abajo por casualidad, y la cobertura baja tapa tiros que
desde arriba deberían pasar.

## Diseño

**El disparo va del arma al punto apuntado, en tres dimensiones.**

- `InputFrame` gana `ay`, la altura del punto apuntado. Va al final del arreglo de `encodeInput`.
- **Qué se apunta.** Si el rayo del cursor pasa a menos de 0,7 m de un rival (zombi, nido), se apunta a su pecho:
  el que tiene el cursor encima es al que se le quiere dar. Si no, al piso bajo el cursor. Esto lo resuelve el
  cliente con el último frame que tiene.
- **Hacia dónde sale la bala.** Del pecho del héroe hacia el punto apuntado; si lo apuntado es piso, 0,8 m por
  encima (la altura de un pecho). En piso parejo eso da un tiro casi horizontal, como hoy.
- **A quién le da.** Un cuerpo es un cilindro: la bala le da si pasa a menos de su radio (el `BODY_R` de hoy) y,
  en ese punto, entre sus pies y su cabeza, con 0,35 m de perdón arriba y abajo. Desaparecen el ajuste automático
  al pecho y el límite de 2,4 m.
- **Qué la frena.** Lo mismo que hoy, recorriendo el rayo con `CollisionWorld.solidAt`, que ya es 3D: una bala que
  baja desde una plataforma pasa por encima de la cobertura baja.
- **Desvío y perdigones** siguen siendo un abanico horizontal alrededor de la dirección apuntada.
- **Alcance:** el del arma, medido sobre el rayo.
- **Cohete:** vuela recto hacia el punto apuntado, con su componente vertical, y explota contra lo primero que
  toca (cuerpo, pared o piso) o al final del alcance. Los demás proyectiles del juego siguen abrazando el piso.
- **Con los dedos** (`TouchInput.aim`, `MatchRunner.aimTarget`): el punto apuntado es el piso a esa distancia o,
  con la ayuda de apuntado, el rival elegido; `ay` sale de ahí.
- **Bots** (`BotBrain.aimAt`): apuntan a la altura de su blanco.
- Las habilidades de los héroes en Arena y Asedio siguen usando solo `ax` y `az`.

La traza ya viaja con sus tres coordenadas en el evento `shot`, así que se dibuja sola en diagonal.

## Listo cuando

Con un script descartable sobre El Refugio (tiene una plataforma con rampas):

- un héroe en la plataforma le da a un zombi que está abajo, a 6 m, apuntándole al pecho, y no le da si apunta al
  piso 3 m más allá;
- con cobertura baja entre los dos, desde la plataforma la bala llega al zombi y desde el piso no;
- un héroe abajo le da a un zombi parado en la plataforma apuntándole a él;
- en piso parejo, una ráfaga a un zombi a 10 m acierta la misma cantidad de balas que antes del cambio (±10 %);
- el cohete apuntado al piso de abajo desde la plataforma explota ahí, no al final del alcance.

Además, una partida de bots sin pantalla termina con una precisión parecida a la de antes (anotar las dos), y en
pantalla la traza sale inclinada al disparar desde arriba (captura). `docs/ZOMBIS.md` §4 ("Cómo se resuelven los
disparos") cuenta lo nuevo.

## Notas de ejecución

**Lo que quedó distinto del plan**

- `ay` es la altura del punto apuntado **tal cual** (el piso bajo el cursor o el pecho del rival), no la de la bala. El host decide: si el punto está sobre el piso (`ay` a menos de 0,3 m de `groundAt`), la bala va 0,8 m más arriba; el cohete va al punto sin sumar nada, así apuntado al piso explota en el piso. Sin `ay` (bots sin blanco, zombis, clientes viejos) el tiro sale horizontal. Se manda solo si es un número: el arreglo de la red queda en 6 elementos cuando no hay altura. `PROTOCOL_VERSION` 17.
- Cuando el cursor tiene encima a un rival, el cliente manda **también `ax` y `az` del rival** (si no, el piso detrás de él haría pasar la bala por debajo del pecho). Solo con reglas de armas. Si hay una habilidad en el slot, apunta al rival y no al piso: en la Horda no hay habilidades, así que no se nota.
- La pendiente del tiro se limita a ±1,2 y se calcula con una distancia mínima de 1,5 m, para que un cursor pegado a los pies no dispare derecho al piso.
- Los demás proyectiles siguen igual. El cohete lleva `free` y `dirY` (`ProjSpec`, `Projectile.free`): vuela recto, velocidad y alcance medidos sobre el rayo. Su malla no se inclina (el snapshot no trae `vy`); se ve volar en diagonal pero apuntando de lado.
- Los bots apuntan al pecho de su blanco (zombi o nido). Siguen eligiendo solo zombis a menos de 2,4 m de diferencia de altura.
- `scripts/botstats.ts` (`tool:horde`) ahora imprime la **precisión** (balas que dan en un cuerpo sobre balas disparadas, sin cohetes).

**Listo cuando, con un script descartable sobre El Refugio** (borde de la plataforma de 1,5 m en (-7,-2), 200 tiros de pistola por caso)

| Caso | Resultado |
|---|---|
| Plataforma → zombi abajo a 6 m, apuntándole al pecho | 200/200 |
| Mismo, apuntando al piso 3 m **más acá** | 0/200 |
| Mismo, sin altura (como el código viejo sin el ajuste automático) | 0/200 |
| Cobertura baja (1 m) entre los dos: desde la plataforma / desde el piso | 200/200 / 0/200 |
| Desde abajo a un zombi en la plataforma, apuntándole | 200/200 |
| Piso parejo, zombi a 10 m: antes / ahora | 200/200 / 200/200 |
| Cohete al piso a 6 m desde la plataforma | explota a 6,5 m, a ras de piso (alcance 26 m) |

El punto del plan "no le da si apunta al piso 3 m **más allá**" no se puede cumplir con un cuerpo que mide 1,45 m: la recta del pecho al piso de más allá pasa a 0,8 m a la altura del zombi. Con el piso 3 m **más acá** sí falla, que es lo que importa (apuntar mal en altura no pega). Con el cursor sobre el zombi el cliente lo detecta y apunta a su pecho.

**Bots, 20 partidas por dificultad en El Refugio (semilla 5000), antes → después**

| | Fácil | Normal | Difícil |
|---|---|---|---|
| Precisión | 56,8 % → 57,1 % | 57,8 % → 58,4 % | 54,9 % → 56,9 % |
| Victorias | 16 → 18 | 13 → 13 | 6 → 11 |

La precisión es la misma. Ganan más en Difícil porque ahora le dan a lo que tienen abajo o arriba; sigue dentro de las bandas de la tarea 04 (Difícil ≤ 13), así que no se tocó la dificultad.

**En pantalla (Edge)**: con el mouse sobre el zombi de abajo, desde la plataforma, el héroe le saca vida (la traza del evento `shot` baja de y 2,3 a 1,0); salpicón visible. Pasan `touch.mjs horde` y el E2E de Arena con dos pestañas (el input con `ay` viaja por la red). La captura (`tests/e2e/out/aim06-desde-arriba.png`) no deja ver la inclinación porque la cámara mira desde arriba.

**Pendiente de que lo juegues**: si apuntar al cursor desde una plataforma se siente justo (el radio de 0,7 m para elegir al rival, el perdón de 0,35 m), y si el cohete merece inclinarse en pantalla.

