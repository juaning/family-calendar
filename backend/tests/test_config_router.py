def test_config_returns_slideshow_fields(client):
    r = client.get("/api/config")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data.get("slideshow_idle_seconds"), int)
    assert isinstance(data.get("slideshow_interval_seconds"), int)
    assert data["slideshow_idle_seconds"] > 0
    assert data["slideshow_interval_seconds"] > 0
