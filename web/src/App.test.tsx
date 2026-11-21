import { render, screen, within } from '@testing-library/react'
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
    const dialog = await screen.findByRole('dialog', { name: 'Name your canvas' })
    await user.clear(screen.getByLabelText('Canvas name'))
    await user.type(screen.getByLabelText('Canvas name'), 'Test canvas')
    await user.click(within(dialog).getByRole('button', { name: 'Create canvas' }))

    // The editor page is a lazy chunk; its first import on a busy CI runner takes longer than the 1 s default.
    expect(await screen.findByRole('heading', { name: 'Test canvas' }, { timeout: 10_000 })).toBeInTheDocument()
  })
})
