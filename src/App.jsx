import { useMemo, useState } from 'react'
import './App.css'
import {
  ObsidianEditor,
  OBSIDIAN_EXPORT_NOTES,
  OBSIDIAN_SCHEMA_FIELDS,
  parseObsidianDocument,
} from './modules/obsidian'
import { sampleNote } from './modules/obsidian/sampleNote'

function App() {
  const [markdown, setMarkdown] = useState(sampleNote)

  const documentModel = useMemo(
    () =>
      parseObsidianDocument(markdown, {
        documentPath: 'Vault/Product/React Obsidian Editor.md',
      }),
    [markdown],
  )

  return (
    <main className="app-shell">
      <section className="app-shell__hero">
        <div>
          <p className="eyebrow">React Obsidian Module</p>
          <h1>옵시디언과 왕복 가능한 React 편집 모듈</h1>
          <p className="hero-copy">
            핵심 Markdown, wikilink, callout, frontmatter를 기준으로 동일한
            `.md` 표현과 JSON/DB 저장 규격을 함께 설계했습니다.
          </p>
        </div>

        <div className="hero-metrics">
          <article>
            <strong>{documentModel.document.blocks.length}</strong>
            <span>구조화 블록</span>
          </article>
          <article>
            <strong>{documentModel.document.references.length}</strong>
            <span>링크/미디어 참조</span>
          </article>
          <article>
            <strong>{documentModel.document.tasks.length}</strong>
            <span>체크리스트 항목</span>
          </article>
        </div>
      </section>

      <ObsidianEditor
        value={markdown}
        onChange={setMarkdown}
        documentPath="Vault/Product/React Obsidian Editor.md"
      />

      <section className="info-grid">
        <article className="info-card">
          <p className="info-card__label">JSON / DB 규격</p>
          <h2>구조화 JSON 중심 저장</h2>
          <ul>
            {OBSIDIAN_SCHEMA_FIELDS.map((field) => (
              <li key={field.name}>
                <code>{field.name}</code>
                <span>{field.description}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="info-card">
          <p className="info-card__label">Round-trip 정책</p>
          <h2>Obsidian 표시 호환 기준</h2>
          <ul>
            {OBSIDIAN_EXPORT_NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="json-panel">
        <div className="json-panel__header">
          <div>
            <p className="eyebrow">Live Export</p>
            <h2>DB 저장용 JSON 미리보기</h2>
          </div>
          <span>{documentModel.schemaVersion}</span>
        </div>

        <pre>{JSON.stringify(documentModel, null, 2)}</pre>
      </section>
    </main>
  )
}

export default App
