import type { HeroId } from '../types';
import { canto } from './canto';
import { gloop } from './gloop';
import { prisma } from './prisma';
import { remache } from './remache';
import type { HeroDef } from './types';

export const HEROES: Record<HeroId, HeroDef> = { canto, prisma, gloop, remache };
export type { HeroDef, AbilityDef, BasicDef } from './types';
export { UNLOCK } from './types';
