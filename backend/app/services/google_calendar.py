from pathlib import Path
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import app.config as config


class AuthRequiredError(Exception):
    pass


def get_service():
    token_path = Path(config.GOOGLE_TOKEN_PATH)
    if not token_path.exists():
        raise AuthRequiredError(
            f"No token found at {config.GOOGLE_TOKEN_PATH}. Run: python -m app.auth"
        )
    creds = Credentials.from_authorized_user_file(str(token_path), config.GOOGLE_SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_path.write_text(creds.to_json())
    return build("calendar", "v3", credentials=creds)


def list_calendars() -> list[dict]:
    service = get_service()
    result = service.calendarList().list().execute()
    return [
        {
            "id": item["id"],
            "summary": item.get("summary", item["id"]),
            "backgroundColor": item.get("backgroundColor", "#039be5"),
            "foregroundColor": item.get("foregroundColor", "#ffffff"),
        }
        for item in result.get("items", [])
    ]


def list_events(start: str, end: str, calendar_ids: list[str]) -> list[dict]:
    service = get_service()
    all_events: list[dict] = []
    for cal_id in calendar_ids:
        items = (
            service.events()
            .list(
                calendarId=cal_id,
                timeMin=start,
                timeMax=end,
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
            .get("items", [])
        )
        for item in items:
            s = item["start"]
            e = item["end"]
            all_day = "date" in s and "dateTime" not in s
            all_events.append(
                {
                    "id": item["id"],
                    "calendarId": cal_id,
                    "title": item.get("summary", "(no title)"),
                    "start": s.get("dateTime", s.get("date")),
                    "end": e.get("dateTime", e.get("date")),
                    "allDay": all_day,
                }
            )
    return all_events
