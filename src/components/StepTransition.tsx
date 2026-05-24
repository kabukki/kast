import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Button } from './Button'
import { Connector } from './Connector'

export function StepTransition({
  done,
  onAdvance,
  label,
}: {
  done: boolean
  onAdvance: () => void
  label: string
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {!done ? (
        <motion.div
          key="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="flex justify-center"
        >
          <Button icon={ArrowRight} onClick={onAdvance}>
            {label}
          </Button>
        </motion.div>
      ) : (
        <motion.div key="connector">
          <Connector show={true} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
