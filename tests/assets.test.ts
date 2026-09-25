// Catálogo de assets: consistencia + la checklist docs/ASSETS_CATALOGO.md (generada del catálogo).
// Si cambiás el catálogo: `npm run assets:doc` regenera el documento.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSETS, ASSET_GROUPS } from '../src/assets/catalog';
import { HEROES } from '../src/core/heroes';
import { ITEMS } from '../src/core/items';
import { ABILITY_SLOTS, HERO_IDS } from '../src/core/types';

const DOC = 'docs/ASSETS_CATALOGO.md';
const MANIFEST = 'public/assets/manifest.json';

function manifestFiles(): Set<string> {
  try { return new Set(JSON.parse(readFileSync(MANIFEST, 'utf8')).files ?? []); } catch { return new Set(); }
}

function sfxManifest(): Set<string> {
  try { return new Set(JSON.parse(readFileSync('public/audio/sfx/manifest.json', 'utf8'))); } catch { return new Set(); }
}

function generateDoc(): string {
  const files = manifestFiles();
  const sfx = sfxManifest();
  const done = (id: string, file: string, kind: string) => {
    if (kind === 'sound') return id.startsWith('sfx.') ? sfx.has(id.slice(4)) : existsSync('public/' + file);
    return files.has(file);
  };
  const total = ASSETS.length;
  const replaced = ASSETS.filter((a) => done(a.id, a.file, a.kind)).length;
  const out: string[] = [
    '# Catálogo de assets: de procedural a archivo',
    '',
    '> **Generado** desde `src/assets/catalog.ts` con `npm run assets:doc`. No editar a mano.',
    '',
    `Todo lo que el juego dibuja o suena por código tiene un **id** y un **archivo esperado**. Hoy: **${replaced} de ${total}** piezas usan archivo.`,
    '',
    '**Cómo reemplazar una pieza (de a una):**',
    '',
    '1. Elegí una fila de abajo (o abrí el juego → menú → **🧩 Assets** para verla girando y comparar).',
    '2. Creá el archivo en `public/assets/<archivo>` respetando la especificación (sonidos: `public/<archivo>`).',
    '3. Agregá la ruta a `public/assets/manifest.json` → `{ "files": ["<archivo>", ...] }` (sonidos: el nombre en `public/audio/sfx/manifest.json`).',
    '4. Recargá. Si el archivo falla o lo borrás, el juego vuelve solo a la versión procedural.',
    '5. Tildá la casilla corriendo `npm run assets:doc`.',
    '',
    'Convenciones de modelos: GLB, 1 unidad = 1 m, origen en la base, mirando a +Z, estilo toon/low-poly. Nodos especiales: `spin` (gira), `head` (torreta), material `team` (se tiñe con el color del equipo).',
    '',
  ];
  for (const g of ASSET_GROUPS) {
    const list = ASSETS.filter((a) => a.group === g);
    out.push(`## ${g} (${list.filter((a) => done(a.id, a.file, a.kind)).length}/${list.length})`, '');
    out.push('| ✔ | Pieza | Id | Archivo | Especificación | Hoy (código) |', '|---|---|---|---|---|---|');
    for (const a of list) {
      const esc = (s: string) => s.replace(/\|/g, '\\|');
      out.push(`| ${done(a.id, a.file, a.kind) ? '✅' : '⬜'} | ${esc(a.name)} | \`${a.id}\` | \`${a.file}\` | ${esc(a.spec)} | ${esc(a.code)} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

describe('catálogo de assets', () => {
  it('ids y archivos únicos', () => {
    const ids = ASSETS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const files = ASSETS.map((a) => a.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it('cubre todo el contenido: héroes, habilidades e ítems', () => {
    const ids = new Set(ASSETS.map((a) => a.id));
    for (const h of HERO_IDS) {
      expect(ids.has(`hero.${h}`)).toBe(true);
      expect(ids.has(`icon.basic.${h}`)).toBe(true);
      for (const s of ABILITY_SLOTS) expect(ids.has(`icon.ability.${h}.${s}`), `${HEROES[h].name} ${s}`).toBe(true);
    }
    for (const it of ITEMS) expect(ids.has(`icon.item.${it.id}`)).toBe(true);
  });

  it('el manifest es válido y lo que lista existe', () => {
    const raw = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    expect(Array.isArray(raw.files)).toBe(true);
    for (const f of raw.files) expect(existsSync('public/assets/' + f), f).toBe(true);
  });

  it(`${DOC} está al día (npm run assets:doc para regenerarlo)`, () => {
    const doc = generateDoc();
    if (process.env.UPDATE_ASSET_DOC) writeFileSync(DOC, doc);
    expect(existsSync(DOC)).toBe(true);
    expect(readFileSync(DOC, 'utf8')).toBe(doc);
  });
});
