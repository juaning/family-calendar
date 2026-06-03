import pytest
from unittest.mock import patch, MagicMock
from app.services.google_calendar import get_service, AuthRequiredError, list_calendars


def test_get_service_raises_when_no_token_file(no_token):
    with pytest.raises(AuthRequiredError, match="python -m app.auth"):
        get_service()


def test_list_calendars_includes_primary_flag():
    mock_service = MagicMock()
    mock_service.calendarList.return_value.list.return_value.execute.return_value = {
        "items": [
            {
                "id": "user@gmail.com",
                "summary": "Personal",
                "backgroundColor": "#039be5",
                "foregroundColor": "#ffffff",
                "primary": True,
            },
            {
                "id": "en.australian#holiday@group.v.calendar.google.com",
                "summary": "Holidays in Australia",
                "backgroundColor": "#0b8043",
                "foregroundColor": "#ffffff",
            },
        ]
    }
    with patch("app.services.google_calendar.get_service", return_value=mock_service):
        result = list_calendars()

    personal = next(c for c in result if c["id"] == "user@gmail.com")
    holidays = next(c for c in result if "holiday" in c["id"])
    assert personal["primary"] is True
    assert holidays["primary"] is False
