import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@xyflow/react/dist/style.css'

import App from './App'
import { AuthGate } from './auth/AuthGate'
import { OntologyProvider } from './ontology/OntologyProvider'
import './styles.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AuthGate>
      <OntologyProvider>
        <App />
      </OntologyProvider>
    </AuthGate>
  </StrictMode>,
)
