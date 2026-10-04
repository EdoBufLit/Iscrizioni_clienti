from unittest.mock import Mock

import pytest
from sqlalchemy.exc import OperationalError, TimeoutError as DatabasePoolTimeout
from starlette.requests import Request

from app.db import get_db
from app.main import database_error_handler


@pytest.mark.parametrize("sqlstate", ["55P03", "57014", "25P03", "08006", "40P01", "40001"])
def test_db_timeouts_return_redacted_retryable_response(sqlstate):
    import asyncio

    original = Exception("private signup value must not reach the response")
    original.pgcode = sqlstate
    error = OperationalError("SELECT private_data", {"email": "private@example.com"}, original)
    request = Request({"type": "http", "headers": [], "state": {"request_id": "timeout-test"}})
    response = asyncio.run(database_error_handler(request, error))
    assert response.status_code == 503
    assert response.headers["retry-after"] == "5"
    assert b"private" not in response.body


def test_pool_exhaustion_is_retryable():
    import asyncio

    request = Request({"type": "http", "headers": [], "state": {}})
    response = asyncio.run(database_error_handler(request, DatabasePoolTimeout("pool exhausted")))
    assert response.status_code == 503
    assert response.headers["retry-after"] == "5"


def test_health_does_not_report_healthy_when_database_query_fails(client):
    from app.main import app

    session = Mock()
    session.execute.side_effect = RuntimeError("Database unavailable")
    app.dependency_overrides[get_db] = lambda: session
    try:
        response = client.get("/health")
        assert response.status_code == 503
        assert response.json() == {"status": "degraded", "db": False}
    finally:
        app.dependency_overrides.pop(get_db, None)
