# Mejoras con assets reales: plan para un agente con Blender, bibliotecas de assets o generadores

**Para quién es esto:** otro agente (o una persona) que tenga acceso a Blender, a bibliotecas de assets, a generadores de imagen, audio o voz, o que pueda descargar de internet. Hoy **todo el juego es procedural** (formas geométricas, texturas dibujadas en canvas, audio sintetizado). Eso lo hace liviano y sin licencias, pero tiene techo visual. Cada mejora de abajo dice **qué hacer, con qué especificaciones y dónde se enchufa en el código**, siempre con *fallback* a lo procedural si el archivo no está.

Reglas generales:
- **Licencias:** solo CC0, CC-BY (con atribución) o assets propios o generados con términos que permitan uso comercial. Registrá **todo** en `CREDITS.md` (archivo, autor, licencia, URL).
- **Presupuesto:** texturas ≤ 1024 px (512 en props), modelos ≤ 3.000 triángulos por personaje y ≤ 800 por prop, peso total de assets ≤ 25 MB. Es un juego web: cada MB es tiempo de carga.
- **Estilo:** toon/low-poly, colores saturados, siluetas legibles desde arriba (cámara isométrica a ~58°). Identidad propia; Fall Guys es solo referencia de producción (ver GDD §8).
- **Nada se rompe si falta un archivo:** todo cargador nuevo tiene que caer al procedural si el archivo no existe (patrón ya usado en `src/audio/audio.ts → checkFiles/loadSamples/loadVoices`).
- **Probar** con `npm run build && node tests/e2e/showcase.mjs`, que saca screenshots de cada héroe usando sus habilidades.

---

## Prioridad 1: lo que más cambia la percepción (3D)

### 1.1 Personajes: bean con rig y animaciones (Blender)
Hoy: cápsula + ojos + manos flotantes (`src/render/beanView.ts`, funciones `bodyGeometry`, `buildExtras`, `update`).

**Entregables**
- `public/models/bean_base.glb`: **un solo rig** para todos (pilar de escala del GDD).
  - Escala 1 unidad = 1 m. Alto total ≈ 1.45. Origen en los pies. Mira hacia **+Z**.
  - Huesos: `root`, `body`, `head`, `hand_L`, `hand_R`, `foot_L`, `foot_R` (manos y pies separados del cuerpo, estilo bean).
  - Animaciones (loop donde corresponde), con estos nombres exactos: `idle`, `run`, `jump`, `fall`, `tumble` (girando por el aire), `punch`, `push_charge` (manos atrás, loop), `push_release`, `cast` (brazos arriba), `aim` (brazos al frente), `dash`, `roll` (hecho bolita), `stunned` (loop), `repair` (loop), `victory`, `defeat`, `hit_react`.
- Un GLB por héroe con **solo sus accesorios**, para no duplicar el cuerpo: `public/models/heroes/canto.glb` (rocas en hombros, cejas), `prisma.glb` (cristales en la cabeza), `gloop.glb` (gota, burbujas), `remache.glb` (casco de obra con linterna, bulones). Nodos colgados del hueso `head` o `body`.
- **Piel por familia y por etapa de daño** (GDD D-0015: *te rompés como el mapa*): 4 familias × 4 etapas (intacto, agrietado, quebrado, destrozado) = 16 texturas base + 16 máscaras de emisión para las grietas que brillan. Nombres: `public/textures/skins/<familia>_<etapa>.png` y `<familia>_<etapa>_glow.png`, con familia ∈ `stone|metal|crystal|goo` y etapa `0..3`.
  - Piedra se agrieta (grietas naranja lava), Cristal se fractura (líneas blancas), Goo se derrite (chorreados), Metal se abolla (abolladuras y óxido).

**Integración (código)**
- Crear `src/render/assets.ts` con un `GLTFLoader` (`three/examples/jsm/loaders/GLTFLoader.js`) que precargue el GLB al entrar al lobby y guarde en caché. Si falla la carga → `null`.
- En `BeanView`: si hay GLB, clonar con `SkeletonUtils.clone`, reemplazar `body/outline/eyes/hands/feet`, y manejar un `AnimationMixer`. Mapear el estado del `CharFrame` a animaciones:
  - `fl & F_TUMBLE` → `tumble`; `ac === 'roll'` → `roll`; `ac === 'dash'` → `dash`; `ac === 'wind'|'slam'` → `cast`; `ac === 'aim'` → `aim`
  - `fl & F_CHARGING` → `push_charge`; evento `swing` con `c` = `push*` → `push_release`; `punch`/`wrench` → `punch`
  - `fl & F_STUN` → `stunned`; `fl & F_REPAIRING` → `repair`; en el aire → `jump`/`fall` según `vy`; velocidad > 0.5 → `run`; si no → `idle`
- **Mantener** todo el feedback que ya existe sobre el bean: contorno por etapa (`outlineMat`), aura de ulti, escudo, piel de roca, estrellas de aturdido, `hitFlash`, squash & stretch. Para el contorno con malla con skinning usar un segundo `SkinnedMesh` con `BackSide` o un post de contorno.
- Sombreros: se enganchan al hueso `head` (hoy `buildHat` en `beanView.ts`).

### 1.2 Sombreros cosméticos (Blender)
`public/models/hats/<id>.glb`, con ids iguales a `src/core/cosmetics.ts`: `party`, `horns`, `tophat`, `halo`, `propeller`, `viking`, `crown`. ≤ 400 triángulos cada uno. Origen en la base del sombrero; el nodo que deba girar (hélice, aureola) se tiene que llamar `spin`. Integración: en `buildHat(id)`, si existe el GLB, usarlo.
**Ideas de sombreros nuevos** (se suman a `HATS` con su nivel de cuenta): casco de minero, cono de tránsito, corona de cristal, gorro de piñata, cresta punk, gorra de repartidor, sombrero de gaucho.

### 1.3 Props del mapa con 3 estados de daño (Blender o kits)
Hoy: icosaedros, cajas y octaedros (`src/render/propsView.ts → buildDestructMesh`); los estados de daño solo escalan e inclinan.
- `public/models/props/<familia>_<estado>.glb` con familia ∈ `stone|metal|crystal|goo` y estado `0|1|2` (intacto, dañado, muy dañado). Tamaños en `DESTRUCT_DEF` (`src/core/entities.ts`): piedra 1.4×1.3, chatarra 1.4×1.35, cristal 1.1×1.8, goo 1.3×1.0 (ancho × alto). **Respetar la huella**, porque la colisión usa esas medidas.
- Trozos de escombro para las partículas: `public/models/props/debris_<familia>.glb` (3-5 piezas chicas).
- Construcciones: `wall_metal.glb` (1.1×1.8×1.1), `wall_stone.glb`, `turret.glb` con la cabeza en un nodo `head` que gira.
- Trozos de material para juntar: `pickup_<familia>.glb` (≈0.4 m, que brillen: material emisivo).
- **Kits CC0 recomendados:** Kenney (https://kenney.nl: *Nature Kit*, *Space Kit*, *Tower Defense Kit*, *Blocky Characters*), Quaternius (https://quaternius.com: *Ultimate Nature*, *Stylized*), Poly Pizza (https://poly.pizza, filtrar CC0).
- Integración: `DestructiblesView.apply` elige el GLB según el estado (`s`); `StructuresView.build`; `pickupMesh`.

### 1.4 Terreno con kit de baldosas
Hoy: una malla generada por celdas con atlas procedural (`src/render/terrainView.ts`, `src/render/textures.ts → terrainAtlas`).
- Opción rápida: reemplazar el atlas por textura real (`public/textures/terrain_atlas.png`, 1024×512). Mitad izquierda: baldosa de piso tileable 2×2 m con bordes. Mitad derecha: estratos de roca verticales. Hacer una variante por tema.
- Opción completa: kit modular (piso, piso frágil agrietado, rampa, muro, cornisa de borde) instanciado por celda.
- Baldosas frágiles: textura con grietas en 4 etapas (`tileCracks(stage)`).

### 1.5 Cielos y fondos por tema
Hoy: color plano + rocas y cristales flotando (`GameView.buildBackdrop`, `src/render/themes.ts`).
- Un panorama equirectangular por tema (`public/textures/sky/<tema>.jpg`, 2048×1024): `neon` (espacio violeta con nebulosas y luces), `clasico` (cantera al mediodía), `atardecer`, `noche` (estrellas y aurora). Poly Haven (CC0) tiene HDRIs; también sirve un generador de imagen con prompt de panorama 360.
- Integración: `scene.background = texture` con `EquirectangularReflectionMapping` si el archivo existe.

---

## Prioridad 2: sonido que se siente

### 2.1 Efectos de sonido (samples reales)
El motor ya soporta reemplazo: si existe `public/audio/sfx/manifest.json` con la lista de nombres, carga `public/audio/sfx/<nombre>.mp3` (u `.ogg`/`.wav`) y lo usa en vez del sintetizado (`src/audio/audio.ts → loadSamples`, `play`).

Nombres usados por el juego (un archivo por nombre; duración corta, normalizados a −3 dB):

| Nombre | Qué es |
|---|---|
| `hit`, `hitbig` | golpe normal y golpe fuerte (se pitchea según el heat) |
| `swing`, `push`, `charge` | swing cuerpo a cuerpo, empujón, carga |
| `shard`, `lance`, `glob`, `wave`, `hook`, `bolt` | disparos (cristal, lanza, goo, ola, gancho, torreta) |
| `boom`, `quake`, `lethal` | explosión, terremoto, **golpe letal** (bajo profundo + agudo) |
| `crack`, `stage` | grieta de material, cambio de etapa del cuerpo |
| `crystal`, `metal`, `goo`, `stone` | materiales rompiéndose |
| `jump`, `airjump`, `land`, `slam`, `bounce`, `whoosh` | movimiento e impactos |
| `ringout`, `crowd` | caída al vacío (silbido + explosión) y **público** vitoreando |
| `pickup`, `coin` | juntar material (`coin` se pitchea en cadena, suena a moneda) |
| `combo` | sube de tono con cada golpe del combo (un "ding" corto y afinado) |
| `levelup`, `craft`, `repair`, `shield`, `ultready`, `ready`, `jackpot` | recompensas |
| `count`, `go`, `tick`, `announce` | cuenta regresiva, largada, últimos 10 s, anuncio grande |
| `heart` | latido cuando estás destrozado |
| `ui`, `hover`, `deny` | interfaz |
| `win`, `lose` | fin de partida |

Fuentes: **Kenney** (CC0: *Impact Sounds*, *Interface Sounds*, *Digital Audio*, *Casino Audio* para monedas y jackpot), **Sonniss GDC bundles** (royalty-free), **freesound.org** (filtrar CC0), o generación con **ElevenLabs Sound Effects** (revisar términos de uso comercial).

### 2.2 Música
Ya soportado: `public/audio/music.mp3` (partida) y `public/audio/menu.mp3` (menú), en loop.
- Estilo: electro-funk o "arcade show", 120–130 BPM, enérgico, que loopee sin corte. En el menú, versión más tranquila del mismo tema.
- Ideal: una tercera pista de tensión para los últimos 30 segundos (hoy la música generativa acelera sola con `audio.tension`). Para soportarla: `public/audio/final.mp3` y cambiar de pista cuando `audio.tension ≥ 0.7`.
- Fuentes: Incompetech (CC-BY, con atribución), OpenGameArt, o generación (Suno/Udio: revisar licencia comercial) o encargo.

### 2.3 Locutor grabado (voz rioplatense)
Ya soportado: si existe `public/audio/voice/manifest.json` con los *slugs*, `audio.say(texto)` reproduce `public/audio/voice/<slug>.mp3` en vez de la voz del navegador. El slug es el texto en minúsculas, sin tildes ni signos y con `_` (función `voiceSlug` en `src/audio/audio.ts`).

Líneas a grabar (slug → texto). Tono de relator de fútbol / show, enérgico:

```
primer_ring_out        "¡Primer ring-out!"
doble_ring_out         "¡Doble ring-out!"
triple_ring_out        "¡Triple ring-out!"
masacre                "¡Masacre!"
imparable              "¡Imparable!"
en_racha               "¡En racha!"
leyenda                "¡Leyenda!"
dios_de_la_cantera     "¡Dios de la cantera!"
racha_cortada          "¡Racha cortada!"
letal                  "¡Letal!"
afuera                 "¡Afuera!"
salvada_epica          "¡Salvada épica!"
ulti_lista             "¡Ulti lista!"
combo                  "¡Combo!"
brutal                 "¡Brutal!"
salvaje                "¡Salvaje!"
bestial                "¡Bestial!"
inhumano               "¡Inhumano!"
rubble                 "¡Rubble!"
punto_de_partido       "Punto de partido"
ultima_vida            "Última vida"
ultimo_minuto          "Último minuto"
ultimos_treinta_segundos "Últimos treinta segundos"
la_zona_se_movio       "La zona se movió"
a_pelear               "¡A pelear!"
3 / 2 / 1              "Tres" / "Dos" / "Uno"
fin_de_la_partida      "¡Fin de la partida!"
victoria / derrota / empate
nivel_de_cuenta_2 … nivel_de_cuenta_20
```

Generación: **ElevenLabs** (voz en español rioplatense, estilo "sports announcer") o grabación propia. Exportar mp3 mono a 96–128 kbps.

---

## Prioridad 3: arte 2D e interfaz

### 3.1 Íconos (reemplazar emojis)
Hoy los íconos son emojis, así que dependen del sistema operativo y se ven distintos en cada PC.
- 128×128 PNG con fondo transparente, borde grueso y el mismo estilo que los personajes.
- `public/icons/abilities/<heroe>_<slot>.png` (16: 4 héroes × q/e/f/r), `public/icons/basic_<heroe>.png`, `public/icons/push.png`.
- `public/icons/items/<id>.png` (13, ids en `src/core/items.ts`), `public/icons/materials/<familia>.png` (4), `public/icons/hats/<id>.png`, `public/icons/achievements/<id>.png` (ids en `src/game/profile.ts`).
- Integración: en `src/ui/hud.ts` (`buildBar`, `renderMats`, forja) y `src/app.ts` (lobby, logros), usar `<img>` si el archivo existe y el emoji si no. Conviene un `icons/manifest.json` para no pedir archivos que no existen.

### 3.2 Retratos y splash art de héroes (generador de imagen)
- `public/art/heroes/<id>_portrait.png` (512×512, para la tarjeta del lobby y el HUD) y `<id>_splash.jpg` (1920×1080, fondo del lobby al elegirlo).
- **Prompt base** (ajustar por héroe): *"stylized chibi bean-shaped character made of {material}, toy-like proportions, big expressive eyes, floating round hands, {accesorios}, dynamic heroic pose, vibrant saturated colors, soft rim light, clean cel-shaded style, game key art, dark purple background with neon particles"*.
  - Canto: *rough grey stone body with glowing orange lava cracks, heavy eyebrows, boulders on shoulders*.
  - Prisma: *translucent cyan crystal body with facets, crystal spikes on head, sparkles*.
  - Gloop: *glossy green goo body, dripping, bubbles inside, droplet on top*.
  - Remache: *riveted blue-grey scrap metal body, yellow construction hard hat with headlamp, wrench*.
- Paleta por familia: piedra `#9a8f86` + lava `#ff6a1a`, cristal `#7fe3ff`, goo `#7bea4f`, metal `#8fa3b8` + casco `#ffc94a`. Equipos: azul `#3b8bff` y naranja `#ff7a29`.

### 3.3 Logo y marca
- Logo "RUBBLE" (el nombre final está pendiente en el GDD) en SVG y PNG: letras de piedra agrietada con brillo. Hoy es texto con CSS (`.logo h1` en `src/ui/styles.css`).
- `public/og-image.png` (1200×630) para cuando se comparte el link por WhatsApp o Discord. Agregar `<meta property="og:image">` en `index.html`.
- Favicon (hoy es un emoji inline en `index.html`).

### 3.4 Texturas de efectos (VFX)
Hoy los efectos son geometrías con colores HDR y bloom (`src/render/juice.ts`, `src/render/fx.ts`).
- Spritesheets (flipbooks) de 8×8 cuadros, 1024 px: explosión, humo, chispa, onda expansiva, destello de impacto estilo cómic ("¡PAF!" dibujado), polvo de pisada, polvo de cristal.
- Fuentes: **Kenney Particle Pack** (CC0) o generados.
- Integración: un `Billboard` con `ShaderMaterial` que avance de cuadro en `GlowFX.update`; reemplazar `fireball` y `sparkle`, y el humo en `GameView.handleEvent('boom')`.

---

## Prioridad 4: cosas que no necesitan assets pero suman espectáculo

(Las podés hacer vos o cualquier agente sin herramientas extra.)
- **Repeticiones del KO:** grabar los últimos 3 s de frames (ya existe `FrameBuffer`) y repetir el ring-out final en cámara lenta en la pantalla de resultados.
- **Cámara de KO cinematográfica:** en el golpe letal, rotar un poco la cámara alrededor de la víctima (hoy hace zoom, congela y pasa a cámara lenta).
- **Emotes** (teclas 5-8) con burbujas encima del personaje: sincronizar como un evento más.
- **Pantalla de "Jugador de la partida"** con el bean haciendo su animación de victoria (cuando exista el rig).
- **Trail de colores del arma o empujón** con `MeshLine` o una estela de cinta.
- **Temas nuevos:** agregar entradas en `THEMES` (`src/render/themes.ts`), por ejemplo *Lava*, *Hielo* o *Tormenta* (con relámpagos que iluminen la arena con `LightPool.flash`).

---

## Checklist de entrega para el agente
- [ ] Assets en `public/...` con los nombres exactos de este documento, más sus `manifest.json` donde corresponde.
- [ ] `CREDITS.md` con licencias.
- [ ] Cargadores con fallback: si se borra la carpeta `public/models`, el juego tiene que seguir funcionando igual que hoy.
- [ ] `npm test`, `npm run build`, `npm run test:e2e` y `node tests/e2e/showcase.mjs` en verde, revisando las screenshots.
- [ ] Peso total del build (`dist/`) ≤ 30 MB.
