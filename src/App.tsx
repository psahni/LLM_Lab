import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowDown, ArrowDownRight, ArrowRight, AudioLines, Braces, ChartNoAxesColumnIncreasing, ChevronDown,
  CircleHelp, Cpu, FlaskConical, Grid3X3, Info, MessageSquare, Monitor, Play, RefreshCw,
  ScanLine, Settings2, SlidersHorizontal, Square, Terminal, TextCursorInput, Zap,
} from 'lucide-react'
import {
  defaultModel, defaultTemperature, examples, readWorkshopMode, useGeneration, useModels,
  type Settings,
} from './lab'
import { AttentionView, GenerateView, TokenizeView } from './views'
import { EmbeddingsView } from './EmbeddingsView'
import { TokenEmbeddingsView } from './TokenEmbeddingsView'

const PredictView = lazy(() => import('./PredictView'))

const pipeline = [
  { name: 'Prompt', subtitle: 'Write the input', icon: MessageSquare, title: 'Start with a prompt', description: 'Give the model something to work with. Ask a question, start a sentence, or try one of the examples below.', lesson: 'A prompt sets the context', detail: 'The words you enter give the model context for its first prediction. Even small changes in wording can change which token comes next.', short: 'Your words shape what the model predicts first.' },
  { name: 'Tokenize', subtitle: 'Break it into pieces', icon: Braces, title: 'Break text into tokens', description: 'Inspect the pieces of text that make up your prompt.', lesson: 'Text becomes pieces', detail: 'A token is a piece of text. The model processes tokens, not whole words. A token might contain a space, a whole word, part of a word, or punctuation. The model turns each token ID into a vector before its transformer layers process it.', short: 'A token is a piece of text. The model processes tokens, not whole words.' },
  { name: 'Token embeddings', subtitle: 'Look up input vectors', icon: ScanLine, title: 'Turn tokens into vectors', description: 'Select a token to see how its ID maps to a vector before attention.', lesson: 'One vector per token ID', detail: 'The token ID selects a row from the model’s learned embedding table. Each token position starts with its lookup vector and gets updated as the transformer processes the sequence.', short: 'Each token ID picks a vector from a learned table.' },
  { name: 'Attention', subtitle: 'Explore the context', icon: Grid3X3, title: 'Explore attention', description: 'Use a simplified heatmap to explore how a token can draw on earlier context.', lesson: 'Context can matter differently', detail: 'In a causal language model, attention lets each position use information from itself and earlier tokens. The transformer layers build a representation that the model uses to score the next token.', short: 'The model uses attention to process context before scoring the next token.' },
  { name: 'Predict', subtitle: 'Inspect the probabilities', icon: ChartNoAxesColumnIncreasing, title: 'Inspect the next token', description: 'Inspect the candidates Ollama returned for one step of a generated response.', lesson: 'One position, many candidates', detail: 'After the transformer layers process the context, the model scores possible next tokens. Ollama can return log probabilities for the chosen token and other candidates. The chart rescales the returned candidates to sum to 100%. Use the tooltip to see exp(log probability) for each token.', short: 'The bars show the relative chances among the returned candidates.' },
  { name: 'Generate', subtitle: 'Repeat token selection', icon: Zap, title: 'Watch the response build', description: 'See the model’s answer arrive incrementally from Ollama.', lesson: 'Every token adds context', detail: 'The model chooses and appends a token, then uses the longer context for the next prediction. Repeating this loop builds the response.', short: 'Each new token helps shape the next one.' },
] as const

const labTools = [
  { name: 'Embeddings', subtitle: 'Compare prompt meaning', icon: AudioLines, title: 'Compare prompt embeddings', description: 'See how a dedicated local embedding model represents whole prompts and compare the meaning of different prompts.', lesson: 'Text becomes a vector', detail: 'The embedding model turns each full prompt into a list of numbers. Cosine similarity measures how closely two vectors point in the same direction. The score ranges from −1 to +1.', short: 'More similar prompts often produce vectors that point in similar directions.' },
  { name: 'Settings', subtitle: 'Configure your run', icon: Settings2, title: 'Adjust your experiment', description: 'Choose a local model and tune temperature before running the prompt again.', lesson: 'Temperature changes sampling', detail: 'Lower temperature tends to concentrate choices around likely tokens. Higher temperature can make more candidates competitive. Run the same prompt twice to compare.', short: 'Lower temperature tends to favor the most likely tokens.' },
] as const

const navigation = [
  { label: 'Learning Pipeline', screens: pipeline, numbered: true },
  { label: 'Lab tools', screens: labTools, numbered: false },
] as const

const screens = [...pipeline, ...labTools]
type Screen = typeof screens[number]['name']

export function App() {
  const [step, setStep] = useState<Screen>('Prompt')
  const [predictionPosition, setPredictionPosition] = useState<number | null>(null)
  const stageHeading = useRef<HTMLHeadingElement>(null)
  const [settings, setSettings] = useState<Settings>({
    prompt: examples[0], model: defaultModel, temperature: defaultTemperature,
  })
  const [workshop, setWorkshop] = useState(readWorkshopMode)
  const { models, connection, refresh } = useModels()
  const { current, previous, error, generate, stop } = useGeneration(refresh)
  const active = current?.phase === 'streaming'
  const modelMissing = connection === 'connected' && !models.includes(settings.model)
  const status = modelMissing ? 'Model not installed'
    : connection === 'connected' ? 'Connected'
    : connection === 'offline' ? 'Not running' : 'Checking…'
  const ready = connection === 'connected' && !modelMissing
  const pipelineIndex = pipeline.findIndex(({ name }) => name === step)
  const stage = screens.find(({ name }) => name === step) ?? pipeline[0]

  useEffect(() => {
    try {
      localStorage.setItem('prediction-lab-workshop', String(workshop))
    } catch {
      // Workshop mode still works for the current session.
    }
  }, [workshop])

  useEffect(() => {
    if (step === 'Predict') stageHeading.current?.focus()
  }, [step])

  function changeSettings(patch: Partial<Settings>) {
    setSettings((current) => ({ ...current, ...patch }))
  }

  function run(next = settings) {
    if (active || !next.prompt.trim()) return
    setPredictionPosition(null)
    setStep('Generate')
    void generate(next)
  }

  const config = <Configuration {...{ models, settings, changeSettings, active }} />
  const canRun = ready && Boolean(settings.prompt.trim())
  const connectionHelp = connection === 'offline'
    ? <>Run <code>ollama serve</code> in a terminal, then check the connection again.</>
    : modelMissing && step !== 'Embeddings'
      ? <>Run <code>ollama pull {settings.model}</code>, or select another installed model.</>
      : null

  return (
    <div className={`app ${workshop ? 'workshop' : ''}`}>
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setStep('Prompt') }}>
          <span className="brand-icon"><FlaskConical size={21} /></span>
          <span>LLM Prediction <b>Lab</b></span>
        </a>
        <div className="top-actions">
          <div className="top-model" title={settings.model}><Cpu size={15} /><span>{settings.model}</span></div>
          <button type="button" className="connection" onClick={() => void refresh()} title="Check Ollama connection" aria-label={`${status}. Check Ollama connection`}>
            <span className={`status-dot ${ready ? 'online' : connection === 'checking' ? 'checking' : 'offline'}`} />
            <span aria-live="polite">{status}</span>
          </button>
          <button type="button" role="switch" aria-checked={workshop} className="workshop-toggle" onClick={() => setWorkshop(!workshop)}>
            <Monitor size={16} /><span>Workshop mode</span><span className="switch" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div>
            {navigation.map(({ label, screens, numbered }) => <div className="nav-section" key={label}>
              <h2 className="eyebrow nav-heading">{label}</h2>
              <nav aria-label={label}>
                {screens.map(({ name, subtitle, icon: Icon }, index) => (
                  <button type="button" key={name} className={`nav-step ${step === name ? 'selected' : ''}`}
                    aria-current={step === name ? (numbered ? 'step' : 'page') : undefined} onClick={() => setStep(name)}>
                    <span className="step-icon"><Icon size={18} strokeWidth={1.8} /></span>
                    <span className="nav-copy"><strong>{name}</strong><small>{subtitle}</small></span>
                    {numbered && <span className="step-number">{String(index + 1).padStart(2, '0')}</span>}
                  </button>
                ))}
              </nav>
            </div>)}
          </div>
          <div className="runtime">
            <span className="runtime-icon"><Terminal size={17} /></span>
            <div><strong>Local runtime</strong><small>Powered by Ollama</small></div>
          </div>
        </aside>

        <main className="main" id="main">
          <div className="stage-head">
            <div className="eyebrow stage-number"><span />{pipelineIndex >= 0
              ? `STEP ${String(pipelineIndex + 1).padStart(2, '0')} / ${String(pipeline.length).padStart(2, '0')}`
              : 'Lab tools'}</div>
            <h1 ref={stageHeading} tabIndex={-1}>{stage.title}</h1>
            <p>{stage.description}</p>
          </div>

          {connectionHelp && <div className="notice warning" role="status">
            <Info size={18} /><div><strong>{status}</strong><p>{connectionHelp}</p></div>
            <button type="button" className="button quiet" onClick={() => void refresh()}><RefreshCw size={15} /> Check again</button>
          </div>}

          {step === 'Prompt' && <>
            <section className="card prompt-card">
              <div className="section-heading">
                <span className="section-icon"><TextCursorInput size={19} /></span>
                <div><h2><label htmlFor="prompt">Your prompt</label></h2><p>Enter the text you want the model to respond to.</p></div>
              </div>
              <div className="prompt-input">
                <textarea id="prompt" value={settings.prompt} placeholder="Write a question or start a sentence…" onChange={(event) => changeSettings({ prompt: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault()
                      if (canRun) run()
                    }
                  }} />
                <div className="input-footer"><span>Plain text</span><span>{settings.prompt.length} characters</span></div>
              </div>
              <div className="preset-label"><Zap size={15} /> Try an example</div>
              <div className="preset-grid grid grid-cols-1 sm:grid-cols-2">
                {examples.map((example) => <button type="button" key={example} className="preset"
                  aria-pressed={settings.prompt === example} onClick={() => changeSettings({ prompt: example })}>
                  <span>{example}</span><ArrowDownRight size={15} />
                </button>)}
              </div>
            </section>
            {config}
            <div className="run-footer">
              <button type="button" className="button quiet tokenize-link" disabled={!settings.prompt.trim()} onClick={() => setStep('Tokenize')}><Braces size={17} /> Preview tokens</button>
              {active ? <button type="button" className="button primary" onClick={stop}><Square size={15} /> Stop generation</button>
                : <button type="button" className="button primary" disabled={!canRun} onClick={() => run()}><Play size={16} fill="currentColor" /> Run prompt <ArrowRight size={17} className="run-arrow" /></button>}
            </div>
          </>}

          {step === 'Tokenize' && <>
            <TokenizeView settings={settings} run={current} />
            <div className="run-footer">
              <button type="button" className="button quiet" onClick={() => setStep('Prompt')}>Edit prompt</button>
              {active
                ? <button type="button" className="button primary" onClick={() => setStep('Generate')}>View generation <ArrowRight size={17} /></button>
                : <button type="button" className="button primary" disabled={!canRun} onClick={() => run()}><Play size={16} fill="currentColor" /> Run prompt <ArrowRight size={17} className="run-arrow" /></button>}
            </div>
          </>}
          {step === 'Generate' && <GenerateView current={current} previous={previous} error={error}
            canRegenerate={Boolean(current?.prompt.trim() ?? settings.prompt.trim()) && connection === 'connected' && models.includes(current?.model ?? settings.model)}
            onRegenerate={() => run(current ?? settings)} onStop={stop}
            onPrompt={() => setStep('Prompt')} onPredict={(position) => {
              setPredictionPosition(position ?? null)
              setStep('Predict')
            }} onSettings={() => setStep('Settings')} />}
          {step === 'Predict' && <Suspense fallback={<p className="subtle-note" role="status">Loading prediction viewer…</p>}>
            <PredictView run={current} position={predictionPosition} setPosition={setPredictionPosition} onPrompt={() => setStep('Prompt')} />
          </Suspense>}
          {step === 'Token embeddings' && <TokenEmbeddingsView />}
          {step === 'Attention' && <AttentionView prompt={settings.prompt} />}
          <div hidden={step !== 'Embeddings'}><EmbeddingsView prompt={settings.prompt} /></div>
          {step === 'Settings' && <>
            {config}
            <section className="card settings-card">
              <div className="section-heading"><span className="section-icon"><Monitor size={19} /></span>
                <div><h2>Workshop display</h2><p>Larger text and shorter explanations for a projected screen.</p></div>
              </div>
              <button type="button" role="switch" aria-checked={workshop} className="workshop-toggle" onClick={() => setWorkshop(!workshop)}><span>Workshop mode</span><span className="switch" aria-hidden="true" /></button>
            </section>
            <div className="run-footer">
              <button type="button" className="button quiet" onClick={() => changeSettings({ model: defaultModel, temperature: defaultTemperature })} disabled={active}>Restore defaults</button>
              <button type="button" className="button primary" onClick={() => run()} disabled={active || !canRun}><Play size={16} fill="currentColor" /> Run prompt <ArrowRight size={17} className="run-arrow" /></button>
            </div>
          </>}
        </main>

        <aside className="explainer" aria-label="Behind the scenes">
          <div className="explainer-title"><span className="explainer-icon"><CircleHelp size={17} /></span><h2>Behind the scenes</h2></div>
          <div className="lesson-card">
            <h3>{stage.lesson}</h3>
            <p>{workshop ? stage.short : stage.detail}</p>
            {step === 'Prompt' && <div className="prompt-diagram" aria-label="Example prompt to next token">
              <div className="diagram-node"><small>Example prompt</small><div>The sky is</div></div>
              <ArrowDown size={15} className="diagram-arrow" />
              <div className="diagram-node diagram-output"><small>Possible next token</small><div>␣blue</div></div>
            </div>}
          </div>
          {step === 'Prompt' && <div className="side-tip">
            <Zap size={18} /><div><h3>Try changing one word</h3><p>Change “France” to “Japan,” then compare the answers in Generate.</p></div>
          </div>}
          {step === 'Predict' && <div className="side-tip">
            <Info size={18} /><div><h3>Read the token as text</h3><p><code>␣</code> marks a space, <code>↵</code> marks a line break, and <code>∅</code> marks empty text.</p></div>
          </div>}
        </aside>
      </div>
    </div>
  )
}

function Configuration({ models, settings, changeSettings, active }: {
  models: string[]; settings: Settings; changeSettings: (patch: Partial<Settings>) => void; active: boolean
}) {
  return <section className="card config-card">
    <div className="section-heading">
      <span className="section-icon"><SlidersHorizontal size={19} /></span>
      <div><h2>Run configuration</h2><p>Choose the model and how it samples tokens.</p></div>
    </div>
    <div className="config-grid grid grid-cols-1 sm:grid-cols-2">
      <div>
        <label className="field-label" htmlFor="model">Ollama model</label>
        <div className="model-select">
          <Cpu size={17} />
          <select id="model" value={settings.model} onChange={(event) => changeSettings({ model: event.target.value })} disabled={active}>
            {!models.includes(settings.model) && <option value={settings.model}>{settings.model}</option>}
            {models.map((model) => <option key={model}>{model}</option>)}
          </select>
          <ChevronDown size={16} />
        </div>
      </div>
      <div>
        <div className="range-label"><label className="field-label" htmlFor="temperature">Temperature</label><output htmlFor="temperature">{settings.temperature.toFixed(1)}</output></div>
        <input type="range" id="temperature" min={0} max={1.5} step={0.1} disabled={active} value={settings.temperature}
          style={{ background: `linear-gradient(to right, var(--accent) ${settings.temperature / 1.5 * 100}%, var(--track) 0)` }}
          onChange={(event) => changeSettings({ temperature: Number(event.target.value) })} />
        <div className="range-caption"><span>More focused</span><span>More varied</span></div>
      </div>
    </div>
  </section>
}
