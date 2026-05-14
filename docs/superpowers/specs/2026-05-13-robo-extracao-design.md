# Design: Robô de Extração — Google Maps

**Data:** 2026-05-13  
**Status:** Aprovado

---

## Visão Geral

Sistema web para extração automatizada de dados de estabelecimentos do Google Maps. O usuário seleciona o tipo de negócio, cidade e estado, e o sistema executa a busca e extração automaticamente via Playwright, salvando os resultados em PostgreSQL.

---

## Stack Tecnológica

- **Frontend:** React (TypeScript)
- **Backend:** Python + FastAPI
- **Scraping:** Playwright (Chromium, modo não-headless)
- **Banco de dados:** PostgreSQL
- **Infraestrutura:** Docker Compose

---

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                   Docker Compose                      │
│                                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌────────┐  │
│  │   Frontend   │    │   Backend    │    │  DB    │  │
│  │   React      │◄──►│   FastAPI    │◄──►│Postgres│  │
│  │   port:3000  │    │   port:8000  │    │  :5432 │  │
│  └──────────────┘    └──────┬───────┘    └────────┘  │
│                             │                         │
│                      ┌──────▼───────┐                 │
│                      │  Playwright  │                 │
│                      │ (Chromium)   │                 │
│                      └──────┬───────┘                 │
└─────────────────────────────┼───────────────────────┘
                              │
                              ▼
                       Google Maps
```

### Fluxo de Execução

1. Usuário preenche formulário (tipo + cidade + estado) e clica "Iniciar Extração"
2. React faz `POST /api/extractions` no FastAPI
3. FastAPI cria registro de extração no PostgreSQL com status `pending`
4. FastAPI dispara job Playwright em background (`BackgroundTasks`)
5. Playwright abre Chromium, navega para `google.com/maps/search/{tipo}+{cidade}+{estado}`
6. Playwright faz scroll no painel de resultados do Maps em loop
7. A cada scroll, extrai dados dos cards visíveis e salva no PostgreSQL
8. Atualiza o contador `total_found` e status da extração em tempo real
9. React faz polling em `GET /api/extractions/{id}` a cada 3s para atualizar UI
10. Ao terminar, status muda para `done`; usuário pode exportar CSV

---

## Frontend (React)

### Páginas

- **`/login`** — formulário de login (usuário/senha)
- **`/`** — dashboard principal (requer autenticação)

### Componentes

| Componente | Responsabilidade |
|---|---|
| `LoginPage` | Formulário de login, salva JWT no localStorage |
| `DashboardPage` | Orquestra os demais componentes |
| `ExtractionForm` | 3 selects (Tipo / Cidade / Estado) + botão Iniciar |
| `ExtractionStatus` | Barra de progresso, contadores (extraídos / salvos / duplicados) |
| `ResultsTable` | Tabela paginada dos resultados + botão Exportar CSV |

### Selects do Formulário

- **Tipo:** Empresas | Restaurantes | Passeio
- **Cidade:** campo de texto livre (digitado pelo usuário)
- **Estado:** dropdown com as 27 siglas dos estados brasileiros (AC, AL, AP, AM, BA, CE, DF, ES, GO, MA, MT, MS, MG, PA, PB, PR, PE, PI, RJ, RN, RS, RO, RR, SC, SP, SE, TO)

### Autenticação

- JWT armazenado no `localStorage`
- Credenciais fixas: `admin` / senha configurável via variável de ambiente
- Rotas protegidas com guard de autenticação

---

## Backend (FastAPI)

### Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/auth/login` | Valida credenciais, retorna JWT |
| `POST` | `/api/extractions` | Inicia nova extração (dispara Playwright em background) |
| `GET` | `/api/extractions` | Lista todas as extrações com status |
| `GET` | `/api/extractions/{id}` | Retorna status e progresso de uma extração |
| `GET` | `/api/extractions/{id}/places` | Resultados paginados |
| `GET` | `/api/extractions/{id}/export` | Download do CSV com todos os lugares |

### Scraper (Playwright)

Estratégia de extração:

1. Abrir Chromium em modo **não-headless** (janela visível) para evitar detecção
2. Navegar para URL de busca montada dinamicamente
3. Aguardar carregamento da lista de resultados
4. Loop de scroll:
   - Scroll no painel esquerdo
   - Aguardar delay aleatório (1–3s) entre cada scroll
   - Extrair dados dos novos cards aparecidos
   - Detectar fim da lista (sem novos resultados após N scrolls)
5. Para cada estabelecimento, clicar no card e extrair detalhes completos
6. Salvar no banco em lotes, ignorando duplicatas

**Anti-detecção:**
- User-agent de Chrome real
- Delays aleatórios entre ações
- Modo não-headless na primeira versão
- Se CAPTCHA detectado: marcar extração como `error` com mensagem descritiva

---

## Banco de Dados (PostgreSQL)

```sql
CREATE TABLE extractions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        VARCHAR(20) NOT NULL,  -- 'empresas' | 'restaurantes' | 'passeio'
    city        VARCHAR(100) NOT NULL,
    state       CHAR(2) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | running | done | error
    total_found INT DEFAULT 0,
    error_msg   TEXT,
    created_at  TIMESTAMP DEFAULT NOW(),
    finished_at TIMESTAMP
);

CREATE TABLE places (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_id   UUID REFERENCES extractions(id) ON DELETE CASCADE,
    name            VARCHAR(255),
    address         TEXT,
    phone           VARCHAR(30),
    website         VARCHAR(500),
    rating          NUMERIC(2,1),
    rating_count    INT,
    category        VARCHAR(100),
    opening_hours   TEXT,
    maps_url        TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(name, address)
);
```

**Notas:**
- `UNIQUE(name, address)` evita duplicatas entre extrações diferentes
- `error_msg` registra mensagem de erro (ex: CAPTCHA detectado)
- `ON DELETE CASCADE` — apagar uma extração remove seus places

---

## Docker Compose

Três serviços:

| Serviço | Imagem | Porta |
|---|---|---|
| `frontend` | Node (build React) | 3000 |
| `backend` | Python 3.12 + Playwright | 8000 |
| `db` | postgres:16 | 5432 |

Variáveis de ambiente configuráveis:
- `ADMIN_PASSWORD` — senha do admin
- `JWT_SECRET` — segredo para assinar tokens
- `DATABASE_URL` — string de conexão PostgreSQL

---

## Estrutura de Pastas

```
robo_extracao/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py          # FastAPI app + rotas
│   ├── scraper.py       # lógica Playwright
│   ├── models.py        # SQLAlchemy models
│   ├── database.py      # engine + sessão
│   └── auth.py          # JWT utils
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── App.tsx
        ├── api.ts           # chamadas HTTP
        ├── pages/
        │   ├── LoginPage.tsx
        │   └── DashboardPage.tsx
        └── components/
            ├── ExtractionForm.tsx
            ├── ExtractionStatus.tsx
            └── ResultsTable.tsx
```

---

## Fora do Escopo (v1)

- Múltiplos usuários / cadastro
- Agendamento automático de extrações
- Notificações por e-mail
- Deploy em produção (v1 é local via Docker Compose)
