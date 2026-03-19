import { marked } from 'marked'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { normalizeObsidianMarkdown, parseFrontmatter } from './obsidianSchema'

function escapeAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function basename(value) {
  return value.split('/').pop() || value
}

function prefixBlockquote(content) {
  const lines = content.split('\n')
  return lines.map((line) => `> ${line}`).join('\n')
}

function transformCalloutBlocks(markdown) {
  const lines = markdown.split(/\r?\n/)
  const result = []
  let index = 0

  while (index < lines.length) {
    const match = lines[index].match(/^>\s*\[!([^\]]+)\]\s*(.*)$/)

    if (!match) {
      result.push(lines[index])
      index += 1
      continue
    }

    const [, type, rawTitle] = match
    const bodyLines = []
    index += 1

    while (index < lines.length) {
      if (lines[index].startsWith('>')) {
        bodyLines.push(lines[index].replace(/^>\s?/, ''))
        index += 1
        continue
      }

      if (!lines[index].trim()) {
        bodyLines.push('')
        index += 1
        continue
      }

      break
    }

    const title = rawTitle.trim() || type
    const bodyHtml = marked.parse(bodyLines.join('\n').trim(), { gfm: true, breaks: true })

    result.push(
      `<blockquote data-callout-type="${escapeAttribute(type.toLowerCase())}" data-callout-title="${escapeAttribute(title)}">${bodyHtml}</blockquote>`,
    )
  }

  return result.join('\n')
}

function convertTaskLists(html) {
  const documentFragment = new DOMParser().parseFromString(html, 'text/html')

  documentFragment.querySelectorAll('li').forEach((item) => {
    const checkbox = item.querySelector(':scope > input[type="checkbox"]')

    if (!checkbox) {
      return
    }

    item.setAttribute('data-type', 'taskItem')
    item.setAttribute('data-checked', checkbox.hasAttribute('checked') ? 'true' : 'false')
    item.closest('ul')?.setAttribute('data-type', 'taskList')
    checkbox.remove()
  })

  documentFragment.querySelectorAll('a[href^="wikilink:"]').forEach((link) => {
    link.setAttribute('data-internal-link', 'true')
  })

  documentFragment.querySelectorAll('img[src^="vault:"]').forEach((image) => {
    image.setAttribute('data-vault-image', 'true')
  })

  return documentFragment.body.innerHTML
}

function buildFrontmatter(data) {
  const entries = Object.entries(data || {})

  if (!entries.length) {
    return ''
  }

  const lines = ['---']

  entries.forEach(([key, value]) => {
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      value.forEach((item) => lines.push(`  - ${item}`))
      return
    }

    lines.push(`${key}: ${value}`)
  })

  lines.push('---', '')
  return lines.join('\n')
}

export function markdownToEditorHtml(markdown) {
  const { content } = parseFrontmatter(markdown)
  const normalized = normalizeObsidianMarkdown(content.trim())
  const withCallouts = transformCalloutBlocks(normalized)
  const html = marked.parse(withCallouts, { gfm: true, breaks: true })
  return convertTaskLists(html)
}

export function editorHtmlToMarkdown(html, frontmatter) {
  const turndown = new TurndownService({
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
    headingStyle: 'atx',
  })

  turndown.use(gfm)

  turndown.addRule('internalLinks', {
    filter(node) {
      return node.nodeName === 'A' && node.getAttribute('href')?.startsWith('wikilink:')
    },
    replacement(content, node) {
      const target = decodeURIComponent(node.getAttribute('href').replace('wikilink:', ''))
      const label = content.trim()
      return label && label !== basename(target) ? `[[${target}|${label}]]` : `[[${target}]]`
    },
  })

  turndown.addRule('vaultImages', {
    filter(node) {
      return node.nodeName === 'IMG' && node.getAttribute('src')?.startsWith('vault:')
    },
    replacement(_, node) {
      const target = node.getAttribute('src').replace('vault:', '')
      const alt = node.getAttribute('alt')?.trim()
      return alt && alt !== basename(target) ? `![[${target}|${alt}]]` : `![[${target}]]`
    },
  })

  turndown.addRule('callouts', {
    filter(node) {
      return node.nodeName === 'BLOCKQUOTE' && node.getAttribute('data-callout-type')
    },
    replacement(content, node) {
      const type = node.getAttribute('data-callout-type') || 'note'
      const title = node.getAttribute('data-callout-title') || type
      const trimmed = content.trim()
      const body = trimmed ? `\n${prefixBlockquote(trimmed)}` : ''
      return `\n> [!${type}] ${title}${body}\n`
    },
  })

  turndown.addRule('taskItems', {
    filter(node) {
      return node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem'
    },
    replacement(content, node) {
      const checked = node.getAttribute('data-checked') === 'true'
      return `\n- [${checked ? 'x' : ' '}] ${content.trim()}`
    },
  })

  const markdownBody = turndown
    .turndown(html)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')

  return `${buildFrontmatter(frontmatter)}${markdownBody}`.trim()
}
