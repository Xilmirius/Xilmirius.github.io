// Frame de input: lo único que un cliente le manda al host por tick.
export const BTN = {
  JUMP: 1,
  BASIC: 2,
  PUSH: 4,
  Q: 8,
  E: 16,
  F: 32,
  R: 64,
  I1: 128,
  I2: 256,
  I3: 512,
  REPAIR: 1024,
  DASH: 2048,
  RECALL: 4096,
} as const;

export interface InputFrame {
  seq: number;
  mx: number; // -1..1 derecha (+x)
  mz: number; // -1..1 hacia cámara (+z). W => -1
  ax: number; // punto de apuntado en el mundo
  az: number;
  b: number; // botones mantenidos (bitmask)
}

export const emptyInput = (): InputFrame => ({ seq: 0, mx: 0, mz: 0, ax: 0, az: 1, b: 0 });

export const pressed = (cur: number, prev: number, bit: number) => (cur & bit) !== 0 && (prev & bit) === 0;
export const released = (cur: number, prev: number, bit: number) => (cur & bit) === 0 && (prev & bit) !== 0;
export const held = (cur: number, bit: number) => (cur & bit) !== 0;

/** Encode compacto para la red: [seq, mx, mz, ax, az, b] */
export const encodeInput = (f: InputFrame): number[] => [
  f.seq,
  Math.round(f.mx * 100) / 100,
  Math.round(f.mz * 100) / 100,
  Math.round(f.ax * 100) / 100,
  Math.round(f.az * 100) / 100,
  f.b,
];
export const decodeInput = (a: number[]): InputFrame => ({ seq: a[0], mx: a[1], mz: a[2], ax: a[3], az: a[4], b: a[5] });
