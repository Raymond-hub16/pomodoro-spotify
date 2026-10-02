# Pomodoro Timer + Spotify

Timer Pomodoro (focus, short break, long break) dengan playlist Spotify sebagai musik latar. Dibangun sesuai *Spec Build: Pomodoro Timer + Spotify (Next.js)*, milestone M1 sampai M8, untuk dijalankan di local.

- Timer tahan reload dan tahan tab di-background (sumber kebenaran `endsAt`, bukan hitung mundur)
- Notifikasi browser + chime saat pergantian fase, statistik fokus harian
- Login Spotify (Authorization Code), daftar playlist, pemutar di dalam tab (Premium) atau buka di aplikasi Spotify (Free)
- Musik otomatis pause saat break dan lanjut lagi saat focus berjalan
- Responsive, dark mode mengikuti sistem, shortcut `Space` / `R` / `S`

Timer berfungsi penuh tanpa Spotify. Kalau `.env.local` belum diisi, panel musik hanya menampilkan petunjuk setup.

## 1. Siapkan aplikasi di Spotify Developer Dashboard

1. Buka <https://developer.spotify.com/dashboard> → **Create app**.
2. **Redirect URI**: isi persis `http://127.0.0.1:3000/api/auth/callback`. Spotify menolak `localhost`, jadi harus `127.0.0.1`.
3. Centang **Web API** dan **Web Playback SDK**.
4. Buka **Settings** aplikasi, salin **Client ID** dan **Client secret**.
5. Di **User Management**, tambahkan email akun Spotify yang akan dipakai login (wajib selama aplikasi masih Development Mode).

> Perubahan Spotify sejak Februari 2026 untuk aplikasi Development Mode: pemilik aplikasi wajib Premium, batas user 5 (bukan 25 seperti di spec) untuk aplikasi baru, dan field `product` tidak lagi dikirim di `GET /me`. Lihat bagian *Penyesuaian terhadap spec* di bawah.
> Sumber: [February 2026 Web API Dev Mode Changes](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)

## 2. Isi environment

```bash
cp .env.example .env.local
openssl rand -base64 32   # tempel hasilnya ke SESSION_SECRET (minimal 32 karakter)
```

| Variabel | Isi |
| --- | --- |
| `SPOTIFY_CLIENT_ID` | Client ID dari dashboard |
| `SPOTIFY_CLIENT_SECRET` | Client secret dari dashboard (hanya dipakai di server) |
| `SPOTIFY_REDIRECT_URI` | `http://127.0.0.1:3000/api/auth/callback` |
| `SESSION_SECRET` | String acak ≥ 32 karakter untuk enkripsi cookie |
| `NEXT_PUBLIC_APP_URL` | `http://127.0.0.1:3000` |

## 3a. Jalankan dengan Docker

Butuh Docker Desktop / Docker Engine dengan Compose v2.24 atau lebih baru.

```bash
docker compose up --build
```

Buka **<http://127.0.0.1:3000>** (bukan `localhost`, karena cookie login terikat ke host yang terdaftar di Spotify; kalau terlanjur buka `localhost`, tombol login akan memindahkan ke `127.0.0.1` otomatis).

Env dibaca saat container jalan, tidak dibakar ke image. Setelah mengubah `.env.local`, cukup `docker compose up -d` lagi (tanpa rebuild). Stop dengan `docker compose down`.

## 3b. Jalankan tanpa Docker

Butuh Node.js 20.9+ (disarankan 22).

```bash
npm ci
npm run dev          # development, http://127.0.0.1:3000
# atau mode produksi:
npm run build && npm start
```

## Testing

```bash
npm test                         # 49 unit + integration test (Vitest)
npx playwright install chromium  # sekali saja
npm run test:e2e                 # build produksi + 5 test Playwright
npm run lint && npm run typecheck
```

- `src/lib/timer/engine.test.ts`: timer engine dengan fake timers (selesai tepat sekali, pause 10 menit, rehydrate 8 jam, 4 focus → long break, ubah durasi saat jalan, throttling 1×/menit tanpa drift, laptop sleep tidak mengejar fase).
- `src/stores/stores.test.ts`: localStorage korup → default tanpa throw, bentuk data per key, tick tidak menulis storage, reload melanjutkan sesi.
- `src/app/api/routes.test.ts`: route handler dengan `fetch` Spotify di-mock (state mismatch, access_denied, refresh sekali, dua request berbarengan = satu POST, refresh ditolak → `REFRESH_FAILED` + cookie dihapus, 429 + `Retry-After`, 404 → `NO_ACTIVE_DEVICE`, dll).
- `tests/e2e/happy-path.spec.ts`: satu jalur E2E dari spec (set focus 5 detik lewat Settings → start → notifikasi + short break).
- `tests/e2e/acceptance.spec.ts`: acceptance criteria yang bisa diotomasi (reload, tab di-background, akun Free tanpa console error, Premium dengan SDK palsu: play → auto-pause saat break → resume saat focus).

Spotify selalu di-stub di test; tidak ada panggilan ke API asli.

## Struktur

```
src/
  app/api/auth/{login,callback,logout,session}   OAuth + status sesi
  app/api/spotify/{token,me,playlists,play,transfer}
  components/{timer,settings,spotify,ui}
  lib/timer/        engine.ts (reducer murni), useTimerTick.ts (satu-satunya setInterval), stats, events
  lib/spotify/      session.ts (iron-session + refresh dedup), client.ts (server-only), schema.ts (Zod),
                    player.ts (controller Web Playback SDK di browser), api.ts (fetch ke route internal)
  lib/storage/      key localStorage bernomor versi + adapter tervalidasi Zod
  stores/           timerStore, settingsStore, spotifyStore, statsStore
  types/spotify-sdk.d.ts
```

## Penyesuaian terhadap spec

Hal-hal berikut berbeda dari teks spec, dengan alasannya. Stack dan versi library tidak diganti.

1. **`product` tidak ada lagi di `GET /me` (Development Mode).** Spec memakai field ini untuk memilih jalur Premium atau Free. Sekarang `product` bisa `null` → mode `unknown`: panel menampilkan tombol *Connect player*, dan kalau SDK memancarkan `account_error` (akun Free) app pindah ke jalur fallback. Jika `product` tersedia (aplikasi Extended Quota), perilakunya persis seperti spec: akun Free tidak pernah memuat SDK. Konsekuensi: pada aplikasi Development Mode, akun Free sempat memuat SDK sebelum jatuh ke fallback.
2. **Batas user 5**, bukan 25, untuk aplikasi Development Mode yang dibuat setelah Februari 2026, dan pemilik aplikasi wajib Premium.
3. **Field `playlist.tracks` diganti nama menjadi `items`** di Development Mode. Schema Zod menerima keduanya.
4. **`TimerSnapshot.durationMs`** ditambahkan: panjang sesi yang sedang berjalan. Dibutuhkan supaya perubahan settings tidak menyentuh sesi berjalan, dan supaya ring progress serta menit fokus di statistik akurat.
5. **Store keempat `useStatsStore`** untuk statistik, karena disimpan di key terpisah (`pomodoro:stats:v1`). Pemisahan render timer vs panel Spotify tetap seperti spec.
6. **Cookie `secure` mengikuti skema `NEXT_PUBLIC_APP_URL`** (true kalau `https://`), bukan `NODE_ENV`. Tanpa ini, build produksi di Docker yang diakses lewat `http://127.0.0.1` tidak bisa menyimpan cookie login. Di deployment HTTPS hasilnya tetap `Secure`.
7. **Endpoint tambahan `GET /api/auth/session`** (selalu 200, tidak memanggil Spotify) supaya kunjungan tanpa login tidak memunculkan error 401 merah di console. `/api/spotify/token` menerima `?refresh=1` untuk satu kali refresh paksa setelah `authentication_error`.
8. **Kode error tambahan**: `BAD_REQUEST` (400, body tidak valid), `FORBIDDEN` (403, mis. akun belum ditambahkan di User Management), `NOT_CONFIGURED` (503, env belum diisi), `INTERNAL_ERROR` (500).
9. **Auto-resume** terjadi saat fase focus benar-benar berjalan (auto-start atau user menekan Start), dan hanya kalau musik tadi di-pause oleh timer. Musik yang di-pause user sendiri tidak dilanjutkan.
10. **Fallback Free** menampilkan dua tautan per playlist: *Open app* (`spotify:playlist:<id>`) dan ikon web (`open.spotify.com`), alih-alih deteksi otomatis yang sering diblokir popup blocker.
11. **Dependency di luar tabel stack**: `swr` (disebut di tabel UI untuk `PlaylistPicker`), `server-only` (dibutuhkan oleh baris `import 'server-only'` yang diwajibkan spec), `jsdom` dan `@testing-library/dom` (peer untuk Testing Library), `@types/node@22` (Vitest menolak v20).
12. **Skip** memindahkan ke fase berikutnya dalam status idle; **Reset** mengembalikan fase saat ini ke durasi penuh tanpa mengubah hitungan siklus.
13. Dark mode mengikuti preferensi sistem (tanpa toggle manual).
14. **Scope `user-read-email` diminta**, walaupun spec bilang jangan. Web Playback SDK menolak token tanpa `streaming`, `user-read-email` dan `user-read-private` (error "Invalid token scopes"), jadi scope ini memang dipakai, oleh SDK. Aplikasi sendiri tidak pernah membaca email.

## Acceptance criteria

| Kriteria | Status | Cara diverifikasi |
| --- | --- | --- |
| Tab di-background 10 menit, meleset < 1 detik | ✅ | Playwright `clock.fastForward` (timer hanya ter-tick sekali, seperti tab yang di-throttle) + unit test throttling 1×/menit |
| Reload di tengah focus lanjut dari posisi benar | ✅ | E2E + unit test store |
| Akun Free: tanpa console error, jalur fallback | ✅ | E2E dengan `product: 'free'` (lihat catatan poin 1 untuk Development Mode) |
| Premium: playlist terputar dan pause otomatis saat break | ✅ di test | E2E dengan SDK palsu; perlu dicoba sekali dengan akun Premium asli |
| `grep -r "NEXT_PUBLIC_SPOTIFY" src/` kosong | ✅ | |
| Lighthouse a11y ≥ 95, build tanpa error TS | ✅ | Lighthouse: Accessibility 100, Best Practices 100; axe-core 0 pelanggaran di light dan dark |

## Troubleshooting

- **`INVALID_CLIENT: Invalid redirect URI`** (muncul di halaman Spotify): Redirect URI di dashboard dan `SPOTIFY_REDIRECT_URI` harus sama persis, termasuk `http`, `127.0.0.1`, port dan path.
- **Login gagal setelah kembali dari Spotify.** Pesan di panel Music menyebutkan penyebabnya, dan log server mencatat detailnya (`docker compose logs app`, atau terminal `npm run dev`):
  - `Spotify token endpoint answered 400 (invalid_client)`: Client secret salah. Salin ulang dari *Settings → View client secret*. Kalau pernah menekan *Rotate client secret*, secret lama tidak berlaku lagi.
  - `answered 400 (invalid_grant)`: kode login kedaluwarsa atau Redirect URI berbeda. Login ulang dari tombol di aplikasi.
  - `Could not reach accounts.spotify.com (...)`: server aplikasi tidak bisa ke internet. Biasanya karena proxy kantor, VPN, atau antivirus yang memeriksa HTTPS (kode `SELF_SIGNED_CERT_IN_CHAIN`). Coba di jaringan lain.
- **"The player needs one more Spotify permission" atau "Your Spotify session ended" setelah klik Connect player**: sesi dibuat oleh versi lama yang belum meminta scope `user-read-email`. Klik *Log in with Spotify* lagi dan setujui izin yang baru.
- **Mengubah `.env.local` tidak berpengaruh.** `docker compose restart` tidak membaca ulang env. Pakai `docker compose up -d` supaya container dibuat ulang dengan nilai baru.
- **Login sukses tapi muncul pesan "Spotify refused this account"**: akun belum ditambahkan di *User Management* dashboard.
- **Tombol Connect player tidak muncul / musik tidak bunyi**: pemutaran di tab butuh Premium dan browser desktop dengan DRM (Chrome, Edge, Firefox). Safari iOS dan browser Android tidak didukung SDK; di sana gunakan tautan *Open app*.
- **Notifikasi tidak muncul**: izinkan notifikasi untuk `127.0.0.1:3000` di pengaturan situs browser, dan cek mode *Focus / Do Not Disturb* di OS.
