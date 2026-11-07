import { createContext, useContext } from 'react'

import { DEFAULT_ONTOLOGY, type Ontology } from '@canvas/contract'

export const OntologyContext = createContext<Ontology>(DEFAULT_ONTOLOGY)

export function useOntology(): Ontology {
  return useContext(OntologyContext)
}
