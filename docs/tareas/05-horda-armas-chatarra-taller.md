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

## Notas de ejecución

Hecho como lo planteaba la tarea, con estos desvíos y datos:

- **Inventario.** `Character.primary` y `ammo` se reemplazaron por `wLv[4]` (nivel de cada arma, 0 = no la tiene), `wAmmo[4]` y `scrap`. `giveWeapon` suma el arma en nivel 1 o suma balas (tope: tres cajas); un arma que se queda sin balas conserva su nivel y la mano pasa a la pistola. `MeFrame` cambia `pri`/`am` por `wl`, `wa`, `sc` (chatarra) y `ws` (está en un taller); `CharFrame` suma `wlv` (nivel del arma en la mano). Eventos: `shot` lleva `lv`, y hay `wup` (subió de nivel) y `burn` (un zombi prendido). `PROTOCOL_VERSION` pasó de 15 a 16.
- **Comandos nuevos** (`parseCommand` los valida como `perk`): `weapon` (sacar el arma i: la rueda y las teclas 1 a 4) y `upgrade` (comprar el siguiente nivel de i). `upgradeWeapon` verifica que haya reglas de armas, que el héroe esté vivo, que tenga el arma, que no esté al máximo, que esté en un taller (`GameMode.workshop`, que en la Horda es una mini base o el campamento) y que alcance la chatarra; si algo falla, avisa y no cambia nada.
- **Chatarra.** Es un valor nuevo de `Ruleset.pickups` (`'scrap'`). La junta cualquiera y suma +1 a cada héroe que no está eliminado; cada uno gasta la suya. Los zombis que caen al vacío la sueltan en el último lugar firme que pisaron (`ZombieAI.gx/gy/gz`). Cantidades como en la tarea (1/1/2/6/30 y 10 por nido).
- **Efectos de nivel** en `weaponStats` (`weapons.ts`): +35 % de daño en el 2 y el 4 (suman), y los del 3 y el 5 como en la tabla. El racimo del lanzacohetes usa un gancho nuevo `BlastSpec.then`; el fuego del uzi es `Simulation.ignite` (un golpecito de 3 de daño cada 0,5 s durante 3 s, solo a zombis).
- **Se ve y se oye.** Traza más gruesa y larga con el nivel y rosa en el 5; el arma de la mano brilla y en el 4 crece un poco; los disparos suenan más graves y fuertes; subir de nivel hace columna de luz, anillo y cartel.
- **HUD.** Una fila sobre la barra con las cuatro armas (nivel, balas, cuál está en la mano; tocarla la saca) y el contador de chatarra, que se marca verde en un taller. El taller reutiliza el panel de la forja (`renderWorkshop`): nivel, qué da el siguiente, costo y botón. Con los dedos, el botón ⚒️ lo abre.
- **Bots.** Eligen el arma por distancia (cohete de lejos y sin zombis encima, escopeta de cerca, uzi, pistola) llamando a `selectWeapon`; compran al pasar por un taller (primero escopeta o uzi, la que traen) y van hasta uno a menos de 24 m cuando les alcanza para subir esa arma.
- **Dificultad.** Con armas que crecen, `HORDE.threatHp`, `threatCount` y `threatDmg` pasaron de 0,15 / 0,15 / 0,07 a 0,3 / 0,2 / 0,08. Sin tocarlos, los bots ganaban 8, 7 y 8 de 8 partidas.
- **Herramienta.** `npm run tool:horde` ahora imprime también la chatarra juntada, la misión alcanzada y el nivel medio final de cada arma.

**Mediciones** (`npm run tool:horde`, El Refugio, tres bots, 20 partidas por dificultad, con la vida máxima por misión de la tarea 04): ganan 16 de 20 en Fácil, 13 en Normal y 6 en Difícil (otra tanda de semillas: 18, 13 y 9). Los equipos juntan unos 430 a 450 de chatarra por partida y les sobran de 65 a 110 por héroe (los bots solo gastan en un arma). Al llegar a la quinta misión, **todos los bots tienen al menos un arma en nivel 3** en las 57 partidas que llegaron. Nivel final medio por arma (pistola / uzi / escopeta / cohete): 1,8 a 2,3 / 3,9 a 4,3 / 3,8 a 4,4 / 1,3 a 1,6.

**Pantalla** (Edge): en una pestaña, teclas 1 a 4, rueda y Q cambian de arma (la 4 sin arma no cambia nada); el taller se abre con C en el campamento, mejora la uzi a nivel 2 (100 → 85 de chatarra), y el mismo comando fuera del taller no cambia nada. Capturas en `tests/e2e/out` (`05-*.png`).

**Pendiente de que el usuario lo juegue:** si los costos (15 / 30 / 50 / 80) y los efectos de cada nivel se sienten bien, si la chatarra alcanza o sobra para quien reparte entre varias armas, y los sonidos y brillos de nivel, que se hicieron sin poder escucharlos ni verlos en movimiento.
