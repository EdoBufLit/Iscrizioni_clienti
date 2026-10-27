from datetime import datetime
from uuid import uuid4

import pytest
from app.db import SessionLocal
from app.models import Organization
from app.routes import public


def test_directory_deep_link_serves_spa_without_redirect_loop(client, monkeypatch):
    monkeypatch.setattr(public, "_load_spa_index_html", lambda: '<html><div id="root">directory shell</div></html>')
    response = client.get('/associazioni?q=Rossi', follow_redirects=False)
    assert response.status_code == 200 and 'directory shell' in response.text
    assert response.headers['cache-control'] == 'no-cache'
    assert 'location' not in response.headers


@pytest.mark.parametrize('active,deleted', [(True, False), (False, False), (True, True)])
def test_organization_deep_link_serves_spa_only_for_public_clubs(client, monkeypatch, active, deleted):
    monkeypatch.setattr(public, "_load_spa_index_html", lambda: '<html><div id="root">club shell</div></html>')
    slug = 'deep-link-'+uuid4().hex
    with SessionLocal() as db:
        db.add(Organization(name='Synthetic deep link', slug=slug, is_active=active,
                            deleted_at=datetime.utcnow() if deleted else None))
        db.commit()
    response = client.get('/associazioni/'+slug, follow_redirects=False)
    if active and not deleted:
        assert response.status_code == 200 and 'club shell' in response.text
        assert 'location' not in response.headers
    else:
        assert response.status_code == 307 and response.headers['location'] == '/associazioni'
