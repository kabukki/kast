import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Info } from 'lucide-react'
import {
  Connector,
  Money,
  Percent,
  Picker,
  Section,
  StepHeading,
  StepTransition,
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
  | 'principle'
  | 'brackets'
  | 'net'
  | 'pas'
  | 'power'

const STEP_ORDER: StepId[] = [
  'gross',
  'status',
  'charges',
  'principle',
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

  const [revealed, setRevealed] = useState<Set<StepId>>(
    () => new Set<StepId>(['gross']),
  )
  // Sections whose connector is currently drawing (= they will mount after
  // the connector animation completes). Drives Connector show prop separately
  // from the actual section mount, so we don't get a layout jump.
  const [drawing, setDrawing] = useState<Set<StepId>>(() => new Set())

  const [grossInView, setGrossInView] = useState(true)

  const sectionRefs = useRef<Partial<Record<string, HTMLElement | null>>>({})
  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    sectionRefs.current[id] = el
  }, [])

  const CONNECTOR_DURATION_MS = 1200

  const advancedSteps = useRef<Set<StepId>>(new Set())

  const advanceTo = useCallback((next: StepId) => {
    // First-time only: subsequent calls (e.g. re-editing status from the
    // sticky bar) must not retrigger the draw + scroll choreography.
    if (advancedSteps.current.has(next)) return
    advancedSteps.current.add(next)

    setDrawing((prev) => {
      const copy = new Set(prev)
      copy.add(next)
      return copy
    })

    window.setTimeout(() => {
      setRevealed((prev) => {
        const copy = new Set(prev)
        copy.add(next)
        return copy
      })
      requestAnimationFrame(() => {
        sectionRefs.current[next]?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    }, CONNECTOR_DURATION_MS)
  }, [])

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

  const next = useCallback(
    (id: StepId) => {
      const idx = STEP_ORDER.indexOf(id)
      if (idx < 0 || idx === STEP_ORDER.length - 1) return
      advanceTo(STEP_ORDER[idx + 1])
    },
    [advanceTo],
  )

  const showSticky = !grossInView && gross !== null && gross > 0

  return (
    <div className="flex-1 flex flex-col items-center py-32 min-h-0 gap-8">
      <StickyIncomeBar
        show={showSticky}
        gross={gross ?? 0}
        status={status}
        onGrossChange={setGross}
        onStatusChange={setStatus}
      />

      <Section
        id="gross"
        registerRef={registerRef}
        onViewportEnter={() => setGrossInView(true)}
        onViewportLeave={() => setGrossInView(false)}
      >
        <StepGross gross={gross} onChange={setGross} />
      </Section>
      {gross !== null && gross > 0 && (
        <StepTransition
          done={drawing.has('status')}
          onAdvance={() => next('gross')}
          label="Commencer"
        />
      )}

      {revealed.has('status') && (
        <>
          <Section id="status" registerRef={registerRef}>
            <StepStatus
              status={status}
              onChange={(s) => {
                setStatus(s)
                next('status')
              }}
            />
          </Section>
          <Connector show={drawing.has('charges')} />
        </>
      )}

      {revealed.has('charges') && gross !== null && status !== null && (
        <>
          <Section id="charges" registerRef={registerRef}>
            <StepCharges gross={gross} status={status} net={net} />
          </Section>
          <StepTransition
            done={drawing.has('principle')}
            onAdvance={() => next('charges')}
            label="Découvrir les tranches d'impôt"
          />
        </>
      )}

      {revealed.has('principle') && (
        <>
          <Section id="principle" registerRef={registerRef}>
            <StepPrinciple />
          </Section>
          <StepTransition
            done={drawing.has('brackets')}
            onAdvance={() => next('principle')}
            label="Appliquer à mon revenu"
          />
        </>
      )}

      {revealed.has('brackets') && (
        <>
          <Section id="brackets" registerRef={registerRef}>
            <StepBrackets rows={rows} totalTax={totalTax} />
          </Section>
          <StepTransition
            done={drawing.has('net')}
            onAdvance={() => next('brackets')}
            label="Voir ce qu'il me reste vraiment"
          />
        </>
      )}

      {revealed.has('net') && (
        <>
          <Section id="net" registerRef={registerRef}>
            <StepNet
              netAfterTax={netAfterTax}
              avgRate={avgRate}
              margRate={margRate}
              netPeriod={netPeriod}
              onPeriodChange={setNetPeriod}
            />
          </Section>
          <StepTransition
            done={drawing.has('pas')}
            onAdvance={() => next('net')}
            label="Et le prélèvement à la source ?"
          />
        </>
      )}

      {revealed.has('pas') && (
        <>
          <Section id="pas" registerRef={registerRef}>
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
            />
          </Section>
          <StepTransition
            done={drawing.has('power')}
            onAdvance={() => next('pas')}
            label="Comprendre mon pouvoir d'achat"
          />
        </>
      )}

      {revealed.has('power') && (
        <Section id="power" registerRef={registerRef}>
          <StepPower netAfterTax={netAfterTax} />
        </Section>
      )}

    </div>
  )
}

// ----------------------------------------------------------------------------
// Step 1 — Gross income entry
// ----------------------------------------------------------------------------

function StepGross({
  gross,
  onChange,
}: {
  gross: number | null
  onChange: (n: number) => void
}) {
  const displayValue = gross === null ? '' : String(Math.round(gross))

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <h1 className="font-display text-[36px] md:text-[48px] leading-[1.05] font-semibold tracking-[-0.02em] text-ink m-0 mb-3">
        Combien gagnez-vous brut par&nbsp;an&nbsp;?
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
          className="w-full py-5 pl-6 pr-14 text-3xl md:text-4xl font-medium text-center border border-cream-border-strong rounded-app-lg bg-cream-surface text-ink tabular-nums transition-[border-color,box-shadow] focus:outline-none focus:border-clay focus:shadow-[0_0_0_3px_var(--color-clay-soft)] placeholder:text-ink-soft/60 placeholder:font-normal"
        />
        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-2xl text-ink-muted pointer-events-none">
          €
        </span>
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
}: {
  status: Status | null
  onChange: (s: Status) => void
}) {
  return (
    <div>
      <StepHeading
        title={<>Très bien. Quel est votre statut&nbsp;?</>}
        subtitle="Les charges sociales retirées de votre brut dépendent de votre statut. C'est la première chose à connaître pour calculer ce que vous gardez vraiment."
      />

      <div
        role="radiogroup"
        aria-label="Statut"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
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
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  {STATUS_LABEL[s]}
                </span>
                <span
                  className={`text-[11px] font-medium tabular-nums ${
                    active ? 'text-clay' : 'text-ink-soft'
                  }`}
                >
                  −{Math.round(STATUS_DEDUCTION[s] * 100)} %
                </span>
              </div>
              <p className="text-[12px] text-ink-muted leading-[1.4] m-0">
                {STATUS_TAGLINE[s]}
              </p>
            </button>
          )
        })}
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
}: {
  gross: number
  status: Status
  net: number
}) {
  const charges = STATUS_CHARGES[status]
  const totalDeduction = STATUS_DEDUCTION[status]
  const totalPct = Math.round(totalDeduction * 100)

  return (
    <div>
      <StepHeading
        title={<>Du brut au net imposable</>}
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

    </div>
  )
}

// ----------------------------------------------------------------------------
// Step 4 — The bracket principle
// ----------------------------------------------------------------------------

function StepPrinciple() {
  return (
    <div>
      <StepHeading
        title={<>Le principe des tranches</>}
        subtitle="L'impôt en France est progressif. Votre revenu net imposable est découpé en tranches, et chaque tranche est taxée à un taux différent."
      />

      <div className="space-y-2.5">
        {BRACKETS.map((b, i) => {
          const upper =
            b.max === Number.POSITIVE_INFINITY
              ? '∞'
              : b.max.toLocaleString('fr-FR') + ' €'
          const lower =
            (b.min === 0 ? 0 : b.min + 1).toLocaleString('fr-FR') + ' €'
          return (
            <motion.div
              key={b.label}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.45,
                delay: 0.1 + i * 0.18,
                ease: EASE_OUT,
              }}
              className="flex items-center gap-4 bg-cream-surface border border-cream-border rounded-app px-4 py-3 shadow-app"
            >
              <div
                className="w-1.5 self-stretch rounded-full shrink-0"
                style={{ background: b.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] uppercase tracking-[0.08em] text-ink-soft font-medium mb-0.5">
                  Tranche
                </div>
                <div className="text-[14px] tabular-nums text-ink">
                  {b.min === 0 ? 'Jusqu’à' : 'De'} {lower}
                  {b.min === 0 ? '' : ' à ' + upper}
                  {b.max === Number.POSITIVE_INFINITY && b.min > 0
                    ? ''
                    : b.min === 0
                      ? ''
                      : ''}
                  {b.max === Number.POSITIVE_INFINITY && b.min > 0
                    ? ' — au-delà'
                    : ''}
                </div>
              </div>
              <div
                className="text-2xl font-medium tabular-nums tracking-[-0.01em] shrink-0"
                style={{ color: b.color }}
              >
                {b.label}
              </div>
            </motion.div>
          )
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 + BRACKETS.length * 0.18 + 0.1 }}
        className="mt-6 p-5 bg-clay-soft/50 border-l-4 border-clay rounded-app"
      >
        <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-clay mb-1.5">
          Attention
        </div>
        <p className="text-[14px] text-ink leading-[1.55] m-0">
          Être <strong>« dans la tranche à 30 % »</strong> ne veut pas dire que
          vous payez 30 % de tout votre revenu. Seuls les euros au-dessus du
          seuil de <strong>29 315 €</strong> sont taxés à 30 %.
        </p>
      </motion.div>

    </div>
  )
}

// ----------------------------------------------------------------------------
// Step 5 — User-specific brackets fill
// ----------------------------------------------------------------------------

type BracketRow = ReturnType<typeof computeBrackets>[number]

function StepBrackets({
  rows,
  totalTax,
}: {
  rows: BracketRow[]
  totalTax: number
}) {
  const activeRows = rows.filter((r) => r.taxable > 0)

  return (
    <div>
      <StepHeading
        title={<>Vos tranches à vous</>}
        subtitle="Votre net imposable vient remplir les tranches l'une après l'autre, du bas vers le haut."
      />

      <div className="space-y-2.5">
        {rows.map((r, i) => {
          const isActive = r.taxable > 0
          const capacity =
            r.max === Number.POSITIVE_INFINITY ? r.taxable : r.max - r.min
          const fillPct =
            capacity > 0 ? Math.min(100, (r.taxable / capacity) * 100) : 0

          return (
            <motion.div
              key={r.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{
                opacity: isActive ? 1 : 0.45,
                y: 0,
              }}
              transition={{
                duration: 0.4,
                delay: 0.15 + i * 0.2,
              }}
              className="relative bg-cream-surface border border-cream-border rounded-app overflow-hidden shadow-app"
            >
              {/* Fill bar */}
              <div className="relative h-12 bg-cream-alt overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${fillPct}%` }}
                  transition={{
                    duration: 0.7,
                    delay: 0.3 + i * 0.2,
                    ease: EASE_OUT,
                  }}
                  className="h-full"
                  style={{ background: r.color }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-3.5 pointer-events-none">
                  <span className="text-[12px] font-semibold tracking-[0.04em] uppercase text-ink mix-blend-multiply">
                    Tranche {r.label}
                  </span>
                  {isActive && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7 + i * 0.2 }}
                      className="text-[13px] font-medium tabular-nums text-ink mix-blend-multiply"
                    >
                      {fmt(r.taxable)}
                    </motion.span>
                  )}
                </div>
              </div>
              {isActive && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 + i * 0.2, duration: 0.3 }}
                  className="flex items-center justify-between px-3.5 py-2 text-[12px] border-t border-cream-border bg-cream-surface"
                >
                  <span className="text-ink-muted">
                    {fmt(r.taxable)} × {r.label}
                  </span>
                  <span className="text-rust font-medium tabular-nums">
                    + {fmt(r.tax)} d'impôt
                  </span>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.45,
          delay: 0.3 + activeRows.length * 0.2 + 0.4,
        }}
        className="mt-6 flex items-center justify-between bg-ink text-cream rounded-app-lg px-6 py-5 shadow-app"
      >
        <div>
          <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-cream/70 mb-1">
            Total à payer
          </div>
          <div className="text-[13px] text-cream/80 leading-[1.45]">
            Somme des impôts dus dans chaque tranche.
          </div>
        </div>
        <div className="text-3xl font-medium tabular-nums tracking-[-0.01em] text-cream">
          <Money value={totalTax} />
        </div>
      </motion.div>

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
}: {
  netAfterTax: number
  avgRate: number
  margRate: number
  netPeriod: Period
  onPeriodChange: (p: Period) => void
}) {
  const shown =
    netPeriod === 'month' ? netAfterTax / 12 : netAfterTax

  return (
    <div>
      <StepHeading
        title={<>Ce qu'il vous reste vraiment</>}
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

    </div>
  )
}

// ----------------------------------------------------------------------------
// Step 8 — Purchasing power
// ----------------------------------------------------------------------------

function StepPower({ netAfterTax }: { netAfterTax: number }) {
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
    </div>
  )
}

// ----------------------------------------------------------------------------
// Shared small components
// ----------------------------------------------------------------------------

function StickyIncomeBar({
  show,
  gross,
  status,
  onGrossChange,
  onStatusChange,
}: {
  show: boolean
  gross: number
  status: Status | null
  onGrossChange: (n: number) => void
  onStatusChange: (s: Status) => void
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="sticky top-2 z-40 mb-6"
        >
          <div className="mx-auto flex items-center gap-3 md:gap-4 bg-cream-surface/95 backdrop-blur border border-cream-border-strong shadow-app rounded-full pl-4 pr-1.5 py-1.5">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-ink-soft hidden sm:inline">
                Brut
              </span>
              <div className="relative">
                <input
                  type="number"
                  value={Math.round(gross)}
                  min={0}
                  step={1000}
                  onChange={(e) =>
                    onGrossChange(parseFloat(e.target.value) || 0)
                  }
                  aria-label="Revenu annuel brut"
                  className="w-27.5 py-1 pl-2 pr-5 text-[14px] font-medium tabular-nums text-ink bg-transparent border-0 focus:outline-none focus:ring-0"
                />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[12px] text-ink-soft pointer-events-none">
                  €
                </span>
              </div>
            </div>

            <div
              aria-hidden="true"
              className="w-px h-5 bg-cream-border-strong shrink-0"
            />

            <div
              role="radiogroup"
              aria-label="Statut"
              className="flex items-center gap-0.5 bg-cream-alt rounded-full p-0.5"
            >
              {(['public', 'etam', 'cadre', 'liberal'] as Status[]).map((s) => {
                const active = status === s
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onStatusChange(s)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium tracking-[0.04em] transition-colors cursor-pointer ${
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
        </motion.div>
      )}
    </AnimatePresence>
  )
}

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

