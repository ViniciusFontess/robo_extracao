import os
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("ADMIN_PASSWORD", "testpass")
os.environ.setdefault("JWT_SECRET", "test-secret")


def get_token(client):
    r = client.post("/auth/login", json={"username": "admin", "password": "testpass"})
    return r.json()["access_token"]


def auth_headers(client):
    return {"Authorization": f"Bearer {get_token(client)}"}


def test_create_extraction(client):
    r = client.post(
        "/api/extractions",
        json={"type": "empresas", "city": "Dourados", "state": "MS"},
        headers=auth_headers(client),
    )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "pending"
    assert data["city"] == "Dourados"
    assert data["state"] == "MS"
    assert "id" in data


def test_create_extraction_invalid_type(client):
    r = client.post(
        "/api/extractions",
        json={"type": "invalido", "city": "Dourados", "state": "MS"},
        headers=auth_headers(client),
    )
    assert r.status_code == 422


def test_list_extractions(client):
    headers = auth_headers(client)
    client.post(
        "/api/extractions",
        json={"type": "restaurantes", "city": "Campo Grande", "state": "MS"},
        headers=headers,
    )
    r = client.get("/api/extractions", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_get_extraction_status(client):
    headers = auth_headers(client)
    created = client.post(
        "/api/extractions",
        json={"type": "empresas", "city": "Dourados", "state": "MS"},
        headers=headers,
    ).json()
    r = client.get(f"/api/extractions/{created['id']}", headers=headers)
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


def test_get_extraction_places_empty(client):
    headers = auth_headers(client)
    created = client.post(
        "/api/extractions",
        json={"type": "empresas", "city": "Dourados", "state": "MS"},
        headers=headers,
    ).json()
    r = client.get(f"/api/extractions/{created['id']}/places", headers=headers)
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert r.json()["total"] == 0


def test_export_csv_empty(client):
    headers = auth_headers(client)
    created = client.post(
        "/api/extractions",
        json={"type": "empresas", "city": "Dourados", "state": "MS"},
        headers=headers,
    ).json()
    r = client.get(f"/api/extractions/{created['id']}/export", headers=headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert r.text.startswith("nome,")
    lines = r.text.strip().splitlines()
    assert len(lines) == 1  # header only, no data rows
