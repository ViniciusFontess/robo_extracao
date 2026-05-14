import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import ExtractionStatus from '../components/ExtractionStatus'
import ResultsTable from '../components/ResultsTable'

export default function ExtractionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: extraction, isError } = useQuery({
    queryKey: ['extraction', id],
    queryFn: () => api.getExtraction(id!).then(r => r.data),
    enabled: !!id,
    refetchInterval: query => {
      const s = query.state.data?.status
      return s === 'running' || s === 'pending' ? 3000 : false
    },
  })

  const isTerminal = extraction?.status === 'done' || extraction?.status === 'error'

  async function handleDelete() {
    if (!extraction) return
    if (!window.confirm('Excluir esta extração e todos os dados?')) return
    await api.deleteExtraction(extraction.id)
    queryClient.invalidateQueries({ queryKey: ['extractions'] })
    navigate('/')
  }

  if (isError) {
    return (
      <div style={styles.page}>
        <div style={styles.topbar}>
          <button onClick={() => navigate('/')} style={styles.backBtn}>← Voltar</button>
        </div>
        <div style={styles.content}>
          <p style={{ color: '#d32f2f' }}>Extração não encontrada.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <button onClick={() => navigate('/')} style={styles.backBtn}>← Voltar</button>
        <span style={styles.brand}>🤖 Robô de Extração</span>
        <button onClick={() => { localStorage.removeItem('token'); navigate('/login') }} style={styles.logoutBtn}>
          Sair
        </button>
      </div>

      <div style={styles.content}>
        {extraction && (
          <>
            <ExtractionStatus extraction={extraction} />

            {isTerminal && (
              <div style={styles.actions}>
                <button onClick={() => navigate('/')} style={styles.newBtn}>+ Nova Extração</button>
                <button onClick={handleDelete} style={styles.deleteBtn}>🗑 Excluir</button>
              </div>
            )}

            {extraction.total_found > 0 && (
              <ResultsTable extractionId={extraction.id} />
            )}
          </>
        )}

        {!extraction && !isError && (
          <p style={{ color: '#888' }}>Carregando extração...</p>
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
  backBtn: {
    padding: '6px 14px', border: '1px solid #ddd', borderRadius: '4px',
    background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    color: '#1a73e8',
  },
  logoutBtn: {
    padding: '6px 14px', border: '1px solid #ddd', borderRadius: '4px',
    background: 'white', cursor: 'pointer', fontSize: '13px',
  },
  content: { maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' },
  actions: { display: 'flex', gap: '10px', marginBottom: '20px' },
  newBtn: {
    padding: '10px 20px', background: '#1a73e8', color: 'white', border: 'none',
    borderRadius: '6px', fontSize: '14px', cursor: 'pointer', fontWeight: 600,
  },
  deleteBtn: {
    padding: '10px 16px', background: '#fff', color: '#d32f2f',
    border: '1px solid #d32f2f', borderRadius: '6px', fontSize: '13px',
    cursor: 'pointer', fontWeight: 600,
  },
}
