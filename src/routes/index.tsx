import { createFileRoute } from '@tanstack/react-router'
import { Fragment, useMemo, useState } from 'react'
import { ArrowRight, Calculator, CalendarSync, Wallet } from 'lucide-react'
import NumberFlow from '@number-flow/react'

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

const EUR_FORMAT = {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
} as const

function Money({
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

function Percent({
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

type Status = 'public' | 'etam' | 'cadre' | 'liberal'

const STATUS_DEDUCTION: Record<Status, number> = {
  public: 0.17,
  etam: 0.22,
  cadre: 0.25,
  liberal: 0.34,
}

const STATUS_LABEL: Record<Status, string> = {
  public: 'Public',
  etam: 'ETAM',
  cadre: 'Cadre',
  liberal: 'Libéral',
}

function defaultPas(net: number) {
  const total = computeBrackets(Math.max(0, net)).reduce(
    (s, r) => s + r.tax,
    0,
  )
  return Math.round((net > 0 ? (total / net) * 1000 : 0)) / 10
}

type Period = 'month' | 'year'

function TaxCalculator() {
  const [gross, setGross] = useState(50000)
  const [net, setNet] = useState(50000 * (1 - STATUS_DEDUCTION.cadre))
  const [status, setStatus] = useState<Status>('cadre')
  const [pas, setPas] = useState(() =>
    defaultPas(50000 * (1 - STATUS_DEDUCTION.cadre)),
  )
  const [netPeriod, setNetPeriod] = useState<Period>('month')

  const updateGross = (g: number) => {
    setGross(g)
    setNet(g * (1 - STATUS_DEDUCTION[status]))
  }
  const updateStatus = (s: Status) => {
    setStatus(s)
    setNet(gross * (1 - STATUS_DEDUCTION[s]))
  }

  const rows = useMemo(() => computeBrackets(Math.max(0, net)), [net])
  const total = useMemo(() => rows.reduce((s, r) => s + r.tax, 0), [rows])
  const avg = net > 0 ? (total / net) * 100 : 0
  const marg = marginalRate(net) * 100

  const paid = net * (pas / 100)
  const diff = paid - total

  let gapTone: 'balanced' | 'refund' | 'due' = 'balanced'
  let gapLabel = 'Solde équilibré'
  let gapSentence = "Votre taux PAS correspond exactement à l'impôt dû."
  if (Math.abs(diff) >= 1) {
    if (diff > 0) {
      gapTone = 'refund'
      gapLabel = 'Remboursement attendu'
      gapSentence =
        "Le fisc vous remboursera ce trop-perçu en fin d'année."
    } else {
      gapTone = 'due'
      gapLabel = 'Solde à payer'
      gapSentence =
        "Vous devrez régler ce complément en fin d'année."
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

  const gapColor =
    gapTone === 'refund'
      ? 'text-sage'
      : gapTone === 'due'
        ? 'text-rust'
        : 'text-ink'

  const resetPas = () => setPas(defaultPas(net))

  return (
    <div className="container mx-auto">
      <div className="flex items-center justify-between mb-6">
        <a
          href="/"
          aria-label="kast"
          className="inline-flex items-baseline text-clay hover:opacity-80 transition-opacity no-underline"
        >
          <span className="font-display text-[34px] leading-none font-semibold tracking-[-0.04em] lowercase">
            kast
          </span>
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block w-1.5 h-1.5 rounded-full bg-ink"
          />
        </a>
        <button
          type="button"
          aria-label="Pays : France"
          title="France"
          className="inline-flex items-center gap-2 py-1.5 pl-2 pr-3 rounded-full bg-cream-surface border border-cream-border shadow-app text-[12px] font-medium tracking-[0.04em] text-ink-muted hover:text-ink transition-colors cursor-default"
        >
          <span className="text-base leading-none" aria-hidden="true">
            🇫🇷
          </span>
          France
        </button>
      </div>
      {/* User inputs — single source of truth at the top */}
      <div className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div>
          <label
            htmlFor="gross-input"
            className="inline-flex items-center gap-1.5 mb-2.5 text-[13px] text-ink-muted font-medium uppercase tracking-[0.04em]"
          >
            Revenu annuel brut
            <InfoIcon>
              Votre rémunération annuelle avant cotisations sociales et impôt.
              Inclut salaire de base, primes et avantages imposables.
            </InfoIcon>
          </label>
          <div className="relative">
            <input
              type="number"
              id="gross-input"
              value={Math.round(gross)}
              min={0}
              step={1000}
              onChange={(e) => updateGross(parseFloat(e.target.value) || 0)}
              className="w-full py-2.5 pl-3.5 pr-9 text-lg font-medium border border-cream-border-strong rounded-app bg-cream-surface text-ink transition-[border-color,box-shadow] focus:outline-none focus:border-clay focus:shadow-[0_0_0_3px_var(--color-clay-soft)]"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-base text-ink-muted pointer-events-none">
              €
            </span>
          </div>
        </div>

        <div>
          <div className="inline-flex items-center gap-1.5 mb-2.5 text-[13px] text-ink-muted font-medium uppercase tracking-[0.04em]">
            Statut
            <InfoIcon>
              <div className="font-semibold mb-1.5 text-white">
                Abattement forfaitaire
              </div>
              {(['public', 'etam', 'cadre', 'liberal'] as Status[]).map(
                (s) => (
                  <div
                    key={s}
                    className="flex justify-between gap-3 py-0.5 text-[#d1cfc4]"
                  >
                    <span>{STATUS_LABEL[s]}</span>
                    <strong className="text-white font-medium tabular-nums">
                      −{Math.round(STATUS_DEDUCTION[s] * 100)} %
                    </strong>
                  </div>
                ),
              )}
            </InfoIcon>
          </div>
          <div
            role="radiogroup"
            aria-label="Statut"
            className="grid grid-cols-4 bg-cream-alt rounded-app p-1 gap-1"
          >
            {(['public', 'etam', 'cadre', 'liberal'] as Status[]).map((s) => {
              const active = status === s
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => updateStatus(s)}
                  className={`text-xs font-medium uppercase tracking-[0.06em] py-3.5 rounded-md transition-colors ${
                    active
                      ? 'bg-cream-surface text-ink shadow-app'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 mb-8">
        <Calculator
          className="text-clay shrink-0"
          size={24}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div>
          <h1 className="text-2xl font-medium m-0 tracking-[-0.01em] leading-tight">
            Impôt sur le revenu
          </h1>
          <p className="text-ink-muted text-[14px] m-0">
            Barème 2026 sur les revenus 2025 — pour une part fiscale
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 items-center mb-7">
        {/* Net imposable — derived, read-only */}
        <div className="min-w-0">
          <div className="flex items-center justify-center gap-1.5 mb-3.5 text-[12px] font-medium tracking-[0.14em] uppercase text-ink-soft">
            Net imposable
            <InfoIcon>
              Salaire annuel brut auquel on retire l'abattement forfaitaire de
              votre statut. C'est l'assiette utilisée pour calculer l'impôt
              sur le revenu.
            </InfoIcon>
          </div>
          <div className="w-fit mx-auto text-2xl font-medium tabular-nums tracking-[-0.01em] text-ink">
            <Money value={net} />
          </div>
        </div>

        <ArrowRight
          aria-hidden="true"
          className="text-ink-soft hidden md:block"
          size={20}
          strokeWidth={1.75}
        />

        {/* Middle column — breakdown */}
        <div className="min-w-0">
          <div className="flex items-center justify-center gap-1.5 mb-3.5 text-[12px] font-medium tracking-[0.14em] uppercase text-ink-soft">
            Répartition par tranche
            <InfoIcon>
              Le net imposable est découpé selon les tranches du barème
              progressif. Chaque tranche est taxée à son propre taux.
            </InfoIcon>
          </div>
          <div
            role="group"
            aria-label="Revenu par tranche"
            className="flex flex-col"
          >
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
              const capacity =
                seg.max === Number.POSITIVE_INFINITY
                  ? seg.amount
                  : seg.max - seg.min
              const fillPct =
                capacity > 0
                  ? Math.min(100, (seg.amount / capacity) * 100)
                  : 0
              return (
                <Fragment key={seg.key}>
                  {i > 0 && (
                    <div
                      aria-hidden="true"
                      className="text-center text-ink-soft text-lg select-none font-mono"
                    >
                      +
                    </div>
                  )}
                  <div
                    className="bracket-card relative bg-cream-surface border border-cream-border rounded-app overflow-hidden shadow-app"
                  >
                    <div
                      className="bracket-header relative flex items-baseline justify-between gap-2 px-3 py-2 text-white overflow-hidden"
                      style={{ background: `color-mix(in srgb, ${seg.color} 22%, transparent)` }}
                    >
                      <div
                        aria-hidden="true"
                        className="bracket-header-fill absolute inset-y-0 left-0"
                        style={{ background: seg.color, width: `${fillPct}%` }}
                      />
                      <span className="relative text-sm font-semibold tabular-nums tracking-[-0.01em]">
                        {fmt(seg.amount)}
                      </span>
                      <span className="relative text-[10px] font-semibold tracking-[0.06em] uppercase opacity-85 whitespace-nowrap">
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

        <ArrowRight
          aria-hidden="true"
          className="text-ink-soft hidden md:block"
          size={20}
          strokeWidth={1.75}
        />

        {/* Right column — forecast */}
        <div className="min-w-0 flex flex-col gap-3">
            <ResultCard
              label="Net après impôt"
              amount={
                <span className="flex items-center justify-between gap-3 w-full">
                  <Money
                    value={
                      netPeriod === 'month'
                        ? (net - total) / 12
                        : net - total
                    }
                  />
                  <PeriodPicker value={netPeriod} onChange={setNetPeriod} />
                </span>
              }
              amountTone="sage"
              tooltip={
                <>Ce que vous recevez réellement sur votre compte.</>
              }
            />
            <ResultCard
              label="Impôt total"
              amount={<Money value={total} />}
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
              amount={<Percent value={marg} />}
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

      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-8">
          <CalendarSync
            className="text-clay shrink-0"
            size={24}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div>
            <h2 className="text-2xl font-medium m-0 tracking-[-0.01em] leading-tight">
              Prélèvement à la source
            </h2>
            <p className="text-ink-muted text-[14px] m-0">
              L'administration applique chaque mois un taux à votre salaire
              pour anticiper l'impôt. Si ce taux ne correspond pas à votre
              situation réelle, un solde de régularisation apparaît en fin
              d'année.
            </p>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-center gap-1.5 mb-3.5 text-[12px] font-medium tracking-[0.14em] uppercase text-ink-soft">
            Taux moyen
            <InfoIcon>
              Impôt total ÷ revenu net imposable, exprimé en %. C'est le taux
              que l'administration fiscale utilise par défaut pour calculer
              votre prélèvement à la source.
            </InfoIcon>
          </div>
          <div className="w-fit mx-auto text-2xl font-medium tabular-nums tracking-[-0.01em] text-ink">
            <Percent value={avg} fractionDigits={2} />
          </div>
        </div>

        <div className="bg-cream-surface border border-cream-border rounded-app-lg px-6 py-5 shadow-app grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_2fr] gap-6 items-end">
          <div>
            <label
              htmlFor="pas-input"
              className="block mb-2.5 text-[13px] text-ink-muted font-medium uppercase tracking-[0.04em]"
            >
              Votre taux actuel
            </label>
            <div className="relative">
              <input
                type="number"
                id="pas-input"
                value={pas}
                min={0}
                max={45}
                step={0.1}
                onChange={(e) => setPas(parseFloat(e.target.value) || 0)}
                className="w-full py-2.5 pl-3.5 pr-9 text-lg font-medium border border-cream-border-strong rounded-app bg-cream-surface text-ink transition-[border-color,box-shadow] focus:outline-none focus:border-clay focus:shadow-[0_0_0_3px_var(--color-clay-soft)]"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-base text-ink-muted pointer-events-none">
                %
              </span>
            </div>
            <button
              type="button"
              onClick={resetPas}
              className="mt-2 text-[11px] text-clay hover:underline cursor-pointer"
            >
              ↻ Réinitialiser au taux moyen
            </button>
          </div>
          <div>
            <div className="text-xs text-ink-muted uppercase tracking-[0.04em] font-medium mb-1.5">
              {gapLabel}
            </div>
            <div
              className={`text-[28px] font-medium tracking-[-0.01em] tabular-nums mb-1 ${gapColor}`}
            >
              {gapTone === 'balanced' ? (
                <Money value={0} />
              ) : (
                <Money value={diff} signed />
              )}
            </div>
            <p className="text-[13px] text-ink-muted leading-[1.5] m-0">
              {gapSentence}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-8">
          <Wallet
            className="text-clay shrink-0"
            size={24}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div>
            <h2 className="text-2xl font-medium m-0 tracking-[-0.01em] leading-tight">
              Pouvoir d'achat
            </h2>
            <p className="text-ink-muted text-[14px] m-0">
              Repères mensuels calculés sur votre net après impôt — utiles
              pour cadrer un loyer ou une mensualité de crédit.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <BenchmarkCard
            label="Loyer max conseillé"
            amount={<Money value={((net - total) / 12) * 0.33} />}
            rule="≈ 1/3 du net"
            tooltip={
              <>
                Règle du taux d'effort retenue par la plupart des bailleurs :
                le loyer charges comprises ne devrait pas dépasser un tiers
                de votre revenu mensuel net.
              </>
            }
          />
          <BenchmarkCard
            label="Mensualité de crédit max"
            amount={<Money value={((net - total) / 12) * 0.35} />}
            rule="≤ 35 % du net"
            tooltip={
              <>
                Taux d'endettement maximum fixé par le HCSF pour les prêts
                immobiliers : la somme de toutes vos mensualités de crédit
                (assurance incluse) ne doit pas dépasser 35 % de votre
                revenu mensuel net.
              </>
            }
          />
          <BenchmarkCard
            label="Capacité d'épargne mensuelle"
            amount={<Money value={((net - total) / 12) * 0.2} />}
            rule="≈ 20 % du net"
            tooltip={
              <>
                Cible recommandée par la plupart des budgets type 50/30/20 :
                consacrer 10 à 20 % du revenu net à l'épargne.
              </>
            }
          />
        </div>
      </div>

      <p className="mt-8 text-xs text-ink-soft text-center">
        Calcul indicatif — ne tient pas compte du quotient familial, des
        réductions ni de la décote.
      </p>
    </div>
  )
}

function PeriodPicker({
  value,
  onChange,
}: {
  value: Period
  onChange: (p: Period) => void
}) {
  const options: { id: Period; label: string }[] = [
    { id: 'month', label: 'mensuel' },
    { id: 'year', label: 'annuel' },
  ]
  return (
    <span
      role="radiogroup"
      aria-label="Période"
      className="inline-flex bg-cream-alt rounded-md p-0.5 gap-0.5"
    >
      {options.map((o) => {
        const active = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium tracking-[0.06em] transition-colors ${
              active
                ? 'bg-cream-surface text-ink shadow-app'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </span>
  )
}

function ResultCard({
  label,
  amount,
  amountTone,
  tooltip,
}: {
  label: string
  amount: React.ReactNode
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
    <div className="bg-cream-surface border border-cream-border rounded-app px-4 py-3.5 shadow-app flex flex-col gap-1.5">
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

function BenchmarkCard({
  label,
  amount,
  rule,
  tooltip,
}: {
  label: string
  amount: React.ReactNode
  rule: string
  tooltip: React.ReactNode
}) {
  return (
    <div className="bg-cream-surface border border-cream-border rounded-app px-4 py-3.5 shadow-app flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.04em] uppercase text-ink-muted">
        {label}
        <InfoIcon>{tooltip}</InfoIcon>
      </span>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[22px] font-medium tracking-[-0.01em] tabular-nums text-ink">
          {amount}
        </span>
        <span className="text-[11px] font-medium tracking-[0.04em] uppercase text-ink-soft tabular-nums">
          {rule}
        </span>
      </span>
    </div>
  )
}
