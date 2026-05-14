import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, Extraction } from '../api'
import ExtractionForm from '../components/ExtractionForm'
import ExtractionStatus from '../components/ExtractionStatus'
import ResultsTable from '../components/ResultsTable'

export default function DashboardPage() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: activeExtraction } = useQuery({
    queryKey: ['extraction', activeId],
    queryFn: () => api.getExtraction(activeId!).then(r => r.data),
    enabled: !!activeId,
    refetchInterval: query => {
      const s = query.state.data?.status
      return s === 'running' || s === 'pending' ? 3000 : false
    },
  })

  const { data: extractions, refetch: refetchList } = useQuery({
    queryKey: ['extractions'],
    queryFn: () => api.listExtractions().then(r => r.data),
  })

  async function handleStart(type: string, city: string, state: string, maxResults: number) {
    setStarting(true)
    setStartError('')
    try {
      const r = await api.createExtraction(type, city, state, maxResults)
      setActiveId(r.data.id)
      refetchList()
    } catch {
      setStartError('Erro ao iniciar extração. Tente novamente.')
    } finally {
      setStarting(false)
    }
  }

  const isTerminal = activeExtraction?.status === 'done' || activeExtraction?.status === 'error'

  function handleNewExtraction() {
    setActiveId(null)
    setStartError('')
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Excluir esta extração e todos os dados?')) return
    setDeletingId(id)
    try {
      await api.deleteExtraction(id)
      if (activeId === id) setActiveId(null)
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
        {!activeId ? (
          <>
            <ExtractionForm onStart={handleStart} loading={starting} />
            {startError && <p style={styles.startError}>{startError}</p>}
          </>
        ) : (
          <>
            {activeExtraction && <ExtractionStatus extraction={activeExtraction} />}
            {isTerminal && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button onClick={handleNewExtraction} style={styles.newBtn}>
                  + Nova Extração
                </button>
                <button
                  onClick={e => handleDelete(activeExtraction!.id, e)}
                  disabled={deletingId === activeExtraction?.id}
                  style={styles.deleteBtn}
                >
                  🗑 Excluir
                </button>
              </div>
            )}
            {activeExtraction && activeExtraction.total_found > 0 && (
              <ResultsTable extractionId={activeExtraction.id} />
            )}
          </>
        )}

        {!activeId && extractions && extractions.length > 0 && (
          <div style={styles.historyCard}>
            <h3 style={styles.historyTitle}>Extrações Anteriores</h3>
            {extractions.map((ex: Extraction) => (
              <div
                key={ex.id}
                style={styles.historyRow}
                onClick={() => setActiveId(ex.id)}
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
  newBtn: {
    padding: '10px 20px', background: '#1a73e8', color: 'white', border: 'none',
    borderRadius: '6px', fontSize: '14px', cursor: 'pointer', fontWeight: 600,
    marginTop: '16px',
  },
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
  deleteBtn: {
    padding: '8px 16px', background: '#fff', color: '#d32f2f',
    border: '1px solid #d32f2f', borderRadius: '6px', fontSize: '13px',
    cursor: 'pointer', fontWeight: 600,
  },
  deleteRowBtn: {
    padding: '4px 8px', background: 'transparent', color: '#d32f2f',
    border: 'none', borderRadius: '4px', fontSize: '14px',
    cursor: 'pointer', opacity: 0.7,
  },
}
