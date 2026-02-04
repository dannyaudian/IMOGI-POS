import { useState, useEffect } from 'react'
import { apiCall } from '@/shared/utils/api'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { BlockedScreen } from './BlockedScreen'
import { formatCurrency } from '@/shared/utils/formatters'

export function ShiftSummaryView({ posProfile, posOpening, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [checkingOpening, setCheckingOpening] = useState(true)
  const [hasOpening, setHasOpening] = useState(false)

  useEffect(() => {
    checkOpeningAndLoadSummary()
  }, [])

  const checkOpeningAndLoadSummary = async () => {
    try {
      setCheckingOpening(true)
      
      // Step 1: Verify active opening exists (page-level guard)
      const openingRes = await apiCall('imogi_pos.api.cashier.get_active_opening')
      
      if (!openingRes?.success || !openingRes?.has_opening) {
        console.error('[ShiftSummary] No active opening found')
        setHasOpening(false)
        setCheckingOpening(false)
        return
      }

      setHasOpening(true)
      setCheckingOpening(false)

      // Step 2: Fetch summary data
      setLoading(true)
      const summaryRes = await apiCall('imogi_pos.api.cashier.get_opening_summary')
      
      if (!summaryRes?.success) {
        throw new Error(summaryRes?.error || 'Failed to load summary')
      }

      setSummary(summaryRes)
      setError(null)
    } catch (err) {
      console.error('[ShiftSummary] Load failed:', err)
      setError(err.message || 'Failed to load shift summary')
    } finally {
      setLoading(false)
    }
  }
  const handleRefresh = () => {
    checkOpeningAndLoadSummary()
  }

  const handlePrint = () => {
    window.print()
  }

  // Page-level guard: Block if no opening (NO modal, just error + redirect)
  if (checkingOpening) {
    return <LoadingSpinner message="Checking POS opening..." />
  }

  if (!hasOpening) {
    return (
      <BlockedScreen
        title="Tidak ada POS Opening aktif"
        message="Silakan buat POS Opening Entry lalu klik Open POS untuk memulai shift."
        actions={[
          { 
            label: "Buat POS Opening Entry", 
            href: `/app/pos-opening-entry/new-pos-opening-entry-1?pos_profile=${encodeURIComponent(posProfile || '')}` 
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
    return <LoadingSpinner message="Loading shift summary..." />
  }

  if (error) {
    return (
      <ErrorMessage 
        error={error}
        onRetry={handleRefresh}
      />
    )
  }

  const totals = summary?.totals_by_mode || []
  const grandTotal = summary?.grand_total || 0
  const openingName = summary?.opening || posOpening?.name || 'N/A'

  return (
    <div className="shift-summary-view">
      <div className="summary-header">
        <div className="summary-title">
          <h2>Ringkasan Shift</h2>
          <p className="summary-subtitle">Opening: {openingName}</p>
        </div>
        <div className="summary-actions">
          <button onClick={handleRefresh} className="btn-secondary">
            <i className="fa fa-sync"></i> Refresh
          </button>
          <button onClick={handlePrint} className="btn-secondary">
            <i className="fa fa-print"></i> Print
          </button>
          <button onClick={onClose} className="btn-secondary">
            <i className="fa fa-times"></i> Tutup
          </button>
        </div>
      </div>

      <div className="summary-content">
        {totals.length === 0 ? (
          <div className="empty-summary">
            <i className="fa fa-inbox fa-3x"></i>
            <p>Belum ada pembayaran pada shift ini</p>
          </div>
        ) : (
          <>
            <div className="summary-table">
              <table>
                <thead>
                  <tr>
                    <th>Metode Pembayaran</th>
                    <th className="text-center">Jumlah Transaksi</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.map((row, index) => (
                    <tr key={index}>
                      <td>
                        <strong>{row.mode_of_payment}</strong>
                      </td>
                      <td className="text-center">
                        {row.invoice_count}
                      </td>
                      <td className="text-right">
                        {formatCurrency(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="grand-total-row">
                    <td><strong>Total Keseluruhan</strong></td>
                    <td className="text-center">
                      <strong>{totals.reduce((sum, row) => sum + (row.invoice_count || 0), 0)}</strong>
                    </td>
                    <td className="text-right">
                      <strong>{formatCurrency(grandTotal)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="summary-chart">
              <h3>Distribusi Pembayaran</h3>
              <div className="chart-bars">
                {totals.map((row, index) => {
                  const percentage = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0
                  return (
                    <div key={index} className="chart-bar-item">
                      <div className="chart-bar-label">
                        <span>{row.mode_of_payment}</span>
                        <span>{percentage.toFixed(1)}%</span>
                      </div>
                      <div className="chart-bar-track">
                        <div 
                          className="chart-bar-fill" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <div className="chart-bar-amount">
                        {formatCurrency(row.total)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .shift-summary-view {
          padding: 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .summary-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid #e5e7eb;
        }

        .summary-title h2 {
          margin: 0;
          font-size: 1.75rem;
          color: #111827;
        }

        .summary-subtitle {
          margin: 0.25rem 0 0 0;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .summary-actions {
          display: flex;
          gap: 0.75rem;
        }

        .btn-secondary {
          padding: 0.5rem 1rem;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          cursor: pointer;
          font-size: 0.875rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .empty-summary {
          text-align: center;
          padding: 4rem 2rem;
          color: #6b7280;
        }

        .empty-summary i {
          color: #d1d5db;
          margin-bottom: 1rem;
        }

        .summary-table {
          background: white;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          overflow: hidden;
          margin-bottom: 2rem;
        }

        .summary-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .summary-table th {
          background: #f9fafb;
          padding: 0.75rem 1rem;
          text-align: left;
          font-weight: 600;
          color: #374151;
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .summary-table td {
          padding: 1rem;
          border-top: 1px solid #e5e7eb;
        }

        .text-center {
          text-align: center;
        }

        .text-right {
          text-align: right;
        }

        .grand-total-row {
          background: #f9fafb;
          font-size: 1.125rem;
        }

        .grand-total-row td {
          padding: 1.25rem 1rem;
          border-top: 2px solid #d1d5db;
        }

        .summary-chart {
          background: white;
          padding: 1.5rem;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .summary-chart h3 {
          margin: 0 0 1.5rem 0;
          font-size: 1.125rem;
          color: #111827;
        }

        .chart-bars {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .chart-bar-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .chart-bar-label {
          display: flex;
          justify-content: space-between;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        .chart-bar-track {
          height: 2rem;
          background: #f3f4f6;
          border-radius: 0.375rem;
          overflow: hidden;
        }

        .chart-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #2563eb);
          transition: width 0.5s ease;
        }

        .chart-bar-amount {
          font-size: 0.875rem;
          color: #6b7280;
          text-align: right;
        }

        @media print {
          .summary-actions {
            display: none;
          }
          
          .summary-chart {
            page-break-before: always;
          }
        }
      `}</style>
    </div>
  )
}
