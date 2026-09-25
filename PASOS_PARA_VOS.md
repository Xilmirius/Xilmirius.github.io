# Lo que tenés que hacer vos para que funcione todo online

Tiempo estimado: **15 minutos**. No hace falta instalar nada ni descargar assets: modelos, sonidos y música se generan por código. Solo hay que crear la cuenta de Supabase y activar GitHub Pages; lo demás ya está hecho y subido a `main`.

Orden recomendado: **1 → 2 → 3 → 4**. Las secciones 5 a 7 son opcionales o para cuando algo falle.

---

## 1. Crear el proyecto de Supabase (5 min)

Supabase es lo que usan los navegadores para encontrarse. Una vez conectados, el juego va directo entre ustedes (P2P) y Supabase deja de participar. También guarda el historial de partidas.

- [ ] Entrá a https://supabase.com y creá una cuenta (podés entrar con GitHub).
- [ ] **New project**:
  - Nombre: el que quieras (ej. `rubble`).
  - Database password: generá una y guardala (el juego no la usa, pero Supabase te la pide).
  - Región: **South America (São Paulo)**, que es la más cercana a Argentina.
  - Plan: **Free**.
- [ ] Esperá 1-2 minutos a que termine de crearse.
- [ ] Andá a **Project Settings → API** (en algunas versiones del panel se llama "Data API" o "API Keys") y copiá dos cosas a un bloc de notas:
  - **Project URL**: algo como `https://abcdefghijk.supabase.co`
  - **anon public key** (o **publishable key**, que empieza con `sb_publishable_`)

  > ⚠️ Usá la **anon/publishable**, nunca la `service_role` ni la `secret`. La anon es pública por diseño: está bien que quede en el navegador.

- [ ] **Realtime → Settings**: verificá que **no** esté activado *"Private channels only"* / que esté permitido el acceso público a los canales. Viene así por defecto.

## 2. Crear las tablas del historial (1 min, recomendado)

Sin esto el juego funciona igual, pero no se guardan el ranking ni las últimas partidas.

- [ ] En Supabase: **SQL Editor → New query**.
- [ ] Abrí el archivo [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) de este repo, copiá **todo** y pegalo.
- [ ] **Run**. Tiene que decir *Success*. Se puede correr más de una vez sin problema.
- [ ] (Chequeo) En **Table Editor** deberías ver `players`, `games`, `matches` y `game_results`.

## 3. Publicar el juego en GitHub Pages (5 min)

- [ ] En GitHub, en el repo **WebGame1**: **Settings → General → Default branch** → cambiala a **`main`** (botón ⇄ → elegí `main` → *Update*).
  > El repo estaba vacío y la primera rama que se subió fue la de desarrollo (`claude/…`), así que quedó como default. GitHub Pages por defecto **solo deja deployar desde la rama default**; si no la cambiás, el deploy falla con *"Branch main is not allowed to deploy to github-pages"*.
- [ ] **Settings → Pages → Build and deployment → Source: GitHub Actions**.
- [ ] **Settings → Secrets and variables → Actions → pestaña *Variables* → New repository variable**. Creá dos:

  | Nombre | Valor |
  |---|---|
  | `VITE_SUPABASE_URL` | tu Project URL del paso 1 |
  | `VITE_SUPABASE_ANON_KEY` | tu anon/publishable key del paso 1 |

  > Tienen que ir en **Variables**, no en *Secrets* (el workflow las lee como `vars.`). Si algún día sumás TURN (paso 6), eso sí va en *Secrets*.

- [ ] Andá a la pestaña **Actions → workflow "Deploy" → Run workflow** (branch `main`).
  > El primer "Deploy" que se disparó con el push probablemente falló con *"Get Pages site failed"*: es normal, Pages todavía no estaba activado. Con **Run workflow** o **Re-run jobs** alcanza.
- [ ] Esperá a que quede en verde (1-2 min). Corre los tests, buildea y publica.
- [ ] El juego queda en: **https://xilmirius.github.io/WebGame1/**

## 4. Verificar que todo anda (3 min)

- [ ] Abrí https://xilmirius.github.io/WebGame1/. Abajo del menú tiene que decir **"🟢 Online: Supabase configurado"**.
  - Si dice "🟡 Modo local", las variables del paso 3 no llegaron al build: revisá los nombres y volvé a correr *Deploy*.
- [ ] Tocá **🎮 Crear sala**. Aparece un código de 5 letras.
- [ ] En **otra PC** (o en una **ventana de incógnito** del mismo navegador), abrí el sitio. La sala tiene que aparecer en **"Salas abiertas"**, o podés escribir el código.
- [ ] Entrá: los dos se ven en el lobby. Empezá la partida y probá moverte desde los dos lados.
- [ ] Al terminar, en el menú **🏆 Historial** debería aparecer la partida (si hiciste el paso 2).

Si todo eso anduvo, ya está: pasale el link a tus amigos. **Crear sala → 🔗 Copiar link** genera `…/WebGame1/?sala=CODIGO`, que los mete directo en tu sala.

---

## 5. Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El menú dice "🟡 Modo local" en el sitio publicado | Faltan las variables o el deploy se hizo antes de crearlas | Paso 3: revisá los nombres exactos y corré *Deploy* de nuevo |
| "No se pudo conectar a Supabase Realtime" | URL o key mal copiadas, o Realtime en modo privado | Revisá el paso 1. Para probar rápido sin redeployar: **⚙️ Ajustes → Avanzado** en el juego |
| "No existe la sala XXXXX" | Código mal escrito o el host cerró la pestaña | Que el host cree otra sala |
| "No se pudo abrir la conexión P2P" | NAT estricto de alguno (CGNAT, algunas redes móviles o corporativas) | Paso 6 (TURN) |
| El workflow *Deploy* falla con "Get Pages site failed" | Pages no está activado | Paso 3, segunda casilla |
| El workflow falla con "Branch main is not allowed to deploy to github-pages" | `main` no es la rama por defecto | Paso 3, primera casilla. O en **Settings → Environments → github-pages** agregá `main` a las ramas permitidas |
| El workflow falla en `npm test` | Rompiste algo en el código | Corré `npm test` local para ver qué |
| "🏆 Historial" vacío | No corriste el SQL | Paso 2 |
| Va lento o a tirones | PC con poca GPU | En **⚙️ Ajustes** apagá *Brillos y postproceso* y *Sombras*. El juego ya los apaga solo si detecta pocos FPS |
| Lag para todos | El host tiene mala conexión o PC | Que hostee el que tenga mejor internet y PC |
| No se escucha nada | El navegador bloquea el audio hasta el primer clic | Hacé clic en cualquier lado. Volúmenes en **⚙️ Ajustes** |
| El locutor habla en inglés o no habla | La voz depende del sistema operativo | Se desactiva en **⚙️ Ajustes → Locutor**. Con líneas grabadas se reemplaza (ver `docs/MEJORAS_CON_ASSETS.md`) |

## 6. (Opcional) Servidor TURN, solo si alguien no puede conectarse

WebRTC conecta directo usando STUN, que es gratis. Si un amigo tiene NAT estricto, hace falta un **TURN** que retransmita el tráfico:

- [ ] Creá una cuenta gratis en un proveedor TURN (por ejemplo **Metered**, https://www.metered.ca, o **Cloudflare Calls/TURN**) y generá credenciales.
- [ ] Armá el JSON de servidores ICE, del estilo:
  ```json
  [{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:TU-SERVIDOR:80","username":"USUARIO","credential":"CLAVE"}]
  ```
- [ ] GitHub → **Settings → Secrets and variables → Actions → *Secrets* → New repository secret** → nombre `VITE_ICE_SERVERS`, valor: ese JSON. Después corré **Deploy** de nuevo.
  - Para probar sin redeployar, pegalo en **⚙️ Ajustes → Avanzado → Servidores ICE** (queda guardado solo en ese navegador).

## 7. (Opcional) Otras cosas que podés sumar

- **Música propia:** poné `public/audio/music.mp3` (partida) y `public/audio/menu.mp3` (menú) y hacé push. Se usan en vez de la música generativa.
- **Sonidos o locutor grabados:** ver [`docs/MEJORAS_CON_ASSETS.md`](docs/MEJORAS_CON_ASSETS.md). Basta con dejar los archivos y un `manifest.json`.
- **Dominio propio:** GitHub → Settings → Pages → *Custom domain*.
- **Jugar en tu PC sin publicar:** `npm install && npm run dev` → http://localhost:5173. Para usar Supabase en local, copiá `.env.example` a `.env` y completalo.

## Qué NO tenés que hacer

- No hace falta servidor, VPS, Docker ni pagar hosting: GitHub Pages y Supabase Free alcanzan de sobra para jugar con amigos.
- No hace falta descargar modelos, texturas ni sonidos.
- No hace falta crear cuentas de usuario: cada jugador pone su nombre, y su nivel y sus logros quedan guardados en su navegador.
