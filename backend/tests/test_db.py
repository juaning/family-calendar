from app.db import get_conn


def test_init_creates_calendars_table(tmp_db):
    with get_conn() as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "calendars" in tables


def test_init_creates_events_table(tmp_db):
    with get_conn() as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "events" in tables


def test_get_conn_commits_on_success(tmp_db):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("id1", "Cal", "#fff", "#000", "2026-01-01"),
        )
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM calendars").fetchone()[0]
    assert count == 1


def test_get_conn_rolls_back_on_error(tmp_db):
    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO calendars VALUES (?,?,?,?,?)",
                ("id1", "Cal", "#fff", "#000", "2026-01-01"),
            )
            raise RuntimeError("simulated error")
    except RuntimeError:
        pass
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM calendars").fetchone()[0]
    assert count == 0


def test_init_creates_calendar_prefs_table(tmp_db):
    with get_conn() as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "calendar_prefs" in tables


def test_init_creates_chores_table(tmp_db):
    with get_conn() as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "chores" in tables
