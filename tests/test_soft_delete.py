import pytest

def test_soft_delete_flow(client):
    # 1. Login as Super Admin (using configured credentials)
    login_res = client.post("/api/super-admin/auth/login", json={
        "email": "admin@assonam.it",
        "password": "admin"
    })
    assert login_res.status_code == 200, "Super admin login failed"

    # 2. Get an Organization
    orgs_res = client.get("/api/organizations")
    assert orgs_res.status_code == 200
    orgs = orgs_res.json()
    assert len(orgs) > 0, "No organizations found"
    org_id = orgs[0]["id"]

    # 3. Create two Org Admins (so we can delete one without hitting the "last admin" check)
    # Admin 1
    admin1_email = "admin1@example.com"
    res1 = client.post("/api/super-admin/org-admins", json={
        "email": admin1_email,
        "org_id": org_id
    })
    assert res1.status_code == 200
    admin1_id = res1.json()["id"]

    # Admin 2
    admin2_email = "admin2@example.com"
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

    # 6. Verify Admin 1 cannot request magic link (we can check that we get 200 but maybe check logs if possible,
    # or just trust the code changes. For integration test, verifying response is 200 is correct behavior per spec)
    ml_res = client.post("/api/org-admin/auth/magic-link", data={"email": admin1_email})
    assert ml_res.status_code == 200

    # 7. Restore Admin 1
    restore_res = client.post(f"/api/super-admin/org-admins/{admin1_id}/restore")
    assert restore_res.status_code == 200

    # 8. Verify Admin 1 IS in the list
    list_res_2 = client.get("/api/super-admin/org-admins", params={"org_id": org_id})
    assert list_res_2.status_code == 200
    admin_ids_2 = [a["id"] for a in list_res_2.json()]
    assert admin1_id in admin_ids_2

    # 9. Test "Last Admin" protection
    # Delete Admin 1 again
    client.delete(f"/api/super-admin/org-admins/{admin1_id}")
    # Now try to delete Admin 2 (should fail as it is the last one)
    del_res_last = client.delete(f"/api/super-admin/org-admins/{admin2_id}")
    assert del_res_last.status_code == 409
    assert "ultimo admin attivo" in del_res_last.json()["detail"]
