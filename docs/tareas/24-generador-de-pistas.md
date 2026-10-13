# 24 · Borrador: pistas de Carrera armadas con tramos al azar

> **Borrador.** Se escribió antes de que existan las pistas largas (tarea 22), que son de donde salen los tramos.
> Antes de empezar: leer las Notas de ejecución de la 22 y repasar este plan con el usuario.

## La idea

El usuario eligió "plano ahora, generador después". Con la malla, el borde de una pista ya cambia en cada partida;
con esto cambia también el recorrido.

Una pista generada es un **plano armado en el momento** encadenando tramos escritos a mano. Lo demás (malla,
bots, puertas, copa) no se entera: recibe un plano como cualquier otro.

## Decisiones tomadas

- **Tramos, no ruido.** Cada tramo es un pedazo de plano con una entrada y una salida que declaran ancho, nivel y
  hacia dónde miran. Salen de partir las cuatro pistas de la tarea 22, más los que hagan falta.
- **Todo sale de la semilla de la partida**, para que el host y los clientes armen el mismo plano, igual que con
  la malla ([MALLA.md](../MALLA.md) §3 y §8).
- **Una pista generada se arma con reglas:** una salida, una meta, una puerta al final de cada tramo, dificultad
  creciente, sin repetir el mismo tramo seguido, y el mismo presupuesto de atajos que pide la tarea 22.
- **Se comprueba antes de jugarla:** existe un camino a pie de la salida a la meta que pasa por todas las puertas
  en orden (sobre el grafo de `src/core/nav.ts`), y la comprobación de la malla pasa. Si no, se arma otra.

## Decisiones abiertas (preguntar)

- ¿La pista generada es una opción más de la lista ("Pista sorpresa") o reemplaza a las fijas en la copa?
- ¿Las pistas pueden doblar y cruzarse por arriba de sí mismas, o van siempre hacia adelante? Lo segundo es mucho
  más simple de encajar.
- ¿Se guardan récords de una pista que no se repite? Con la semilla a la vista se podría volver a correr.

## Listo cuando (a afinar)

- 200 pistas generadas sin pantalla pasan la comprobación, y en 30 de ellas los bots cumplen la banda de la tarea 22.
- Host y cliente arman la misma pista con la misma semilla.
- Capturas de seis pistas generadas, enteras, para el usuario.
