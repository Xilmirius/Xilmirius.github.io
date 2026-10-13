# 07 · Los zombis se traban: navegación que respeta rampas y obstáculos

## Síntoma

"En el modo zombie se quedan trabados muchos."

## Por qué pasa (leído en `src/core/horde.ts` y `src/core/moba/mode.ts`)

Los zombis bajan por un campo de distancias al héroe más cercano (`HordeMode.buildField` / `nextStep`) y caminan
hacia el centro de la celda vecina con `steer`, que prueba siete ángulos fijos y, si los siete están tapados,
devuelve "quieto".

1. **El campo no sabe hacia dónde sube una rampa.** Trata la rampa como medio nivel y deja entrar y salir por
   cualquier lado. En el mundo solo se entra por la punta baja y solo se pasa a la plataforma por la alta: los
   zombis empujan contra el costado de la rampa o contra la plataforma de al lado.
2. **El campo no ve los obstáculos.** Cobertura, barriles, nidos y torretas ocupan celdas que el campo cree
   libres, y el zombi camina hacia el centro de una celda que tiene una roca.
3. **Un héroe parado donde el campo no arranca** (arriba de un muro o de una cobertura) deja el campo entero sin
   valores. Ahí cada zombi camina en línea recta hacia el héroe y queda contra una pared.
4. **"Trabado" se mide por velocidad**, no por avance: un zombi que resbala contra un obstáculo sin acercarse
   nunca cuenta como trabado. Y el remedio es teletransportarlo a otro borde.
5. **No se esquivan entre ellos:** en un pasillo se apilan.
6. La lista abierta del campo se recorre entera en cada paso. En El Refugio no se nota; en un mapa grande (tarea
   23), sí.

## Diseño

Un módulo nuevo, `src/core/nav.ts`, que la Horda usa en lugar de `buildField`, `nextStep` y `steer`. Los esbirros
del Asedio siguen con `steer`.

**El grafo.** Los nodos son las celdas caminables del mapa. Hay una arista de una celda a su vecina (las ocho) si
un cuerpo **puede caminarla de verdad**: se recorre el segmento entre los dos centros de a 0,25 m contra el mismo
`CollisionWorld` que usa el movimiento, siguiendo el piso; falla si en algún punto no hay piso, si hay que subir
más de `STEP_UP`, o si un cuerpo de radio `CHAR_RADIUS` choca con algo. Bajar un escalón se permite: es una arista
de un solo sentido. Las diagonales, solo si las dos celdas de los costados también se pueden caminar.

Con esa única regla las rampas quedan bien (se entra por abajo y se sale por arriba, o se baja por cualquier
lado), y la cobertura, los nidos y las torretas cortan las aristas que tapan.

**Cuándo se recalcula.** Las aristas cambian cuando cambia un obstáculo o una losa. La simulación lleva un
contador que sube en esos casos (hoy `rebuildObstacles` y los cambios de estado de las losas); el grafo rehace
solo las aristas de las celdas a una celda de distancia de lo que cambió.

**El campo.** Distancia a pie al héroe vivo más cercano, calculada desde los héroes hacia atrás por las aristas,
con un montículo (`distanceField` de `src/core/race.ts` ya tiene uno). Cada héroe siembra la celda donde está; si
esa celda no es un nodo (está sobre un muro o una cobertura), siembra el nodo más cercano a no más de 3 m. Así,
con un héroe fuera de alcance, los zombis se juntan abajo en vez de caminar contra una pared. Las celdas pegadas
al vacío cuestan un poco más, para que no caminen por el borde.

**Seguir el campo.** El zombi va hacia el centro del nodo vecino que más baja. Si el nodo siguiente a ese se
alcanza en línea recta (misma prueba de caminar), apunta a ese: corta las esquinas y no zigzaguea. Perseguir en
línea recta al héroe que tiene al lado, como hoy, solo si esa línea se puede caminar.

**Separación.** A la dirección se le suma un empuje que lo aleja de los zombis que tiene a menos de 1 m.

**Trabado, por avance.** Cada zombi recuerda el mejor valor del campo al que llegó. Si en 2,5 s no mejoró medio
metro y no está atacando, prueba un segundo vecino durante un segundo. Si a los 6 s sigue igual, vale el recurso
de hoy (reaparecer en un borde), que tiene que quedar como algo excepcional.

El escupidor conserva lo suyo (retroceder si se le acercan, quedarse a tiro), moviéndose por aristas del grafo.

## Pasos

1. **Medir antes de tocar.** La herramienta de partidas de bots de `scripts/` gana una medición de trabados: corre
   20 partidas de Horda con tres bots y cuenta zombis que salieron, zombis reubicados por trabados, segundos-zombi
   sin avanzar (vivo, sin atacar ni volar, y sin acercarse por más de 1,5 s) y zombis que se cayeron solos al
   vacío. Guardar los números. Las tareas 14 y 23 vuelven a usarla.
2. Escribir `nav.ts` y conectarlo en `HordeMode`.
3. Volver a medir.

## Listo cuando

- En las 20 partidas: los reubicados por trabados son menos del 1 % de los zombis que salieron, y los
  segundos-zombi sin avanzar, menos del 3 % del total. Las Notas de ejecución traen los números de antes y de después.
- Un zombi puesto al pie del costado de la rampa de El Refugio, con un héroe arriba de la plataforma, llega al
  héroe (por la punta de la rampa).
- Un zombi con una roca entre él y el héroe la rodea.
- Con el único héroe parado arriba de un muro, los zombis se juntan al pie y ninguno se reubica durante 20 s.
- Recalcular el campo tarda menos de 1 ms en El Refugio y menos de 4 ms en un mapa de 64×44 celdas armado en el
  script.
- La banda de victorias de la tarea 04 se mantiene (los zombis llegan más: si hace falta, se reajusta la
  dificultad y se anota).
- `docs/ZOMBIS.md` cuenta cómo se mueven los zombis y dónde vive.
