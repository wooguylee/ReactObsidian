import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

function basename(value) {
  return value.split('#')[0].split('/').pop() || value
}

export const WikiLinkInput = Extension.create({
  name: 'wikiLinkInput',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('wikiLinkInput'),
        appendTransaction: (_, __, newState) => {
          const { selection, schema } = newState

          if (!selection.empty || !schema.marks.link) {
            return null
          }

          const parent = selection.$from.parent

          if (!parent.isTextblock || parent.type.spec.code) {
            return null
          }

          const textBefore = parent.textBetween(Math.max(0, selection.$from.parentOffset - 280), selection.$from.parentOffset, '', '')
          const match = textBefore.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/)

          if (!match) {
            return null
          }

          const [, rawTarget, rawLabel] = match
          const target = rawTarget.trim()
          const label = (rawLabel || basename(target)).trim()
          const start = selection.from - match[0].length

          if (start < 0) {
            return null
          }

          const tr = newState.tr
          tr.insertText(label, start, selection.from)
          tr.addMark(start, start + label.length, schema.marks.link.create({ href: `wikilink:${encodeURIComponent(target)}` }))
          tr.setSelection(selection.constructor.near(tr.doc.resolve(start + label.length)))

          return tr
        },
      }),
    ]
  },
})
