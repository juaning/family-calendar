import pytest
from app.services.google_calendar import get_service, AuthRequiredError


def test_get_service_raises_when_no_token_file(no_token):
    with pytest.raises(AuthRequiredError, match="python -m app.auth"):
        get_service()
