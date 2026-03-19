import { unified } from 'unified'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|flac)$/i
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v)$/i
const TAG_PATTERN = /(^|\s)#([\p{L}\p{N}_/-]+)/gu

export const OBSIDIAN_SCHEMA_FIELDS = [
  {
    name: 'schemaVersion',
    description: '문서 규격 버전. 마이그레이션 기준점으로 사용합니다.',
  },
  {
    name: 'document.frontmatter',
    description: 'YAML frontmatter를 그대로 구조화해 저장합니다.',
  },
  {
    name: 'document.blocks',
    description: '헤더, 리스트, 표, 코드블록 등 블록 단위 구조입니다.',
  },
  {
    name: 'document.references',
    description: 'wikilink, 외부 링크, 미디어 임베드 참조 목록입니다.',
  },
  {
    name: 'document.tasks',
    description: '체크리스트만 별도 추출해 워크플로우 데이터로 사용합니다.',
  },
  {
    name: 'document.source.markdown',
    description: 'Obsidian round-trip을 위한 원문 스냅샷입니다.',
  },
]

export const OBSIDIAN_EXPORT_NOTES = [
  '저장 단위는 구조화 JSON이지만 원본 Markdown 스냅샷을 함께 유지합니다.',
  'wikilink와 callout 같은 Obsidian 확장은 별도 타입으로 추출합니다.',
  '렌더링은 Obsidian 읽기 화면과 유사한 표현을 우선하되, 저장 포맷은 순수 `.md`를 유지합니다.',
  '플러그인 고유 문법은 JSON에 raw block으로 남겨 확장 가능하게 설계합니다.',
]

function parseScalar(value) {
  const trimmed = value.trim()

  if (trimmed === 'true') {
    return true
  }

  if (trimmed === 'false') {
    return false
  }

  if (trimmed === 'null') {
    return null
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }

  return trimmed.replace(/^['"]|['"]$/g, '')
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) {
    return { data: {}, content: markdown }
  }

  const lines = markdown.split(/\r?\n/)
  const data = {}
  let index = 1

  while (index < lines.length) {
    const line = lines[index]

    if (line.trim() === '---') {
      return {
        data,
        content: lines.slice(index + 1).join('\n'),
      }
    }

    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)

    if (!pair) {
      index += 1
      continue
    }

    const [, key, rawValue] = pair

    if (!rawValue.trim()) {
      const items = []
      index += 1

      while (index < lines.length) {
        const listMatch = lines[index].match(/^\s*[-*]\s+(.*)$/)

        if (!listMatch) {
          break
        }

        items.push(parseScalar(listMatch[1]))
        index += 1
      }

      data[key] = items
      continue
    }

    data[key] = parseScalar(rawValue)
    index += 1
  }

  return { data, content: markdown }
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function hashString(value) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return `doc-${Math.abs(hash).toString(36)}`
}

function toPlainText(node) {
  if (!node) {
    return ''
  }

  if (typeof node.value === 'string') {
    return node.value
  }

  if (!Array.isArray(node.children)) {
    return ''
  }

  return node.children.map((child) => toPlainText(child)).join('')
}

function collectInlineTags(text, tagSet) {
  for (const match of text.matchAll(TAG_PATTERN)) {
    tagSet.add(match[2])
  }
}

function getReferenceType(url) {
  if (url.startsWith('wikilink:')) {
    return 'wikilink'
  }

  if (url.startsWith('vault:')) {
    if (IMAGE_EXTENSIONS.test(url)) {
      return 'image'
    }

    if (AUDIO_EXTENSIONS.test(url)) {
      return 'audio'
    }

    if (VIDEO_EXTENSIONS.test(url)) {
      return 'video'
    }

    return 'attachment'
  }

  if (url.startsWith('#')) {
    return 'anchor'
  }

  return 'external'
}

function inferBlockType(blockMarkdown) {
  const firstLine = blockMarkdown.split(/\r?\n/)[0]?.trim() ?? ''

  if (/^#{1,6}\s+/.test(firstLine)) {
    return 'heading'
  }

  if (/^>\s*\[![^\]]+\]/.test(firstLine)) {
    return 'callout'
  }

  if (/^>\s+/.test(firstLine)) {
    return 'blockquote'
  }

  if (/^```/.test(firstLine)) {
    return 'code'
  }

  if (/^\|/.test(firstLine)) {
    return 'table'
  }

  if (/^!\[\[/.test(firstLine) || /^!\[[^\]]*\]\([^)]+\)/.test(firstLine)) {
    return 'media'
  }

  if (/^(?:[-*+]\s+\[[ xX]\]|\d+\.\s+\[[ xX]\])/.test(firstLine)) {
    return 'task-list'
  }

  if (/^(?:[-*+]\s+|\d+\.\s+)/.test(firstLine)) {
    return 'list'
  }

  return 'paragraph'
}

function inferBlockMeta(type, blockMarkdown) {
  if (type === 'heading') {
    const match = blockMarkdown.match(/^(#{1,6})\s+(.+)$/)
    return {
      depth: match?.[1].length ?? 1,
      title: match?.[2] ?? blockMarkdown,
    }
  }

  if (type === 'callout') {
    const match = blockMarkdown.match(/^>\s*\[!([^\]]+)\]\s*(.*)$/m)
    return {
      calloutType: match?.[1]?.toLowerCase() ?? 'note',
      title: match?.[2] || null,
    }
  }

  if (type === 'code') {
    const match = blockMarkdown.match(/^```([^\n]*)/)
    return {
      language: match?.[1]?.trim() || 'plain',
    }
  }

  return null
}

function splitBlocks(markdown) {
  const lines = markdown.split(/\r?\n/)
  const blocks = []
  let lineIndex = 0

  while (lineIndex < lines.length) {
    if (!lines[lineIndex].trim()) {
      lineIndex += 1
      continue
    }

    const start = lineIndex
    let end = lineIndex
    const line = lines[lineIndex]

    if (/^```/.test(line)) {
      end += 1
      while (end < lines.length && !/^```/.test(lines[end])) {
        end += 1
      }
      end = Math.min(end + 1, lines.length)
    } else if (/^>/.test(line)) {
      end += 1
      while (end < lines.length && (lines[end].startsWith('>') || !lines[end].trim())) {
        end += 1
      }
    } else if (/^\|/.test(line) && /^\|?\s*[-:| ]+\|?\s*$/.test(lines[end + 1] ?? '')) {
      end += 2
      while (end < lines.length && lines[end].startsWith('|')) {
        end += 1
      }
    } else if (/^(?:[-*+]\s+|\d+\.\s+)/.test(line)) {
      end += 1
      while (end < lines.length && /^(?:\s{2,})?(?:[-*+]\s+|\d+\.\s+|$)/.test(lines[end])) {
        if (!lines[end].trim()) {
          break
        }
        end += 1
      }
    } else {
      end += 1
      while (end < lines.length && lines[end].trim()) {
        end += 1
      }
    }

    const blockMarkdown = lines.slice(start, end).join('\n')
    const type = inferBlockType(blockMarkdown)

    blocks.push({
      id: `block-${blocks.length + 1}`,
      type,
      markdown: blockMarkdown,
      lineStart: start + 1,
      lineEnd: end,
      meta: inferBlockMeta(type, blockMarkdown),
    })

    lineIndex = end
  }

  return blocks
}

function buildProcessor() {
  return unified().use(remarkParse).use(remarkGfm)
}

export function normalizeObsidianMarkdown(markdown) {
  return markdown
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
      const cleanTarget = target.trim()
      const fallbackLabel = label?.trim() || cleanTarget.split('/').pop() || cleanTarget

      if (IMAGE_EXTENSIONS.test(cleanTarget)) {
        return `![${fallbackLabel}](vault:${cleanTarget})`
      }

      return `> [!embed] ${fallbackLabel}\n> [[${cleanTarget}]]`
    })
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
      const cleanTarget = target.trim()
      const fallbackLabel = label?.trim() || cleanTarget.split('#')[0].split('/').pop() || cleanTarget
      return `[${fallbackLabel}](wikilink:${encodeURIComponent(cleanTarget)})`
    })
}

export function parseObsidianDocument(markdown, options = {}) {
  const parsed = parseFrontmatter(markdown)
  const bodyMarkdown = parsed.content.trim()
  const normalizedMarkdown = normalizeObsidianMarkdown(bodyMarkdown)
  const tree = buildProcessor().parse(normalizedMarkdown)
  const tagSet = new Set(
    Array.isArray(parsed.data.tags)
      ? parsed.data.tags
      : typeof parsed.data.tags === 'string'
        ? [parsed.data.tags]
        : [],
  )
  const headings = []
  const references = []
  const tasks = []

  visit(tree, (node) => {
    if (node.type === 'heading') {
      const text = toPlainText(node).trim()
      headings.push({
        depth: node.depth,
        text,
        slug: slugify(text),
      })
    }

    if (node.type === 'paragraph' || node.type === 'listItem' || node.type === 'blockquote') {
      collectInlineTags(toPlainText(node), tagSet)
    }

    if (node.type === 'link') {
      const url = node.url ?? ''
      const decodedUrl = url.startsWith('wikilink:')
        ? decodeURIComponent(url.replace('wikilink:', ''))
        : url

      references.push({
        type: getReferenceType(url),
        target: decodedUrl,
        label: toPlainText(node).trim() || decodedUrl,
      })
    }

    if (node.type === 'image') {
      const url = node.url ?? ''
      references.push({
        type: getReferenceType(url),
        target: url.replace(/^vault:/, ''),
        label: node.alt || url,
      })
    }

    if (node.type === 'listItem' && typeof node.checked === 'boolean') {
      tasks.push({
        text: toPlainText(node).trim(),
        checked: node.checked,
      })
    }
  })

  const title =
    parsed.data.title || headings[0]?.text || options.documentPath?.split('/').pop()?.replace(/\.md$/, '') || 'Untitled'

  return {
    schemaVersion: 'obsidian-react/v1',
    storageMode: 'structured-json-primary',
    compatibility: {
      target: 'obsidian-core-markdown',
      renderer: 'react-live-preview',
    },
    document: {
      id: hashString(`${options.documentPath || 'untitled'}:${markdown}`),
      title,
      path: options.documentPath || null,
      frontmatter: parsed.data,
      headings,
      tags: Array.from(tagSet),
      tasks,
      references,
      blocks: splitBlocks(bodyMarkdown),
      source: {
        markdown,
        normalizedMarkdown,
      },
      stats: {
        wordCount: bodyMarkdown.split(/\s+/).filter(Boolean).length,
        blockCount: splitBlocks(bodyMarkdown).length,
      },
    },
  }
}
