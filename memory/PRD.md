# PilahIn — PRD

## Problem Statement
"buatkan sistem dengan import html dari claude diatas" — Build a working full-stack system from an imported Claude HTML prototype: **PilahIn**, a community waste-management app (pengelolaan sampah masyarakat), UI in Bahasa Indonesia.

## User Choices (confirmed)
- Auth: phone number + PIN (custom JWT)
- Roles: Warga (citizen) + Petugas (officer) — admin panel deferred
- Sample data auto-seeded
- Redemption/weighing stored internally; real pulsa/payment integration deferred (user will explain later)
- UI language: Bahasa Indonesia, design faithful to the prototype

## Architecture
- Frontend: React 19 + react-router v7, inline-style design system (green #1F5C3F, Bricolage Grotesque + Plus Jakarta Sans), sonner toasts, lucide-react icons. Mobile-first 390px shell centered on desktop.
- Backend: FastAPI, JWT (Bearer in localStorage), bcrypt PIN hashing. All routes under /api.
- DB: MongoDB (uuid string ids). Collections: users, missions, mission_completions, schedules, pickup_confirmations, catalog, redemptions, weigh_txns.

## User Personas
- **Warga (Bu Ratna)**: sorts waste at home, earns points, confirms pickups, completes missions, redeems rewards.
- **Petugas (Pak Budi)**: scans member code, weighs waste per category, applies clean-sort bonus, saves setoran crediting points.

## Core Requirements (static)
1. Phone+PIN login/register, role-based routing & guards.
2. Warga: dashboard (saldo poin, dampak bulanan, batch pupuk, next pickup), misi harian + streak + tahapan, jadwal jemput + konfirmasi + QR anggota, tukar poin katalog + konfirmasi, riwayat poin.
3. Petugas: cari warga by member code, timbang (organik/anorganik/ecobrick/residu) dengan stepper, bonus pilah bersih 10%, simpan setoran → kredit poin, daftar setoran hari ini.

## Implemented (2026-06-08)
- Full auth (register/login/me) phone+PIN JWT, seeded petugas + warga.
- All warga screens (Beranda, Misi, Jemput, TukarPoin) wired to live APIs.
- Full petugas weigh flow with points economics (organik 10, anorganik 15, ecobrick 20 poin; +10% clean bonus).
- Seed: 2 accounts, 3 daily missions + 4 stages, 6 catalog items, 2-week pickup schedule, sample setoran history.
- Verified: 24/24 backend pytest + full frontend E2E, 100% pass.

## Backlog
- P1: Real pulsa/payment integration for redemption (Stripe/Midtrans/pulsa provider) — pending user details.
- P1: Pengelola/Admin desktop panel (ringkasan, warga & KK, jadwal & rute, batch & pengiriman, katalog, siaran WA, laporan).
- P2: Photo upload for "Foto pilahan" mission (object storage).
- P2: WhatsApp reminders/receipts (Twilio) — currently simulated text.
- P2: Login rate-limit/lockout; petugas RT/RW scoping; Beranda loading skeletons.

## Next Tasks
1. Clarify & integrate real reward fulfilment (pulsa/payment).
2. Build Pengelola admin dashboard.
3. Add photo evidence for missions.
