import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

interface Props {
  extractionId: string
}

export default function ResultsTable({ extractionId }: Props) {
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [extractionId])

  const { data } = useQuery({
    queryKey: ['places', extractionId, page],
    queryFn: () => api.getPlaces(extractionId, page).then(r => r.data),
    enabled: !!extractionId,
  })

  if (!data || data.total === 0) {
    return (
      <div style={styles.card}>
        <p style={{ color: '#888', margin: 0 }}>Nenhum resultado ainda.</p>
      </div>
    )
  }

  const totalPages = Math.ceil(data.total / data.page_size)

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h3 style={styles.title}>Resultados ({data.total})</h3>
        <button
          onClick={async () => {
            const r = await api.exportCsv(extractionId)
            const url = URL.createObjectURL(r.data as Blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `extracao_${extractionId}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }}
          style={styles.exportBtn}
        >
          ⬇ Exportar CSV
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.thead}>
              <th style={styles.th}>Nome</th>
              <th style={styles.th}>Endereço</th>
              <th style={styles.th}>Telefone</th>
              <th style={styles.th}>Rating</th>
              <th style={styles.th}>Categoria</th>
              <th style={styles.th}>Website</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p, i) => (
              <tr key={p.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={styles.td}>{p.name ?? '—'}</td>
                <td style={styles.td}>{p.address ?? '—'}</td>
                <td style={styles.td}>{p.phone ?? '—'}</td>
                <td style={styles.td}>
                  {p.rating != null ? `⭐ ${p.rating} (${p.rating_count ?? 0})` : '—'}
                </td>
                <td style={styles.td}>{p.category ?? '—'}</td>
                <td style={styles.td}>
                  {p.website
                    ? <a href={p.website} target="_blank" rel="noreferrer" style={{ color: '#1a73e8' }}>link</a>
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={styles.pageBtn}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: '13px', color: '#666' }}>
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={styles.pageBtn}
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { margin: 0, fontSize: '16px', color: '#333' },
  exportBtn: {
    background: '#34a853', color: 'white', padding: '6px 14px',
    borderRadius: '4px', fontSize: '13px', border: 'none', cursor: 'pointer',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  thead: { background: '#f5f5f5' },
  th: {
    padding: '8px 12px', textAlign: 'left', color: '#666',
    fontWeight: 600, borderBottom: '1px solid #e0e0e0',
  },
  td: { padding: '8px 12px', borderBottom: '1px solid #f0f0f0' },
  pagination: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    gap: '16px', marginTop: '16px',
  },
  pageBtn: {
    padding: '6px 14px', border: '1px solid #ddd', borderRadius: '4px',
    cursor: 'pointer', background: 'white', fontSize: '13px',
  },
}
