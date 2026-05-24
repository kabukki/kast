import NumberFlow from '@number-flow/react'

export function Percent({
  value,
  fractionDigits = 0,
}: {
  value: number
  fractionDigits?: number
}) {
  return (
    <NumberFlow
      value={value / 100}
      locales="fr-FR"
      format={{
        style: 'percent',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }}
    />
  )
}
