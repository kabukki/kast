import { createFileRoute } from '@tanstack/react-router'
import { Fragment, useMemo, useState } from 'react'

export const Route = createFileRoute('/')({ component: TaxCalculator })

type Bracket = {
  rate: number
  min: number
  max: number
  label: string
  color: string
}

const BRACKETS: ReadonlyArray<Bracket> = [
  { rate: 0, min: 0, max: 11497, label: '0 %', color: '#a8a59a' },
  { rate: 0.11, min: 11497, max: 29315, label: '11 %', color: '#5b9bd5' },
  { rate: 0.3, min: 29315, max: 83823, label: '30 %', color: '#48a584' },
  { rate: 0.41, min: 83823, max: 180294, label: '41 %', color: '#d99342' },
  {
    rate: 0.45,
    min: 180294,
    max: Number.POSITIVE_INFINITY,
    label: '45 %',
    color: '#c96442',
  },
]

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' €'

function computeBrackets(net: number) {
  return BRACKETS.map((b) => {
    const upper =
      b.max === Number.POSITIVE_INFINITY ? net : Math.min(b.max, net)
    const taxable = Math.max(0, upper - b.min)
    const tax = taxable * b.rate
    return { ...b, taxable, tax }
  })
}

function marginalRate(net: number) {
  for (let i = BRACKETS.length - 1; i >= 0; i--) {
    if (net > BRACKETS[i].min) return BRACKETS[i].rate
  }
  return 0
}

function InfoIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="info-icon" tabIndex={0}>
      i<span className="info-tooltip">{children}</span>
    </span>
  )
}

function ColTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center mb-3.5 text-[12px] font-medium tracking-[0.14em] uppercase text-ink-soft">
      {children}
    </div>
  )
}

function TaxCalculator() {
  const [net, setNet] = useState(40000)
  const [pas, setPas] = useState(8)

  const rows = useMemo(() => computeBrackets(Math.max(0, net)), [net])
  const total = useMemo(() => rows.reduce((s, r) => s + r.tax, 0), [rows])
  const avg = net > 0 ? (total / net) * 100 : 0
  const marg = marginalRate(net) * 100

  const paid = net * (pas / 100)
  const diff = paid - total
  const maxAmount = Math.max(paid, total, 1)

  let regulTone: 'balanced' | 'refund' | 'due' = 'balanced'
  let regulLabel = 'Solde équilibré'
  let regulAmount = '0 €'
  let regulDetail: React.ReactNode = (
    <>
      Le PAS prélevé ({fmt(paid)}) correspond exactement à l'impôt dû. Aucune
      régularisation.
    </>
  )
  const barPaidWidth = `${(paid / maxAmount) * 100}%`
  let barExtraWidth = '0%'
  let barExtraLeft = '0%'

  if (Math.abs(diff) >= 1) {
    if (diff > 0) {
      regulTone = 'refund'
      regulLabel = '↓ Remboursement attendu'
      regulAmount = '+ ' + fmt(diff)
      regulDetail = (
        <>
          Vous avez payé <strong>{fmt(paid)}</strong> via le PAS pour un impôt
          réel de <strong>{fmt(total)}</strong>. Le fisc vous rembourse la
          différence. Votre taux moyen réel est de {avg.toFixed(2)} %.
        </>
      )
    } else {
      regulTone = 'due'
      regulLabel = '↑ Solde à payer'
      regulAmount = '− ' + fmt(-diff)
      regulDetail = (
        <>
          Vous avez payé <strong>{fmt(paid)}</strong> via le PAS, mais l'impôt
          réel est de <strong>{fmt(total)}</strong>. Il vous reste à régler la
          différence. Votre taux moyen réel est de {avg.toFixed(2)} %.
        </>
      )
      barExtraWidth = `${((total - paid) / maxAmount) * 100}%`
      barExtraLeft = `${(paid / maxAmount) * 100}%`
    }
  }

  const activeRows = rows.filter((r) => r.taxable > 0)
  const grossSegments = activeRows.map((r) => ({
    key: r.label,
    color: r.color,
    label: r.label,
    amount: r.taxable,
    tax: r.tax,
    min: r.min,
    max: r.max,
  }))

  const syncPas = () => {
    const rounded = Math.round(avg * 10) / 10
    setPas(rounded)
  }

  const regulBorder =
    regulTone === 'refund'
      ? 'border-l-[#2d8a5f]'
      : regulTone === 'due'
        ? 'border-l-[#c0392b]'
        : 'border-l-clay'
  const regulBg =
    regulTone === 'refund'
      ? 'bg-gradient-to-r from-[#ecf6f0] from-0% via-cream-surface via-40%'
      : regulTone === 'due'
        ? 'bg-gradient-to-r from-[#fbecea] from-0% via-cream-surface via-40%'
        : ''
  const regulAmountColor =
    regulTone === 'refund'
      ? 'text-[#2d8a5f]'
      : regulTone === 'due'
        ? 'text-[#c0392b]'
        : ''
  const regulFillColor = regulTone === 'refund' ? 'bg-[#2d8a5f]' : 'bg-clay'
  const regulDotPaid = regulTone === 'refund' ? 'bg-[#2d8a5f]' : 'bg-clay'

  return (
    <div className="max-w-[1280px] mx-auto">
      <a
        href="/"
        aria-label="kast"
        className="inline-flex items-baseline gap-2 mb-6 text-ink hover:text-clay transition-colors no-underline"
      >
        <span className="font-display text-[34px] leading-none font-semibold tracking-[-0.04em] lowercase">
          kast
        </span>
        <span className="text-[11px] tracking-[0.18em] uppercase text-ink-soft font-medium">
          fiscal
        </span>
      </a>
      <h1 className="text-2xl font-medium m-0 mb-1 tracking-[-0.01em]">
        Calculateur d'impôt sur le revenu
      </h1>
      <p className="text-ink-muted text-[14px] m-0 mb-8">
        Barème 2026 sur les revenus 2025 — pour une part fiscale
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(260px,1fr)_minmax(420px,2fr)_minmax(280px,1.1fr)] gap-4 items-start mb-7">
        {/* Left column — input */}
        <div className="min-w-0">
          <ColTitle>Revenu net imposable</ColTitle>
          <div className="bg-cream-surface border border-cream-border rounded-app-lg px-6 py-5 shadow-app">
            <div className="flex flex-col items-stretch gap-3">
              <input
                type="number"
                id="net-input"
                value={net}
                min={0}
                step={1000}
                onChange={(e) => setNet(parseFloat(e.target.value) || 0)}
                className="w-full py-2.5 px-3.5 text-lg font-medium border border-cream-border-strong rounded-app bg-cream-surface text-ink transition-[border-color,box-shadow] focus:outline-none focus:border-clay focus:shadow-[0_0_0_3px_var(--color-clay-soft)]"
              />
              <input
                type="range"
                min={0}
                max={250000}
                value={Math.min(net, 250000)}
                step={500}
                onChange={(e) => setNet(parseFloat(e.target.value) || 0)}
                className="!min-w-0 w-full"
              />
            </div>
          </div>
        </div>

        {/* Middle column — breakdown */}
        <div className="min-w-0">
          <ColTitle>Répartition par tranche</ColTitle>
          <div role="group" aria-label="Revenu par tranche" className="flex flex-col">
            {grossSegments.length === 0 && (
              <div className="bg-cream-surface border border-cream-border rounded-app p-[18px] text-center text-ink-soft">
                —
              </div>
            )}
            {grossSegments.map((seg, i) => {
              const upper =
                seg.max === Number.POSITIVE_INFINITY
                  ? '∞'
                  : seg.max.toLocaleString('fr-FR') + ' €'
              const lower = seg.min.toLocaleString('fr-FR') + ' €'
              const taxPct = seg.label ? parseInt(seg.label, 10) : 0
              const keptAmount = seg.amount - seg.tax
              return (
                <Fragment key={seg.key}>
                  {i > 0 && (
                    <div
                      aria-hidden="true"
                      className="text-center text-ink-soft text-lg py-1.5 select-none font-mono"
                    >
                      +
                    </div>
                  )}
                  <div
                    className="bracket-card relative bg-cream-surface border border-cream-border rounded-app overflow-hidden shadow-app"
                  >
                    <div
                      className="flex items-baseline justify-between gap-2 px-3 py-2 text-white"
                      style={{ background: seg.color }}
                    >
                      <span className="text-sm font-semibold tabular-nums tracking-[-0.01em]">
                        {fmt(seg.amount)}
                      </span>
                      <span className="text-[10px] font-semibold tracking-[0.06em] uppercase opacity-85 whitespace-nowrap">
                        {seg.label}
                      </span>
                    </div>
                    <div className="flex items-stretch border-t border-white/25">
                      <div
                        className="bg-cream-surface text-ink flex flex-col items-start justify-center px-2.5 py-1.5 min-w-0 shrink overflow-hidden"
                        style={{ width: `${100 - taxPct}%` }}
                      >
                        <span className="text-[9px] font-semibold tracking-[0.08em] uppercase text-ink-muted whitespace-nowrap">
                          Net
                        </span>
                        <span className="text-xs font-medium tabular-nums whitespace-nowrap mt-px text-sage">
                          {fmt(keptAmount)}
                        </span>
                      </div>
                      {taxPct > 0 && (
                        <div
                          className="bg-cream-surface text-ink flex flex-col items-start justify-center px-2.5 py-1.5 min-w-[88px] overflow-hidden border-l border-cream-border shrink-0"
                          style={{ width: `${taxPct}%` }}
                        >
                          <span className="text-[9px] font-semibold tracking-[0.08em] uppercase text-ink-muted whitespace-nowrap">
                            Impôt
                          </span>
                          <span className="text-xs font-medium tabular-nums whitespace-nowrap mt-px text-rust">
                            {fmt(seg.tax)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="bracket-tooltip">
                      <div className="font-semibold text-xs tracking-[0.02em] mb-1 text-white">
                        Tranche {seg.label}
                      </div>
                      <div className="text-[11px] text-[#b8b6ad] mb-2 tabular-nums">
                        {lower} → {upper}
                      </div>
                      <div className="flex justify-between gap-3 text-xs text-[#d1cfc4] py-0.5">
                        <span>Imposé dans cette tranche</span>
                        <strong className="text-white font-medium tabular-nums">
                          {fmt(seg.amount)}
                        </strong>
                      </div>
                      <div className="flex justify-between gap-3 text-xs text-[#d1cfc4] py-0.5">
                        <span>Impôt {seg.label}</span>
                        <strong className="text-white font-medium tabular-nums">
                          − {fmt(seg.tax)}
                        </strong>
                      </div>
                      <div className="flex justify-between gap-3 text-xs text-[#d1cfc4] py-0.5">
                        <span>Net</span>
                        <strong className="text-white font-medium tabular-nums">
                          {fmt(keptAmount)}
                        </strong>
                      </div>
                    </div>
                  </div>
                </Fragment>
              )
            })}
          </div>
        </div>

        {/* Right column — forecast */}
        <div className="min-w-0">
          <ColTitle>Forecast</ColTitle>
          <ResultCard
            label="Net après impôt"
            amount={fmt(net - total)}
            amountTone="sage"
            tooltip={
              <>
                Revenu net imposable − impôt total. Ce qu'il vous reste
                effectivement une fois l'impôt sur le revenu acquitté (hors
                autres prélèvements sociaux).
              </>
            }
          />
          <ResultCard
            label="Impôt total"
            amount={fmt(total)}
            amountTone="rust"
            tooltip={
              <>
                Somme des impôts dus dans chaque tranche du barème
                progressif. C'est le montant final à payer au Trésor public
                sur vos revenus de l'année.
              </>
            }
          />
          <ResultCard
            label="Taux marginal"
            amount={`${marg.toFixed(0)} %`}
            tooltip={
              <>
                Taux appliqué à votre dernier euro gagné — c'est-à-dire la
                tranche la plus haute que vous atteignez. Indique ce que
                coûterait en impôt 1 € de revenu supplémentaire.
              </>
            }
          />
        </div>
      </div>

      <div className="h-px bg-cream-border my-10" />

      <div className="mb-6">
        <h2 className="text-lg font-medium m-0 mb-1.5 tracking-[-0.01em]">
          Simuler le prélèvement à la source
        </h2>
        <p className="text-[13px] text-ink-muted m-0 mb-5 leading-[1.6]">
          L'administration applique chaque mois un taux à votre salaire pour
          anticiper l'impôt. Si ce taux ne correspond pas à votre situation
          réelle, un solde de régularisation apparaît en fin d'année.
        </p>

        <div className="bg-cream-surface border border-cream-border rounded-app-lg px-6 py-5 mb-6 shadow-app">
          <div className="flex justify-between items-center mb-2.5 gap-3 flex-wrap">
            <label
              className="text-[13px] text-ink-muted font-medium uppercase tracking-[0.04em]"
              htmlFor="pas-input"
            >
              Taux PAS appliqué sur la fiche de paie
            </label>
            <div className="inline-flex items-center gap-2.5 bg-cream-alt border border-cream-border rounded-full py-1.5 pl-3.5 pr-1.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.04em] uppercase text-ink-muted">
                Taux moyen
                <InfoIcon>
                  Impôt total ÷ revenu net imposable, exprimé en %. C'est le
                  taux que l'administration fiscale utilise par défaut pour
                  calculer votre prélèvement à la source.
                </InfoIcon>
              </span>
              <span className="text-sm font-semibold tabular-nums text-ink">
                {avg.toFixed(2)} %
              </span>
              <button
                type="button"
                onClick={syncPas}
                className="text-[11px] py-1 px-2.5 rounded-md bg-cream-surface border border-cream-border text-clay cursor-pointer transition-colors hover:bg-clay-soft"
              >
                ↻ Synchroniser
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3.5 flex-wrap">
            <input
              type="number"
              id="pas-input"
              value={pas}
              min={0}
              max={45}
              step={0.1}
              onChange={(e) => setPas(parseFloat(e.target.value) || 0)}
              className="w-[180px] py-2.5 px-3.5 text-lg font-medium border border-cream-border-strong rounded-app bg-cream-surface text-ink focus:outline-none focus:border-clay focus:shadow-[0_0_0_3px_var(--color-clay-soft)]"
            />
            <span className="text-sm text-ink-muted">%</span>
            <input
              type="range"
              min={0}
              max={45}
              value={pas}
              step={0.1}
              onChange={(e) => setPas(parseFloat(e.target.value) || 0)}
            />
          </div>
          <p className="text-xs text-ink-soft m-0 mt-2.5 leading-[1.5]">
            Par défaut, l'administration utilise votre taux moyen de l'année
            précédente. Si vos revenus changent, un écart se forme.
          </p>
        </div>

        <div
          className={`grid grid-cols-1 md:grid-cols-[minmax(180px,1fr)_2fr] gap-7 items-center bg-cream-surface border border-cream-border border-l-4 rounded-app-lg px-6 py-5 mb-7 shadow-app transition-colors ${regulBorder} ${regulBg}`}
        >
          <div>
            <div className="text-xs text-ink-muted uppercase tracking-[0.04em] font-medium mb-1.5">
              {regulLabel}
            </div>
            <div className={`text-[28px] font-medium tracking-[-0.01em] mb-1 ${regulAmountColor}`}>
              {regulAmount}
            </div>
            <div className="text-[13px] text-ink-muted leading-[1.5]">
              {regulDetail}
            </div>
          </div>
          <div>
            <div className="relative h-8 bg-cream-alt rounded-md overflow-hidden mb-2.5">
              <div
                className={`absolute top-0 left-0 h-full transition-[width] duration-300 ${regulFillColor}`}
                style={{ width: barPaidWidth }}
              />
              <div
                className="absolute top-0 h-full bg-[#c0392b]/85 transition-[width] duration-300"
                style={{ width: barExtraWidth, left: barExtraLeft }}
              />
            </div>
            <div className="flex gap-4 text-xs text-ink-muted flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <span className={`inline-block w-2.5 h-2.5 rounded-[2px] ${regulDotPaid}`} />
                Déjà prélevé (PAS)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-[2px] bg-ink-soft" />
                Impôt réel dû
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-8 text-xs text-ink-soft text-center">
        Calcul indicatif — ne tient pas compte du quotient familial, des
        réductions ni de la décote.
      </p>
    </div>
  )
}

function ResultCard({
  label,
  amount,
  amountTone,
  tooltip,
}: {
  label: string
  amount: string
  amountTone?: 'sage' | 'rust'
  tooltip: React.ReactNode
}) {
  const toneClass =
    amountTone === 'sage'
      ? 'text-sage'
      : amountTone === 'rust'
        ? 'text-rust'
        : ''
  return (
    <div className="bg-cream-surface border border-cream-border rounded-app px-4 py-3.5 shadow-app flex flex-col gap-1.5 mt-3 first:mt-0">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.04em] uppercase text-ink-muted">
        {label}
        <InfoIcon>{tooltip}</InfoIcon>
      </span>
      <span className={`text-[22px] font-medium tracking-[-0.01em] tabular-nums ${toneClass}`}>
        {amount}
      </span>
    </div>
  )
}
