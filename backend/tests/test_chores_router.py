import pytest
from app.db import get_conn


def test_list_chores_empty(client):
    resp = client.get("/api/chores")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_chore_minimal(client):
    resp = client.post("/api/chores", json={"title": "Walk the dog"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Walk the dog"
    assert data["done"] is False
    assert data["assignee_calendar_id"] is None
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


def test_create_chore_with_assignee(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01"),
        )
    resp = client.post(
        "/api/chores",
        json={"title": "Dishes", "assignee_calendar_id": "juan@gmail.com"},
    )
    assert resp.status_code == 201
    assert resp.json()["assignee_calendar_id"] == "juan@gmail.com"


def test_create_chore_missing_title_returns_422(client):
    resp = client.post("/api/chores", json={})
    assert resp.status_code == 422


def test_list_chores_returns_all_created(client):
    client.post("/api/chores", json={"title": "Task A"})
    client.post("/api/chores", json={"title": "Task B"})
    resp = client.get("/api/chores")
    assert resp.status_code == 200
    titles = [c["title"] for c in resp.json()]
    assert "Task A" in titles
    assert "Task B" in titles


def test_list_chores_ordered_by_position_then_created(client):
    client.post("/api/chores", json={"title": "First"})
    client.post("/api/chores", json={"title": "Second"})
    client.post("/api/chores", json={"title": "Third"})
    chores = client.get("/api/chores").json()
    titles = [c["title"] for c in chores]
    assert titles == ["First", "Second", "Third"]
