from unittest.mock import patch
from app.services.sync import _sync_once
from app.db import get_conn


CALENDARS_FIXTURE = [
    {
        "id": "user@gmail.com",
        "summary": "Personal",
        "backgroundColor": "#039be5",
        "foregroundColor": "#ffffff",
        "primary": True,
    },
    {
        "id": "family@group.calendar.google.com",
        "summary": "Family",
        "backgroundColor": "#e67c73",
        "foregroundColor": "#ffffff",
        "primary": False,
    },
    {
        "id": "en.australian#holiday@group.v.calendar.google.com",
        "summary": "Holidays in Australia",
        "backgroundColor": "#0b8043",
        "foregroundColor": "#ffffff",
        "primary": False,
    },
]


def _run_sync(calendars=None):
    cals = calendars if calendars is not None else CALENDARS_FIXTURE
    with patch("app.services.sync.list_calendars", return_value=cals):
        with patch("app.services.sync.list_events", return_value=[]):
            _sync_once()


def test_sync_disables_primary_calendar_by_default(tmp_db):
    _run_sync()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT enabled FROM calendar_prefs WHERE calendar_id = ?",
            ("user@gmail.com",),
        ).fetchone()
    assert row["enabled"] == 0


def test_sync_disables_holiday_calendar_by_default(tmp_db):
    _run_sync()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT enabled FROM calendar_prefs WHERE calendar_id = ?",
            ("en.australian#holiday@group.v.calendar.google.com",),
        ).fetchone()
    assert row["enabled"] == 0


def test_sync_enables_person_calendar_by_default(tmp_db):
    _run_sync()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT enabled FROM calendar_prefs WHERE calendar_id = ?",
            ("family@group.calendar.google.com",),
        ).fetchone()
    assert row["enabled"] == 1


def test_sync_preserves_user_preference_on_re_sync(tmp_db):
    _run_sync()
    # User manually enables the primary calendar
    with get_conn() as conn:
        conn.execute(
            "UPDATE calendar_prefs SET enabled = 1 WHERE calendar_id = ?",
            ("user@gmail.com",),
        )
    # Second sync — must not overwrite user's choice
    _run_sync()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT enabled FROM calendar_prefs WHERE calendar_id = ?",
            ("user@gmail.com",),
        ).fetchone()
    assert row["enabled"] == 1
