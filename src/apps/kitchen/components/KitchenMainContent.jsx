import { useKitchenContext } from '../context/KitchenContext'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { KOTColumn } from './KOTColumn'

export function KitchenMainContent({ kotLoading, kotError }) {
  const { stateError, groupedKOTs } = useKitchenContext()

  return (
    <main className="kitchen-main">
      {kotLoading && <LoadingSpinner message="Loading kitchen orders..." />}
      {kotError && <ErrorMessage error={kotError} />}

      {stateError && (
        <div className="error-banner">
          <ErrorMessage error={stateError} />
        </div>
      )}

      {!kotLoading && !kotError && (
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
      )}
    </main>
  )
}
