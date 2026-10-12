"""Admin panel E2E tests via public URL."""
import os
import uuid
import time
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("081200000000", "123456")
PETUGAS = ("081200000001", "123456")
WARGA = ("081200000002", "123456")
MEMBER = "PLH-0503-0127"


def wh(t):
    return {"Authorization": f"Bearer {t}"}


def _login(phone, pin, as_admin=False, as_petugas=False):
    r = requests.post(f"{API}/auth/login",
                      json={"phone": phone, "pin": pin, "as_admin": as_admin, "as_petugas": as_petugas})
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="session")
def admin_token():
    t, _ = _login(*ADMIN, as_admin=True)
    return t


@pytest.fixture(scope="session")
def petugas_token():
    t, _ = _login(*PETUGAS, as_petugas=True)
    return t


@pytest.fixture(scope="session")
def warga_token():
    t, _ = _login(*WARGA)
    return t


# -------- AUTH & GUARDS --------
class TestAdminAuthGuards:
    def test_admin_login_ok(self):
        tok, user = _login(*ADMIN, as_admin=True)
        assert user["role"] == "admin"
        assert "pin_hash" not in user

    def test_admin_login_bad_pin(self):
        r = requests.post(f"{API}/auth/login",
                          json={"phone": ADMIN[0], "pin": "000000", "as_admin": True})
        assert r.status_code == 401

    def test_admin_wrong_role_flag(self):
        # admin phone with as_admin=false should fail
        r = requests.post(f"{API}/auth/login",
                          json={"phone": ADMIN[0], "pin": ADMIN[1], "as_admin": False})
        assert r.status_code == 401

    def test_admin_endpoint_no_token(self):
        r = requests.get(f"{API}/admin/summary")
        assert r.status_code == 401

    def test_admin_endpoint_warga_forbidden(self, warga_token):
        r = requests.get(f"{API}/admin/summary", headers=wh(warga_token))
        assert r.status_code == 403

    def test_admin_endpoint_petugas_forbidden(self, petugas_token):
        r = requests.get(f"{API}/admin/warga", headers=wh(petugas_token))
        assert r.status_code == 403


# -------- SUMMARY --------
class TestSummary:
    def test_summary_shape(self, admin_token):
        r = requests.get(f"{API}/admin/summary", headers=wh(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("warga_total", "warga_active", "petugas_total", "points_outstanding",
                  "month", "series", "top_warga", "recent_setoran", "upcoming",
                  "redemptions_pending", "redemptions_month"):
            assert k in d, f"missing {k}"
        assert len(d["series"]) == 14
        assert d["warga_total"] >= 1
        assert isinstance(d["top_warga"], list)


# -------- WARGA MGMT --------
class TestWargaMgmt:
    def test_list_warga(self, admin_token):
        r = requests.get(f"{API}/admin/warga", headers=wh(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert d["total"] >= 1
        assert any(u.get("member_code") == MEMBER for u in d["items"])

    def test_search_warga(self, admin_token):
        r = requests.get(f"{API}/admin/warga?q=Ratna", headers=wh(admin_token))
        assert r.status_code == 200
        assert any("Ratna" in u["name"] for u in r.json()["items"])

    def test_warga_detail(self, admin_token):
        lst = requests.get(f"{API}/admin/warga?q=Ratna", headers=wh(admin_token)).json()
        uid = lst["items"][0]["id"]
        r = requests.get(f"{API}/admin/warga/{uid}", headers=wh(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["id"] == uid
        for k in ("setoran", "redemptions", "adjustments"):
            assert isinstance(d[k], list)

    def test_warga_export_csv(self, admin_token):
        r = requests.get(f"{API}/admin/warga/export", headers=wh(admin_token))
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "Kode Anggota" in r.text

    def test_points_adjust_requires_reason(self, admin_token):
        uid = requests.get(f"{API}/admin/warga?q=Ratna", headers=wh(admin_token)).json()["items"][0]["id"]
        r = requests.post(f"{API}/admin/warga/{uid}/points",
                          json={"delta": 10, "reason": ""}, headers=wh(admin_token))
        assert r.status_code == 400

    def test_points_adjust_cannot_negative(self, admin_token):
        uid = requests.get(f"{API}/admin/warga?q=Ratna", headers=wh(admin_token)).json()["items"][0]["id"]
        r = requests.post(f"{API}/admin/warga/{uid}/points",
                          json={"delta": -99999999, "reason": "TEST overdraw"}, headers=wh(admin_token))
        assert r.status_code == 400

    def test_points_adjust_add_subtract(self, admin_token):
        uid = requests.get(f"{API}/admin/warga?q=Ratna", headers=wh(admin_token)).json()["items"][0]["id"]
        before = requests.get(f"{API}/admin/warga/{uid}", headers=wh(admin_token)).json()["user"]["points"]
        r = requests.post(f"{API}/admin/warga/{uid}/points",
                          json={"delta": 5, "reason": "TEST add"}, headers=wh(admin_token))
        assert r.status_code == 200
        assert r.json()["points"] == before + 5
        # revert
        r2 = requests.post(f"{API}/admin/warga/{uid}/points",
                           json={"delta": -5, "reason": "TEST revert"}, headers=wh(admin_token))
        assert r2.status_code == 200
        assert r2.json()["points"] == before

    def test_edit_warga(self, admin_token):
        uid = requests.get(f"{API}/admin/warga?q=Ratna", headers=wh(admin_token)).json()["items"][0]["id"]
        before = requests.get(f"{API}/admin/warga/{uid}", headers=wh(admin_token)).json()["user"]
        r = requests.patch(f"{API}/admin/warga/{uid}",
                           json={"name": before["name"]}, headers=wh(admin_token))
        assert r.status_code == 200
        # empty name 400
        r2 = requests.patch(f"{API}/admin/warga/{uid}", json={"name": "  "}, headers=wh(admin_token))
        assert r2.status_code == 400

    def test_deactivate_blocks_login_and_restore(self, admin_token, petugas_token):
        uid = requests.get(f"{API}/admin/warga?q=Ratna", headers=wh(admin_token)).json()["items"][0]["id"]
        try:
            r = requests.patch(f"{API}/admin/warga/{uid}",
                               json={"active": False}, headers=wh(admin_token))
            assert r.status_code == 200
            assert r.json()["active"] is False
            # login blocked
            lr = requests.post(f"{API}/auth/login",
                               json={"phone": WARGA[0], "pin": WARGA[1]})
            assert lr.status_code == 403
            assert "dinonaktifkan" in lr.json()["detail"].lower()
            # petugas lookup blocked (returns 404 or 403)
            pf = requests.get(f"{API}/petugas/warga/{MEMBER}", headers=wh(petugas_token))
            assert pf.status_code in (400, 403, 404)
        finally:
            # restore
            requests.patch(f"{API}/admin/warga/{uid}",
                          json={"active": True}, headers=wh(admin_token))
        # login works again
        lr2 = requests.post(f"{API}/auth/login",
                            json={"phone": WARGA[0], "pin": WARGA[1]})
        assert lr2.status_code == 200

    def test_reset_pin_warga(self, admin_token):
        uid = requests.get(f"{API}/admin/warga?q=Ratna", headers=wh(admin_token)).json()["items"][0]["id"]
        # change to new pin then revert
        r = requests.post(f"{API}/admin/users/{uid}/reset-pin",
                          json={"pin": "999999"}, headers=wh(admin_token))
        assert r.status_code == 200
        lr = requests.post(f"{API}/auth/login", json={"phone": WARGA[0], "pin": "999999"})
        assert lr.status_code == 200
        # revert
        requests.post(f"{API}/admin/users/{uid}/reset-pin",
                      json={"pin": WARGA[1]}, headers=wh(admin_token))
        lr2 = requests.post(f"{API}/auth/login", json={"phone": WARGA[0], "pin": WARGA[1]})
        assert lr2.status_code == 200

    def test_reset_pin_short(self, admin_token):
        uid = requests.get(f"{API}/admin/warga?q=Ratna", headers=wh(admin_token)).json()["items"][0]["id"]
        r = requests.post(f"{API}/admin/users/{uid}/reset-pin",
                          json={"pin": "12"}, headers=wh(admin_token))
        assert r.status_code == 400


# -------- PETUGAS MGMT --------
class TestPetugasMgmt:
    created_id = None
    created_phone = None

    def test_list_petugas(self, admin_token):
        r = requests.get(f"{API}/admin/petugas", headers=wh(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(p["phone"] == PETUGAS[0] for p in items)
        for p in items:
            assert "setoran_total" in p

    def test_create_petugas_and_login(self, admin_token):
        phone = f"0813{uuid.uuid4().int % 10**8:08d}"
        TestPetugasMgmt.created_phone = phone
        r = requests.post(f"{API}/admin/petugas",
                          json={"name": "TEST_Petugas", "phone": phone, "pin": "4321",
                                "rt": "03", "rw": "05", "kelurahan": "TEST"},
                          headers=wh(admin_token))
        assert r.status_code == 200, r.text
        TestPetugasMgmt.created_id = r.json()["id"]
        # login
        lr = requests.post(f"{API}/auth/login",
                           json={"phone": phone, "pin": "4321", "as_petugas": True})
        assert lr.status_code == 200
        assert lr.json()["user"]["role"] == "petugas"

    def test_create_petugas_duplicate_phone(self, admin_token):
        r = requests.post(f"{API}/admin/petugas",
                          json={"name": "dup", "phone": PETUGAS[0], "pin": "1234"},
                          headers=wh(admin_token))
        assert r.status_code == 400

    def test_edit_petugas(self, admin_token):
        assert TestPetugasMgmt.created_id
        r = requests.patch(f"{API}/admin/petugas/{TestPetugasMgmt.created_id}",
                           json={"name": "TEST_Petugas_Updated"}, headers=wh(admin_token))
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Petugas_Updated"

    def test_deactivate_petugas_blocks_login(self, admin_token):
        assert TestPetugasMgmt.created_id
        r = requests.patch(f"{API}/admin/petugas/{TestPetugasMgmt.created_id}",
                           json={"active": False}, headers=wh(admin_token))
        assert r.status_code == 200
        lr = requests.post(f"{API}/auth/login",
                           json={"phone": TestPetugasMgmt.created_phone, "pin": "4321",
                                 "as_petugas": True})
        assert lr.status_code == 403


# -------- CATALOG --------
class TestCatalog:
    created_id = None

    def test_list_catalog(self, admin_token):
        r = requests.get(f"{API}/admin/catalog", headers=wh(admin_token))
        assert r.status_code == 200
        assert len(r.json()["items"]) >= 1

    def test_create_validation(self, admin_token):
        r = requests.post(f"{API}/admin/catalog",
                          json={"name": "x", "points": 0, "category": "Pulsa"},
                          headers=wh(admin_token))
        assert r.status_code == 400
        r2 = requests.post(f"{API}/admin/catalog",
                           json={"name": "x", "points": 10, "category": "Pulsa", "stock": -1},
                           headers=wh(admin_token))
        assert r2.status_code == 400

    def test_create_update_delete(self, admin_token):
        r = requests.post(f"{API}/admin/catalog",
                          json={"name": "TEST_Item", "points": 100, "category": "Pulsa",
                                "sub": "sub", "how": "how", "stock": 5, "active": True},
                          headers=wh(admin_token))
        assert r.status_code == 200
        iid = r.json()["id"]
        TestCatalog.created_id = iid
        # update
        r2 = requests.put(f"{API}/admin/catalog/{iid}",
                          json={"name": "TEST_Item2", "points": 150, "category": "Pulsa",
                                "stock": 10, "active": True},
                          headers=wh(admin_token))
        assert r2.status_code == 200
        assert r2.json()["points"] == 150
        # delete
        rd = requests.delete(f"{API}/admin/catalog/{iid}", headers=wh(admin_token))
        assert rd.status_code == 200

    def test_hidden_item_not_in_warga_catalog(self, admin_token, warga_token):
        r = requests.post(f"{API}/admin/catalog",
                          json={"name": "TEST_Hidden", "points": 50, "category": "Pulsa",
                                "stock": 5, "active": False}, headers=wh(admin_token))
        assert r.status_code == 200
        iid = r.json()["id"]
        try:
            cat = requests.get(f"{API}/warga/catalog", headers=wh(warga_token)).json()
            assert not any(i["id"] == iid for i in cat["items"])
        finally:
            requests.delete(f"{API}/admin/catalog/{iid}", headers=wh(admin_token))


# -------- SCHEDULES --------
class TestSchedules:
    def test_schedules_crud_and_warga_sees_it(self, admin_token, warga_token):
        future = (date.today() + timedelta(days=7)).isoformat()
        r = requests.post(f"{API}/admin/schedules",
                          json={"date": future, "type": "organik", "time": "08.00-10.00",
                                "tip": "TEST tip", "petugas": "Pak TEST", "rt": "03", "rw": "05"},
                          headers=wh(admin_token))
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        try:
            # warga's schedule includes it
            ws = requests.get(f"{API}/warga/schedule", headers=wh(warga_token)).json()
            assert any(s["id"] == sid for s in ws["schedules"])
            # filter
            lst = requests.get(f"{API}/admin/schedules?rt=03&rw=05",
                               headers=wh(admin_token)).json()
            assert any(s["id"] == sid for s in lst["items"])
            # update
            r2 = requests.put(f"{API}/admin/schedules/{sid}",
                              json={"date": future, "type": "anorganik", "time": "09.00-11.00",
                                    "tip": "", "petugas": "", "rt": "03", "rw": "05"},
                              headers=wh(admin_token))
            assert r2.status_code == 200
            assert r2.json()["type"] == "anorganik"
            # bad type
            rb = requests.post(f"{API}/admin/schedules",
                               json={"date": future, "type": "xxx", "rt": "03", "rw": "05"},
                               headers=wh(admin_token))
            assert rb.status_code == 400
        finally:
            requests.delete(f"{API}/admin/schedules/{sid}", headers=wh(admin_token))


# -------- SETORAN --------
class TestSetoran:
    def test_list_and_totals(self, admin_token):
        r = requests.get(f"{API}/admin/setoran", headers=wh(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("items", "total", "totals"):
            assert k in d
        for k in ("organik", "anorganik", "residu", "ecobrick", "points"):
            assert k in d["totals"]

    def test_filter_by_petugas(self, admin_token):
        plist = requests.get(f"{API}/admin/petugas", headers=wh(admin_token)).json()["items"]
        seed_pid = next((p["id"] for p in plist if p["phone"] == PETUGAS[0]), None)
        if not seed_pid:
            pytest.skip("seed petugas not found")
        r = requests.get(f"{API}/admin/setoran?petugas_id={seed_pid}", headers=wh(admin_token))
        assert r.status_code == 200
        for t in r.json()["items"]:
            assert t["petugas_id"] == seed_pid

    def test_export_csv(self, admin_token):
        r = requests.get(f"{API}/admin/setoran/export", headers=wh(admin_token))
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "Kode Anggota" in r.text

    def test_bad_date_range(self, admin_token):
        r = requests.get(f"{API}/admin/setoran?frm=notadate", headers=wh(admin_token))
        # frm w/o to isn't parsed, only `to` is parsed as date -> try to
        r2 = requests.get(f"{API}/admin/setoran?to=notadate", headers=wh(admin_token))
        assert r2.status_code == 400


# -------- REDEMPTIONS --------
class TestRedemptions:
    def test_redeem_creates_menunggu_and_decrements_stock(self, admin_token, warga_token):
        # create catalog item with stock=1 that warga can afford
        cat_r = requests.post(f"{API}/admin/catalog",
                              json={"name": "TEST_Redeem", "points": 1, "category": "Pulsa",
                                    "stock": 1, "active": True}, headers=wh(admin_token))
        iid = cat_r.json()["id"]
        try:
            rr = requests.post(f"{API}/warga/redeem",
                               json={"item_id": iid}, headers=wh(warga_token))
            assert rr.status_code == 200, rr.text
            red = rr.json()["redemption"]
            assert red["status"] == "menunggu"
            rid = red["id"]
            # stock now 0 -> next redeem returns stok habis
            rr2 = requests.post(f"{API}/warga/redeem",
                                json={"item_id": iid}, headers=wh(warga_token))
            assert rr2.status_code == 400
            assert "stok" in rr2.json()["detail"].lower()

            # admin processes: menunggu -> diproses
            up1 = requests.patch(f"{API}/admin/redemptions/{rid}",
                                 json={"status": "diproses"}, headers=wh(admin_token))
            assert up1.status_code == 200
            assert up1.json()["status"] == "diproses"

            # diproses -> selesai
            up2 = requests.patch(f"{API}/admin/redemptions/{rid}",
                                 json={"status": "selesai"}, headers=wh(admin_token))
            assert up2.status_code == 200
            assert up2.json()["status"] == "selesai"

            # selesai -> anything = 400
            up3 = requests.patch(f"{API}/admin/redemptions/{rid}",
                                 json={"status": "ditolak", "note": "x"}, headers=wh(admin_token))
            assert up3.status_code == 400
        finally:
            # delete item (and status cleanup done atomically; we leave redemption historic)
            requests.delete(f"{API}/admin/catalog/{iid}", headers=wh(admin_token))

    def test_reject_requires_reason_refunds_points_and_stock(self, admin_token, warga_token):
        cat_r = requests.post(f"{API}/admin/catalog",
                              json={"name": "TEST_Rej", "points": 2, "category": "Pulsa",
                                    "stock": 1, "active": True}, headers=wh(admin_token))
        iid = cat_r.json()["id"]
        try:
            before_pts = requests.get(f"{API}/auth/me", headers=wh(warga_token)).json()["points"]
            rr = requests.post(f"{API}/warga/redeem",
                               json={"item_id": iid}, headers=wh(warga_token))
            assert rr.status_code == 200
            rid = rr.json()["redemption"]["id"]
            after_pts = requests.get(f"{API}/auth/me", headers=wh(warga_token)).json()["points"]
            assert after_pts == before_pts - 2

            # reject without reason
            r1 = requests.patch(f"{API}/admin/redemptions/{rid}",
                                json={"status": "ditolak", "note": ""}, headers=wh(admin_token))
            assert r1.status_code == 400

            # reject with reason -> refund points + stock
            r2 = requests.patch(f"{API}/admin/redemptions/{rid}",
                                json={"status": "ditolak", "note": "TEST stock habis"},
                                headers=wh(admin_token))
            assert r2.status_code == 200
            refund_pts = requests.get(f"{API}/auth/me", headers=wh(warga_token)).json()["points"]
            assert refund_pts == before_pts  # refunded
            # stock back to 1
            cat_item = next(i for i in requests.get(f"{API}/admin/catalog",
                                                    headers=wh(admin_token)).json()["items"]
                            if i["id"] == iid)
            assert cat_item["stock"] == 1
        finally:
            requests.delete(f"{API}/admin/catalog/{iid}", headers=wh(admin_token))

    def test_list_and_counts(self, admin_token):
        r = requests.get(f"{API}/admin/redemptions", headers=wh(admin_token))
        assert r.status_code == 200
        d = r.json()
        for s in ("menunggu", "diproses", "selesai", "ditolak"):
            assert s in d["counts"]

    def test_export_csv(self, admin_token):
        r = requests.get(f"{API}/admin/redemptions/export", headers=wh(admin_token))
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
