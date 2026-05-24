export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <span className="tooltip" tabIndex={0}>
      {children}
      <span className="tooltip-bubble">{content}</span>
    </span>
  )
}
