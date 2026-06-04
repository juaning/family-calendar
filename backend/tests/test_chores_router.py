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


def test_create_chore_blank_title_returns_422(client):
    resp = client.post("/api/chores", json={"title": "   "})
    assert resp.status_code == 422


def test_patch_chore_done(client):
    chore_id = client.post("/api/chores", json={"title": "Do laundry"}).json()["id"]
    resp = client.patch(f"/api/chores/{chore_id}", json={"done": True})
    assert resp.status_code == 200
    assert resp.json()["done"] is True


def test_patch_chore_title(client):
    chore_id = client.post("/api/chores", json={"title": "Old title"}).json()["id"]
    resp = client.patch(f"/api/chores/{chore_id}", json={"title": "New title"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "New title"


def test_patch_chore_clear_assignee(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01"),
        )
    chore_id = client.post(
        "/api/chores",
        json={"title": "Task", "assignee_calendar_id": "juan@gmail.com"},
    ).json()["id"]
    resp = client.patch(f"/api/chores/{chore_id}", json={"assignee_calendar_id": None})
    assert resp.status_code == 200
    assert resp.json()["assignee_calendar_id"] is None


def test_patch_chore_not_found(client):
    resp = client.patch("/api/chores/no-such-id", json={"done": True})
    assert resp.status_code == 404


def test_patch_empty_body_returns_422(client):
    chore_id = client.post("/api/chores", json={"title": "X"}).json()["id"]
    resp = client.patch(f"/api/chores/{chore_id}", json={})
    assert resp.status_code == 422


def test_delete_chore(client):
    chore_id = client.post("/api/chores", json={"title": "Delete me"}).json()["id"]
    del_resp = client.delete(f"/api/chores/{chore_id}")
    assert del_resp.status_code == 204
    remaining_ids = [c["id"] for c in client.get("/api/chores").json()]
    assert chore_id not in remaining_ids


def test_delete_chore_not_found(client):
    resp = client.delete("/api/chores/no-such-id")
    assert resp.status_code == 404


def test_patch_chore_blank_title_returns_422(client):
    chore_id = client.post("/api/chores", json={"title": "Valid"}).json()["id"]
    resp = client.patch(f"/api/chores/{chore_id}", json={"title": "   "})
    assert resp.status_code == 422
