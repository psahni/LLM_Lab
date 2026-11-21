import { Braces, ChartNoAxesColumnIncreasing, Check, ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState } from './EmptyState'
import { ResponseTokens } from './ResponseTokens'
import { sameToken, visibleToken, type Prediction, type Run } from './lab'

export default function PredictView({ run, position, setPosition, onPrompt }: {
  run: Run | null; position: number | null; setPosition: (position: number | null) => void; onPrompt: () => void
}) {
  if (!run) return <EmptyState icon={<ChartNoAxesColumnIncreasing size={22} />} title="No predictions yet"
    action={<button className="button primary" onClick={onPrompt}><Play size={16} /> Go to prompt</button>}>
    Run a prompt to inspect the model’s next-token candidates.
  </EmptyState>

  const last = run.predictions.length - 1
  if (last < 0) return <EmptyState icon={<ChartNoAxesColumnIncreasing size={22} />} title={run.phase === 'streaming' ? 'Waiting for predictions' : 'Token probabilities unavailable'}>
    {run.phase === 'streaming' ? 'Candidates will appear when Ollama returns token probabilities.' : 'This run returned no token probabilities. You can still read its response in Generate.'}
  </EmptyState>

  const index = Math.min(position ?? last, last)
  const prediction = run.predictions[index]
  const move = (next: number) => setPosition(next === last ? null : next)
  const hasSelectedPart = run.parts.some(({ predictionIndex }) => predictionIndex === index)

  return <>
    <section className="card content-card">
      <div className="section-heading">
        <span className="section-icon"><Braces size={19} /></span>
        <div><h2>Context for prediction</h2><p>{run.model} <span className="meta-dot">·</span> Temperature {run.temperature.toFixed(1)}</p></div>
      </div>
      <div className="prediction-context grid grid-cols-1 sm:grid-cols-2">
        <div className="context-box"><span className="eyebrow">Prompt</span><p>{run.prompt}</p></div>
        <div className="context-box"><span className="eyebrow">Generated response</span>
          {run.parts.length > 0 && <p className="prediction-response"><ResponseTokens parts={run.parts} onSelect={setPosition} selected={index} /></p>}
          <p className="response-token-hint">{hasSelectedPart
            ? 'Select any underlined token. Dimmed text came after the current token.'
            : prediction.prefix === null
              ? 'The response boundary for this token is unavailable.'
              : <>Text before this token: {prediction.prefix || 'start of response'}.</>}</p>
        </div>
      </div>
    </section>
    <section className="card content-card">
      <div className="section-heading">
        <span className="section-icon"><ChartNoAxesColumnIncreasing size={19} /></span>
        <div><h2>Next token</h2><p>Prediction {index + 1} of {last + 1}</p></div>
        <div className="pager push">
          <button className="icon-button" aria-label="Previous prediction" onClick={() => move(index - 1)} disabled={!index}><ChevronLeft size={18} /></button>
          <button className="icon-button" aria-label="Next prediction" onClick={() => move(index + 1)} disabled={index === last}><ChevronRight size={18} /></button>
          <button className="button quiet" onClick={() => setPosition(null)} disabled={position === null}>Latest</button>
        </div>
      </div>
      {last > 0 && <input className="prediction-slider" type="range" min={1} max={last + 1} value={index + 1}
        aria-label="Prediction step" onChange={(event) => move(Number(event.target.value) - 1)} />}
      <div className="chosen-token"><Check size={17} /><span>Selected token</span><code>{visibleToken(prediction.token)}</code></div>
      <ProbabilityChart prediction={prediction} />
    </section>
  </>
}

function probabilityLabel(value: number) {
  return value > 0 && value < 0.01 ? '<0.01%' : `${value.toFixed(2)}%`
}

function ProbabilityChart({ prediction }: { prediction: Prediction }) {
  const candidates = (prediction.top_logprobs ?? [])
    .filter(({ logprob }) => Number.isFinite(logprob))
    .slice(0, 10)
  if (!candidates.length) return <p className="subtle-note">Ollama did not return alternative candidates for this step.</p>

  // Subtracting the largest log probability keeps the normalization stable for very small values.
  const largest = Math.max(...candidates.map(({ logprob }) => logprob))
  const total = candidates.reduce((sum, { logprob }) => sum + Math.exp(logprob - largest), 0)
  const rows = candidates.map((candidate, index) => ({
    index,
    token: visibleToken(candidate.token),
    relative: 100 * Math.exp(candidate.logprob - largest) / total,
    probability: 100 * Math.exp(candidate.logprob),
    chosen: sameToken(candidate, prediction),
    fill: sameToken(candidate, prediction) ? 'var(--accent)' : '#a8acee',
  }))

  return <>
    <p className="chart-caption">Relative probabilities among the {rows.length} returned top candidates.</p>
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
            return <div className="chart-tooltip"><strong>{row.token} {row.chosen ? '· Selected' : ''}</strong><div>Relative probability {probabilityLabel(row.relative)}</div><div>exp(logprob) {probabilityLabel(row.probability)}</div></div>
          }} />
          <Bar dataKey="relative" isAnimationActive={false} radius={[0, 5, 5, 0]} barSize={16}
            label={{ position: 'right', fill: '#484f65', fontSize: 12, formatter: (value) => probabilityLabel(Number(value)) }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    <table className="sr-only"><caption>Returned candidate probabilities</caption>
      <thead><tr><th>Token</th><th>Relative</th><th>Reported probability</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.index}><th>{row.token}{row.chosen && ' (selected)'}</th><td>{probabilityLabel(row.relative)}</td><td>{probabilityLabel(row.probability)}</td></tr>)}</tbody>
    </table>
  </>
}
