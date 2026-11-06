import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from './App'
import { AuthGate } from './auth/AuthGate'

describe('App', () => {
  it('creates a canvas from the empty state and opens it', async () => {
    const user = userEvent.setup()
    render(
      <AuthGate>
        <App />
      </AuthGate>,
    )

    expect(await screen.findByText('No canvases yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /create the first canvas/i }))

    expect(await screen.findByRole('heading', { name: 'Untitled canvas' })).toBeInTheDocument()
  })
})
