import { motion } from 'framer-motion'

export function Connector({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div aria-hidden="true" className="flex justify-center h-32">
      <motion.span
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 0.61, 0.36, 1] }}
        style={{ transformOrigin: 'top center' }}
        className="block w-px h-full bg-cream-border-strong"
      />
    </div>
  )
}
