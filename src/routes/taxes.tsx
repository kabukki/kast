import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Info, RotateCcw } from 'lucide-react'
import {
  Button,
  Money,
  Percent,
  Picker,
  StepHeading,
  Tooltip,
} from '../components'

type Period = 'month' | 'year'

const PERIOD_OPTIONS = [
  { id: 'month' as const, label: 'mensuel' },
  { id: 'year' as const, label: 'annuel' },
]

export const Route = createFileRoute('/taxes')({
  component: TaxJourney,
  head: () => ({
    meta: [{ title: "Impôts — Calculateur d'impôt sur le revenu (Barème 2026)" }],
  }),
})

// ----------------------------------------------------------------------------
// Domain model — barème, statuts, formules
// ----------------------------------------------------------------------------

type Bracket = {
  rate: number
  min: number
  max: number
  label: string
  color: string
}

const BRACKETS: ReadonlyArray<Bracket> = [
  { rate: 0, min: 0, max: 11497, label: '0 %', color: '#6f8b6e' },
  { rate: 0.11, min: 11497, max: 29315, label: '11 %', color: '#b5b265' },
  { rate: 0.3, min: 29315, max: 83823, label: '30 %', color: '#d9a05b' },
  { rate: 0.41, min: 83823, max: 180294, label: '41 %', color: '#c97a45' },
  {
    rate: 0.45,
    min: 180294,
    max: Number.POSITIVE_INFINITY,
    label: '45 %',
    color: '#b04a3a',
  },
]

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

const STATUS_TAGLINE: Record<Status, string> = {
  public: 'Fonction publique',
  etam: 'Employés, techniciens, agents de maîtrise',
  cadre: 'Cadres du privé',
  liberal: 'Profession libérale',
}

type ChargeBreakdown = { label: string; share: number; color: string }

// Approximations pédagogiques de la composition des charges sociales par statut.
// La somme par statut == STATUS_DEDUCTION[statut].
const STATUS_CHARGES: Record<Status, ChargeBreakdown[]> = {
  public: [
    { label: 'Pension civile', share: 0.11, color: '#5b9bd5' },
    { label: 'CSG / CRDS', share: 0.05, color: '#48a584' },
    { label: 'Contribution solidarité', share: 0.01, color: '#d99342' },
  ],
  etam: [
    { label: 'Sécurité sociale', share: 0.07, color: '#5b9bd5' },
    { label: 'Retraite', share: 0.08, color: '#48a584' },
    { label: 'Chômage', share: 0.02, color: '#d99342' },
    { label: 'CSG / CRDS', share: 0.05, color: '#c96442' },
  ],
  cadre: [
    { label: 'Sécurité sociale', share: 0.07, color: '#5b9bd5' },
    { label: 'Retraite cadres', share: 0.1, color: '#48a584' },
    { label: 'Chômage', share: 0.03, color: '#d99342' },
    { label: 'CSG / CRDS', share: 0.05, color: '#c96442' },
  ],
  liberal: [
    { label: 'URSSAF', share: 0.15, color: '#5b9bd5' },
    { label: 'Retraite (CARPV/CIPAV…)', share: 0.1, color: '#48a584' },
    { label: 'CSG / CRDS', share: 0.07, color: '#d99342' },
    { label: 'Autres cotisations', share: 0.02, color: '#c96442' },
  ],
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

function defaultPas(net: number) {
  const total = computeBrackets(Math.max(0, net)).reduce(
    (s, r) => s + r.tax,
    0,
  )
  return Math.round(net > 0 ? (total / net) * 1000 : 0) / 10
}

// ----------------------------------------------------------------------------
// Tax-specific helpers
// ----------------------------------------------------------------------------

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' €'

const EASE_OUT = [0.22, 0.61, 0.36, 1] as const

type StepId =
  | 'gross'
  | 'status'
  | 'charges'
  | 'brackets'
  | 'net'
  | 'pas'
  | 'power'

const STEP_ORDER: StepId[] = [
  'gross',
  'status',
  'charges',
  'brackets',
  'net',
  'pas',
  'power',
]

// ----------------------------------------------------------------------------
// Root component — owns the journey state
// ----------------------------------------------------------------------------

function TaxJourney() {
  const [gross, setGross] = useState<number | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [pas, setPas] = useState<number | null>(null)
  const [pasTouched, setPasTouched] = useState(false)
  const [netPeriod, setNetPeriod] = useState<Period>('month')

  const [stepIndex, setStepIndex] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const currentStep = STEP_ORDER[stepIndex]

  // Derived values — recompute on every change in any upstream input.
  const deduction = status ? STATUS_DEDUCTION[status] : 0
  const net = gross && status ? gross * (1 - deduction) : 0
  const rows = useMemo(() => computeBrackets(Math.max(0, net)), [net])
  const totalTax = useMemo(() => rows.reduce((s, r) => s + r.tax, 0), [rows])
  const avgRate = net > 0 ? (totalTax / net) * 100 : 0
  const margRate = marginalRate(net) * 100
  const netAfterTax = net - totalTax
  const effectivePas = pasTouched && pas !== null ? pas : defaultPas(net)
  const paid = net * (effectivePas / 100)
  const diff = paid - totalTax

  // When upstream inputs change AND the user hasn't manually overridden the
  // PAS rate, keep it synced with the new average. Once they edit it, leave
  // it alone (their override is intentional).
  useEffect(() => {
    if (!pasTouched) setPas(defaultPas(net))
  }, [net, pasTouched])

  const goNext = useCallback(() => {
    setDirection(1)
    setStepIndex((i) => Math.min(STEP_ORDER.length - 1, i + 1))
  }, [])

  const reset = useCallback(() => {
    setGross(null)
    setStatus(null)
    setPas(null)
    setPasTouched(false)
    setNetPeriod('month')
    setDirection(-1)
    setStepIndex(0)
  }, [])

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={currentStep}
        initial={{ opacity: 0, x: direction * 48 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -48 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="flex-1 flex items-center justify-center w-full max-w-3xl mx-auto"
      >
          {currentStep === 'gross' && (
            <StepGross gross={gross} onChange={setGross} onNext={goNext} />
          )}
          {currentStep === 'status' && (
            <StepStatus
              status={status}
              onChange={setStatus}
              onNext={goNext}
            />
          )}
          {currentStep === 'charges' && gross !== null && status !== null && (
            <StepCharges
              gross={gross}
              status={status}
              net={net}
              onNext={goNext}
            />
          )}
          {currentStep === 'brackets' && (
            <StepBrackets
              net={net}
              rows={rows}
              totalTax={totalTax}
              onNext={goNext}
            />
          )}
          {currentStep === 'net' && (
            <StepNet
              netAfterTax={netAfterTax}
              avgRate={avgRate}
              margRate={margRate}
              netPeriod={netPeriod}
              onPeriodChange={setNetPeriod}
              onNext={goNext}
            />
          )}
          {currentStep === 'pas' && (
            <StepPas
              avgRate={avgRate}
              pas={effectivePas}
              paid={paid}
              diff={diff}
              onChangePas={(value) => {
                setPasTouched(true)
                setPas(value)
              }}
              onReset={() => {
                setPasTouched(false)
                setPas(defaultPas(net))
              }}
              onNext={goNext}
            />
          )}
        {currentStep === 'power' && (
          <StepPower netAfterTax={netAfterTax} onReset={reset} />
        )}
      </motion.div>
    </AnimatePresence>
  )
}

// ----------------------------------------------------------------------------
// Step 1 — Gross income entry
// ----------------------------------------------------------------------------

function StepGross({
  gross,
  onChange,
  onNext,
}: {
  gross: number | null
  onChange: (n: number) => void
  onNext: () => void
}) {
  const displayValue = gross === null ? '' : String(Math.round(gross))
  const canAdvance = gross !== null && gross > 0

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <h1 className="font-display text-[36px] md:text-[48px] leading-[1.05] font-semibold tracking-[-0.02em] text-ink m-0 mb-3">
        Quel est votre salaire annuel brut&nbsp;?
      </h1>
      <p className="text-ink-muted text-[15px] md:text-[16px] m-0 mb-10">
        Tout commence par votre salaire affiché sur votre contrat, avant
        cotisations et avant impôt.
      </p>

      <div className="relative w-full max-w-md">
        <input
          type="number"
          inputMode="numeric"
          autoFocus
          value={displayValue}
          min={0}
          step={1000}
          placeholder="45 000"
          onChange={(e) => {
            const parsed = parseFloat(e.target.value)
            onChange(Number.isNaN(parsed) ? 0 : parsed)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canAdvance) onNext()
          }}
          className="w-full py-5 pl-6 pr-14 text-3xl md:text-4xl font-medium text-center border border-cream-border-strong rounded-app-lg bg-cream-surface text-ink tabular-nums transition-[border-color,box-shadow] focus:outline-none focus:border-clay focus:shadow-[0_0_0_3px_var(--color-clay-soft)] placeholder:text-ink-soft/60 placeholder:font-normal"
        />
        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-2xl text-ink-muted pointer-events-none">
          €
        </span>
      </div>

      <div className="mt-10">
        <Button
          icon={ArrowRight}
          onClick={onNext}
          disabled={!canAdvance}
          className="disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Commencer
        </Button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Step 2 — Status selector
// ----------------------------------------------------------------------------

function StepStatus({
  status,
  onChange,
  onNext,
}: {
  status: Status | null
  onChange: (s: Status) => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-col items-center">
      <StepHeading
        title={<>Très bien. Quel est votre statut&nbsp;?</>}
        subtitle="Les charges sociales retirées de votre brut dépendent de votre statut. C'est la première chose à connaître pour calculer ce que vous gardez vraiment."
      />

      <div
        role="radiogroup"
        aria-label="Statut"
        className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full"
      >
        {(['public', 'etam', 'cadre', 'liberal'] as Status[]).map((s) => {
          const active = status === s
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(s)}
              className={`group text-left p-4 rounded-app-lg border transition-all cursor-pointer ${
                active
                  ? 'bg-cream-surface border-clay shadow-[0_0_0_3px_var(--color-clay-soft)]'
                  : 'bg-cream-surface border-cream-border hover:border-cream-border-strong'
              }`}
            >
              <span className="block text-[15px] font-semibold tracking-[-0.01em] text-ink mb-1.5">
                {STATUS_LABEL[s]}
              </span>
              <p className="text-[12px] text-ink-muted leading-[1.4] m-0">
                {STATUS_TAGLINE[s]}
              </p>
            </button>
          )
        })}
      </div>

      <div className="mt-10">
        <Button
          icon={ArrowRight}
          onClick={onNext}
          disabled={status === null}
          className="disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Suivant
        </Button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Step 3 — Brut → Net imposable
// ----------------------------------------------------------------------------

function StepCharges({
  gross,
  status,
  net,
  onNext,
}: {
  gross: number
  status: Status
  net: number
  onNext: () => void
}) {
  const charges = STATUS_CHARGES[status]
  const totalDeduction = STATUS_DEDUCTION[status]
  const totalPct = Math.round(totalDeduction * 100)

  return (
    <div>
      <StepHeading
        title="Votre net imposable"
        subtitle={
          <>
            Du brut, on retire d'abord les charges sociales. Pour un{' '}
            <strong className="text-ink font-semibold">
              {STATUS_LABEL[status]}
            </strong>
            , ça représente environ{' '}
            <strong className="text-ink font-semibold">{totalPct}&nbsp;%</strong>{' '}
            du salaire. Voici la décomposition.
          </>
        }
      />

      <div className="bg-cream-surface border border-cream-border rounded-app-lg shadow-app p-6">
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-ink-soft">
            Salaire brut
          </span>
          <span className="text-lg font-medium tabular-nums text-ink">
            {fmt(gross)}
          </span>
        </div>

        {/* Animated decomposition bar */}
        <div className="h-12 w-full rounded-app overflow-hidden flex border border-cream-border bg-cream-alt">
          {charges.map((c, i) => {
            const widthPct = (c.share / 1) * 100
            return (
              <motion.div
                key={c.label}
                initial={{ width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{
                  duration: 0.6,
                  delay: 0.15 + i * 0.12,
                  ease: EASE_OUT,
                }}
                style={{ background: c.color }}
                className="h-full flex items-center justify-center text-[10px] font-semibold text-white/95 overflow-hidden"
                title={`${c.label} — ${Math.round(c.share * 100)} %`}
              >
                {c.share >= 0.06 ? `${Math.round(c.share * 100)} %` : ''}
              </motion.div>
            )
          })}
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: `${(1 - totalDeduction) * 100}%` }}
            transition={{
              duration: 0.6,
              delay: 0.15 + charges.length * 0.12,
              ease: EASE_OUT,
            }}
            className="h-full bg-sage/20 flex items-center justify-center text-[10px] font-semibold text-sage-deep overflow-hidden"
          >
            Net imposable
          </motion.div>
        </div>

        {/* Legend */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-2">
          {charges.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: 0.5 + i * 0.06,
              }}
              className="flex items-center gap-2 text-[12px]"
            >
              <span
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: c.color }}
              />
              <span className="text-ink-muted">{c.label}</span>
              <span className="ml-auto text-ink tabular-nums font-medium">
                {Math.round(c.share * 100)}&nbsp;%
              </span>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.85 }}
          className="mt-6 pt-5 border-t border-cream-border flex items-center justify-between gap-4"
        >
          <div>
            <div className="text-[11px] font-semibold tracking-[0.12em] uppercase text-sage-deep mb-1">
              Il reste — net imposable
            </div>
            <div className="text-[13px] text-ink-muted leading-[1.45]">
              C'est sur ce montant que l'impôt sur le revenu se calcule.
            </div>
          </div>
          <div className="text-3xl font-medium tabular-nums tracking-[-0.01em] text-sage shrink-0">
            <Money value={net} />
          </div>
        </motion.div>
      </div>

      <div className="mt-10 flex justify-center">
        <Button icon={ArrowRight} onClick={onNext}>
          Suivant
        </Button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Step 4 — The bracket principle
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Step 4 — Brackets (combined principle + user fill, with dot animation)
// ----------------------------------------------------------------------------

type BracketRow = ReturnType<typeof computeBrackets>[number]

const TOTAL_DOTS = 100
const TOTAL_ANIM_MS = 5000
const DOT_STAGGER_MS = TOTAL_ANIM_MS / TOTAL_DOTS
const DOT_FLIGHT_MS = 600

function StepBrackets({
  net,
  rows,
  totalTax,
  onNext,
}: {
  net: number
  rows: BracketRow[]
  totalTax: number
  onNext: () => void
}) {
  // Each dot is assigned to a bracket index according to its proportional
  // share of the net imposable. We walk brackets bottom-up: fill bracket 0
  // up to its cumulative dot count, then bracket 1, etc.
  const dotAssignments = useMemo(() => {
    if (net <= 0) return []
    const perDot = net / TOTAL_DOTS
    const out: number[] = []
    let remainingForBracket = rows[0]?.taxable ?? 0
    let bracketIdx = 0
    for (let i = 0; i < TOTAL_DOTS; i++) {
      // Move forward until we find a bracket that still has room for this dot.
      while (
        bracketIdx < rows.length - 1 &&
        remainingForBracket < perDot / 2
      ) {
        bracketIdx += 1
        remainingForBracket = rows[bracketIdx].taxable
      }
      out.push(bracketIdx)
      remainingForBracket -= perDot
    }
    return out
  }, [net, rows])

  // Dot count per bracket — derived from the assignments above.
  const dotsPerBracket = useMemo(() => {
    const counts = rows.map(() => 0)
    for (const idx of dotAssignments) counts[idx] += 1
    return counts
  }, [dotAssignments, rows])

  // Animated tax counter — incrementing alongside the dot flow.
  const [animatedTax, setAnimatedTax] = useState(0)
  const [doneOnce, setDoneOnce] = useState(false)
  // Per-bracket count of dots already landed. Drives the incremental fill.
  const [landedPerBracket, setLandedPerBracket] = useState<number[]>(() =>
    rows.map(() => 0),
  )
  // Bumped on every (re)play — forces the dot motion components to remount
  // so their initial → animate transition replays from scratch.
  const [playKey, setPlayKey] = useState(0)
  const [playing, setPlaying] = useState(false)
  const cancelRef = useRef<(() => void) | null>(null)

  const play = useCallback(() => {
    cancelRef.current?.()
    if (dotAssignments.length === 0) return
    setPlayKey((k) => k + 1)
    setPlaying(true)
    setAnimatedTax(0)
    setLandedPerBracket(rows.map(() => 0))
    let cancelled = false
    let landed = 0
    let taxAcc = 0
    const taxPerDot = totalTax / TOTAL_DOTS
    const tick = () => {
      if (cancelled) return
      const bucket = dotAssignments[landed]
      landed += 1
      taxAcc += taxPerDot
      setAnimatedTax(taxAcc)
      setLandedPerBracket((prev) => {
        const copy = prev.slice()
        copy[bucket] = (copy[bucket] ?? 0) + 1
        return copy
      })
      if (landed < TOTAL_DOTS) {
        window.setTimeout(tick, DOT_STAGGER_MS)
      } else {
        setAnimatedTax(totalTax)
        setPlaying(false)
        if (!doneOnce) setDoneOnce(true)
      }
    }
    const start = window.setTimeout(tick, DOT_FLIGHT_MS)
    cancelRef.current = () => {
      cancelled = true
      window.clearTimeout(start)
    }
  }, [dotAssignments, rows, totalTax, doneOnce])

  // Run once on mount.
  useEffect(() => {
    play()
    return () => cancelRef.current?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Silent re-sync if user edits gross/status after the animation is done.
  useEffect(() => {
    if (doneOnce && !playing) {
      setAnimatedTax(totalTax)
      setLandedPerBracket(dotsPerBracket)
    }
  }, [totalTax, doneOnce, dotsPerBracket, playing])

  const sourceRef = useRef<HTMLDivElement>(null)
  const bracketRefs = useRef<Array<HTMLDivElement | null>>([])

  // Compute relative offsets (source → each bracket) for the dot flight.
  const [offsets, setOffsets] = useState<Array<{ dx: number; dy: number }>>([])
  useEffect(() => {
    const compute = () => {
      const src = sourceRef.current?.getBoundingClientRect()
      if (!src) return
      const next = bracketRefs.current.map((el) => {
        if (!el) return { dx: 0, dy: 0 }
        const r = el.getBoundingClientRect()
        return {
          dx: r.left + r.width / 2 - (src.left + src.width / 2),
          dy: r.top + r.height / 2 - (src.top + src.height / 2),
        }
      })
      setOffsets(next)
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [rows.length])

  return (
    <div className="text-center">
      <StepHeading
        title="Votre impôt sur le revenu"
        subtitle={
          <>
            L'impôt français est <strong>progressif</strong> : votre revenu net
            imposable est découpé en tranches, et chaque tranche est taxée à
            son propre taux.
          </>
        }
      />

      {/* Source — net imposable at the top */}
        <div
          ref={sourceRef}
          className="mb-8 relative text-5xl md:text-6xl font-medium tabular-nums tracking-[-0.02em] text-ink"
        >
          <Money value={net} />
          {/* Dots emitter — overlaid, each dot flies to its bracket */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {dotAssignments.map((bracketIdx, i) => {
              const o = offsets[bracketIdx] ?? { dx: 0, dy: 0 }
              const color = rows[bracketIdx]?.color ?? '#888'
              return (
                <motion.span
                  key={`${playKey}:${i}`}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                  animate={{
                    x: o.dx,
                    y: o.dy,
                    opacity: [0, 1, 1, 0],
                    scale: [0.5, 1, 1, 0.6],
                  }}
                  transition={{
                    duration: DOT_FLIGHT_MS / 1000,
                    delay: (i * DOT_STAGGER_MS) / 1000,
                    ease: EASE_OUT,
                    times: [0, 0.15, 0.85, 1],
                  }}
                  style={{ background: color }}
                  className="absolute w-2 h-2 rounded-full"
                />
              )
            })}
          </div>
        </div>

      {/* Brackets row */}
      <div className="grid grid-cols-5 gap-2 mb-10">
        {rows.map((r, i) => {
          const capacity =
            r.max === Number.POSITIVE_INFINITY ? r.taxable : r.max - r.min
          const finalFillPct =
            capacity > 0 ? Math.min(100, (r.taxable / capacity) * 100) : 0
          const target = dotsPerBracket[i] ?? 0
          const landed = landedPerBracket[i] ?? 0
          const liveFillPct =
            target > 0 ? (landed / target) * finalFillPct : 0
          const isActive = r.taxable > 0
          return (
            <div
              key={r.label}
              ref={(el) => {
                bracketRefs.current[i] = el
              }}
              className={clsx(
                'flex flex-col items-stretch bg-cream-surface border border-cream-border rounded-app overflow-hidden shadow-app transition-opacity',
                !isActive && 'opacity-40',
              )}
            >
              {/* Bucket fill */}
              <div className="relative h-32 bg-cream-alt overflow-hidden flex items-end">
                <motion.div
                  initial={false}
                  animate={{ height: `${liveFillPct}%` }}
                  transition={{ duration: DOT_STAGGER_MS / 1000, ease: 'linear' }}
                  className="absolute inset-x-0 bottom-0"
                  style={{ background: r.color }}
                />
                <span
                  className="relative w-full text-center text-[13px] font-semibold tabular-nums text-ink mix-blend-multiply pb-2"
                  style={{ color: r.color }}
                >
                  {r.label}
                </span>
              </div>
              {/* Footer */}
              <div className="px-2 py-2 border-t border-cream-border text-center">
                {isActive && (
                  <div className="text-[12px] tabular-nums text-ink font-medium">
                    {fmt(r.taxable)}
                  </div>
                )}
                {isActive && r.tax > 0 && (
                  <div className="text-[11px] tabular-nums text-rust">
                    + {fmt(r.tax)} d'impôt
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Live counter */}
      <div className="flex items-center justify-between bg-ink text-cream rounded-app-lg px-6 py-5 shadow-app">
        <div className="text-left">
          <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-cream/70 mb-1">
            Total à payer
          </div>
          <div className="text-[13px] text-cream/80 leading-[1.45]">
            Somme des impôts dus dans chaque tranche.
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-3xl font-medium tabular-nums tracking-[-0.01em] text-cream">
            <Money value={animatedTax} />
          </div>
          <button
            type="button"
            onClick={play}
            disabled={playing}
            className="text-xl text-cream/70 hover:text-cream disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="mt-10 flex justify-center">
        <Button icon={ArrowRight} onClick={onNext}>
          Suivant
        </Button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Step 6 — Net after tax
// ----------------------------------------------------------------------------

function StepNet({
  netAfterTax,
  avgRate,
  margRate,
  netPeriod,
  onPeriodChange,
  onNext,
}: {
  netAfterTax: number
  avgRate: number
  margRate: number
  netPeriod: Period
  onPeriodChange: (p: Period) => void
  onNext: () => void
}) {
  const shown =
    netPeriod === 'month' ? netAfterTax / 12 : netAfterTax

  return (
    <div>
      <StepHeading
        title="Sur votre compte"
        subtitle="Après les charges sociales et l'impôt sur le revenu, voici ce que vous gardez réellement."
      />

      <div className="bg-cream-surface border border-cream-border rounded-app-lg shadow-app p-8">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-ink-soft">
            Net après impôt
          </div>
          <Picker
            ariaLabel="Période"
            options={PERIOD_OPTIONS}
            value={netPeriod}
            onChange={onPeriodChange}
          />
        </div>
        <div className="text-[56px] md:text-[72px] leading-none font-medium tracking-[-0.02em] tabular-nums text-sage">
          <Money value={shown} />
        </div>
        <p className="mt-4 text-ink-muted text-[14px] m-0">
          Vous gardez{' '}
          <strong className="text-ink font-semibold">
            <Money value={shown} />
          </strong>{' '}
          {netPeriod === 'month' ? 'par mois' : 'par an'} une fois l'impôt
          acquitté.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <ResultCard
          label="Taux moyen"
          amount={<Percent value={avgRate} fractionDigits={1} />}
          tooltip={
            <>
              Impôt total ÷ revenu net imposable, exprimé en %. C'est aussi
              le taux qu'utilise l'administration par défaut pour le
              prélèvement à la source.
            </>
          }
        />
        <ResultCard
          label="Taux marginal"
          amount={<Percent value={margRate} />}
          tooltip={
            <>
              Taux appliqué à votre dernier euro gagné — c'est-à-dire la
              tranche la plus haute que vous atteignez. Indique ce que
              coûterait en impôt 1 € de revenu supplémentaire.
            </>
          }
        />
      </div>

      <div className="mt-10 flex justify-center">
        <Button icon={ArrowRight} onClick={onNext}>
          Suivant
        </Button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Step 7 — Prélèvement à la source
// ----------------------------------------------------------------------------

function StepPas({
  avgRate,
  pas,
  paid,
  diff,
  onChangePas,
  onReset,
  onNext,
}: {
  avgRate: number
  pas: number
  paid: number
  diff: number
  onChangePas: (n: number) => void
  onReset: () => void
  onNext: () => void
}) {
  let gapTone: 'balanced' | 'refund' | 'due' = 'balanced'
  let gapLabel = 'Solde équilibré'
  let gapSentence = "Votre taux PAS correspond exactement à l'impôt dû."
  if (Math.abs(diff) >= 1) {
    if (diff > 0) {
      gapTone = 'refund'
      gapLabel = 'Remboursement attendu'
      gapSentence = "Le fisc vous remboursera ce trop-perçu en fin d'année."
    } else {
      gapTone = 'due'
      gapLabel = 'Solde à payer'
      gapSentence = "Vous devrez régler ce complément en fin d'année."
    }
  }

  const gapColor =
    gapTone === 'refund'
      ? 'text-sage'
      : gapTone === 'due'
        ? 'text-rust'
        : 'text-ink'

  const gapBg =
    gapTone === 'refund'
      ? 'bg-sage/10 border-sage/30'
      : gapTone === 'due'
        ? 'bg-rust/10 border-rust/30'
        : 'bg-cream-alt border-cream-border'

  return (
    <div>
      <StepHeading
        title={<>Le prélèvement à la source</>}
        subtitle={
          <>
            Vous ne payez pas cet impôt en une fois en fin d'année.
            L'administration prélève chaque mois un pourcentage de votre
            salaire, basé sur votre situation passée. Ce pourcentage, c'est le{' '}
            <strong className="text-ink font-semibold">taux moyen</strong>.
          </>
        }
      />

      <div className="bg-cream-surface border border-cream-border rounded-app-lg shadow-app p-6 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_2fr] gap-6 items-end">
          <div>
            <label
              htmlFor="pas-input"
              className="block mb-2.5 text-[12px] text-ink-muted font-medium uppercase tracking-[0.04em]"
            >
              Votre taux PAS
            </label>
            <div className="relative">
              <input
                type="number"
                id="pas-input"
                value={pas}
                min={0}
                max={45}
                step={0.1}
                onChange={(e) => onChangePas(parseFloat(e.target.value) || 0)}
                className="w-full py-2.5 pl-3.5 pr-9 text-lg font-medium border border-cream-border-strong rounded-app bg-cream-surface text-ink transition-[border-color,box-shadow] focus:outline-none focus:border-clay focus:shadow-[0_0_0_3px_var(--color-clay-soft)] tabular-nums"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-base text-ink-muted pointer-events-none">
                %
              </span>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="mt-2 text-[11px] text-clay hover:underline cursor-pointer"
            >
              ↻ Réinitialiser au taux moyen ({avgRate.toFixed(1).replace('.', ',')} %)
            </button>
          </div>

          <div>
            <div className="text-[12px] text-ink-muted uppercase tracking-[0.04em] font-medium mb-1">
              Prélevé sur l'année
            </div>
            <div className="text-[28px] font-medium tabular-nums tracking-[-0.01em] text-ink mb-1">
              <Money value={paid} />
            </div>
            <p className="text-[12px] text-ink-muted m-0">
              soit {(paid / 12).toLocaleString('fr-FR', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              })} prélevés chaque mois.
            </p>
          </div>
        </div>
      </div>

      <motion.div
        key={gapTone}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className={`rounded-app-lg border px-6 py-5 ${gapBg}`}
      >
        <div className="text-[12px] text-ink-muted uppercase tracking-[0.04em] font-medium mb-1">
          {gapLabel}
        </div>
        <div
          className={`text-[32px] font-medium tracking-[-0.01em] tabular-nums mb-1 ${gapColor}`}
        >
          {gapTone === 'balanced' ? (
            <Money value={0} />
          ) : (
            <Money value={diff} signed />
          )}
        </div>
        <p className="text-[13px] text-ink-muted leading-[1.55] m-0">
          {gapSentence}
        </p>
      </motion.div>

      <div className="mt-10 flex justify-center">
        <Button icon={ArrowRight} onClick={onNext}>
          Suivant
        </Button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Step 8 — Purchasing power
// ----------------------------------------------------------------------------

function StepPower({
  netAfterTax,
  onReset,
}: {
  netAfterTax: number
  onReset: () => void
}) {
  const monthly = netAfterTax / 12

  return (
    <div>
      <StepHeading
        title={<>Votre pouvoir d'achat</>}
        subtitle="Repères mensuels calculés sur votre net après impôt — utiles pour cadrer un loyer ou une mensualité de crédit."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BenchmarkCard
          label="Loyer max conseillé"
          amount={<Money value={monthly * 0.33} />}
          rule="≈ 1/3 du net"
          tooltip={
            <>
              Règle du taux d'effort retenue par la plupart des bailleurs :
              le loyer charges comprises ne devrait pas dépasser un tiers de
              votre revenu mensuel net.
            </>
          }
        />
        <BenchmarkCard
          label="Mensualité de crédit max"
          amount={<Money value={monthly * 0.35} />}
          rule="≤ 35 % du net"
          tooltip={
            <>
              Taux d'endettement maximum fixé par le HCSF pour les prêts
              immobiliers : la somme de toutes vos mensualités de crédit
              (assurance incluse) ne doit pas dépasser 35 % de votre revenu
              mensuel net.
            </>
          }
        />
        <BenchmarkCard
          label="Capacité d'épargne mensuelle"
          amount={<Money value={monthly * 0.2} />}
          rule="≈ 20 % du net"
          tooltip={
            <>
              Cible recommandée par la plupart des budgets type 50/30/20 :
              consacrer 10 à 20 % du revenu net à l'épargne.
            </>
          }
        />
      </div>

      <div className="mt-10 flex justify-center">
        <Button icon={RotateCcw} onClick={onReset}>
          Recommencer
        </Button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Shared small components
// ----------------------------------------------------------------------------

function ResultCard({
  label,
  amount,
  tooltip,
}: {
  label: string
  amount: React.ReactNode
  tooltip: React.ReactNode
}) {
  return (
    <div className="bg-cream-surface border border-cream-border rounded-app px-4 py-3.5 shadow-app flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.04em] uppercase text-ink-muted">
        {label}
        <Tooltip content={tooltip}>
          <Info size={14} strokeWidth={2} aria-hidden="true" />
        </Tooltip>
      </span>
      <span className="text-[22px] font-medium tracking-[-0.01em] tabular-nums text-ink">
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
    <div className="bg-cream-surface border border-cream-border rounded-app-lg px-5 py-4 shadow-app flex flex-col gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.04em] uppercase text-ink-muted">
        {label}
        <Tooltip content={tooltip}>
          <Info size={14} strokeWidth={2} aria-hidden="true" />
        </Tooltip>
      </span>
      <span className="text-[26px] font-medium tracking-[-0.01em] tabular-nums text-ink">
        {amount}
      </span>
      <span className="text-[11px] font-medium tracking-[0.04em] uppercase text-ink-soft tabular-nums">
        {rule}
      </span>
    </div>
  )
}

