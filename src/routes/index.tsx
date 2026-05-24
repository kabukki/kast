import { createFileRoute, Link } from '@tanstack/react-router'
import { Calculator, HeartPulse } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: Landing,
  head: () => ({
    meta: [{ title: 'kast — Outils financiers' }],
  }),
})

function Landing() {
  return (
    <div>
      <div className="text-center mb-10">
        <h1 className="font-display text-4xl font-semibold tracking-[-0.02em] m-0 mb-2 text-ink">
          Des outils simples pour décider en clair.
        </h1>
        <p className="text-ink-muted text-[15px] m-0">
          Choisissez un calculateur pour commencer.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <LandingCard
          to="/taxes"
          title="Impôts"
          description="Barème progressif, prélèvement à la source, pouvoir d'achat."
          Icon={Calculator}
        />
        <LandingCard
          to="/health"
          title="Santé"
          description="Bientôt disponible."
          Icon={HeartPulse}
        />
      </div>
    </div>
  )
}

function LandingCard({
  to,
  title,
  description,
  Icon,
}: {
  to: string
  title: string
  description: string
  Icon: typeof Calculator
}) {
  return (
    <Link
      to={to}
      className="block bg-cream-surface border border-cream-border rounded-app-lg px-5 py-5 shadow-app no-underline text-ink hover:border-cream-border-strong transition-colors"
    >
      <div className="flex items-center gap-2.5 mb-1.5">
        <Icon
          className="text-clay shrink-0"
          size={20}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="text-lg font-medium tracking-[-0.01em]">{title}</span>
      </div>
      <p className="text-[13px] text-ink-muted m-0 leading-normal">
        {description}
      </p>
    </Link>
  )
}
