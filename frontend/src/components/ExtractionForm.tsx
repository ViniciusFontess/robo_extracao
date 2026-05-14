import { useState, useEffect, FormEvent } from 'react'

const ESTADOS = [
  { uf: 'AC', nome: 'Acre' },
  { uf: 'AL', nome: 'Alagoas' },
  { uf: 'AP', nome: 'Amapá' },
  { uf: 'AM', nome: 'Amazonas' },
  { uf: 'BA', nome: 'Bahia' },
  { uf: 'CE', nome: 'Ceará' },
  { uf: 'DF', nome: 'Distrito Federal' },
  { uf: 'ES', nome: 'Espírito Santo' },
  { uf: 'GO', nome: 'Goiás' },
  { uf: 'MA', nome: 'Maranhão' },
  { uf: 'MT', nome: 'Mato Grosso' },
  { uf: 'MS', nome: 'Mato Grosso do Sul' },
  { uf: 'MG', nome: 'Minas Gerais' },
  { uf: 'PA', nome: 'Pará' },
  { uf: 'PB', nome: 'Paraíba' },
  { uf: 'PR', nome: 'Paraná' },
  { uf: 'PE', nome: 'Pernambuco' },
  { uf: 'PI', nome: 'Piauí' },
  { uf: 'RJ', nome: 'Rio de Janeiro' },
  { uf: 'RN', nome: 'Rio Grande do Norte' },
  { uf: 'RS', nome: 'Rio Grande do Sul' },
  { uf: 'RO', nome: 'Rondônia' },
  { uf: 'RR', nome: 'Roraima' },
  { uf: 'SC', nome: 'Santa Catarina' },
  { uf: 'SP', nome: 'São Paulo' },
  { uf: 'SE', nome: 'Sergipe' },
  { uf: 'TO', nome: 'Tocantins' },
]

const TIPOS = [
  { value: 'empresas', label: '🏢 Empresas' },
  { value: 'restaurantes', label: '🍽️ Restaurantes' },
  { value: 'passeio', label: '🎡 Passeios' },
]

interface Props {
  onStart: (type: string, city: string, state: string, maxResults: number) => void
  loading: boolean
}

export default function ExtractionForm({ onStart, loading }: Props) {
  const [type, setType] = useState('empresas')
  const [state, setState] = useState('MS')
  const [city, setCity] = useState('')
  const [cities, setCities] = useState<string[]>([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [maxResults, setMaxResults] = useState('')

  // Fetch cities from IBGE whenever state changes
  useEffect(() => {
    setLoadingCities(true)
    setCity('')
    fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${state}/municipios?orderBy=nome`
    )
      .then(r => r.json())
      .then((data: { nome: string }[]) => {
        const names = data.map(m => m.nome)
        setCities(names)
        setCity(names[0] ?? '')
      })
      .catch(() => setCities([]))
      .finally(() => setLoadingCities(false))
  }, [state])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!city) return
    const limit = parseInt(maxResults) || 50
    onStart(type, city, state, limit)
  }

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      <h2 style={styles.title}>Nova Extração</h2>
      <div style={styles.row}>

        {/* Tipo */}
        <div style={styles.field}>
          <label style={styles.label}>TIPO</label>
          <select value={type} onChange={e => setType(e.target.value)} style={styles.select}>
            {TIPOS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Estado */}
        <div style={styles.field}>
          <label style={styles.label}>ESTADO</label>
          <select value={state} onChange={e => setState(e.target.value)} style={styles.select}>
            {ESTADOS.map(s => (
              <option key={s.uf} value={s.uf}>{s.uf} — {s.nome}</option>
            ))}
          </select>
        </div>

        {/* Cidade — filtered by state via IBGE */}
        <div style={styles.field}>
          <label style={styles.label}>CIDADE</label>
          <select
            value={city}
            onChange={e => setCity(e.target.value)}
            style={styles.select}
            disabled={loadingCities}
            required
          >
            {loadingCities
              ? <option>Carregando...</option>
              : cities.map(c => <option key={c} value={c}>{c}</option>)
            }
          </select>
        </div>

        {/* Limite */}
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
      <button type="submit" style={styles.button} disabled={loading || loadingCities || !city}>
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
