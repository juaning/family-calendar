def test_list_photos_returns_list(client):
    r = client.get("/api/photos")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_photo_unknown_id_returns_404(client):
    r = client.get("/api/photos/nonexistent-id")
    assert r.status_code == 404
