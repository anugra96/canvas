import { type ReactNode, useEffect, useState } from 'react'

import { DEFAULT_ONTOLOGY, type Ontology } from '@skyward/canvas-contract'

import { useAuth } from '../auth/AuthContext'
import { OntologyContext } from './OntologyContext'
import { loadOntology } from './loadOntology'

export function OntologyProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const testMode = import.meta.env.MODE === 'test'
  const [ontology, setOntology] = useState<Ontology>(DEFAULT_ONTOLOGY)
  const [ready, setReady] = useState(testMode)

  useEffect(() => {
    if (testMode) return
    let active = true
    loadOntology(session.idToken)
      .then((next) => {
        if (!active) return
        setOntology(next)
        setReady(true)
      })
      .catch(() => {
        if (!active) return
        setOntology(DEFAULT_ONTOLOGY)
        setReady(true)
      })
    return () => {
      active = false
    }
  }, [session.idToken, testMode])

  if (!ready) {
    return <div className="ontology-loading">Loading workspace</div>
  }

  return (
    <OntologyContext.Provider value={ontology}>
      {children}
    </OntologyContext.Provider>
  )
}
