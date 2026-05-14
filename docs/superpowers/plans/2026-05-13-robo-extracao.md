# Robô de Extração Google Maps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema web com React + FastAPI + Playwright que extrai automaticamente dados de estabelecimentos do Google Maps (empresas, restaurantes, passeios) por cidade/estado e salva no PostgreSQL.

**Architecture:** O usuário seleciona tipo/cidade/estado no frontend React; o backend FastAPI dispara um job Playwright em background que navega pelo Google Maps, faz scroll, extrai dados e persiste no PostgreSQL; o frontend faz polling a cada 3s para mostrar progresso em tempo real.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, Playwright, PostgreSQL 16, React 18, TypeScript, Vite, Axios, TanStack Query, Docker Compose.

---

## File Map

```
robo_extracao/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── database.py        # engine SQLAlchemy + get_db dependency
│   ├── models.py          # Extraction + Place ORM models
│   ├── schemas.py         # Pydantic schemas (request/response)
│   ├── auth.py            # JWT create/verify + login route
│   ├── scraper.py         # lógica Playwright (extração Google Maps)
│   ├── main.py            # FastAPI app, startup, todas as rotas
│   └── tests/
│       ├── conftest.py    # fixtures: db em memória, client HTTP
│       ├── test_models.py
│       ├── test_auth.py
│       └── test_api.py
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api.ts                         # todas chamadas HTTP
        ├── pages/
        │   ├── LoginPage.tsx
        │   └── DashboardPage.tsx
        └── components/
            ├── ExtractionForm.tsx         # 3 selects + botão iniciar
            ├── ExtractionStatus.tsx       # progresso + contadores
            └── ResultsTable.tsx           # tabela paginada + exportar CSV
```

---

## Task 1: Estrutura Base e Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Criar `.env.example`**

```env
ADMIN_PASSWORD=admin123
JWT_SECRET=troque-este-segredo-em-producao
DATABASE_URL=postgresql://robo:robo123@db:5432/robo_extracao
POSTGRES_USER=robo
POSTGRES_PASSWORD=robo123
POSTGRES_DB=robo_extracao
```

- [ ] **Step 2: Criar `docker-compose.yml`**

```yaml
version: "3.9"

services:
  db:
    image: postgres:16
    env_file: .env
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $POSTGRES_USER -d $POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build: ./backend
    env_file: .env
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./backend:/app

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
    volumes:
      - ./frontend/src:/app/src

volumes:
  pgdata:
```

- [ ] **Step 3: Criar `backend/Dockerfile`**

```dockerfile
FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium

COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

- [ ] **Step 4: Criar `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
```

- [ ] **Step 5: Copiar `.env.example` para `.env`**

```bash
cp .env.example .env
```

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example backend/Dockerfile frontend/Dockerfile
git commit -m "feat: add docker compose and dockerfiles"
```

---

## Task 2: Backend — Dependências e Banco de Dados

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/database.py`
- Create: `backend/models.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_models.py`

- [ ] **Step 1: Criar `backend/requirements.txt`**

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy==2.0.30
psycopg2-binary==2.9.9
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
playwright==1.44.0
httpx==0.27.0
pytest==8.2.0
pytest-asyncio==0.23.6
```

- [ ] **Step 2: Criar `backend/database.py`**

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 3: Criar `backend/models.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Numeric, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base

class Extraction(Base):
    __tablename__ = "extractions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type = Column(String(20), nullable=False)   # empresas | restaurantes | passeio
    city = Column(String(100), nullable=False)
    state = Column(String(2), nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending|running|done|error
    total_found = Column(Integer, default=0)
    error_msg = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime)

    places = relationship("Place", back_populates="extraction", cascade="all, delete")

class Place(Base):
    __tablename__ = "places"
    __table_args__ = (UniqueConstraint("name", "address", name="uq_place_name_address"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    extraction_id = Column(UUID(as_uuid=True), ForeignKey("extractions.id", ondelete="CASCADE"))
    name = Column(String(255))
    address = Column(Text)
    phone = Column(String(30))
    website = Column(String(500))
    rating = Column(Numeric(2, 1))
    rating_count = Column(Integer)
    category = Column(String(100))
    opening_hours = Column(Text)
    maps_url = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    extraction = relationship("Extraction", back_populates="places")
```

- [ ] **Step 4: Criar `backend/tests/conftest.py`**

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from database import Base, get_db
from main import app

TEST_DB_URL = "sqlite:///./test.db"

@pytest.fixture(scope="function")
def db():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        yield db
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
```

- [ ] **Step 5: Escrever teste de models**

Criar `backend/tests/test_models.py`:

```python
import uuid
from models import Extraction, Place

def test_extraction_defaults(db):
    extraction = Extraction(type="empresas", city="Dourados", state="MS")
    db.add(extraction)
    db.commit()
    db.refresh(extraction)

    assert extraction.status == "pending"
    assert extraction.total_found == 0
    assert extraction.id is not None

def test_place_linked_to_extraction(db):
    extraction = Extraction(type="empresas", city="Dourados", state="MS")
    db.add(extraction)
    db.commit()

    place = Place(
        extraction_id=extraction.id,
        name="Empresa Teste",
        address="Rua A, 100",
    )
    db.add(place)
    db.commit()
    db.refresh(place)

    assert place.extraction_id == extraction.id

def test_place_unique_name_address(db):
    extraction = Extraction(type="empresas", city="Dourados", state="MS")
    db.add(extraction)
    db.commit()

    place1 = Place(extraction_id=extraction.id, name="Empresa X", address="Rua A, 1")
    place2 = Place(extraction_id=extraction.id, name="Empresa X", address="Rua A, 1")
    db.add(place1)
    db.commit()
    db.add(place2)

    import pytest
    with pytest.raises(Exception):  # IntegrityError
        db.commit()
```

- [ ] **Step 6: Rodar testes (devem falhar — main.py ainda não existe)**

```bash
cd backend
pip install -r requirements.txt
pytest tests/test_models.py -v
```

Esperado: `ImportError: No module named 'main'` — normal, main.py ainda não existe.

- [ ] **Step 7: Criar `backend/main.py` mínimo para os testes passarem**

```python
import os
from fastapi import FastAPI
from database import Base, engine

app = FastAPI(title="Robô de Extração")

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
```

- [ ] **Step 8: Rodar testes novamente**

```bash
pytest tests/test_models.py -v
```

Esperado:
```
test_models.py::test_extraction_defaults PASSED
test_models.py::test_place_linked_to_extraction PASSED
test_models.py::test_place_unique_name_address PASSED
```

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat: add database models and passing model tests"
```

---

## Task 3: Backend — Schemas Pydantic

**Files:**
- Create: `backend/schemas.py`

- [ ] **Step 1: Criar `backend/schemas.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

# Auth
class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

# Extraction
class ExtractionCreate(BaseModel):
    type: str       # empresas | restaurantes | passeio
    city: str
    state: str      # sigla 2 letras

class ExtractionResponse(BaseModel):
    id: uuid.UUID
    type: str
    city: str
    state: str
    status: str
    total_found: int
    error_msg: Optional[str]
    created_at: datetime
    finished_at: Optional[datetime]

    class Config:
        from_attributes = True

# Place
class PlaceResponse(BaseModel):
    id: uuid.UUID
    name: Optional[str]
    address: Optional[str]
    phone: Optional[str]
    website: Optional[str]
    rating: Optional[float]
    rating_count: Optional[int]
    category: Optional[str]
    opening_hours: Optional[str]
    maps_url: Optional[str]

    class Config:
        from_attributes = True

class PlacesPage(BaseModel):
    items: list[PlaceResponse]
    total: int
    page: int
    page_size: int
```

- [ ] **Step 2: Commit**

```bash
git add backend/schemas.py
git commit -m "feat: add pydantic schemas"
```

---

## Task 4: Backend — Autenticação JWT

**Files:**
- Create: `backend/auth.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Escrever testes de auth**

Criar `backend/tests/test_auth.py`:

```python
import os
os.environ.setdefault("ADMIN_PASSWORD", "testpass")
os.environ.setdefault("JWT_SECRET", "test-secret")

def test_login_success(client):
    response = client.post("/auth/login", json={"username": "admin", "password": "testpass"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_wrong_password(client):
    response = client.post("/auth/login", json={"username": "admin", "password": "errada"})
    assert response.status_code == 401

def test_protected_route_without_token(client):
    response = client.get("/api/extractions")
    assert response.status_code == 401

def test_protected_route_with_token(client):
    login = client.post("/auth/login", json={"username": "admin", "password": "testpass"})
    token = login.json()["access_token"]
    response = client.get("/api/extractions", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
```

- [ ] **Step 2: Rodar — deve falhar**

```bash
pytest tests/test_auth.py -v
```

Esperado: `FAILED` — rota `/auth/login` não existe ainda.

- [ ] **Step 3: Criar `backend/auth.py`**

```python
import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.environ.get("JWT_SECRET", "dev-secret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 horas

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
        return username
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
```

- [ ] **Step 4: Adicionar rota de login em `backend/main.py`**

```python
import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine, get_db
from auth import create_access_token, verify_token
from schemas import LoginRequest, TokenResponse

app = FastAPI(title="Robô de Extração")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)

@app.post("/auth/login", response_model=TokenResponse)
def login(body: LoginRequest):
    admin_pass = os.environ.get("ADMIN_PASSWORD", "admin123")
    if body.username != "admin" or body.password != admin_pass:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")
    token = create_access_token({"sub": "admin"})
    return TokenResponse(access_token=token)

@app.get("/api/extractions", dependencies=[Depends(verify_token)])
def list_extractions():
    return []  # implementação completa na próxima task
```

- [ ] **Step 5: Rodar testes**

```bash
pytest tests/test_auth.py -v
```

Esperado:
```
test_auth.py::test_login_success PASSED
test_auth.py::test_login_wrong_password PASSED
test_auth.py::test_protected_route_without_token PASSED
test_auth.py::test_protected_route_with_token PASSED
```

- [ ] **Step 6: Commit**

```bash
git add backend/auth.py backend/main.py
git commit -m "feat: add JWT auth with login endpoint"
```

---

## Task 5: Backend — Endpoints de Extração (CRUD)

**Files:**
- Modify: `backend/main.py`
- Create: `backend/tests/test_api.py`

- [ ] **Step 1: Escrever testes da API**

Criar `backend/tests/test_api.py`:

```python
import os
os.environ.setdefault("ADMIN_PASSWORD", "testpass")
os.environ.setdefault("JWT_SECRET", "test-secret")

def get_token(client):
    r = client.post("/auth/login", json={"username": "admin", "password": "testpass"})
    return r.json()["access_token"]

def auth(client):
    return {"Authorization": f"Bearer {get_token(client)}"}

def test_create_extraction(client):
    r = client.post("/api/extractions",
        json={"type": "empresas", "city": "Dourados", "state": "MS"},
        headers=auth(client))
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "pending"
    assert data["city"] == "Dourados"
    assert "id" in data

def test_list_extractions(client):
    headers = auth(client)
    client.post("/api/extractions",
        json={"type": "restaurantes", "city": "Campo Grande", "state": "MS"},
        headers=headers)
    r = client.get("/api/extractions", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1

def test_get_extraction_status(client):
    headers = auth(client)
    created = client.post("/api/extractions",
        json={"type": "empresas", "city": "Dourados", "state": "MS"},
        headers=headers).json()
    r = client.get(f"/api/extractions/{created['id']}", headers=headers)
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]

def test_get_extraction_places_empty(client):
    headers = auth(client)
    created = client.post("/api/extractions",
        json={"type": "empresas", "city": "Dourados", "state": "MS"},
        headers=headers).json()
    r = client.get(f"/api/extractions/{created['id']}/places", headers=headers)
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert r.json()["total"] == 0
```

- [ ] **Step 2: Rodar — deve falhar**

```bash
pytest tests/test_api.py -v
```

Esperado: `FAILED` — rotas de extração ainda não implementadas completamente.

- [ ] **Step 3: Completar `backend/main.py` com todos os endpoints**

```python
import os
import csv
import io
import uuid
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import Base, engine, get_db
from auth import create_access_token, verify_token
from models import Extraction, Place
from schemas import (
    LoginRequest, TokenResponse,
    ExtractionCreate, ExtractionResponse,
    PlaceResponse, PlacesPage,
)
from scraper import run_extraction

app = FastAPI(title="Robô de Extração")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)

@app.post("/auth/login", response_model=TokenResponse)
def login(body: LoginRequest):
    admin_pass = os.environ.get("ADMIN_PASSWORD", "admin123")
    if body.username != "admin" or body.password != admin_pass:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")
    token = create_access_token({"sub": "admin"})
    return TokenResponse(access_token=token)

@app.post("/api/extractions", response_model=ExtractionResponse, status_code=201,
          dependencies=[Depends(verify_token)])
def create_extraction(body: ExtractionCreate, background_tasks: BackgroundTasks,
                      db: Session = Depends(get_db)):
    allowed_types = {"empresas", "restaurantes", "passeio"}
    if body.type not in allowed_types:
        raise HTTPException(status_code=422, detail=f"type deve ser um de: {allowed_types}")
    if len(body.state) != 2:
        raise HTTPException(status_code=422, detail="state deve ter 2 letras (ex: MS)")

    extraction = Extraction(type=body.type, city=body.city, state=body.state.upper())
    db.add(extraction)
    db.commit()
    db.refresh(extraction)

    background_tasks.add_task(run_extraction, str(extraction.id))
    return extraction

@app.get("/api/extractions", response_model=list[ExtractionResponse],
         dependencies=[Depends(verify_token)])
def list_extractions(db: Session = Depends(get_db)):
    return db.query(Extraction).order_by(Extraction.created_at.desc()).all()

@app.get("/api/extractions/{extraction_id}", response_model=ExtractionResponse,
         dependencies=[Depends(verify_token)])
def get_extraction(extraction_id: uuid.UUID, db: Session = Depends(get_db)):
    extraction = db.get(Extraction, extraction_id)
    if not extraction:
        raise HTTPException(status_code=404, detail="Extração não encontrada")
    return extraction

@app.get("/api/extractions/{extraction_id}/places", response_model=PlacesPage,
         dependencies=[Depends(verify_token)])
def get_places(extraction_id: uuid.UUID, page: int = Query(1, ge=1),
               page_size: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    extraction = db.get(Extraction, extraction_id)
    if not extraction:
        raise HTTPException(status_code=404, detail="Extração não encontrada")
    total = db.query(Place).filter(Place.extraction_id == extraction_id).count()
    items = (db.query(Place)
             .filter(Place.extraction_id == extraction_id)
             .offset((page - 1) * page_size)
             .limit(page_size)
             .all())
    return PlacesPage(items=items, total=total, page=page, page_size=page_size)

@app.get("/api/extractions/{extraction_id}/export", dependencies=[Depends(verify_token)])
def export_csv(extraction_id: uuid.UUID, db: Session = Depends(get_db)):
    extraction = db.get(Extraction, extraction_id)
    if not extraction:
        raise HTTPException(status_code=404, detail="Extração não encontrada")
    places = db.query(Place).filter(Place.extraction_id == extraction_id).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["nome", "endereço", "telefone", "website", "rating",
                     "nº avaliações", "categoria", "horário", "maps_url"])
    for p in places:
        writer.writerow([p.name, p.address, p.phone, p.website, p.rating,
                         p.rating_count, p.category, p.opening_hours, p.maps_url])
    output.seek(0)
    filename = f"extracao_{extraction.type}_{extraction.city}_{extraction.state}.csv"
    return StreamingResponse(output, media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})
```

- [ ] **Step 4: Criar `backend/scraper.py` stub (implementação completa na próxima task)**

```python
def run_extraction(extraction_id: str):
    """Placeholder — implementado na Task 6."""
    pass
```

- [ ] **Step 5: Rodar todos os testes**

```bash
pytest tests/ -v
```

Esperado: todos os testes passando.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/scraper.py backend/tests/test_api.py
git commit -m "feat: add extraction CRUD endpoints and CSV export"
```

---

## Task 6: Backend — Scraper Playwright

**Files:**
- Modify: `backend/scraper.py`

- [ ] **Step 1: Implementar `backend/scraper.py`**

```python
import os
import time
import random
from datetime import datetime
from sqlalchemy.exc import IntegrityError
from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

from database import SessionLocal
from models import Extraction, Place

DATABASE_URL = os.environ.get("DATABASE_URL", "")

def _random_delay(min_s=1.0, max_s=3.0):
    time.sleep(random.uniform(min_s, max_s))

def _save_place(db, extraction_id: str, data: dict):
    if not data.get("name"):
        return
    place = Place(
        extraction_id=extraction_id,
        name=data.get("name"),
        address=data.get("address"),
        phone=data.get("phone"),
        website=data.get("website"),
        rating=data.get("rating"),
        rating_count=data.get("rating_count"),
        category=data.get("category"),
        opening_hours=data.get("opening_hours"),
        maps_url=data.get("maps_url"),
    )
    db.add(place)
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False  # duplicata ignorada

def _update_status(db, extraction_id: str, status: str, error_msg: str = None):
    extraction = db.get(Extraction, extraction_id)
    if extraction:
        extraction.status = status
        if error_msg:
            extraction.error_msg = error_msg
        if status in ("done", "error"):
            extraction.finished_at = datetime.utcnow()
        db.commit()

def _increment_found(db, extraction_id: str):
    extraction = db.get(Extraction, extraction_id)
    if extraction:
        extraction.total_found += 1
        db.commit()

def _extract_place_details(page) -> dict:
    """Extrai dados do painel de detalhes do lugar atualmente aberto."""
    data = {}
    try:
        data["maps_url"] = page.url
        # Nome
        try:
            data["name"] = page.locator("h1").first.inner_text(timeout=3000)
        except Exception:
            data["name"] = None
        # Rating
        try:
            rating_el = page.locator("div[jsaction*='pane.rating'] span[aria-label]").first
            aria = rating_el.get_attribute("aria-label", timeout=2000) or ""
            # aria-label: "4,3 estrelas" → 4.3
            parts = aria.split()
            if parts:
                data["rating"] = float(parts[0].replace(",", "."))
        except Exception:
            data["rating"] = None
        # Número de avaliações
        try:
            reviews_el = page.locator("button[jsaction*='pane.rating.moreReviews'] span").first
            text = reviews_el.inner_text(timeout=2000).replace(".", "").replace("(", "").replace(")", "")
            data["rating_count"] = int(text)
        except Exception:
            data["rating_count"] = None
        # Categoria
        try:
            data["category"] = page.locator("button.DkEaL").first.inner_text(timeout=2000)
        except Exception:
            data["category"] = None
        # Endereço
        try:
            addr_el = page.locator("button[data-item-id='address']").first
            data["address"] = addr_el.get_attribute("aria-label", timeout=2000)
            if data["address"]:
                data["address"] = data["address"].replace("Endereço: ", "")
        except Exception:
            data["address"] = None
        # Telefone
        try:
            phone_el = page.locator("button[data-item-id^='phone']").first
            data["phone"] = phone_el.get_attribute("aria-label", timeout=2000)
            if data["phone"]:
                data["phone"] = data["phone"].replace("Telefone: ", "")
        except Exception:
            data["phone"] = None
        # Website
        try:
            web_el = page.locator("a[data-item-id='authority']").first
            data["website"] = web_el.get_attribute("href", timeout=2000)
        except Exception:
            data["website"] = None
        # Horário
        try:
            hours_el = page.locator("div[jsaction*='openhours'] div[aria-label]").first
            data["opening_hours"] = hours_el.get_attribute("aria-label", timeout=2000)
        except Exception:
            data["opening_hours"] = None
    except Exception:
        pass
    return data

def run_extraction(extraction_id: str):
    db = SessionLocal()
    try:
        _update_status(db, extraction_id, "running")
        extraction = db.get(Extraction, extraction_id)
        query = f"{extraction.type} {extraction.city} {extraction.state}"
        search_url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"

        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=False,  # não-headless para evitar detecção
                args=["--start-maximized"],
            )
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 900},
                locale="pt-BR",
            )
            page = context.new_page()
            page.goto(search_url, wait_until="networkidle", timeout=30000)
            _random_delay(2, 4)

            # Painel de lista de resultados
            feed_selector = 'div[role="feed"]'
            try:
                page.wait_for_selector(feed_selector, timeout=15000)
            except PwTimeout:
                _update_status(db, extraction_id, "error", "Lista de resultados não carregou")
                browser.close()
                return

            seen_urls = set()
            no_new_count = 0

            while True:
                # Coletar links de resultados visíveis
                links = page.locator(f'{feed_selector} a[href*="/maps/place/"]').all()
                hrefs = [a.get_attribute("href") for a in links if a.get_attribute("href")]
                new_hrefs = [h for h in hrefs if h not in seen_urls]

                if not new_hrefs:
                    no_new_count += 1
                    if no_new_count >= 3:
                        break  # fim da lista
                else:
                    no_new_count = 0

                for href in new_hrefs:
                    seen_urls.add(href)
                    try:
                        page.goto(href, wait_until="networkidle", timeout=20000)
                        _random_delay(1.5, 3)
                        data = _extract_place_details(page)
                        data["maps_url"] = href
                        saved = _save_place(db, extraction_id, data)
                        if saved:
                            _increment_found(db, extraction_id)
                        page.go_back(wait_until="networkidle", timeout=20000)
                        _random_delay(1, 2)
                    except Exception:
                        try:
                            page.go_back(wait_until="networkidle", timeout=10000)
                        except Exception:
                            page.goto(search_url, wait_until="networkidle", timeout=20000)
                        _random_delay(1, 2)

                # Scroll na lista para carregar mais resultados
                feed = page.locator(feed_selector)
                feed.evaluate("el => el.scrollBy(0, el.scrollHeight)")
                _random_delay(2, 4)

            browser.close()

        _update_status(db, extraction_id, "done")
    except Exception as e:
        _update_status(db, extraction_id, "error", str(e))
    finally:
        db.close()
```

- [ ] **Step 2: Verificar que os testes existentes ainda passam (scraper não é testado em unit tests)**

```bash
cd backend
pytest tests/ -v
```

Esperado: todos os testes passando.

- [ ] **Step 3: Commit**

```bash
git add backend/scraper.py
git commit -m "feat: implement playwright scraper for google maps"
```

---

## Task 7: Frontend — Setup Vite + React

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/api.ts`

- [ ] **Step 1: Criar `frontend/package.json`**

```json
{
  "name": "robo-extracao",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.23.1",
    "axios": "^1.7.2",
    "@tanstack/react-query": "^5.40.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.4.5",
    "vite": "^5.2.13"
  }
}
```

- [ ] **Step 2: Criar `frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://backend:8000',
      '/auth': 'http://backend:8000',
    },
  },
})
```

- [ ] **Step 3: Criar `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Robô de Extração</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Criar `frontend/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
```

- [ ] **Step 5: Criar `frontend/src/api.ts`**

```typescript
import axios from 'axios'

const http = axios.create({ baseURL: '' })

http.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export interface Extraction {
  id: string
  type: string
  city: string
  state: string
  status: string
  total_found: number
  error_msg: string | null
  created_at: string
  finished_at: string | null
}

export interface Place {
  id: string
  name: string | null
  address: string | null
  phone: string | null
  website: string | null
  rating: number | null
  rating_count: number | null
  category: string | null
  opening_hours: string | null
  maps_url: string | null
}

export interface PlacesPage {
  items: Place[]
  total: number
  page: number
  page_size: number
}

export const api = {
  login: (username: string, password: string) =>
    http.post<{ access_token: string }>('/auth/login', { username, password }),

  createExtraction: (type: string, city: string, state: string) =>
    http.post<Extraction>('/api/extractions', { type, city, state }),

  listExtractions: () =>
    http.get<Extraction[]>('/api/extractions'),

  getExtraction: (id: string) =>
    http.get<Extraction>(`/api/extractions/${id}`),

  getPlaces: (id: string, page = 1, page_size = 50) =>
    http.get<PlacesPage>(`/api/extractions/${id}/places`, { params: { page, page_size } }),

  exportUrl: (id: string) => `/api/extractions/${id}/export`,
}
```

- [ ] **Step 6: Criar `frontend/src/App.tsx`**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 7: Instalar dependências e verificar que compila**

```bash
cd frontend
npm install
npx tsc --noEmit
```

Esperado: sem erros de TypeScript.

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: setup vite react typescript frontend"
```

---

## Task 8: Frontend — Página de Login

**Files:**
- Create: `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: Criar `frontend/src/pages/LoginPage.tsx`**

```tsx
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
  page: { display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: '#f0f4ff', fontFamily: 'sans-serif' },
  card: { background: 'white', padding: '40px', borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)', width: '320px',
          display: 'flex', flexDirection: 'column', gap: '16px' },
  title: { margin: 0, fontSize: '22px', fontWeight: 700, color: '#333', textAlign: 'center' },
  subtitle: { margin: 0, color: '#888', fontSize: '14px', textAlign: 'center' },
  input: { padding: '10px 14px', border: '1px solid #ddd', borderRadius: '6px',
           fontSize: '15px', outline: 'none' },
  error: { margin: 0, color: '#d32f2f', fontSize: '13px', textAlign: 'center' },
  button: { padding: '12px', background: '#1a73e8', color: 'white', border: 'none',
            borderRadius: '6px', fontSize: '15px', cursor: 'pointer', fontWeight: 600 },
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat: add login page"
```

---

## Task 9: Frontend — Componente ExtractionForm

**Files:**
- Create: `frontend/src/components/ExtractionForm.tsx`

- [ ] **Step 1: Criar `frontend/src/components/ExtractionForm.tsx`**

```tsx
import { useState, FormEvent } from 'react'

const ESTADOS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO'
]

const TIPOS = [
  { value: 'empresas', label: '🏢 Empresas' },
  { value: 'restaurantes', label: '🍽️ Restaurantes' },
  { value: 'passeio', label: '🎡 Passeio' },
]

interface Props {
  onStart: (type: string, city: string, state: string) => void
  loading: boolean
}

export default function ExtractionForm({ onStart, loading }: Props) {
  const [type, setType] = useState('empresas')
  const [city, setCity] = useState('')
  const [state, setState] = useState('MS')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!city.trim()) return
    onStart(type, city.trim(), state)
  }

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      <h2 style={styles.title}>Nova Extração</h2>
      <div style={styles.row}>
        <div style={styles.field}>
          <label style={styles.label}>TIPO</label>
          <select value={type} onChange={e => setType(e.target.value)} style={styles.select}>
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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
            {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <button type="submit" style={styles.button} disabled={loading}>
        {loading ? '⏳ Iniciando...' : '▶ Iniciar Extração'}
      </button>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px',
          padding: '20px', marginBottom: '20px' },
  title: { margin: '0 0 16px', fontSize: '16px', color: '#333' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '11px', fontWeight: 600, color: '#666', letterSpacing: '0.5px' },
  select: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
  input: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
  button: { width: '100%', padding: '12px', background: '#1a73e8', color: 'white',
            border: 'none', borderRadius: '6px', fontSize: '15px', cursor: 'pointer',
            fontWeight: 600 },
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ExtractionForm.tsx
git commit -m "feat: add extraction form component"
```

---

## Task 10: Frontend — ExtractionStatus e ResultsTable

**Files:**
- Create: `frontend/src/components/ExtractionStatus.tsx`
- Create: `frontend/src/components/ResultsTable.tsx`

- [ ] **Step 1: Criar `frontend/src/components/ExtractionStatus.tsx`**

```tsx
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
  card: { background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px',
          padding: '20px', marginBottom: '20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '12px' },
  meta: { fontSize: '13px', color: '#888' },
  error: { color: '#d32f2f', fontSize: '13px', margin: '0 0 12px' },
  counters: { display: 'flex', gap: '12px' },
  counter: { flex: 1, textAlign: 'center', borderRadius: '6px', padding: '12px',
             display: 'flex', flexDirection: 'column', gap: '4px' },
  num: { fontSize: '26px', fontWeight: 700 },
  numLabel: { fontSize: '11px', color: '#666' },
}
```

- [ ] **Step 2: Criar `frontend/src/components/ResultsTable.tsx`**

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, Place } from '../api'

interface Props {
  extractionId: string
  exportUrl: string
}

export default function ResultsTable({ extractionId, exportUrl }: Props) {
  const [page, setPage] = useState(1)

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
        <a href={exportUrl} style={styles.exportBtn}>⬇ Exportar CSV</a>
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
            {data.items.map((p: Place, i: number) => (
              <tr key={p.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={styles.td}>{p.name ?? '—'}</td>
                <td style={styles.td}>{p.address ?? '—'}</td>
                <td style={styles.td}>{p.phone ?? '—'}</td>
                <td style={styles.td}>{p.rating != null ? `⭐ ${p.rating} (${p.rating_count})` : '—'}</td>
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
          <button onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1} style={styles.pageBtn}>← Anterior</button>
          <span style={{ fontSize: '13px', color: '#666' }}>
            Página {page} de {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages} style={styles.pageBtn}>Próxima →</button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { margin: 0, fontSize: '16px', color: '#333' },
  exportBtn: { background: '#34a853', color: 'white', padding: '6px 14px', borderRadius: '4px',
               fontSize: '13px', textDecoration: 'none' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  thead: { background: '#f5f5f5' },
  th: { padding: '8px 12px', textAlign: 'left', color: '#666', fontWeight: 600,
        borderBottom: '1px solid #e0e0e0' },
  td: { padding: '8px 12px', borderBottom: '1px solid #f0f0f0' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center',
                gap: '16px', marginTop: '16px' },
  pageBtn: { padding: '6px 14px', border: '1px solid #ddd', borderRadius: '4px',
             cursor: 'pointer', background: 'white', fontSize: '13px' },
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: add extraction status and results table components"
```

---

## Task 11: Frontend — Dashboard Page (integração final)

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Criar `frontend/src/pages/DashboardPage.tsx`**

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, Extraction } from '../api'
import ExtractionForm from '../components/ExtractionForm'
import ExtractionStatus from '../components/ExtractionStatus'
import ResultsTable from '../components/ResultsTable'

export default function DashboardPage() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const navigate = useNavigate()

  // Polling da extração ativa a cada 3s enquanto running/pending
  const { data: activeExtraction } = useQuery({
    queryKey: ['extraction', activeId],
    queryFn: () => api.getExtraction(activeId!).then(r => r.data),
    enabled: !!activeId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'running' || status === 'pending' ? 3000 : false
    },
  })

  // Lista de extrações anteriores
  const { data: extractions, refetch } = useQuery({
    queryKey: ['extractions'],
    queryFn: () => api.listExtractions().then(r => r.data),
  })

  async function handleStart(type: string, city: string, state: string) {
    setStarting(true)
    try {
      const r = await api.createExtraction(type, city, state)
      setActiveId(r.data.id)
      refetch()
    } finally {
      setStarting(false)
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

        {activeExtraction && (
          <>
            <ExtractionStatus extraction={activeExtraction} />
            {activeExtraction.total_found > 0 && (
              <ResultsTable
                extractionId={activeExtraction.id}
                exportUrl={api.exportUrl(activeExtraction.id)}
              />
            )}
          </>
        )}

        {extractions && extractions.length > 0 && !activeId && (
          <div style={styles.historyCard}>
            <h3 style={styles.historyTitle}>Extrações Anteriores</h3>
            {extractions.map((ex: Extraction) => (
              <div key={ex.id} style={styles.historyRow}
                   onClick={() => setActiveId(ex.id)}>
                <span style={{ fontWeight: 500 }}>
                  {ex.type} · {ex.city}/{ex.state}
                </span>
                <span style={{ fontSize: '12px', color: '#888' }}>
                  {ex.total_found} registros · {ex.status}
                </span>
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
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 32px', background: 'white', borderBottom: '1px solid #e0e0e0' },
  brand: { fontWeight: 700, fontSize: '17px', color: '#1a73e8' },
  logoutBtn: { padding: '6px 14px', border: '1px solid #ddd', borderRadius: '4px',
               background: 'white', cursor: 'pointer', fontSize: '13px' },
  content: { maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' },
  historyCard: { background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px',
                 padding: '20px', marginTop: '20px' },
  historyTitle: { margin: '0 0 16px', fontSize: '16px', color: '#333' },
  historyRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: '6px', cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0' },
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: add dashboard page with polling and history"
```

---

## Task 12: Build e Smoke Test com Docker Compose

**Files:**
- No new files

- [ ] **Step 1: Subir os serviços**

```bash
docker compose up --build
```

Esperado: os 3 serviços sobem sem erros. Aguardar até ver `Application startup complete` no log do backend.

- [ ] **Step 2: Smoke test do backend**

```bash
# Health check
curl http://localhost:8000/docs
# Esperado: HTML da Swagger UI

# Login
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# Esperado: {"access_token":"...", "token_type":"bearer"}
```

- [ ] **Step 3: Smoke test do frontend**

Abrir `http://localhost:3000` no browser.

Esperado:
- Redireciona para `/login`
- Login com senha `admin123` funciona
- Dashboard carrega com o formulário

- [ ] **Step 4: Teste de extração de ponta a ponta**

No dashboard:
1. Selecionar **Empresas** · **Dourados** · **MS** → clicar Iniciar
2. Aguardar: deve aparecer o status "Extraindo..." com o counter subindo
3. Após alguns minutos: status muda para "Concluído"
4. Tabela de resultados aparece com os dados
5. Clicar "Exportar CSV" e verificar que o arquivo baixa com os dados corretos

- [ ] **Step 5: Commit final**

```bash
git add .
git commit -m "feat: complete robo extracao system - all services running"
```

---

## Self-Review

**Spec coverage:**
- ✅ 3 tipos de negócio (empresas/restaurantes/passeio)
- ✅ Seleção de cidade (texto livre) e estado (27 siglas)
- ✅ Automação total via Playwright (sem interação do usuário)
- ✅ 8 campos extraídos (nome, endereço, telefone, website, rating, rating_count, categoria, horário, maps_url)
- ✅ PostgreSQL com UniqueConstraint para evitar duplicatas
- ✅ Status em tempo real via polling (3s)
- ✅ Auth JWT com login simples (admin/senha)
- ✅ Exportação CSV
- ✅ Docker Compose com 3 serviços
- ✅ Modo não-headless + delays aleatórios (anti-detecção)
- ✅ Tratamento de erro com `error_msg` gravado no banco

**Placeholder scan:** Nenhum TBD, TODO ou "similar to task N" encontrado.

**Type consistency:** `Extraction`, `Place`, `PlacesPage` definidos em `api.ts` e usados consistentemente em todos os componentes. Endpoints do backend batem com as chamadas em `api.ts`.
