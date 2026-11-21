import { Fragment } from 'react'
import { predictionTokenLabel, tokenKind, visibleToken, type ResponsePart } from './lab'

export function ResponseTokens({ parts, onSelect, selected }: {
  parts: ResponsePart[]
  onSelect: (index: number) => void
  selected?: number
}) {
  const selectedPart = selected === undefined ? -1 : parts.findIndex(({ predictionIndex }) => predictionIndex === selected)
  const inspecting = selected !== undefined

  return parts.map(({ text, predictionIndex }, index) => {
    const later = selectedPart >= 0 && index > selectedPart
    const className = `output-part${later ? ' later-token' : ''}`
    if (predictionIndex === undefined) return <span className={className} key={index}>{text}</span>
    if (!inspecting && !text) return null

    const display = inspecting ? predictionTokenLabel(text) : visibleToken(text)
    const kind = inspecting ? tokenKind(text) : undefined
    const label = `Inspect token ${predictionIndex + 1}: ${display}${kind ? `, ${kind.toLowerCase()}` : ''}`
    return <Fragment key={index}>
      <button type="button" className={`${className} response-token`}
        aria-pressed={selected === undefined ? undefined : predictionIndex === selected}
        aria-label={label} title={label} onClick={() => onSelect(predictionIndex)}>{kind ? display : text}</button>
      {kind === 'Whitespace token' && text.replace(/[^\r\n]/g, '')}
    </Fragment>
  })
}
