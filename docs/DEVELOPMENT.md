# Development Guide (NTHUSA Student Portal)

## Overview

This repository is evolving into a modular monolith that targets **Next.js 15 App Router** on **Firebase Hosting + Cloud Run**, backed by **Firestore**. The codebase is organized by feature modules to keep future capabilities (complaints, booking, etc.) isolated.

## Folder Structure (portal-first)

```
src/
  app/(portal)/           # Portal shell and shared layout
  modules/
    auth/                 # Hybrid Google/NTHU auth, session utilities, firebase-admin bootstrap
    voting/               # Voting domain (campaigns, ballots, stats)
    shared/               # UI kit, utils, cross-module types
app/                      # Legacy routes (to be migrated)
docs/                     # Developer + deployment guides
proxy.py                  # VM auth proxy (FastAPI) for NTHU OAuth callback
```

## Firestore Data Model (current target)

### `users` collection
| field | type | notes |
| --- | --- | --- |
| `uid` | string | Firebase Auth UID (Google UID or `nthu:{student_id}`) |
| `email` | string \| null | Primary email (Google or NTHU provided) |
| `name` | string | Display name |
| `inschool` | boolean | Verified from NTHU OAuth |
| `student_id` | string | From NTHU OAuth |
| `roles` | map | `{ admin: boolean, student: boolean }` |
| `auth_providers` | string[] | e.g. `["google", "nthu"]` |
| `is_verified_student` | boolean | Derived from NTHU OAuth |
| `created_at` / `updated_at` | timestamp | Server timestamps |

### `modules_voting_campaigns` collection
| field | type | notes |
| --- | --- | --- |
| `name` | string | Campaign title |
| `rule` | `"choose_all" \| "choose_one"` | Voting rule |
| `open_from` / `open_to` | timestamp | Voting window |
| `options` | string[] | Option IDs |
| `visibility` | `"public" \| "restricted"` | Who can see |
| `created_at` / `updated_at` | timestamp | Server timestamps |

### `modules_voting_ballots` collection
| field | type | notes |
| --- | --- | --- |
| `campaign_id` | string | Reference to campaign |
| `uid` | string | Firebase UID (never stores PII about vote content) |
| `token` | string | Anonymized token used for tallying |
| `rule` | `"choose_all" \| "choose_one"` | Mirrors campaign |
| `choose_all` | array | `{ option_id, remark }[]` when rule = choose_all |
| `choose_one` | string | Option ID when rule = choose_one |
| `created_at` | timestamp | Server timestamp |

> Ballots can be stored as a top-level collection for privacy; per-campaign subcollections are also supported if desired.

## Local Development with Firebase Emulators

1. **Install tools**
   ```bash
   npm install
   npm install -g firebase-tools
   ```

2. **Set environment variables** (example `.env.development.local`)
   ```env
   AUTH_PROXY_SHARED_SECRET=dev-shared-secret
   FIREBASE_PROJECT_ID=your-firebase-project
   FIREBASE_CLIENT_EMAIL=service-account@your-firebase-project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
   ```
   Alternatively, set `FIREBASE_SERVICE_ACCOUNT` to the full JSON.

3. **Run emulators (if configured)**
   ```bash
   firebase emulators:start --only firestore,auth
   ```

4. **Start Next.js**
   ```bash
   npm run dev
   ```

5. **Auth handshake testing**
   - Call `POST /api/internal/auth-handshake` with header `x-internal-api-key: $AUTH_PROXY_SHARED_SECRET`.
   - Body example:
     ```json
     {
       "student_id": "110000001",
       "name": "Alice Chen",
       "email": "alice@gapp.nthu.edu.tw",
       "inschool": true
     }
     ```

## Testing

Run existing unit tests:
```bash
npm test
```

Add module-specific tests under `__tests__/` as features are migrated into `src/modules/*`.
