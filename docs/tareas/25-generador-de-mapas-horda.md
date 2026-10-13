# 25 · Borrador: mapas de Horda generados

> **Borrador.** Se escribió antes de que exista el mapa grande de la Horda (tarea 23), que es el que dice qué
> funciona. Antes de empezar: leer las Notas de ejecución de la 23 y repasar este plan con el usuario.

## La idea

Que cada partida de Horda se juegue en un mapa distinto: no solo el borde (eso ya lo da la malla), también dónde
están los barrios, las cosas en el camino y los lugares de misión.

Como en la Carrera (tarea 24), lo generado es un **plano**: lo demás del juego recibe un plano como cualquier otro.

## Decisiones tomadas

- **Barrios, no ruido.** El mapa se arma repartiendo barrios escritos a mano (los del mapa de la tarea 23, partidos
  en piezas, más los que hagan falta) sobre una cuadrícula gruesa, unidos por calles. Cada barrio declara por
  dónde se conecta.
- **Lo chico sí se sortea:** dónde va cada auto, cada bloque, cada cobertura y cada barril dentro de los lugares
  que el barrio marca como posibles.
- **Todo sale de la semilla de la partida**, igual que la malla.
- **Se comprueba antes de jugarlo:** todo lugar de misión y toda boca de zombis se alcanza a pie desde la salida
  (grafo de `src/core/nav.ts`), cada barrio tiene dos conexiones, hay lugares de misión suficientes para la cadena
  y la comprobación de la malla pasa. Si no, se arma otro.

## Decisiones abiertas (preguntar)

- ¿El mapa generado es una opción más ("Ciudad al azar") o el de entrada?
- ¿Tamaño fijo, o crece con la cantidad de jugadores?
- ¿Los récords de la Horda (extracción más rápida, oleada más alta) se separan entre mapas fijos y generados?

## Listo cuando (a afinar)

- 200 mapas generados sin pantalla pasan la comprobación, y en 30 de ellos los bots cumplen la banda de la tarea 23.
- Host y cliente arman el mismo mapa con la misma semilla.
- Capturas de seis mapas generados, enteros, para el usuario.
