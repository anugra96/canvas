import { Highlight, themes } from 'prism-react-renderer'

const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  md: 'markdown',
  yml: 'yaml',
  html: 'markup',
  text: 'plain',
}

function normalizeLanguage(language: string | undefined): string {
  if (!language) return 'plain'
  const normalized = language.toLowerCase()
  return LANGUAGE_ALIASES[normalized] ?? normalized
}

export function CodeBlock({
  code,
  language,
  showLineNumbers = true,
}: {
  code: string
  language?: string
  showLineNumbers?: boolean
}) {
  const value = code.replace(/\s+$/, '')
  if (!value) {
    return <div className="code-empty">Double-click to add code</div>
  }

  return (
    <Highlight theme={themes.vsDark} code={value} language={normalizeLanguage(language)}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={`code-block ${className}`} style={{ ...style, background: 'transparent' }}>
          <code>
            {tokens.map((line, lineIndex) => {
              const lineProps = getLineProps({ line })
              return (
                <div key={lineIndex} {...lineProps} className={`code-line ${lineProps.className ?? ''}`}>
                  {showLineNumbers && <span className="code-line-number">{lineIndex + 1}</span>}
                  <span className="code-line-content">
                    {line.map((token, tokenIndex) => (
                      <span key={tokenIndex} {...getTokenProps({ token })} />
                    ))}
                  </span>
                </div>
              )
            })}
          </code>
        </pre>
      )}
    </Highlight>
  )
}
