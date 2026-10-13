# 05 · Horda: llevar todas las armas, chatarra y taller

## Qué pidió el usuario

"Las armas deberían juntarse y poder upgradearse porque al final no se sienten tan poderosas." Hoy se lleva la
pistola más **una** sola arma: una caja de otra la reemplaza y, sin balas, el arma se pierde. La horda crece con
cada misión y las armas no.

Queda así: se llevan **todas** las armas que se juntan, los zombis sueltan **chatarra**, y con la chatarra se sube
de nivel cada arma en un **taller**.

## Inventario

- Cada héroe tiene, por cada arma de `WEAPON_IDS`, un nivel (0 = no la tiene) y sus balas. Reemplaza a
  `Character.primary` y `Character.ammo`. La pistola se tiene siempre, en nivel 1.
- Una caja de un arma que no se tiene la suma en nivel 1 con las balas de una caja. Una caja de un arma que ya se
  tiene suma balas, hasta el triple de una caja.
- Un arma sin balas **no se pierde**: se pasa sola a la pistola y el arma queda vacía hasta la próxima caja.
- **Cambiar de arma:** la tecla de la primera habilidad (`Q`) pasa a la siguiente que tenga balas; la rueda del
  mouse va a la siguiente o a la anterior; las teclas `1` a `4` eligen directo, salvo cuando hay una oferta de
  mejora en pantalla (`Hud.perkKey` las toma primero). Elegir directo viaja como un comando nuevo (como `perk`),
  validado en `parseCommand`.
- Se empieza como hoy: pistola más uzi o escopeta, alternadas entre los héroes.

## Chatarra

- Los zombis la sueltan al morir como trozos que se juntan pasando cerca. El sistema ya existe: son los `Pickup`
  de `Simulation.dropMaterials` / `updatePickups` (imán, vida útil, tope y vuelo hacia el HUD incluidos), que la
  Horda hoy tiene apagados (`pickups: 'none'`). Suma un valor nuevo a `Ruleset.pickups`.
- **Es del equipo:** la junta uno y suma para todos los héroes que siguen en juego.
- Cuánto sueltan: zombi 1, corredor 1, escupidor 2, mole 6, Mole Madre 30, nido 10. Los zombis que caen al vacío
  la sueltan igual, en el borde por el que cayeron.

## Niveles

Cinco por arma. Punto de partida:

| Nivel | Cuesta | Qué da |
|---|---|---|
| 2 | 15 | +35 % de daño |
| 3 | 30 | Lo propio del arma (abajo), y cada caja trae 50 % más balas |
| 4 | 50 | Otro +35 % de daño |
| 5 | 80 | El remate del arma (abajo) |

| Arma | Nivel 3 | Nivel 5 |
|---|---|---|
| Pistola | Atraviesa un zombi más | Cada bala explota en chico al impactar |
| Uzi | 30 % más de cadencia | Balas incendiarias: el zombi arde 3 s |
| Escopeta | 3 perdigones más | Derriba: el doble de empuje y 25 % más de alcance |
| Lanzacohetes | Explosión 30 % más grande | Racimo: tres explosiones chicas alrededor un instante después |

La tabla vive junto a `WEAPONS` (`src/core/weapons.ts`) y `fireWeapon` lee las estadísticas ya resueltas para el
nivel. Las mejoras de misión (`src/core/perks.ts`) se siguen aplicando encima.

El nivel **se tiene que ver**: la traza más gruesa o de otro color, un brillo en el arma que lleva el personaje y
un sonido más pesado. Subir de nivel se festeja en pantalla.

## Taller

- Se abre con la tecla de la forja (`forge`) y con un botón en los controles táctiles. El esqueleto es el de la
  forja del Asedio (`Hud.toggleForge` / `renderForge`): un panel con las armas, su nivel, lo que da el siguiente y
  lo que cuesta.
- **Funciona dentro de una mini base** (`HORDE.baseR`) **o en el campamento de salida** (el centro de los puntos
  de aparición del equipo, con el mismo radio). Fuera de ahí, el panel avisa dónde está el taller.
- Comprar es un comando nuevo; lo valida la simulación (que tenga el arma, que alcance la chatarra, que esté en un
  taller).
- La partida no se frena con el panel abierto.

`MeFrame` reemplaza `pri` y `am` por el inventario, la chatarra y si está en un taller.

## Qué tocar además

- **HUD** (`Hud.renderGuns`, `Hud.buildBar`): una fila con las cuatro armas (nivel, balas, cuál está en la mano) y
  el contador de chatarra.
- **Bots** (`BotBrain.decideHorde`): hoy eligen entre "la principal o la pistola". Ahora, entre las que tienen con
  balas según la distancia (escopeta de cerca, cohete de lejos y sin zombis encima). Compran solos cuando pasan
  por un taller: primero el arma que más usan.
- **Dificultad.** Con armas que crecen, `HORDE.threatHp` y `threatCount` probablemente queden cortos. Se reajustan
  para volver a la banda de victorias de la tarea 04.
- **Textos:** la ayuda del juego y `docs/ZOMBIS.md` §3 (controles), §4 (armas) y §8 (cajas).

## Listo cuando

- Sin pantalla, 20 partidas por dificultad con tres bots: misma banda de victorias que pide la tarea 04. Anotar
  cuánta chatarra junta el equipo por misión y a qué nivel llega cada arma al final.
- En esas partidas, al llegar a la quinta misión cada bot tiene al menos un arma en nivel 3.
- Ningún arma se pierde al quedarse sin balas, y un comando de compra fuera del taller o sin chatarra no cambia nada.
- En pantalla, con dos pestañas: el cliente junta una segunda arma y conserva la primera, cambia con `Q`, con la
  rueda y con las teclas, abre el taller en la mini base, sube un arma y la traza cambia. Capturas del HUD de armas
  y del taller.
- `npm run test:touch` pasa y el taller se puede abrir y usar con los dedos.
