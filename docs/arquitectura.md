# Arquitectura (versión web)

Parte de la propuesta original en [arquitectura-original.txt](arquitectura-original.txt) y la lleva a código. Resumen: **Supabase solo para encontrarse, WebRTC para jugar, el navegador del host es el servidor**.

```
                     SUPABASE
              ┌───────────────────┐
              │ Realtime          │  ← signaling (broadcast) + salas abiertas (presence)
              │ PostgreSQL        │  ← historial: games, players, matches, game_results
              └─────────┬─────────┘
                        │ offer / answer / ICE  (solo al conectar)
              ┌─────────┴─────────┐
          BROWSER A           BROWSER B..F
            HOST                CLIENTES
              │                   │
              └────── WebRTC ─────┘
                 DataChannels P2P (estrella: cada cliente ↔ host)
```

Infraestructura propia: **ninguna**. Ni VPS, ni Node server, ni WebSockets propios. El frontend es estático (GitHub Pages).

## 1. Capas del código

| Capa | Carpeta | Depende de | Qué hace |
|---|---|---|---|
| Núcleo | `src/core` | nada (TS puro) | Simulación determinista por ticks, reglas, héroes, bots, codificación de snapshots |
| Red | `src/net` | core, Supabase SDK | Signaling intercambiable, enlaces WebRTC, sesiones host y cliente |
| Render | `src/render` | core, Three.js | Dibuja "frames" del mundo; no conoce la red |
| Juego | `src/game` | todo | Bucle de partida: input → sesión → frames → render/HUD/audio |
| UI | `src/ui`, `src/app.ts` | todo | Menú, lobby, HUD, forja |
| Datos | `src/db` | Supabase SDK | Persistencia de resultados (nunca del estado de juego) |

La regla importante: **`core` no importa nada de navegador**. Por eso se testea en Node (`npm test` corre partidas completas de bots sin pantalla) y por eso el día de mañana se puede correr en un servidor dedicado sin reescribir el juego.

## 2. Modelo de red

- **Host autoritativo.** Solo el host corre `Simulation` (60 ticks/s). Los clientes nunca deciden golpes, daño ni muertes.
- **Dos DataChannels por cliente:**
  - `rel` (confiable, ordenado): hello/welcome, lobby, inicio de partida, **eventos** (golpes, explosiones, ring-outs, trozos de material), comandos de forja, chat, fin de partida.
  - `fast` (sin reintentos, desordenado): **inputs** del cliente (cada tick, con los últimos 4 frames de redundancia) y **snapshots** del host (20 Hz).
- **Snapshots:** el mundo público se serializa una sola vez por envío (`encodeWorld`) y a cada cliente se le agrega su parte privada (`me`: enfriamientos, materiales, XP, estado de movimiento para predecir) y el `ack` del último input procesado.
- **Eventos con tick:** cada evento lleva el tick en que ocurrió; el cliente los reproduce cuando su render "llega" a ese tick, así el efecto coincide con lo que ve.

### Flujo de conexión

```
Cliente                     Supabase Realtime (canal rubble-room-CODIGO)           Host
   │ join canal + presence ───────────────►│◄──────────────── presence (role: host) │
   │ ve al host en presence                │                                         │
   │ 'join' {name} ────────────────────────┼────────────────────────────────────────►│ crea RTCPeerConnection
   │◄──────────────────────────────────────┼──────────────────────── 'offer' (SDP)   │ + canales rel/fast
   │ 'answer' ─────────────────────────────┼────────────────────────────────────────►│
   │◄═════════════ 'ice' ida y vuelta ═════╪════════════════════════════════════════►│
   │════════════════ DataChannels abiertos (P2P) ═══════════════════════════════════│
   │ hello {pid, name, versión} ──────────────────────────────────────────────────►│ welcome + lobby
   │ (a los 4 s suelta el canal de Supabase: ya no participa)                          │
```

Sin Supabase configurado se usa `BroadcastChannel` con la misma interfaz (`SignalingChannel`): funciona entre pestañas del mismo navegador y sirve para desarrollar y para los tests E2E. Cambiar de proveedor de signaling = implementar esa interfaz.

## 3. Tiempo, predicción e interpolación

- El reloj de simulación corre en un **Web Worker** (`game/ticker.ts`): los navegadores frenan los timers de pestañas en segundo plano, y si el host cambia de pestaña el juego no se congela para los demás.
- **Host:** simula cada tick y dibuja interpolando entre los dos últimos frames (render suave a cualquier Hz de monitor).
- **Cliente:**
  - **Predicción del propio movimiento:** aplica `stepMove` (el mismo código que usa el host) a cada input apenas lo genera. Al llegar un snapshot, toma el estado del servidor en el último input confirmado (`ack`) y **re-simula** los inputs pendientes. La diferencia con lo que se estaba mostrando se absorbe con un offset visual que decae (sin tirones).
  - **Interpolación del resto:** dibuja el mundo ~7 ticks (≈115 ms) atrás, interpolando entre snapshots.
  - Las acciones que controlan la posición (salto de ulti, etc.) y las muertes no se predicen: se siguen tal cual las manda el host.
- El host consume **un input por tick** por cliente (con buffer de jitter y descarte si se atrasa más de 4 frames, combinando botones para no perder toques).

## 4. Persistencia (PostgreSQL)

Solo lo que sobrevive a la partida:

```
players       (id, name, created_at, last_seen)
games         (id, code, host_player_id, status, created_at, updated_at)   ← una fila por sala
matches       (id, game_id, mode, map, teams, started_at, ended_at, duration_s, winner_team, draw, reason)
game_results  (match_id, player_id, player_name, hero, team, is_bot, kills, deaths, assists, heat_dealt, level, won)
leaderboard   (vista: victorias y partidas agrupadas por nombre)
```

Escribe el **host** al crear la sala, al empezar/terminar partidas y al cerrar. Nunca se escribe estado por tick. Si las tablas no existen, el juego sigue funcionando.

## 5. Qué hace y qué NO hace Supabase

| Hace | No hace |
|---|---|
| Canal de signaling por sala (broadcast) | Transportar movimientos o inputs |
| Lista de salas abiertas (presence en `rubble-lobby`, se limpia sola si el host cierra) | Guardar estado de partida |
| Historial y ranking (Postgres) | Correr lógica de juego |

## 6. Cómo escala

1. **Más jugadores por sala:** la topología es estrella (el host sube un snapshot por cliente). A 20 Hz con ~3 KB por snapshot son ~60 KB/s por cliente: 5 clientes ≈ 2.4 Mbps de subida del host. Para 5v5 conviene servidor dedicado.
2. **Servidor dedicado:** `src/core` no depende del navegador. Un server Node/Deno/Bun puede instanciar `Simulation` y hablar el mismo protocolo (`core/protocol.ts`) por WebSocket o WebRTC (p. ej. con `werift`/`node-datachannel`). Solo cambia `net/host.ts`; render, UI, héroes y reglas quedan iguales.
3. **TURN:** si hay jugadores que no conectan por NAT estricto, agregar servidores TURN en la config (`VITE_ICE_SERVERS`).
4. **Anti-trampa:** con host autoritativo el host podría hacer trampa. Para amigos está bien; para público, servidor dedicado.
