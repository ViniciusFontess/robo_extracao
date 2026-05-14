import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Numeric, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base

class Extraction(Base):
    __tablename__ = "extractions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
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

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    extraction_id = Column(String(36), ForeignKey("extractions.id", ondelete="CASCADE"))
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
