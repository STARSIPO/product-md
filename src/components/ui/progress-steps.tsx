import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface ProgressStep {
  id: string
  label: string
}

export interface ProgressStepsProps {
  steps: readonly ProgressStep[]
  /** Zero-based index of the step being edited. */
  current: number
  /** Given, every completed step becomes a button back to that step. */
  onStepClick?: (index: number) => void
  /** Mobile summary line, e.g. "Шаг 2 из 7" — composed by the caller. */
  summary?: string
  /** Accessible name for the <nav>, e.g. "Form progress". */
  label?: string
  className?: string
}

export function ProgressSteps({
  steps,
  current,
  onStepClick,
  summary,
  label,
  className,
}: ProgressStepsProps) {
  if (steps.length === 0) return null

  const index = Math.min(Math.max(current, 0), steps.length - 1)
  const percent = ((index + 1) / steps.length) * 100

  return (
    <nav aria-label={label} className={className}>
      {/* Mobile: a single line plus a bar — a seven-step stepper never fits a phone. */}
      <div className="md:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{steps[index]?.label}</p>
          {summary ? (
            <p className="tnum shrink-0 text-caption text-muted-foreground">{summary}</p>
          ) : null}
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ol className="hidden md:flex md:items-start">
        {steps.map((step, stepIndex) => {
          const completed = stepIndex < index
          const isCurrent = stepIndex === index
          const clickable = completed && onStepClick !== undefined

          const marker = (
            <span
              className={cn(
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-caption font-semibold transition-colors duration-150',
                completed && 'bg-primary text-primary-foreground',
                isCurrent && 'border-2 border-primary bg-primary-soft text-primary',
                !completed && !isCurrent && 'border border-input bg-card text-muted-foreground',
              )}
            >
              {completed ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : (
                <span className="tnum">{stepIndex + 1}</span>
              )}
            </span>
          )

          const text = (
            <span
              className={cn(
                'text-caption leading-snug',
                isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {step.label}
            </span>
          )

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-start last:flex-none">
              <div className="flex min-w-0 flex-col items-center gap-1.5 px-1 text-center">
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick(stepIndex)}
                    aria-current={isCurrent ? 'step' : undefined}
                    className="flex min-h-[44px] flex-col items-center gap-1.5 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {marker}
                    <span className="underline-offset-2 hover:underline">{text}</span>
                  </button>
                ) : (
                  <span
                    aria-current={isCurrent ? 'step' : undefined}
                    className="flex flex-col items-center gap-1.5 px-1"
                  >
                    {marker}
                    {text}
                  </span>
                )}
              </div>
              {stepIndex < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn('mt-4 h-px min-w-4 flex-1', completed ? 'bg-primary' : 'bg-border')}
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
