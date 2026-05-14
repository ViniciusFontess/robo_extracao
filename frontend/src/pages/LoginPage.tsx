import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const r = await api.login('admin', password)
      localStorage.setItem('token', r.data.access_token)
      navigate('/')
    } catch {
      setError('Senha incorreta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.title}>Robô de Extração</h1>
        <p style={styles.subtitle}>Google Maps</p>
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={styles.input}
          required
        />
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: '#f0f4ff', fontFamily: 'sans-serif',
  },
  card: {
    background: 'white', padding: '40px', borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)', width: '320px',
    display: 'flex', flexDirection: 'column', gap: '16px',
  },
  title: { margin: 0, fontSize: '22px', fontWeight: 700, color: '#333', textAlign: 'center' },
  subtitle: { margin: 0, color: '#888', fontSize: '14px', textAlign: 'center' },
  input: {
    padding: '10px 14px', border: '1px solid #ddd', borderRadius: '6px',
    fontSize: '15px', outline: 'none',
  },
  error: { margin: 0, color: '#d32f2f', fontSize: '13px', textAlign: 'center' },
  button: {
    padding: '12px', background: '#1a73e8', color: 'white', border: 'none',
    borderRadius: '6px', fontSize: '15px', cursor: 'pointer', fontWeight: 600,
  },
}
