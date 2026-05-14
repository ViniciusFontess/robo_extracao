import os
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
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
