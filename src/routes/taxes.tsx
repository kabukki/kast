import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Info, RotateCcw } from 'lucide-react'
import { Button, Money, Percent, Picker, Tooltip } from '../components'
import {
  STATUS_CHARGES,
  STATUS_DEDUCTION,
  STATUS_LABEL,
  STATUS_TAGLINE,
  computeBrackets,
  fmtEUR as fmt,
  type BracketRow,
  type Status,
} from '../lib/taxes'

export const Route = createFileRoute('/taxes')({
  component: TaxJourney,
  head: () => ({
    meta: [{ title: "Impôts — Calculateur d'impôt sur le revenu (Barème 2026)" }],
  }),
})

const EASE_OUT = [0.22, 0.61, 0.36, 1] as const
const FADE_IN_UP = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.4, ease: EASE_OUT },
} as const

function TaxJourney() {
  const [gross, setGross] = useState<number | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [flowStarted, setFlowStarted] = useState(false)
  const [flowDone, setFlowDone] = useState(false)
  // PAS rate. `null` means "use the computed average". Once the user edits it
  // we store their override and stop snapping it to the average.
  const [pas, setPas] = useState<number | null>(null)
  const [pasTouched, setPasTouched] = useState(false)

  // Derived — downstream values are 0 until gross AND status are both set.
  const hasInputs = gross !== null && gross > 0 && status !== null
  const deduction = status ? STATUS_DEDUCTION[status] : 0
  const net = hasInputs ? gross * (1 - deduction) : 0
  const charges = status ? STATUS_CHARGES[status] : null
  const rows = useMemo(() => computeBrackets(Math.max(0, net)), [net])
  const totalTax = useMemo(() => rows.reduce((s, r) => s + r.tax, 0), [rows])

  // PAS — defaults to the average rate; user can override.
  const avgRate = net > 0 ? (totalTax / net) * 100 : 0
  const effectivePas = pasTouched && pas !== null ? pas : avgRate
  const paid = net * (effectivePas / 100)
  const diff = paid - totalTax
  const netAfterTax = net - totalTax

  // Visibility predicates — picker only appears once a gross has been entered,
  // and the breakdown requires both gross + status.
  const showPicker = gross !== null && gross > 0
  const showBreakdown = hasInputs
  const showBrackets = flowStarted && hasInputs
  const showCalculateCta = hasInputs && !flowStarted
  // PAS + Power appear once the bracket dot-flow animation has finished.
  const showPasAndPower = flowDone && hasInputs

  const reset = () => {
    setStatus(null)
    setFlowStarted(false)
    setFlowDone(false)
    setPas(null)
    setPasTouched(false)
  }

  return (
    <div className="w-full min-h-screen bg-cream py-12 px-4">
      <div className="max-w-3xl mx-auto flex flex-col items-stretch gap-16">
          <GrossSection gross={gross} onChange={setGross} />
          <AnimatePresence>
            {showPicker && (
              <StatusSection
                key="picker"
                status={status}
                onChange={setStatus}
              />
            )}
          </AnimatePresence>
          <AnimatePresence mode="popLayout">
            {showBreakdown && charges && gross !== null && status !== null && (
              <ChargesSection
                key={`charges-${status}`}
                charges={charges}
                gross={gross}
                status={status}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showBreakdown && charges && (
              <NetBeforeTaxSection
                key="net-imposable"
                net={net}
                enterDelay={0.2 + (charges.length - 1) * 0.45 + 0.35 + 0.1}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showCalculateCta && (
              <motion.div
                key="cta-calc"
                {...FADE_IN_UP}
                className="flex justify-center"
              >
                <Button
                  icon={ArrowRight}
                  onClick={() => setFlowStarted(true)}
                >
                  Calculer mes impôts
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showBrackets && (
              <BracketsSection key="buckets" rows={rows} net={net} />
            )}
          </AnimatePresence>
          {showBrackets && (
            <NetAfterTaxSection
              net={net}
              totalTax={totalTax}
              onDone={() => setFlowDone(true)}
            />
          )}
          {/* Reveal sequence after the dot flow completes:
             PAS → Power → Recommencer, staggered to feel one-after-another. */}
          <AnimatePresence>
            {showPasAndPower && (
              <PasSection
                key="pas"
                avgRate={avgRate}
                pas={effectivePas}
                paid={paid}
                diff={diff}
                onChangePas={(v) => {
                  setPasTouched(true)
                  setPas(v)
                }}
                onReset={() => {
                  setPasTouched(false)
                  setPas(null)
                }}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showPasAndPower && (
              <PowerSection
                key="power"
                netAfterTax={netAfterTax}
                enterDelay={2.5}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showPasAndPower && (
              <motion.div
                key="cta-reset"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: EASE_OUT, delay: 5 }}
                className="flex justify-center"
              >
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink cursor-pointer transition-colors"
                >
                  <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
                  Recommencer
                </button>
              </motion.div>
            )}
          </AnimatePresence>
      </div>
    </div>
  )
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: React.ReactNode
  subtitle: React.ReactNode
}) {
  return (
    <div className="text-center text-balance mb-2 max-w-xl mx-auto">
      <h2 className="font-display text-2xl md:text-3xl leading-tight font-semibold tracking-tight text-ink m-0">
        {title}
      </h2>
      <p className="text-ink-muted text-sm md:text-base m-0 mt-2 leading-snug">
        {subtitle}
      </p>
    </div>
  )
}

function GrossSection({
  gross,
  onChange,
}: {
  gross: number | null
  onChange: (n: number | null) => void
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <SectionHeading
        title={<>Quel est votre salaire annuel brut&nbsp;?</>}
        subtitle="Tout commence par votre salaire affiché sur votre contrat, avant cotisations et avant impôt."
      />
      <div className="flex items-baseline justify-center gap-2 text-5xl md:text-6xl font-medium tabular-nums tracking-tight text-ink">
        <input
          type="number"
          inputMode="numeric"
          autoFocus
          value={gross === null ? '' : Math.round(gross)}
          min={0}
          step={1000}
          placeholder="0"
          onChange={(e) => {
            const v = e.target.value
            if (v === '') {
              onChange(null)
              return
            }
            const n = parseFloat(v)
            onChange(Number.isNaN(n) ? null : n)
          }}
          className="bg-transparent border-0 outline-none text-center leading-tight caret-clay focus:outline-none placeholder:text-ink-soft/40 field-sizing-content min-w-[1ch] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span aria-hidden="true">€</span>
      </div>
    </div>
  )
}

function StatusSection({
  status,
  onChange,
}: {
  status: Status | null
  onChange: (s: Status) => void
}) {
  return (
    <motion.div {...FADE_IN_UP} className="flex flex-col items-center gap-2">
      <SectionHeading
        title={<>Quel est votre statut&nbsp;?</>}
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
            className={`text-left p-4 rounded-app-lg border transition-all cursor-pointer ${
              active
                ? 'bg-cream-surface border-clay shadow-[0_0_0_3px_var(--color-clay-soft)]'
                : 'bg-cream-surface border-cream-border hover:border-cream-border-strong'
            }`}
          >
            <span className="block text-base font-semibold tracking-tight text-ink mb-2">
              {STATUS_LABEL[s]}
            </span>
            <p className="text-xs text-ink-muted leading-snug m-0">
              {STATUS_TAGLINE[s]}
            </p>
          </button>
        )
      })}
      </div>
    </motion.div>
  )
}

function ChargesSection({
  charges,
  gross,
  status,
}: {
  charges: typeof STATUS_CHARGES[Status]
  gross: number
  status: Status
}) {
  const ROW_STAGGER = 0.45
  const ROW_BASE_DELAY = 0.2

  return (
    <motion.div {...FADE_IN_UP} className="flex flex-col items-center gap-2">
      <SectionHeading
        title="Du brut au net imposable"
        subtitle={
          <>
            Du brut, on retire d'abord les charges sociales. Pour un{' '}
            <strong className="text-ink font-semibold">
              {STATUS_LABEL[status]}
            </strong>
            , ça représente environ{' '}
            <strong className="text-ink font-semibold">
              {Math.round(STATUS_DEDUCTION[status] * 100)}&nbsp;%
            </strong>{' '}
            du salaire. Voici la décomposition.
          </>
        }
      />
      <div className="w-full bg-cream-surface border border-cream-border rounded-app-lg shadow-app">
        {charges.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.35,
              delay: ROW_BASE_DELAY + i * ROW_STAGGER,
              ease: EASE_OUT,
            }}
            className={`flex items-center justify-between p-4 ${
              i > 0 ? 'border-t border-cream-border' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block size-2 rounded-full shrink-0"
                style={{ background: c.color }}
              />
              <span className="text-sm text-ink-muted">{c.label}</span>
              <span className="text-xs tabular-nums text-ink-soft">
                {Math.round(c.share * 100)}&nbsp;%
              </span>
            </div>
            <span className="text-base font-medium tabular-nums text-rust">
              − {fmt(gross * c.share)}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

function NetBeforeTaxSection({
  net,
  enterDelay = 0,
}: {
  net: number
  enterDelay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: enterDelay }}
      className="flex flex-col items-center gap-2 text-center"
    >
      <SectionHeading
        title="Votre net imposable"
        subtitle="C'est sur ce montant que l'impôt sur le revenu se calcule."
      />
      <span className="text-5xl md:text-6xl font-medium tabular-nums leading-tight tracking-tight text-rust">
        <Money value={net} />
      </span>
    </motion.div>
  )
}

const TOTAL_DOTS = 100
const TOTAL_ANIM_MS = 4500
const DOT_STAGGER_MS = TOTAL_ANIM_MS / TOTAL_DOTS
const DOT_FLIGHT_MS = 600
const FLOW_START_DELAY_MS = 650

function BracketsSection({
  rows,
  net,
}: {
  rows: BracketRow[]
  net: number
}) {
  const dotAssignments = useMemo(() => {
    if (net <= 0) return []
    const perDot = net / TOTAL_DOTS
    const out: number[] = []
    let remainingForBracket = rows[0]?.taxable ?? 0
    let bracketIdx = 0
    for (let i = 0; i < TOTAL_DOTS; i++) {
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

  const dotsPerBracket = useMemo(() => {
    const counts = rows.map(() => 0)
    for (const idx of dotAssignments) counts[idx] += 1
    return counts
  }, [dotAssignments, rows])

  const [landedPerBracket, setLandedPerBracket] = useState<number[]>(() =>
    rows.map(() => 0),
  )
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    cancelRef.current?.()
    setLandedPerBracket(rows.map(() => 0))
    let cancelled = false
    let landed = 0
    const tick = () => {
      if (cancelled) return
      const bucket = dotAssignments[landed]
      landed += 1
      setLandedPerBracket((prev) => {
        const copy = prev.slice()
        copy[bucket] = (copy[bucket] ?? 0) + 1
        return copy
      })
      if (landed < TOTAL_DOTS) {
        window.setTimeout(tick, DOT_STAGGER_MS)
      }
    }
    const start = window.setTimeout(tick, FLOW_START_DELAY_MS + DOT_FLIGHT_MS)
    cancelRef.current = () => {
      cancelled = true
      window.clearTimeout(start)
    }
    return () => cancelRef.current?.()
  }, [dotAssignments, rows])

  const bracketRefs = useRef<Array<HTMLDivElement | null>>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const [offsets, setOffsets] = useState<Array<{ dx: number; dy: number }>>([])

  useEffect(() => {
    const compute = () => {
      const refs = bracketRefs.current.filter(Boolean) as HTMLDivElement[]
      const container = containerRef.current
      if (refs.length === 0 || !container) return
      const containerRect = container.getBoundingClientRect()
      const srcX = containerRect.left + containerRect.width / 2
      const srcY = containerRect.top - 80
      const next = bracketRefs.current.map((el) => {
        if (!el) return { dx: 0, dy: 0 }
        const r = el.getBoundingClientRect()
        return {
          dx: r.left + r.width / 2 - srcX,
          dy: r.top + r.height / 2 - srcY,
        }
      })
      setOffsets(next)
    }
    const t = window.setTimeout(compute, FLOW_START_DELAY_MS)
    window.addEventListener('resize', compute)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', compute)
    }
  }, [rows.length])

  return (
    <motion.div
      {...FADE_IN_UP}
      ref={containerRef}
      className="relative"
    >
      <div className="pointer-events-none absolute -top-20 left-1/2">
        {dotAssignments.map((bracketIdx, i) => {
          const o = offsets[bracketIdx] ?? { dx: 0, dy: 0 }
          const color = rows[bracketIdx]?.color ?? '#888'
          return (
            <motion.span
              key={i}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
              animate={{
                x: o.dx,
                y: o.dy,
                opacity: [0, 1, 1, 0],
                scale: [0.5, 1, 1, 0.6],
              }}
              transition={{
                duration: DOT_FLIGHT_MS / 1000,
                delay:
                  FLOW_START_DELAY_MS / 1000 +
                  (i * DOT_STAGGER_MS) / 1000,
                ease: EASE_OUT,
                times: [0, 0.15, 0.85, 1],
              }}
              style={{ background: color }}
              className="absolute w-2 h-2 rounded-full"
            />
          )
        })}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {rows.map((r, i) => {
          const capacity =
            r.max === Number.POSITIVE_INFINITY ? r.taxable : r.max - r.min
          const finalFillPct =
            capacity > 0 ? Math.min(100, (r.taxable / capacity) * 100) : 0
          const target = dotsPerBracket[i] ?? 0
          const landed = landedPerBracket[i] ?? 0
          const fillPct = target > 0 ? (landed / target) * finalFillPct : 0
          return (
            <BracketBucket
              key={r.label}
              row={r}
              fillPct={fillPct}
              bucketRef={(el) => {
                bracketRefs.current[i] = el
              }}
            />
          )
        })}
      </div>
    </motion.div>
  )
}

function BracketBucket({
  row,
  fillPct,
  bucketRef,
}: {
  row: BracketRow
  fillPct: number
  bucketRef?: (el: HTMLDivElement | null) => void
}) {
  const isActive = row.taxable > 0
  return (
    <div
      ref={bucketRef}
      className={clsx(
        'flex flex-col items-stretch bg-cream-surface border border-cream-border rounded-app overflow-hidden shadow-app',
        !isActive && 'opacity-40',
      )}
    >
      <div className="relative h-32 bg-cream-alt overflow-hidden flex items-end">
        <motion.div
          initial={false}
          animate={{ height: `${fillPct}%` }}
          transition={{ duration: 0.1, ease: 'linear' }}
          className="absolute inset-x-0 bottom-0"
          style={{ background: row.color }}
        />
        <span
          className="relative w-full text-center text-sm font-semibold tabular-nums mix-blend-multiply pb-2"
          style={{ color: row.color }}
        >
          {row.label}
        </span>
      </div>
      <div className="px-2 py-2 border-t border-cream-border text-center min-h-11">
        {isActive && (
          <div className="text-xs tabular-nums text-ink font-medium">
            {fmt(row.taxable)}
          </div>
        )}
        {isActive && row.tax > 0 && (
          <div className="text-xs tabular-nums text-rust">
            + {fmt(row.tax)} d'impôt
          </div>
        )}
      </div>
    </div>
  )
}

type Period = 'month' | 'year'

const PERIOD_OPTIONS = [
  { id: 'year' as const, label: 'par an' },
  { id: 'month' as const, label: 'par mois' },
]

function NetAfterTaxSection({
  net,
  totalTax,
  onDone,
}: {
  net: number
  totalTax: number
  onDone?: () => void
}) {
  const [animatedTax, setAnimatedTax] = useState(0)
  const [done, setDone] = useState(false)
  const [period, setPeriod] = useState<Period>('year')

  useEffect(() => {
    let cancelled = false
    let landed = 0
    let taxAcc = 0
    const taxPerDot = totalTax / TOTAL_DOTS
    const tick = () => {
      if (cancelled) return
      landed += 1
      taxAcc += taxPerDot
      setAnimatedTax(taxAcc)
      if (landed < TOTAL_DOTS) {
        window.setTimeout(tick, DOT_STAGGER_MS)
      } else {
        setAnimatedTax(totalTax)
        setDone(true)
        onDone?.()
      }
    }
    const start = window.setTimeout(tick, FLOW_START_DELAY_MS + DOT_FLIGHT_MS)
    return () => {
      cancelled = true
      window.clearTimeout(start)
    }
  }, [totalTax, onDone])

  const netAfterTax = net - animatedTax
  const shown = period === 'month' ? netAfterTax / 12 : netAfterTax

  return (
    <AnimatePresence>
      {done && (
        <motion.div key="net-after-tax" {...FADE_IN_UP}>
          <div className="flex flex-col items-center gap-3 text-center">
            <SectionHeading
              title="Sur votre compte"
              subtitle="Ce qu'il vous reste après le paiement de l'impôt sur le revenu."
            />
            <span className="text-5xl md:text-6xl font-medium tabular-nums leading-tight tracking-tight text-sage">
              <Money value={shown} />
            </span>
            <Picker
              ariaLabel="Période"
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PasSection({
  avgRate,
  pas,
  paid,
  diff,
  onChangePas,
  onReset,
}: {
  avgRate: number
  pas: number
  paid: number
  diff: number
  onChangePas: (n: number) => void
  onReset: () => void
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="flex flex-col items-center gap-2"
    >
      <SectionHeading
        title={<>Le prélèvement à la source</>}
        subtitle={
          <>
            Vous ne payez pas cet impôt en une fois en fin d'année.
            L'administration prélève chaque mois un pourcentage de votre
            salaire, basé sur votre situation passée. Ce pourcentage, c'est
            le <strong className="text-ink font-semibold">taux moyen</strong>.
          </>
        }
      />

      <div className="w-full bg-cream-surface border border-cream-border rounded-app-lg shadow-app p-6">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_2fr] gap-6 items-end">
          <div>
            <label
              htmlFor="pas-input"
              className="block mb-2.5 text-xs text-ink-muted font-medium uppercase tracking-wider"
            >
              Votre taux PAS
            </label>
            <div className="relative">
              <input
                type="number"
                id="pas-input"
                value={pas.toFixed(1)}
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
              className="mt-2 text-xs text-clay hover:underline cursor-pointer"
            >
              ↻ Réinitialiser au taux moyen (
              <Percent value={avgRate} fractionDigits={1} />)
            </button>
          </div>

          <div>
            <div className="text-xs text-ink-muted uppercase tracking-wider font-medium mb-1">
              Prélevé sur l'année
            </div>
            <div className="text-3xl font-medium tabular-nums tracking-tight text-ink mb-1">
              <Money value={paid} />
            </div>
            <p className="text-xs text-ink-muted m-0">
              soit{' '}
              {(paid / 12).toLocaleString('fr-FR', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              })}{' '}
              prélevés chaque mois.
            </p>
          </div>
        </div>
      </div>

      <motion.div
        key={gapTone}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className={`w-full rounded-app-lg border px-6 py-5 ${gapBg}`}
      >
        <div className="text-xs text-ink-muted uppercase tracking-wider font-medium mb-1">
          {gapLabel}
        </div>
        <div
          className={`text-3xl font-medium tracking-tight tabular-nums mb-1 ${gapColor}`}
        >
          {gapTone === 'balanced' ? (
            <Money value={0} />
          ) : (
            <Money value={diff} signed />
          )}
        </div>
        <p className="text-sm text-ink-muted leading-snug m-0">
          {gapSentence}
        </p>
      </motion.div>
    </motion.div>
  )
}

function PowerSection({
  netAfterTax,
  enterDelay = 0,
}: {
  netAfterTax: number
  enterDelay?: number
}) {
  const monthly = netAfterTax / 12
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: enterDelay }}
      className="flex flex-col items-center gap-3"
    >
      <SectionHeading
        title={<>Votre pouvoir d'achat</>}
        subtitle="Repères mensuels calculés sur votre net après impôt — utiles pour cadrer un loyer ou une mensualité de crédit."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
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
    </motion.div>
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
      <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wider uppercase text-ink-muted">
        {label}
        <Tooltip content={tooltip}>
          <Info size={14} strokeWidth={2} aria-hidden="true" />
        </Tooltip>
      </span>
      <span className="text-2xl font-medium tracking-tight tabular-nums text-ink">
        {amount}
      </span>
      <span className="text-xs font-medium tracking-wider uppercase text-ink-soft tabular-nums">
        {rule}
      </span>
    </div>
  )
}
