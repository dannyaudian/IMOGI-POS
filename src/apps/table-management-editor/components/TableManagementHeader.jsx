import { useTableManagementContext } from '../context/TableManagementContext'

export function TableManagementHeader() {
  const { branch, activeTab, setActiveTab } = useTableManagementContext()

  return (
    <div style={{
      marginBottom: '1.5rem',
      background: 'white',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700' }}>
            Table Management
          </h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
            Branch: {branch}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb'
      }}>
        <button
          onClick={() => setActiveTab('layout')}
          style={{
            flex: 1,
            padding: '1rem 1.5rem',
            background: activeTab === 'layout' ? 'white' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'layout' ? '2px solid #3b82f6' : '2px solid transparent',
            color: activeTab === 'layout' ? '#3b82f6' : '#6b7280',
            fontWeight: activeTab === 'layout' ? '600' : '500',
            fontSize: '0.875rem',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          🏢 Floor Layout
        </button>
        <button
          onClick={() => setActiveTab('display')}
          style={{
            flex: 1,
            padding: '1rem 1.5rem',
            background: activeTab === 'display' ? 'white' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'display' ? '2px solid #3b82f6' : '2px solid transparent',
            color: activeTab === 'display' ? '#3b82f6' : '#6b7280',
            fontWeight: activeTab === 'display' ? '600' : '500',
            fontSize: '0.875rem',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          📺 Display Settings
        </button>
      </div>
    </div>
  )
}
