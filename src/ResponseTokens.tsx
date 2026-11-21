import { visibleToken, type ResponsePart } from './lab'

export function ResponseTokens({ parts, onSelect, selected }: {
  parts: ResponsePart[]
  onSelect: (index: number) => void
  selected?: number
}) {
  const selectedPart = selected === undefined ? -1 : parts.findIndex(({ predictionIndex }) => predictionIndex === selected)

  return parts.map(({ text, predictionIndex }, index) => {
    const later = selectedPart >= 0 && index > selectedPart
    const className = `output-part${later ? ' later-token' : ''}`
    if (predictionIndex === undefined) return <span className={className} key={index}>{text}</span>

    const label = `Inspect token ${predictionIndex + 1}: ${visibleToken(text)}`
    return <button type="button" key={index} className={`${className} response-token`}
      aria-pressed={selected === undefined ? undefined : predictionIndex === selected}
      aria-label={label} title={label} onClick={() => onSelect(predictionIndex)}>{text}</button>
  })
}
