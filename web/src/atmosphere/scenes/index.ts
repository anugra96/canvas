import { auroraShore } from './auroraShore'
import { duneDay } from './duneDay'
import { duneNight } from './duneNight'
import { ember } from './ember'
import { gargantua } from './gargantua'
import { tide } from './tide'
import type { BackdropScene, BackdropSceneId } from './types'

export { mulberry } from './random'
export type { BackdropScene, BackdropSceneId }

export const SCENES: Record<BackdropSceneId, BackdropScene> = {
  'dune-night': duneNight,
  'dune-day': duneDay,
  tide,
  ember,
  void: gargantua,
  'aurora-shore': auroraShore,
}
