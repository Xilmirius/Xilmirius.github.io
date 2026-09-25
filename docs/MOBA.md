# 🏰 Asedio: el MOBA de RUBBLE

> Documento de diseño del modo. Estado: **primera versión jugable** (2v2 en una línea, 3v3 en dos líneas, con bots).
> Código: `src/core/moba/` (reglas del modo y IA de esbirros y torres), `src/render/mobaView.ts` (vista), `src/ui/minimap.ts`.
> Números: `src/core/moba/defs.ts` (todo lo tuneable vive ahí).

## 1. La idea en una frase

**Un MOBA sin barra de vida: el borde es la muerte.** Las líneas son puentes sobre el vacío, cada golpe te agrieta y se muere solo por ring-out. Posicionarse vale más que acumular stats.

## 2. Por qué puede pelearle a LoL y Dota

Los dos gigantes comparten supuestos que nadie discute: vida que baja, oro abstracto, partidas de 30-40 minutos, cliente de varios GB. Cada supuesto que rompemos es un diferencial:

| Ellos | Asedio | Por qué importa |
|---|---|---|
| Barra de vida: gana el que tiene más números | **Heat + ring-out**: cuanto más roto estás, más lejos volás; morís si te sacan del mapa | Siempre hay remontada: un empujón bien puesto saca al que "iba ganando". Los momentos son memorables y se comparten. |
| Oro abstracto por último golpe | **El oro es escombro**: rematar un esbirro te da su material al toque, y además el esbirro suelta un trozo en el piso que junta el que esté cerca (se puede robar) | La economía es física y se disputa en el mapa, no en una planilla. |
| Oleadas que solo se matan | Las oleadas **se pueden tirar al vacío** con knockback | Negar oro tirando la oleada rival al abismo es una jugada nueva y vistosa. |
| Mapa fijo | **Piso frágil que se rompe y se rearma** (25 s) | Cortar un puente por un rato cambia la línea: se juega con el terreno. |
| Volver a la base = curarse | Volver a la base = **enfriarse** (se te va el heat) | Quedarse en la línea roto es jugarse a volar: la decisión de volver pesa. |
| 30-40 min, instalar un cliente enorme | **10-15 min, en el navegador, con un link** | Entra en un almuerzo, se juega con amigos sin instalar nada. |

## 3. Cómo se juega

- **Bases** en los extremos: refugio (te enfría rápido y echa a los intrusos), forja (solo se compra acá o mientras esperás para volver) y el **núcleo**.
- **Líneas**: 1 en 2v2 (**El Puente**), 2 en 3v3 (**Las Dos Cornisas**). El mapa se elige solo según el tamaño de los equipos. Los dos mapas se diseñan de la mitad izquierda y se espejan: son justos por construcción (hay un test que lo verifica).
- **Oleadas** cada 24 s por línea: 3 Guijarros (cuerpo a cuerpo), 2 Chispas (a distancia) y un **Ariete** cada 2 oleadas (tanque de asedio que pega fuerte a las estructuras).
- **Torres**: 2 por línea y por equipo. La exterior protege a la interior; las torres de una línea protegen al núcleo. Priorizan esbirros, pero castigan al héroe que le pegue a un aliado bajo la torre, y cada disparo seguido al mismo héroe pega más. Sin esbirros rivales cerca reciben 60% menos daño (no se "roban" sin oleada) y los primeros 3½ minutos están blindadas.
- **Núcleo**: queda expuesto cuando cae una línea entera. Destruirlo gana la partida.
- **Línea abierta**: si un equipo ya no tiene torres en una línea, las oleadas rivales de esa línea salen **enfurecidas** (más vida, más daño, un Ariete extra). Es lo que cierra las partidas.
- **El Coloso** (centro/norte) despierta a los 2 minutos. Derribarlo da la **Bendición del Coloso** por 90 s: esbirros con +50% de vida y más daño. Es el objetivo de equipo.
- **Campamentos** neutrales (Babosas de goo) para farmear material goo y XP entre oleadas.
- **Muerte súbita**: al terminar el tiempo los núcleos quedan expuestos y los esbirros pegan el doble a las estructuras; si pasan 3 minutos más, gana quien destruyó más estructuras.

### Controles (todos los modos)

| Tecla | Acción |
|---|---|
| **Q E F R** | **Arman** la habilidad: se ve el área en el cursor |
| **Clic izquierdo** | Lanza la habilidad armada (si no hay nada armado, es el ataque básico) |
| **Clic derecho** / **Esc** | Cancela la habilidad armada (si no hay nada armado, es el empujón) |
| **1 2 3** | Ítems activos, con el mismo esquema |
| **B** | Volver a la base (4 s quieto; se corta si te movés, atacás o te pegan) |
| **C** | Forja (en el Asedio solo funciona en tu base) |

Las habilidades sin objetivo (las que solo te afectan a vos) salen al apretar la tecla. En Ajustes está el **lanzamiento rápido** (todo sale al apretar la tecla, directo al cursor) para quien lo prefiera.

## 4. Números principales

| Pieza | Valores | Por qué |
|---|---|---|
| Guijarro / Chispa / Ariete | vida 62 / 40 / 150 (+7%/min), daño a torres 18 / 12 / 60 | La oleada sola hace ≈65 de daño por segundo a una torre: si llega entera, la torre sufre. |
| Torre exterior / interior / núcleo | 650 / 850 / 1300 | Con una oleada tanqueando y un héroe pegando, una torre cae en 10-20 s. |
| Disparo de torre a héroes | 9 de heat, ×1.35 por disparo seguido (tope ×3), empuje 9 | Quedarse abajo de una torre rival es jugarse a volar del puente. |
| Base | enfría 60 de heat por segundo | Volver a la base es la "poción". |
| Cerca de una torre propia | enfría 4/s si no te pegan hace 3 s | Da aire al que defiende. |
| Héroes contra unidades | ×2 de daño | Limpiar una oleada tiene que tardar segundos, no medio minuto. |
| XP | ×0.55 respecto del brawler | Nivel 10 cerca del minuto 10 (antes era al minuto 6). |
| Reaparecer | 4 s + 1.2 s por nivel | Morir tarde en la partida cuesta más. |

**Cómo se ajustaron:** con partidas headless de bots (2v2 y 3v3, 18 minutos simulados en segundos). Antes del ajuste casi no caían torres (las oleadas se anulaban en el medio y los esbirros se quedaban a 10 m del núcleo). Después: las partidas terminan por núcleo destruido entre los **9 y 15 minutos**. Al intercambiar héroes entre equipos cambia el ganador, así que el mapa y la simulación son simétricos; lo que decide es la composición.

## 5. Decisiones de diseño

**A-1 · Heat y ring-out, no vida (pregunta abierta).** Se eligió mantener el corazón de RUBBLE: sin barra de vida para los héroes. Los esbirros, torres y neutrales sí tienen vida (tienen que poder "morir de a poco" para que haya remate y asedio). Si al probarlo se siente mejor con vida, el cambio es acotado: los cuerpos ya tienen dos caminos (vida para unidades, heat para héroes) en `applyHeat`/`damageUnit`, así que sería una regla más (`heroHp`) en `rules.ts` sin tocar red ni render. La propuesta del jugador fue "por vida"; queda para decidir después de probarlo.

**A-2 · Los esbirros son cuerpos como los héroes.** Usan la misma física, knockback y colisiones (`Character` con `unit != 'hero'`), así que todas las habilidades existentes les pegan sin tocar su código, y se los puede tirar al vacío. La IA les pone el input igual que a un bot.

**A-3 · Todo corre en el host, la red solo manda lo que se ve.** Los esbirros viajan en un formato compacto (`UnitFrame`: posición, vida 0..1, flags). En 3v3 hay picos de ≈50 unidades: el host simula la partida completa en ≈0.3 ms por tick.

**A-4 · Protección en capas en vez de reglas especiales.** Torre interior invulnerable mientras está la exterior, núcleo invulnerable hasta que cae una línea, blindaje sin oleada y blindaje de los primeros minutos. Todo es el mismo mecanismo (`invuln`/`armor` en la estructura).

**A-5 · La forja en la base** crea el ritmo clásico: salir, pelear, volver a comprar. Se puede mirar la forja desde cualquier lado para planear.

## 6. Próximos pasos

1. **Probarlo con gente** (y decidir A-1).
2. **Niebla de guerra**: el host no manda lo que tu equipo no ve (también es anti-trampa).
3. **Ítems propios del Asedio** (anti-torre, anti-esbirros, soporte de línea) y roles más marcados por héroe.
4. **Minimapa interactivo**: pings ("¡cuidado!", "vamos al Coloso").
5. **5v5** con servidor dedicado (el host P2P aguanta 6 cómodo; ver [PLATAFORMA_Y_MODOS.md §6](PLATAFORMA_Y_MODOS.md)).
6. **Assets**: esbirros, torres, núcleo y Coloso ya están en el catálogo (`unit.*`, `struct.tower`, `struct.core`) para reemplazar lo procedural de a una pieza.
