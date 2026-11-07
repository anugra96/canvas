import { describe, expect, it } from 'vitest'

import {
  autoClosePair,
  indentCode,
  lineCommentToken,
  smartBackspace,
  smartEnter,
  toggleLineComment,
} from './codeEditing'

describe('code editing', () => {
  it('indents and outdents lines', () => {
    expect(indentCode('const value = 1', 0, 0, false)?.text).toBe('  const value = 1')
    expect(indentCode('  const value = 1', 2, 2, true)?.text).toBe('const value = 1')
    expect(indentCode('a\nb', 0, 3, false)?.text).toBe('  a\n  b')
    expect(indentCode('  a\n  b', 0, 7, true)?.text).toBe('a\nb')
  })

  it('auto-indents after an opening brace', () => {
    const result = smartEnter('if (true) {', 11, 11)
    expect(result.text).toBe('if (true) {\n  ')
  })

  it('expands an auto-closed block across three lines', () => {
    const result = smartEnter('if (true) {}', 11, 11)
    expect(result.text).toBe('if (true) {\n  \n}')
    expect(result.selectionStart).toBe(14)
  })

  it('closes pairs and skips existing closers', () => {
    expect(autoClosePair('', 0, 0, '(', ')').text).toBe('()')
    expect(autoClosePair('abc', 0, 3, '(', ')').text).toBe('(abc)')
  })

  it('removes an empty pair with backspace', () => {
    expect(smartBackspace('()', 1, 1)?.text).toBe('')
    expect(smartBackspace('(x)', 2, 2)).toBeNull()
  })

  it('toggles line comments', () => {
    expect(toggleLineComment('const value = 1', 0, 0, '//').text).toBe('// const value = 1')
    expect(toggleLineComment('// const value = 1', 0, 0, '//').text).toBe('const value = 1')
    expect(toggleLineComment('  a\n  b', 0, 7, '//').text).toBe('  // a\n  // b')
  })

  it('maps languages to line comment tokens', () => {
    expect(lineCommentToken('typescript')).toBe('//')
    expect(lineCommentToken('python')).toBe('#')
    expect(lineCommentToken('json')).toBeNull()
  })
})
