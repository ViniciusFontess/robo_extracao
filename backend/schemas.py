from datetime import datetime
from typing import Optional, Annotated
from pydantic import BaseModel, ConfigDict, Field, field_validator


# Auth
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# Extraction
class ExtractionCreate(BaseModel):
    type: Annotated[str, Field(min_length=2, max_length=100)]
    city: str
    state: str  # sigla 2 letras, ex: MS
    max_results: Annotated[int, Field(ge=0)] = 0  # 0 = sem limite

    @field_validator("state")
    @classmethod
    def state_must_be_two_chars(cls, v: str) -> str:
        if len(v) != 2:
            raise ValueError("state deve ter 2 letras (ex: MS)")
        return v.upper()

    @field_validator("type")
    @classmethod
    def type_strip(cls, v: str) -> str:
        return v.strip()


class ExtractionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    city: str
    state: str
    status: str
    total_found: Annotated[int, Field(ge=0)]
    max_results: int = 0
    error_msg: Optional[str] = None
    created_at: datetime
    finished_at: Optional[datetime] = None


# Place
class PlaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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
    facebook: Optional[str] = None
    instagram: Optional[str] = None


class PlacesPage(BaseModel):
    items: list[PlaceResponse]
    total: int
    page: int
    page_size: int
