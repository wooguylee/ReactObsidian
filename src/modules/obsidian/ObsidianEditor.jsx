import { useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import Blockquote from '@tiptap/extension-blockquote'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import './ObsidianEditor.css'
import { editorHtmlToMarkdown, markdownToEditorHtml } from './markdownRichText'
import { parseFrontmatter, parseObsidianDocument } from './obsidianSchema'

const CalloutBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      calloutType: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-callout-type'),
        renderHTML: (attributes) =>
          attributes.calloutType ? { 'data-callout-type': attributes.calloutType } : {},
      },
      calloutTitle: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-callout-title'),
        renderHTML: (attributes) =>
          attributes.calloutTitle ? { 'data-callout-title': attributes.calloutTitle } : {},
      },
    }
  },
})

const TOOLBAR_GROUPS = [
  [
    { label: 'B', action: (editor) => editor.chain().focus().toggleBold().run(), active: (editor) => editor.isActive('bold') },
    { label: 'I', action: (editor) => editor.chain().focus().toggleItalic().run(), active: (editor) => editor.isActive('italic') },
    { label: 'S', action: (editor) => editor.chain().focus().toggleStrike().run(), active: (editor) => editor.isActive('strike') },
    { label: '`Code`', action: (editor) => editor.chain().focus().toggleCode().run(), active: (editor) => editor.isActive('code') },
  ],
  [
    { label: 'H1', action: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: (editor) => editor.isActive('heading', { level: 1 }) },
    { label: 'H2', action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: (editor) => editor.isActive('heading', { level: 2 }) },
    { label: 'H3', action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: (editor) => editor.isActive('heading', { level: 3 }) },
    { label: 'Quote', action: (editor) => editor.chain().focus().toggleBlockquote().run(), active: (editor) => editor.isActive('blockquote') && !editor.getAttributes('blockquote').calloutType },
    {
      label: 'Callout',
      action: (editor) => {
        const type = window.prompt('Callout type', 'note') || 'note'
        const title = window.prompt('Callout title', type) || type
        editor.chain().focus().toggleBlockquote().updateAttributes('blockquote', { calloutType: type, calloutTitle: title }).run()
      },
      active: (editor) => Boolean(editor.getAttributes('blockquote').calloutType),
    },
  ],
  [
    { label: 'Bullet', action: (editor) => editor.chain().focus().toggleBulletList().run(), active: (editor) => editor.isActive('bulletList') },
    { label: 'Number', action: (editor) => editor.chain().focus().toggleOrderedList().run(), active: (editor) => editor.isActive('orderedList') },
    { label: 'Task', action: (editor) => editor.chain().focus().toggleTaskList().run(), active: (editor) => editor.isActive('taskList') },
    { label: 'Code Block', action: (editor) => editor.chain().focus().toggleCodeBlock().run(), active: (editor) => editor.isActive('codeBlock') },
    { label: 'Table', action: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: (editor) => editor.isActive('table') },
  ],
]

function insertWikiLink(editor) {
  const target = window.prompt('Obsidian note path', 'Knowledge Base')

  if (!target) {
    return
  }

  const selectedText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
  const label = selectedText || window.prompt('Link text', target.split('/').pop() || target) || target

  if (selectedText) {
    editor.chain().focus().extendMarkRange('link').setLink({ href: `wikilink:${encodeURIComponent(target)}` }).run()
    return
  }

  editor
    .chain()
    .focus()
    .insertContent({
      type: 'text',
      text: label,
      marks: [{ type: 'link', attrs: { href: `wikilink:${encodeURIComponent(target)}` } }],
    })
    .run()
}

function insertVaultImage(editor) {
  const target = window.prompt('Vault image path', 'Attachments/example.png')

  if (!target) {
    return
  }

  const alt = window.prompt('Image label', target.split('/').pop() || target) || target
  editor.chain().focus().setImage({ src: `vault:${target}`, alt }).run()
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

export function ObsidianEditor({ value, onChange, documentPath = 'Vault/Untitled.md' }) {
  const importInputRef = useRef(null)
  const lastMarkdownRef = useRef(value)
  const parsedInput = useMemo(() => parseFrontmatter(value), [value])
  const model = useMemo(() => parseObsidianDocument(value, { documentPath }), [value, documentPath])
  const frontmatterRef = useRef(parsedInput.data)

  useEffect(() => {
    frontmatterRef.current = parsedInput.data
  }, [parsedInput])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ blockquote: false, heading: { levels: [1, 2, 3] } }),
      CalloutBlockquote,
      Image,
      Link.configure({ autolink: true, openOnClick: false, protocols: ['http', 'https', 'wikilink'] }),
      Placeholder.configure({ placeholder: 'Write as if you are in Obsidian live preview...' }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: markdownToEditorHtml(value),
    editorProps: {
      attributes: {
        class: 'obsidian-wysiwyg',
      },
    },
    onUpdate({ editor: activeEditor }) {
      const nextMarkdown = editorHtmlToMarkdown(activeEditor.getHTML(), frontmatterRef.current)
      lastMarkdownRef.current = nextMarkdown

      if (nextMarkdown !== value) {
        onChange(nextMarkdown)
      }
    },
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    if (value === lastMarkdownRef.current) {
      return
    }

    const html = markdownToEditorHtml(value)

    if (html !== editor.getHTML()) {
      editor.commands.setContent(html, false)
    }

    lastMarkdownRef.current = value
  }, [editor, value])

  const handleImport = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    onChange(await file.text())
    event.target.value = ''
  }

  if (!editor) {
    return null
  }

  return (
    <section className="obsidian-workspace">
      <div className="obsidian-workspace__bar">
        <div>
          <p className="obsidian-workspace__eyebrow">Live WYSIWYG Surface</p>
          <h2>{model.document.title}</h2>
          <span>{documentPath}</span>
        </div>

        <div className="obsidian-workspace__actions">
          <button type="button" onClick={() => importInputRef.current?.click()}>
            .md 불러오기
          </button>
          <button type="button" onClick={() => downloadTextFile('obsidian-note.md', value, 'text/markdown;charset=utf-8')}>
            .md 내보내기
          </button>
          <button type="button" className="is-accent" onClick={() => downloadTextFile('obsidian-note.json', JSON.stringify(model, null, 2), 'application/json;charset=utf-8')}>
            JSON 내보내기
          </button>
          <input ref={importInputRef} type="file" accept=".md,text/markdown" hidden onChange={handleImport} />
        </div>
      </div>

      <div className="obsidian-workspace__grid">
        <article className="obsidian-editor-panel obsidian-editor-panel--full">
          <div className="obsidian-editor-panel__toolbar">
            {TOOLBAR_GROUPS.map((group, groupIndex) => (
              <div key={`group-${groupIndex}`} className="obsidian-toolbar-group">
                {group.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={action.active(editor) ? 'is-active' : ''}
                    onClick={() => action.action(editor)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ))}

            <div className="obsidian-toolbar-group obsidian-toolbar-group--utility">
              <button type="button" onClick={() => insertWikiLink(editor)}>
                Wiki Link
              </button>
              <button type="button" onClick={() => insertVaultImage(editor)}>
                Vault Image
              </button>
              <button type="button" onClick={() => editor.chain().focus().unsetLink().run()}>
                Remove Link
              </button>
            </div>
          </div>

          {Object.keys(parsedInput.data).length > 0 ? (
            <div className="obsidian-frontmatter obsidian-frontmatter--editor">
              {Object.entries(parsedInput.data).map(([key, entry]) => (
                <div key={key} className="obsidian-frontmatter__item">
                  <span>{key}</span>
                  <strong>{Array.isArray(entry) ? entry.join(', ') : String(entry)}</strong>
                </div>
              ))}
            </div>
          ) : null}

          <div className="obsidian-editor-stage">
            <EditorContent editor={editor} />
          </div>
        </article>

        <aside className="obsidian-side-panel">
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

          <div className="obsidian-side-card">
            <p className="obsidian-workspace__eyebrow">Round-trip snapshot</p>
            <pre>{value}</pre>
          </div>
        </aside>
      </div>
    </section>
  )
}
