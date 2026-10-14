// Eventos de simulación: efectos visuales/sonoros y notificaciones. El host los genera,
// los consume localmente y los reenvía por el canal confiable.
export type SimEvent =
  // a: atacante (-1 = nadie), h: heat sumado, st: etapa resultante, l: 1 si el lanzamiento es letal sin recuperación
  | { k: 'hit'; x: number; y: number; z: number; p: number; f: string; id: number; a: number; h: number; st: number; l: number; dx: number; dz: number }
  | { k: 'boom'; x: number; y: number; z: number; r: number; c: string }
  | { k: 'swing'; id: number; r: number; a: number; c: string }
  | { k: 'shoot'; id: number; c: string }
  | { k: 'cast'; id: number; s: string }
  | { k: 'dstage'; i: number; s: number; by: number }
  | { k: 'tile'; i: number; s: number }
  | { k: 'stage'; id: number; s: number }
  | { k: 'ring'; id: number; x: number; z: number; tm: number; last: number }
  /** Un héroe se quedó sin vida (reglas con `health`): se rompe en el lugar. */
  | { k: 'broke'; id: number; x: number; y: number; z: number; tm: number; last: number }
  | { k: 'feed'; a: number; v: number; as: number[]; /** 1 si se quedó sin vida en vez de caer del mapa (reglas con `health`). */ br?: number }
  | { k: 'jump'; id: number; air: number }
  | { k: 'dash'; id: number; dx: number; dz: number }
  | { k: 'land'; id: number; p: number }
  | { k: 'slam'; id: number; x: number; y: number; z: number; p: number; h: number }
  | { k: 'body'; id: number; x: number; y: number; z: number; a: number }
  | { k: 'lvl'; id: number; l: number }
  | { k: 'pspawn'; l: number[][] }
  | { k: 'pick'; i: number; id: number; m: number }
  | { k: 'pdel'; i: number }
  | { k: 'craft'; id: number; w: string }
  | { k: 'repair'; id: number }
  | { k: 'shield'; id: number }
  | { k: 'burst'; id: number }
  | { k: 'spawn'; id: number }
  | { k: 'msg'; tx: string } // ojo: 't' está reservado para el tick en TimedEvent
  | { k: 'count'; n: number }
  | { k: 'bounce'; id: number }
  | { k: 'blink'; id: number; x: number; z: number; x2: number; z2: number }
  | { k: 'deny'; id: number; w: string }
  | { k: 'save'; id: number } // sobrevivió a un golpe letal
  | { k: 'final'; n: number } // cuenta regresiva de los últimos segundos
  // Artefactos del mapa. w: pad | bumper | rotor | geyser | box · i: índice del artefacto (-1 = resorte) · id: cuerpo (-1 = nadie) · it: ítem que dio la caja
  // Carrera: pasó una puerta (i: cuál, n: cuántas hay). fin: puesto en que llegó a la meta (0 = todavía no llegó)
  | { k: 'gate'; id: number; i: number; n: number; fin: number }
  // Alguien embistió cobertura con el dash (reglas con `dashBreak`).
  | { k: 'ram'; id: number; x: number; y: number; z: number }
  // Agarrar (reglas con `grab`). id: quién agarra · tg: a quién (o a quién soltó) · s: 1 empieza, 0 se corta.
  // (campo "tg", no "t": "t" está reservado para el tick en TimedEvent).
  | { k: 'grab'; id: number; tg: number; s: number }
  | { k: 'gad'; w: string; i: number; id: number; x: number; y: number; z: number; it?: string }
  // ── Armas (core/weapons.ts) ──
  // Disparo de impacto instantáneo. w: índice del arma · p: por cada punto que tocó una bala [x, y, z, qué tocó (0 nada,
  // 1 cuerpo, 2 sólido, 3 cuerpo con crítico)], todo seguido. Una bala perforante deja un punto por cuerpo atravesado.
  | { k: 'shot'; id: number; w: number; p: number[] }
  | { k: 'perk'; id: number; p: number } // eligió una mejora (p: índice en PERK_IDS)
  | { k: 'wpn'; id: number; w: number; e: number } // cambió de arma (e: 1 = se quedó sin balas)
  | { k: 'c4'; id: number; x: number; y: number; z: number; f: number } // plantó una carga (f: segundos de mecha)
  | { k: 'loot'; id: number; c: number; x: number; y: number; z: number } // agarró una caja de suministros (c: qué traía)
  // ── Asedio (MOBA) ──
  | { k: 'udie'; id: number; x: number; y: number; z: number; tm: number; by: number; fall: number } // murió una unidad
  | { k: 'uatk'; id: number; tg: number } // una unidad golpea cuerpo a cuerpo (tg: id del cuerpo o -id-1 de estructura)
  | { k: 'recall'; id: number; s: number; x: number; z: number } // volver a la base: 1 empieza, 0 se corta, 2 llegó
  | { k: 'shit'; id: number; h: number; x: number; y: number; z: number; by: number } // golpe a torre/núcleo (h 0 = protegida)
  | { k: 'sdown'; id: number; kd: string; tm: number; x: number; z: number; by: number } // cayó una torre o un núcleo
  | { k: 'tshot'; id: number; tg: number } // una torre disparó
  | { k: 'gold'; id: number; m: number; n: number } // materiales directos (m: índice de familia)
  | { k: 'alert'; w: string; tm: number; x: number; z: number }; // avisos del modo para un equipo (-1 = todos)

export type TimedEvent = SimEvent & { t: number };
