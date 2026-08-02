import pytest
from fastapi.testclient import TestClient
from system_orchestrator import app

client = TestClient(app)

def test_quotes_router():
    response = client.get("/api/quotes/live?symbols=AAPL,MSFT")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "provider_used" in data
    assert "AAPL" in data["data"]

def test_alerts_publish():
    response = client.post("/api/alerts/publish", json={
        "type": "test_alert",
        "ticker": "AAPL",
        "titleEnglish": "Test Alert"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True

def test_alerts_live():
    response = client.get("/api/alerts/live")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert isinstance(data["alerts"], list)
