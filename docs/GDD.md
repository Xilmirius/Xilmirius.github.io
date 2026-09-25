# ProjectRubble — Game Design Document (v0.4, borrador de diseño)

> **Versión web (este repo):** el proyecto pasó de Unreal 5.8 a navegador (Three.js + WebRTC + Supabase). Este GDD se conserva tal cual como norte de diseño. Lo que cambia o se resuelve para la versión web está en [decisiones-web.md](decisiones-web.md) y la arquitectura en [arquitectura.md](arquitectura.md). Los archivos que el GDD menciona (`docs/conversacion.txt`, `docs/decisiones.md`, `docs/adr/`) viven en el proyecto original de Unreal.


> Nombre de carpeta/codename provisorio. Nombre de juego y de estudio TBD (candidatos: **FiveNinetyNine** / **NineNinetyNine**, ligados al precio de venta: $5.99 o $9.99 — se decide más adelante).

Este documento existe para que **no se pierda el razonamiento**, no solo la conclusión. Cada sección tiene la decisión Y el "por qué" detrás, porque el "por qué" es lo que permite tomar decisiones nuevas coherentes más adelante sin repetir esta conversación.

La transcripción completa de la sesión de diseño original está en [docs/conversacion.txt](docs/conversacion.txt). Si algo de este documento parece contradecir esa charla, **la charla manda** y este documento se corrige.

---

## 0. Naturaleza de la idea (la esencia, antes que las decisiones)

El pedido original, en palabras del director del proyecto (el usuario):

- "Una combinación de las mejores mecánicas que sean **DIVERTIDAS** de Dota 2, Fall Guys y Fortnite."
- Un MOBA con sesiones de ~15 minutos (±5), jugable **3v3 y 5v5**, con **mapa interactivo y destructible**.
- Juntar mecánicas que ya funcionan, con **públicos masivos que ya saben jugar** (LoL, Dota 2, Fall Guys, Fortnite), y monetización que funcione bien **y no sea depredadora**.
- El proyecto es un **estudio de videojuegos**, no "un dev y una IA": se trabaja con la disciplina de un estudio profesional, a la escala de dos personas.
- **Hacerlo bien a la primera y escalable en todo** (economía, estructura, gameplay, diseño, versiones): no romper el juego tres versiones más adelante por no haber pensado en escala.

Esa visión completa (MOBA 3v3/5v5) es el **norte**. La Fase 1 (sección 3) es una versión recortada para llegar a algo jugable y shippeable; no reemplaza al norte.

Ideas mencionadas que quedaron **en duda, no descartadas**:
- **Mapas random/procedurales**: el usuario lo nombró ("capaz random") pero dudó de que funcione. No entra en ninguna fase por ahora.

---

## 1. Pitch / Visión

Un **arena brawler isométrico** de sesiones cortas (~15-20 min, no estrictamente fijo) que fusiona:
- **Dota 2**: estética y "peso" de las habilidades (explosiones, stuns, ultis que se sienten importantes), profundidad de build/meta.
- **Fall Guys**: identidad de personaje (beans chibi, redondeados), sistema de movimiento con salto, tono visual no-realista, modelo de monetización por cosméticos.
- **Fortnite**: movilidad vertical del mapa, destrucción del entorno, farmeo de materiales.
- **Super Smash Bros.** (**idea del usuario**, surgida a mitad de la sesión de diseño y convertida en el pilar más diferenciador): combate basado en **knockback acumulativo/físicas**, no solo en números de daño planos.

**La idea de fondo, explícita del usuario**: tomar mecánicas que YA funcionan y YA tienen público masivo/entrenado (LoL, Dota2, Fall Guys, Fortnite), combinarlas en algo nuevo, con monetización que funcione bien pero **no sea depredadora**.

### Por qué esto y no un MOBA clásico
Un MOBA clásico 5v5 estilo Dota/LoL con mapas grandes, economía de lanes, servidores dedicados y anti-cheat es un proyecto de años con equipos de decenas/cientos de personas — inviable para un dev solo + IA como primer release. Se decidió explícitamente **no clonar el scope**, sino tomar prestadas mecánicas puntuales y construir un juego de arena más chico y autocontenido.

---

## 2. Pilares de diseño (el "por qué" de cada gran decisión)

1. **Escalabilidad de producción por sobre todo.** Repetidas veces en el diseño se priorizó: ¿esto obliga a rehacer sistemas cada vez que agregamos contenido (un personaje, un ítem), o el sistema absorbe contenido nuevo gratis? Ejemplos: la familia de materiales del mapa es fija y no crece con el roster; las rutas de mutación se diseñan por familia, no por héroe.
2. **Identidad propia, no la "vieja confiable".** Se evitó deliberadamente el sistema de elementos clásico (fuego/hielo/tierra) porque no es distintivo. En su lugar, los personajes **están hechos de los mismos materiales que se farmean del mapa** — arte, mecánica y economía del mundo son una sola cosa, no tres sistemas pegados con cinta.
3. **Profundidad de build real ("meta" tipo Dota), pero pareja para todos.** El usuario fue explícito: quiere que existan combos/builds que se sientan "rotos" y expandan el meta — pero el sistema que permite eso tiene que estar disponible para **todos los personajes por igual**, no ser una ventaja de uno solo. Por eso el sistema de knockback es universal (capa física que corre por debajo de todos los kits), y las mutaciones son por familia (no exclusivas de un héroe).
4. **"Roto" = física, no números.** Referencia explícita del usuario a Smash Bros: la diversión de un build al límite viene de la posibilidad de armar combos de knockback/desplazamiento, no de inflar daño plano. Esto es una decisión de identidad de combate, separada de balance numérico.
5. **Nada de arte realista.** Es la decisión de costo más importante del proyecto: estilo low-poly/estilizado tipo Fall Guys permite reusar un rig base, variar solo shaders/texturas por "familia de material", y sostener un roster grande sin quebrar presupuesto de arte 3D.
6. **Empezar chico y escalar, nunca al revés.** Fase 1 = la versión mínima jugable y divertida. Todo lo que agrega complejidad de sistemas grande (servidores dedicados, estructuras construibles, más familias de materiales) se empuja a fases posteriores explícitamente, no se elimina de la visión.

---

## 3. Fases del proyecto

### Fase 1 (MVP a shippear primero)
- Modo chico: **1v1 o 2v2** para empezar (el modo más simple de prototipar), pero el núcleo de reglas/objetivo de victoria se diseña **agnóstico al gamemode** desde el día uno, para poder ofrecer distintos modos (destruir base, control de puntos, kills) más adelante sin rehacer el core.
- Sin servidores dedicados: arranca con **listen server** (un jugador hostea y hace de servidor; no es P2P real, ver ADR 0002). Cero costo de infraestructura para probar si el juego es divertido.
- Un mapa chico, con cobertura destructible y desniveles limitados (ver sección Mapa).
- Roster mínimo: 3 personajes (ver sección 8), suficientes para 1v1/2v2 con variedad y para un 3v3 de prueba.
- Sin Steamworks todavía — el usuario no tiene cuenta ni sabe qué es; se pospone hasta que haya algo jugable. (Implica pagar ~$100 USD una vez a Valve cuando llegue el momento — decisión del usuario, no algo que se resuelve solo.)

### Fase 2+ (después de validar que el core es divertido)
- Escalar a 3v3 / 5v5.
- Servidores dedicados (implica costo de hosting recurrente — decisión y pago del usuario).
- **Estructuras construibles en el mapa** (barracas que largan creeps, estructuras que auto-farmean materiales) — mecánica propuesta por el usuario para extender/alterar el curso de una partida de forma orgánica en vez de con timer fijo. No entra en el MVP porque implica IA de creeps, pathing sobre terreno destructible y HP/destrucción de estructuras — peso propio de sistema.
- Nuevas familias de materiales (contenido "grande", no por-personaje).
- Steamworks: App ID, depots, script de subida con steamcmd.

---

## 4. Controles

Esquema confirmado, pensado para estar **todo al alcance de una mano** (izquierda en teclado, derecha en mouse):

| Input | Función |
|---|---|
| WASD | Movimiento del personaje (control directo, no click-to-move) |
| Espacio | Salto (al principio el usuario lo dejó como "evaluar"; después lo confirmó en el esquema de controles) |
| Clic izquierdo | Ataque básico del héroe, melé o a distancia: suma heat (mantener sigue pegando) |
| Clic derecho | Empujón de cerca, igual para todos: mantener lo carga (sección 6) |
| Q, E, F | Las 3 habilidades del héroe (activas o pasivas) |
| R | Ulti |
| 1, 2, 3 | Ítems activos (sección 10) |
| Mouse | Apuntado de ataques y habilidades (skillshots, no target-click) |

Kit y teclas según [D-0027](docs/decisiones.md): es el esquema de los brawlers isométricos y MOBAs que el público ya juega (Battlerite; R = ulti en LoL y Dota). Reemplaza al de la v0.3, que tenía 5 habilidades en Q, 1, 2, 3, E y los ítems en R, F, X, C, V.

El personaje mira siempre hacia el cursor, y moverse de costado o de espaldas a donde mira es más lento que hacia adelante (D-0011): huir dándole la espalda al enemigo es rápido; retroceder mirándolo deja tirarle habilidades.

Cámara, definida en el prototipo (D-0013): no hay cámara libre por el mapa. `Shift` mantenido corre la cámara hacia el cursor, hasta un radio máximo, sin dejar de seguir al personaje; se aprieta con el meñique y deja el pulgar libre para saltar.

### Por qué WASD directo y no click-to-move
Es la decisión que desbloquea todo lo demás. Click-to-move (Dota/LoL) es incompatible con salto y movimiento tipo Fall Guys. Control directo + habilidades apuntadas es el mismo esquema que usan MOBAs isométricos modernos (Smite, Paragon/Predecessor) — hay precedente de que funciona bien en cámara isométrica.

---

## 5. Cámara

Isométrica fija en ángulo (estilo Dota2), pero **sigue al personaje** (no es una vista de "toda la arena" fija). Para ver más lejos, `Shift` la corre hacia el cursor hasta un radio máximo (D-0013). No es top-down puro.

> **Versión web:** el `Shift` para mirar lejos se sacó (desorientaba) y ahora es un **dash**; la cámara queda fija siguiendo al personaje. Ver [decisiones-web.md](decisiones-web.md) DW-37 y DW-38.

---

## 6. Combate: el pilar diferenciador (knockback físico)

**Concepto central**: capa de combate tipo Smash Bros corriendo por debajo del kit de habilidades de Dota. No reemplaza el HP, lo complementa (a definir en prototipo):
- Cómo lo dijo el usuario: lo "roto" es el efecto físico de la habilidad, no el daño, "como en Smash Bros, que te podés hacer combos locos y solo te mata si acumulás mucho heat y te sacan del mapa".
- Hipótesis de trabajo (**recomendación de diseño, el usuario todavía no la confirmó**): **HP + acumulación de "heat"/castigo**. Cuanto más dañado/golpeado está un objetivo, más lejos lo manda el knockback. Dos formas de "matar": bajar HP a 0, o desplazar a alguien a un hazard / afuera del mapa con suficiente knockback acumulado. La alternativa es Smash puro (sin HP, solo heat y ring-out); el prototipo decide entre las dos.
- El sistema de knockback es **universal**: cualquier habilidad de cualquier personaje puede generar desplazamiento físico. No es una mecánica exclusiva de un héroe — así lo "roto"/el techo de skill está disponible parejo para todos, cumpliendo el pilar #3.

### Lo que lo hace nuestro y no Smash copiado (v0.3)
El acumulador de Smash solo, como un número que sube, no tocaba el resto del juego. El usuario pidió más coherencia: el castigo tiene que estar hecho de lo mismo que el mundo (pilar #2).

- **Te rompés como el mapa** ([D-0015](docs/decisiones.md)). El castigo acumulado es el material del personaje rompiéndose, y se ve en el cuerpo: la Piedra se agrieta, el Cristal se fractura, el Goo se derrite, el Metal se abolla. Avanza por **etapas**, como los destructibles (sección 7), y en cada etapa el personaje vuela más lejos: intacto no se mueve, agrietado vuela, quebrado vuela lejos ([D-0024](docs/decisiones.md)). Se lee de un vistazo, cosa que un % sobre la cabeza no logra en isométrico con varios personajes en pantalla. Se **repara gastando material de la propia familia**, así que farmear también es sobrevivir.
- **El cuerpo lanzado es un proyectil** ([D-0016](docs/decisiones.md)). El que vuela le pega a lo que choca: rompe cobertura y destructibles, se lastima contra las paredes y lanza a otros personajes. Salen combos de billar: pegarle al de adelante para sacar al de atrás, o tirar a alguien contra el muro que protege a su compañero.
- **El que vuela no queda indefenso** ([D-0017](docs/decisiones.md)). En Smash, salir volando no es morir: se vuelve al escenario, y ahí está buena parte del juego. Acá el lanzado conserva algo de control. Candidatos a probar en M1: desviarse en el aire, agarrarse del borde, o descargar el daño acumulado en una onda.
- **El clic izquierdo rompe, el derecho saca** ([D-0027](docs/decisiones.md)). El ataque básico (melé o a distancia, según el héroe) solo suma heat; el empujón, de cerca para todos, es el que saca. Mantenido se carga: más carga, más empuje, pero el otro lo ve venir ([D-0028](docs/decisiones.md)). La pelea tiene un ritmo: romper, entrar y sacarlo.
- **Cada familia se rompe y vuela a su manera**, como parte del pasivo de familia (sección 8). Ejemplos a validar con el roster: la Piedra vuela poco pero se agrieta rápido; el Goo rebota en las paredes; el Cristal estalla al quebrarse.

- Preguntas abiertas para resolver en prototipo (no decididas aún, requieren probarse jugando):
  - ¿Qué mata? Por ahora no hay vida aparte: el material roto es la única lectura, y se muere por ring-out ([D-0018](docs/decisiones.md)), mientras el estado del cuerpo se lea bien. Falta decidir si la última etapa mata sola o solo deja al personaje a un golpe de salir volando.
  - ¿Los ring-outs matan directo o solo en zonas específicas (vacío, lava, escombros propios)?
  - Curva exacta de cómo escala el knockback con daño acumulado. Que suba de a escalones con cada etapa se está probando ([D-0024](docs/decisiones.md)).

**Por qué importa**: es lo que separa a este juego de "otro MOBA isométrico más". Conecta directamente con la verticalidad del mapa (sección siguiente) — los desniveles y plataformas dejan de ser solo estética/cobertura y pasan a ser parte del objetivo de combate.

---

## 7. Mapa, verticalidad y destrucción

- **Cámara isométrica fija penaliza terreno muy alto/irregular** (rompe legibilidad — no se ve bien "detrás" de una loma). Por eso:
  - **Cobertura destructible sí** (paredes, rocas que cambian líneas de visión/disparo) — funciona muy bien en isométrico.
  - **Rampas/plataformas de altura limitada** (1-2 niveles, no montañas) para saltos y posicionamiento de ultis/combos de knockback.
  - **Destrucción predefinida, no deformación libre tipo voxel**: objetos destructibles con estados definidos de antemano (este muro se rompe así), no simulación libre. Mucho más barato de producir y sincronizar en red.
- **Economía de materiales del mapa: set FIJO y chico, no crece nunca.** Familias iniciales candidatas: **Piedra, Metal/Chatarra, Cristal, Resina/Goo** (4 familias). Esto es una decisión de escalabilidad explícita: el mapa/farmeo no se toca al agregar personajes nuevos.
- Farmear materiales rompiendo el mapa alimenta: el crafteo de ítems (sección 9) y el crafteo de mutaciones de habilidad en partida (sección 8).
- **La arena se rompe y se vuelve más mortal** (candidata para M3, sin probar). Farmear rompe también pisos y cornisas, y cada hueco es un ring-out nuevo. Al principio cuesta sacar a alguien; a los 12 minutos el mapa es un colador. La partida escala sola, sin reloj artificial, y hay tensión: farmear da materiales pero le abre huecos a todos.

---

## 8. Personajes

### Base compartida
Un único **"bean"** base (rig/esqueleto, proporciones chibi) para todos los personajes: reusa animaciones y colisión, producción barata, y es la base natural para cosméticos (skins sobre el mismo bean).

**Parecido a Fall Guys en concepto, pero no igual.** Pedido explícito del usuario: hay que buscar una **identidad visual propia**, tanto del personaje como del estilo de todo el juego. Fall Guys es la referencia de producción (un rig, formas simples, cosméticos), no el modelo a copiar.

### Identidad: "hecho del material del mundo", no elemento mágico
Cada personaje pertenece a una **familia de material** (la misma lista fija de la sección 7: Piedra, Metal, Cristal, Goo...). Esto define su estética (shader/textura/paleta) y le da un sabor pasivo — **pero NO define su rol/kit**. Puede haber varios héroes de la misma familia con roles totalmente distintos (ej. Piedra-Tanque, Piedra-Asesino, Piedra-Support), compartiendo estética pero con kits completamente diferentes.

**Por qué esta identidad y no fuego/hielo/tierra clásico**: (a) es un hook propio, nadie más lo está haciendo así; (b) conecta arte + mecánica + economía en un solo sistema coherente en vez de tres separados; (c) desacopla el crecimiento del roster del crecimiento del mundo (agregar un héroe nuevo NO obliga a tocar el mapa ni la economía, solo a asignarle una familia ya existente). El precedente es cómo LoL usa las regiones (Freljord, Noxus...): dan identidad compartida sin ser un sistema mecánico nuevo por campeón.

**Una familia nueva es un evento de contenido grande, no un costo por personaje**: por ejemplo una 5ta o 6ta familia cada 15-20 héroes nuevos.

### Sabor de cada familia (verbos de comportamiento, no tipos de daño)
Es el "de qué está hecho" y cómo se comporta. Alimenta el pasivo de familia, la estética y las rutas de mutación (sección 9). **No es el kit**: el kit de cada héroe es independiente.

| Familia | Verbo / sabor | Superficie visual (barata: mismo rig, cambia shader) |
|---|---|---|
| Piedra | Pesado, bloquea, rompe cobertura, alto HP, lento | Normal map rugoso + tinte gris |
| Cristal | Frágil pero preciso, burst/precisión; se "fractura" visualmente al recibir daño | Material refractivo/translúcido |
| Metal/Chatarra | Construye (pone cobertura, torretas, trampas); es lo opuesto al que rompe | Metal + paneles |
| Resina/Goo | Corrosión, terreno pegajoso/lento, movilidad rara (rebota, se cuela), daño en el tiempo | Gelatina translúcida con squash-and-stretch |
| Madera/Raíz (futuro, no en el set inicial) | Control de área, enraizar, regeneración | — |

### Kit
Estructura estándar para todos los personajes, así el sistema de habilidades se reusa en código (facilita herramientas/tooling, no una excepción por héroe) ([D-0027](docs/decisiones.md)):
- **Dos ataques básicos**: uno que rompe, melé o a distancia según el héroe, y un empujón de cerca que saca, igual para todos (sección 6).
- **3 habilidades**, que pueden ser activas o pasivas.
- **Una ulti**, en su propia tecla.

Son 4 habilidades para diseñar por héroe, y no 5: baja el costo de cada héroe nuevo (pilar 1) sin achicar los combos (sección 10).

### Roster Fase 1 (propuesta, 3 personajes)
Cada héroe tiene un kit base orientado a un rol, pero **el sub-rol final de cada partida lo define la mutación que se craftea** (sección 9). Un héroe de Piedra puede terminar jugando de carry.

1. **Iniciador/Tanque, familia Piedra**: stun/gap-closer, y el único con una habilidad que rompe cobertura del mapa activamente (conecta personaje ↔ mecánica de destrucción).
2. **Burst/Carry, familia Cristal** (encaja con "frágil pero preciso"): ulti tipo explosión en área, referencia directa a Dota.
3. **Control/Support, familia Resina/Goo o Metal** (a definir): CC (stun/slow) + utilidad, no un healbot puro. Goo encaja con el control (terreno pegajoso); Metal con la utilidad (poner cobertura).

> Corrección v0.2: la versión anterior decía "familia Fuego" para el carry. Era un resto de la propuesta de elementos (fuego/hielo/tierra) que se descartó en la charla; ya no aplica.
>
> La lista de familias definitivas (Piedra/Metal/Cristal/Goo u otras) sigue abierta: hay que cerrarla antes de producir arte.

---

## 9. Progresión dentro de la partida (niveles)

- Partidas cortas (~15-20 min) → curva de nivel comprimida: **10 a 15 niveles**, no los 25 de Dota, con **mejoras importantes cada X niveles** (pedido del usuario).
- No empezás con todo el kit: los ataques básicos están desde el principio, las 3 habilidades se desbloquean en los primeros niveles y la ulti más tarde, como en Dota (early game más simple de leer).
- **Mutaciones de habilidad en niveles clave** (ej. 3, 6, 9): en vez de una habilidad nueva, elegís cómo evoluciona una que ya tenés.
- **Las mutaciones se craftean con materiales farmeados**, no son gratis por nivel — conecta la progresión con el loop de destrucción/farmeo. (Origen: mutar por nivel fue propuesta de diseño; craftearlas con materiales fue idea del usuario. La síntesis de trabajo es "el nivel habilita el espacio de mutación, los materiales lo pagan". Cómo se combinan exactamente queda para el prototipo; ver sección 14.)
- **Las rutas de mutación se diseñan por familia de material** (no por héroe individual) para mantener el costo de producción acotado — ver sección 2, pilar #1. Ejemplo con familia Piedra:
  - Ruta Tanque → habilidades ganan +área y empujan/aturden más, bajan de daño.
  - Ruta Carry → habilidades ganan daño escalado y menos cooldown, pierden alcance/tamaño.
  - Ruta Support → habilidades afectan también a aliados cercanos (ej. un stun también da escudo a aliados en el radio), se debilita el efecto sobre enemigos.
  - Cualquier héroe nuevo de esa familia hereda las 3 rutas automáticamente, sin trabajo extra de diseño.
- Un mismo héroe se puede jugar de 3 formas distintas según qué mutación craftees ese partido — da rejugabilidad sin inflar costo de producción.
- XP viene de: farmear materiales, atacar/destruir objetivos del mapa, kills/asistencias.

---

## 10. Ítems

- **3 slots pasivos** (stats tipo armadura, constitución/HP, y similares — pool exacto de stats aún por definir).
- **3 slots activos**, estilo ítems activos de Dota (Blink Dagger, BKB) — habilidades con cooldown propio, independientes del kit del personaje.
- Construidos mediante **fusión de materiales farmeados** (misma economía de la sección 7) — mismo material alimenta personajes, mutaciones e ítems, reforzando que todo es una sola economía de mundo.
- Con 2 ataques básicos, 3 habilidades, la ulti y hasta 3 activos de ítem, el espacio de combos es grande — soporte para el pilar #3 (meta profundo).

---

## 11. Condición de victoria / gamemodes

**Sin decidir de forma única a propósito.** El usuario pidió explícitamente que el núcleo de reglas sea agnóstico al objetivo de victoria, para poder ofrecer varios gamemodes sobre el mismo core más adelante (destruir base tipo MOBA, control de zonas/puntos, kills/rondas) y cubrir más tipos de público. Fase 1 arranca con el modo más simple de implementar; cuál es "el más simple" se define al empezar a prototipar.

---

## 12. Monetización

- **No depredadora**, explícito desde el pitch inicial: sin loot boxes, sin pay-to-win. Lo más probable: cosméticos sobre el bean base (reutilizando que todos comparten rig), quizás compra del juego a precio fijo bajo.
- Nombre de estudio/precio en danza: **FiveNinetyNine** ($5.99) o **NineNinetyNine** ($9.99) — decisión pendiente, no bloquea nada del desarrollo.

---

## 13. Decisiones técnicas ya tomadas (para el agente que va a codear)

- **Unreal Engine 5.8** (build del Launcher, ver [ADR 0003](docs/adr/0003-version-de-motor.md)), proyecto **C++** (no Blueprint-only): permite trabajar con agentes de código directamente sobre archivos fuente, sin depender de edición manual en el editor para todo.
- Prototipo de red: **listen server** (un jugador hostea y es la autoridad), no servidor dedicado (decisión de fase 1, ver sección 3 y [ADR 0002](docs/adr/0002-modelo-de-red-inicial.md)).
- Sin Steamworks configurado todavía — usuario no tiene cuenta ni sabe qué es; se aborda en una fase posterior con guía paso a paso.
- Carpeta del proyecto: `C:\Datos\Proyectos\ProjectRubble` (nombre de carpeta provisorio, independiente del nombre final del juego/estudio).
- La arquitectura de código de los sistemas (habilidades, knockback, materiales, destrucción) se define en `TDD.md` antes de programarlos.

---

## 14. Abierto / pendiente de definir

- Nombre final del juego y del estudio.
- Lista definitiva de familias de materiales (¿4? ¿cuáles exactamente?).
- Pool exacto de stats para ítems pasivos, y si los pasivos son solo stats clásicas (armadura, HP, regen, reducción de cooldown) o también pueden tener efectos "raros" (ej. al recibir daño generás una onda). La pregunta quedó sin responder en la charla.
- Mecánica exacta de HP vs. knockback acumulado (necesita prototipo jugable, no se puede decidir solo en papel).
- Cómo se combinan nivel y crafteo en las mutaciones (¿el nivel desbloquea el slot y los materiales lo pagan? ¿se puede craftear en cualquier momento?).
- Uso de las teclas que quedan libres al alcance de la mano izquierda (X, C, V).
- Diseño de hazards de mapa para ring-outs.
- **"Lo que cargás pesa"** (idea anotada, no adoptada): los materiales que llevás encima te hacen más pesado (volás menos, corrés más lento), craftear te aliviana y si te sacan se te caen. Une economía y física en una variable, pero puede premiar acumular sin gastar. Se reevalúa cuando haya economía (M3–M4).
- Cuánto material cuesta reparar el cuerpo (D-0015) frente a craftear ítems y mutaciones con el mismo material.
- Roster exacto de Fase 1 más allá de los 3 roles propuestos (nombres, lore mínimo si aplica).
- Todo lo de Fase 2 (estructuras construibles, servidores dedicados, Steamworks) queda registrado pero no especificado en detalle — se retoma cuando llegue el momento.
