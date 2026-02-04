import { useTableDisplayContext } from '../context/TableDisplayContext'

export function TableDisplayHeader() {
  const { branch } = useTableDisplayContext()

  return (
    <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
      <h1 style={{ fontSize: '2.5rem', margin: 0 }}>Table Layout</h1>
      <p style={{ opacity: 0.8, marginTop: '0.5rem' }}>{branch}</p>
    </header>
  )
}
