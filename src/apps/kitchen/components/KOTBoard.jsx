import { useKitchenContext } from '../context/KitchenContext'
import { KOTColumn } from './KOTColumn'

export function KOTBoard() {
  const { groupedKOTs } = useKitchenContext()

  return (
    <div className="kitchen-columns">
      <KOTColumn
        state="queued"
        kots={groupedKOTs?.queued || []}
      />
      <KOTColumn
        state="preparing"
        kots={groupedKOTs?.preparing || []}
      />
      <KOTColumn
        state="ready"
        kots={groupedKOTs?.ready || []}
      />
    </div>
  )
}
