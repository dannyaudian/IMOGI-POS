import { useState, useEffect } from 'react'
import { apiCall } from '@/shared/utils/api'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { BlockedScreen } from './BlockedScreen'

export function CloseShiftView({ posProfile, posOpening, onClose, onShiftClosed, effectiveOpeningName, revalidateOpening }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [checkingOpening, setCheckingOpening] = useState(true)
  const [hasOpening, setHasOpening] = useState(false)
  const [summary, setSummary] = useState(null)
  const [countedBalances, setCountedBalances] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [closingResult, setClosingResult] = useState(null)

  useEffect(() => {
    checkOpeningAndLoadSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  const checkOpeningAndLoadSummary = async () => {
    try {
      setCheckingOpening(true)
      
      // Step 0: Re-validate opening (multi-session consistency)
      if (revalidateOpening) {
        console.log('[CloseShift] Re-validating opening...')
        try {
          await revalidateOpening()
          if (!effectiveOpeningName) {
            console.error('[CloseShift] Opening validation failed')
            setHasOpening(false)
            setCheckingOpening(false)
            return
          }
        } catch (err) {
          console.error('[CloseShift] Opening revalidation error:', err)
          setHasOpening(false)
          setCheckingOpening(false)
          return
        }
      }
      
      // Step 1: Verify active opening exists (page-level guard)
      const openingRes = await apiCall('imogi_pos.api.cashier.get_active_opening')
      
      if (!openingRes?.success || !openingRes?.has_opening) {
        console.error('[CloseShift] No active opening found')
        setHasOpening(false)
        setCheckingOpening(false)
        return
      }

      setHasOpening(true)
      setCheckingOpening(false)

      // Step 2: Fetch summary data (expected amounts)
      setLoading(true)
      const summaryRes = await apiCall('imogi_pos.api.cashier.get_opening_summary')
      
      if (!summaryRes?.success) {
        throw new Error(summaryRes?.error || 'Failed to load summary')
      }

      setSummary(summaryRes)
      
      // Initialize counted balances with expected amounts as default
      const initialCounted = {}
      summaryRes.totals_by_mode?.forEach(row => {
        initialCounted[row.mode_of_payment] = row.total || 0
      })
      setCountedBalances(initialCounted)
      
      setError(null)
    } catch (err) {
      console.error('[CloseShift] Load failed:', err)
      setError(err.message || 'Failed to load shift data')
    } finally {
      setLoading(false)
    }
  }

  const handleCountedChange = (modeOfPayment, value) => {
    setCountedBalances(prev => ({
      ...prev,
      [modeOfPayment]: parseFloat(value) || 0
    }))
  }

  const handleSubmitClosing = async () => {
    try {
      setSubmitting(true)
      setError(null)

      // Build payload
      const countedArray = Object.entries(countedBalances).map(([mode_of_payment, closing_amount]) => ({
        mode_of_payment,
        closing_amount
      }))

      const openingName = summary?.opening || posOpening?.name

      if (!openingName) {
        throw new Error('Opening name not found')
      }

      // Call close_pos_opening API
      const result = await apiCall('imogi_pos.api.cashier.close_pos_opening', {
        opening_name: openingName,
        counted_balances: countedArray
      })

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to close shift')
      }

      setClosingResult(result)
      
      // Notify parent
      if (onShiftClosed) {
        onShiftClosed(result)
      }
    } catch (err) {
      console.error('[CloseShift] Submit failed:', err)
      setError(err.message || 'Failed to close shift')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  // Page-level guard: Block if no opening (NO modal, just error + redirect)
  if (checkingOpening) {
    return <LoadingSpinner message="Checking POS opening..." />
  }

  if (!hasOpening) {
    return (
      <BlockedScreen
        title="Tidak ada POS Opening aktif"
        message="Buat POS Opening Entry dulu dari ERPNext (POS → POS Opening Entry → Open POS). Setelah itu refresh halaman ini."
        actions={[
          { 
            label: "Open POS Opening Entry", 
            href: `/app/pos-opening-entry` 
          },
          { 
            label: "Refresh", 
            onClick: () => window.location.reload() 
          },
          { 
            label: "Kembali", 
            onClick: onClose 
          }
        ]}
      />
    )
  }

  if (loading) {
    return <LoadingSpinner message="Loading shift data..." />
  }

  if (error && !closingResult) {
    return (
      <ErrorMessage 
        error={error}
        onRetry={checkOpeningAndLoadSummary}
      />
    )
  }

  // Show closing result (success screen)
  if (closingResult) {
    const reconciliation = closingResult.reconciliation_summary || []
    const totalDiff = reconciliation.reduce((sum, r) => sum + (r.difference || 0), 0)

    return (
      <div className="close-shift-result">
        <div className="result-header">
          <div className="success-icon">
            <i className="fa fa-check-circle"></i>
          </div>
          <h2>Shift Ditutup</h2>
          <p className="result-subtitle">Closing: {closingResult.closing}</p>
          <p className="result-subtitle">Opening: {closingResult.opening}</p>
        </div>

        <div className="reconciliation-table">
          <h3>Rekonsiliasi</h3>
          <table>
            <thead>
              <tr>
                <th>Metode Pembayaran</th>
                <th className="text-right">Expected</th>
                <th className="text-right">Counted</th>
                <th className="text-right">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {reconciliation.map((row, index) => (
                <tr key={index}>
                  <td><strong>{row.mode_of_payment}</strong></td>
                  <td className="text-right">{formatCurrency(row.expected)}</td>
                  <td className="text-right">{formatCurrency(row.counted)}</td>
                  <td className={`text-right ${row.difference > 0 ? 'surplus' : row.difference < 0 ? 'shortage' : ''}`}>
                    {formatCurrency(row.difference)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total Selisih</strong></td>
                <td></td>
                <td></td>
                <td className={`text-right ${totalDiff > 0 ? 'surplus' : totalDiff < 0 ? 'shortage' : ''}`}>
                  <strong>{formatCurrency(totalDiff)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="result-actions">
          <button onClick={handlePrint} className="btn-secondary">
            <i className="fa fa-print"></i> Print Closing
          </button>
          <button onClick={onClose} className="btn-primary">
            <i className="fa fa-arrow-left"></i> Back to Orders
          </button>
        </div>

        <style jsx>{`
          .close-shift-result {
            padding: 2rem;
            max-width: 900px;
            margin: 0 auto;
          }

          .result-header {
            text-align: center;
            margin-bottom: 2rem;
            padding-bottom: 1.5rem;
            border-bottom: 2px solid #e5e7eb;
          }

          .success-icon {
            margin-bottom: 1rem;
          }

          .success-icon i {
            font-size: 4rem;
            color: #10b981;
          }

          .result-header h2 {
            margin: 0.5rem 0;
            font-size: 1.75rem;
            color: #111827;
          }

          .result-subtitle {
            margin: 0.25rem 0;
            color: #6b7280;
            font-size: 0.875rem;
          }

          .reconciliation-table {
            background: white;
            padding: 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
          }

          .reconciliation-table h3 {
            margin: 0 0 1rem 0;
            font-size: 1.125rem;
            color: #111827;
          }

          .reconciliation-table table {
            width: 100%;
            border-collapse: collapse;
          }

          .reconciliation-table th {
            background: #f9fafb;
            padding: 0.75rem;
            text-align: left;
            font-weight: 600;
            color: #374151;
            font-size: 0.875rem;
            text-transform: uppercase;
            border-bottom: 2px solid #e5e7eb;
          }

          .reconciliation-table td {
            padding: 1rem 0.75rem;
            border-bottom: 1px solid #e5e7eb;
          }

          .text-right {
            text-align: right;
          }

          .surplus {
            color: #10b981;
            font-weight: 600;
          }

          .shortage {
            color: #ef4444;
            font-weight: 600;
          }

          .reconciliation-table tfoot td {
            padding: 1rem 0.75rem;
            border-top: 2px solid #d1d5db;
            font-size: 1.125rem;
          }

          .result-actions {
            display: flex;
            justify-content: center;
            gap: 1rem;
          }

          .btn-secondary,
          .btn-primary {
            padding: 0.75rem 1.5rem;
            border-radius: 0.375rem;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            border: none;
          }

          .btn-secondary {
            background: white;
            color: #374151;
            border: 1px solid #d1d5db;
          }

          .btn-secondary:hover {
            background: #f9fafb;
          }

          .btn-primary {
            background: #3b82f6;
            color: white;
          }

          .btn-primary:hover {
            background: #2563eb;
          }

          @media print {
            .result-actions {
              display: none;
            }
          }
        `}</style>
      </div>
    )
  }

  // Show closing form (input counted amounts)
  const totals = summary?.totals_by_mode || []
  const openingName = summary?.opening || posOpening?.name

  return (
    <div className="close-shift-view">
      <div className="close-header">
        <h2>Tutup Shift</h2>
        <p className="close-subtitle">Opening: {openingName}</p>
      </div>

      {error && (
        <div className="error-banner">
          <i className="fa fa-exclamation-triangle"></i>
          <span>{error}</span>
        </div>
      )}

      <div className="close-content">
        <div className="instructions">
          <i className="fa fa-info-circle"></i>
          <p>Masukkan jumlah uang yang dihitung untuk setiap metode pembayaran. Sistem akan menghitung selisih antara expected dan counted.</p>
        </div>

        <div className="balance-form">
          <table>
            <thead>
              <tr>
                <th>Metode Pembayaran</th>
                <th className="text-right">Expected</th>
                <th className="text-right">Counted</th>
                <th className="text-right">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((row, index) => {
                const expected = row.total || 0
                const counted = countedBalances[row.mode_of_payment] || 0
                const difference = counted - expected

                return (
                  <tr key={index}>
                    <td>
                      <strong>{row.mode_of_payment}</strong>
                      <div className="invoice-count">
                        {row.invoice_count} transaksi
                      </div>
                    </td>
                    <td className="text-right">{formatCurrency(expected)}</td>
                    <td className="input-cell">
                      <input
                        type="number"
                        step="1000"
                        value={counted}
                        onChange={(e) => handleCountedChange(row.mode_of_payment, e.target.value)}
                        className="counted-input"
                      />
                    </td>
                    <td className={`text-right ${difference > 0 ? 'surplus' : difference < 0 ? 'shortage' : ''}`}>
                      {formatCurrency(difference)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="close-actions">
          <button onClick={onClose} className="btn-secondary" disabled={submitting}>
            <i className="fa fa-times"></i> Batal
          </button>
          <button 
            onClick={handleSubmitClosing} 
            className="btn-primary"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <i className="fa fa-spinner fa-spin"></i> Menutup Shift...
              </>
            ) : (
              <>
                <i className="fa fa-check"></i> Tutup Shift
              </>
            )}
          </button>
        </div>
      </div>

      <style jsx>{`
        .close-shift-view {
          padding: 1.5rem;
          max-width: 1000px;
          margin: 0 auto;
        }

        .close-header {
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid #e5e7eb;
        }

        .close-header h2 {
          margin: 0;
          font-size: 1.75rem;
          color: #111827;
        }

        .close-subtitle {
          margin: 0.5rem 0 0 0;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .error-banner {
          background: #fee2e2;
          border: 1px solid #fecaca;
          color: #991b1b;
          padding: 1rem;
          border-radius: 0.375rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .instructions {
          background: #dbeafe;
          border: 1px solid #bfdbfe;
          color: #1e40af;
          padding: 1rem;
          border-radius: 0.375rem;
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .instructions i {
          margin-top: 0.125rem;
          font-size: 1.125rem;
        }

        .instructions p {
          margin: 0;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .balance-form {
          background: white;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          overflow: hidden;
          margin-bottom: 2rem;
        }

        .balance-form table {
          width: 100%;
          border-collapse: collapse;
        }

        .balance-form th {
          background: #f9fafb;
          padding: 0.75rem 1rem;
          text-align: left;
          font-weight: 600;
          color: #374151;
          font-size: 0.875rem;
          text-transform: uppercase;
          border-bottom: 2px solid #e5e7eb;
        }

        .balance-form td {
          padding: 1rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .invoice-count {
          font-size: 0.75rem;
          color: #6b7280;
          margin-top: 0.25rem;
        }

        .text-right {
          text-align: right;
        }

        .input-cell {
          text-align: right;
        }

        .counted-input {
          width: 100%;
          max-width: 180px;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 1rem;
          text-align: right;
          transition: all 0.2s;
        }

        .counted-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .surplus {
          color: #10b981;
          font-weight: 600;
        }

        .shortage {
          color: #ef4444;
          font-weight: 600;
        }

        .close-actions {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
        }

        .btn-secondary,
        .btn-primary {
          padding: 0.75rem 1.5rem;
          border-radius: 0.375rem;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border: none;
        }

        .btn-secondary {
          background: white;
          color: #374151;
          border: 1px solid #d1d5db;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #f9fafb;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #2563eb;
        }

        .btn-secondary:disabled,
        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}
