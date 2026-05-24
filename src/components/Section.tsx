import { motion } from 'framer-motion'

const EASE_OUT = [0.22, 0.61, 0.36, 1] as const

export function Section({
  id,
  registerRef,
  onViewportEnter,
  onViewportLeave,
  delay = 0,
  children,
}: {
  id: string
  registerRef?: (id: string, el: HTMLElement | null) => void
  onViewportEnter?: () => void
  onViewportLeave?: () => void
  delay?: number
  children: React.ReactNode
}) {
  return (
    <motion.section
      ref={(el) => registerRef?.(id, el)}
      data-step={id}
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT, delay }}
      onViewportEnter={onViewportEnter}
      onViewportLeave={onViewportLeave}
      viewport={{ margin: '-80px 0px 0px 0px', amount: 0.1 }}
      className="w-full max-w-3xl"
    >
      {children}
    </motion.section>
  )
}
