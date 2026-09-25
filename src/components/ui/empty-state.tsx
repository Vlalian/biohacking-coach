import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Nothing here yet, said once and the same way everywhere: an optional icon,
 * a display-face title, one line of body, and an optional action. Strings
 * come in as props so the page translates and the primitive stays renderable
 * in the snapshot harness (frontend-quality/02).
 */
function EmptyState({
  icon,
  title,
  body,
  action,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title" | "children"> & {
  icon?: React.ReactNode
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div
      data-slot="empty-state"
      role="status"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center",
        className
      )}
      {...props}
    >
      {icon ? (
        <div
          data-slot="empty-state-icon"
          className="text-muted-foreground [&_svg:not([class*='size-'])]:size-8"
        >
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <div
          data-slot="empty-state-title"
          className="font-display text-xl font-bold uppercase italic leading-none tracking-[0.03em] text-foreground"
        >
          {title}
        </div>
        <p data-slot="empty-state-body" className="text-sm text-muted-foreground">
          {body}
        </p>
      </div>
      {action ? (
        <div data-slot="empty-state-action" className="mt-1">
          {action}
        </div>
      ) : null}
    </div>
  )
}

export { EmptyState }
