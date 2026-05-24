import NumberFlow from '@number-flow/react'

const EUR_FORMAT = {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
} as const

export function Money({
  value,
  signed = false,
}: {
  value: number
  signed?: boolean
}) {
  return (
    <NumberFlow
      value={Math.round(value)}
      locales="fr-FR"
      format={signed ? { ...EUR_FORMAT, signDisplay: 'always' } : EUR_FORMAT}
    />
  )
}
