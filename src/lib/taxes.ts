// Domain model — French income tax (Barème 2026)
// Shared by /taxes (production journey) and /taxes-flow (prototype).

export type Bracket = {
  rate: number
  min: number
  max: number
  label: string
  color: string
}

export const BRACKETS: ReadonlyArray<Bracket> = [
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

export type Status = 'public' | 'etam' | 'cadre' | 'liberal'

export const STATUS_DEDUCTION: Record<Status, number> = {
  public: 0.17,
  etam: 0.22,
  cadre: 0.25,
  liberal: 0.34,
}

export const STATUS_LABEL: Record<Status, string> = {
  public: 'Public',
  etam: 'ETAM',
  cadre: 'Cadre',
  liberal: 'Libéral',
}

export const STATUS_TAGLINE: Record<Status, string> = {
  public: 'Fonction publique',
  etam: 'Employés, techniciens, agents de maîtrise',
  cadre: 'Cadres du privé',
  liberal: 'Profession libérale',
}

export type ChargeBreakdown = { label: string; share: number; color: string }

// Approximations pédagogiques de la composition des charges sociales par statut.
// La somme par statut == STATUS_DEDUCTION[statut].
export const STATUS_CHARGES: Record<Status, ChargeBreakdown[]> = {
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

export type BracketRow = Bracket & { taxable: number; tax: number }

export function computeBrackets(net: number): BracketRow[] {
  return BRACKETS.map((b) => {
    const upper =
      b.max === Number.POSITIVE_INFINITY ? net : Math.min(b.max, net)
    const taxable = Math.max(0, upper - b.min)
    const tax = taxable * b.rate
    return { ...b, taxable, tax }
  })
}

export function marginalRate(net: number): number {
  for (let i = BRACKETS.length - 1; i >= 0; i--) {
    if (net > BRACKETS[i].min) return BRACKETS[i].rate
  }
  return 0
}

export function defaultPas(net: number): number {
  const total = computeBrackets(Math.max(0, net)).reduce(
    (s, r) => s + r.tax,
    0,
  )
  return Math.round(net > 0 ? (total / net) * 1000 : 0) / 10
}

export const fmtEUR = (n: number): string =>
  Math.round(n).toLocaleString('fr-FR') + ' €'
