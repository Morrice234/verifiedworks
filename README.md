# VerifiedWorks

A React Native (Expo) practice app for learning how CAPTCHA flows work: sign-up with email verification, a stats dashboard, a challenge screen with three challenge types, history, invite codes and a profile page.

It runs fully offline on a mock backend stored on the device. Point it at your own FastAPI server whenever you're ready.

## Run it

```bash
npm install
npx expo install --fix     # lines dependency versions up with your installed Expo SDK
npx expo start
```

Then press `a` to open an Android emulator, or scan the QR code with the Expo Go app on your phone.

To build an installable APK:

```bash
npm install -g eas-cli
eas build -p android --profile preview
```

(or `npx expo run:android` for a local build if you have Android Studio set up).

## Project layout

```
app/                     screens (expo-router: the file path is the route)
  _layout.tsx            auth gate: signed-in vs signed-out routes
  (auth)/login.tsx
  (auth)/register.tsx    username, email, password, invite code
  (tabs)/index.tsx       dashboard: points, accuracy, 7-day chart, per-type stats
  (tabs)/tasks.tsx       practice: text, math and shape-grid challenges
  (tabs)/history.tsx     answered challenges with filters
  (tabs)/invite.tsx      invite code, copy and share, who joined
  (tabs)/profile.tsx     optional details, settings, sign out
  faq.tsx
src/api/types.ts         every type and the Backend interface
src/api/mock.ts          offline backend on AsyncStorage
src/api/http.ts          FastAPI client
src/api/index.ts         picks mock or http from EXPO_PUBLIC_API_URL
src/lib/captcha.ts       challenge generators (used by the mock)
src/components/          UI kit, SVG captcha renderers, bar chart
```

## Using the VerifyWorker server (with the OCR solver)

The app works with the VerifyWorker test bench, which has a `mobile.py` router for it. In server mode:

- challenges are PNGs made by the server, at easy, medium or hard (picker on the Practice tab)
- **Run OCR solver** sends the challenge you're looking at to `worker.py` and shows what Tesseract read, how long it took and whether it was right
- the Home tab gets a **You vs OCR** table for text and math challenges
- once the solver has run on a challenge, answering it earns no points and doesn't count toward your own accuracy
- access needs a **card key** on the account. Users never see, enter or manage keys in the app. Only the admin creates keys, in the admin panel (see below). A new account sits on a "waiting for access" screen until the admin gives it a key; the user then taps Check again and the lab opens

Setup is in VerifyWorker's README, under "CaptchaLab phone app". In short, create `.env` here with:

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000/app     # your PC's IP, from ipconfig
# EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/app      # Android emulator
```

then restart with `npx expo start -c`. Leave it empty to go back to the offline demo.

Plain `http://` works in Expo Go. For a release APK you'd need HTTPS, or `"usesCleartextTraffic": true` under `android` in app.json.

### Endpoints the app calls

All under the base URL. Bodies are JSON, authenticated routes get `Authorization: Bearer <token>`, and errors use FastAPI's `{"detail": "message"}`.

| Method | Path |
|---|---|
| POST | /auth/request-code, /auth/register, /auth/login |
| GET, PATCH | /me |
| GET | /stats, /history, /invite |
| GET | /challenges/next?difficulty=easy\|medium\|hard |
| POST | /challenges/{id}/answer |
| POST | /challenges/{id}/solve (optional, server mode only) |

Exact field shapes are in `src/api/types.ts`. `src/api/mock.ts` is a working reference for the server logic.

## Admin panel

Open `http://localhost:4000/admin` on the PC running the backend (the first visit creates the admin account). It has five sections:

- **Overview**: users, who has access, who is still waiting for a key (with a Give key button), and unassigned keys on hand
- **Card keys**: the only place keys are made. Generate one key straight onto a user's account (by username or email), or up to 50 unassigned keys to hand out later with **Assign**. Pick lifetime or a number of days; the days start counting when the key is given to someone. Each key can be extended, revoked and restored, given a note, and (for admin-made keys) unassigned or deleted. Keys bought through the old PayPal checkout can only be revoked, since they belong to a payment record
- **Users**: search accounts, see access, task count and wallet balance, **Give key** in one click, and **Credit** approved earnings to a wallet
- **Withdrawals**: payout requests and their PayPal status
- **Settings**: PayPal credentials (used for withdrawal payouts) and the admin password

When the admin gives a user a key, the user gets an email saying their account is unlocked. Email is simulated for now and printed in the server console; `backend/src/lib/mailer.ts` is where a real provider goes

After pulling these changes, run `npx prisma migrate dev` in `backend/` once. It adds the key note and assigned date columns and regenerates the Prisma client.
