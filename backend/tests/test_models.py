import pytest
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

    with pytest.raises(Exception):
        db.commit()
