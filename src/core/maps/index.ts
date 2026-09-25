// Mapas definidos como ASCII: se editan a mano sin herramientas. Cada celda mide CELL unidades.
//
// Leyenda:
//  ' ' vacío (caída = ring-out)      '.' piso nivel 0          ',' piso frágil nivel 0 (se rompe)
//  '1' plataforma nivel 1            ':' plataforma frágil n1   '#' muro alto indestructible
//  '^' 'v' '<' '>' rampa de nivel 0 a 1; la flecha apunta hacia donde SUBE
//  'A' 'B' spawn de equipo (piso n0) '*' spawn extra para todos contra todos
//  'z' punto de zona (n0)            'Z' punto de zona (n1)     (celdas z contiguas se promedian)
//  Destructibles en n0: 'o' roca  'm' chatarra  'c' cristal  'g' goo   —  en n1: 'O' 'M' 'C' 'G'

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
};

export const MAP_IDS = Object.keys(MAPS);
