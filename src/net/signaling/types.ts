// Signaling: solo sirve para que dos navegadores se encuentren e intercambien offer/answer/ICE.
// Después, todo el gameplay va por WebRTC y el signaling no participa (ver docs/arquitectura.md).
export interface SignalMsg {
  from: string;
  to: string; // pid destino o '*'
  kind: 'join' | 'offer' | 'answer' | 'ice' | 'bye' | 'reject';
  data?: any;
}

export interface Presence {
  pid: string;
  role: 'host' | 'client';
  name: string;
}

export interface RoomInfo {
  code: string;
  host: string;
  players: number;
  max: number;
  mode: string;
  map: string;
  inMatch: boolean;
}

export interface SignalingChannel {
  readonly kind: 'supabase' | 'local';
  join(room: string, me: Presence, onMsg: (m: SignalMsg) => void, onPresence: (list: Presence[]) => void): Promise<void>;
  send(m: SignalMsg): void;
  leave(): Promise<void>;
}

export interface Directory {
  subscribe(cb: (rooms: RoomInfo[]) => void): void;
  announce(room: RoomInfo | null): void;
  close(): void;
}
