import { Children, useMemo, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import './ObsidianEditor.css'
import { parseObsidianDocument } from './obsidianSchema'

const TOOLBAR_ACTIONS = [
  {
    label: 'H2',
    template: '## Section title',
  },
  {
    label: 'Task',
    template: '- [ ] New task',
  },
  {
    label: 'Callout',
    template: '> [!note] Quick note\n> Add context here.',
  },
  {
    label: 'Code',
    template: '```md\nAdd code or config here\n```',
  },
  {
    label: 'Table',
    template: '| Column | Value |\n| --- | --- |\n| Example | Text |',
  },
  {
    label: 'Wiki',
    template: '[[Related Note]]',
  },
]

const CALLOUT_LABELS = {
  note: 'Note',
  tip: 'Tip',
  info: 'Info',
  warning: 'Warning',
  success: 'Success',
  quote: 'Quote',
  embed: 'Embed',
}

function flattenNodeText(node) {
  if (typeof node === 'string') {
    return node
  }

  if (Array.isArray(node)) {
    return node.map((item) => flattenNodeText(item)).join('')
  }

  if (!node || !node.props) {
    return ''
  }

  return flattenNodeText(node.props.children)
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function downloadTextFile(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = fileName
  anchor.click()

  URL.revokeObjectURL(url)
}

function replaceSelection(value, start, end, snippet) {
  const before = value.slice(0, start)
  const after = value.slice(end)
  const prefix = before && !before.endsWith('\n') ? '\n' : ''
  const suffix = after && !after.startsWith('\n') ? '\n' : ''
  const nextValue = `${before}${prefix}${snippet}${suffix}${after}`
  const nextCursor = before.length + prefix.length + snippet.length

  return { nextValue, nextCursor }
}

function MarkdownLink({ href, children }) {
  if (!href) {
    return <span>{children}</span>
  }

  if (href.startsWith('wikilink:')) {
    const target = decodeURIComponent(href.replace('wikilink:', ''))
    return (
      <a className="obsidian-link obsidian-link--internal" href={`#${slugify(target)}`}>
        {children}
      </a>
    )
  }

  return (
    <a className="obsidian-link obsidian-link--external" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

function MarkdownImage({ src, alt }) {
  if (!src) {
    return null
  }

  if (src.startsWith('vault:')) {
    const target = src.replace('vault:', '')
    return (
      <figure className="obsidian-embed-card">
        <div className="obsidian-embed-card__preview">OBS</div>
        <figcaption>
          <strong>{alt || target.split('/').pop()}</strong>
          <span>{target}</span>
        </figcaption>
      </figure>
    )
  }

  return <img className="obsidian-markdown-image" src={src} alt={alt || ''} />
}

function MarkdownCode({ inline, className, children }) {
  if (inline) {
    return <code>{children}</code>
  }

  return (
    <pre className="obsidian-code-block">
      <code className={className}>{children}</code>
    </pre>
  )
}

function MarkdownBlockquote({ children }) {
  const items = Children.toArray(children)
  const firstNodeText = flattenNodeText(items[0]).trim()
  const calloutLine = firstNodeText.split('\n')[0]
  const calloutMatch = calloutLine.match(/^\[!([^\]]+)\]\s*(.*)$/)

  if (!calloutMatch) {
    return <blockquote className="obsidian-blockquote">{children}</blockquote>
  }

  const calloutType = calloutMatch[1].toLowerCase()
  const title = calloutMatch[2] || CALLOUT_LABELS[calloutType] || calloutType

  return (
    <aside className={`obsidian-callout obsidian-callout--${calloutType}`}>
      <div className="obsidian-callout__title">
        <span>{CALLOUT_LABELS[calloutType] || 'Callout'}</span>
        <strong>{title}</strong>
      </div>
      <div className="obsidian-callout__body">{items.slice(1)}</div>
    </aside>
  )
}

function MarkdownHeading({ level, children }) {
  const Tag = `h${level}`
  const text = flattenNodeText(children)

  return (
    <Tag id={slugify(text)} className={`obsidian-heading obsidian-heading--${level}`}>
      {children}
    </Tag>
  )
}

export function ObsidianEditor({ value, onChange, documentPath = 'Vault/Untitled.md' }) {
  const textareaRef = useRef(null)
  const importInputRef = useRef(null)
  const model = useMemo(() => parseObsidianDocument(value, { documentPath }), [value, documentPath])
  const normalizedMarkdown = useMemo(() => model.document.source.normalizedMarkdown, [model])

  const applyTemplate = (template) => {
    const textarea = textareaRef.current

    if (!textarea) {
      onChange(`${value}\n${template}`)
      return
    }

    const { nextValue, nextCursor } = replaceSelection(
      value,
      textarea.selectionStart,
      textarea.selectionEnd,
      template,
    )

    onChange(nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const handleImport = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const text = await file.text()
    onChange(text)
    event.target.value = ''
  }

  return (
    <section className="obsidian-workspace">
      <div className="obsidian-workspace__bar">
        <div>
          <p className="obsidian-workspace__eyebrow">Module Surface</p>
          <h2>{model.document.title}</h2>
          <span>{documentPath}</span>
        </div>

        <div className="obsidian-workspace__actions">
          <button type="button" onClick={() => importInputRef.current?.click()}>
            .md 불러오기
          </button>
          <button
            type="button"
            onClick={() => downloadTextFile('obsidian-note.md', value, 'text/markdown;charset=utf-8')}
          >
            .md 내보내기
          </button>
          <button
            type="button"
            className="is-accent"
            onClick={() =>
              downloadTextFile(
                'obsidian-note.json',
                JSON.stringify(model, null, 2),
                'application/json;charset=utf-8',
              )
            }
          >
            JSON 내보내기
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".md,text/markdown"
            hidden
            onChange={handleImport}
          />
        </div>
      </div>

      <div className="obsidian-workspace__grid">
        <article className="obsidian-editor-panel">
          <div className="obsidian-editor-panel__toolbar">
            {TOOLBAR_ACTIONS.map((action) => (
              <button key={action.label} type="button" onClick={() => applyTemplate(action.template)}>
                {action.label}
              </button>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            className="obsidian-textarea"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            aria-label="Obsidian Markdown editor"
          />
        </article>

        <article className="obsidian-preview-panel">
          <div className="obsidian-preview-panel__meta">
            <div>
              <strong>{model.document.headings.length}</strong>
              <span>Headings</span>
            </div>
            <div>
              <strong>{model.document.tags.length}</strong>
              <span>Tags</span>
            </div>
            <div>
              <strong>{model.document.stats.wordCount}</strong>
              <span>Words</span>
            </div>
          </div>

          {Object.keys(model.document.frontmatter).length > 0 ? (
            <div className="obsidian-frontmatter">
              {Object.entries(model.document.frontmatter).map(([key, entry]) => (
                <div key={key} className="obsidian-frontmatter__item">
                  <span>{key}</span>
                  <strong>
                    {Array.isArray(entry)
                      ? entry.join(', ')
                      : typeof entry === 'object'
                        ? JSON.stringify(entry)
                        : String(entry)}
                  </strong>
                </div>
              ))}
            </div>
          ) : null}

          <div className="obsidian-note-view">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{
                a: MarkdownLink,
                blockquote: MarkdownBlockquote,
                code: MarkdownCode,
                h1: (props) => <MarkdownHeading level={1} {...props} />,
                h2: (props) => <MarkdownHeading level={2} {...props} />,
                h3: (props) => <MarkdownHeading level={3} {...props} />,
                h4: (props) => <MarkdownHeading level={4} {...props} />,
                h5: (props) => <MarkdownHeading level={5} {...props} />,
                h6: (props) => <MarkdownHeading level={6} {...props} />,
                img: MarkdownImage,
              }}
            >
              {normalizedMarkdown}
            </ReactMarkdown>
          </div>
        </article>
      </div>
    </section>
  )
}
