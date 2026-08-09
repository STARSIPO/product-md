import type { AnalyticsDay } from '@/server/services/analytics'

/**
 * Views per day as bars, with a contacts line over the top.
 *
 * A handful of `<rect>` elements in an inline SVG, rendered on the server — no charting
 * library. Three series over at most ninety days does not justify shipping 150 kB of
 * JavaScript to a seller on mobile data, and an SVG the server produces needs no
 * hydration at all.
 *
 * The viewBox scales with the number of days and stretches to the container, so the same
 * markup draws seven fat bars or ninety thin ones without a media query. The exact
 * numbers live in the table beside it: that is the accessible form of this picture, and
 * also the only way to read a value off a three-pixel bar.
 */
export function DayChart({ days, label }: { days: readonly AnalyticsDay[]; label: string }) {
  if (days.length === 0) return null

  const maxViews = Math.max(1, ...days.map((day) => day.views))
  const maxContacts = Math.max(1, ...days.map((day) => day.contacts))

  const slot = 4
  const width = days.length * slot
  const height = 40

  const contactPoints = days
    .map((day, index) => {
      const x = index * slot + slot / 2
      const y = height - (day.contacts / maxContacts) * (height * 0.7)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="h-28 w-full sm:h-32"
    >
      {days.map((day, index) => {
        const barHeight = (day.views / maxViews) * height
        return (
          <rect
            key={day.day}
            x={index * slot + 0.5}
            y={height - barHeight}
            width={slot - 1}
            height={Math.max(barHeight, day.views > 0 ? 0.5 : 0)}
            className="fill-primary/70"
          />
        )
      })}

      <polyline
        points={contactPoints}
        fill="none"
        vectorEffect="non-scaling-stroke"
        strokeWidth={1.5}
        className="stroke-accent"
      />
    </svg>
  )
}
