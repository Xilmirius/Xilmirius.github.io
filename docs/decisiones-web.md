# Decisiones de la versión web

Registro de decisiones tomadas al llevar el GDD (pensado para UE 5.8) al navegador. Siguen el espíritu del GDD: la decisión **y el porqué**, para poder cambiarla después sin repetir la charla. Numeración `DW-xx` para no chocar con las `D-xxxx` del proyecto original.

Donde el GDD dejaba una pregunta abierta, acá está la respuesta **provisoria** que se implementó para poder jugar. Todas son números en `src/core/constants.ts` o datos en `src/core/heroes`, `items.ts`, `mutations.ts`: se cambian sin tocar sistemas.

## Tecnología

**DW-01 · Three.js + TypeScript + Vite en lugar de Unreal 5.8.** El objetivo cambió a "jugar con amigos abriendo un link". El navegador elimina instalación, Steam y builds por plataforma. El estilo low-poly/toon del GDD (pilar 5) encaja perfecto con WebGL y permite que todo sea procedural.

**DW-02 · Host autoritativo en el navegador + WebRTC; Supabase solo para signaling.** Es la arquitectura propuesta en `arquitectura-original.txt`. Equivale al *listen server* de la Fase 1 del GDD (ADR 0002): cero costo de infraestructura para validar si el juego es divertido.

**DW-03 · El núcleo de simulación no depende del navegador.** `src/core` es TS puro. Permite testear partidas enteras en Node y mudarse a servidor dedicado en Fase 2 sin reescribir reglas (pilar 1: escalar sin rehacer).

**DW-04 · Arte, sonido y música 100% procedurales.** Un solo rig "bean" con piel por familia (GDD §8), texturas en canvas, SFX sintetizados y música generativa. Cero descargas, cero licencias. Se puede reemplazar la música con un mp3 propio.

## Combate (GDD §6)

**DW-05 · No hay vida aparte: se muere solo por ring-out.** Resuelve "¿qué mata?" (D-0018): el material roto es la única lectura. **Destrozado no mata solo**: te deja a un golpe de salir volando.

**DW-06 · Etapas por heat: 0 / 40 / 90 / 150** (Intacto / Agrietado / Quebrado / Destrozado), tope 260.

**DW-07 · Knockback escalonado por etapa: ×0.42 / ×0.85 / ×1.25 / ×1.8** (D-0024) con un pequeño extra continuo dentro de cada etapa. Medido con el empujón cargado al máximo (herramienta `tests/tools/kbtune.test.ts`):

| Etapa | Distancia |
|---|---|
| Intacto | ~3 m ("no se mueve") |
| Agrietado | ~9 m |
| Quebrado | ~16 m (cerca del borde = afuera) |
| Destrozado | ~27 m (afuera desde casi cualquier lado) |

**DW-08 · Clic izquierdo rompe, clic derecho saca** (D-0027/D-0028). El empujón se carga hasta 0.8 s (empuje 8→22), frena al que carga y se telegrafía con un cono en el piso que se pone rojo a carga máxima.

**DW-09 · El que vuela no está indefenso** (D-0017). De los candidatos se implementaron dos: **desviarse en el aire** (DI, más fuerte en Goo) y **agarrarse del borde** (trepa automática si empujás hacia una cornisa baja), más un **segundo salto** que cancela el tumbo. "Descargar el daño en una onda" quedó afuera por ahora.

**DW-10 · El cuerpo lanzado es un proyectil** (D-0016): pega a quien toca (el crédito es de quien lo lanzó; nunca daña a los aliados del que lanzó), rompe cobertura si va rápido (y sigue volando), y se estampa contra paredes sumando heat.

**DW-11 · Pasivos de familia** (GDD §6/§8): Piedra vuela 20% menos pero se agrieta 20% más rápido; Cristal +15% heat infligido, vuela 10% más y estalla una vez al quedar Destrozado; Goo rebota en paredes sin lastimarse y tiene más control aéreo; Metal vuela 15% menos y construye más resistente.

## Héroes (GDD §8)

**DW-12 · Cuatro héroes, uno por familia**, en vez de tres. El GDD dudaba entre Goo y Metal para el support; como en web cada héroe es barato (mismo bean, kit por datos), entran los dos: **Canto** (Piedra, iniciador que rompe cobertura), **Prisma** (Cristal, burst con ulti de explosión en área), **Gloop** (Goo, control/support), **Remache** (Metal, constructor).

**DW-13 · Desbloqueo:** Q en nivel 1, E en 2, F en 3, R en 5. Niveles 1 a 10; +3% heat infligido y −2% knockback recibido por nivel.

## Progresión y economía (GDD §9–10)

**DW-14 · Mutaciones:** los niveles 3, 6 y 9 habilitan un slot; mutar cuesta **8 del material de tu familia**. Rutas genéricas Tanque / Carry / Support como modificadores (área, heat, empuje, aturdimiento, enfriamiento, escudo a aliados) con nombre propio por familia. Cualquier héroe nuevo las hereda sin trabajo extra.

**DW-15 · Ítems:** 7 pasivos y 6 activos fabricados con combinaciones de materiales; desarmar devuelve 50%. El pool de pasivos es "clásico" (armadura, peso, velocidad, enfriamiento, filo, regeneración, salto extra); los efectos raros quedan para después.

**DW-16 · Reparar (V):** mantener 1.4 s, cuesta 4 de tu material, baja 45 de heat (≈ una etapa). Se interrumpe si te pegan. Hace que farmear también sea sobrevivir.

**DW-17 · Teclas libres del GDD §14:** **C** forja, **V** reparar, **Tab** tabla. X queda libre.

**DW-18 · XP:** por heat infligido, romper cobertura, juntar material, ring-outs/asistencias y un goteo pasivo. Calibrado con bots para llegar a nivel ~8 a los 4 minutos de pelea intensa.

## Mapa (GDD §7)

**DW-19 · Terreno como grilla de alturas de 2 m** con niveles de 1.5 m, rampas y muros altos. Destrucción predefinida por etapas (no voxel). Los mapas son ASCII editables a mano.

**DW-20 · "La arena se rompe" (candidata M3) adoptada:** las baldosas frágiles se rompen de forma permanente con golpes fuertes (ulti de Canto, Rompemuros, explosiones, cuerpos que caen fuerte). La cobertura reaparece a los 40 s para que siempre haya qué farmear.

**DW-21 · Dos mapas:** La Cantera (mediano, 2v2/3v3/FFA) y El Islote (chico, 1v1/2v2).

## Modos (GDD §11)

**DW-22 · Tres modos sobre el mismo núcleo:** Vidas (stock), Ring-outs (a objetivo o tiempo) y Control de zona (la zona rota cada 45 s). Interfaz `GameMode`: agregar un modo no toca combate ni red.

**DW-23 · Máximo 6 personajes (3v3 o FFA de 6).** 5v5 queda para Fase 2 con servidor dedicado.

## Otros

**DW-24 · Bots con el mismo input que un humano.** Sirven para practicar, rellenar equipos y **reemplazar a quien se desconecta** (vuelve con el mismo link y retoma su personaje).

**DW-25 · Persistencia abierta para anon.** Juego entre amigos sin login: RLS permite leer/escribir con la clave anon. Si el juego se abre al público, agregar Supabase Auth y restringir por `auth.uid()`.

**DW-26 · "Lo que cargás pesa" sigue sin adoptarse** (GDD §14), igual que en el GDD.

## Feedback y gamificación (pedido: "que todo se vea, se sienta y se escuche")

**DW-27 · El feedback es un sistema, no adorno.** La simulación emite datos ricos por evento (quién pegó, cuánto heat, en qué etapa quedó, si el golpe es **letal**) y el cliente los convierte en luz, números, cámara y sonido. Así cualquier habilidad nueva hereda el "juice" gratis (pilar 1 del GDD).

**DW-28 · Golpe letal = momento Smash.** Al lanzar a alguien, el host simula la trayectoria sin input; si termina fuera del mapa, marca el golpe como letal: destello, zoom, congelado de 0.2 s y cámara lenta. Si la víctima se recupera igual, se anuncia "¡Salvada épica!" (otra forma de premiar el control aéreo de D-0017).

**DW-29 · Hitstop y cámara lenta son solo visuales.** Se atrasa el dibujo del mundo y después se recupera acelerando; la simulación nunca se frena. Es seguro en multijugador: nadie pierde inputs.

**DW-30 · Bloom con colores HDR.** Solo brilla lo que tiene color > 1 (efectos, neón, grietas de etapa alta). El mundo base queda por debajo del umbral para no lavar la imagen. Las luces dinámicas son acento (escala `LIGHT_SCALE`). Si los FPS caen, el postproceso se apaga solo.

**DW-31 · Números de heat, no de "daño".** Coherente con DW-05: el número flotante es el heat sumado y su color es la etapa en la que quedó la víctima.

**DW-32 · Combos, rachas y multi-kills** se calculan en cada cliente a partir de los eventos, sin estado extra en red. Locutor con la voz del navegador (se puede reemplazar por líneas grabadas).

**DW-33 · Progreso entre partidas local y solo cosmético.** Nivel de cuenta, logros y sombreros en `localStorage`: sin login, sin pay-to-win (GDD §12). Los sombreros viajan por el lobby para que todos los vean.

**DW-34 · Temas visuales separados de los mapas.** Un tema solo cambia cielo, luces, neón y decoración, así que cualquier mapa se ve en cualquier tema. El "casino visual" pedido se interpretó como espectáculo de luces (tema Neón, el default) y no como mecánica de casino.
