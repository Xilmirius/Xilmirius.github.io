// Contenido de los tooltips: explican cada cosa del juego con sus números reales (salen de los datos,
// así si cambia el balance, el tooltip se actualiza solo).
import { iconHtml } from '../assets/registry';
import {
  DASH_CD, MUTATION_LEVELS, PUSH_HEAT, PUSH_MAX_CHARGE, REPAIR_AMOUNT, REPAIR_COST, STAGE_AT, STAGE_KB, STAGE_NAMES, ULT_PER_HEAT, ULT_PER_PICKUP, RECALL_TIME,
} from '../core/constants';
import { HEROES } from '../core/heroes';
import type { AbilityDef, AimShape } from '../core/heroes/types';
import { ITEM_BY_ID, type ItemDef } from '../core/items';
import { gameOf, MODE_INFO } from '../core/games';
import { MUTATION_COST, ROUTE_DESC, ROUTE_FLAVOR, ROUTE_MODS } from '../core/mutations';
import { PERK, PERKS, type PerkId } from '../core/perks';
import { RULESETS, unlockLevel, usesUltCharge, type Ruleset, type RulesetId } from '../core/rules';
import { GRAB } from '../core/sim';
import { FAMILY_NAMES, ROUTE_NAMES, type AbilitySlot, type Family, type HeroId, type ModeId, type Route } from '../core/types';
import { C4, WEAPON_IDS, WEAPONS, type WeaponId } from '../core/weapons';
import { esc } from './tooltip';
import { keyName, type ActionId } from '../game/keybinds';
import { touchMode } from '../config';

export const MAT_ICON: Record<Family, string> = { stone: '🪨', metal: '🔩', crystal: '💎', goo: '🟢' };
const m = (v: number) => `${+v.toFixed(1)} m`;
const s = (v: number) => `${+v.toFixed(1)} s`;

/** key: la tecla que lo usa (con controles táctiles no se muestra: ahí cada cosa es un botón). */
function head(icon: string, title: string, key?: string) {
  return `<div class="tt-head"><span class="tt-ic">${icon}</span><b>${title}</b>${key && !touchMode() ? `<kbd>${key}</kbd>` : ''}</div>`;
}
/** " (tecla)", o nada con controles táctiles. */
const paren = (a: ActionId) => (touchMode() ? '' : ` (${keyName(a)})`);
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

/** Tecla asignada a cada habilidad (se lee cada vez: si cambia en Ajustes, el tooltip se actualiza). */
const KEY = new Proxy({} as Record<AbilitySlot, string>, { get: (_t, slot: string) => (touchMode() ? '' : keyName(slot as ActionId)) });

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
    + p(touchMode()
      ? (a.shape.k === 'self' ? 'Sale al toque.' : 'Un toque la lanza hacia el rival más cercano. Para apuntar vos: mantené el botón, arrastrá (ves el área) y soltá. Soltar sobre la <b>✕</b> cancela.')
      : a.shape.k === 'self'
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
  return head(iconHtml('icon.recall', '🏠'), 'Volver a la base', keyName('recall'))
    + tags([`${s(RECALL_TIME)} quieto`])
    + p('Te teletransporta a tu base. En la base te enfriás rápido (se te va el heat) y podés forjar.')
    + p('Se corta si te movés, atacás, lanzás algo o te pegan. Elegí bien cuándo: en medio de una pelea no llega.', 'tt-hint');
}

export function pushTip() {
  return head(iconHtml('icon.push', '🫸'), 'Empujón', 'Clic D')
    + tags([`Carga hasta ${s(PUSH_MAX_CHARGE)}`, 'Cono de 95°', `Heat ${PUSH_HEAT[0]}–${PUSH_HEAT[1]}`])
    + p('Mantené para cargar y soltá para empujar. Cuanto más cargado y más roto está el rival, más lejos vuela: <b>es lo que saca del mapa</b>. Cargado también pega más fuerte.')
    + p('El cono en el piso avisa que lo estás cargando (se pone rojo a carga máxima).', 'tt-hint');
}

export function dashTip(cd = DASH_CD) {
  return head(iconHtml('icon.dash', '💨'), 'Dash', keyName('dash'))
    + tags(['≈ 4 m', `Enfriamiento ${s(cd)}`])
    + p('Ráfaga corta hacia donde caminás (o hacia donde mirás si estás quieto). Sirve para entrar, esquivar y recuperarte.')
    + p('En el aire tenés uno. No corta un lanzamiento: primero usá el segundo salto (Espacio) y después el dash.', 'tt-hint');
}

export function grabTip() {
  return head('🤝', 'Agarrar', 'Clic')
    + tags([`Hasta ${m(GRAB.range)}`, `Dura ${s(GRAB.dur)}`, `Enfriamiento ${s(GRAB.cd)}`])
    + p('Mantené el clic sobre un rival cercano y de frente para agarrarlo: los dos van más lento mientras dura (vos al 50 %, el agarrado al 25 %).')
    + p('Se corta al soltar el clic, a los pocos segundos, si se alejan, o si el agarrado hace un dash. El que agarra puede volver a hacerlo recién pasado el enfriamiento.', 'tt-hint');
}

export function itemTip(it: ItemDef, extra = '') {
  const cost = Object.entries(it.cost).map(([f, n]) => `${iconHtml(`icon.mat.${f}`, MAT_ICON[f as Family])} ${n}`).join(' ');
  return head(iconHtml(`icon.item.${it.id}`, it.icon), it.name)
    + tags([it.kind === 'passive' ? 'Pasivo' : `Activo · teclas ${keyName('i1')} ${keyName('i2')} ${keyName('i3')}`, it.cd ? `Enfriamiento ${s(it.cd)}` : null, it.shape ? shapeText(it.shape, it.range ?? 0) : null, `Costo ${cost}`])
    + p(it.desc) + extra;
}

export function itemIdTip(id: string | null) {
  const it = id ? ITEM_BY_ID[id] : null;
  return it ? itemTip(it) : head('▫️', 'Espacio vacío') + p(`Fabricá un ítem activo en la forja (${keyName('forge')}) y queda en esta tecla.`);
}

export function matTip(f: Family, rules: Ruleset, mine: Family) {
  return head(iconHtml(`icon.mat.${f}`, MAT_ICON[f]), FAMILY_NAMES[f])
    + p(`Sale de romper coberturas de ${FAMILY_NAMES[f].toLowerCase()} del mapa.`)
    + (rules.crafting ? p(`Se usa en la forja (${keyName('forge')}) para fabricar ítems.`) : '')
    + (f === mine && rules.crafting ? p(`Es <b>tu material</b>: mutar una habilidad cuesta ${MUTATION_COST}.`, 'tt-note') : '')
    + (f === mine && rules.repair ? p(`<kbd>${keyName('repair')}</kbd> (mantener): ${REPAIR_COST} → −${REPAIR_AMOUNT} de heat.`, 'tt-note') : '');
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
    + p(`Se llena pegando, juntando los trozos que sueltan las coberturas y de a poco sola. Cuando está llena, <kbd>${keyName('r')}</kbd>.`);
}

export function routeTip(route: Route, fam: Family) {
  return head('🧬', `${ROUTE_FLAVOR[fam][route]} <em>${ROUTE_NAMES[route]}</em>`) + p(ROUTE_DESC[route]) + p(`Cuesta ${MUTATION_COST} ${MAT_ICON[fam]} de tu material.`, 'tt-note');
}

export function heroTip(heroId: HeroId, rules: Ruleset) {
  const h = HEROES[heroId];
  const kit = (['q', 'e', 'f', 'r'] as AbilitySlot[]).map((sl) => `<li><b>${KEY[sl]} ${iconHtml(`icon.ability.${heroId}.${sl}`, h.abilities[sl].icon)} ${h.abilities[sl].name}</b> · ${shapeText(h.abilities[sl].shape, h.abilities[sl].range)}</li>`).join('');
  return head('', `${h.name} <em>${FAMILY_NAMES[h.family]} · ${h.role}</em>`) + p(h.desc) + p(`⚙️ ${h.passive}`, 'tt-note')
    + `<ul class="tt-list"><li><b>${touchMode() ? '' : 'Clic · '}${h.basic.name}</b> · ${h.basic.kind === 'melee' ? 'cuerpo a cuerpo' : 'a distancia'}</li>${kit}</ul>`
    + (rules.progression ? '' : p('Con las reglas Brawler tenés todo desde el principio.', 'tt-hint'));
}

export function rulesTip(id: RulesetId) {
  const r = RULESETS[id];
  const on = (b: boolean, t: string) => `<li class="${b ? 'on' : 'off'}">${b ? '✔' : '✖'} ${t}</li>`;
  return head(r.icon, r.name) + p(r.desc)
    + `<ul class="tt-list checks">${r.weapons ? on(true, 'Armas: pistola, uzi, escopeta, lanzacohetes y C4') : ''}${on(r.abilities, 'Poderes del héroe')}${on(r.progression, 'Niveles y XP')}${on(r.crafting, r.forgeAtBase ? 'Forja: ítems y mutaciones (solo en tu base)' : 'Forja: ítems y mutaciones')}${on(r.repair, `Reparar${paren('repair')}`)}${on(r.pickups === 'materials', 'Materiales')}${on(r.ultCharge, 'Ulti por carga')}${!r.jump ? on(false, 'Salto') : ''}${r.grab ? on(true, 'Clic: agarrar en vez de pegar') : ''}${on(r.dash, `Dash · ${s(r.dashCd)}${paren('dash')}`)}${r.recall ? on(true, `Volver a la base${paren('recall')}`) : ''}</ul>`;
}

/** Lo que conviene saber de cada modo antes de jugarlo. Funciones porque nombran teclas, que se pueden reasignar. */
const MODE_NOTES: Partial<Record<ModeId, () => string[]>> = {
  stock: () => [
    '<b>No hay barra de vida</b>: cada golpe te agrieta y, cuanto más roto estás, más lejos volás.',
    'Se pierde una vida solo por <b>ring-out</b>: saliendo del mapa.',
  ],
  kills: () => [
    'Cada <b>ring-out</b> es un punto para tu equipo; caerte solo no le suma al rival.',
    'Reaparecés siempre: lo que cuenta es llegar primero al objetivo.',
  ],
  koth: () => [
    'La zona suma mientras haya gente de <b>un solo equipo</b> adentro; si hay rivales queda disputada.',
    'La zona <b>se muda</b> cada tanto: mirá el aviso y llegá antes.',
  ],
  moba: () => [
    '<b>Sin barra de vida</b>: como siempre, te agrietás y morís si te sacan del mapa. Las líneas son puentes sobre el vacío.',
    '<b>Oleadas</b> de esbirros cada 24 s: Guijarros (cuerpo a cuerpo), Chispas (a distancia) y un Ariete cada 3 oleadas. Se los puede tirar al vacío.',
    '<b>Economía</b>: rematar un esbirro te da su material al toque, y el esbirro suelta un trozo que junta el que esté cerca.',
    '<b>Torres</b>: la exterior protege a la interior; las dos protegen al núcleo. Sin esbirros cerca reciben menos daño.',
    `<b>Tu base</b> te enfría rápido y es donde se forja. <kbd>${touchMode() ? '🏠' : keyName('recall')}</kbd>: volver (4 s quieto).`,
    '<b>El Coloso</b> despierta a los 2 min: derrotarlo bendice a tus esbirros.',
  ],
  horde: () => [
    '<b>Cooperativo</b>: no hay equipos rivales. Se pierde cuando a nadie le quedan vidas.',
    touchMode()
      ? '<b>Armas en vez de poderes</b>: el botón grande dispara (mantenelo y arrastrá para apuntar; sin arrastrar apunta solo al zombi más cercano), <kbd>🫸</kbd> es el empujón, <kbd>🔁</kbd> cambia entre la pistola y tu arma y <kbd>🧨</kbd> planta C4.'
      : `<b>Armas en vez de poderes</b>: <kbd>Clic</kbd> dispara (mantenelo), <kbd>Clic derecho</kbd> es el empujón, <kbd>${keyName('q')}</kbd> cambia entre la pistola y tu arma, <kbd>${keyName('r')}</kbd> planta C4.`,
    'Empezás con la pistola y un arma cargada. Las <b>cajas</b> que caen del cielo traen uzi, escopeta, lanzacohetes, C4 o un botiquín que enfría. Disparar te frena: hay que elegir entre correr y tirar.',
    'Las oleadas <b>no paran de crecer</b>. Se gana cumpliendo las <b>misiones</b> del mapa, una tras otra, hasta la <b>extracción</b>.',
    'Cada zona asegurada queda como <b>mini base</b>: torreta, lugar donde enfriarse y punto de reaparición.',
    `Al cumplir cada misión <b>elegís una mejora</b> entre tres (${touchMode() ? 'tocá la que quieras' : 'teclas <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> o clic'}): más daño, balas que atraviesan, zombis que explotan... Tenés ${PERK.time} s; se acumulan hasta el final.`,
    '<b>Zombis</b> (lentos), <b>Corredores</b> (rápidos y frágiles), <b>Escupidores</b> (a distancia, avisan dónde cae) y <b>Moles</b> (enormes: su golpe se ve venir). A todos se los puede <b>tirar al vacío</b>.',
  ],
  race: () => [
    'Pasá las <b>puertas</b> en orden: si te caés, reaparecés en la última que pasaste.',
    `Salto flotante y sin doble salto: <kbd>${touchMode() ? 'el clic' : 'Clic'}</kbd> agarra al rival que tenés cerca y de frente (frena a los dos un rato) en vez de pegarle, y el dash tarda bastante en volver: usalo para cruzar un hueco, abrir una cobertura o soltarte si te agarran.`,
    '<b>Rotores</b> y <b>bolas</b>: se esquivan de costado, o con un salto bien puesto (es corto). <b>Géiseres</b>: avisan antes de disparar. <b>Paragolpes</b>: te rebotan. <b>Resortes</b>: atajos. <b>Aceleradores ⚡</b>: un envión.',
    'El <b>piso flojo</b> (más claro y agrietado) se cae al pisarlo: no te quedes quieto. El <b>dash rompe</b> cualquier cobertura de una sola embestida; los barriles explotan.',
    `Las <b>cajas ❓</b> dan un ítem de un solo uso${touchMode() ? ': aparece en los botones de arriba del agarre' : ` (<kbd>${keyName('i1')}</kbd> <kbd>${keyName('i2')}</kbd> <kbd>${keyName('i3')}</kbd>)`}.`,
    'Cuando llega el primero quedan 25 s para terminar.',
    'En <b>copa</b> se corren varias pistas seguidas: cada puesto da puntos y gana quien suma más.',
  ],
};

const GUN_DESC: Record<WeaponId, string> = {
  pistol: 'La de siempre: precisa, con buen alcance y munición infinita. A ella volvés cuando te quedás sin balas.',
  uzi: 'Ráfaga larguísima que limpia zombis sueltos. Se come las balas.',
  shotgun: 'Un abanico de perdigones: de cerca tira para atrás hasta a una Mole. De lejos casi no hace nada.',
  launcher: 'Un cohete que explota en área y manda cuerpos a volar. Lento y con pocos tiros: elegí bien.',
};

/** El arma que tenés en la mano (Horda). */
export function gunTip(idx: number) {
  const w = WEAPONS[WEAPON_IDS[idx] ?? 'pistol'];
  return head(w.icon, w.name) + p(GUN_DESC[w.id])
    + p(`Mantené <kbd>Clic</kbd> para disparar. ${w.ammo ? `Trae ${w.ammo} ${w.id === 'launcher' ? 'cohetes' : 'balas'} por caja.` : 'Munición infinita.'} Disparar te frena un poco.`, 'tt-note');
}

export function swapTip(other: number) {
  const w = other >= 0 ? WEAPONS[WEAPON_IDS[other]] : null;
  return head('🔁', 'Cambiar de arma', keyName('q'))
    + p(w ? `Pasás a: ${w.icon} <b>${w.name}</b>.` : 'Llevás la pistola y <b>un</b> arma más. Todavía no tenés otra: agarrá una caja de suministros.')
    + p('Agarrar una caja del arma que ya tenés suma balas; una distinta la reemplaza.', 'tt-note');
}

export function c4Tip() {
  return head('🧨', 'C4', keyName('r'))
    + p(`Dejás una carga a tus pies: avisa el área y explota a los ${C4.fuse} s. <b>No lastima a tu equipo</b>, pero rompe el piso frágil y hace estallar los barriles.`)
    + p(`Viene en las cajas (${C4.perCrate} cargas, hasta ${C4.max}). Plantala y alejate: los zombis te siguen hasta ella.`, 'tt-note');
}

/** Una mejora de la Horda que ya tenés (nivel: cuántas veces la elegiste). */
export function perkTip(id: PerkId, level: number) {
  const k = PERKS[id];
  return head(k.icon, k.name) + p(k.desc + '.')
    + (k.max > 1 && k.max < 10 ? p(`Nivel ${level} de ${k.max}: el efecto se suma con cada nivel.`, 'tt-note') : '');
}

export function modeTip(id: ModeId) {
  const notes = MODE_NOTES[id]?.() ?? [];
  return head(gameOf(id).icon, MODE_INFO[id].name) + p(MODE_INFO[id].desc)
    + (notes.length ? `<ul class="tt-list">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : '');
}

export { esc };
