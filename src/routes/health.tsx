import { createFileRoute } from '@tanstack/react-router'
import { HeartPulse } from 'lucide-react'

export const Route = createFileRoute('/health')({
  component: HealthPage,
  head: () => ({
    meta: [{ title: 'Santé — kast' }],
  }),
})

function HealthPage() {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-8">
        <HeartPulse
          className="text-clay shrink-0"
          size={24}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div>
          <h1 className="text-2xl font-medium m-0 tracking-[-0.01em] leading-tight">
            Santé
          </h1>
          <p className="text-ink-muted text-[14px] m-0">
            Bientôt disponible.
          </p>
        </div>
      </div>
    </div>
  )
}
