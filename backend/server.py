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
    if user.get("active") is False:
        raise HTTPException(status_code=401, detail="Akun dinonaktifkan. Hubungi pengelola.")
    return user

async def require_petugas(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "petugas":
        raise HTTPException(status_code=403, detail="Hanya untuk petugas")
    return user

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Hanya untuk pengelola")
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
    as_admin: bool = False

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
    role = "admin" if body.as_admin else ("petugas" if body.as_petugas else "warga")
    user = await db.users.find_one({"phone": body.phone.strip(), "role": role})
    if not user or not verify_pin(body.pin, user["pin_hash"]):
        raise HTTPException(status_code=401, detail="Nomor HP atau PIN salah")
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Akun dinonaktifkan. Hubungi pengelola.")
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
    items = await db.catalog.find({"active": {"$ne": False}}).sort("points", 1).to_list(100)
    out = [{"id": i["id"], "name": i["name"], "sub": i["sub"], "points": i["points"],
            "category": i["category"], "how": i["how"], "stock": i.get("stock", 99)} for i in items]
    return {"points": user["points"], "items": out}

@api.post("/warga/redeem")
async def redeem(body: RedeemIn, user: dict = Depends(get_current_user)):
    uid = user["id"]
    item = await db.catalog.find_one({"id": body.item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")
    if item.get("active") is False:
        raise HTTPException(status_code=400, detail="Item sedang tidak tersedia")
    if user["points"] < item["points"]:
        raise HTTPException(status_code=400, detail="Poin tidak cukup")
    stock_res = await db.catalog.update_one(
        {"id": item["id"], "stock": {"$gt": 0}}, {"$inc": {"stock": -1}})
    if stock_res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Stok habis")
    await db.users.update_one({"id": uid}, {"$inc": {"points": -item["points"]}})
    red = {
        "id": str(uuid.uuid4()), "user_id": uid, "item_id": item["id"],
        "item_name": item["name"], "points": item["points"], "how": item["how"],
        "user_name": user["name"], "member_code": user.get("member_code"), "phone": user["phone"],
        "rt": user.get("rt"), "rw": user.get("rw"),
        "status": "menunggu", "note": "", "created_at": now_iso(), "updated_at": now_iso(),
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
        st = r.get("status", "selesai")
        history.append({"type": "tukar", "date": r["created_at"],
                        "points": -r["points"], "detail": r["item_name"], "status": st})
        if st == "ditolak":
            history.append({"type": "refund", "date": r.get("updated_at", r["created_at"]),
                            "points": r["points"], "detail": f"Pengembalian: {r['item_name']}"})
    adjs = await db.point_adjustments.find({"user_id": uid}).sort("created_at", -1).to_list(100)
    for a in adjs:
        history.append({"type": "penyesuaian", "date": a["created_at"],
                        "points": a["delta"], "detail": a.get("reason") or "Penyesuaian poin"})
    history.sort(key=lambda x: x["date"], reverse=True)
    return {"history": history}

# ================================================================ PETUGAS
@api.get("/petugas/warga/{member_code}")
async def petugas_find(member_code: str, petugas: dict = Depends(require_petugas)):
    w = await db.users.find_one({"member_code": member_code, "role": "warga"})
    if not w:
        raise HTTPException(status_code=404, detail="Warga tidak ditemukan")
    if w.get("active") is False:
        raise HTTPException(status_code=400, detail="Akun warga ini dinonaktifkan")
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
    if w.get("active") is False:
        raise HTTPException(status_code=400, detail="Akun warga ini dinonaktifkan")
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

# ================================================================ ADMIN (PENGELOLA)
import csv as _csv
import io as _io
from fastapi.responses import StreamingResponse

class WargaUpdateIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    kabupaten: Optional[str] = None
    kecamatan: Optional[str] = None
    kelurahan: Optional[str] = None
    rt: Optional[str] = None
    rw: Optional[str] = None
    active: Optional[bool] = None

class PointAdjustIn(BaseModel):
    delta: int
    reason: str = ""

class ResetPinIn(BaseModel):
    pin: str

class PetugasCreateIn(BaseModel):
    name: str
    phone: str
    pin: str
    rt: str = ""
    rw: str = ""
    kelurahan: str = ""

class PetugasUpdateIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    rt: Optional[str] = None
    rw: Optional[str] = None
    kelurahan: Optional[str] = None
    active: Optional[bool] = None

class CatalogIn(BaseModel):
    name: str
    sub: str = ""
    points: int
    category: str
    how: str = ""
    stock: int = 0
    active: bool = True

class ScheduleIn(BaseModel):
    date: str            # YYYY-MM-DD
    type: str            # organik | anorganik | residu | ecobrick
    time: str = "07.00–09.00"
    tip: str = ""
    petugas: str = ""
    rt: str
    rw: str

class RedemptionUpdateIn(BaseModel):
    status: str          # diproses | selesai | ditolak
    note: str = ""

RED_STATUSES = ["menunggu", "diproses", "selesai", "ditolak"]
RED_TRANSITIONS = {"menunggu": {"diproses", "selesai", "ditolak"}, "diproses": {"selesai", "ditolak"}}
SCHED_TYPES = {"organik", "anorganik", "residu", "ecobrick"}


def _clean(d: dict) -> dict:
    d = dict(d)
    d.pop("_id", None)
    d.pop("pin_hash", None)
    return d

def _date_range(q: dict, field: str, frm: Optional[str], to: Optional[str]):
    rng = {}
    if frm:
        rng["$gte"] = frm
    if to:
        try:
            rng["$lt"] = (date.fromisoformat(to) + timedelta(days=1)).isoformat()
        except ValueError:
            raise HTTPException(status_code=400, detail="Format tanggal tidak valid (YYYY-MM-DD)")
    if rng:
        q[field] = rng
    return q

def _csv_response(headers: list, rows: list, filename: str):
    buf = _io.StringIO()
    buf.write("\ufeff")  # BOM so Excel reads UTF-8
    w = _csv.writer(buf)
    w.writerow(headers)
    for r in rows:
        w.writerow(r)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

def _regex(q: str):
    import re
    return {"$regex": re.escape(q.strip()), "$options": "i"}

def _txn_kg(t: dict):
    out = {"organik": 0.0, "anorganik": 0.0, "residu": 0.0, "ecobrick": 0}
    for it in t.get("items", []):
        if it["type"] in out:
            out[it["type"]] += it["value"]
    return out


# ---------------------------------------------------------------- summary
@api.get("/admin/summary")
async def admin_summary(admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    warga_total = await db.users.count_documents({"role": "warga"})
    warga_active = await db.users.count_documents({"role": "warga", "active": {"$ne": False}})
    petugas_total = await db.users.count_documents({"role": "petugas"})
    agg = await db.users.aggregate([
        {"$match": {"role": "warga"}}, {"$group": {"_id": None, "s": {"$sum": "$points"}}}
    ]).to_list(1)
    points_outstanding = agg[0]["s"] if agg else 0
    new_warga_month = await db.users.count_documents({"role": "warga", "created_at": {"$gte": month_start}})

    month_txns = await db.weigh_txns.find({"created_at": {"$gte": month_start}}).to_list(10000)
    m = {"organik": 0.0, "anorganik": 0.0, "residu": 0.0, "ecobrick": 0}
    for t in month_txns:
        for k, v in _txn_kg(t).items():
            m[k] += v
    points_issued = sum(t["total_points"] for t in month_txns)

    # last 14 days series
    start14 = (date.today() - timedelta(days=13))
    recent = await db.weigh_txns.find({"created_at": {"$gte": start14.isoformat()}}).to_list(10000)
    series = {}
    for i in range(14):
        d = (start14 + timedelta(days=i)).isoformat()
        series[d] = {"date": d, "label": f"{(start14 + timedelta(days=i)).day} {_BULAN[(start14 + timedelta(days=i)).month-1]}",
                     "organik": 0.0, "anorganik": 0.0, "ecobrick": 0, "setoran": 0}
    for t in recent:
        d = t["created_at"][:10]
        if d in series:
            kg = _txn_kg(t)
            series[d]["organik"] = round(series[d]["organik"] + kg["organik"], 1)
            series[d]["anorganik"] = round(series[d]["anorganik"] + kg["anorganik"], 1)
            series[d]["ecobrick"] += int(kg["ecobrick"])
            series[d]["setoran"] += 1

    red_pending = await db.redemptions.count_documents({"status": {"$in": ["menunggu", "diproses"]}})
    red_month = await db.redemptions.count_documents({"created_at": {"$gte": month_start}})

    top = await db.users.find({"role": "warga"}).sort("points", -1).limit(5).to_list(5)
    recent_set = await db.weigh_txns.find({}).sort("created_at", -1).limit(6).to_list(6)
    upcoming = await db.schedules.find({"date": {"$gte": date.today().isoformat()}}).sort("date", 1).limit(5).to_list(5)

    return {
        "warga_total": warga_total, "warga_active": warga_active, "petugas_total": petugas_total,
        "new_warga_month": new_warga_month, "points_outstanding": points_outstanding,
        "month": {
            "setoran": len(month_txns), "organik": round(m["organik"], 1), "anorganik": round(m["anorganik"], 1),
            "residu": round(m["residu"], 1), "ecobrick": int(m["ecobrick"]), "points_issued": points_issued,
            "total_kg": round(m["organik"] + m["anorganik"] + m["residu"], 1),
        },
        "redemptions_pending": red_pending, "redemptions_month": red_month,
        "series": list(series.values()),
        "top_warga": [{"id": u["id"], "name": u["name"], "member_code": u.get("member_code"),
                       "rt": u.get("rt"), "rw": u.get("rw"), "points": u["points"]} for u in top],
        "recent_setoran": [{"id": t["id"], "warga_name": t["warga_name"], "petugas_name": t["petugas_name"],
                            "summary": t["summary"], "total_points": t["total_points"],
                            "created_at": t["created_at"]} for t in recent_set],
        "upcoming": [{"id": s["id"], "date": s["date"], "label": s["label"], "type": s["type"],
                      "time": s["time"], "rt": s["rt"], "rw": s["rw"], "petugas": s.get("petugas", "")} for s in upcoming],
    }


# ---------------------------------------------------------------- warga
def _warga_query(q: Optional[str], status: Optional[str], rw: Optional[str], rt: Optional[str]):
    query = {"role": "warga"}
    if q:
        rx = _regex(q)
        query["$or"] = [{"name": rx}, {"phone": rx}, {"member_code": rx}]
    if status == "active":
        query["active"] = {"$ne": False}
    elif status == "inactive":
        query["active"] = False
    if rw:
        query["rw"] = rw
    if rt:
        query["rt"] = rt
    return query

@api.get("/admin/warga")
async def admin_warga_list(q: Optional[str] = None, status: Optional[str] = None,
                           rw: Optional[str] = None, rt: Optional[str] = None,
                           page: int = 1, limit: int = 20, admin: dict = Depends(require_admin)):
    query = _warga_query(q, status, rw, rt)
    limit = max(1, min(limit, 100))
    page = max(1, page)
    total = await db.users.count_documents(query)
    users = await db.users.find(query, {"_id": 0, "pin_hash": 0}).sort("created_at", -1) \
        .skip((page - 1) * limit).limit(limit).to_list(limit)
    ids = [u["id"] for u in users]
    stats = {s["_id"]: s for s in await db.weigh_txns.aggregate([
        {"$match": {"warga_id": {"$in": ids}}},
        {"$group": {"_id": "$warga_id", "count": {"$sum": 1}, "last": {"$max": "$created_at"}}},
    ]).to_list(len(ids) or 1)}
    for u in users:
        s = stats.get(u["id"])
        u["active"] = u.get("active", True)
        u["setoran_count"] = s["count"] if s else 0
        u["last_setoran"] = s["last"] if s else None
    return {"items": users, "total": total, "page": page, "limit": limit}

@api.get("/admin/warga/export")
async def admin_warga_export(q: Optional[str] = None, status: Optional[str] = None,
                             rw: Optional[str] = None, rt: Optional[str] = None,
                             admin: dict = Depends(require_admin)):
    users = await db.users.find(_warga_query(q, status, rw, rt)).sort("created_at", -1).to_list(20000)
    rows = [[u.get("member_code", ""), u["name"], u["phone"], u.get("kabupaten", ""), u.get("kecamatan", ""),
             u.get("kelurahan", ""), u.get("rt", ""), u.get("rw", ""), u.get("points", 0),
             "Aktif" if u.get("active", True) else "Nonaktif", u.get("created_at", "")[:10]] for u in users]
    return _csv_response(["Kode Anggota", "Nama", "No HP", "Kabupaten/Kota", "Kecamatan", "Kelurahan/Nagari",
                          "RT", "RW", "Poin", "Status", "Terdaftar"], rows, "warga.csv")

@api.get("/admin/warga/{uid}")
async def admin_warga_detail(uid: str, admin: dict = Depends(require_admin)):
    u = await db.users.find_one({"id": uid, "role": "warga"}, {"_id": 0, "pin_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Warga tidak ditemukan")
    u["active"] = u.get("active", True)
    txns = await db.weigh_txns.find({"warga_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(50)
    reds = await db.redemptions.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(50)
    adjs = await db.point_adjustments.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"user": u, "setoran": txns, "redemptions": reds, "adjustments": adjs}

@api.patch("/admin/warga/{uid}")
async def admin_warga_update(uid: str, body: WargaUpdateIn, admin: dict = Depends(require_admin)):
    u = await db.users.find_one({"id": uid, "role": "warga"})
    if not u:
        raise HTTPException(status_code=404, detail="Warga tidak ditemukan")
    upd = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump().items() if v is not None}
    if "name" in upd and not upd["name"]:
        raise HTTPException(status_code=400, detail="Nama wajib diisi")
    if "phone" in upd:
        if not upd["phone"]:
            raise HTTPException(status_code=400, detail="Nomor HP wajib diisi")
        dup = await db.users.find_one({"phone": upd["phone"], "role": "warga", "id": {"$ne": uid}})
        if dup:
            raise HTTPException(status_code=400, detail="Nomor HP sudah dipakai warga lain")
    if upd:
        upd["updated_at"] = now_iso()
        await db.users.update_one({"id": uid}, {"$set": upd})
    out = await db.users.find_one({"id": uid}, {"_id": 0, "pin_hash": 0})
    out["active"] = out.get("active", True)
    return out

@api.post("/admin/warga/{uid}/points")
async def admin_warga_points(uid: str, body: PointAdjustIn, admin: dict = Depends(require_admin)):
    u = await db.users.find_one({"id": uid, "role": "warga"})
    if not u:
        raise HTTPException(status_code=404, detail="Warga tidak ditemukan")
    if body.delta == 0:
        raise HTTPException(status_code=400, detail="Jumlah poin tidak boleh 0")
    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="Alasan wajib diisi")
    if u["points"] + body.delta < 0:
        raise HTTPException(status_code=400, detail="Saldo poin tidak boleh minus")
    await db.users.update_one({"id": uid}, {"$inc": {"points": body.delta}})
    adj = {"id": str(uuid.uuid4()), "user_id": uid, "user_name": u["name"], "delta": body.delta,
           "reason": body.reason.strip(), "admin_id": admin["id"], "admin_name": admin["name"],
           "balance_before": u["points"], "balance_after": u["points"] + body.delta, "created_at": now_iso()}
    await db.point_adjustments.insert_one(adj)
    adj.pop("_id", None)
    return {"ok": True, "points": u["points"] + body.delta, "adjustment": adj}

@api.post("/admin/users/{uid}/reset-pin")
async def admin_reset_pin(uid: str, body: ResetPinIn, admin: dict = Depends(require_admin)):
    u = await db.users.find_one({"id": uid, "role": {"$in": ["warga", "petugas"]}})
    if not u:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    if len(body.pin) < 4 or not body.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN minimal 4 digit angka")
    await db.users.update_one({"id": uid}, {"$set": {"pin_hash": hash_pin(body.pin), "updated_at": now_iso()}})
    return {"ok": True}


# ---------------------------------------------------------------- petugas
@api.get("/admin/petugas")
async def admin_petugas_list(admin: dict = Depends(require_admin)):
    ps = await db.users.find({"role": "petugas"}, {"_id": 0, "pin_hash": 0}).sort("created_at", 1).to_list(500)
    today = date.today().isoformat()
    month_start = date.today().replace(day=1).isoformat()
    for p in ps:
        p["active"] = p.get("active", True)
        p["setoran_today"] = await db.weigh_txns.count_documents({"petugas_id": p["id"], "created_at": {"$gte": today}})
        p["setoran_month"] = await db.weigh_txns.count_documents({"petugas_id": p["id"], "created_at": {"$gte": month_start}})
        p["setoran_total"] = await db.weigh_txns.count_documents({"petugas_id": p["id"]})
    return {"items": ps}

@api.post("/admin/petugas")
async def admin_petugas_create(body: PetugasCreateIn, admin: dict = Depends(require_admin)):
    phone = body.phone.strip()
    if not body.name.strip() or not phone:
        raise HTTPException(status_code=400, detail="Nama dan nomor HP wajib diisi")
    if len(body.pin) < 4 or not body.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN minimal 4 digit angka")
    if await db.users.find_one({"phone": phone, "role": "petugas"}):
        raise HTTPException(status_code=400, detail="Nomor HP sudah terdaftar sebagai petugas")
    n = await db.users.count_documents({"role": "petugas"}) + 1
    p = {
        "id": str(uuid.uuid4()), "name": body.name.strip(), "phone": phone,
        "pin_hash": hash_pin(body.pin), "role": "petugas",
        "rt": body.rt.strip(), "rw": body.rw.strip(), "kelurahan": body.kelurahan.strip(),
        "member_code": f"PTG-{body.rw.strip()}{body.rt.strip()}-{n:02d}", "points": 0,
        "active": True, "created_at": now_iso(),
    }
    await db.users.insert_one(p)
    return _clean(p)

@api.patch("/admin/petugas/{uid}")
async def admin_petugas_update(uid: str, body: PetugasUpdateIn, admin: dict = Depends(require_admin)):
    p = await db.users.find_one({"id": uid, "role": "petugas"})
    if not p:
        raise HTTPException(status_code=404, detail="Petugas tidak ditemukan")
    upd = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump().items() if v is not None}
    if "name" in upd and not upd["name"]:
        raise HTTPException(status_code=400, detail="Nama wajib diisi")
    if "phone" in upd:
        if not upd["phone"]:
            raise HTTPException(status_code=400, detail="Nomor HP wajib diisi")
        if await db.users.find_one({"phone": upd["phone"], "role": "petugas", "id": {"$ne": uid}}):
            raise HTTPException(status_code=400, detail="Nomor HP sudah dipakai petugas lain")
    if upd:
        upd["updated_at"] = now_iso()
        await db.users.update_one({"id": uid}, {"$set": upd})
    out = await db.users.find_one({"id": uid}, {"_id": 0, "pin_hash": 0})
    out["active"] = out.get("active", True)
    return out


# ---------------------------------------------------------------- catalog
@api.get("/admin/catalog")
async def admin_catalog_list(admin: dict = Depends(require_admin)):
    items = await db.catalog.find({}, {"_id": 0}).sort("points", 1).to_list(500)
    for i in items:
        i["active"] = i.get("active", True)
        i["redeemed"] = await db.redemptions.count_documents({"item_id": i["id"], "status": {"$ne": "ditolak"}})
    return {"items": items}

def _validate_catalog(body: CatalogIn):
    if not body.name.strip() or not body.category.strip():
        raise HTTPException(status_code=400, detail="Nama dan kategori wajib diisi")
    if body.points <= 0:
        raise HTTPException(status_code=400, detail="Poin harus lebih dari 0")
    if body.stock < 0:
        raise HTTPException(status_code=400, detail="Stok tidak boleh minus")

@api.post("/admin/catalog")
async def admin_catalog_create(body: CatalogIn, admin: dict = Depends(require_admin)):
    _validate_catalog(body)
    item = {"id": str(uuid.uuid4()), **{k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump().items()},
            "created_at": now_iso()}
    await db.catalog.insert_one(item)
    return _clean(item)

@api.put("/admin/catalog/{iid}")
async def admin_catalog_update(iid: str, body: CatalogIn, admin: dict = Depends(require_admin)):
    _validate_catalog(body)
    res = await db.catalog.update_one({"id": iid}, {"$set": {
        **{k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump().items()},
        "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")
    return await db.catalog.find_one({"id": iid}, {"_id": 0})

@api.delete("/admin/catalog/{iid}")
async def admin_catalog_delete(iid: str, admin: dict = Depends(require_admin)):
    res = await db.catalog.delete_one({"id": iid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")
    return {"ok": True}


# ---------------------------------------------------------------- schedules
def _sched_doc(body: ScheduleIn) -> dict:
    if body.type not in SCHED_TYPES:
        raise HTTPException(status_code=400, detail="Jenis sampah tidak valid")
    if not body.rt.strip() or not body.rw.strip():
        raise HTTPException(status_code=400, detail="RT dan RW wajib diisi")
    try:
        d = date.fromisoformat(body.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Tanggal tidak valid")
    dow_id = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]
    tip = body.tip.strip() or (
        "Taruh wadah hijau di depan rumah. Organik tanpa plastik." if body.type == "organik"
        else "Keluarkan sampah kering yang sudah dipisah — plastik, kertas, ecobrick.")
    return {"date": d.isoformat(), "dow": dow_id[d.weekday()], "label": _id_date(d), "type": body.type,
            "time": body.time.strip() or "07.00–09.00", "tip": tip,
            "petugas": body.petugas.strip() or "Petugas RW", "rt": body.rt.strip(), "rw": body.rw.strip()}

@api.get("/admin/schedules")
async def admin_schedules(frm: Optional[str] = None, to: Optional[str] = None,
                          rt: Optional[str] = None, rw: Optional[str] = None,
                          admin: dict = Depends(require_admin)):
    q = {}
    if frm:
        q.setdefault("date", {})["$gte"] = frm
    if to:
        q.setdefault("date", {})["$lte"] = to
    if rt:
        q["rt"] = rt
    if rw:
        q["rw"] = rw
    items = await db.schedules.find(q, {"_id": 0}).sort([("date", 1), ("rw", 1), ("rt", 1)]).to_list(1000)
    for s in items:
        s["confirmed_count"] = await db.pickup_confirmations.count_documents({"schedule_id": s["id"]})
    return {"items": items}

@api.post("/admin/schedules")
async def admin_schedule_create(body: ScheduleIn, admin: dict = Depends(require_admin)):
    doc = {"id": str(uuid.uuid4()), **_sched_doc(body), "created_at": now_iso()}
    await db.schedules.insert_one(doc)
    return _clean(doc)

@api.put("/admin/schedules/{sid}")
async def admin_schedule_update(sid: str, body: ScheduleIn, admin: dict = Depends(require_admin)):
    res = await db.schedules.update_one({"id": sid}, {"$set": {**_sched_doc(body), "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan")
    return await db.schedules.find_one({"id": sid}, {"_id": 0})

@api.delete("/admin/schedules/{sid}")
async def admin_schedule_delete(sid: str, admin: dict = Depends(require_admin)):
    res = await db.schedules.delete_one({"id": sid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan")
    await db.pickup_confirmations.delete_many({"schedule_id": sid})
    return {"ok": True}


# ---------------------------------------------------------------- setoran (weigh txns)
def _setoran_query(q, petugas_id, frm, to):
    query = {}
    if q:
        rx = _regex(q)
        query["$or"] = [{"warga_name": rx}, {"member_code": rx}, {"petugas_name": rx}]
    if petugas_id:
        query["petugas_id"] = petugas_id
    return _date_range(query, "created_at", frm, to)

@api.get("/admin/setoran")
async def admin_setoran(q: Optional[str] = None, petugas_id: Optional[str] = None,
                        frm: Optional[str] = None, to: Optional[str] = None,
                        page: int = 1, limit: int = 20, admin: dict = Depends(require_admin)):
    query = _setoran_query(q, petugas_id, frm, to)
    limit = max(1, min(limit, 100))
    page = max(1, page)
    all_txns = await db.weigh_txns.find(query, {"_id": 0}).sort("created_at", -1).to_list(20000)
    tot = {"organik": 0.0, "anorganik": 0.0, "residu": 0.0, "ecobrick": 0, "points": 0}
    for t in all_txns:
        kg = _txn_kg(t)
        for k in ("organik", "anorganik", "residu", "ecobrick"):
            tot[k] += kg[k]
        tot["points"] += t["total_points"]
    for k in ("organik", "anorganik", "residu"):
        tot[k] = round(tot[k], 1)
    tot["ecobrick"] = int(tot["ecobrick"])
    items = all_txns[(page - 1) * limit: page * limit]
    return {"items": items, "total": len(all_txns), "page": page, "limit": limit, "totals": tot}

@api.get("/admin/setoran/export")
async def admin_setoran_export(q: Optional[str] = None, petugas_id: Optional[str] = None,
                               frm: Optional[str] = None, to: Optional[str] = None,
                               admin: dict = Depends(require_admin)):
    txns = await db.weigh_txns.find(_setoran_query(q, petugas_id, frm, to)).sort("created_at", -1).to_list(50000)
    rows = []
    for t in txns:
        kg = _txn_kg(t)
        rows.append([t["created_at"][:19].replace("T", " "), t.get("member_code", ""), t["warga_name"],
                     t["petugas_name"], kg["organik"], kg["anorganik"], kg["residu"], int(kg["ecobrick"]),
                     t.get("base_points", 0), t.get("bonus_points", 0), t["total_points"]])
    return _csv_response(["Waktu (UTC)", "Kode Anggota", "Warga", "Petugas", "Organik (kg)", "Anorganik (kg)",
                          "Residu (kg)", "Ecobrick (botol)", "Poin Dasar", "Bonus", "Total Poin"],
                         rows, "laporan-setoran.csv")


# ---------------------------------------------------------------- redemptions
async def _enrich_reds(reds: list) -> list:
    missing = [r["user_id"] for r in reds if not r.get("user_name")]
    umap = {}
    if missing:
        umap = {u["id"]: u for u in await db.users.find({"id": {"$in": missing}}).to_list(len(missing))}
    for r in reds:
        r.pop("_id", None)
        if r.get("status") == "berhasil":
            r["status"] = "selesai"
        if not r.get("user_name") and r["user_id"] in umap:
            u = umap[r["user_id"]]
            r.update({"user_name": u["name"], "member_code": u.get("member_code"), "phone": u["phone"],
                      "rt": u.get("rt"), "rw": u.get("rw")})
    return reds

def _red_query(status, q, frm, to):
    query = {}
    if status and status != "semua":
        query["status"] = status
    if q:
        rx = _regex(q)
        query["$or"] = [{"user_name": rx}, {"member_code": rx}, {"item_name": rx}, {"phone": rx}]
    return _date_range(query, "created_at", frm, to)

@api.get("/admin/redemptions")
async def admin_redemptions(status: Optional[str] = None, q: Optional[str] = None,
                            frm: Optional[str] = None, to: Optional[str] = None,
                            page: int = 1, limit: int = 20, admin: dict = Depends(require_admin)):
    query = _red_query(status, q, frm, to)
    limit = max(1, min(limit, 100))
    page = max(1, page)
    total = await db.redemptions.count_documents(query)
    reds = await db.redemptions.find(query).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    counts = {s: await db.redemptions.count_documents({"status": s}) for s in RED_STATUSES}
    return {"items": await _enrich_reds(reds), "total": total, "page": page, "limit": limit, "counts": counts}

@api.get("/admin/redemptions/export")
async def admin_redemptions_export(status: Optional[str] = None, q: Optional[str] = None,
                                   frm: Optional[str] = None, to: Optional[str] = None,
                                   admin: dict = Depends(require_admin)):
    reds = await _enrich_reds(await db.redemptions.find(_red_query(status, q, frm, to)).sort("created_at", -1).to_list(50000))
    rows = [[r["created_at"][:19].replace("T", " "), r.get("member_code", ""), r.get("user_name", ""),
             r.get("phone", ""), r["item_name"], r["points"], r["status"], r.get("note", ""),
             r.get("processed_by", "")] for r in reds]
    return _csv_response(["Waktu (UTC)", "Kode Anggota", "Warga", "No HP", "Item", "Poin", "Status",
                          "Catatan", "Diproses oleh"], rows, "laporan-penukaran.csv")

@api.patch("/admin/redemptions/{rid}")
async def admin_redemption_update(rid: str, body: RedemptionUpdateIn, admin: dict = Depends(require_admin)):
    r = await db.redemptions.find_one({"id": rid})
    if not r:
        raise HTTPException(status_code=404, detail="Penukaran tidak ditemukan")
    cur = "selesai" if r.get("status") == "berhasil" else r.get("status", "menunggu")
    if body.status not in RED_TRANSITIONS.get(cur, set()):
        raise HTTPException(status_code=400, detail=f"Status '{cur}' tidak bisa diubah ke '{body.status}'")
    if body.status == "ditolak" and not body.note.strip():
        raise HTTPException(status_code=400, detail="Alasan penolakan wajib diisi")
    # atomic guard against double-processing
    res = await db.redemptions.update_one(
        {"id": rid, "status": r.get("status")},
        {"$set": {"status": body.status, "note": body.note.strip(), "processed_by": admin["name"],
                  "updated_at": now_iso()}})
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="Penukaran sudah diproses, muat ulang data")
    if body.status == "ditolak":
        await db.users.update_one({"id": r["user_id"]}, {"$inc": {"points": r["points"]}})
        await db.catalog.update_one({"id": r["item_id"]}, {"$inc": {"stock": 1}})
    out = await db.redemptions.find_one({"id": rid})
    return (await _enrich_reds([out]))[0]


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

    # admin / pengelola account
    ap = os.environ.get("SEED_ADMIN_PHONE")
    if ap and not await db.users.find_one({"phone": ap, "role": "admin"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "name": "Pengelola ANTIK", "phone": ap,
            "pin_hash": hash_pin(os.environ["SEED_ADMIN_PIN"]), "role": "admin",
            "points": 0, "active": True, "created_at": now_iso(),
        })
    # legacy redemption status
    await db.redemptions.update_many({"status": "berhasil"}, {"$set": {"status": "selesai"}})

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
