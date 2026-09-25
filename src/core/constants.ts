// Constantes de juego. Todo lo "tuneable" vive acá para iterar balance sin tocar sistemas.
export const GAME_TITLE = 'RUBBLE';
export const GAME_SUBTITLE = 'arena brawler de materiales';
export const PROTOCOL_VERSION = 4;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 3; // 20 Hz
export const INTERP_TICKS = 7; // ~115 ms de buffer de interpolación en clientes

// Mundo
export const CELL = 2;
export const LEVEL_H = 1.5;
export const WALL_TOP = 3.2;
export const ISLAND_BOTTOM = -3;
export const KILL_Y = -9;

// Personaje
export const CHAR_RADIUS = 0.5;
export const CHAR_HEIGHT = 1.45;
export const GRAVITY = 30;
export const JUMP_V = 10.8;
export const AIR_JUMP_V = 9.6;
export const STEP_UP = 0.45;
export const STEP_DOWN = 0.5;
export const MANTLE_H = 1.25;
export const GROUND_ACCEL = 70;
export const GROUND_DECEL = 60;
export const HIT_SLIDE_ACCEL = 14;
export const AIR_ACCEL = 24;
export const TUMBLE_DRAG = 1.0;
export const TUMBLE_FRICTION = 26;
export const DI_ACCEL = 13;
export const COYOTE = 0.1;

// Heat / etapas del material (D-0015, D-0024): intacto no se mueve, agrietado vuela, quebrado vuela lejos.
export const STAGE_NAMES = ['Intacto', 'Agrietado', 'Quebrado', 'Destrozado'];
export const STAGE_AT = [0, 40, 90, 150];
export const STAGE_KB = [0.42, 0.85, 1.25, 1.8];
export const HEAT_MAX = 260;
export const LAUNCH_THRESHOLD = 6;
export const WALL_SLAM_SPEED = 9;
export const BODY_HIT_SPEED = 7;

// Respawn
export const RESPAWN_TIME = 3;
export const SPAWN_INVULN = 2;
export const KILL_CREDIT_TIME = 8;

// Destructibles y materiales
export const DESTRUCT_RESPAWN = 40;
export const PICKUP_TTL = 30;
export const PICKUP_MAGNET = 2.2;
export const PICKUP_COLLECT = 0.8;
export const MAX_PICKUPS = 90;
export const TILE_HP = 100;
export const TILE_CRUMBLE = 0.8;

// Empujón universal (clic derecho): mantener carga (D-0028)
export const PUSH_MAX_CHARGE = 0.8;
export const PUSH_CD = 0.5;

// Reparar (V)
export const REPAIR_TIME = 1.4;
export const REPAIR_COST = 4;
export const REPAIR_AMOUNT = 45;

// Progresión
export const MAX_LEVEL = 10;
export const XP_TABLE = [0, 70, 170, 300, 460, 650, 870, 1120, 1400, 1720];
export const MUTATION_LEVELS = [3, 6, 9];
export const XP_TRICKLE = 1.5;
export const XP_PER_HEAT = 0.35;
export const XP_DESTRUCT = 8;
export const XP_PICKUP = 1;
export const XP_KILL = 70;
export const XP_ASSIST = 35;

export const TEAM_COLORS = [0x3b8bff, 0xff7a29, 0x3ddc84, 0xe64bd8, 0xffd23f, 0x2de2e6];
export const TEAM_NAMES = ['Azul', 'Naranja', 'Verde', 'Rosa', 'Amarillo', 'Cian'];
