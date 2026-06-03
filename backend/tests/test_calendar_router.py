from app.db import get_conn


def test_get_calendars_returns_empty_list(client):
    resp = client.get("/api/calendars")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_calendars_returns_seeded_data(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
    resp = client.get("/api/calendars")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "juan@gmail.com"
    assert data[0]["summary"] == "Juan"
    assert data[0]["backgroundColor"] == "#039be5"
    assert data[0]["foregroundColor"] == "#ffffff"


def test_get_events_returns_503_when_no_auth(client):
    resp = client.get("/api/events?start=2026-06-01T00:00:00Z&end=2026-06-30T23:59:59Z")
    assert resp.status_code == 503
    body = resp.json()
    assert body["detail"]["error"] == "auth_required"


def test_get_events_returns_events_with_colour(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
        conn.execute(
            "INSERT INTO events VALUES (?,?,?,?,?,?,?)",
            (
                "evt1",
                "juan@gmail.com",
                "Team meeting",
                "2026-06-15T09:00:00",
                "2026-06-15T10:00:00",
                0,
                "2026-06-01T00:00:00Z",
            ),
        )
    resp = client.get("/api/events?start=2026-06-01T00:00:00Z&end=2026-06-30T23:59:59Z")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    evt = data[0]
    assert evt["title"] == "Team meeting"
    assert evt["calendarId"] == "juan@gmail.com"
    assert evt["start"] == "2026-06-15T09:00:00"
    assert evt["allDay"] is False
    assert evt["backgroundColor"] == "#039be5"
    assert evt["foregroundColor"] == "#ffffff"


def test_get_events_filters_by_date_range(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
        conn.executemany(
            "INSERT INTO events VALUES (?,?,?,?,?,?,?)",
            [
                ("in_range", "juan@gmail.com", "In-range", "2026-06-15T09:00:00", "2026-06-15T10:00:00", 0, "2026-06-01"),
                ("out_of_range", "juan@gmail.com", "Out-of-range", "2026-07-01T09:00:00", "2026-07-01T10:00:00", 0, "2026-06-01"),
            ],
        )
    resp = client.get("/api/events?start=2026-06-01T00:00:00Z&end=2026-06-30T23:59:59Z")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "in_range"
