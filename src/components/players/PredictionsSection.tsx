import { useState } from 'react'
import { Section } from './Section'
import { PredictionCard } from '@/components/predictions/PredictionCard'
import { PredictionSheet } from '@/components/predictions/PredictionSheet'
import {
  useKalshiConnection,
  usePredictions,
} from '@/lib/kalshi/usePredictions'

/** The Viewer's open Predictions with a Leg on this Player (or Team). */
export function PredictionsSection({
  playerId,
  teamId,
}: {
  playerId?: string
  teamId?: string
}) {
  const { data: predictions } = usePredictions()
  const { data: connection } = useKalshiConnection()
  const [selected, setSelected] = useState<string | null>(null)
  const mine = (predictions ?? []).filter(
    (p) =>
      p.status === 'open' &&
      p.legs.some((l) =>
        playerId ? l.playerId === playerId : teamId && l.teamId === teamId,
      ),
  )
  if (mine.length === 0) return null
  const open = mine.find((p) => p.id === selected)
  return (
    <Section title="Your predictions">
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex gap-2">
          {mine.map((p) => (
            <li key={p.id} className="flex shrink-0">
              <PredictionCard
                prediction={p}
                display={connection?.changeDisplay}
                onSelect={() => setSelected(p.id)}
              />
            </li>
          ))}
        </ul>
      </div>
      {open && (
        <PredictionSheet prediction={open} onClose={() => setSelected(null)} />
      )}
    </Section>
  )
}
