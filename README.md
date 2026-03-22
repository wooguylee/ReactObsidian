# React Obsidian WYSIWYG

Obsidian-friendly React editor module with live WYSIWYG editing, Markdown round-trip output, and JSON export helpers.

## Features

- Live WYSIWYG editing surface instead of raw textarea editing
- Selection bubble menu like blog editors
- `[[wikilink]]` auto-conversion while typing
- Dialog-based insert/edit flows for link, callout, image, and table
- Markdown export compatible with core Obsidian-style content
- Structured JSON parser for DB persistence

## Install

```bash
npm install react-obsidian-wysiwyg
```

Peer dependencies:

```bash
npm install react react-dom
```

## Usage

```jsx
import { useState } from 'react'
import { ObsidianEditor, parseObsidianDocument } from 'react-obsidian-wysiwyg'

const initialValue = `---
title: Product Note
tags:
  - docs
---

# Product Note

Type here and use the toolbar or bubble menu.`

export default function Example() {
  const [value, setValue] = useState(initialValue)
  const parsed = parseObsidianDocument(value, {
    documentPath: 'Vault/Product Note.md',
  })

  return (
    <div>
      <ObsidianEditor
        value={value}
        onChange={setValue}
        documentPath="Vault/Product Note.md"
      />

      <pre>{JSON.stringify(parsed, null, 2)}</pre>
    </div>
  )
}
```

## Exported API

- `ObsidianEditor`
- `parseObsidianDocument`
- `parseFrontmatter`
- `normalizeObsidianMarkdown`
- `markdownToEditorHtml`
- `editorHtmlToMarkdown`

## Local development

```bash
npm install
npm run dev
```

Build demo app:

```bash
npm run build
```

Build reusable library:

```bash
npm run build:lib
```
