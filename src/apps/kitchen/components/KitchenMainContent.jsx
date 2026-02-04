import { useKitchenContext } from '../context/KitchenContext'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'

export function KitchenMainContent({ kotLoading, kotError }) {
  const { stateError, groupedKOTs, stateLoading } = useKitchenContext()
  const { KOTColumn } = require('./index')

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
      )}
    </main>
  )
}
