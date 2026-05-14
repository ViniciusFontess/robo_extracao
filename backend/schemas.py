from __future__ import annotations
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
    type: str
    city: str
    state: str


class ExtractionResponse(BaseModel):
    id: str
    type: str
    city: str
    state: str
    status: str
    total_found: int
    error_msg: Optional[str] = None
    created_at: datetime
    finished_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Place
class PlaceResponse(BaseModel):
    id: str
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    rating: Optional[float] = None
    rating_count: Optional[int] = None
    category: Optional[str] = None
    opening_hours: Optional[str] = None
    maps_url: Optional[str] = None

    class Config:
        from_attributes = True


class PlacesPage(BaseModel):
    items: list[PlaceResponse]
    total: int
    page: int
    page_size: int
