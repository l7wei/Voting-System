# Deployment Guide (Cloud Run + Firebase Hosting)

## Architecture
- **UI/SSR**: Next.js 15 (App Router)
- **Hosting**: Firebase Hosting (static assets, edge caching) → rewrite to **Cloud Run** for SSR/API
- **Database**: Firestore
- **Auth**: Firebase Auth (Google) + NTHU OAuth via VM proxy

## Environment Variables (Cloud Run)
Set these in the Cloud Run service configuration:
```
AUTH_PROXY_SHARED_SECRET=<shared-key-with-vm>
FIREBASE_PROJECT_ID=<project-id>
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY=<service-account-private-key-with-newlines-escaped>
# or FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
```

## Build & Deploy
1) **Build container**
```bash
gcloud builds submit --tag gcr.io/$PROJECT_ID/nthusa-portal
```

2) **Deploy to Cloud Run**
```bash
gcloud run deploy nthusa-portal \
  --image gcr.io/$PROJECT_ID/nthusa-portal \
  --platform managed \
  --allow-unauthenticated \
  --region asia-east1 \
  --set-env-vars AUTH_PROXY_SHARED_SECRET=... \
  --set-env-vars FIREBASE_PROJECT_ID=$PROJECT_ID \
  --set-env-vars FIREBASE_CLIENT_EMAIL=... \
  --set-env-vars FIREBASE_PRIVATE_KEY="..."
```

3) **Firebase Hosting rewrite**
Add to `firebase.json`:
```json
{
  "hosting": {
    "public": ".next",
    "rewrites": [
      { "source": "/api/**", "run": { "serviceId": "nthusa-portal", "region": "asia-east1" } },
      { "source": "**", "run": { "serviceId": "nthusa-portal", "region": "asia-east1" } }
    ]
  }
}
```
Then:
```bash
firebase deploy --only hosting
```

## VM Auth Proxy (static IP)

1) **Install dependencies**
```bash
pip install fastapi uvicorn httpx python-dotenv
```

2) **Environment (.env)**
```
AUTH_PROXY_SHARED_SECRET=<same-as-cloud-run>
NTHU_CLIENT_ID=...
NTHU_CLIENT_SECRET=...
NTHU_TOKEN_URL=https://oauth.ccxp.nthu.edu.tw/v1.1/token.php
NTHU_RESOURCE_URL=https://oauth.ccxp.nthu.edu.tw/v1.1/resource.php
CLOUD_RUN_CALLBACK=https://<cloud-run-host>/api/internal/auth-handshake
```

3) **Run (systemd)**
```
[Unit]
Description=NTHU OAuth Proxy
After=network.target

[Service]
WorkingDirectory=/opt/nthusa-proxy
ExecStart=/usr/bin/env uvicorn proxy:app --host 0.0.0.0 --port 8000
Restart=always
Environment="AUTH_PROXY_SHARED_SECRET=..."

[Install]
WantedBy=multi-user.target
```

Expose `https://voting.nthusa.tw/callback` to hit this proxy.

## Firestore Security Rules (starter)
```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, update: if request.auth.uid == uid;
      allow create: if request.time < timestamp.date(9999,1,1);
    }
    match /modules_voting_campaigns/{id} {
      allow read: if true;
      allow write: if request.auth.token.admin == true;
    }
    match /modules_voting_ballots/{id} {
      allow create: if request.auth != null;
      allow read: if false; // ballots remain private
    }
  }
}
```

## Observability
- Enable Cloud Run request logs and error reporting.
- Consider exporting Firestore audit logs to BigQuery for traceability.
