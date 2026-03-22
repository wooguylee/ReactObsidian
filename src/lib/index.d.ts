import { ComponentType } from 'react'

export interface ObsidianEditorProps {
  value: string
  onChange: (value: string) => void
  documentPath?: string
  placeholder?: string
  className?: string
}

export interface ParsedObsidianDocument {
  schemaVersion: string
  storageMode: string
  compatibility: {
    target: string
    renderer: string
  }
  document: {
    id: string
    title: string
    path: string | null
    frontmatter: Record<string, unknown>
    headings: Array<{ depth: number; text: string; slug: string }>
    tags: string[]
    tasks: Array<{ text: string; checked: boolean }>
    references: Array<{ type: string; target: string; label: string }>
    blocks: Array<{
      id: string
      type: string
      markdown: string
      lineStart: number
      lineEnd: number
      meta: Record<string, unknown> | null
    }>
    source: {
      markdown: string
      normalizedMarkdown: string
    }
    stats: {
      wordCount: number
      blockCount: number
    }
  }
}

export const ObsidianEditor: ComponentType<ObsidianEditorProps>
export const OBSIDIAN_EXPORT_NOTES: string[]
export const OBSIDIAN_SCHEMA_FIELDS: Array<{ name: string; description: string }>
export function normalizeObsidianMarkdown(markdown: string): string
export function parseFrontmatter(markdown: string): {
  data: Record<string, unknown>
  content: string
}
export function parseObsidianDocument(markdown: string, options?: { documentPath?: string }): ParsedObsidianDocument
export function markdownToEditorHtml(markdown: string): string
export function editorHtmlToMarkdown(html: string, frontmatter?: Record<string, unknown>): string
