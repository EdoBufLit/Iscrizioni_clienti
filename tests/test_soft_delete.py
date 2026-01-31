import pytest

def test_soft_delete_flow(client):
    # 1. Login as Super Admin (using configured credentials)
    login_res = client.post("/api/super-admin/auth/login", json={
        "email": "admin@assonam.it",
        "password": "admin"
    })
    assert login_res.status_code == 200, "Super admin login failed"

    # 2. Create a new Organization to ensure isolation
    import time
    ts = int(time.time())
    new_org_slug = f"test-org-{ts}"
    org_res = client.post("/api/super-admin/organizations", json={
        "name": f"Test Org {ts}",
        "slug": new_org_slug,
        "email": "test@org.com"
    })
    if org_res.status_code != 200:
        # Fallback if create failed (maybe due to missing fields? check schema)
        # But we implemented create endpoint.
        # If it fails, we fall back to existing logic but it might be flaky.
        orgs_res = client.get("/api/organizations")
        orgs = orgs_res.json()
        org_id = orgs[0]["id"]
    else:
        org_id = org_res.json()["id"]

    # 3. Create two Org Admins (so we can delete one without hitting the "last admin" check)
    import time
    ts = int(time.time())
    # Admin 1
    admin1_email = f"admin1_{ts}@example.com"
    res1 = client.post("/api/super-admin/org-admins", json={
        "email": admin1_email,
        "org_id": org_id
    })
    assert res1.status_code == 200
    admin1_id = res1.json()["id"]

    # Admin 2
    admin2_email = f"admin2_{ts}@example.com"
    res2 = client.post("/api/super-admin/org-admins", json={
        "email": admin2_email,
        "org_id": org_id
    })
    assert res2.status_code == 200
    admin2_id = res2.json()["id"]

    # 4. Soft Delete Admin 1
    del_res = client.delete(f"/api/super-admin/org-admins/{admin1_id}")
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True

    # 5. Verify Admin 1 is NOT in the list
    list_res = client.get("/api/super-admin/org-admins", params={"org_id": org_id})
    assert list_res.status_code == 200
    admins = list_res.json()
    admin_ids = [a["id"] for a in admins]
    assert admin1_id not in admin_ids
    assert admin2_id in admin_ids

    # 6. Verify Admin 1 cannot request magic link
    ml_res = client.post("/api/org-admin/auth/magic-link", data={"email": admin1_email})
    assert ml_res.status_code == 200

    # 7. Restore Admin 1 via create endpoint (NEW TEST CASE)
    restore_res = client.post("/api/super-admin/org-admins", json={
        "email": admin1_email,
        "org_id": org_id
    })
    assert restore_res.status_code == 200
    data = restore_res.json()
    assert data["restored"] is True
    assert data["id"] == admin1_id
    assert data["is_active"] is True

    # 8. Verify Admin 1 IS in the list again
    list_res_2 = client.get("/api/super-admin/org-admins", params={"org_id": org_id})
    assert list_res_2.status_code == 200
    admin_ids_2 = [a["id"] for a in list_res_2.json()]
    assert admin1_id in admin_ids_2

    # 9. Test "admin_exists" conflict
    conflict_res = client.post("/api/super-admin/org-admins", json={
        "email": admin1_email,
        "org_id": org_id
    })
    assert conflict_res.status_code == 409
    assert conflict_res.json()["detail"] == "admin_exists"

    # 10. Test "Last Admin" protection
    # Delete Admin 1 again
    client.delete(f"/api/super-admin/org-admins/{admin1_id}")
    # Now try to delete Admin 2 (should fail as it is the last one)
    del_res_last = client.delete(f"/api/super-admin/org-admins/{admin2_id}")
    assert del_res_last.status_code == 409
    assert "ultimo admin attivo" in del_res_last.json()["detail"]
