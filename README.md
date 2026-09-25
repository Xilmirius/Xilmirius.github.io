# RUBBLE — arena brawler de materiales (versión web)

> Codename **ProjectRubble**. Nombre final del juego/estudio todavía TBD (ver [docs/GDD.md](docs/GDD.md)).

Arena brawler isométrico para jugar **en el navegador con amigos**: sesiones cortas, 1v1 a 3v3 o todos contra todos, mapa destructible y combate de **knockback físico** estilo Smash. No hay barra de vida: cada golpe te **agrieta** y cuanto más roto estás, más lejos volás. Se muere solo por **ring-out** (saliendo del mapa).

- 4 héroes, uno por familia de material: **Canto** (Piedra), **Prisma** (Cristal), **Gloop** (Goo), **Remache** (Metal).
- Mapa que se rompe: cobertura destructible, pisos frágiles que dejan agujeros, materiales para farmear.
- Ítems (3 pasivos + 3 activos), mutaciones de habilidad por nivel, reparación del cuerpo.
- 3 modos sobre el mismo núcleo: **Vidas**, **Ring-outs** y **Control de zona**.
- Bots para practicar, completar equipos y reemplazar a quien se desconecta.
- Multijugador **P2P por WebRTC** (host autoritativo en el navegador) con signaling en **Supabase Realtime**. Cero servidores propios.
- **Cero assets externos**: modelos, texturas, sonidos y música son procedurales. No tenés que descargar nada.
- **Espectáculo de feedback**: bloom y postproceso, luces dinámicas, explosiones, números de heat flotantes, "zoom de KO" con congelado y cámara lenta en golpes letales, pilares de luz en cada ring-out, combos con sonido ascendente, anuncios de rachas con locutor, monedas que vuelan al HUD, confeti, premios al final de cada partida.
- **Gamificación**: nivel de cuenta, 17 logros y sombreros cosméticos que se desbloquean jugando (se guardan en tu navegador).
- **Temas visuales** del mapa: Neón, Cantera, Atardecer y Noche (lo elige el host en el lobby).

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
| **Q · E · F** | Habilidades (se desbloquean en nivel 1, 2 y 3) |
| **R** | Ulti (nivel 5) |
| **1 · 2 · 3** | Ítems activos |
| **C** | Forja: fabricar ítems y mutaciones |
| **V** (mantener) | Reparar tu cuerpo con tu material |
| **Shift** | Correr la cámara hacia el cursor |
| **Tab** | Tabla de jugadores |
| **Esc** | Pausa / salir |

## 4. Cómo se juega (resumen)

- **Heat y etapas:** Intacto (0) → Agrietado (40) → Quebrado (90) → Destrozado (150). Cada etapa multiplica cuánto volás (×0.42 / ×0.85 / ×1.25 / ×1.8). El cuerpo se ve roto: la piedra se agrieta, el cristal se fractura, el goo se derrite, el metal se abolla.
- **Ritmo:** romper (clic) → entrar → sacar (empujón cargado). El empujón cargado se telegrafía con un cono en el piso.
- **El cuerpo lanzado es un proyectil:** rompe cobertura, se estampa contra paredes (suma heat) y voltea a otros (combos de billar).
- **El que vuela no está indefenso:** corregís con WASD en el aire, tenés segundo salto (cancela el tumbo) y trepás bordes automáticamente si empujás hacia la cornisa.
- **Materiales:** rompé rocas 🪨, chatarra 🔩, cristales 💎 y goo 🟢. Sirven para ítems, mutaciones (usan el material de tu familia) y reparación.
- **Niveles 1–10:** XP por pegar, farmear y sacar gente. Mutaciones en niveles 3, 6 y 9 (Tanque / Carry / Support).
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
    movement.ts    Movimiento compartido (host y predicción del cliente usan el mismo código)
    terrain.ts     Terreno como grilla de alturas; baldosas frágiles
    collision.ts   Colisión terreno + obstáculos
    heroes/        Un archivo por héroe (kit de 4 habilidades + básico)
    items.ts       Ítems pasivos/activos
    mutations.ts   Rutas de mutación (Tanque/Carry/Support)
    modes.ts       Modos de juego (interfaz agnóstica)
    bots.ts        IA (A* sobre la grilla, recuperación, crafteo)
    snapshot.ts    Frames de mundo, codificación de red e interpolación
    maps/          Mapas en ASCII
  net/           Signaling (Supabase / local), WebRTC, sesiones host y cliente
  render/        Three.js: terreno, beans, efectos, cámara, postproceso (post.ts), juice (juice.ts), temas (themes.ts)
  audio/         Síntesis de sonido y música generativa (WebAudio)
  ui/            Menú, lobby, HUD, forja, estilos
  game/          Bucle de partida (hitstop y cámara lenta visuales), input, ticker en Worker, menú animado, perfil y logros
  db/            Persistencia en Postgres (historial)
supabase/migrations/   SQL del esquema
tests/                 Unit tests + partidas headless de bots + E2E con Playwright
```

## 7. Agregar contenido (escala sin tocar sistemas)

- **Héroe nuevo:** copiá `src/core/heroes/canto.ts`, cambiá números y `cast()` usando la API de `Simulation` (`meleeArc`, `fireProjectile`, `lob`, `blast`, `dash`, `leap`, `roll`, `zip`, `addZone`, `buildWall`...). Registralo en `heroes/index.ts` y en `HERO_IDS` (`core/types.ts`). Hereda las 3 rutas de mutación de su familia gratis. El modelo 3D es el mismo bean con la piel de su familia; si querés accesorios propios, agregalos en `render/beanView.ts → buildExtras`.
- **Mapa nuevo:** agregá un bloque ASCII en `src/core/maps/index.ts` (leyenda en el archivo). El test `mapas` valida que tenga spawns, zonas y frágiles.
- **Ítem nuevo:** entrada en `core/items.ts` + efecto en `Simulation.recalcStats` (pasivo) o `tryItem` (activo).
- **Modo nuevo:** implementá `GameMode` en `core/modes.ts`.

## 8. Tests

```bash
npm test                 # unit tests + 4 partidas completas de bots en headless (≈2 s)
npm run build
npm run test:e2e         # Chromium: menú, práctica vs bots, y host+cliente por WebRTC real en 2 pestañas
node tests/e2e/showcase.mjs   # screenshots de cada héroe usando sus habilidades
VITEST_TOOLS=1 npx vitest run # herramientas de balance (tabla de knockback, estadísticas de bots)
```

Para Playwright se usa `playwright-core` con el Chromium del sistema (`CHROMIUM=/ruta/a/chrome` si no está en `/opt/pw-browsers`).

## 9. Assets opcionales

Todo es procedural, pero se puede reemplazar sin tocar código:
- Música: `public/audio/music.mp3` (partida) y `public/audio/menu.mp3` (menú).
- Efectos: `public/audio/sfx/<nombre>.mp3` + `public/audio/sfx/manifest.json` con la lista de nombres.
- Locutor: `public/audio/voice/<slug>.mp3` + `public/audio/voice/manifest.json`.

El plan completo (modelos en Blender, íconos, arte, VFX) está en [docs/MEJORAS_CON_ASSETS.md](docs/MEJORAS_CON_ASSETS.md).

**Ajustes de rendimiento** (⚙️ en el menú): sombras, brillos/postproceso, alta resolución y locutor. Si los FPS caen mucho durante una partida, el juego apaga los brillos solo.

## 10. Límites conocidos / próximos pasos

- Máximo 6 personajes por partida (3v3). 5v5 queda para Fase 2 con servidor dedicado.
- El host tiene que quedarse en la partida (si se va, termina para todos). Si un cliente se cae, un bot lo reemplaza y puede volver a entrar con el mismo link.
- Juego de teclado y mouse (no hay controles táctiles).
- La simulación (`src/core`) es TypeScript puro sin DOM: se puede mover a un server dedicado (Node/Deno/Bun) cambiando solo la capa `net/`.
