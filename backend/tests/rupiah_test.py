"""Rupiah-scale migration + admin tarif/misi endpoints tests."""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://antik-app.preview.emergentagent.com").rstrip("/")
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
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(*ADMIN, as_admin=True)


@pytest.fixture(scope="session")
def petugas_token():
    return _login(*PETUGAS, as_petugas=True)


@pytest.fixture(scope="session")
def warga_token():
    return _login(*WARGA)


# ---------- Migration state checks ----------
class TestMigrationState:
    def test_petugas_rates_defaults(self, petugas_token):
        r = requests.get(f"{API}/petugas/rates", headers=wh(petugas_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["rates"] == {"organik": 500, "anorganik": 1500, "residu": 0, "ecobrick": 1000}
        assert d["clean_bonus_pct"] == 10
        assert d["point_rupiah"] == 1
        # label formatted with dot thousands separator (id-ID)
        assert "1.500" in d["labels"]["anorganik"]

    def test_daily_missions_values(self, warga_token):
        r = requests.get(f"{API}/warga/missions", headers=wh(warga_token))
        assert r.status_code == 200
        daily = r.json()["daily"]
        assert len(daily) == 3
        points = sorted(m["points"] for m in daily)
        assert points == [100, 200, 500]

    def test_catalog_prices(self, warga_token):
        r = requests.get(f"{API}/warga/catalog", headers=wh(warga_token))
        assert r.status_code == 200
        items = r.json()["items"]
        by_name = {i["name"]: i["points"] for i in items}
        # Donasi kas RW should be 5000
        donasi = next((v for k, v in by_name.items() if "Donasi" in k), None)
        assert donasi == 5000, f"Donasi price = {donasi}, by_name={by_name}"
        # at least one 10000 (Pulsa or Bibit) and one 20000 (Token listrik)
        assert any(v == 20000 for v in by_name.values())
        assert any(v == 10000 for v in by_name.values())

    def test_warga_balance_reset_and_adjustment_logged(self, admin_token):
        # Bu Ratna's detail should show reset adjustment
        lst = requests.get(f"{API}/admin/warga?q=Ratna", headers=wh(admin_token)).json()
        uid = lst["items"][0]["id"]
        d = requests.get(f"{API}/admin/warga/{uid}", headers=wh(admin_token)).json()
        adjs = d["adjustments"]
        reset_adj = [a for a in adjs if "sistem poin baru" in a.get("reason", "").lower()]
        assert reset_adj, f"Reset adjustment not found. adjustments={adjs}"
        assert reset_adj[0]["delta"] < 0  # negative delta (removed old points)

    def test_migration_is_idempotent_marker(self, admin_token):
        # Call GET /admin/settings/rates twice - should be stable
        r1 = requests.get(f"{API}/admin/settings/rates", headers=wh(admin_token))
        r2 = requests.get(f"{API}/admin/settings/rates", headers=wh(admin_token))
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["rates"] == r2.json()["rates"]


# ---------- Admin rates GET/PUT ----------
class TestAdminRates:
    def test_get_rates_shape(self, admin_token):
        r = requests.get(f"{API}/admin/settings/rates", headers=wh(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("rates", "clean_bonus_pct", "units", "point_rupiah", "missions"):
            assert k in d
        assert d["rates"]["organik"] == 500
        assert len(d["missions"]) == 3

    def test_put_rates_rejects_negative(self, admin_token):
        r = requests.put(f"{API}/admin/settings/rates", headers=wh(admin_token),
                         json={"organik": -1, "anorganik": 1500, "residu": 0, "ecobrick": 1000,
                               "clean_bonus_pct": 10})
        assert r.status_code == 400

    def test_put_rates_rejects_bad_bonus(self, admin_token):
        r = requests.put(f"{API}/admin/settings/rates", headers=wh(admin_token),
                         json={"organik": 500, "anorganik": 1500, "residu": 0, "ecobrick": 1000,
                               "clean_bonus_pct": 150})
        assert r.status_code == 400

    def test_put_rates_affects_weigh_then_restore(self, admin_token, petugas_token):
        # Change organik to 600
        try:
            r = requests.put(f"{API}/admin/settings/rates", headers=wh(admin_token),
                             json={"organik": 600, "anorganik": 1500, "residu": 0, "ecobrick": 1000,
                                   "clean_bonus_pct": 10})
            assert r.status_code == 200
            # Verify petugas sees new rate
            rp = requests.get(f"{API}/petugas/rates", headers=wh(petugas_token)).json()
            assert rp["rates"]["organik"] == 600
            # Weigh: 1kg organik → 600 pts (+10% bonus = 660)
            w = requests.post(f"{API}/petugas/weigh", headers=wh(petugas_token),
                              json={"member_code": MEMBER, "clean_bonus": False,
                                    "items": [{"type": "organik", "value": 1.0, "unit": "kg"}]})
            assert w.status_code == 200, w.text
            assert w.json()["total_points"] == 600
        finally:
            # restore
            rr = requests.put(f"{API}/admin/settings/rates", headers=wh(admin_token),
                              json={"organik": 500, "anorganik": 1500, "residu": 0, "ecobrick": 1000,
                                    "clean_bonus_pct": 10})
            assert rr.status_code == 200
            assert rr.json()["rates"]["organik"] == 500


# ---------- Admin missions ----------
class TestAdminMissions:
    def test_update_mission_points_affects_completion(self, admin_token):
        # Get a daily mission
        rr = requests.get(f"{API}/admin/settings/rates", headers=wh(admin_token)).json()
        missions = rr["missions"]
        # pick the "Padatkan/ecobrick" one (points=100) to minimize side-effects
        target = next((m for m in missions if m["points"] == 100), missions[0])
        mid = target["id"]
        orig_points = target["points"]
        orig_title = target["title"]
        orig_desc = target.get("desc", "")

        # Register a brand-new warga (fresh completions)
        phone = f"0812{uuid.uuid4().int % 10**8:08d}"
        reg = requests.post(f"{API}/auth/register",
                            json={"name": "TEST_mission", "phone": phone, "pin": "4321",
                                  "kabupaten": "Kab. Agam", "kecamatan": "Ampek Angkek",
                                  "kelurahan": "Batu Taba", "rt": "01", "rw": "02"})
        assert reg.status_code == 200
        wtok = reg.json()["token"]

        try:
            # Change points to 777
            u = requests.put(f"{API}/admin/missions/{mid}", headers=wh(admin_token),
                             json={"points": 777})
            assert u.status_code == 200, u.text
            assert u.json()["points"] == 777

            # Complete that mission as new warga
            before = requests.get(f"{API}/warga/dashboard", headers=wh(wtok)).json()["points"]
            c = requests.post(f"{API}/warga/missions/complete", headers=wh(wtok),
                              json={"mission_id": mid})
            assert c.status_code == 200, c.text
            assert c.json()["earned"] == 777
            assert c.json()["points"] == before + 777
        finally:
            # restore
            requests.put(f"{API}/admin/missions/{mid}", headers=wh(admin_token),
                         json={"title": orig_title, "desc": orig_desc, "points": orig_points})

    def test_update_mission_rejects_empty_title(self, admin_token):
        rr = requests.get(f"{API}/admin/settings/rates", headers=wh(admin_token)).json()
        mid = rr["missions"][0]["id"]
        r = requests.put(f"{API}/admin/missions/{mid}", headers=wh(admin_token),
                         json={"title": "   "})
        assert r.status_code == 400

    def test_update_mission_rejects_negative(self, admin_token):
        rr = requests.get(f"{API}/admin/settings/rates", headers=wh(admin_token)).json()
        mid = rr["missions"][0]["id"]
        r = requests.put(f"{API}/admin/missions/{mid}", headers=wh(admin_token),
                         json={"points": -5})
        assert r.status_code == 400

    def test_update_mission_not_found(self, admin_token):
        r = requests.put(f"{API}/admin/missions/does-not-exist", headers=wh(admin_token),
                         json={"points": 100})
        assert r.status_code == 404


# ---------- Guards ----------
class TestGuards:
    def test_warga_cannot_get_rates(self, warga_token):
        r = requests.get(f"{API}/admin/settings/rates", headers=wh(warga_token))
        assert r.status_code == 403

    def test_petugas_cannot_put_rates(self, petugas_token):
        r = requests.put(f"{API}/admin/settings/rates", headers=wh(petugas_token),
                         json={"organik": 500, "anorganik": 1500, "residu": 0, "ecobrick": 1000,
                               "clean_bonus_pct": 10})
        assert r.status_code == 403

    def test_unauth_put_mission(self):
        r = requests.put(f"{API}/admin/missions/xyz", json={"points": 1})
        assert r.status_code == 401


# ---------- E2E: redeem Donasi RW ----------
class TestE2EDonasi:
    def test_warga_can_redeem_donasi_after_earning(self, admin_token, petugas_token):
        # Register a brand-new warga
        phone = f"0812{uuid.uuid4().int % 10**8:08d}"
        reg = requests.post(f"{API}/auth/register",
                            json={"name": "TEST_donasi", "phone": phone, "pin": "4321",
                                  "kabupaten": "Kab. Agam", "kecamatan": "Ampek Angkek",
                                  "kelurahan": "Batu Taba", "rt": "01", "rw": "02"})
        assert reg.status_code == 200
        wtok = reg.json()["token"]
        # Find member_code
        me = requests.get(f"{API}/auth/me", headers=wh(wtok)).json()
        mc = me["member_code"]

        # Petugas weighs 10kg organik → 5000 points (enough for Donasi 5000)
        w = requests.post(f"{API}/petugas/weigh", headers=wh(petugas_token),
                          json={"member_code": mc, "clean_bonus": False,
                                "items": [{"type": "organik", "value": 10.0, "unit": "kg"}]})
        assert w.status_code == 200, w.text
        assert w.json()["total_points"] == 5000

        # Find Donasi item id
        cat = requests.get(f"{API}/warga/catalog", headers=wh(wtok)).json()["items"]
        donasi = next((i for i in cat if "Donasi" in i["name"]), None)
        assert donasi, "Donasi item not found"
        assert donasi["points"] == 5000

        # Redeem
        rr = requests.post(f"{API}/warga/redeem", headers=wh(wtok), json={"item_id": donasi["id"]})
        assert rr.status_code == 200, rr.text
        assert rr.json()["redemption"]["status"] == "menunggu"
        # points now 0
        me2 = requests.get(f"{API}/auth/me", headers=wh(wtok)).json()
        assert me2["points"] == 0
