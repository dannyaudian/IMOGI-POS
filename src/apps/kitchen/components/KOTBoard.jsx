import { useKitchenContext } from '../context/KitchenContext'
import { KOTColumn } from './KOTColumn'

export function KOTBoard() {
  const { groupedKOTs, stateLoading } = useKitchenContext()

  return (
    <div className="kitchen-columns">
      <KOTColumn
        title="Queued"
        state="queued"
        kots={groupedKOTs?.queued || []}
        loading={stateLoading}
      />
      <KOTColumn
        title="In Progress"
        state="preparing"
        kots={groupedKOTs?.preparing || []}
        loading={stateLoading}
      />
      <KOTColumn
        title="Ready"
        state="ready"
        kots={groupedKOTs?.ready || []}
        loading={stateLoading}
      />
    </div>
  )
}
