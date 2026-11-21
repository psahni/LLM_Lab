import { Braces, ChartNoAxesColumnIncreasing, Check, ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState } from './EmptyState'
import { ResponseTokens } from './ResponseTokens'
import { candidateProbabilities, isLogProbability, predictionContext, predictionTokenLabel, sameToken, tokenKind, type Prediction, type Run } from './lab'

const unavailable = 'Ollama did not return token probabilities for this position.'

export default function PredictView({ run, position, setPosition, onPrompt }: {
  run: Run | null; position: number | null; setPosition: (position: number | null) => void; onPrompt: () => void
}) {
  if (!run) return <EmptyState icon={<ChartNoAxesColumnIncreasing size={22} />} title="No predictions yet"
    action={<button className="button primary" onClick={onPrompt}><Play size={16} /> Go to prompt</button>}>
    Run a prompt to inspect the model’s next-token candidates.
  </EmptyState>

  const last = run.predictions.length - 1
  const index = Math.min(position ?? last, last)
  const prediction = run.predictions[index]
  const { prefix, suffix } = predictionContext(run.parts, index)
  const unaligned = prefix === null || suffix === null
  const kind = prediction && tokenKind(prediction.token)
  const hasClickableTokens = run.parts.some(({ predictionIndex }) => predictionIndex !== undefined)

  return <>
    <section className="card content-card">
      <div className="section-heading">
        <span className="section-icon"><Braces size={19} /></span>
        <div><h2>Context for prediction</h2><p>{run.model} <span className="meta-dot">·</span> Temperature {run.temperature.toFixed(1)}</p></div>
      </div>
      <dl className="prediction-context grid grid-cols-1 sm:grid-cols-2">
        <div className="context-box">
          <dt>User prompt</dt><dd className="prediction-text">{run.prompt}</dd>
        </div>
        <div className="context-box">
          <dt>Response prefix available at this step</dt>
          <dd className={prefix ? 'prediction-text' : 'context-placeholder'}>{prefix === null ? 'Prefix unavailable.' : prefix || 'No response tokens generated yet.'}</dd>
        </div>
        <div className="context-box">
          <dt>Selected next token</dt>
          <dd className="prediction-selection">{prediction
            ? <><code className="selected-token-chip">{predictionTokenLabel(prediction.token)}</code>{kind && <small>{kind}</small>}</>
            : <span className="context-placeholder">No recorded token.</span>}</dd>
        </div>
        <div className="context-box later-context">
          <dt>Later output — not available at this step</dt>
          <dd className={suffix ? 'prediction-text' : 'context-placeholder'}>{suffix === null ? 'Later output unavailable.' : suffix || 'No later output.'}</dd>
        </div>
      </dl>
      {unaligned && (prediction || run.parts.length > 0) && <p className="alignment-message" role="status">Exact token alignment unavailable</p>}
      {prediction && <p className="context-explanation">At this step, the model had the prompt and the response prefix. The selected token was generated next; later output was not yet available.</p>}
      <details className="prediction-disclosure">
        <summary>What counts as model input?</summary>
        <p>This view summarizes the visible conversation context. Model-specific chat formatting and any configured system messages may also be part of the input.</p>
      </details>
      {run.parts.length > 0 && <details className="prediction-disclosure" open={unaligned || undefined}>
        <summary>Full response timeline</summary>
        {hasClickableTokens && <p>Choose an underlined token to inspect its prediction. Dimmed text came later.</p>}
        <div className="prediction-timeline" aria-label="Generated response timeline">
          {hasClickableTokens || run.parts.some(({ text }) => text)
            ? <ResponseTokens parts={run.parts} onSelect={setPosition} selected={index} />
            : 'No response text received.'}
        </div>
      </details>}
    </section>
    <section className="card content-card">
      <div className="section-heading">
        <span className="section-icon"><ChartNoAxesColumnIncreasing size={19} /></span>
        <div><h2>Next token</h2><p>{prediction ? `Prediction ${index + 1} of ${last + 1}` : 'No recorded positions'}</p></div>
        {prediction && <div className="pager push">
          <button className="icon-button" aria-label="Previous prediction" onClick={() => setPosition(index - 1)} disabled={index === 0}><ChevronLeft size={18} /></button>
          <button className="icon-button" aria-label="Next prediction" onClick={() => setPosition(index + 1)} disabled={index === last}><ChevronRight size={18} /></button>
          <button className="button quiet" aria-label="Jump to latest prediction" onClick={() => setPosition(null)} disabled={position === null}>Latest</button>
        </div>}
      </div>
      {last > 0 && <input className="prediction-slider" type="range" min={1} max={last + 1} value={index + 1}
        aria-label="Prediction step" aria-valuetext={`Prediction ${index + 1} of ${last + 1}`}
        onChange={(event) => setPosition(Number(event.target.value) - 1)} />}
      {prediction && <div className="chosen-token"><Check size={17} /><span>Selected token</span><code>{predictionTokenLabel(prediction.token)}</code>{kind && <small>{kind}</small>}</div>}
      {prediction ? <ProbabilityChart prediction={prediction} />
        : <p className="subtle-note">{run.phase === 'streaming' ? 'Waiting for Ollama to return token probabilities.' : unavailable}</p>}
    </section>
  </>
}

function probabilityLabel(value: number) {
  return value > 0 && value < 0.01 ? '<0.01%' : `${value.toFixed(2)}%`
}

function ProbabilityChart({ prediction }: { prediction: Prediction }) {
  const rows = candidateProbabilities(prediction).map((candidate, index) => {
    const chosen = sameToken(candidate, prediction)
    return {
      index,
      token: predictionTokenLabel(candidate.token),
      kind: tokenKind(candidate.token),
      relative: candidate.relative,
      probability: candidate.probability,
      logprob: candidate.logprob,
      chosen,
      fill: chosen ? 'var(--accent)' : '#a8acee',
    }
  })
  if (!rows.length) {
    const { logprob } = prediction
    if (!isLogProbability(logprob)) return <p className="subtle-note">{unavailable}</p>
    return <details className="prediction-disclosure">
      <summary>Selected token probability</summary>
      <p>Ollama did not return usable alternative probabilities. Returned log probability <code>{logprob}</code>. Derived probability <code>exp(logprob) = {Math.exp(logprob).toPrecision(5)}</code>.</p>
    </details>
  }

  return <>
    <p className="chart-caption">Relative probabilities within returned candidates</p>
    {!rows.some(({ chosen }) => chosen) && <p className="chart-caption">The selected token falls outside this list.</p>}
    <div className="probability-chart">
      <ResponsiveContainer width="100%" height={rows.length * 26 + 27}>
        <BarChart layout="vertical" data={rows} margin={{ top: 0, right: 60, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="#e6e8f2" strokeDasharray="3 4" />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
          <YAxis type="category" dataKey="index" interval={0} width={106} tickLine={false} axisLine={false} tick={({ x, y, payload }) => {
            const row = rows[Number(payload.value)]
            if (!row) return <g />
            const label = row.token.length > 12 ? `${row.token.slice(0, 11)}…` : row.token
            return <text x={Number(x) - 6} y={y} dy="0.35em" textAnchor="end" fill={row.chosen ? 'var(--accent)' : '#535c72'} fontFamily="IBM Plex Mono" fontSize={13} fontWeight={row.chosen ? 600 : 400}>{label}</text>
          }} />
          <Tooltip cursor={{ fill: '#f3f4fb' }} content={({ active, payload }) => {
            const row = payload?.[0]?.payload as typeof rows[number] | undefined
            if (!active || !row) return null
            return <div className="chart-tooltip"><strong>{row.token} {row.chosen ? '· Selected' : ''}</strong><div>Relative probability {probabilityLabel(row.relative)}</div><div>Returned log probability {row.logprob}</div><div>exp(logprob) {row.probability.toPrecision(5)}</div></div>
          }} />
          <Bar dataKey="relative" isAnimationActive={false} radius={[0, 5, 5, 0]} barSize={16}
            label={{ position: 'right', fill: '#484f65', fontSize: 12, formatter: (value) => probabilityLabel(Number(value)) }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    <p className="chart-caption">These percentages are rescaled across the returned candidates only. Other tokens may have probability mass that is not shown. These values are not a measure of factual correctness.</p>
    <details className="prediction-disclosure probability-details">
      <summary>Candidate probability details</summary>
      <div className="probability-table">
        <table aria-label="Returned candidate probabilities">
          <thead><tr><th scope="col">Token</th><th scope="col">Relative percentage</th><th scope="col">Returned log probability</th><th scope="col">exp(logprob)</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.index}>
            <th scope="row"><code>{row.token}</code>{row.chosen && ' (selected)'}{row.kind && <small>{row.kind}</small>}</th>
            <td>{probabilityLabel(row.relative)}</td><td>{row.logprob}</td><td>{row.probability.toPrecision(5)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  </>
}
