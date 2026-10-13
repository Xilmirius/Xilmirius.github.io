# 01 · En una copa, el que no es host pierde los controles

## Síntoma

Carrera en multijugador, formato copa. Al pasar a la segunda pista, el jugador que no es host no puede moverse
más. El host juega normal.

## Causa (leída en el código; falta verla fallar)

El host y el cliente numeran los inputs con un contador que empieza de cero en cada partida, pero nada dice a qué
partida pertenece un input.

1. Al terminar una pista, el cliente sigue con su `MatchRunner` viejo en pantalla (la tabla de resultados). Su
   `step()` sigue mandando inputs en cada tick, con números de secuencia de varios miles.
2. El host llama `HostSession.continueMatch()` → `startMatch(true)`, que arma la simulación nueva y pone
   `r.lastSeq = 0` en cada cliente.
3. Los inputs viejos del cliente siguen llegando un instante más. `onRemoteMessage` (caso `'in'`) los acepta porque
   `f.seq > r.lastSeq`, y `lastSeq` queda otra vez en varios miles.
4. El cliente recibe `start`, tira el `MatchRunner` viejo y crea uno nuevo, cuyo `seq` arranca en 0. Todos sus
   inputs llegan con `seq` menor que `lastSeq` y el host los descarta para siempre.
5. Del lado del cliente, `MatchRunner.reconcile` filtra los inputs pendientes contra un `ack` que también quedó
   viejo, así que ni la predicción lo mueve.

No pasa al empezar desde la sala porque ahí no hay un `MatchRunner` mandando inputs.

Los snapshots tienen el mismo defecto en espejo: uno de la partida anterior que llegue tarde al `MatchRunner` nuevo
deja `lastSnapTick` en un tick alto y los de la partida nueva se descartan.

## Qué hacer

Que cada partida tenga un número y que inputs y snapshots lo lleven.

- `MatchInit` gana un número de partida que el host incrementa en cada `startMatch`.
- El cliente manda ese número en cada mensaje `in`; el host descarta los inputs de otra partida.
- El host manda ese número en cada snapshot (`s`); el cliente descarta los de otra partida.
- Los eventos (`ev`) van por el canal ordenado junto con `start`, así que no lo necesitan.

## Pasos

1. **Verla fallar.** Un script descartable con dos páginas en el mismo navegador (como hace `tests/e2e/run.mjs`
   para probar host y cliente): crear una sala de Carrera con copa de 3 pistas, entrar con el cliente, empezar,
   terminar la primera pista desde la página del host (`sim.mode.next` y `sim.terrain.gates` permiten llevar a los
   corredores a la meta), continuar la copa, apretar una tecla de movimiento en la página del cliente y leer en
   el host la posición de su personaje. Tiene que quedar quieto.
2. Aplicar el cambio.
3. Correr el mismo script: el personaje del cliente se mueve en la segunda y en la tercera pista.

## Listo cuando

- El script del paso 1 falla antes del cambio y pasa después, tres veces seguidas.
- Volver a la sala y empezar otra partida sigue funcionando para el cliente.
- Un cliente que recarga la página a mitad de una partida vuelve a entrar y se puede mover (el camino de `hello`
  con la partida en curso).
- `tests/e2e/run.mjs` pasa.

## Notas de ejecución

Se hizo tal como lo planteaba la tarea, sin desvíos: `MatchInit` suma `match: number`, que el host sube en cada
`startMatch` (`++this.matchNum`); viaja en `ClientMsg['in'].m` y en `HostMsg['s'].m`. El host descarta un `'in'` si
`msg.m !== this.init.match`; el cliente descarta un `'s'` si `m.m !== this.init.match` (este último chequeo vive en
`ClientSession.onMessage`, antes de llamar a `onSnapshot`, así el `MatchRunner` nuevo nunca llega a ver un snapshot
de la partida vieja y su `lastSnapTick` no se corrompe). Los eventos (`ev`) no llevan número: van por el canal
confiable junto con `start`, como decía la tarea. `PROTOCOL_VERSION` subió a 11.

No hizo falta tocar `MatchRunner` ni `ClientSession.connect`: alcanzó con el número de partida en la capa de red.
El reconector (`hello` con partida en curso) tampoco lo necesita, porque no es una partida nueva: no sube
`matchNum`, solo resetea `lastSeq`/`queue` de ese remoto, y el número que ya tenía el cliente en su `this.init`
sigue siendo el correcto.

**Verlo fallar (paso 1).** Se escribió un script descartable con host + cliente (2 pestañas, Playwright contra
Edge): crea una sala de Carrera (copa de 3 pistas por defecto), fuerza el fin de la primera pista escribiendo
directo en `sim.mode.next/order/times` (sin correr la pista entera), espera los resultados, el host aprieta
"Siguiente pista" y mide cuánto se mueve el personaje del cliente, visto desde `sim.charByPid` en el host. Antes
del cambio: 0.00 m, tres veces seguidas (confirmado revirtiendo el fix con `git stash` y volviendo a aplicarlo).
Después del cambio: entre 3 y 4 m, tres veces seguidas. El script no se commitea (vivió en el scratchpad de la
sesión).

**Lo que sí queda en el repo:** `tests/e2e/run.mjs` ganó dos pasos al final, para que esta regresión no vuelva a
pasar desapercibida: después del chat, el host arranca una revancha desde la misma sala (otra partida fresca,
`matchNum` sube igual) y se comprueba que el cliente se sigue moviendo; después, el cliente hace `page.reload()` a
mitad de esa partida (recupera `?sala=` de la URL y el mismo `pid` de `sessionStorage`) y se comprueba que también
se puede mover tras reconectar. `npm run build` y `npm run typecheck` sin errores; `tests/e2e/run.mjs` pasa
(corrido varias veces; una corrida tuvo un fallo aislado en el chat por lentitud del render en software, no
relacionado con el cambio — al repetir pasó limpio).

Pendiente de que el usuario lo juegue: todo lo de arriba se probó con bots en 0 y un solo cliente remoto; no se
probó con 2+ clientes reconectando a la vez ni con latencia real (se jugó en local, señalización en el mismo
navegador).
