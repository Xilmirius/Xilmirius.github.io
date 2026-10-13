# RUBBLE — muchos juegos, un mundo que se rompe (versión web)

> Codename **ProjectRubble**. Nombre final del juego/estudio todavía TBD (ver [docs/GDD.md](docs/GDD.md)).

**Una plataforma de juegos en el navegador**, para jugar con amigos con un link. Todos corren sobre el mismo núcleo: personajes de materiales, física de **knockback** estilo Smash, mapa que se rompe, bots y red P2P. No hay barra de vida: cada golpe te **agrieta** y, cuanto más roto estás, más lejos volás. Se muere solo por **ring-out** (saliendo del mapa).

El menú es una **vitrina de juegos**: elegís uno y creás la sala o practicás con bots. Detrás se ve una partida de bots de ese juego, y dentro de la sala el host puede cambiar de juego sin salir.

| Juego | Qué es | Jugadores |
|---|---|---|
| 🥊 **Arena** | El brawler de ring-outs: sacá a los demás del mapa. Modos Vidas, Ring-outs y Control de zona. | 2 a 6, por equipos o todos contra todos |
| 🏰 **Asedio** | MOBA de bolsillo: bases, torres, esbirros y el Coloso. | 1v1 a 3v3 |
| 🏁 **Carrera** | Pista de obstáculos, sin poderes. | 1 a 6, cada uno por su lado |
| 🧟 **Horda** | Cooperativo contra zombis **con armas**, misiones, mini bases y extracción. | 1 a 6, todos juntos |

Cada juego se declara en un solo lugar ([src/core/games.ts](src/core/games.ts)): sumar el próximo es agregar una entrada, su forma de ganar, sus reglas y sus mapas. La idea completa está en [docs/PLATAFORMA_Y_MODOS.md](docs/PLATAFORMA_Y_MODOS.md).

- 4 héroes, uno por familia de material: **Canto** (Piedra), **Prisma** (Cristal), **Gloop** (Goo), **Remache** (Metal).
- Mapa que se rompe: cobertura destructible, pisos frágiles que dejan agujeros, materiales para farmear.
- Dos **reglas** sobre el mismo núcleo: **⚡ Brawler** (por defecto: todo desbloqueado, la ulti se carga pegando, dash con Shift; nada que administrar) y **🧬 Completo** (niveles, materiales, forja de ítems y mutaciones, reparación).
- 3 modos de arena: **Vidas**, **Ring-outs** y **Control de zona**. Reglas y modos se combinan libremente (ver [docs/PLATAFORMA_Y_MODOS.md](docs/PLATAFORMA_Y_MODOS.md)).
- **🏰 Asedio (MOBA)**: bases, torres, núcleo y oleadas de esbirros; 1 línea hasta 2v2 y 2 líneas en 3v3, el Coloso, campamentos, minimapa, `B` para volver a la base y forja en la base. Sin barra de vida: los puentes están sobre el vacío. Diseño en [docs/MOBA.md](docs/MOBA.md).
- **🧟 Horda (zombis)**: cooperativo de 1 a 6 **con armas en vez de poderes**. Clic dispara: pistola (balas infinitas), **uzi**, **escopeta** y **lanzacohetes**, más **C4**; las armas y la munición caen en cajas. Las oleadas no paran de crecer, así que se gana cumpliendo una cadena de **misiones** (encender el generador, destruir los nidos, asegurar la antena, juntar el combustible, derribar a la Mole Madre) hasta la **extracción**. Cada zona asegurada queda como **mini base** con torreta, y cada misión cumplida te deja **elegir una mejora entre tres** (más daño, balas perforantes, zombis que explotan en cadena...), así cada partida arma un personaje distinto. Tres dificultades, récords personales y mapa propio, **El Refugio**. Detalle en [docs/ZOMBIS.md](docs/ZOMBIS.md).
- **🏁 Carrera de obstáculos**: todos contra todos hasta la meta, pasando puertas en orden. Sin habilidades: golpes, empujón, salto, dash y los ítems de un solo uso que dan las cajas ❓. Si te caés, reaparecés en la última puerta. **Cuatro pistas**, cada una con lo suyo: **La Pista** (la clásica), **El Serpentín** (curvas, aceleradores y atajos que se caen), **La Bolera** (bolas que ruedan contra vos) y **El Derrumbe** (paredes que se rompen a puro dash). Se corre suelta o en **copa**: varias pistas seguidas con puntos, tabla y podio. Diseño en [docs/CARRERA.md](docs/CARRERA.md).
- **Artefactos en los mapas** además de los minerales: **resortes** que te lanzan, **paragolpes** que te rebotan, **rotores** que barren (se saltan), **géiseres** que avisan y disparan, y **barriles explosivos**. La arena **El Flipper** está armada alrededor de ellos.
- Habilidades estilo MOBA: la tecla **arma** (se ve el área), **clic izquierdo** lanza, **clic derecho** cancela. Por defecto habilidades en **Q 2 3**, ulti en **E** e ítems en **1 R F**; todas las teclas se reasignan en Ajustes → Controles.
- Pantalla completa desde el menú, la pausa o la partida.
- **Mantené la tecla para apuntar**: cada habilidad dibuja en el piso su área, línea, cono o muro antes de usarla. **Tooltips** en todo (habilidades, ítems, tu cuerpo, niveles, héroes, reglas).
- Bots para practicar, completar equipos y reemplazar a quien se desconecta.
- Multijugador **P2P por WebRTC** (host autoritativo en el navegador) con signaling en **Supabase Realtime**. Cero servidores propios.
- **Cero assets externos**: modelos, texturas, sonidos y música son procedurales. Y **cada pieza es reemplazable por un archivo, de a una**: menú → 🧩 Assets y [docs/ASSETS_CATALOGO.md](docs/ASSETS_CATALOGO.md).
- **Espectáculo de feedback sin marear**: cámara fija que solo te sigue, efectos de color (nunca blancos, nunca pantalla lavada), puños que golpean en arco como boxeadores, números de heat, pilares de color en cada ring-out, combos con sonido ascendente, anuncios de rachas con locutor, confeti y premios al final de cada partida.
- **Gamificación**: nivel de cuenta, 17 logros y sombreros cosméticos que se desbloquean jugando (se guardan en tu navegador).
- **Temas visuales** del mapa: Neón, Cantera, Atardecer y Noche (lo elige el host en el lobby). Cada uno trae su fondo (mar de nubes, islas flotantes, grilla de neón, reflejo del sol o de la luna) y su vegetación sobre el terreno.

> **¿Qué tengo que hacer yo para dejarlo online?** → [PASOS_PARA_VOS.md](PASOS_PARA_VOS.md)
> **¿Cómo lo mejoro con modelos, sonidos o arte reales?** → [docs/MEJORAS_CON_ASSETS.md](docs/MEJORAS_CON_ASSETS.md)

---

## 1. Probarlo ya (2 minutos, sin configurar nada)

Requisitos: Node 20+ (probado con Node 22).

```bash
npm install
npm run dev
```

Abrí http://localhost:5173 y tocá **🤖 Práctica vs bots**.

**Probar el multijugador sin Supabase:** abrí una segunda pestaña en el mismo navegador. En una tocá **Crear sala**; en la otra la sala aparece en "Salas abiertas" (o escribí el código). Eso usa un signaling local (`BroadcastChannel`) y **WebRTC real** entre las dos pestañas. Para jugar entre PCs distintas hace falta Supabase (paso 2).

## 2. Jugar con amigos online

### 2.1 Crear el proyecto de Supabase (gratis)

1. Entrá a https://supabase.com → **New project** (el plan Free alcanza de sobra).
2. Cuando termine de crearse: **Project Settings → API** (o "Data API"). Copiá:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon public key** (o la **publishable key** `sb_publishable_...`)
   Estas claves son públicas por diseño: está bien que vayan en el navegador.
3. Verificá que Realtime acepte canales públicos: **Realtime → Settings** → que **no** esté activado "private channels only" (viene así por defecto).

Con eso ya funciona el signaling: **no hace falta crear tablas** para jugar.

### 2.2 (Opcional) Historial y ranking en Postgres

Supabase → **SQL Editor → New query** → pegá todo [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**. Crea `players`, `games`, `matches`, `game_results` y la vista `leaderboard`. Desde el menú, **🏆 Historial** muestra ranking y últimas partidas. Si no corrés el SQL, el juego funciona igual (solo no guarda historial).

### 2.3 Configurar las claves

Elegí una:

- **Local:** copiá `.env.example` a `.env`, completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, y reiniciá `npm run dev`.
- **Sin rebuild:** en el juego, **⚙️ Ajustes → Avanzado** → pegá URL y key → *Guardar y recargar*. Queda guardado en ese navegador (útil para probar rápido; tus amigos igual necesitan un build con las claves o hacer lo mismo).

### 2.4 Publicarlo en GitHub Pages (para que tus amigos solo abran un link)

1. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable**:
   - `VITE_SUPABASE_URL` = tu Project URL
   - `VITE_SUPABASE_ANON_KEY` = tu anon/publishable key
3. Mergeá a `main` (o corré el workflow **Deploy** a mano desde **Actions**). El workflow corre tests, buildea y publica.
4. El juego queda en `https://<tu-usuario>.github.io/<repo>/` (para este repo: `https://xilmirius.github.io/WebGame1/`).

### 2.5 Jugar

**Crear sala → 🔗 Copiar link** y pasáselo a tus amigos. El link es `…/?sala=CODIGO` y entra directo. También pueden escribir el código o elegir la sala de la lista "Salas abiertas".

### 2.6 Si alguien no puede conectarse (NAT estricto / CGNAT)

WebRTC arranca con STUN (gratis). En algunas redes (algunas móviles o con CGNAT simétrico) hace falta un **TURN** que retransmita el tráfico:

1. Creá una cuenta en un proveedor de TURN con plan gratis (por ejemplo Metered, https://www.metered.ca, o el TURN de Cloudflare) y generá credenciales.
2. Armá (o copiá del panel del proveedor) el JSON de ICE servers, del estilo:
   `[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:TU-SERVIDOR-TURN:80","username":"...","credential":"..."}]`
3. Ponelo como secret `VITE_ICE_SERVERS` en GitHub (Settings → Secrets → Actions) y volvé a deployar, o pegalo en **Ajustes → Avanzado**.

---

## 3. Controles

| Tecla | Acción |
|---|---|
| **WASD** | Moverte (hacia donde mirás es más rápido; de espaldas, más lento) |
| **Mouse** | Apuntar: el personaje siempre mira al cursor |
| **Espacio** | Saltar · en el aire: **segundo salto** (recuperación) |
| **Clic izquierdo** | Ataque básico: **rompe** (suma heat). Mantener sigue pegando |
| **Clic derecho** | **Empujón**: mantené para cargar, soltá para **sacar** |
| **Shift** | **Dash**: ráfaga corta (en el aire tenés uno, después del segundo salto) |
| **Q · E · F · R** | Habilidades y ulti: **mantené** para ver el área, **soltá** para usarla. En Brawler la R se carga pegando |
| **Tab** | Tabla de jugadores |
| **Esc** | Pausa / salir |
| *Solo reglas Completo:* | **1 · 2 · 3** ítems activos · **C** forja · **V** (mantener) reparar. Habilidades por nivel (Q 1, E 2, F 3, R 5) |

Pasá el mouse por cualquier ícono del HUD para ver qué hace.

### En teléfono o tableta

Los controles táctiles aparecen solos en teléfonos y tabletas (en **Ajustes** se pueden forzar o apagar, y cambiar el tamaño de los botones). Se juega con la pantalla acostada.

| Gesto | Acción |
|---|---|
| **Mitad izquierda** | Palanca de movimiento: aparece donde apoyás el dedo |
| **Golpe / disparo y empujón** | Se mantienen. Sin arrastrar, apuntan solos al rival más cercano; arrastrando el dedo apuntás vos |
| **Habilidades e ítems** | Apoyar = armar (se ve el área) · arrastrar = apuntar · soltar = lanzar. Soltar sobre la **✕** cancela |
| **Saltar · dash · reparar · volver a la base** | Botones comunes |
| **Tabla · pausa · forja** | Tienen su botón en pantalla |

Mantené el dedo sobre un ícono para ver qué hace. En un teléfono el juego arranca sin sombras ni brillos. Con "Agregar a la pantalla de inicio" se abre a pantalla completa, sin las barras del navegador.

## 4. Cómo se juega (resumen)

- **Heat y etapas:** Intacto (0) → Agrietado (40) → Quebrado (90) → Destrozado (150). Cada etapa multiplica cuánto volás (×0.42 / ×0.85 / ×1.25 / ×1.8). El cuerpo se ve roto: la piedra se agrieta, el cristal se fractura, el goo se derrite, el metal se abolla.
- **Ritmo:** romper (clic) → entrar → sacar (empujón cargado). El empujón cargado se telegrafía con un cono en el piso.
- **El cuerpo lanzado es un proyectil:** rompe cobertura, se estampa contra paredes (suma heat) y voltea a otros (combos de billar).
- **El que vuela no está indefenso:** corregís con WASD en el aire, tenés segundo salto (cancela el tumbo) y trepás bordes automáticamente si empujás hacia la cornisa.
- **Reglas Brawler:** todo desbloqueado; los trozos que sueltan las coberturas cargan la ulti.
- **Reglas Completo:** los trozos son materiales (rocas 🪨, chatarra 🔩, cristales 💎, goo 🟢) para ítems, mutaciones y reparación; niveles 1–10 con mutaciones en 3, 6 y 9 (Tanque / Carry / Support).
- **La arena se rompe:** las baldosas frágiles (con grietas) se destruyen con golpes fuertes y quedan agujeros para toda la partida.

## 5. Arquitectura

```
                 SUPABASE (solo para encontrarse)
          ┌──────────────────────────────────────┐
          │ Realtime: signaling + salas abiertas │
          │ Postgres: historial (opcional)       │
          └───────────────┬──────────────────────┘
               offer/answer/ICE (una vez)
          ┌───────────────┴──────────────────────┐
     NAVEGADOR HOST ◄════ WebRTC DataChannels ════► NAVEGADORES CLIENTES
     (simula a 60 Hz,        rel: lobby/eventos       (mandan inputs,
      es la autoridad)       fast: inputs/snapshots    predicen su movimiento,
                                                       interpolan al resto)
```

Detalle completo, flujo de mensajes y cómo escalar a servidor dedicado: [docs/arquitectura.md](docs/arquitectura.md). Decisiones de diseño tomadas para esta versión (y el porqué): [docs/decisiones-web.md](docs/decisiones-web.md).

## 6. Estructura del código

```
src/
  core/          Simulación pura (sin Three.js ni DOM): se puede correr en Node o en un server dedicado
    sim.ts         Simulación autoritativa: combate, knockback, proyectiles, zonas, materiales
    games.ts       Los juegos de la plataforma: qué modos, reglas, mapas y formato tiene cada uno
    rules.ts       Reglas: qué sistemas están prendidos (Brawler, Completo, Asedio, Carrera, Horda)
    moba/          Asedio (MOBA): números (defs.ts), oleadas, IA de esbirros y torres, base, Coloso (mode.ts)
    movement.ts    Movimiento compartido (host y predicción del cliente usan el mismo código, dash incluido)
    terrain.ts     Terreno como grilla de alturas; baldosas frágiles
    collision.ts   Colisión terreno + obstáculos
    heroes/        Un archivo por héroe (kit de 4 habilidades + básico)
    gadgets.ts     Artefactos del mapa: resortes, paragolpes, rotores, géiseres, barriles, cajas de ítems, aceleradores y lanzabolas
    horde.ts       Horda: oleadas, IA de los zombis, misiones, mini bases y cajas de suministros
    perks.ts       Horda: las mejoras que se eligen al cumplir cada misión
    weapons.ts     Armas: pistola, uzi, escopeta (impacto instantáneo), lanzacohetes y C4
    race.ts        Carrera de obstáculos: puertas, puesto, reaparición y llegada
    cup.ts         Copa: varias carreras seguidas con puntos
    items.ts       Ítems pasivos/activos
    mutations.ts   Rutas de mutación (Tanque/Carry/Support)
    modes.ts       Modos de juego (interfaz agnóstica)
    bots.ts        IA (A* sobre la grilla, recuperación, crafteo; en Asedio: línea, remate, torres, volver a la base)
    snapshot.ts    Frames de mundo, codificación de red e interpolación
    maps/          Mapas en ASCII
  net/           Signaling (Supabase / local), WebRTC, sesiones host y cliente
  render/        Three.js: terreno por vecindario (terrainShape.ts), decoración contextual y ambientación de cada juego (topology.ts, ambience.ts), beans, efectos, cámara, postproceso (post.ts), juice (juice.ts), indicador de apuntado (indicator.ts), Asedio (mobaView.ts), temas
  assets/        Catálogo de piezas reemplazables (catalog.ts) y cargador con fallback a lo procedural (registry.ts)
  audio/         Síntesis de sonido y música generativa (WebAudio)
  ui/            Menú, lobby, HUD, forja, minimapa, tooltips (tooltip.ts, tips.ts), galería de assets, estilos
  game/          Bucle de partida (hitstop visual cortito), input, teclas asignables (keybinds.ts) y lanzamiento (castControl.ts), ticker en Worker, menú animado, perfil y logros
  db/            Persistencia en Postgres (historial)
supabase/migrations/   SQL del esquema
tests/e2e/             Scripts E2E con Playwright (capturas y partidas reales en Chromium)
scripts/               Herramientas: generador del catálogo de assets y de balance (knockback, bots, claros)
```

## 7. Agregar contenido (escala sin tocar sistemas)

- **Juego o modo nuevo:** receta completa en [docs/PLATAFORMA_Y_MODOS.md §8](docs/PLATAFORMA_Y_MODOS.md) (entrada en `games.ts` + victoria en `modes.ts` + reglas en `rules.ts` + mapa).
- **Héroe nuevo:** copiá `src/core/heroes/canto.ts`, cambiá números, la forma del indicador (`shape`) y `cast()` usando la API de `Simulation` (`meleeArc`, `fireProjectile`, `lob`, `blast`, `dash`, `leap`, `roll`, `zip`, `addZone`, `buildWall`...). Registralo en `heroes/index.ts` y en `HERO_IDS` (`core/types.ts`). Hereda las 3 rutas de mutación de su familia gratis. El modelo 3D es el mismo bean con la piel de su familia; si querés accesorios propios, agregalos en `render/beanView.ts → buildExtras`.
- **Mapa nuevo:** agregá un bloque ASCII en `src/core/maps/index.ts` (leyenda en el archivo, artefactos incluidos). Las pistas de Carrera llevan `kind: 'race'`, puertas numeradas y la meta. Hay que revisar que tenga spawns, zonas y frágiles. Los mapas de Asedio (`kind: 'moba'`) llevan torres, núcleos y el recorrido de cada línea; revisá que las líneas sean transitables y que el mapa esté espejado.
- **Ambientación:** cómo se dibuja el terreno y qué piezas pone cada juego según la forma del mapa está en [docs/TERRENO.md](docs/TERRENO.md). Un mapa nuevo se decora solo.
- **Ítem nuevo:** entrada en `core/items.ts` + efecto en `Simulation.recalcStats` (pasivo) o `tryItem` (activo).
- **Sistema nuevo:** agregalo como flag en `Ruleset` (`core/rules.ts`) y preguntá por el flag en la simulación, nunca por el modo.

## 8. Verificación y herramientas

El proyecto **no tiene unit tests**: los valores y mecánicas se prueban con un script descartable mientras se desarrolla y no quedan en el repo.

```bash
npm run typecheck
npm run assets:doc       # regenera docs/ASSETS_CATALOGO.md desde el catálogo
npm run build
npm run test:e2e         # Chromium: menú, práctica vs bots, y host+cliente por WebRTC real en 2 pestañas
node tests/e2e/moba.mjs  # Chromium: Asedio 2v2 y 3v3 (lanzar con clic, cancelar, B, forja en base, fin de partida)
node tests/e2e/showcase.mjs   # screenshots de cada héroe usando sus habilidades
npm run test:touch       # Chromium con táctil emulado: palanca, botones, apuntado y habilidades en los cuatro juegos
node tests/e2e/maps.mjs  # capturas de cada mapa (entero, costa, muros) para revisar terreno y ambientación
npm run tool:kb         # herramienta de balance: tabla de knockback
npm run tool:bots       # herramienta de balance: estadísticas de partidas de bots
npm run tool:clearings  # claros que se decoran en cada mapa
```

Para Playwright se usa `playwright-core` con el Chromium del sistema (`CHROMIUM=/ruta/a/chrome` si no está en `/opt/pw-browsers`).

## 9. Assets opcionales (de a una pieza)

Todo es procedural, pero **cada pieza tiene un id y se reemplaza sin tocar código**:

1. Menú → **🧩 Assets**: lista las 159 piezas (modelos, texturas, íconos, sonidos), las muestra girando y dice qué archivo crear y con qué especificación.
2. Poné el archivo en `public/assets/<ruta>` y agregá la ruta a `public/assets/manifest.json` → `{ "files": ["models/props/stone.glb"] }`.
3. Recargá. Si el archivo falta o falla, vuelve solo a lo procedural. `npm run assets:doc` actualiza la checklist [docs/ASSETS_CATALOGO.md](docs/ASSETS_CATALOGO.md).

Sonido: `public/audio/music.mp3` / `menu.mp3`, efectos en `public/audio/sfx/<nombre>.mp3` + `manifest.json`, locutor en `public/audio/voice/`.
El plan de arte completo (rig y animaciones, VFX, splash art) está en [docs/MEJORAS_CON_ASSETS.md](docs/MEJORAS_CON_ASSETS.md).

**Ajustes de rendimiento** (⚙️ en el menú): sombras, brillos/postproceso, alta resolución y locutor. Si los FPS caen mucho durante una partida, el juego apaga los brillos solo.

## 10. Límites conocidos / próximos pasos

- Hoja de ruta de modos (MOBA, battle royale, obstáculos) y editor de mapas: [docs/PLATAFORMA_Y_MODOS.md](docs/PLATAFORMA_Y_MODOS.md).
- Carrera: las pistas nuevas y la copa están probadas con bots, no con gente; lo que falta está en [docs/CARRERA.md](docs/CARRERA.md).
- Horda: la dificultad y las mejoras están ajustadas con partidas de bots, no con gente; lo que falta (más mapas, más misiones) está en [docs/ZOMBIS.md](docs/ZOMBIS.md).
- Terreno y ambientación: revisados con capturas, no en partidas con gente; lo que falta (y por qué no hay grilla irregular) está en [docs/TERRENO.md](docs/TERRENO.md).
- Máximo 6 personajes por partida (3v3). 5v5 queda para Fase 2 con servidor dedicado.
- El host tiene que quedarse en la partida (si se va, termina para todos). Si un cliente se cae, un bot lo reemplaza y puede volver a entrar con el mismo link.
- Controles táctiles: probados con táctil emulado en el navegador, no en un teléfono real (falta medir cuántos cuadros da y cómo se sienten los pulgares). Por datos móviles la conexión directa suele necesitar TURN (ver 2.6), y conviene que el anfitrión sea una PC.
- La simulación (`src/core`) es TypeScript puro sin DOM: se puede mover a un server dedicado (Node/Deno/Bun) cambiando solo la capa `net/`.
