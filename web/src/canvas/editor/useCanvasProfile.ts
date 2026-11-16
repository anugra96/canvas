import { useMemo } from 'react'

import {
  DEFAULT_PROFILES,
  RAW_PROFILE,
  findEntityType,
  findProfile,
  findRelationType,
  profileEntityTypeIds,
  type CanvasDocument,
  type Ontology,
} from '@canvas/contract'

export function useCanvasProfile(ontology: Ontology, document: CanvasDocument) {
  const profile = useMemo(
    () => findProfile(DEFAULT_PROFILES, document.canvas.app?.profile ?? 'raw') ?? RAW_PROFILE,
    [document.canvas.app?.profile],
  )
  const isSystems = profile.id === 'systems'
  const isApi = profile.id === 'api'
  const isStructured = isSystems || isApi
  const availableEntityTypes = useMemo(() => {
    const ids = isStructured
      ? profileEntityTypeIds(profile)
      : ontology.entityTypes.map((entityType) => entityType.id)
    return ids
      .map((id) => findEntityType(ontology, id))
      .filter((entityType): entityType is NonNullable<typeof entityType> => Boolean(entityType))
  }, [isStructured, ontology, profile])
  const profileRelationTypes = useMemo(() => {
    if (!isStructured) return ontology.relationTypes
    return profile.relationTypes
      .map((id) => findRelationType(ontology, id))
      .filter((relation): relation is NonNullable<typeof relation> => Boolean(relation))
  }, [isStructured, ontology, profile])

  return { profile, isSystems, isApi, isStructured, availableEntityTypes, profileRelationTypes }
}
