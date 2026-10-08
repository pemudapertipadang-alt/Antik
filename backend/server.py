from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta, date

import jwt
import bcrypt
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional

# ---------------------------------------------------------------- setup
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

app = FastAPI()
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pilahin")

# ---------------------------------------------------------------- helpers
def now_iso():
    return datetime.now(timezone.utc).isoformat()

def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_pin(pin: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def public_user(u: dict) -> dict:
    u = dict(u)
    u.pop("_id", None)
    u.pop("pin_hash", None)
    return u

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Belum masuk")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesi berakhir, silakan masuk lagi")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="Pengguna tidak ditemukan")
    return user

async def require_petugas(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "petugas":
        raise HTTPException(status_code=403, detail="Hanya untuk petugas")
    return user

# ---------------------------------------------------------------- models
class RegisterIn(BaseModel):
    name: str
    phone: str
    pin: str
    kabupaten: str
    kecamatan: str
    kelurahan: str
    rt: str
    rw: str

class LoginIn(BaseModel):
    phone: str
    pin: str
    as_petugas: bool = False

class MissionCompleteIn(BaseModel):
    mission_id: str

class ConfirmPickupIn(BaseModel):
    schedule_id: str

class RedeemIn(BaseModel):
    item_id: str

class WeighItem(BaseModel):
    type: str          # organik | anorganik | ecobrick | residu
    value: float
    unit: str          # kg | botol

class WeighIn(BaseModel):
    member_code: str
    items: List[WeighItem]
    clean_bonus: bool = False

# ---------------------------------------------------------------- economics
RATES = {"organik": 10, "anorganik": 15, "residu": 0, "ecobrick": 20}
RATE_LABEL = {
    "organik": "10 poin / kg",
    "anorganik": "15 poin / kg",
    "residu": "0 poin / kg",
    "ecobrick": "20 poin / botol",
}
TYPE_COLOR = {"organik": "#1F5C3F", "anorganik": "#1E4F8A", "ecobrick": "#B45309", "residu": "#5B6560"}

# ---------------------------------------------------------------- regions (Sumatera Barat)
import json as _json
with open(ROOT_DIR / "data" / "sumbar.json", encoding="utf-8") as _f:
    REGIONS = _json.load(_f)
_KAB_BY_ID = {r["id"]: r for r in REGIONS}
_KEC_BY_ID = {}
for _r in REGIONS:
    for _d in _r["districts"]:
        _KEC_BY_ID[_d["id"]] = _d

@api.get("/regions/kabupaten")
async def regions_kabupaten():
    return {"items": [{"id": r["id"], "name": r["name"]} for r in REGIONS]}

@api.get("/regions/kecamatan/{kab_id}")
async def regions_kecamatan(kab_id: str):
    r = _KAB_BY_ID.get(kab_id)
    if not r:
        raise HTTPException(status_code=404, detail="Kabupaten/Kota tidak ditemukan")
    return {"items": [{"id": d["id"], "name": d["name"]} for d in r["districts"]]}

@api.get("/regions/kelurahan/{kec_id}")
async def regions_kelurahan(kec_id: str):
    d = _KEC_BY_ID.get(kec_id)
    if not d:
        raise HTTPException(status_code=404, detail="Kecamatan tidak ditemukan")
    return {"items": [{"id": v["id"], "name": v["name"]} for v in d["villages"]]}


# ================================================================ AUTH
@api.post("/auth/register")
async def register(body: RegisterIn):
    phone = body.phone.strip()
    if await db.users.find_one({"phone": phone, "role": "warga"}):
        raise HTTPException(status_code=400, detail="Nomor HP sudah terdaftar")
    if len(body.pin) < 4:
        raise HTTPException(status_code=400, detail="PIN minimal 4 digit")
    count = await db.users.count_documents({"role": "warga"}) + 1
    member_code = f"ATK-{body.rw}{body.rt}-{count:04d}"
    user = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "phone": phone,
        "pin_hash": hash_pin(body.pin),
        "role": "warga",
        "kabupaten": body.kabupaten, "kecamatan": body.kecamatan,
        "rt": body.rt, "rw": body.rw, "kelurahan": body.kelurahan,
        "member_code": member_code,
        "points": 0,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    token = create_token(user["id"], user["role"])
    return {"token": token, "user": public_user(user)}

@api.post("/auth/login")
async def login(body: LoginIn):
    role = "petugas" if body.as_petugas else "warga"
    user = await db.users.find_one({"phone": body.phone.strip(), "role": role})
    if not user or not verify_pin(body.pin, user["pin_hash"]):
        raise HTTPException(status_code=401, detail="Nomor HP atau PIN salah")
    token = create_token(user["id"], user["role"])
    return {"token": token, "user": public_user(user)}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)

# ================================================================ WARGA
@api.get("/warga/dashboard")
async def warga_dashboard(user: dict = Depends(get_current_user)):
    uid = user["id"]
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    txns = await db.weigh_txns.find({"warga_id": uid}).to_list(1000)
    week_points = sum(t["total_points"] for t in txns if t["created_at"] >= week_ago)
    impact = {"organik": 0.0, "anorganik": 0.0, "ecobrick": 0}
    for t in txns:
        if t["created_at"] >= month_start:
            for it in t["items"]:
                if it["type"] == "ecobrick":
                    impact["ecobrick"] += it["value"]
                elif it["type"] in impact:
                    impact[it["type"]] += it["value"]

    # next pickup
    today = date.today().isoformat()
    nxt = await db.schedules.find_one(
        {"rt": user["rt"], "rw": user["rw"], "date": {"$gte": today}},
        sort=[("date", 1)],
    )
    next_pickup = None
    if nxt:
        conf = await db.pickup_confirmations.find_one({"user_id": uid, "schedule_id": nxt["id"]})
        next_pickup = {
            "id": nxt["id"], "date": nxt["date"], "label": nxt["label"],
            "type": nxt["type"], "time": nxt["time"], "tip": nxt["tip"],
            "confirmed": bool(conf),
        }

    # global batch (pupuk) aggregate
    all_txns = await db.weigh_txns.find({}).to_list(5000)
    total_organik = sum(it["value"] for t in all_txns for it in t["items"] if it["type"] == "organik")
    batch_target = 2.0
    batch_current = round((total_organik % (batch_target * 1000)) / 1000, 2)

    return {
        "points": user["points"],
        "week_points": week_points,
        "impact": {
            "organik": round(impact["organik"], 1),
            "anorganik": round(impact["anorganik"], 1),
            "ecobrick": int(impact["ecobrick"]),
        },
        "next_pickup": next_pickup,
        "batch": {"current": batch_current, "target": batch_target, "number": 8, "rank": 1, "rate": 81},
        "user": public_user(user),
    }

@api.get("/warga/missions")
async def warga_missions(user: dict = Depends(get_current_user)):
    uid = user["id"]
    missions = await db.missions.find({}).sort("order", 1).to_list(100)
    today = date.today().isoformat()
    done_today = {c["mission_id"] for c in await db.mission_completions.find(
        {"user_id": uid, "date": today}).to_list(100)}

    # streak over last 7 days
    days = []
    labels = ["S", "S", "R", "K", "J", "S", "M"]
    streak = 0
    for i in range(6, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        cnt = await db.mission_completions.count_documents({"user_id": uid, "date": d})
        days.append({"label": labels[(date.today() - timedelta(days=i)).weekday()], "done": cnt > 0})
    # consecutive streak counting back from today
    for i in range(0, 60):
        d = (date.today() - timedelta(days=i)).isoformat()
        cnt = await db.mission_completions.count_documents({"user_id": uid, "date": d})
        if cnt > 0:
            streak += 1
        elif i == 0:
            continue
        else:
            break

    daily = [m for m in missions if m["kind"] == "daily"]
    earned = sum(m["points"] for m in daily if m["id"] in done_today)
    stages = [m for m in missions if m["kind"] == "stage"]

    def clean(m):
        return {
            "id": m["id"], "title": m["title"], "desc": m["desc"],
            "points": m["points"], "icon": m.get("icon", "leaf"),
            "done": m["id"] in done_today,
        }

    return {
        "streak": streak,
        "days": days,
        "earned": earned,
        "daily_total": sum(m["points"] for m in daily),
        "daily": [clean(m) for m in daily],
        "stages": [{"id": s["id"], "title": s["title"], "step": s["order"], "status": s.get("status", "locked")} for s in stages],
    }

@api.post("/warga/missions/complete")
async def complete_mission(body: MissionCompleteIn, user: dict = Depends(get_current_user)):
    uid = user["id"]
    mission = await db.missions.find_one({"id": body.mission_id})
    if not mission:
        raise HTTPException(status_code=404, detail="Misi tidak ditemukan")
    today = date.today().isoformat()
    existing = await db.mission_completions.find_one(
        {"user_id": uid, "mission_id": body.mission_id, "date": today})
    if existing:
        raise HTTPException(status_code=400, detail="Misi ini sudah selesai hari ini")
    await db.mission_completions.insert_one({
        "id": str(uuid.uuid4()), "user_id": uid, "mission_id": body.mission_id,
        "date": today, "created_at": now_iso(),
    })
    await db.users.update_one({"id": uid}, {"$inc": {"points": mission["points"]}})
    u = await db.users.find_one({"id": uid})
    return {"ok": True, "points": u["points"], "earned": mission["points"]}

@api.get("/warga/schedule")
async def warga_schedule(user: dict = Depends(get_current_user)):
    uid = user["id"]
    schedules = await db.schedules.find(
        {"rt": user["rt"], "rw": user["rw"]}).sort("date", 1).to_list(60)
    confs = {c["schedule_id"] for c in await db.pickup_confirmations.find({"user_id": uid}).to_list(200)}
    out = []
    for s in schedules:
        out.append({
            "id": s["id"], "date": s["date"], "label": s["label"], "dow": s["dow"],
            "type": s["type"], "time": s["time"], "tip": s["tip"],
            "petugas": s.get("petugas", "Petugas RW"),
            "confirmed": s["id"] in confs,
        })
    return {"member_code": user["member_code"], "rt": user["rt"], "rw": user["rw"], "schedules": out}

@api.post("/warga/schedule/confirm")
async def confirm_pickup(body: ConfirmPickupIn, user: dict = Depends(get_current_user)):
    uid = user["id"]
    s = await db.schedules.find_one({"id": body.schedule_id})
    if not s:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan")
    existing = await db.pickup_confirmations.find_one({"user_id": uid, "schedule_id": body.schedule_id})
    if existing:
        await db.pickup_confirmations.delete_one({"id": existing["id"]})
        return {"confirmed": False}
    await db.pickup_confirmations.insert_one({
        "id": str(uuid.uuid4()), "user_id": uid, "schedule_id": body.schedule_id,
        "created_at": now_iso(),
    })
    return {"confirmed": True}

@api.get("/warga/catalog")
async def warga_catalog(user: dict = Depends(get_current_user)):
    items = await db.catalog.find({}).sort("points", 1).to_list(100)
    out = [{"id": i["id"], "name": i["name"], "sub": i["sub"], "points": i["points"],
            "category": i["category"], "how": i["how"], "stock": i.get("stock", 99)} for i in items]
    return {"points": user["points"], "items": out}

@api.post("/warga/redeem")
async def redeem(body: RedeemIn, user: dict = Depends(get_current_user)):
    uid = user["id"]
    item = await db.catalog.find_one({"id": body.item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")
    if user["points"] < item["points"]:
        raise HTTPException(status_code=400, detail="Poin tidak cukup")
    await db.users.update_one({"id": uid}, {"$inc": {"points": -item["points"]}})
    red = {
        "id": str(uuid.uuid4()), "user_id": uid, "item_id": item["id"],
        "item_name": item["name"], "points": item["points"], "how": item["how"],
        "status": "berhasil", "created_at": now_iso(),
    }
    await db.redemptions.insert_one(red)
    u = await db.users.find_one({"id": uid})
    return {"ok": True, "points": u["points"], "redemption": {k: v for k, v in red.items() if k != "_id"}}

@api.get("/warga/history")
async def warga_history(user: dict = Depends(get_current_user)):
    uid = user["id"]
    txns = await db.weigh_txns.find({"warga_id": uid}).sort("created_at", -1).to_list(100)
    reds = await db.redemptions.find({"user_id": uid}).sort("created_at", -1).to_list(100)
    history = []
    for t in txns:
        history.append({"type": "setoran", "date": t["created_at"],
                        "points": t["total_points"], "detail": t.get("summary", "Setoran sampah")})
    for r in reds:
        history.append({"type": "tukar", "date": r["created_at"],
                        "points": -r["points"], "detail": r["item_name"]})
    history.sort(key=lambda x: x["date"], reverse=True)
    return {"history": history}

# ================================================================ PETUGAS
@api.get("/petugas/warga/{member_code}")
async def petugas_find(member_code: str, petugas: dict = Depends(require_petugas)):
    w = await db.users.find_one({"member_code": member_code, "role": "warga"})
    if not w:
        raise HTTPException(status_code=404, detail="Warga tidak ditemukan")
    return {"id": w["id"], "name": w["name"], "member_code": w["member_code"],
            "rt": w["rt"], "rw": w["rw"], "points": w["points"], "phone": w["phone"]}

@api.get("/petugas/rates")
async def petugas_rates(petugas: dict = Depends(require_petugas)):
    return {"rates": RATES, "labels": RATE_LABEL, "colors": TYPE_COLOR}

@api.post("/petugas/weigh")
async def petugas_weigh(body: WeighIn, petugas: dict = Depends(require_petugas)):
    w = await db.users.find_one({"member_code": body.member_code, "role": "warga"})
    if not w:
        raise HTTPException(status_code=404, detail="Warga tidak ditemukan")
    items = []
    base_points = 0
    kg_total = 0.0
    eco_total = 0
    for it in body.items:
        rate = RATES.get(it.type, 0)
        pts = int(round(it.value * rate))
        base_points += pts
        if it.type == "ecobrick":
            eco_total += int(it.value)
        else:
            kg_total += it.value
        items.append({"type": it.type, "value": it.value, "unit": it.unit, "points": pts})
    bonus = int(round(base_points * 0.10)) if body.clean_bonus else 0
    total = base_points + bonus
    summary = f"{round(kg_total,1)} kg + {eco_total} ecobrick"
    txn = {
        "id": str(uuid.uuid4()), "warga_id": w["id"], "member_code": body.member_code,
        "warga_name": w["name"], "petugas_id": petugas["id"], "petugas_name": petugas["name"],
        "items": items, "clean_bonus": body.clean_bonus, "bonus_points": bonus,
        "base_points": base_points, "total_points": total, "summary": summary,
        "created_at": now_iso(),
    }
    await db.weigh_txns.insert_one(txn)
    await db.users.update_one({"id": w["id"]}, {"$inc": {"points": total}})
    return {"ok": True, "total_points": total, "bonus_points": bonus,
            "warga_name": w["name"], "summary": summary}

@api.get("/petugas/today")
async def petugas_today(petugas: dict = Depends(require_petugas)):
    today = date.today().isoformat()
    txns = await db.weigh_txns.find(
        {"petugas_id": petugas["id"], "created_at": {"$gte": today}}
    ).sort("created_at", -1).to_list(200)
    out = [{"id": t["id"], "warga_name": t["warga_name"], "member_code": t["member_code"],
            "total_points": t["total_points"], "summary": t["summary"],
            "created_at": t["created_at"]} for t in txns]
    total_points = sum(t["total_points"] for t in txns)
    return {"count": len(out), "total_points": total_points, "transactions": out}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------- seed
async def seed():
    # indexes
    await db.users.create_index([("phone", 1), ("role", 1)])
    await db.users.create_index("member_code")

    # petugas account
    pp = os.environ["SEED_PETUGAS_PHONE"]
    if not await db.users.find_one({"phone": pp, "role": "petugas"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "name": "Pak Budi (Petugas)", "phone": pp,
            "pin_hash": hash_pin(os.environ["SEED_PETUGAS_PIN"]), "role": "petugas",
            "rt": "03", "rw": "05", "kelurahan": "Kelurahan Harapan",
            "member_code": "PTG-0503-01", "points": 0, "created_at": now_iso(),
        })

    # sample warga
    wp = os.environ["SEED_WARGA_PHONE"]
    warga = await db.users.find_one({"phone": wp, "role": "warga"})
    if not warga:
        warga = {
            "id": str(uuid.uuid4()), "name": "Bu Ratna", "phone": wp,
            "pin_hash": hash_pin(os.environ["SEED_WARGA_PIN"]), "role": "warga",
            "kabupaten": "Kota Padang", "kecamatan": "Padang Barat",
            "rt": "03", "rw": "05", "kelurahan": "Kelurahan Harapan",
            "member_code": "PLH-0503-0127", "points": 1240, "created_at": now_iso(),
        }
        await db.users.insert_one(warga)

    # missions
    if await db.missions.count_documents({}) == 0:
        missions = [
            # stages
            {"id": str(uuid.uuid4()), "kind": "stage", "order": 1, "title": "Sadar Pilah", "desc": "", "points": 0, "status": "done"},
            {"id": str(uuid.uuid4()), "kind": "stage", "order": 2, "title": "Tanam di Rumah", "desc": "", "points": 0, "status": "active"},
            {"id": str(uuid.uuid4()), "kind": "stage", "order": 3, "title": "Ecobrick", "desc": "", "points": 0, "status": "locked"},
            {"id": str(uuid.uuid4()), "kind": "stage", "order": 4, "title": "Setor Rutin", "desc": "", "points": 0, "status": "locked"},
            # daily
            {"id": str(uuid.uuid4()), "kind": "daily", "order": 10, "title": "Foto pilahan hari ini", "desc": "Unggah foto sampah yang sudah dipilah di rumah", "points": 10, "icon": "camera"},
            {"id": str(uuid.uuid4()), "kind": "daily", "order": 11, "title": "Siram tanaman kompos", "desc": "Rawat tanaman dengan kompos sisa dapur", "points": 5, "icon": "sprout"},
            {"id": str(uuid.uuid4()), "kind": "daily", "order": 12, "title": "Isi 1 ecobrick", "desc": "Padatkan plastik kering ke botol ecobrick", "points": 5, "icon": "bottle"},
        ]
        await db.missions.insert_many(missions)

    # catalog
    if await db.catalog.count_documents({}) == 0:
        await db.catalog.insert_many([
            {"id": str(uuid.uuid4()), "name": "Pupuk organik 5 kg", "sub": "Hasil olahan sampah warga", "points": 300, "category": "Kebun", "how": "Ambil di Balai RW saat jadwal jemput", "stock": 40},
            {"id": str(uuid.uuid4()), "name": "Bibit sayur paket", "sub": "5 jenis sayur dapur", "points": 180, "category": "Kebun", "how": "Ambil di Balai RW", "stock": 60},
            {"id": str(uuid.uuid4()), "name": "Pulsa Rp10.000", "sub": "Semua operator", "points": 500, "category": "Pulsa", "how": "Dikirim ke nomor HP terdaftar", "stock": 99},
            {"id": str(uuid.uuid4()), "name": "Token listrik Rp20.000", "sub": "PLN prabayar", "points": 900, "category": "Pulsa", "how": "Token dikirim via WhatsApp", "stock": 99},
            {"id": str(uuid.uuid4()), "name": "Sabun cuci isi ulang", "sub": "Kebutuhan rumah tangga", "points": 220, "category": "Rumah Tangga", "how": "Ambil di Bank Sampah RW", "stock": 30},
            {"id": str(uuid.uuid4()), "name": "Donasi kas RW", "sub": "Untuk kegiatan lingkungan", "points": 100, "category": "Donasi", "how": "Tercatat sebagai donasi atas namamu", "stock": 999},
        ])

    # schedules for current + next week (Mon..Sun)
    if await db.schedules.count_documents({}) == 0:
        dow_id = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]
        start = date.today() - timedelta(days=date.today().weekday())  # Monday
        sched = []
        # pattern: Tue & Thu organik, Sat anorganik
        for wk in range(0, 2):
            for i in range(7):
                d = start + timedelta(days=i + wk * 7)
                wd = d.weekday()
                if wd in (1, 3):  # Tue, Thu
                    t = "organik"
                    sched.append(_mk_sched(d, dow_id[wd], t))
                elif wd == 5:  # Sat
                    sched.append(_mk_sched(d, dow_id[wd], "anorganik"))
        await db.schedules.insert_many(sched)

    # a couple sample weigh txns for Bu Ratna (impact + history)
    if await db.weigh_txns.count_documents({"warga_id": warga["id"]}) == 0:
        await db.weigh_txns.insert_many([
            {"id": str(uuid.uuid4()), "warga_id": warga["id"], "member_code": warga["member_code"],
             "warga_name": warga["name"], "petugas_id": "seed", "petugas_name": "Pak Budi",
             "items": [{"type": "organik", "value": 12.5, "unit": "kg", "points": 125},
                       {"type": "anorganik", "value": 4.2, "unit": "kg", "points": 63}],
             "clean_bonus": True, "bonus_points": 19, "base_points": 188, "total_points": 207,
             "summary": "16.7 kg + 0 ecobrick",
             "created_at": (datetime.now(timezone.utc) - timedelta(days=4)).isoformat()},
            {"id": str(uuid.uuid4()), "warga_id": warga["id"], "member_code": warga["member_code"],
             "warga_name": warga["name"], "petugas_id": "seed", "petugas_name": "Pak Budi",
             "items": [{"type": "organik", "value": 6.0, "unit": "kg", "points": 60},
                       {"type": "ecobrick", "value": 4, "unit": "botol", "points": 80},
                       {"type": "anorganik", "value": 2.0, "unit": "kg", "points": 30}],
             "clean_bonus": False, "bonus_points": 0, "base_points": 170, "total_points": 170,
             "summary": "8.0 kg + 4 ecobrick",
             "created_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()},
        ])

    logger.info("Seed complete")

def _mk_sched(d: date, dow: str, t: str):
    tip = ("Taruh wadah hijau di depan rumah. Organik tanpa plastik."
           if t == "organik" else
           "Keluarkan sampah kering yang sudah dipisah — plastik, kertas, ecobrick.")
    return {
        "id": str(uuid.uuid4()), "rt": "03", "rw": "05",
        "date": d.isoformat(), "dow": dow,
        "label": _id_date(d),
        "type": t, "time": "07.00–09.00", "tip": tip, "petugas": "Pak Budi",
    }

_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
_HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
def _id_date(d: date):
    return f"{_HARI[d.weekday()]}, {d.day} {_BULAN[d.month-1]}"

@app.on_event("startup")
async def on_start():
    await seed()

@app.on_event("shutdown")
async def on_stop():
    client.close()
