export function StepHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string
  title: React.ReactNode
  subtitle?: React.ReactNode
}) {
  return (
    <div className="mb-8 text-center text-balance">
      {eyebrow && (
        <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-clay mb-2">
          {eyebrow}
        </div>
      )}
      <h2 className="font-display text-[32px] md:text-[40px] leading-[1.1] font-semibold tracking-[-0.02em] text-ink m-0">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-ink-muted text-[15px] md:text-[16px] leading-[1.55]">
          {subtitle}
        </p>
      )}
    </div>
  )
}
