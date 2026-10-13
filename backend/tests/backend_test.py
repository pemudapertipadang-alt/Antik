"""PilahIn backend E2E tests via public URL."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://antik-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

WARGA_PHONE = "081200000002"
WARGA_PIN = "123456"
PETUGAS_PHONE = "081200000001"
PETUGAS_PIN = "123456"
MEMBER_CODE = "PLH-0503-0127"


@pytest.fixture(scope="session")
def warga_token():
    r = requests.post(f"{API}/auth/login", json={"phone": WARGA_PHONE, "pin": WARGA_PIN, "as_petugas": False})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def petugas_token():
    r = requests.post(f"{API}/auth/login", json={"phone": PETUGAS_PHONE, "pin": PETUGAS_PIN, "as_petugas": True})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def wh(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- AUTH
class TestAuth:
    def test_login_warga_ok(self):
        r = requests.post(f"{API}/auth/login", json={"phone": WARGA_PHONE, "pin": WARGA_PIN, "as_petugas": False})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and d["user"]["role"] == "warga"
        assert d["user"]["member_code"] == MEMBER_CODE
        assert "pin_hash" not in d["user"]

    def test_login_petugas_ok(self):
        r = requests.post(f"{API}/auth/login", json={"phone": PETUGAS_PHONE, "pin": PETUGAS_PIN, "as_petugas": True})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "petugas"

    def test_login_bad_pin(self):
        r = requests.post(f"{API}/auth/login", json={"phone": WARGA_PHONE, "pin": "000000", "as_petugas": False})
        assert r.status_code == 401
        assert "salah" in r.json()["detail"].lower()

    def test_login_wrong_role(self):
        # Warga phone with as_petugas=true should fail
        r = requests.post(f"{API}/auth/login", json={"phone": WARGA_PHONE, "pin": WARGA_PIN, "as_petugas": True})
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_ok(self, warga_token):
        r = requests.get(f"{API}/auth/me", headers=wh(warga_token))
        assert r.status_code == 200
        assert r.json()["phone"] == WARGA_PHONE

    def test_register_and_login(self):
        phone = f"0812{uuid.uuid4().int % 10**8:08d}"
        reg_body = {"name": "TEST_User", "phone": phone, "pin": "9876",
                    "kabupaten": "Kab. Agam", "kecamatan": "Ampek Angkek",
                    "kelurahan": "Batu Taba", "rt": "03", "rw": "05"}
        r = requests.post(f"{API}/auth/register", json=reg_body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["role"] == "warga"
        assert d["user"]["points"] == 0
        # duplicate
        r2 = requests.post(f"{API}/auth/register", json=reg_body)
        assert r2.status_code == 400

    def test_register_short_pin(self):
        r = requests.post(f"{API}/auth/register", json={
            "name": "x", "phone": f"0899{uuid.uuid4().int % 10**8:08d}", "pin": "12",
            "kabupaten": "Kab. Agam", "kecamatan": "Ampek Angkek",
            "kelurahan": "Batu Taba", "rt": "01", "rw": "01"})
        assert r.status_code == 400


# ---------- WARGA
class TestWarga:
    def test_dashboard(self, warga_token):
        r = requests.get(f"{API}/warga/dashboard", headers=wh(warga_token))
        assert r.status_code == 200
        d = r.json()
        assert "points" in d and isinstance(d["points"], int)
        assert "impact" in d and {"organik", "anorganik", "ecobrick"} <= set(d["impact"].keys())
        assert "batch" in d

    def test_missions_list(self, warga_token):
        r = requests.get(f"{API}/warga/missions", headers=wh(warga_token))
        assert r.status_code == 200
        d = r.json()
        assert len(d["daily"]) == 3
        assert len(d["stages"]) == 4
        assert len(d["days"]) == 7

    def test_mission_complete_and_duplicate(self, warga_token):
        before = requests.get(f"{API}/warga/dashboard", headers=wh(warga_token)).json()["points"]
        miss = requests.get(f"{API}/warga/missions", headers=wh(warga_token)).json()
        # find a mission not done yet
        pending = [m for m in miss["daily"] if not m["done"]]
        if not pending:
            pytest.skip("All daily missions already done today")
        m = pending[0]
        r = requests.post(f"{API}/warga/missions/complete", json={"mission_id": m["id"]}, headers=wh(warga_token))
        assert r.status_code == 200, r.text
        assert r.json()["points"] == before + m["points"]
        # duplicate
        r2 = requests.post(f"{API}/warga/missions/complete", json={"mission_id": m["id"]}, headers=wh(warga_token))
        assert r2.status_code == 400

    def test_schedule_and_confirm_toggle(self, warga_token):
        r = requests.get(f"{API}/warga/schedule", headers=wh(warga_token))
        assert r.status_code == 200
        d = r.json()
        assert d["member_code"] == MEMBER_CODE
        assert len(d["schedules"]) > 0
        sid = d["schedules"][0]["id"]
        was = d["schedules"][0]["confirmed"]
        r1 = requests.post(f"{API}/warga/schedule/confirm", json={"schedule_id": sid}, headers=wh(warga_token))
        assert r1.status_code == 200
        assert r1.json()["confirmed"] == (not was)
        r2 = requests.post(f"{API}/warga/schedule/confirm", json={"schedule_id": sid}, headers=wh(warga_token))
        assert r2.json()["confirmed"] == was

    def test_catalog(self, warga_token):
        r = requests.get(f"{API}/warga/catalog", headers=wh(warga_token))
        assert r.status_code == 200
        d = r.json()
        assert len(d["items"]) == 6
        assert all("points" in i and "category" in i for i in d["items"])

    def test_redeem_insufficient(self, warga_token):
        # Register a brand new warga with 0 points
        phone = f"0812{uuid.uuid4().int % 10**8:08d}"
        reg = requests.post(f"{API}/auth/register", json={
            "name": "TEST_poor", "phone": phone, "pin": "4321",
            "kabupaten": "Kab. Agam", "kecamatan": "Ampek Angkek",
            "kelurahan": "Batu Taba", "rt": "01", "rw": "02"})
        assert reg.status_code == 200, reg.text
        tok = reg.json()["token"]
        cat = requests.get(f"{API}/warga/catalog", headers=wh(tok)).json()
        expensive = max(cat["items"], key=lambda i: i["points"])
        r = requests.post(f"{API}/warga/redeem", json={"item_id": expensive["id"]}, headers=wh(tok))
        assert r.status_code == 400
        assert "poin" in r.json()["detail"].lower()

    def test_redeem_ok(self, warga_token):
        before = requests.get(f"{API}/warga/dashboard", headers=wh(warga_token)).json()["points"]
        cat = requests.get(f"{API}/warga/catalog", headers=wh(warga_token)).json()
        affordable = [i for i in cat["items"] if i["points"] <= before]
        if not affordable:
            pytest.skip("No affordable item")
        item = min(affordable, key=lambda i: i["points"])
        r = requests.post(f"{API}/warga/redeem", json={"item_id": item["id"]}, headers=wh(warga_token))
        assert r.status_code == 200, r.text
        assert r.json()["points"] == before - item["points"]

    def test_history(self, warga_token):
        r = requests.get(f"{API}/warga/history", headers=wh(warga_token))
        assert r.status_code == 200
        hist = r.json()["history"]
        assert isinstance(hist, list) and len(hist) > 0


# ---------- PETUGAS
class TestPetugas:
    def test_find_warga(self, petugas_token):
        r = requests.get(f"{API}/petugas/warga/{MEMBER_CODE}", headers=wh(petugas_token))
        assert r.status_code == 200
        d = r.json()
        assert d["member_code"] == MEMBER_CODE
        assert d["name"] == "Bu Ratna"

    def test_find_warga_not_found(self, petugas_token):
        r = requests.get(f"{API}/petugas/warga/PLH-9999-9999", headers=wh(petugas_token))
        assert r.status_code == 404

    def test_rates(self, petugas_token):
        r = requests.get(f"{API}/petugas/rates", headers=wh(petugas_token))
        assert r.status_code == 200
        d = r.json()
        assert d["rates"]["organik"] == 500
        assert d["rates"]["anorganik"] == 1500
        assert d["rates"]["ecobrick"] == 1000
        assert d["rates"]["residu"] == 0
        assert d["clean_bonus_pct"] == 10
        assert d["point_rupiah"] == 1

    def test_weigh_and_bonus(self, petugas_token):
        before = requests.get(f"{API}/petugas/warga/{MEMBER_CODE}", headers=wh(petugas_token)).json()["points"]
        body = {"member_code": MEMBER_CODE, "clean_bonus": True,
                "items": [{"type": "organik", "value": 2.0, "unit": "kg"},
                          {"type": "anorganik", "value": 1.0, "unit": "kg"},
                          {"type": "ecobrick", "value": 1, "unit": "botol"}]}
        # expected: 1000 + 1500 + 1000 = 3500, bonus 10% = 350, total 3850
        r = requests.post(f"{API}/petugas/weigh", json=body, headers=wh(petugas_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total_points"] == 3850
        assert d["bonus_points"] == 350
        after = requests.get(f"{API}/petugas/warga/{MEMBER_CODE}", headers=wh(petugas_token)).json()["points"]
        assert after == before + 3850

    def test_today(self, petugas_token):
        r = requests.get(f"{API}/petugas/today", headers=wh(petugas_token))
        assert r.status_code == 200
        assert r.json()["count"] >= 1


# ---------- GUARDS
class TestGuards:
    def test_warga_forbidden_on_petugas(self, warga_token):
        r = requests.get(f"{API}/petugas/warga/{MEMBER_CODE}", headers=wh(warga_token))
        assert r.status_code == 403

    def test_unauth_petugas(self):
        r = requests.get(f"{API}/petugas/rates")
        assert r.status_code == 401

    def test_invalid_token(self):
        r = requests.get(f"{API}/warga/dashboard", headers={"Authorization": "Bearer invalid.token.here"})
        assert r.status_code == 401
