import { useEffect, useMemo, useRef, useState } from 'react'
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
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import './ObsidianEditor.css'
import { EditorDialog } from './EditorDialog'
import { editorHtmlToMarkdown, markdownToEditorHtml } from './markdownRichText'
import { parseFrontmatter, parseObsidianDocument } from './obsidianSchema'
import { WikiLinkInput } from './WikiLinkInput'

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

const DEFAULT_DIALOG_STATE = {
  mode: null,
  payload: {},
}

const EMPTY_LINK = {
  kind: 'external',
  target: '',
  label: '',
}

const EMPTY_IMAGE = {
  target: '',
  alt: '',
}

const EMPTY_CALLOUT = {
  type: 'note',
  title: 'Note',
}

const EMPTY_TABLE = {
  rows: 3,
  cols: 3,
  withHeaderRow: true,
}

const DEFAULT_BUBBLE_MENU = {
  visible: false,
  left: 0,
  top: 0,
}

function getSelectedText(editor) {
  return editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
}

function getLinkDraft(editor) {
  const selectedText = getSelectedText(editor)
  const attrs = editor.getAttributes('link')
  const href = attrs.href || ''

  if (href.startsWith('wikilink:')) {
    return {
      kind: 'wiki',
      target: decodeURIComponent(href.replace('wikilink:', '')),
      label: selectedText,
    }
  }

  return {
    kind: 'external',
    target: href,
    label: selectedText,
  }
}

function getImageDraft(editor) {
  const attrs = editor.getAttributes('image')
  return {
    target: attrs.src?.replace(/^vault:/, '') || '',
    alt: attrs.alt || '',
  }
}

function getCalloutDraft(editor) {
  const attrs = editor.getAttributes('blockquote')
  return {
    type: attrs.calloutType || 'note',
    title: attrs.calloutTitle || 'Note',
  }
}

function openLink(editor, setDialogState) {
  setDialogState({
    mode: 'link',
    payload: getLinkDraft(editor),
  })
}

function openImage(editor, setDialogState) {
  setDialogState({
    mode: 'image',
    payload: editor.isActive('image') ? getImageDraft(editor) : EMPTY_IMAGE,
  })
}

function openCallout(editor, setDialogState) {
  setDialogState({
    mode: 'callout',
    payload: editor.isActive('blockquote') ? getCalloutDraft(editor) : EMPTY_CALLOUT,
  })
}

function openTable(editor, setDialogState) {
  setDialogState({
    mode: 'table',
    payload: {
      ...EMPTY_TABLE,
      active: editor.isActive('table'),
    },
  })
}

function applyLink(editor, payload) {
  const target = payload.target.trim()
  const label = payload.label.trim()

  if (!target) {
    return
  }

  const href = payload.kind === 'wiki' ? `wikilink:${encodeURIComponent(target)}` : target
  const selectedText = getSelectedText(editor)
  const finalLabel = label || selectedText || target.split('/').pop() || target
  const chain = editor.chain().focus()

  if (selectedText) {
    chain.extendMarkRange('link').setLink({ href }).run()
    return
  }

  chain
    .insertContent({
      type: 'text',
      text: finalLabel,
      marks: [{ type: 'link', attrs: { href } }],
    })
    .run()
}

function applyImage(editor, payload) {
  const target = payload.target.trim()

  if (!target) {
    return
  }

  const attrs = {
    src: `vault:${target}`,
    alt: payload.alt.trim() || target.split('/').pop() || target,
  }

  if (editor.isActive('image')) {
    editor.chain().focus().updateAttributes('image', attrs).run()
    return
  }

  editor.chain().focus().setImage(attrs).run()
}

function applyCallout(editor, payload) {
  const attrs = {
    calloutType: payload.type.trim() || 'note',
    calloutTitle: payload.title.trim() || 'Note',
  }

  if (!editor.isActive('blockquote')) {
    editor.chain().focus().toggleBlockquote().run()
  }

  editor.chain().focus().updateAttributes('blockquote', attrs).run()
}

function removeCallout(editor) {
  if (!editor.isActive('blockquote')) {
    return
  }

  editor.chain().focus().toggleBlockquote().run()
}

function applyTable(editor, payload) {
  if (editor.isActive('table')) {
    return
  }

  editor
    .chain()
    .focus()
    .insertTable({
      rows: Number(payload.rows) || 3,
      cols: Number(payload.cols) || 3,
      withHeaderRow: Boolean(payload.withHeaderRow),
    })
    .run()
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

function ToolbarButton({ active, label, onClick }) {
  return (
    <button type="button" className={active ? 'is-active' : ''} onClick={onClick}>
      {label}
    </button>
  )
}

export function ObsidianEditor({
  value,
  onChange,
  documentPath = 'Vault/Untitled.md',
  placeholder = 'Write as if you are in Obsidian live preview...',
  className = '',
}) {
  const importInputRef = useRef(null)
  const lastMarkdownRef = useRef(value)
  const parsedInput = useMemo(() => parseFrontmatter(value), [value])
  const model = useMemo(() => parseObsidianDocument(value, { documentPath }), [value, documentPath])
  const frontmatterRef = useRef(parsedInput.data)
  const [dialogState, setDialogState] = useState(DEFAULT_DIALOG_STATE)
  const [bubbleMenu, setBubbleMenu] = useState(DEFAULT_BUBBLE_MENU)

  useEffect(() => {
    frontmatterRef.current = parsedInput.data
  }, [parsedInput])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ blockquote: false, heading: { levels: [1, 2, 3] } }),
      Underline,
      CalloutBlockquote,
      Image,
      WikiLinkInput,
      Link.configure({ autolink: true, openOnClick: false, protocols: ['http', 'https', 'wikilink'] }),
      Placeholder.configure({ placeholder }),
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
        class: `obsidian-wysiwyg ${className}`.trim(),
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
    if (!editor || value === lastMarkdownRef.current) {
      return
    }

    const html = markdownToEditorHtml(value)

    if (html !== editor.getHTML()) {
      editor.commands.setContent(html, false)
    }

    lastMarkdownRef.current = value
  }, [editor, value])

  useEffect(() => {
    if (!editor) {
      return undefined
    }

    const updateBubbleMenu = () => {
      const { from, to, empty } = editor.state.selection

      if (empty || !editor.isFocused) {
        setBubbleMenu(DEFAULT_BUBBLE_MENU)
        return
      }

      const start = editor.view.coordsAtPos(from)
      const end = editor.view.coordsAtPos(to)

      setBubbleMenu({
        visible: true,
        left: (start.left + end.right) / 2,
        top: Math.min(start.top, end.top) + window.scrollY - 52,
      })
    }

    const hideBubbleMenu = () => {
      setTimeout(() => {
        if (!editor.isFocused) {
          setBubbleMenu(DEFAULT_BUBBLE_MENU)
        }
      }, 120)
    }

    editor.on('selectionUpdate', updateBubbleMenu)
    editor.on('transaction', updateBubbleMenu)
    editor.on('focus', updateBubbleMenu)
    editor.on('blur', hideBubbleMenu)

    return () => {
      editor.off('selectionUpdate', updateBubbleMenu)
      editor.off('transaction', updateBubbleMenu)
      editor.off('focus', updateBubbleMenu)
      editor.off('blur', hideBubbleMenu)
    }
  }, [editor])

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
    <>
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
          <article className="obsidian-editor-panel obsidian-editor-panel--full">
            <div className="obsidian-editor-panel__toolbar">
              <div className="obsidian-toolbar-group">
                <ToolbarButton
                  label="B"
                  active={editor.isActive('bold')}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                />
                <ToolbarButton
                  label="I"
                  active={editor.isActive('italic')}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                />
                <ToolbarButton
                  label="U"
                  active={editor.isActive('underline')}
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                />
                <ToolbarButton
                  label="S"
                  active={editor.isActive('strike')}
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                />
                <ToolbarButton
                  label="Code"
                  active={editor.isActive('code')}
                  onClick={() => editor.chain().focus().toggleCode().run()}
                />
              </div>

              <div className="obsidian-toolbar-group">
                <ToolbarButton
                  label="H1"
                  active={editor.isActive('heading', { level: 1 })}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                />
                <ToolbarButton
                  label="H2"
                  active={editor.isActive('heading', { level: 2 })}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                />
                <ToolbarButton
                  label="H3"
                  active={editor.isActive('heading', { level: 3 })}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                />
                <ToolbarButton
                  label="Bullet"
                  active={editor.isActive('bulletList')}
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                />
                <ToolbarButton
                  label="Number"
                  active={editor.isActive('orderedList')}
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                />
                <ToolbarButton
                  label="Task"
                  active={editor.isActive('taskList')}
                  onClick={() => editor.chain().focus().toggleTaskList().run()}
                />
              </div>

              <div className="obsidian-toolbar-group obsidian-toolbar-group--utility">
                <button type="button" onClick={() => openLink(editor, setDialogState)}>
                  Link
                </button>
                <button type="button" onClick={() => openCallout(editor, setDialogState)}>
                  Callout
                </button>
                <button type="button" onClick={() => openImage(editor, setDialogState)}>
                  Image
                </button>
                <button type="button" onClick={() => openTable(editor, setDialogState)}>
                  Table
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
              {bubbleMenu.visible ? (
                <div
                  className="obsidian-bubble-menu"
                  style={{ left: `${bubbleMenu.left}px`, top: `${bubbleMenu.top}px` }}
                >
                  <ToolbarButton
                    label="B"
                    active={editor.isActive('bold')}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                  />
                  <ToolbarButton
                    label="I"
                    active={editor.isActive('italic')}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                  />
                  <ToolbarButton
                    label="U"
                    active={editor.isActive('underline')}
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                  />
                  <ToolbarButton
                    label="Wiki"
                    active={Boolean(editor.getAttributes('link').href?.startsWith('wikilink:'))}
                    onClick={() => openLink(editor, setDialogState)}
                  />
                  <ToolbarButton
                    label="Link"
                    active={editor.isActive('link')}
                    onClick={() => openLink(editor, setDialogState)}
                  />
                </div>
              ) : null}

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

      <EditorDialog
        open={dialogState.mode === 'link'}
        title="Insert or Edit Link"
        description="Create an external URL or an Obsidian wikilink from the current selection."
        confirmLabel="Apply Link"
        onClose={() => setDialogState(DEFAULT_DIALOG_STATE)}
        onConfirm={() => {
          applyLink(editor, dialogState.payload)
          setDialogState(DEFAULT_DIALOG_STATE)
        }}
      >
        <label className="obsidian-field">
          <span>Link type</span>
          <select
            value={dialogState.payload.kind || EMPTY_LINK.kind}
            onChange={(event) =>
              setDialogState((current) => ({
                ...current,
                payload: { ...current.payload, kind: event.target.value },
              }))
            }
          >
            <option value="external">External URL</option>
            <option value="wiki">Obsidian Wiki Link</option>
          </select>
        </label>
        <label className="obsidian-field">
          <span>{dialogState.payload.kind === 'wiki' ? 'Note path' : 'URL'}</span>
          <input
            value={dialogState.payload.target || ''}
            onChange={(event) =>
              setDialogState((current) => ({
                ...current,
                payload: { ...current.payload, target: event.target.value },
              }))
            }
          />
        </label>
        <label className="obsidian-field">
          <span>Label</span>
          <input
            value={dialogState.payload.label || ''}
            onChange={(event) =>
              setDialogState((current) => ({
                ...current,
                payload: { ...current.payload, label: event.target.value },
              }))
            }
          />
        </label>
      </EditorDialog>

      <EditorDialog
        open={dialogState.mode === 'image'}
        title="Insert Vault Image"
        description="Attach an Obsidian-style vault image and show it directly inside the editor surface."
        confirmLabel="Apply Image"
        onClose={() => setDialogState(DEFAULT_DIALOG_STATE)}
        onConfirm={() => {
          applyImage(editor, dialogState.payload)
          setDialogState(DEFAULT_DIALOG_STATE)
        }}
      >
        <label className="obsidian-field">
          <span>Vault path</span>
          <input
            value={dialogState.payload.target || ''}
            onChange={(event) =>
              setDialogState((current) => ({
                ...current,
                payload: { ...current.payload, target: event.target.value },
              }))
            }
          />
        </label>
        <label className="obsidian-field">
          <span>Image label</span>
          <input
            value={dialogState.payload.alt || ''}
            onChange={(event) =>
              setDialogState((current) => ({
                ...current,
                payload: { ...current.payload, alt: event.target.value },
              }))
            }
          />
        </label>
      </EditorDialog>

      <EditorDialog
        open={dialogState.mode === 'callout'}
        title="Configure Callout"
        description="Turn the current block into an Obsidian-style callout with type and title."
        confirmLabel="Apply Callout"
        secondaryLabel={editor.isActive('blockquote') ? 'Plain Text' : undefined}
        onClose={() => setDialogState(DEFAULT_DIALOG_STATE)}
        onConfirm={() => {
          applyCallout(editor, dialogState.payload)
          setDialogState(DEFAULT_DIALOG_STATE)
        }}
        onSecondaryAction={() => {
          removeCallout(editor)
          setDialogState(DEFAULT_DIALOG_STATE)
        }}
      >
        <label className="obsidian-field">
          <span>Callout type</span>
          <select
            value={dialogState.payload.type || EMPTY_CALLOUT.type}
            onChange={(event) =>
              setDialogState((current) => ({
                ...current,
                payload: { ...current.payload, type: event.target.value },
              }))
            }
          >
            <option value="note">note</option>
            <option value="tip">tip</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="success">success</option>
          </select>
        </label>
        <label className="obsidian-field">
          <span>Title</span>
          <input
            value={dialogState.payload.title || ''}
            onChange={(event) =>
              setDialogState((current) => ({
                ...current,
                payload: { ...current.payload, title: event.target.value },
              }))
            }
          />
        </label>
      </EditorDialog>

      <EditorDialog
        open={dialogState.mode === 'table'}
        title="Table Actions"
        description="Create a table or adjust the currently selected table without leaving the editor."
        confirmLabel={editor.isActive('table') ? 'Done' : 'Insert Table'}
        onClose={() => setDialogState(DEFAULT_DIALOG_STATE)}
        onConfirm={() => {
          applyTable(editor, dialogState.payload)
          setDialogState(DEFAULT_DIALOG_STATE)
        }}
      >
        {!editor.isActive('table') ? (
          <>
            <label className="obsidian-field">
              <span>Rows</span>
              <input
                type="number"
                min="2"
                value={dialogState.payload.rows || EMPTY_TABLE.rows}
                onChange={(event) =>
                  setDialogState((current) => ({
                    ...current,
                    payload: { ...current.payload, rows: Number(event.target.value) },
                  }))
                }
              />
            </label>
            <label className="obsidian-field">
              <span>Columns</span>
              <input
                type="number"
                min="2"
                value={dialogState.payload.cols || EMPTY_TABLE.cols}
                onChange={(event) =>
                  setDialogState((current) => ({
                    ...current,
                    payload: { ...current.payload, cols: Number(event.target.value) },
                  }))
                }
              />
            </label>
            <label className="obsidian-field obsidian-field--checkbox">
              <input
                type="checkbox"
                checked={Boolean(dialogState.payload.withHeaderRow)}
                onChange={(event) =>
                  setDialogState((current) => ({
                    ...current,
                    payload: { ...current.payload, withHeaderRow: event.target.checked },
                  }))
                }
              />
              <span>Use header row</span>
            </label>
          </>
        ) : (
          <div className="obsidian-table-actions">
            <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}>
              Add column
            </button>
            <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()}>
              Add row
            </button>
            <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()}>
              Delete column
            </button>
            <button type="button" onClick={() => editor.chain().focus().deleteRow().run()}>
              Delete row
            </button>
            <button type="button" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
              Toggle header
            </button>
            <button type="button" onClick={() => editor.chain().focus().deleteTable().run()}>
              Delete table
            </button>
          </div>
        )}
      </EditorDialog>
    </>
  )
}
