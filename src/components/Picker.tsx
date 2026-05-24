import clsx from 'clsx'

export type PickerOption<T extends string> = {
  id: T
  label: string
}

export function Picker<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<PickerOption<T>>
  value: T
  onChange: (next: T) => void
  ariaLabel: string
}) {
  return (
    <span
      role="radiogroup"
      aria-label={ariaLabel}
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
            className={clsx(
              'px-2.5 py-1 rounded text-[11px] font-medium tracking-[0.04em] transition-colors cursor-pointer',
              active
                ? 'bg-cream-surface text-ink shadow-app'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </span>
  )
}
