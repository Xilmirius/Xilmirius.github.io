// Mensajes entre host y clientes por WebRTC DataChannel.
// Canal "rel" (confiable/ordenado): lobby, eventos, comandos. Canal "fast" (no confiable): inputs y snapshots.
import type { TimedEvent } from './events';
import type { Command } from './sim';
import type { HeroId, MatchSettings } from './types';

export interface LobbyPlayer {
  pid: string;
  name: string;
  hero: HeroId;
  team: number;
  bot: boolean;
  connected: boolean;
  ping: number;
  host: boolean;
  hat: string;
}

export interface LobbyState {
  code: string;
  players: LobbyPlayer[];
  settings: MatchSettings;
  inMatch: boolean;
}

export interface RosterInfo {
  id: number;
  pid: string;
  name: string;
  team: number;
  hero: HeroId;
  bot: boolean;
  hat: string;
}

export interface MatchInit {
  settings: MatchSettings;
  roster: RosterInfo[];
  seed: number;
  tick: number;
  matchId: string;
}

export interface PlayerResult {
  id: number;
  pid: string;
  name: string;
  hero: HeroId;
  team: number;
  bot: boolean;
  kills: number;
  deaths: number;
  assists: number;
  heatDealt: number;
  level: number;
  destroyed: number;
  pickups: number;
  billiards: number;
  bestLaunch: number;
  lethals: number;
  saves: number;
  hat: string;
}

export interface MatchResultInfo {
  winner: number;
  draw: boolean;
  reason: string;
  duration: number;
  players: PlayerResult[];
  teams: 'teams' | 'ffa';
}

export type HostMsg =
  | { t: 'welcome'; you: string; lobby: LobbyState; v: number }
  | { t: 'lobby'; lobby: LobbyState }
  | { t: 'start'; init: MatchInit }
  | { t: 's'; a: number; me: any; w: any[] }
  | { t: 'ev'; l: TimedEvent[] }
  | { t: 'end'; res: MatchResultInfo }
  | { t: 'back' }
  | { t: 'chat'; from: string; text: string }
  | { t: 'pong'; ts: number }
  | { t: 'kick'; reason: string };

export type ClientMsg =
  | { t: 'hello'; pid: string; name: string; v: number }
  | { t: 'pick'; hero?: HeroId; team?: number; hat?: string }
  | { t: 'in'; f: number[][] }
  | { t: 'cmd'; cmd: Command }
  | { t: 'chat'; text: string }
  | { t: 'ping'; ts: number; rtt?: number };
