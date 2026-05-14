import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from database import Base, engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title="Robô de Extração", lifespan=lifespan)
