import { Extraction } from '../api'

interface Props {
  extraction: Extraction
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#f9ab00',
  running: '#34a853',
  done: '#1a73e8',
  error: '#d32f2f',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '⏳ Aguardando...',
  running: '🔄 Extraindo...',
  done: '✅ Concluído',
  error: '❌ Erro',
}

export default function ExtractionStatus({ extraction }: Props) {
  const color = STATUS_COLOR[extraction.status] ?? '#888'
  const label = STATUS_LABEL[extraction.status] ?? extraction.status

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={{ color, fontWeight: 600 }}>{label}</span>
        <span style={styles.meta}>
          {extraction.type} · {extraction.city}/{extraction.state}
        </span>
      </div>
      {extraction.error_msg && (
        <p style={styles.error}>{extraction.error_msg}</p>
      )}
      <div style={styles.counters}>
        <div style={{ ...styles.counter, background: '#f0f4ff' }}>
          <span style={{ ...styles.num, color: '#1a73e8' }}>{extraction.total_found}</span>
          <span style={styles.numLabel}>Salvos no BD</span>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px',
    padding: '20px', marginBottom: '20px',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '12px',
  },
  meta: { fontSize: '13px', color: '#888' },
  error: { color: '#d32f2f', fontSize: '13px', margin: '0 0 12px' },
  counters: { display: 'flex', gap: '12px' },
  counter: {
    flex: 1, textAlign: 'center', borderRadius: '6px', padding: '12px',
    display: 'flex', flexDirection: 'column', gap: '4px',
  },
  num: { fontSize: '26px', fontWeight: 700 },
  numLabel: { fontSize: '11px', color: '#666' },
}
