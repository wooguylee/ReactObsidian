# Obsidian React JSON Schema

## Goal

- Keep the editing surface compatible with Obsidian-flavored Markdown.
- Store structured JSON for DB usage without losing the original Markdown.
- Allow reliable round-tripping back to `.md`.

## Primary shape

```json
{
  "schemaVersion": "obsidian-react/v1",
  "storageMode": "structured-json-primary",
  "compatibility": {
    "target": "obsidian-core-markdown",
    "renderer": "react-live-preview"
  },
  "document": {
    "id": "doc-xxxxx",
    "title": "React Obsidian Editor Module",
    "path": "Vault/Product/React Obsidian Editor.md",
    "frontmatter": {},
    "headings": [],
    "tags": [],
    "tasks": [],
    "references": [],
    "blocks": [],
    "source": {
      "markdown": "---...",
      "normalizedMarkdown": "# normalized preview"
    },
    "stats": {
      "wordCount": 0,
      "blockCount": 0
    }
  }
}
```

## DB guidance

- Recommended canonical record: `document.blocks`
- Recommended compatibility snapshot: `document.source.markdown`
- Search / graph usage: `document.headings`, `document.tags`, `document.references`
- Task workflow usage: `document.tasks`

## Round-trip rule

1. Edit Markdown in the module.
2. Derive structured JSON from the Markdown.
3. If the DB is the source for later edits, regenerate Markdown from JSON and preserve unsupported blocks in raw form.
