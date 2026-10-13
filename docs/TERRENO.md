# Terreno y ambientación

Cómo se dibuja el mapa. La idea viene de Townscaper: **la entrada es simple** (qué hay en cada celda de la
grilla) y **un algoritmo decide la forma** mirando a las vecinas. Todo lo que describe este documento es solo
visual: la colisión, los bots, la red y el formato de los mapas no cambiaron.

## 1. Las tres capas

| Capa | Archivo | Qué hace |
|---|---|---|
| Formas | `src/render/terrainShape.ts` | Arma la malla del terreno: costa redondeada, acantilados, muros y plataformas |
| Lectura del mapa | `src/render/topology.ts` | Dice qué hay en cada lugar: hilera de muros, muro suelto, macizo, puente, claro, borde al vacío |
| Ambientación | `src/render/ambience.ts` | Una por juego: colores de la roca, piezas para cada cosa que la lectura encuentra y fondo |

`terrainView.ts` dibuja las formas, `decorView.ts` siembra el pasto y coloca las piezas, y `backdrop.ts` arma
el fondo. `pieces.ts` es la caja de formas simples con la que se construyen las piezas.

## 2. Formas por vecindario

El terreno se arma por **capas de altura**: el piso, las plataformas y los muros. Cada capa es una meseta con
su propio contorno, y las de arriba apoyan sobre las de abajo. Para cada esquina de la grilla se miran las
cuatro celdas que la tocan:

- **Esquina saliente** (los dos lados dan afuera): se redondea con un arco.
- **Esquina entrante** (tres celdas adentro, una afuera): lleva un relleno curvo.
- **Borde recto:** queda recto.
- **Borde que da al vacío:** cuelga un acantilado de roca, con una franja de tierra arriba.

El piso firme no tiene juntas de losa. Las losas quedan para lo que se rompe y para las rampas, que así se leen
como piezas aparte.

### Lo que se dibuja no le miente a la colisión

- Se redondean **solo las esquinas**. El borde recto de cada celda está exactamente donde está el borde real.
- Una esquina saliente redondeada dibuja *menos* piso del que hay (como mucho unos 25 cm en la punta).
  Una entrante dibuja *de más*, pero el relleno sobresale apenas 12 cm.
- El acantilado se abulta y se afina **por debajo** del borde, nunca a la altura del piso.
- Al lado de una losa frágil o de una rampa **no se redondea nada**, para que las piezas sueltas calcen justas.
  Por eso no hay que recalcular nada cuando una losa se cae: el hueco es el de la celda.

Ningún vértice del piso dibujado debe quedar sobre el vacío más allá de ese relleno (se verificó en todos los mapas
con un script descartable; ya no hay test que lo vuelva a comprobar).

## 3. Decoración contextual

`analyze()` clasifica el mapa y cada ambientación responde con sus piezas:

| Lo que encuentra | Arena | Asedio | Carrera | Horda |
|---|---|---|---|---|
| Hilera de muros | Pretil de bloques | Almenas | Barrera a rayas y neumáticos | Bolsas de arena y alambre de púa |
| Punta de hilera o muro suelto | Monolito con cristal, mástil | Torreón con techo y bandera | Mástil con bandera a cuadros | Torre de reflector |
| Codo o cruce | Peñasco con cristal | Bastión con brasero | Neumáticos | Puesto de guardia |
| Macizo (2×2 o más) | Peñascos | Torreón cuadrado | Tribuna | Contenedor |
| Puente | Losa y ménsulas | Tablones y puntales | Galones y guirnalda | Rejilla y caños |
| Claro | Círculo de combate | Plaza empedrada | Flechas con el sentido de la pista | Estacionamiento despintado |
| Borde al vacío | Cristales y enredaderas | Estandartes y hiedra | Carteles; pianos rojos y blancos | Caños, cadenas; rayas de peligro |
| Islas del fondo | Ruinas de columnas | Atalayas | Carteleras y globos | Edificios en ruinas, antenas, bruma |

En el Asedio los techos, banderas y estandartes toman el color del equipo de ese lado del mapa. En la Carrera
las flechas salen de un campo de distancias a la meta, así que siguen la pista aunque dé vueltas.

### Nada parece un obstáculo que no es

Las piezas no colisionan, así que **sobre el piso que se pisa solo va pintura** (y el pasto chico de siempre).
Lo que tiene volumen va arriba de los muros, colgado del acantilado por debajo del borde, o por encima de las
cabezas. No hay barandas en los bordes: un borde con baranda del que igual te caés sería una trampa.

Las piezas salen de una semilla fija por mapa: todos los jugadores ven lo mismo.

## 4. Ambientación y tema

Son dos cosas distintas y se combinan:

- La **ambientación** depende del juego (de la clase del mapa, `kind`): piezas, colores de la roca y fondo.
- El **tema** (Neón, Cantera, Atardecer, Noche) sigue siendo elegible en la sala: cielo, luces, niebla y neón.

Cada juego entra con el tema que le queda (`defaults.theme` en `core/games.ts`, o el del mapa).

## 5. Cómo sumar o cambiar

- **Ambientación de un juego nuevo:** una entrada en `AMBIENCES` (`ambience.ts`) con `wall`, `bridge`,
  `coast`, `clearing` y, si hace falta, `island`, `floaters`, `fog` y `mist`.
- **Una pieza nueva:** se arma con `Pieces` (cajas, cilindros, telas, calcos). Si necesita una situación que la
  lectura todavía no distingue, se suma a `topology.ts`.
- **Revisar cómo quedó:** `npm run build && node tests/e2e/maps.mjs [mapa,mapa|all] [tema]` saca capturas de
  cada mapa (entero, en juego, costa y muros) en `tests/e2e/out`.
- **Qué detecta en cada mapa:** `npm run tool:clearings`.

## 6. Lo que falta

- **Probarlo jugando.** Está revisado con capturas, no en partidas con gente. Lo primero a mirar: si el borde
  redondeado se lee bien con el personaje en movimiento y si alguna pieza distrae en plena pelea.
- **Grilla irregular y Wave Function Collapse** (lo que hace Townscaper completo): quedaron afuera a propósito.
  Deformar la grilla obliga a que la colisión, los bots, la red y los mapas la sigan, porque acá el borde es el
  juego. Es un proyecto aparte.
- Los mapas de Arena sin muros (El Islote, El Flipper) muestran poco de su ambientación: casi todo lo vistoso
  va sobre los muros.
- Las piezas son estáticas: banderas y guirnaldas no flamean.
