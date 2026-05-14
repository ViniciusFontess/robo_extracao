import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine, get_db
from auth import create_access_token, verify_token
from schemas import LoginRequest, TokenResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Robô de Extração", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/auth/login", response_model=TokenResponse)
def login(body: LoginRequest):
    admin_pass = os.environ.get("ADMIN_PASSWORD", "admin123")
    if body.username != "admin" or body.password != admin_pass:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
        )
    token = create_access_token({"sub": "admin"})
    return TokenResponse(access_token=token)


@app.get("/api/extractions", dependencies=[Depends(verify_token)])
def list_extractions_stub():
    return []  # full implementation in Task 5
