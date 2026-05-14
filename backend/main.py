import os
import csv
import io
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from auth import create_access_token, verify_token
from models import Extraction, Place
from schemas import (
    LoginRequest, TokenResponse,
    ExtractionCreate, ExtractionResponse,
    PlaceResponse, PlacesPage,
)
from scraper import run_extraction


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
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token({"sub": "admin"})
    return TokenResponse(access_token=token)


@app.post(
    "/api/extractions",
    response_model=ExtractionResponse,
    status_code=201,
    dependencies=[Depends(verify_token)],
)
def create_extraction(
    body: ExtractionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    extraction = Extraction(
        type=body.type,
        city=body.city,
        state=body.state,  # already uppercased by schema validator
    )
    db.add(extraction)
    db.commit()
    db.refresh(extraction)
    background_tasks.add_task(run_extraction, str(extraction.id))
    return extraction


@app.get(
    "/api/extractions",
    response_model=list[ExtractionResponse],
    dependencies=[Depends(verify_token)],
)
def list_extractions(db: Session = Depends(get_db)):
    return db.query(Extraction).order_by(Extraction.created_at.desc()).all()


@app.get(
    "/api/extractions/{extraction_id}",
    response_model=ExtractionResponse,
    dependencies=[Depends(verify_token)],
)
def get_extraction(extraction_id: str, db: Session = Depends(get_db)):
    extraction = db.get(Extraction, extraction_id)
    if not extraction:
        raise HTTPException(status_code=404, detail="Extração não encontrada")
    return extraction


@app.get(
    "/api/extractions/{extraction_id}/places",
    response_model=PlacesPage,
    dependencies=[Depends(verify_token)],
)
def get_places(
    extraction_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    extraction = db.get(Extraction, extraction_id)
    if not extraction:
        raise HTTPException(status_code=404, detail="Extração não encontrada")
    total = db.query(Place).filter(Place.extraction_id == extraction_id).count()
    items = (
        db.query(Place)
        .filter(Place.extraction_id == extraction_id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PlacesPage(items=items, total=total, page=page, page_size=page_size)


@app.get(
    "/api/extractions/{extraction_id}/export",
    dependencies=[Depends(verify_token)],
)
def export_csv(extraction_id: str, db: Session = Depends(get_db)):
    extraction = db.get(Extraction, extraction_id)
    if not extraction:
        raise HTTPException(status_code=404, detail="Extração não encontrada")
    places = db.query(Place).filter(Place.extraction_id == extraction_id).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "nome", "endereço", "telefone", "website",
        "rating", "nº avaliações", "categoria", "horário", "maps_url",
    ])
    for p in places:
        writer.writerow([
            p.name, p.address, p.phone, p.website,
            p.rating, p.rating_count, p.category, p.opening_hours, p.maps_url,
        ])
    output.seek(0)
    filename = f"extracao_{extraction.type}_{extraction.city}_{extraction.state}.csv"
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
