import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, Extraction } from '../api'
import ExtractionForm from '../components/ExtractionForm'

export default function DashboardPage() {
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: extractions } = useQuery({
    queryKey: ['extractions'],
    queryFn: () => api.listExtractions().then(r => r.data),
  })

  async function handleStart(type: string, city: string, state: string, maxResults: number) {
    setStarting(true)
    setStartError('')
    try {
      const r = await api.createExtraction(type, city, state, maxResults)
      queryClient.invalidateQueries({ queryKey: ['extractions'] })
      navigate(`/extractions/${r.data.id}`)
    } catch {
      setStartError('Erro ao iniciar extração. Tente novamente.')
    } finally {
      setStarting(false)
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Excluir esta extração e todos os dados?')) return
    setDeletingId(id)
    try {
      await api.deleteExtraction(id)
      queryClient.invalidateQueries({ queryKey: ['extractions'] })
    } finally {
      setDeletingId(null)
    }
  }

  function handleLogout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <span style={styles.brand}>🤖 Robô de Extração</span>
        <button onClick={handleLogout} style={styles.logoutBtn}>Sair</button>
      </div>

      <div style={styles.content}>
        <ExtractionForm onStart={handleStart} loading={starting} />
        {startError && <p style={styles.startError}>{startError}</p>}

        {extractions && extractions.length > 0 && (
          <div style={styles.historyCard}>
            <h3 style={styles.historyTitle}>Extrações Anteriores</h3>
            {extractions.map((ex: Extraction) => (
              <div
                key={ex.id}
                style={styles.historyRow}
                onClick={() => navigate(`/extractions/${ex.id}`)}
              >
                <span style={{ fontWeight: 500 }}>
                  {ex.type} · {ex.city}/{ex.state}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {ex.total_found} registros · {ex.status}
                  </span>
                  <button
                    onClick={e => handleDelete(ex.id, e)}
                    disabled={deletingId === ex.id}
                    style={styles.deleteRowBtn}
                    title="Excluir extração"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f0f4ff', fontFamily: 'sans-serif' },
  topbar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 32px', background: 'white', borderBottom: '1px solid #e0e0e0',
  },
  brand: { fontWeight: 700, fontSize: '17px', color: '#1a73e8' },
  logoutBtn: {
    padding: '6px 14px', border: '1px solid #ddd', borderRadius: '4px',
    background: 'white', cursor: 'pointer', fontSize: '13px',
  },
  content: { maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' },
  startError: { color: '#d32f2f', fontSize: '13px', margin: '8px 0 0' },
  historyCard: {
    background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px',
    padding: '20px', marginTop: '20px',
  },
  historyTitle: { margin: '0 0 16px', fontSize: '16px', color: '#333' },
  historyRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 12px', borderRadius: '6px', cursor: 'pointer',
    borderBottom: '1px solid #f0f0f0',
  },
  deleteRowBtn: {
    padding: '4px 8px', background: 'transparent', color: '#d32f2f',
    border: 'none', borderRadius: '4px', fontSize: '14px',
    cursor: 'pointer', opacity: 0.7,
  },
}
