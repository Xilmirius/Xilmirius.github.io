# Catálogo de assets: de procedural a archivo

> **Generado** desde `src/assets/catalog.ts` con `npm run assets:doc`. No editar a mano.

Todo lo que el juego dibuja o suena por código tiene un **id** y un **archivo esperado**. Hoy: **0 de 171** piezas usan archivo.

**Cómo reemplazar una pieza (de a una):**

1. Elegí una fila de abajo (o abrí el juego → menú → **🧩 Assets** para verla girando y comparar).
2. Creá el archivo en `public/assets/<archivo>` respetando la especificación (sonidos: `public/<archivo>`).
3. Agregá la ruta a `public/assets/manifest.json` → `{ "files": ["<archivo>", ...] }` (sonidos: el nombre en `public/audio/sfx/manifest.json`).
4. Recargá. Si el archivo falla o lo borrás, el juego vuelve solo a la versión procedural.
5. Tildá la casilla corriendo `npm run assets:doc`.

Convenciones de modelos: GLB, 1 unidad = 1 m, origen en la base, mirando a +Z, estilo toon/low-poly. Nodos especiales: `spin` (gira), `head` (torreta), material `team` (se tiñe con el color del equipo).

## Personajes (0/43)

| ✔ | Pieza | Id | Archivo | Especificación | Hoy (código) |
|---|---|---|---|---|---|
| ⬜ | Canto: accesorios | `hero.canto` | `models/heroes/canto.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Solo los accesorios (el cuerpo "bean" es común). Origen en los pies del bean (alto total 1.45). ≤ 1.500 tris. | src/render/beanView.ts → buildExtras |
| ⬜ | Prisma: accesorios | `hero.prisma` | `models/heroes/prisma.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Solo los accesorios (el cuerpo "bean" es común). Origen en los pies del bean (alto total 1.45). ≤ 1.500 tris. | src/render/beanView.ts → buildExtras |
| ⬜ | Gloop: accesorios | `hero.gloop` | `models/heroes/gloop.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Solo los accesorios (el cuerpo "bean" es común). Origen en los pies del bean (alto total 1.45). ≤ 1.500 tris. | src/render/beanView.ts → buildExtras |
| ⬜ | Remache: accesorios | `hero.remache` | `models/heroes/remache.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Solo los accesorios (el cuerpo "bean" es común). Origen en los pies del bean (alto total 1.45). ≤ 1.500 tris. | src/render/beanView.ts → buildExtras |
| ⬜ | Sombrero: Gorro de fiesta | `hat.party` | `models/hats/party.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Origen en la base del sombrero (apoya en la cabeza). ≤ 400 tris. Si algo gira, el nodo se llama "spin". | src/render/beanView.ts → buildHat |
| ⬜ | Sombrero: Cuernos | `hat.horns` | `models/hats/horns.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Origen en la base del sombrero (apoya en la cabeza). ≤ 400 tris. Si algo gira, el nodo se llama "spin". | src/render/beanView.ts → buildHat |
| ⬜ | Sombrero: Galera | `hat.tophat` | `models/hats/tophat.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Origen en la base del sombrero (apoya en la cabeza). ≤ 400 tris. Si algo gira, el nodo se llama "spin". | src/render/beanView.ts → buildHat |
| ⬜ | Sombrero: Aureola | `hat.halo` | `models/hats/halo.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Origen en la base del sombrero (apoya en la cabeza). ≤ 400 tris. Si algo gira, el nodo se llama "spin". | src/render/beanView.ts → buildHat |
| ⬜ | Sombrero: Hélice | `hat.propeller` | `models/hats/propeller.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Origen en la base del sombrero (apoya en la cabeza). ≤ 400 tris. Si algo gira, el nodo se llama "spin". | src/render/beanView.ts → buildHat |
| ⬜ | Sombrero: Casco vikingo | `hat.viking` | `models/hats/viking.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Origen en la base del sombrero (apoya en la cabeza). ≤ 400 tris. Si algo gira, el nodo se llama "spin". | src/render/beanView.ts → buildHat |
| ⬜ | Sombrero: Corona | `hat.crown` | `models/hats/crown.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Origen en la base del sombrero (apoya en la cabeza). ≤ 400 tris. Si algo gira, el nodo se llama "spin". | src/render/beanView.ts → buildHat |
| ⬜ | Piel Piedra · Intacto | `skin.stone.0` | `textures/skins/stone_0.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Piedra · Intacto | `skin.stone.0.glow` | `textures/skins/stone_0_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Piedra · Agrietado | `skin.stone.1` | `textures/skins/stone_1.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Piedra · Agrietado | `skin.stone.1.glow` | `textures/skins/stone_1_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Piedra · Quebrado | `skin.stone.2` | `textures/skins/stone_2.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Piedra · Quebrado | `skin.stone.2.glow` | `textures/skins/stone_2_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Piedra · Destrozado | `skin.stone.3` | `textures/skins/stone_3.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Piedra · Destrozado | `skin.stone.3.glow` | `textures/skins/stone_3_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Metal · Intacto | `skin.metal.0` | `textures/skins/metal_0.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Metal · Intacto | `skin.metal.0.glow` | `textures/skins/metal_0_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Metal · Agrietado | `skin.metal.1` | `textures/skins/metal_1.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Metal · Agrietado | `skin.metal.1.glow` | `textures/skins/metal_1_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Metal · Quebrado | `skin.metal.2` | `textures/skins/metal_2.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Metal · Quebrado | `skin.metal.2.glow` | `textures/skins/metal_2_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Metal · Destrozado | `skin.metal.3` | `textures/skins/metal_3.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Metal · Destrozado | `skin.metal.3.glow` | `textures/skins/metal_3_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Cristal · Intacto | `skin.crystal.0` | `textures/skins/crystal_0.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Cristal · Intacto | `skin.crystal.0.glow` | `textures/skins/crystal_0_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Cristal · Agrietado | `skin.crystal.1` | `textures/skins/crystal_1.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Cristal · Agrietado | `skin.crystal.1.glow` | `textures/skins/crystal_1_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Cristal · Quebrado | `skin.crystal.2` | `textures/skins/crystal_2.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Cristal · Quebrado | `skin.crystal.2.glow` | `textures/skins/crystal_2_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Cristal · Destrozado | `skin.crystal.3` | `textures/skins/crystal_3.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Cristal · Destrozado | `skin.crystal.3.glow` | `textures/skins/crystal_3_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Goo · Intacto | `skin.goo.0` | `textures/skins/goo_0.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Goo · Intacto | `skin.goo.0.glow` | `textures/skins/goo_0_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Goo · Agrietado | `skin.goo.1` | `textures/skins/goo_1.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Goo · Agrietado | `skin.goo.1.glow` | `textures/skins/goo_1_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Goo · Quebrado | `skin.goo.2` | `textures/skins/goo_2.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Goo · Quebrado | `skin.goo.2.glow` | `textures/skins/goo_2_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |
| ⬜ | Piel Goo · Destrozado | `skin.goo.3` | `textures/skins/goo_3.png` | PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow. | src/render/textures.ts → beanSkin (map) |
| ⬜ | Grietas Goo · Destrozado | `skin.goo.3.glow` | `textures/skins/goo_3_glow.png` | PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada. | src/render/textures.ts → beanSkin (glow) |

## Mapa (0/16)

| ✔ | Pieza | Id | Archivo | Especificación | Hoy (código) |
|---|---|---|---|---|---|
| ⬜ | Cobertura de Piedra | `prop.stone` | `models/props/stone.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Huella 1.4 × 1.3 m (ancho × alto): la colisión usa esa medida. ≤ 800 tris. Se escala al romperse. | src/render/propsView.ts → buildDestructMesh |
| ⬜ | Trozo de Piedra | `pickup.stone` | `models/pickups/stone.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. ≈ 0.4 m, centrado (gira sobre sí mismo). Material emisivo suave. ≤ 200 tris. | src/render/propsView.ts → pickupMesh |
| ⬜ | Cobertura de Metal | `prop.metal` | `models/props/metal.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Huella 1.4 × 1.35 m (ancho × alto): la colisión usa esa medida. ≤ 800 tris. Se escala al romperse. | src/render/propsView.ts → buildDestructMesh |
| ⬜ | Trozo de Metal | `pickup.metal` | `models/pickups/metal.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. ≈ 0.4 m, centrado (gira sobre sí mismo). Material emisivo suave. ≤ 200 tris. | src/render/propsView.ts → pickupMesh |
| ⬜ | Cobertura de Cristal | `prop.crystal` | `models/props/crystal.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Huella 1.1 × 1.8 m (ancho × alto): la colisión usa esa medida. ≤ 800 tris. Se escala al romperse. | src/render/propsView.ts → buildDestructMesh |
| ⬜ | Trozo de Cristal | `pickup.crystal` | `models/pickups/crystal.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. ≈ 0.4 m, centrado (gira sobre sí mismo). Material emisivo suave. ≤ 200 tris. | src/render/propsView.ts → pickupMesh |
| ⬜ | Cobertura de Goo | `prop.goo` | `models/props/goo.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Huella 1.3 × 1.0 m (ancho × alto): la colisión usa esa medida. ≤ 800 tris. Se escala al romperse. | src/render/propsView.ts → buildDestructMesh |
| ⬜ | Trozo de Goo | `pickup.goo` | `models/pickups/goo.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. ≈ 0.4 m, centrado (gira sobre sí mismo). Material emisivo suave. ≤ 200 tris. | src/render/propsView.ts → pickupMesh |
| ⬜ | Muro de chapa (Remache) | `struct.wall` | `models/structures/wall.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. 1.1 × 1.8 × 1.1 m. Se tiñe con el color del equipo en la tapa. | src/render/propsView.ts → buildStructureMesh |
| ⬜ | Muro de piedra (ítem Muralla) | `struct.stonewall` | `models/structures/stonewall.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. 1.1 × 1.8 × 1.1 m. Se tiñe con el color del equipo en la tapa. | src/render/propsView.ts → buildStructureMesh |
| ⬜ | Torreta (Remache) | `struct.turret` | `models/structures/turret.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. 0.8 × 1.2 × 0.8 m. La parte que gira va en un nodo llamado "head". | src/render/propsView.ts → buildStructureMesh |
| ⬜ | Atlas del terreno | `terrain.atlas` | `textures/terrain_atlas.png` | PNG 1024×512. Mitad izquierda: baldosa de piso 2×2 m tileable con borde. Mitad derecha: estratos de roca verticales (paredes). | src/render/textures.ts → terrainAtlas |
| ⬜ | Cielo: Neón | `sky.neon` | `textures/sky/neon.jpg` | JPG equirectangular 2048×1024 (panorama 360°). Se ve sobre todo hacia abajo (el abismo): que no tenga horizonte muy marcado. | src/render/gameView.ts → buildBackdrop (color plano + rocas y cristales) |
| ⬜ | Cielo: Cantera | `sky.clasico` | `textures/sky/clasico.jpg` | JPG equirectangular 2048×1024 (panorama 360°). Se ve sobre todo hacia abajo (el abismo): que no tenga horizonte muy marcado. | src/render/gameView.ts → buildBackdrop (color plano + rocas y cristales) |
| ⬜ | Cielo: Atardecer | `sky.atardecer` | `textures/sky/atardecer.jpg` | JPG equirectangular 2048×1024 (panorama 360°). Se ve sobre todo hacia abajo (el abismo): que no tenga horizonte muy marcado. | src/render/gameView.ts → buildBackdrop (color plano + rocas y cristales) |
| ⬜ | Cielo: Noche | `sky.noche` | `textures/sky/noche.jpg` | JPG equirectangular 2048×1024 (panorama 360°). Se ve sobre todo hacia abajo (el abismo): que no tenga horizonte muy marcado. | src/render/gameView.ts → buildBackdrop (color plano + rocas y cristales) |

## Proyectiles (0/12)

| ✔ | Pieza | Id | Archivo | Especificación | Hoy (código) |
|---|---|---|---|---|---|
| ⬜ | Esquirla (Prisma, básico) | `proj.shard` | `models/projectiles/shard.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto. | src/render/fx.ts → buildProjectileMesh |
| ⬜ | Lanza de cuarzo (Prisma Q) | `proj.lance` | `models/projectiles/lance.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto. | src/render/fx.ts → buildProjectileMesh |
| ⬜ | Supernova (Prisma R) | `proj.nova` | `models/projectiles/nova.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto. | src/render/fx.ts → buildProjectileMesh |
| ⬜ | Pegote (Gloop, básico) | `proj.glob` | `models/projectiles/glob.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto. | src/render/fx.ts → buildProjectileMesh |
| ⬜ | Frasco / Charco (lanzado) | `proj.goolob` | `models/projectiles/goolob.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto. | src/render/fx.ts → buildProjectileMesh |
| ⬜ | Marea (Gloop R) | `proj.wave` | `models/projectiles/wave.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto. | src/render/fx.ts → buildProjectileMesh |
| ⬜ | Gancho (Remache F) | `proj.hook` | `models/projectiles/hook.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto. | src/render/fx.ts → buildProjectileMesh |
| ⬜ | Bala de torreta | `proj.bolt` | `models/projectiles/bolt.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto. | src/render/fx.ts → buildProjectileMesh |
| ⬜ | Disparo de torre (Asedio) | `proj.tbolt` | `models/projectiles/tbolt.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto. | src/render/fx.ts → buildProjectileMesh |
| ⬜ | Disparo del núcleo (Asedio) | `proj.coreshot` | `models/projectiles/coreshot.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto. | src/render/fx.ts → buildProjectileMesh |
| ⬜ | Chispa (esbirro a distancia) | `proj.spark` | `models/projectiles/spark.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto. | src/render/fx.ts → buildProjectileMesh |
| ⬜ | Cañonazo del Ariete | `proj.cannon` | `models/projectiles/cannon.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto. | src/render/fx.ts → buildProjectileMesh |

## Asedio (0/7)

| ✔ | Pieza | Id | Archivo | Especificación | Hoy (código) |
|---|---|---|---|---|---|
| ⬜ | Esbirro Guijarro (cuerpo a cuerpo) | `unit.melee` | `models/units/melee.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. ≈ 1.0 m de alto. Golemcito de piedra; lo que lleva el color del equipo con material "team". ≤ 1.200 tris (se ven muchos a la vez). | src/render/mobaView.ts → buildUnitMesh |
| ⬜ | Esbirro Chispa (a distancia) | `unit.ranged` | `models/units/ranged.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. ≈ 1.3 m. Cristal que flota sobre una base; anillo con material "team". ≤ 1.200 tris (se ven muchos a la vez). | src/render/mobaView.ts → buildUnitMesh |
| ⬜ | Esbirro Ariete (asedio) | `unit.siege` | `models/units/siege.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. ≈ 1.3 m, huella 1 × 1.1 m. Carro con cañón apuntando a +Z; franja con material "team". ≤ 1.200 tris (se ven muchos a la vez). | src/render/mobaView.ts → buildUnitMesh |
| ⬜ | Babosa (campamento neutral) | `unit.neutral` | `models/units/neutral.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. ≈ 0.9 m. Gota de goo con ojos. ≤ 1.200 tris (se ven muchos a la vez). | src/render/mobaView.ts → buildUnitMesh |
| ⬜ | El Coloso (objetivo neutral) | `unit.coloso` | `models/units/coloso.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. ≈ 3 m de alto. Gólem de piedra con cristales; que se lea como jefe desde lejos. ≤ 1.200 tris (se ven muchos a la vez). | src/render/mobaView.ts → buildUnitMesh |
| ⬜ | Torre | `struct.tower` | `models/structures/tower.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Huella 1.8 × 1.8 m, alto 4 m (la colisión usa eso). Lo del color del equipo con material "team"; lo que gira arriba en un nodo "spin". | src/render/mobaView.ts → buildFixedMesh |
| ⬜ | Núcleo | `struct.core` | `models/structures/core.glb` | GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly. Huella 3.2 × 3.2 m, alto 3.4 m. Material "team" y nodo "spin" como la torre. | src/render/mobaView.ts → buildFixedMesh |

## Íconos (0/40)

| ✔ | Pieza | Id | Archivo | Especificación | Hoy (código) |
|---|---|---|---|---|---|
| ⬜ | Canto: Piñazo | `icon.basic.canto` | `icons/abilities/canto_basic.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/ui/hud.ts → buildBar (emoji) |
| ⬜ | Canto Q: Embestida | `icon.ability.canto.q` | `icons/abilities/canto_q.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/canto.ts (icon: 🐏) |
| ⬜ | Canto E: Rompemuros | `icon.ability.canto.e` | `icons/abilities/canto_e.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/canto.ts (icon: 🔨) |
| ⬜ | Canto F: Piel de roca | `icon.ability.canto.f` | `icons/abilities/canto_f.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/canto.ts (icon: 🪨) |
| ⬜ | Canto R: Avalancha | `icon.ability.canto.r` | `icons/abilities/canto_r.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/canto.ts (icon: ⛰️) |
| ⬜ | Prisma: Esquirla | `icon.basic.prisma` | `icons/abilities/prisma_basic.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/ui/hud.ts → buildBar (emoji) |
| ⬜ | Prisma Q: Lanza de cuarzo | `icon.ability.prisma.q` | `icons/abilities/prisma_q.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/prisma.ts (icon: 🔹) |
| ⬜ | Prisma E: Destello | `icon.ability.prisma.e` | `icons/abilities/prisma_e.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/prisma.ts (icon: ✨) |
| ⬜ | Prisma F: Refracción | `icon.ability.prisma.f` | `icons/abilities/prisma_f.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/prisma.ts (icon: 🔆) |
| ⬜ | Prisma R: Supernova | `icon.ability.prisma.r` | `icons/abilities/prisma_r.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/prisma.ts (icon: 💎) |
| ⬜ | Gloop: Pegote | `icon.basic.gloop` | `icons/abilities/gloop_basic.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/ui/hud.ts → buildBar (emoji) |
| ⬜ | Gloop Q: Charco | `icon.ability.gloop.q` | `icons/abilities/gloop_q.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/gloop.ts (icon: 🫧) |
| ⬜ | Gloop E: Rebote | `icon.ability.gloop.e` | `icons/abilities/gloop_e.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/gloop.ts (icon: 🏀) |
| ⬜ | Gloop F: Burbuja | `icon.ability.gloop.f` | `icons/abilities/gloop_f.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/gloop.ts (icon: 🛡️) |
| ⬜ | Gloop R: Marea | `icon.ability.gloop.r` | `icons/abilities/gloop_r.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/gloop.ts (icon: 🌊) |
| ⬜ | Remache: Llavazo | `icon.basic.remache` | `icons/abilities/remache_basic.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/ui/hud.ts → buildBar (emoji) |
| ⬜ | Remache Q: Muro | `icon.ability.remache.q` | `icons/abilities/remache_q.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/remache.ts (icon: 🧱) |
| ⬜ | Remache E: Torreta | `icon.ability.remache.e` | `icons/abilities/remache_e.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/remache.ts (icon: 🔩) |
| ⬜ | Remache F: Gancho | `icon.ability.remache.f` | `icons/abilities/remache_f.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/remache.ts (icon: 🪝) |
| ⬜ | Remache R: Imán | `icon.ability.remache.r` | `icons/abilities/remache_r.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/heroes/remache.ts (icon: 🧲) |
| ⬜ | Empujón | `icon.push` | `icons/abilities/push.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/ui/hud.ts → buildBar (🫸) |
| ⬜ | Dash | `icon.dash` | `icons/abilities/dash.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/ui/hud.ts → buildBar (💨) |
| ⬜ | Volver a la base (Asedio) | `icon.recall` | `icons/abilities/recall.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/ui/hud.ts → buildBar (🏠) |
| ⬜ | Ítem: Coraza | `icon.item.coraza` | `icons/items/coraza.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: 🛡️) |
| ⬜ | Ítem: Lastre | `icon.item.lastre` | `icons/items/lastre.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: ⚓) |
| ⬜ | Ítem: Suela de goma | `icon.item.suela` | `icons/items/suela.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: 👟) |
| ⬜ | Ítem: Foco | `icon.item.foco` | `icons/items/foco.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: 🔷) |
| ⬜ | Ítem: Filo | `icon.item.filo` | `icons/items/filo.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: 🗡️) |
| ⬜ | Ítem: Savia | `icon.item.savia` | `icons/items/savia.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: 💧) |
| ⬜ | Ítem: Resorte | `icon.item.resorte` | `icons/items/resorte.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: 🌀) |
| ⬜ | Ítem: Parpadeo | `icon.item.parpadeo` | `icons/items/parpadeo.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: ✨) |
| ⬜ | Ítem: Ancla | `icon.item.ancla` | `icons/items/ancla.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: 🪨) |
| ⬜ | Ítem: Onda | `icon.item.onda` | `icons/items/onda.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: 💥) |
| ⬜ | Ítem: Muralla | `icon.item.muralla` | `icons/items/muralla.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: 🧱) |
| ⬜ | Ítem: Garfio | `icon.item.garfio` | `icons/items/garfio.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: 🪝) |
| ⬜ | Ítem: Frasco pegajoso | `icon.item.frasco` | `icons/items/frasco.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/core/items.ts (icon: 🧪) |
| ⬜ | Material: Piedra | `icon.mat.stone` | `icons/materials/stone.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/ui/hud.ts → MAT_ICON |
| ⬜ | Material: Metal | `icon.mat.metal` | `icons/materials/metal.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/ui/hud.ts → MAT_ICON |
| ⬜ | Material: Cristal | `icon.mat.crystal` | `icons/materials/crystal.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/ui/hud.ts → MAT_ICON |
| ⬜ | Material: Goo | `icon.mat.goo` | `icons/materials/goo.png` | PNG 128×128 con fondo transparente, borde grueso, legible a 40 px. | src/ui/hud.ts → MAT_ICON |

## Sonido (0/53)

| ✔ | Pieza | Id | Archivo | Especificación | Hoy (código) |
|---|---|---|---|---|---|
| ⬜ | Golpe | `sfx.hit` | `audio/sfx/hit.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('hit') sintetizado |
| ⬜ | Golpe fuerte | `sfx.hitbig` | `audio/sfx/hitbig.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('hitbig') sintetizado |
| ⬜ | Swing de puño | `sfx.swing` | `audio/sfx/swing.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('swing') sintetizado |
| ⬜ | Empujón | `sfx.push` | `audio/sfx/push.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('push') sintetizado |
| ⬜ | Carga del empujón | `sfx.charge` | `audio/sfx/charge.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('charge') sintetizado |
| ⬜ | Disparo de cristal | `sfx.shard` | `audio/sfx/shard.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('shard') sintetizado |
| ⬜ | Lanza | `sfx.lance` | `audio/sfx/lance.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('lance') sintetizado |
| ⬜ | Pegote de goo | `sfx.glob` | `audio/sfx/glob.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('glob') sintetizado |
| ⬜ | Ola | `sfx.wave` | `audio/sfx/wave.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('wave') sintetizado |
| ⬜ | Gancho | `sfx.hook` | `audio/sfx/hook.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('hook') sintetizado |
| ⬜ | Torreta | `sfx.bolt` | `audio/sfx/bolt.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('bolt') sintetizado |
| ⬜ | Explosión | `sfx.boom` | `audio/sfx/boom.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('boom') sintetizado |
| ⬜ | Terremoto | `sfx.quake` | `audio/sfx/quake.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('quake') sintetizado |
| ⬜ | Golpe letal | `sfx.lethal` | `audio/sfx/lethal.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('lethal') sintetizado |
| ⬜ | Grieta | `sfx.crack` | `audio/sfx/crack.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('crack') sintetizado |
| ⬜ | Cambio de etapa del cuerpo | `sfx.stage` | `audio/sfx/stage.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('stage') sintetizado |
| ⬜ | Cristal rompiéndose | `sfx.crystal` | `audio/sfx/crystal.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('crystal') sintetizado |
| ⬜ | Metal | `sfx.metal` | `audio/sfx/metal.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('metal') sintetizado |
| ⬜ | Goo | `sfx.goo` | `audio/sfx/goo.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('goo') sintetizado |
| ⬜ | Piedra | `sfx.stone` | `audio/sfx/stone.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('stone') sintetizado |
| ⬜ | Salto | `sfx.jump` | `audio/sfx/jump.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('jump') sintetizado |
| ⬜ | Segundo salto | `sfx.airjump` | `audio/sfx/airjump.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('airjump') sintetizado |
| ⬜ | Aterrizaje | `sfx.land` | `audio/sfx/land.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('land') sintetizado |
| ⬜ | Estampado contra pared | `sfx.slam` | `audio/sfx/slam.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('slam') sintetizado |
| ⬜ | Rebote | `sfx.bounce` | `audio/sfx/bounce.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('bounce') sintetizado |
| ⬜ | Whoosh / dash | `sfx.whoosh` | `audio/sfx/whoosh.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('whoosh') sintetizado |
| ⬜ | Ring-out | `sfx.ringout` | `audio/sfx/ringout.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('ringout') sintetizado |
| ⬜ | Público | `sfx.crowd` | `audio/sfx/crowd.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('crowd') sintetizado |
| ⬜ | Juntar trozo | `sfx.pickup` | `audio/sfx/pickup.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('pickup') sintetizado |
| ⬜ | Moneda | `sfx.coin` | `audio/sfx/coin.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('coin') sintetizado |
| ⬜ | Combo | `sfx.combo` | `audio/sfx/combo.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('combo') sintetizado |
| ⬜ | Subir de nivel | `sfx.levelup` | `audio/sfx/levelup.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('levelup') sintetizado |
| ⬜ | Fabricar | `sfx.craft` | `audio/sfx/craft.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('craft') sintetizado |
| ⬜ | Reparar | `sfx.repair` | `audio/sfx/repair.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('repair') sintetizado |
| ⬜ | Escudo | `sfx.shield` | `audio/sfx/shield.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('shield') sintetizado |
| ⬜ | Ulti lista | `sfx.ultready` | `audio/sfx/ultready.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('ultready') sintetizado |
| ⬜ | Habilidad lista | `sfx.ready` | `audio/sfx/ready.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('ready') sintetizado |
| ⬜ | Premio | `sfx.jackpot` | `audio/sfx/jackpot.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('jackpot') sintetizado |
| ⬜ | Cuenta regresiva | `sfx.count` | `audio/sfx/count.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('count') sintetizado |
| ⬜ | ¡A pelear! | `sfx.go` | `audio/sfx/go.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('go') sintetizado |
| ⬜ | Últimos segundos | `sfx.tick` | `audio/sfx/tick.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('tick') sintetizado |
| ⬜ | Anuncio | `sfx.announce` | `audio/sfx/announce.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('announce') sintetizado |
| ⬜ | Latido | `sfx.heart` | `audio/sfx/heart.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('heart') sintetizado |
| ⬜ | Clic de interfaz | `sfx.ui` | `audio/sfx/ui.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('ui') sintetizado |
| ⬜ | Hover | `sfx.hover` | `audio/sfx/hover.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('hover') sintetizado |
| ⬜ | No se puede | `sfx.deny` | `audio/sfx/deny.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('deny') sintetizado |
| ⬜ | Victoria | `sfx.win` | `audio/sfx/win.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('win') sintetizado |
| ⬜ | Derrota | `sfx.lose` | `audio/sfx/lose.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('lose') sintetizado |
| ⬜ | Parpadeo | `sfx.blink` | `audio/sfx/blink.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('blink') sintetizado |
| ⬜ | Aparecer | `sfx.spawn` | `audio/sfx/spawn.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('spawn') sintetizado |
| ⬜ | Baldosa rompiéndose | `sfx.tile` | `audio/sfx/tile.mp3` | MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]). | src/audio/audio.ts → play('tile') sintetizado |
| ⬜ | Música de partida | `music.match` | `audio/music.mp3` | MP3 en loop sin corte, 120–130 BPM. | src/audio/audio.ts → música generativa |
| ⬜ | Música de menú | `music.menu` | `audio/menu.mp3` | MP3 en loop, versión tranquila del tema. | src/audio/audio.ts → música generativa |
