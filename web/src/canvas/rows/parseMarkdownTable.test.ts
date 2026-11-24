import { describe, expect, it } from 'vitest'

import { parseMarkdownTable } from './parseMarkdownTable'

describe('parseMarkdownTable', () => {
  it.each([
    {
      name: 'reads a header, a separator row, and data rows',
      text: '| id | name |\n| --- | --- |\n| 1 | Ada |\n| 2 | Grace |',
      header: ['id', 'name'],
      rows: [['1', 'Ada'], ['2', 'Grace']],
    },
    {
      name: 'accepts lines without outer pipes',
      text: 'id | name\n--- | ---\n1 | Ada',
      header: ['id', 'name'],
      rows: [['1', 'Ada']],
    },
    {
      name: 'accepts outer pipes on one side only',
      text: '| id | name\n--- | ---\n1 | Ada |',
      header: ['id', 'name'],
      rows: [['1', 'Ada']],
    },
    {
      name: 'keeps an escaped pipe inside a cell',
      text: '| id | note |\n| --- | --- |\n| 1 | a \\| b |',
      header: ['id', 'note'],
      rows: [['1', 'a | b']],
    },
    {
      name: 'reads an empty cell as NULL',
      text: '| id | name |\n| --- | --- |\n| 1 |  |\n|  | Ada |',
      header: ['id', 'name'],
      rows: [['1', null], [null, 'Ada']],
    },
    {
      name: 'pads missing cells with NULL and ignores cells past the header',
      text: '| id | name |\n| --- | --- |\n| 1 |\n| 2 | Grace | extra |',
      header: ['id', 'name'],
      rows: [['1', null], ['2', 'Grace']],
    },
  ])('$name', ({ text, header, rows }) => {
    expect(parseMarkdownTable(text)).toEqual({ header, rows })
  })

  it('rejects text that is not a markdown table', () => {
    expect(() => parseMarkdownTable('id,name\n1,Ada')).toThrow(/markdown table/i)
    expect(() => parseMarkdownTable('| id | name |\n| 1 | Ada |')).toThrow(/markdown table/i)
  })
})
