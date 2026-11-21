import type { ReactNode } from 'react'

export function EmptyState({ icon, title, children, action }: {
  icon: ReactNode; title: string; children: ReactNode; action?: ReactNode
}) {
  return <section className="card empty-state">
    <span className="section-icon">{icon}</span><h2>{title}</h2><p>{children}</p>{action}
  </section>
}
