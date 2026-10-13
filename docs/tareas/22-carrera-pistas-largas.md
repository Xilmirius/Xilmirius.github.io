# 22 · Carrera: pistas más largas, con altura y más obstáculos

## Qué pidió el usuario

"Los mapas deberían ser más largos, con altura y más mecánicas de obstáculos."

Hoy un buen corredor termina una pista en 22 a 44 segundos, todas son planas salvo una plataforma, y se hicieron
pensando en saltar. Ya están las piezas para rehacerlas: con salto flotante y agarre (tarea 03), varios niveles y rampas
largas (20), obstáculos nuevos (21) y terreno orgánico (17).

## Qué hacer

Rehacer las cuatro pistas (`pista`, `serpentin`, `bolera`, `derrumbe` en `src/core/maps/index.ts`). Conservan el
nombre, el tema visual y la idea que las distingue (`docs/CARRERA.md` §2); cambian el recorrido y el largo.

**Cada pista cumple:**

- **Dura** entre 60 y 90 segundos para un bot difícil.
- **Tiene altura:** al menos tres cambios de nivel. Subidas por rampa (corta o larga), bajadas por caída, y algún
  tramo donde la pista pasa por arriba de sí misma o al borde de un nivel más bajo, para que caerse cueste tiempo
  y no una reaparición.
- **Tiene variedad:** al menos seis clases distintas de obstáculo, y ningún tramo de más de 10 segundos sin algo
  que resolver.
- **Tiene decisiones:** al menos dos atajos que piden el dash (una zanja, una pared de cobertura) con su camino
  largo al lado. El dash vuelve cada 5 segundos, así que dos atajos seguidos obligan a elegir.
- **Se puede terminar sin dash:** todo lo obligatorio se pasa caminando.
- **Tiene una puerta** cada 10 a 15 segundos de recorrido. Se reaparece en la última, así que cada puerta va en
  un lugar ancho y seguro.
- **Sale en línea** (tarea 02), con lugar para seis.
- **Respeta las reglas de los planos** para la malla ([MALLA.md](../MALLA.md) §2 y §4): dos celdas de ancho donde el
  ancho importa, y ninguna rampa embutida en una plataforma. Una viga de una celda es válida si es un atajo a
  propósito.

Las cajas de ítems se quedan; conviene ponerlas antes de los tramos donde un ítem cambia algo.

**Los bots** tienen que correrlas. Lo que no entiendan de un tramo se arregla en `BotBrain.decideRace` o se
rediseña el tramo: una pista que los bots no terminan no se puede probar sin gente.

**La vitrina del menú** (`GAMES.race.demo`) recorre las pistas: revisar que se vea bien con las nuevas.

## Listo cuando

- Sin pantalla, con terreno orgánico, 30 carreras por pista con seis bots (10 por dificultad) y semillas
  distintas: llegan todos en al menos 27. El primero de los difíciles tarda entre 60 y 90 s. Anotar los tiempos
  por dificultad.
- En esas carreras se usan los dos atajos de cada pista (alguien los toma en al menos una de cada cinco) y también
  los caminos largos.
- La comprobación de la malla pasa en las cuatro pistas con 100 semillas.
- Para el usuario, en `tests/e2e/out`: una captura de cada pista entera desde arriba y una de cada tramo, y en las
  Notas de ejecución la lista de tramos de cada pista en orden, con qué se resuelve en cada uno.
- `docs/CARRERA.md` §2 describe las pistas nuevas y §5 los tiempos medidos. Los récords de pista guardados en el
  perfil (`src/game/profile.ts`) no se comparan con los de las pistas viejas.
