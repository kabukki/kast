import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'kast — Outils financiers' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap',
      },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
})

const NAV_LINKS = [
  { to: '/taxes', label: 'Impôts' },
  { to: '/health', label: 'Santé' },
] as const

function RootComponent() {
  return (
    <div className="container mx-auto flex flex-col min-h-dvh">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center shrink-0 py-4">
        <Link
          to="/"
          aria-label="kast"
          className="inline-flex items-baseline text-clay hover:opacity-80 transition-opacity no-underline justify-self-start"
        >
          <span className="font-display text-[34px] leading-none font-semibold tracking-[-0.04em] lowercase">
            kast
          </span>
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block w-1.5 h-1.5 rounded-full bg-ink"
          />
        </Link>

        <nav
          aria-label="Sections"
          className="flex items-center gap-1 bg-cream-alt rounded-full p-1 justify-self-center"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="px-3.5 py-1.5 rounded-full text-[13px] font-medium tracking-[0.02em] text-ink-muted hover:text-ink no-underline transition-colors"
              activeProps={{
                className:
                  'px-3.5 py-1.5 rounded-full text-[13px] font-medium tracking-[0.02em] no-underline bg-cream-surface text-ink shadow-app',
              }}
            >
              {link.label}
            </Link>
          ))}
          <span
            aria-disabled="true"
            title="Bientôt disponible"
            className="px-3.5 py-1.5 rounded-full text-[13px] font-medium tracking-[0.02em] text-ink-soft/60 cursor-not-allowed select-none"
          >
            Retraite
          </span>
        </nav>

        <button
          type="button"
          aria-label="Pays : France"
          title="France"
          className="inline-flex items-center gap-2 py-1.5 pl-2 pr-3 rounded-full bg-cream-surface border border-cream-border shadow-app text-[12px] font-medium tracking-[0.04em] text-ink-muted hover:text-ink transition-colors cursor-default justify-self-end"
        >
          <span className="text-base leading-none" aria-hidden="true">
            🇫🇷
          </span>
          France
        </button>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        <Outlet />
      </div>

      <footer className="shrink-0 py-6 text-center text-xs text-ink-soft">
        Estimations à but pédagogique — ne remplacent pas un conseil
        personnalisé. Données et hypothèses indiquées dans chaque module.
      </footer>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
