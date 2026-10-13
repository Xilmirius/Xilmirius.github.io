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
