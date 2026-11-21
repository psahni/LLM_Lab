import { useState, type FormEvent } from 'react'
import { AudioLines, Cpu, FlaskConical, RotateCcw, ScanLine } from 'lucide-react'
import { examples } from './lab'

const samplePrompts = {
  reference: examples[0],
  first: 'Which city is France’s capital?',
  second: 'Why is the sky blue?',
}

const fields = [
  { key: 'reference', label: 'Reference prompt' },
  { key: 'first', label: 'Comparison A' },
  { key: 'second', label: 'Comparison B', optional: true },
] as const

type Result = { model: string; embeddings: number[][] }

function cosine(a: number[], b: number[]) {
  let dot = 0
  let aSquared = 0
  let bSquared = 0
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index]
    aSquared += a[index] ** 2
    bSquared += b[index] ** 2
  }
  return Math.max(-1, Math.min(1, dot / Math.sqrt(aSquared * bSquared)))
}

export function EmbeddingsView({ prompt }: { prompt: string }) {
  const [draft, setDraft] = useState(samplePrompts)
  const [result, setResult] = useState<Result | null>(null)
  const [selected, setSelected] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const vector = result?.embeddings[selected]
  const preview = vector?.slice(0, 12) ?? []
  const peak = Math.max(0.0001, ...preview.map(Math.abs))
  const scores = result?.embeddings.slice(1).map((candidate) => cosine(result.embeddings[0], candidate)) ?? []
  const best = Math.max(...scores.map((score) => Number(score.toFixed(3))))
  const tied = scores.filter((score) => Number(score.toFixed(3)) === best).length > 1

  function edit(next: typeof samplePrompts) {
    setDraft(next)
    setResult(null)
    setSelected(0)
    setError('')
  }

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !draft.reference.trim() || !draft.first.trim()) return
    setPending(true)
    setResult(null)
    setSelected(0)
    setError('')

    try {
      const prompts = [draft.reference, draft.first]
      if (draft.second.trim()) prompts.push(draft.second)
      const response = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data) throw new Error(data?.error || 'The lab could not generate embeddings.')
      setResult(data)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The lab could not generate embeddings.')
    } finally {
      setPending(false)
    }
  }

  return <>
    <form className="card content-card" onSubmit={(event) => void compare(event)}>
      <div className="section-heading embedding-heading">
        <span className="section-icon"><FlaskConical size={19} /></span>
        <div><h2>Compare prompts</h2><p>Compare each prompt with the reference.</p></div>
        <span className="top-model push embedding-model"><Cpu size={14} /><span>{result?.model ?? 'all-minilm'}</span></span>
      </div>
      <div className="embedding-fields">
        {fields.map(({ key, label, ...field }) => <div key={key} className={key === 'reference' ? 'embedding-reference' : undefined}>
          <div className="embedding-field-label">
            <label className="field-label" htmlFor={`embedding-${key}`}>{label}{'optional' in field && <small>Optional</small>}</label>
            {key === 'reference' && <button type="button" className="embedding-use-prompt" disabled={pending || !prompt.trim() || draft.reference === prompt} onClick={() => edit({ ...draft, reference: prompt })}>Use lab prompt</button>}
          </div>
          <textarea id={`embedding-${key}`} required={key !== 'second'} value={draft[key]}
            disabled={pending} onChange={(event) => edit({ ...draft, [key]: event.target.value })} />
        </div>)}
      </div>
      <div className="run-footer">
        <button type="button" className="button quiet" disabled={pending} onClick={() => edit(samplePrompts)}><RotateCcw size={15} /> Reset example</button>
        <button type="submit" className="button primary" disabled={pending || !draft.reference.trim() || !draft.first.trim()}><AudioLines size={17} /> {pending ? 'Computing embeddings…' : 'Compare embeddings'}</button>
      </div>
      <span className="sr-only" role="status">{pending ? 'Computing embeddings' : result ? 'Embeddings ready' : ''}</span>
      {error && <p className="notice warning embedding-error" role="alert">{error}</p>}
    </form>

    {result && vector && <>
      <section className="card content-card">
        <div className="section-heading">
          <span className="section-icon"><AudioLines size={19} /></span>
          <div><h2>Cosine similarity</h2><p>Higher scores mean the vectors point in more similar directions.</p></div>
        </div>
        <div className="similarity-rows">
          {scores.map((score, index) => {
            const closer = scores.length === 2 && !tied && Number(score.toFixed(3)) === best
            return <div className="similarity-row" key={index}>
              <div className="similarity-label"><strong>Comparison {index === 0 ? 'A' : 'B'} <span>vs reference</span></strong>{closer && <span className="similarity-badge">Closer match</span>}<output>{score.toFixed(3)}</output></div>
              <div className="similarity-track" aria-hidden="true">
                <i style={{ left: `${50 + Math.min(0, score * 50)}%`, width: `${Math.abs(score) * 50}%` }} />
              </div>
            </div>
          })}
          <div className="similarity-axis" aria-hidden="true"><span>−1</span><span>0</span><span>+1</span></div>
        </div>
        {tied && <p className="subtle-note">The comparisons tie at three decimal places.</p>}
      </section>
      <section className="card content-card">
        <div className="section-heading">
          <span className="section-icon"><ScanLine size={19} /></span>
          <div><h2>Vector preview</h2><p>First {preview.length} of {vector.length} dimensions. Similarity uses the full vectors.</p></div>
        </div>
        <div className="vector-picker" role="group" aria-label="Choose a vector to preview">
          {fields.slice(0, result.embeddings.length).map(({ key, label }, index) =>
            <button type="button" key={key} className="button secondary" aria-pressed={selected === index} onClick={() => setSelected(index)}>{key === 'reference' ? 'Reference' : label}</button>)}
        </div>
        <ol className="vector-grid" aria-label="Embedding dimensions">
          {preview.map((value, index) => <li key={index} style={{
            backgroundColor: value < 0 ? `rgb(81 69 207 / ${0.05 + 0.14 * Math.abs(value) / peak})` : `rgb(17 151 118 / ${0.05 + 0.14 * Math.abs(value) / peak})`,
          }}>
            <span>#{index + 1}</span>
            <code title={String(value)}>{value.toFixed(4)}</code>
          </li>)}
        </ol>
      </section>
    </>}
  </>
}
