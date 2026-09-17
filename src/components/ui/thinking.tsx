import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The Coach is thinking. One eyebrow label and three pulsing dots, shown while
 * a reply is pending — the same block Coach Chat, the Weekly Session and the
 * Feedback Interview each hand-rolled before frontend-quality/02.
 *
 * The label is a prop, not a translation: primitives stay free of `next-intl`
 * so they render in the snapshot harness; the page translates.
 */
const thinkingVariants = cva(
  "flex flex-col gap-2 border-l-2 pl-3",
  {
    variants: {
      tone: {
        signal: "border-signal/40 [&_[data-slot=thinking-dot]]:bg-signal",
        muted:
          "border-muted-foreground/40 [&_[data-slot=thinking-dot]]:bg-muted-foreground",
      },
    },
    defaultVariants: { tone: "signal" },
  }
)

function Thinking({
  label,
  tone,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> &
  VariantProps<typeof thinkingVariants> & { label: string }) {
  return (
    <div
      data-slot="thinking"
      // The whole block is the live region, so the label is what a screen
      // reader hears when it mounts; the dots alone would announce nothing
      // (CodeRabbit, PR #72).
      role="status"
      className={cn(thinkingVariants({ tone }), className)}
      {...props}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            data-slot="thinking-dot"
            className="h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

export { Thinking, thinkingVariants }
