import { describe, expect, it } from 'vitest'

import {
  continueMarkdownList,
  indentMarkdownList,
  toggleInlineWrap,
} from './markdownEditing'

describe('markdown editing', () => {
  it('continues bullet lists', () => {
    const result = continueMarkdownList('- first', 7, 7)
    expect(result?.text).toBe('- first\n- ')
    expect(result?.selectionStart).toBe(10)
  })

  it('increments ordered lists', () => {
    const result = continueMarkdownList('1. first', 8, 8)
    expect(result?.text).toBe('1. first\n2. ')
  })

  it('exits an empty list item', () => {
    const result = continueMarkdownList('intro\n- ', 9, 9)
    expect(result?.text).toBe('intro\n')
    expect(result?.selectionStart).toBe(6)
  })

  it('continues task lists with an unchecked box', () => {
    const result = continueMarkdownList('- [x] done', 11, 11)
    expect(result?.text).toBe('- [x] done\n- [ ] ')
  })

  it('indents and outdents list items', () => {
    expect(indentMarkdownList('- item', 2, 2, false)?.text).toBe('  - item')
    expect(indentMarkdownList('  - item', 4, 4, true)?.text).toBe('- item')
  })

  it('wraps and unwraps inline markers', () => {
    expect(toggleInlineWrap('hello', 0, 5, '**').text).toBe('**hello**')
    expect(toggleInlineWrap('**hello**', 2, 7, '**').text).toBe('hello')
  })
})
