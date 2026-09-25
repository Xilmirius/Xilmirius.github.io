// Contenido de los tooltips: explican cada cosa del juego con sus números reales (salen de los datos,
// así si cambia el balance, el tooltip se actualiza solo).
import { iconHtml } from '../assets/registry';
import {
  DASH_CD, MUTATION_LEVELS, PUSH_MAX_CHARGE, REPAIR_AMOUNT, REPAIR_COST, STAGE_AT, STAGE_KB, STAGE_NAMES, ULT_PER_HEAT, ULT_PER_PICKUP, RECALL_TIME,
} from '../core/constants';
import { HEROES } from '../core/heroes';
import type { AbilityDef, AimShape } from '../core/heroes/types';
import { ITEM_BY_ID, type ItemDef } from '../core/items';
import { MODE_INFO } from '../core/modes';
import { MUTATION_COST, ROUTE_DESC, ROUTE_FLAVOR, ROUTE_MODS } from '../core/mutations';
import { RULESETS, unlockLevel, usesUltCharge, type Ruleset, type RulesetId } from '../core/rules';
import { FAMILY_NAMES, ROUTE_NAMES, type AbilitySlot, type Family, type HeroId, type ModeId, type Route } from '../core/types';
import { esc } from './tooltip';

export const MAT_ICON: Record<Family, string> = { stone: '🪨', metal: '🔩', crystal: '💎', goo: '🟢' };
const m = (v: number) => `${+v.toFixed(1)} m`;
const s = (v: number) => `${+v.toFixed(1)} s`;

function head(icon: string, title: string, key?: string) {
  return `<div class="tt-head"><span class="tt-ic">${icon}</span><b>${title}</b>${key ? `<kbd>${key}</kbd>` : ''}</div>`;
}
const tags = (list: (string | false | null | undefined)[]) => {
  const l = list.filter(Boolean);
  return l.length ? `<div class="tt-tags">${l.map((t) => `<span>${t}</span>`).join('')}</div>` : '';
};
const p = (t: string, cls = '') => `<p${cls ? ` class="${cls}"` : ''}>${t}</p>`;

/** Descripción corta de cómo apunta una habilidad. */
export function shapeText(shape: AimShape, range: number, area = 1): string {
  switch (shape.k) {
    case 'circle': return `Área en el cursor · radio ${m(shape.r * area)} · hasta ${m(range)}`;
    case 'line': return `En línea · ${m(range)} de largo`;
    case 'cone': return `Cono de ${shape.deg}° · ${m(range * area)}`;
    case 'wall': return `Muro de ${m(shape.len * Math.min(1.34, area))} · hasta ${m(range)}`;
    case 'self': return shape.r > 0 ? `Alrededor tuyo · radio ${m(shape.r * area)}` : 'Sobre vos';
    case 'point': return `En el cursor · hasta ${m(range)}${shape.r && shape.r > 1 ? ` · alcance ${m(shape.r)}` : ''}`;
    case 'blink': return `Te movés hasta ${m(range)} · deja un área de ${m(shape.r * area)}`;
  }
}

const KEY: Record<AbilitySlot, string> = { q: 'Q', e: 'E', f: 'F', r: 'R' };

export function abilityTip(heroId: HeroId, slot: AbilitySlot, rules: Ruleset, o: { mut?: Route; level?: number; ult?: number } = {}) {
  const hero = HEROES[heroId];
  const a: AbilityDef = hero.abilities[slot];
  const area = o.mut ? ROUTE_MODS[o.mut].area : 1;
  const ult = usesUltCharge(rules, slot);
  const lvl = unlockLevel(rules, a);
  const locked = o.level !== undefined && o.level < lvl;
  return head(iconHtml(`icon.ability.${heroId}.${slot}`, a.icon), `${a.name}${slot === 'r' ? ' <em>ulti</em>' : ''}`, KEY[slot])
    + tags([
      shapeText(a.shape, a.range, area),
      ult ? `Se carga pegando${o.ult !== undefined ? ` · ${Math.floor(o.ult * 100)}%` : ''}` : `Enfriamiento ${s(a.cd * (o.mut ? ROUTE_MODS[o.mut].cd : 1))}`,
      rules.progression && `Nivel ${lvl}${locked ? ' 🔒' : ''}`,
    ])
    + p(a.desc)
    + (o.mut ? p(`🧬 <b>${ROUTE_FLAVOR[hero.family][o.mut]}</b> (${ROUTE_NAMES[o.mut]}): ${ROUTE_DESC[o.mut]}`, 'tt-mut') : '')
    + (ult ? p(`La ulti se llena pegando (≈${Math.round(1 / ULT_PER_HEAT)} de heat), con los trozos que soltás al romper cosas (+${Math.round(ULT_PER_PICKUP * 100)}% cada uno) y de a poco sola.`, 'tt-note') : '')
    + p(a.shape.k === 'self'
      ? `<kbd>${KEY[slot]}</kbd>: sale al toque.`
      : `<kbd>${KEY[slot]}</kbd> apunta (ves el área) · <b>clic izquierdo</b> la lanza · <b>clic derecho</b> cancela.`, 'tt-hint');
}

export function basicTip(heroId: HeroId) {
  const b = HEROES[heroId].basic;
  return head(iconHtml(`icon.basic.${heroId}`, b.kind === 'melee' ? '👊' : '🎯'), b.name, 'Clic')
    + tags([b.kind === 'melee' ? `Cuerpo a cuerpo · ${m(b.range)}` : `A distancia · ${m(b.range)}`, `Cada ${s(b.cd)}`])
    + p(b.desc) + p(b.kind === 'ranged'
      ? 'Mantené el clic para seguir disparando. Los disparos básicos <b>no empujan</b>: suman heat para que después lo saques con habilidades o el empujón.'
      : 'Mantené el clic para seguir pegando. Romper es el primer paso: cada golpe te suma <b>heat</b> al rival.', 'tt-hint');
}

export function recallTip() {
  return head(iconHtml('icon.recall', '🏠'), 'Volver a la base', 'B')
    + tags([`${s(RECALL_TIME)} quieto`])
    + p('Te teletransporta a tu base. En la base te enfriás rápido (se te va el heat) y podés forjar.')
    + p('Se corta si te movés, atacás, lanzás algo o te pegan. Elegí bien cuándo: en medio de una pelea no llega.', 'tt-hint');
}

export function pushTip() {
  return head(iconHtml('icon.push', '🫸'), 'Empujón', 'Clic D')
    + tags([`Carga hasta ${s(PUSH_MAX_CHARGE)}`, 'Cono de 95°'])
    + p('Mantené para cargar y soltá para empujar. Cuanto más cargado y más roto está el rival, más lejos vuela: <b>es lo que saca del mapa</b>.')
    + p('El cono en el piso avisa que lo estás cargando (se pone rojo a carga máxima).', 'tt-hint');
}

export function dashTip() {
  return head(iconHtml('icon.dash', '💨'), 'Dash', 'Shift')
    + tags(['≈ 4 m', `Enfriamiento ${s(DASH_CD)}`])
    + p('Ráfaga corta hacia donde caminás (o hacia donde mirás si estás quieto). Sirve para entrar, esquivar y recuperarte.')
    + p('En el aire tenés uno. No corta un lanzamiento: primero usá el segundo salto (Espacio) y después el dash.', 'tt-hint');
}

export function itemTip(it: ItemDef, extra = '') {
  const cost = Object.entries(it.cost).map(([f, n]) => `${iconHtml(`icon.mat.${f}`, MAT_ICON[f as Family])} ${n}`).join(' ');
  return head(iconHtml(`icon.item.${it.id}`, it.icon), it.name)
    + tags([it.kind === 'passive' ? 'Pasivo' : 'Activo · teclas 1-2-3', it.cd ? `Enfriamiento ${s(it.cd)}` : null, it.shape ? shapeText(it.shape, it.range ?? 0) : null, `Costo ${cost}`])
    + p(it.desc) + extra;
}

export function itemIdTip(id: string | null) {
  const it = id ? ITEM_BY_ID[id] : null;
  return it ? itemTip(it) : head('▫️', 'Espacio vacío') + p('Fabricá un ítem activo en la forja (C) y queda en esta tecla.');
}

export function matTip(f: Family, rules: Ruleset, mine: Family) {
  return head(iconHtml(`icon.mat.${f}`, MAT_ICON[f]), FAMILY_NAMES[f])
    + p(`Sale de romper coberturas de ${FAMILY_NAMES[f].toLowerCase()} del mapa.`)
    + (rules.crafting ? p('Se usa en la forja (C) para fabricar ítems.') : '')
    + (f === mine && rules.crafting ? p(`Es <b>tu material</b>: mutar una habilidad cuesta ${MUTATION_COST}.`, 'tt-note') : '')
    + (f === mine && rules.repair ? p(`<kbd>V</kbd> (mantener): ${REPAIR_COST} → −${REPAIR_AMOUNT} de heat.`, 'tt-note') : '');
}

export function stageTip(stage: number, heat: number) {
  const rows = STAGE_NAMES.map((n, i) => `<tr class="${i === stage ? 'on' : ''}"><td>${n}</td><td>${STAGE_AT[i]}+</td><td>×${STAGE_KB[i]}</td></tr>`).join('');
  return head('💥', `Tu cuerpo: ${STAGE_NAMES[stage]}`)
    + p(`Heat actual: <b>${heat}</b>. No hay barra de vida: cada golpe te agrieta y <b>cuanto más roto, más lejos volás</b>. Se pierde solo saliendo del mapa (ring-out).`)
    + `<table class="tt-table"><tr><th>Etapa</th><th>Heat</th><th>Vuelo</th></tr>${rows}</table>`;
}

export function levelTip(level: number, xp: number, next: number, heroId: HeroId) {
  const hero = HEROES[heroId];
  const unlocks = (['q', 'e', 'f', 'r'] as AbilitySlot[]).map((sl) => `${KEY[sl]} nv ${hero.abilities[sl].unlock}`).join(' · ');
  return head('⭐', `Nivel ${level}`)
    + tags([level >= 10 ? 'Nivel máximo' : `XP ${xp}/${next}`])
    + p('Subís pegando, rompiendo cobertura, juntando material y sacando rivales.')
    + p(`Habilidades: ${unlocks}. Mutaciones en niveles ${MUTATION_LEVELS.join(', ')} (forja, C).`)
    + p('Cada nivel: +3% de heat que pegás y −2% de vuelo que recibís.', 'tt-note');
}

export function ultBarTip(ult: number) {
  return head('⚡', `Ulti: ${Math.floor(ult * 100)}%`)
    + p('Se llena pegando, juntando los trozos que sueltan las coberturas y de a poco sola. Cuando está llena, <kbd>R</kbd>.');
}

export function routeTip(route: Route, fam: Family) {
  return head('🧬', `${ROUTE_FLAVOR[fam][route]} <em>${ROUTE_NAMES[route]}</em>`) + p(ROUTE_DESC[route]) + p(`Cuesta ${MUTATION_COST} ${MAT_ICON[fam]} de tu material.`, 'tt-note');
}

export function heroTip(heroId: HeroId, rules: Ruleset) {
  const h = HEROES[heroId];
  const kit = (['q', 'e', 'f', 'r'] as AbilitySlot[]).map((sl) => `<li><b>${KEY[sl]} ${iconHtml(`icon.ability.${heroId}.${sl}`, h.abilities[sl].icon)} ${h.abilities[sl].name}</b> · ${shapeText(h.abilities[sl].shape, h.abilities[sl].range)}</li>`).join('');
  return head('', `${h.name} <em>${FAMILY_NAMES[h.family]} · ${h.role}</em>`) + p(h.desc) + p(`⚙️ ${h.passive}`, 'tt-note')
    + `<ul class="tt-list"><li><b>Clic · ${h.basic.name}</b> · ${h.basic.kind === 'melee' ? 'cuerpo a cuerpo' : 'a distancia'}</li>${kit}</ul>`
    + (rules.progression ? '' : p('Con las reglas Brawler tenés todo desde el principio.', 'tt-hint'));
}

export function rulesTip(id: RulesetId) {
  const r = RULESETS[id];
  const on = (b: boolean, t: string) => `<li class="${b ? 'on' : 'off'}">${b ? '✔' : '✖'} ${t}</li>`;
  return head(r.icon, r.name) + p(r.desc)
    + `<ul class="tt-list checks">${on(r.progression, 'Niveles y XP')}${on(r.crafting, r.forgeAtBase ? 'Forja: ítems y mutaciones (solo en tu base)' : 'Forja: ítems y mutaciones')}${on(r.repair, 'Reparar (V)')}${on(r.pickups === 'materials', 'Materiales')}${on(r.ultCharge, 'Ulti por carga')}${on(r.dash, 'Dash (Shift)')}${r.recall ? on(true, 'Volver a la base (B)') : ''}</ul>`;
}

export function modeTip(id: ModeId) {
  if (id === 'moba') {
    return head('🏰', MODE_INFO[id].name) + p(MODE_INFO[id].desc)
      + `<ul class="tt-list">
        <li><b>Sin barra de vida</b>: como siempre, te agrietás y morís si te sacan del mapa. Las líneas son puentes sobre el vacío.</li>
        <li><b>Oleadas</b> de esbirros cada 24 s: Guijarros (cuerpo a cuerpo), Chispas (a distancia) y un Ariete cada 3 oleadas. Se los puede tirar al vacío.</li>
        <li><b>Economía</b>: rematar un esbirro te da su material al toque, y el esbirro suelta un trozo que junta el que esté cerca.</li>
        <li><b>Torres</b>: la exterior protege a la interior; las dos protegen al núcleo. Sin esbirros cerca reciben menos daño.</li>
        <li><b>Tu base</b> te enfría rápido y es donde se forja. <kbd>B</kbd>: volver (4 s quieto).</li>
        <li><b>El Coloso</b> despierta a los 2 min: derrotarlo bendice a tus esbirros.</li>
      </ul>`;
  }
  return head('🏁', MODE_INFO[id].name) + p(MODE_INFO[id].desc);
}

export { esc };
