import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactNode,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { CodeBlock } from './CodeBlock'

function MarkdownPre({ children, ...props }: ComponentProps<'pre'>) {
  const child = Children.toArray(children)[0]
  if (isValidElement<{ className?: string; children?: ReactNode }>(child)) {
    const className = child.props.className ?? ''
    const match = /language-([\w-]+)/.exec(className)
    const code = String(child.props.children ?? '').replace(/\n$/, '')
    if (match) {
      return <CodeBlock code={code} language={match[1]} />
    }
  }
  return <pre {...props}>{children}</pre>
}

export function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="node-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: MarkdownPre,
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
