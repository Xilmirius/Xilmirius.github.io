// Mapas definidos como ASCII: se editan a mano sin herramientas. Cada celda mide CELL unidades.
//
// Leyenda:
//  ' ' vacío (caída = ring-out)      '.' piso nivel 0          ',' piso frágil nivel 0 (se rompe)
//  '1' plataforma nivel 1            ':' plataforma frágil n1   '#' muro alto indestructible
//  '^' 'v' '<' '>' rampa de nivel 0 a 1; la flecha apunta hacia donde SUBE
//  'A' 'B' spawn de equipo (piso n0) '*' spawn extra para todos contra todos
//  'z' punto de zona (n0)            'Z' punto de zona (n1)     (celdas z contiguas se promedian)
//  Destructibles en n0: 'o' roca  'm' chatarra  'c' cristal  'g' goo   —  en n1: 'O' 'M' 'C' 'G'
// Solo mapas de Asedio (MOBA), todo en piso n0:
//  'X' 'x' torre del equipo A / B    'K' 'k' núcleo del equipo A / B
//  'n' campamento neutral            '@' guarida del Coloso (celdas contiguas se promedian)
// Los mapas de Asedio se diseñan de la mitad izquierda y se espejan: son justos por construcción.

export interface MapDef {
  id: string;
  name: string;
  desc: string;
  players: string;
  rows: string[];
  sky: number;
  fog: number;
  ground: number;
  ground2: number;
  /** 'arena' (brawler, por defecto) o 'moba' (Asedio: bases, líneas y torres). */
  kind?: 'arena' | 'moba';
  /** Asedio: recorrido de cada línea en celdas [columna, fila], de la base A a la base B. */
  lanes?: [number, number][][];
}

export const MAPS: Record<string, MapDef> = {
  cantera: {
    id: 'cantera',
    name: 'La Cantera',
    desc: 'Arena mediana con dos plataformas altas y un centro frágil lleno de cristal.',
    players: '2v2 · 3v3 · FFA',
    sky: 0x2a1f3d,
    fog: 0x3a2a4f,
    ground: 0xd9b98c,
    ground2: 0xc9a87a,
    rows: [
      '    ....111111....    ',
      '  ..o...1OZZO1...o..  ',
      ' ....m..1G11G1..m.... ',
      ' #......^1111^......# ',
      '#..o...,,,,,,,,...o..#',
      '..A..g.,,c..c,,.g..B..',
      '.......,......,.......',
      '..A.m..,c.zz.c,..m.B..',
      '.......,......,.......',
      '..A..g.,,c..c,,.g..B..',
      '#..o...,,,,,,,,...o..#',
      ' #......v1111v......# ',
      ' ....m..1G11G1..m.... ',
      '  ..o...1OZZO1...o..  ',
      '    ....111111....    ',
    ],
  },
  islote: {
    id: 'islote',
    name: 'El Islote',
    desc: 'Isla chica y traicionera. Ideal para 1v1 y 2v2: todo está cerca del borde.',
    players: '1v1 · 2v2',
    sky: 0x14304a,
    fog: 0x1d4466,
    ground: 0xa8c98a,
    ground2: 0x96b87a,
    rows: [
      '   ..1111..   ',
      '  ..1OZZO1..  ',
      ' ...111111... ',
      ' ..o.^..^.o.. ',
      '.A.,,,,,,,,.B.',
      '.A.,c.zz.c,.B.',
      '.A.,,,,,,,,.B.',
      ' ..g.v..v.g.. ',
      ' ...111111... ',
      '  ..1MZZM1..  ',
      '   ..1111..   ',
    ],
  },
  puente: {
    id: 'puente',
    name: 'El Puente',
    desc: 'Asedio de una línea: un solo puente entre las dos bases, el Coloso al norte y campamentos al sur.',
    players: '1v1 · 2v2',
    kind: 'moba',
    sky: 0x1b2440,
    fog: 0x243056,
    ground: 0xc9b28a,
    ground2: 0xb89f78,
    lanes: [[[8, 10], [51, 10]]],
    rows: [
      '                                                            ',
      '                       ...o,....,o...                       ',
      '                      ..m..........m..                      ',
      '                      .......@@.......                      ',
      '                      .c............c.                      ',
      '                       ..,........,..                       ',
      '                      ..            ..                      ',
      ' #########  .....     ..            ..     .....  ######### ',
      ' #.......#.............              .............#.......# ',
      ' #....A................,............,................B....# ',
      ' #.K..A.....X......X.....,,,,,,,,,,.....x......x.....B..k.# ',
      ' #....A................,............,................B....# ',
      ' #.......#.............              .............#.......# ',
      ' #########  .....     ..            ..     .....  ######### ',
      '                      ..            ..                      ',
      '                       ...,......,...                       ',
      '                      ..g..........g..                      ',
      '                      ...n........n...                      ',
      '                      .o............o.                      ',
      '                       ....g,..,g....                       ',
      '                                                            ',
    ],
  },
  cornisas: {
    id: 'cornisas',
    name: 'Las Dos Cornisas',
    desc: 'Asedio de dos líneas (arriba y abajo) con jungla en el medio, el Coloso en el centro y un atajo frágil.',
    players: '3v3',
    kind: 'moba',
    sky: 0x201a38,
    fog: 0x2c2350,
    ground: 0xbfae8e,
    ground2: 0xab9a7a,
    lanes: [
      [[8, 14], [11, 14], [11, 4], [48, 4], [48, 14], [51, 14]],
      [[8, 14], [11, 14], [11, 24], [48, 24], [48, 14], [51, 14]],
    ],
    rows: [
      '                                                            ',
      '                                                            ',
      '          ...                                  ...          ',
      '          ...............,,,,,,,,,,...............          ',
      '          ..........X..................x..........          ',
      '          ........................................          ',
      '          ...    ..                      ..    ...          ',
      '          ...    ,.                      .,    ...          ',
      '          .X.    ..                      ..    .x.          ',
      '          ...  ...m.                    .m...  ...          ',
      '          ...  .n...                    ...n.  ...          ',
      ' #########...  o.......,..,......,..,.......o  ...######### ',
      ' #.......#...          .c..........c.          ...#.......# ',
      ' #....A......          ..............          ......B....# ',
      ' #.K..A..........,,..........@@..........,,..........B..k.# ',
      ' #....A......          ..............          ......B....# ',
      ' #.......#...          .c..........c.          ...#.......# ',
      ' #########...  o.......,..,......,..,.......o  ...######### ',
      '          ...  .n...                    ...n.  ...          ',
      '          ...  ...g.                    .g...  ...          ',
      '          .X.    ..                      ..    .x.          ',
      '          ...    .,                      ,.    ...          ',
      '          ...    ..                      ..    ...          ',
      '          ........................................          ',
      '          ..........X..................x..........          ',
      '          ...............,,,,,,,,,,...............          ',
      '          ...                                  ...          ',
      '                                                            ',
      '                                                            ',
    ],
  },
};

export const MAP_IDS = Object.keys(MAPS);
/** Mapas de arena (los que se eligen a mano para el brawler). */
export const ARENA_MAP_IDS = MAP_IDS.filter((id) => (MAPS[id].kind ?? 'arena') === 'arena');

/** Asedio: una línea hasta 2 por equipo, dos líneas con 3 por equipo. */
export function mobaMapFor(perTeam: number): string {
  return perTeam >= 3 ? 'cornisas' : 'puente';
}
