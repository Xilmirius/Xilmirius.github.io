# Horda: cooperativo con armas

> Estado: **implementado**. Este documento cuenta cómo quedó, dónde vive cada cosa y qué falta.
> La dificultad está ajustada con partidas de bots sin pantalla, no con gente: los números son un punto de partida.

## 1. La idea

Cooperativo de 1 a 6 contra zombis, **con armas en vez de poderes**. Las oleadas salen por tiempo y no paran de crecer, así que no se gana "limpiando todo": se gana cumpliendo una cadena de **misiones** en el mapa y llegando a la **extracción**. Se pierde cuando a nadie le quedan vidas.

Pilares:

1. **Las armas se sienten**: ráfaga de uzi, escopetazo que tira para atrás, cohete y C4 que mandan zombis al vacío.
2. **Siempre hay algo que hacer además de sobrevivir**: un objetivo marcado que obliga a moverse y a defender una posición.
3. **Lo que ganás queda**: cada zona asegurada es una **mini base** que ayuda en lo que sigue.

## 2. Dónde vive cada cosa

| Pieza | Dónde |
|---|---|
| El juego en la plataforma (reglas fijas, cooperativo, dificultad, vitrina) | `src/core/games.ts` (`GAMES.horde`) |
| Su mapa, **El Refugio** (`kind: 'horde'`) | `src/core/maps/index.ts` |
| Reglas: sin poderes, con armas (`weapons`), piso frágil que se rearma en 12 s | `src/core/rules.ts` (`horde`) |
| Armas, disparo instantáneo, cohete y C4 | `src/core/weapons.ts` |
| Oleadas, IA de zombis, misiones, nidos, jefe, mini bases y cajas | `src/core/horde.ts` |
| Bots que disparan, van al objetivo, juntan cajas y plantan C4 | `src/core/bots.ts` (`decideHorde`) |
| Trazas, C4 en el piso, cajas, mini bases y arma en la mano | `src/render/hordeView.ts`, `src/render/beanView.ts` |
| Nido y Mole Madre | `src/render/propsView.ts`, `src/render/mobaView.ts` |
| Arma y munición, misión en curso, avisos | `src/ui/hud.ts` |
| Sonidos de las armas | `src/audio/audio.ts` |

## 3. Controles

| Entrada | En la Horda |
|---|---|
| Clic izquierdo (mantener) | **Disparar** el arma que tenés en la mano |
| Clic derecho | Empujón (saca zombis de encima sin gastar balas) |
| Tecla de la primera habilidad (`Q`) | **Cambiar** entre la pistola y tu arma |
| Tecla de la ulti (`E`) | **Plantar C4** |
| Shift / Espacio | Dash / salto |

Los héroes se diferencian por su peso y su velocidad, no por poderes. Las otras dos teclas de habilidad avisan que acá no se usan.

## 4. Armas

Se empieza con la pistola, un arma cargada (uzi o escopeta, alternadas entre los héroes) y una carga de C4. Se lleva la pistola más **un** arma: una caja de la misma suma balas (hasta el doble); una de otra la reemplaza. Sin balas, vuelve la pistola.

| Arma | Cadencia | Daño | Empuje | Alcance | Balas por caja | Paso al disparar |
|---|---|---|---|---|---|---|
| **Pistola** | 0,30 s | 11 | 2,5 | 19 m | infinitas | 85 % |
| **Uzi** | 0,07 s | 5 | 1 | 16 m | 120 | 70 % |
| **Escopeta** | 0,70 s | 8 × 7 perdigones | 4,5 c/u (tope 15) | 9,5 m | 18 | 75 % |
| **Lanzacohetes** | 1,0 s | 48 en área (3,3 m) | 17 | 26 m | 6 | 60 % |
| **C4** | — | 65 en área (4,6 m) | 22 | a tus pies | 2 cargas (hasta 4) | — |

El daño a zombis se multiplica por `HORDE.heroVsUnit` (1,6). **Disparar frena**: mientras tirás te movés a una fracción de tu velocidad, así que hay que elegir entre correr y tirar. Los zombis comunes son más lentos que un héroe, los Corredores no.

### Cómo se resuelven los disparos

- **Pistola, uzi y escopeta: impacto instantáneo** en el host (`castRay`). Se busca el primer rival sobre la línea y se recorre el rayo en pasos de 0,3 m por si hay algo sólido antes. La bala sube o baja sola hasta el pecho del blanco: no hay que apuntar en altura.
- Cada disparo viaja como un evento **`shot`** con el punto de llegada de cada bala y qué tocó. Con eso los clientes dibujan la traza, el fogonazo y el impacto. No hay proyectiles en el snapshot.
- Los perdigones de la escopeta que dan en el mismo cuerpo son **un solo golpe**: de cerca lanza a un zombi.
- Las balas de la uzi no generan además el evento de golpe (`HitSpec.quiet`): alcanza con la traza y evita inundar el canal.
- Una bala que da en un obstáculo le hace daño: **los barriles explotan a tiros** y los nidos se rompen a balazos.
- **Cohete**: proyectil normal con explosión. **C4**: aviso en el piso, mecha de 2,2 s y explosión. Ninguna explosión propia lastima al equipo; sí rompen piso frágil y hacen estallar barriles.

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

Cada zona asegurada queda como mini base: una **torreta** que no vence, un lugar donde **enfriarse** más rápido, el punto donde **reaparecen** los que caen, y una caja de suministros de premio.

### El mapa

La Horda se juega en su propio mapa, **El Refugio**, y no en las arenas del brawler: un fuerte elevado en el centro con dos entradas, pasillos entre muros, cobertura y barriles. Los mapas de la Horda **no llevan artefactos de pista** (resortes, paragolpes, rotores, géiseres): son de la Arena y de la Carrera, y en un juego de zombis no pintan nada. Hay un test que lo exige. Los barriles sí van, porque explotan a tiros.

## 6. Oleadas, cajas y dificultad

- **Oleadas**: la primera a los 5 s y después una cada 22 s, sin esperar a que se limpie la anterior (si no queda ningún zombi, la siguiente sale en 4 s). Crecen con el número de oleada y con la cantidad de héroes; después de la 12 siguen creciendo a la mitad del ritmo.
- **Zombis**: Zombi (lento), Corredor (rápido y frágil), Escupidor (a distancia, avisa dónde cae) y Mole (enorme, golpe en área que se ve venir). Hay un tope de zombis vivos a la vez que sube con los héroes.
- **Cajas**: cae una cada 15 s (hasta 3 en el mapa) con uzi, escopeta, lanzacohetes, C4 o un botiquín que enfría a los de alrededor. Se agarran pasando por encima. Viajan en el estado del modo (`ModeHud.horde.crates`).
- **Heat**: no hay barra de vida, como en todo RUBBLE. Un héroe se enfría solo al rato de no recibir golpes, más rápido en una mini base, de golpe con un botiquín y un poco al cumplir cada misión.
- **Dificultad** (la elige el host): Fácil, Normal y Difícil cambian cuántos zombis salen y cuánto pegan (`HORDE_LEVELS`).

En las partidas de bots de prueba en El Refugio, en Normal: de dos a seis bots de nivel normal o difícil completan la cadena en 3 a 5 minutos perdiendo alguna vida; un bot solo a veces gana y a veces cae cerca del final; y los bots de nivel fácil llegan a la extracción pero no la completan.

## 7. Lo que falta o hay que decidir jugando

- **Probarlo con gente**: todo el ajuste viene de bots, que apuntan mejor y se organizan peor que una persona.
- **Más mapas**: hay uno solo.
- **Más misiones**: escoltar una carga, llevar algo de un punto a otro, proteger a un sobreviviente.
- ¿El C4 con mecha alcanza, o conviene detonarlo a distancia?
- ¿Recarga de cargador, o solo munición total como está?
- ¿Las explosiones propias deberían empujar (sin daño) a los compañeros?
