export const sampleNote = `---
title: React Obsidian Editor Module
aliases:
  - Vault Composer
status: draft
owner: workai
tags:
  - editor
  - obsidian
---

# React Obsidian Editor Module

> [!tip] Design goal
> Keep the Markdown readable anywhere while preserving the blocks Obsidian users expect.

This document is rendered from a React module but stays compatible with Obsidian syntax such as [[Knowledge Base|vault links]], callouts, checklists, tables, and frontmatter.

## Editing scope

- [x] Headings, quotes, code blocks, tables, and task lists
- [x] Obsidian wikilinks and image embeds
- [x] Frontmatter extraction for JSON / DB export
- [ ] Plugin-specific grammars beyond the core target

### Implementation notes

1. Keep the original Markdown as the interoperability snapshot.
2. Build a structured JSON model for search, sync, and analytics.
3. Regenerate ".md" from the JSON model when database-first editing is required.

![[Attachments/editor-wireframe.png]]

| Capability | Strategy |
| --- | --- |
| Visual parity | Live preview styled after an Obsidian reading pane |
| Markdown parity | Preserve canonical Markdown tokens |
| Persistence | Store normalized blocks with metadata |

#### Export policy

> [!note] JSON-first storage
> The JSON export keeps block-level structure as the primary document model and also includes a Markdown snapshot for safe round-tripping back to Obsidian.[^1]

~~~json
{
  "mode": "structured-json-primary",
  "roundTrip": true
}
~~~

Tag references: #editor #vault-sync

[^1]: Round-trip safety matters because Obsidian plugins and user-written Markdown often rely on literal source text.
`
