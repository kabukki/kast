import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

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

  let regulClass = 'balanced'
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
      regulClass = 'refund'
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
      regulClass = 'due'
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

  const chartData = {
    labels: rows.map((r) => r.label),
    datasets: [
      {
        label: 'Impôt',
        data: rows.map((r) => Math.round(r.tax)),
        backgroundColor: rows.map((r) => r.color),
        borderWidth: 0,
        borderRadius: 4,
      },
    ],
  }

  const chartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => fmt(Number(ctx.parsed.y ?? 0)),
        },
        backgroundColor: '#1a1a1a',
        padding: 10,
        titleFont: { size: 13 },
        bodyFont: { size: 13 },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#6b6a64', font: { size: 12 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: '#e5e2d8' },
        ticks: {
          color: '#6b6a64',
          font: { size: 12 },
          callback: (v) => Number(v).toLocaleString('fr-FR') + ' €',
        },
      },
    },
  }

  const syncPas = () => {
    const rounded = Math.round(avg * 10) / 10
    setPas(rounded)
  }

  return (
    <div className="container">
      <h1>Calculateur d'impôt sur le revenu</h1>
      <p className="subtitle">
        Barème 2026 sur les revenus 2025 — pour une part fiscale
      </p>

      <div className="input-card">
        <label className="input-label" htmlFor="net-input">
          Revenu net imposable
        </label>
        <div className="input-row">
          <input
            type="number"
            id="net-input"
            value={net}
            min={0}
            step={1000}
            onChange={(e) => setNet(parseFloat(e.target.value) || 0)}
          />
          <span className="currency">€</span>
          <input
            type="range"
            min={0}
            max={250000}
            value={Math.min(net, 250000)}
            step={500}
            onChange={(e) => setNet(parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric-label">
            Impôt total
            <span className="info-icon" tabIndex={0}>
              i
              <span className="tooltip">
                Somme des impôts dus dans chaque tranche du barème progressif.
                C'est le montant final à payer au Trésor public sur vos revenus
                de l'année.
              </span>
            </span>
          </div>
          <div className="metric-value accent">{fmt(total)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">
            Taux moyen
            <span className="info-icon" tabIndex={0}>
              i
              <span className="tooltip">
                Impôt total ÷ revenu net imposable, exprimé en %. C'est le taux
                que l'administration fiscale utilise par défaut pour calculer
                votre prélèvement à la source.
              </span>
            </span>
          </div>
          <div className="metric-value">{avg.toFixed(2)} %</div>
        </div>
        <div className="metric">
          <div className="metric-label">
            Taux marginal
            <span className="info-icon" tabIndex={0}>
              i
              <span className="tooltip">
                Taux appliqué à votre dernier euro gagné — c'est-à-dire la
                tranche la plus haute que vous atteignez. Indique ce que
                coûterait en impôt 1 € de revenu supplémentaire.
              </span>
            </span>
          </div>
          <div className="metric-value">{marg.toFixed(0)} %</div>
        </div>
        <div className="metric">
          <div className="metric-label">
            Net après impôt
            <span className="info-icon" tabIndex={0}>
              i
              <span className="tooltip">
                Revenu net imposable − impôt total. Ce qu'il vous reste
                effectivement une fois l'impôt sur le revenu acquitté (hors
                autres prélèvements sociaux).
              </span>
            </span>
          </div>
          <div className="metric-value">{fmt(net - total)}</div>
        </div>
      </div>

      <h2 className="section-title">Détail par tranche</h2>
      <div className="brackets">
        {rows.map((r) => {
          const upperLabel =
            r.max === Number.POSITIVE_INFINITY
              ? '∞'
              : r.max.toLocaleString('fr-FR') + ' €'
          const minLabel = r.min.toLocaleString('fr-FR') + ' €'
          const active = r.taxable > 0
          return (
            <div
              key={r.label}
              className={`bracket-row ${active ? 'active' : 'inactive'}`}
            >
              <div className="bracket-dot" style={{ background: r.color }} />
              <div className="bracket-info">
                <span className="bracket-rate">{r.label}</span>
                <span className="bracket-range">
                  {minLabel} → {upperLabel}
                </span>
              </div>
              <div className="bracket-taxable">{fmt(r.taxable)} imposés</div>
              <div className="bracket-tax">{fmt(r.tax)}</div>
            </div>
          )
        })}
      </div>

      <div className="chart-wrapper">
        <h2 className="section-title" style={{ marginBottom: 12 }}>
          Répartition de l'impôt par tranche
        </h2>
        <div className="chart-container">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>

      <div className="section-divider" />

      <div className="pas-section">
        <h2 className="pas-title">Simuler le prélèvement à la source</h2>
        <p className="pas-intro">
          L'administration applique chaque mois un taux à votre salaire pour
          anticiper l'impôt. Si ce taux ne correspond pas à votre situation
          réelle, un solde de régularisation apparaît en fin d'année.
        </p>

        <div className="input-card">
          <div className="pas-header">
            <label
              className="input-label"
              htmlFor="pas-input"
              style={{ marginBottom: 0 }}
            >
              Taux PAS appliqué sur la fiche de paie
            </label>
            <button type="button" className="link-btn" onClick={syncPas}>
              ↻ Synchroniser avec le taux moyen
            </button>
          </div>
          <div className="input-row">
            <input
              type="number"
              id="pas-input"
              value={pas}
              min={0}
              max={45}
              step={0.1}
              onChange={(e) => setPas(parseFloat(e.target.value) || 0)}
            />
            <span className="currency">%</span>
            <input
              type="range"
              min={0}
              max={45}
              value={pas}
              step={0.1}
              onChange={(e) => setPas(parseFloat(e.target.value) || 0)}
            />
          </div>
          <p className="hint">
            Par défaut, l'administration utilise votre taux moyen de l'année
            précédente. Si vos revenus changent, un écart se forme.
          </p>
        </div>

        <div className={`regul-card ${regulClass}`}>
          <div className="regul-left">
            <div className="regul-label">{regulLabel}</div>
            <div className="regul-amount">{regulAmount}</div>
            <div className="regul-detail">{regulDetail}</div>
          </div>
          <div className="regul-right">
            <div className="regul-bar">
              <div className="regul-bar-track">
                <div
                  className="regul-bar-fill"
                  style={{ width: barPaidWidth }}
                />
                <div
                  className="regul-bar-fill regul-bar-extra"
                  style={{ width: barExtraWidth, left: barExtraLeft }}
                />
              </div>
              <div className="regul-bar-legend">
                <span>
                  <span className="dot dot-paid" />
                  Déjà prélevé (PAS)
                </span>
                <span>
                  <span className="dot dot-due" />
                  Impôt réel dû
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="footer">
        Calcul indicatif — ne tient pas compte du quotient familial, des
        réductions ni de la décote.
      </p>
    </div>
  )
}
