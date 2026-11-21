import { useState } from 'react'
import { ScanLine } from 'lucide-react'
import { visibleToken } from './lab'

const vocabulary = {
  The: { id: 12, vector: [0.08, -0.41, 0.24, 0.35] },
  ' blue': { id: 27, vector: [0.62, -0.18, 0.31, 0.07] },
  ' sky': { id: 34, vector: [-0.26, 0.54, 0.17, 0.22] },
  ',': { id: 8, vector: [0.15, 0.02, -0.32, 0.09] },
  ' sea': { id: 42, vector: [0.29, 0.43, -0.11, 0.38] },
  '.': { id: 4, vector: [-0.05, 0.22, -0.48, 0.16] },
}

const example = ['The', ' blue', ' sky', ',', ' blue', ' sea', '.'] as const

export function TokenEmbeddingsView() {
  const [position, setPosition] = useState(1)
  const token = example[position]
  const { id, vector } = vocabulary[token]

  return <section className="card content-card">
    <div className="section-heading">
      <span className="section-icon"><ScanLine size={19} /></span>
      <div><h2>Token embedding lookup</h2><p>Illustrative token IDs and vectors for teaching.</p></div>
    </div>
    <div className="token-example">
      <p><strong>Example prompt</strong> <code>{example.join('')}</code></p>
      <div className="chips" role="group" aria-label="Example prompt tokens">
        {example.map((piece, index) => (
          <button type="button" key={index} className="token-chip" aria-pressed={position === index}
            aria-label={`Token ${index + 1}: ${visibleToken(piece)}`} onClick={() => setPosition(index)}>
            {visibleToken(piece)}
          </button>
        ))}
      </div>
    </div>
    <dl className="token-lookup" aria-live="polite">
      <div><dt>Selected token</dt><dd><code>{visibleToken(token)}</code></dd></div>
      <div><dt>Example token ID</dt><dd><code>{id}</code></dd></div>
      <div><dt>Example vector</dt><dd><code>[{vector.map((value) => value.toFixed(2)).join(', ')}]</code></dd></div>
    </dl>
    <div className="subtle-note">
      <strong>Try both occurrences of <code>␣blue</code>.</strong>
      <p>A token ID retrieves the same input vector each time. Attention layers then use each occurrence’s context.</p>
      <p>Ollama’s chat API doesn’t expose the model’s token embedding table.</p>
    </div>
  </section>
}
