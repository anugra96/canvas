import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { THEMES } from './registry'

const tokens = readFileSync(resolve(process.cwd(), 'src/themes.css'), 'utf8')

describe('theme registry', () => {
  it('has a token block for every registered theme', () => {
    for (const theme of THEMES) {
      expect(tokens).toContain(`:root[data-theme="${theme.id}"]`)
    }
  })
})
