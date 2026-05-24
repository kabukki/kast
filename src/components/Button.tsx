import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

type Variant = 'primary' | 'ghost'

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-ink text-cream hover:bg-clay shadow-app',
  ghost: 'bg-transparent text-ink hover:bg-cream-alt',
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  icon: Icon,
  iconPosition = 'right',
  type = 'button',
  className,
  ...rest
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: Variant
  icon?: LucideIcon
  iconPosition?: 'left' | 'right'
  type?: 'button' | 'submit'
  className?: string
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'type' | 'className' | 'children'
>) {
  const iconNode = Icon ? (
    <Icon
      size={16}
      strokeWidth={2}
      className="transition-transform group-hover:translate-x-0.5"
    />
  ) : null

  return (
    <button
      type={type}
      onClick={onClick}
      className={clsx(
        'group inline-flex items-center gap-2 px-5 py-3 rounded-full text-[14px] font-medium tracking-[0.01em] transition-colors cursor-pointer',
        VARIANT_CLASS[variant],
        className,
      )}
      {...rest}
    >
      {iconPosition === 'left' && iconNode}
      {children}
      {iconPosition === 'right' && iconNode}
    </button>
  )
}
