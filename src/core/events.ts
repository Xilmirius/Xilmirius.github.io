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
  | { k: 'feed'; a: number; v: number; as: number[] }
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
