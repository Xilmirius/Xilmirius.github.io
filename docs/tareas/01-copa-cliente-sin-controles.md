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
