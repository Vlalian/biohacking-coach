import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * What an error boundary shows: a title, a plain-language body, and one
 * "try again" button that calls `reset` — the shape Next's `error.tsx` hands
 * a route. Strings come in as props; the page translates
 * (frontend-quality/02).
 */
function ErrorFallback({
  title,
  body,
  retryLabel,
  reset,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title" | "children"> & {
  title: string
  body: string
  retryLabel: string
  reset: () => void
}) {
  return (
    <div
      data-slot="error-fallback"
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-5",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <div
          data-slot="error-fallback-title"
          className="font-display text-xl font-bold uppercase italic leading-none tracking-[0.03em] text-foreground"
        >
          {title}
        </div>
        <p data-slot="error-fallback-body" className="text-sm text-muted-foreground">
          {body}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        {retryLabel}
      </Button>
    </div>
  )
}

export { ErrorFallback }
