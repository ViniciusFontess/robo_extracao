import { useState, FormEvent } from 'react'

const ESTADOS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
]

const TIPOS = [
  { value: 'empresas', label: '🏢 Empresas' },
  { value: 'restaurantes', label: '🍽️ Restaurantes' },
  { value: 'passeio', label: '🎡 Passeio' },
]

interface Props {
  onStart: (type: string, city: string, state: string, maxResults: number) => void
  loading: boolean
}

export default function ExtractionForm({ onStart, loading }: Props) {
  const [type, setType] = useState('empresas')
  const [city, setCity] = useState('')
  const [state, setState] = useState('MS')
  const [maxResults, setMaxResults] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!city.trim()) return
    const limit = parseInt(maxResults) || 50
    onStart(type, city.trim(), state, limit)
  }

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      <h2 style={styles.title}>Nova Extração</h2>
      <div style={styles.row}>
        <div style={styles.field}>
          <label style={styles.label}>TIPO</label>
          <select value={type} onChange={e => setType(e.target.value)} style={styles.select}>
            {TIPOS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>CIDADE</label>
          <input
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="Ex: Dourados"
            style={styles.input}
            required
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>ESTADO</label>
          <select value={state} onChange={e => setState(e.target.value)} style={styles.select}>
            {ESTADOS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>LIMITE</label>
          <input
            type="number"
            min={1}
            value={maxResults}
            onChange={e => setMaxResults(e.target.value)}
            placeholder="50"
            style={styles.input}
          />
          <span style={styles.hint}>
            {maxResults === '' ? 'Padrão: 50' : `Até ${maxResults} resultados`}
          </span>
        </div>
      </div>
      <button type="submit" style={styles.button} disabled={loading}>
        {loading ? '⏳ Iniciando...' : '▶ Iniciar Extração'}
      </button>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px',
    padding: '20px', marginBottom: '20px',
  },
  title: { margin: '0 0 16px', fontSize: '16px', color: '#333' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '11px', fontWeight: 600, color: '#666', letterSpacing: '0.5px' },
  select: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
  input: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
  hint: { fontSize: '11px', color: '#888', marginTop: '2px' },
  button: {
    width: '100%', padding: '12px', background: '#1a73e8', color: 'white',
    border: 'none', borderRadius: '6px', fontSize: '15px', cursor: 'pointer', fontWeight: 600,
  },
}
