import { useState } from 'react'
import {
  ArrowRight, Braces, Check,
  Clipboard, Grid3X3, Play, RotateCcw, SlidersHorizontal, Square, Zap,
} from 'lucide-react'
import { EmptyState } from './EmptyState'
import { ResponseTokens } from './ResponseTokens'
import { pieces, responseText, visibleToken, type Run, type Settings } from './lab'

export function TokenizeView({ settings, run }: { settings: Settings; run: Run | null }) {
  const tokens = pieces(settings.prompt)
  const metadata = run?.prompt === settings.prompt && run.model === settings.model ? run.metrics?.prompt_eval_count : undefined

  return <section className="card content-card">
    <div className="section-heading">
      <span className="section-icon"><Braces size={19} /></span>
      <div><h2>Prompt pieces</h2><p>Hover or focus a piece to see its position.</p></div>
    </div>
    <div className="chips" aria-label="Estimated prompt pieces">
      {tokens.length ? tokens.map((token, index) => (
        <span className="chip-wrap" key={index}>
          <span className={`token-chip tone-${index % 4}`} tabIndex={0} aria-label={`Piece ${index + 1}: ${visibleToken(token)}`}>{visibleToken(token)}</span>
          <span className="chip-index" aria-hidden="true">Piece {index + 1}</span>
        </span>
      )) : <p>Enter a prompt to see its estimated pieces.</p>}
    </div>
    <div className="subtle-note">
      <strong>{metadata ?? tokens.length} {metadata === undefined ? 'estimated tokens' : 'prompt tokens reported by Ollama'}</strong>
      <p>{metadata === undefined
        ? 'The chips use an estimated split. The exact pieces depend on the model’s tokenizer.'
        : 'Ollama reports a count for the full formatted prompt, which can include chat-template tokens. The chips still use an estimated split.'}</p>
      <p><code>␣</code> represents a space and <code>↵</code> represents a line break.</p>
    </div>
  </section>
}

export function GenerateView({ current, previous, error, canRegenerate, onRegenerate, onStop, onPrompt, onPredict, onSettings }: {
  current: Run | null; previous: Run | null; error: string; canRegenerate: boolean
  onRegenerate: () => void; onStop: () => void; onPrompt: () => void; onPredict: (position?: number) => void; onSettings: () => void
}) {
  const [copyStatus, setCopyStatus] = useState<{ text: string; label: string } | null>(null)
  if (!current) return <EmptyState icon={<Zap size={22} />} title="Ready to generate"
    action={<button className="button primary" onClick={onPrompt}><Play size={16} /> Go to prompt</button>}>
    Run a prompt to watch Ollama build the response.
  </EmptyState>

  const { phase, parts, metrics } = current
  const active = phase === 'streaming'
  const response = responseText(current)
  const seconds = metrics?.eval_duration != null ? metrics.eval_duration / 1e9 : undefined
  const rate = seconds && metrics?.eval_count != null ? metrics.eval_count / seconds : undefined
  const status = { streaming: 'Streaming', complete: 'Complete', stopped: 'Stopped', error: 'Interrupted' }[phase]

  async function copy() {
    try {
      await navigator.clipboard.writeText(response)
      setCopyStatus({ text: response, label: 'Copied' })
    } catch {
      setCopyStatus({ text: response, label: 'Copy unavailable. Select the response to copy it.' })
    }
  }

  return <>
    <section className="card content-card">
      <div className="section-heading">
        <span className="section-icon"><Zap size={19} /></span>
        <div><h2>Model response</h2><p>{current.model} <span className="meta-dot">·</span> Temperature {current.temperature.toFixed(1)}</p></div>
        <span className={`phase phase-${phase}`} role="status">{status}</span>
      </div>
      <div className="context-box"><span className="eyebrow">Prompt</span><p>{current.prompt}</p></div>
      <div className="response-box" aria-label="Generated response" aria-busy={active}>
        <ResponseTokens parts={parts} onSelect={onPredict} />
        {!parts.length && <span className="response-placeholder">{active ? 'Waiting for the first token…' : 'No response text received.'}</span>}
        {active && <span className="cursor" aria-hidden="true" />}
      </div>
      {parts.some(({ predictionIndex }) => predictionIndex !== undefined) &&
        <p className="response-token-hint">Select an underlined token to see what else the model considered.</p>}
      {error && <p className="notice warning" role="alert">{error}</p>}
      <div className="inline-actions">
        {active ? <button className="button secondary" onClick={onStop}><Square size={15} /> Stop</button>
          : <button className="button secondary" disabled={!canRegenerate} onClick={onRegenerate}><RotateCcw size={15} /> Regenerate</button>}
        <button className="button quiet" disabled={!response} onClick={() => void copy()}>
          {copyStatus?.text === response && copyStatus.label === 'Copied' ? <Check size={16} /> : <Clipboard size={16} />} Copy response
        </button>
        {copyStatus?.text === response && <span className="copy-feedback" role="status">{copyStatus.label}</span>}
        <button className="button primary push" disabled={!current.predictions.length && !response} onClick={() => onPredict()}>Inspect predictions <ArrowRight size={16} /></button>
      </div>
      {metrics && <dl className="metric-grid">
        <div><dt>Prompt tokens</dt><dd>{metrics.prompt_eval_count ?? '—'}</dd></div>
        <div><dt>Generated tokens</dt><dd>{metrics.eval_count ?? '—'}</dd></div>
        <div><dt>Generation duration</dt><dd>{seconds === undefined ? '—' : `${seconds.toFixed(2)} s`}</dd></div>
        <div><dt>Tokens per second</dt><dd>{rate == null ? '—' : rate.toFixed(1)}</dd></div>
      </dl>}
    </section>
    <section className="card content-card">
      <div className="section-heading">
        <span className="section-icon"><SlidersHorizontal size={19} /></span>
        <div><h2>Compare runs</h2><p>{previous ? 'See how the response changed between runs.' : 'Change the temperature and run the same prompt again.'}</p></div>
        <button className="button quiet push" onClick={onSettings}>Open settings <ArrowRight size={15} /></button>
      </div>
      {previous && <div className="comparison-grid grid grid-cols-1 sm:grid-cols-2">
        {[previous, current].map((run, index) => <div key={index} className="context-box">
          <span className="eyebrow">{index === 0 ? 'Previous run' : 'Current run'}</span>
          <p className="compare-meta">{run.model} · Temperature {run.temperature.toFixed(1)}</p>
          {previous.prompt !== current.prompt && <p className="compare-prompt">{run.prompt}</p>}
          <p>{responseText(run) || 'No response text yet.'}</p>
        </div>)}
      </div>}
    </section>
  </>
}

export function AttentionView({ prompt }: { prompt: string }) {
  const all = pieces(prompt)
  const tokens = all.slice(0, 12)
  const [focus, setFocus] = useState<number | null>(null)
  const selected = Math.min(focus ?? (tokens.length - 1), tokens.length - 1)
  const legend = 'Illustrative attention pattern — simplified for teaching; not the model’s real internal attention weights.'

  return <section className="card content-card">
    <div className="section-heading">
      <span className="section-icon"><Grid3X3 size={19} /></span>
      <div><h2>Conceptual attention heatmap</h2><p>{legend}</p></div>
    </div>
    {tokens.length ? <>
      <div className="attention-controls">
        <label htmlFor="attention-focus">Focus token</label>
        <select id="attention-focus" value={selected} onChange={(event) => setFocus(Number(event.target.value))}>
          {tokens.map((token, index) => <option key={index} value={index}>{index + 1}. {visibleToken(token)}</option>)}
        </select>
      </div>
      <div className="heatmap-scroll">
        <table className="heatmap">
          <caption>Tokens receiving attention →</caption>
          <thead><tr><th scope="col">From ↓</th>{tokens.map((token, index) =>
            <th scope="col" key={index} title={visibleToken(token)}>{visibleToken(token).slice(0, 9)}</th>)}</tr></thead>
          <tbody>{tokens.map((token, row) => <tr key={row} className={row === selected ? 'focus-row' : ''}>
            <th scope="row" title={visibleToken(token)}>{visibleToken(token).slice(0, 9)}</th>
            {tokens.map((_, col) => {
              const score = col > row ? 0 : Math.max(.16, .86 - (row - col) * .22, col === 0 ? .47 : 0)
              return <td key={col} className={col > row ? 'masked' : ''} style={score ? { background: `rgba(79, 70, 229, ${score})` } : undefined}
                title={col > row ? 'Future token · masked' : `Illustrative intensity ${Math.round(score * 100)} / 100`}>
                <span className="sr-only">{col > row ? 'Masked' : `Illustrative intensity ${Math.round(score * 100)}`}</span>
              </td>
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <div className="heatmap-legend"><span>Less attention</span><i /><span>More attention</span><span className="masked-key"><i /> Future token</span></div>
      <p className="subtle-note">Uses {all.length > tokens.length ? `the first ${tokens.length}` : `${tokens.length}`} estimated prompt pieces. Darker cells show stronger illustrative attention.</p>
    </> : <p className="subtle-note">Enter a prompt to try the example.</p>}
  </section>
}
