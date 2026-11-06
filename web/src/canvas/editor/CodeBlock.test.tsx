import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CodeBlock } from './CodeBlock'
import { MarkdownContent } from './MarkdownContent'

describe('code rendering', () => {
  it('renders highlighted code text', () => {
    const { container } = render(
      <CodeBlock code="const answer: number = 42" language="typescript" />,
    )
    expect(container.querySelector('.code-block')).toBeTruthy()
    expect(container.textContent).toContain('const answer: number = 42')
  })

  it('renders fenced markdown code with the code block component', () => {
    const { container } = render(
      <MarkdownContent text={'# Example\n\n```ts\nconst value = 1\n```\n'} />,
    )
    expect(container.querySelector('.code-block')).toBeTruthy()
    expect(container.textContent).toContain('const value = 1')
  })
})
