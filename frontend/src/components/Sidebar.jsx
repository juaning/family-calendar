import { useChores } from '../hooks/useChores'

export default function Sidebar() {
  const { chores, loading } = useChores()

  return (
    <div style={{
      height: '100%',
      background: '#1e293b',
      borderLeft: '1px solid #334155',
      padding: 16,
      color: '#e2e8f0',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '1.1rem',
    }}>
      {loading ? 'Loading…' : `${chores.length} chores`}
    </div>
  )
}
