# Deployment Guide

## Architecture Overview

The NTHUSA Student Portal uses a cloud-native architecture:

1. **Next.js App** → Deployed to Google Cloud Run (SSR) + Firebase Hosting (Static Assets)
2. **Database** → Google Cloud Firestore
3. **Authentication** → Firebase Auth + Hybrid OAuth (Google + NTHU via VM Proxy)
4. **VM Proxy** → Lightweight FastAPI server on static IP VM for NTHU OAuth callback

## Prerequisites

- Google Cloud Platform account
- Firebase project created
- Domain name configured
- Static IP VM for NTHU OAuth proxy
- NTHU OAuth credentials (client ID and secret)

## Part 1: Firebase Setup

### 1. Create Firebase Project

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize project
firebase init
```

Select:
- Firestore
- Hosting
- Functions (optional)

### 2. Configure Firestore

Upload security rules (`firestore.rules`):

```bash
firebase deploy --only firestore:rules
```

**firestore.rules:**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function to check if user is admin
    function isAdmin() {
      return isAuthenticated() && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roles.admin == true;
    }
    
    // Helper function to check if user is verified student
    function isVerifiedStudent() {
      return isAuthenticated() && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.inschool == true;
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated() && request.auth.uid == userId;
      allow write: if false; // Only backend can write
    }
    
    // Voting campaigns
    match /modules_voting_campaigns/{campaignId} {
      allow read: if true; // Public read
      allow create, update, delete: if isAdmin();
    }
    
    // Voting ballots (anonymous)
    match /modules_voting_ballots/{ballotId} {
      allow read: if isAdmin(); // Only admins for statistics
      allow create: if isVerifiedStudent();
      allow update, delete: if false; // Immutable
    }
  }
}
```

### 3. Create Firestore Indexes

Create `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "modules_voting_campaigns",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "open_to", "order": "DESCENDING" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "modules_voting_ballots",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "campaign_id", "order": "ASCENDING" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

Deploy indexes:

```bash
firebase deploy --only firestore:indexes
```

## Part 2: Google Cloud Run Deployment

### 1. Create Service Account

```bash
# Create service account for Firebase Admin
gcloud iam service-accounts create firebase-admin \
  --display-name="Firebase Admin Service Account"

# Grant Firestore and Auth permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:firebase-admin@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:firebase-admin@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/firebaseauth.admin"

# Create and download key
gcloud iam service-accounts keys create firebase-admin-key.json \
  --iam-account=firebase-admin@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 2. Build Docker Image

Create `Dockerfile` (if not exists):

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/data ./data

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

Update `next.config.js` for standalone build:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // ... other config
}

module.exports = nextConfig
```

Build and push:

```bash
# Set variables
export PROJECT_ID=your-project-id
export REGION=asia-east1
export SERVICE_NAME=nthusa-portal

# Build image
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME

# Or with Docker
docker build -t gcr.io/$PROJECT_ID/$SERVICE_NAME .
docker push gcr.io/$PROJECT_ID/$SERVICE_NAME
```

### 3. Deploy to Cloud Run

```bash
# Deploy
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "FIREBASE_PROJECT_ID=$PROJECT_ID" \
  --set-env-vars "AUTH_HANDSHAKE_API_KEY=$(openssl rand -base64 32)" \
  --set-secrets "FIREBASE_SERVICE_ACCOUNT_KEY=firebase-admin-key:latest"

# Get the URL
gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'
```

Store the Cloud Run URL - you'll need it for the VM proxy configuration.

## Part 3: VM Proxy Deployment

### 1. Set Up VM

SSH into your static IP VM:

```bash
ssh user@your-static-ip-vm
```

### 2. Install Python and Dependencies

```bash
# Update system
sudo apt update
sudo apt install -y python3 python3-pip python3-venv

# Create app directory
sudo mkdir -p /opt/nthu-oauth-proxy
sudo chown $USER:$USER /opt/nthu-oauth-proxy
cd /opt/nthu-oauth-proxy

# Copy proxy files
# Upload proxy.py, requirements.txt, .env.example to this directory
```

### 3. Configure Environment

```bash
cp .env.example .env
nano .env
```

Fill in `.env`:

```env
OAUTH_CLIENT_ID=your-nthu-client-id
OAUTH_CLIENT_SECRET=your-nthu-client-secret
OAUTH_TOKEN_URL=https://oauth.ccxp.nthu.edu.tw/v1.1/token.php
OAUTH_RESOURCE_URL=https://oauth.ccxp.nthu.edu.tw/v1.1/resource.php
CLOUD_RUN_API_URL=https://your-cloud-run-url.run.app
AUTH_HANDSHAKE_API_KEY=your-shared-secret-key
FRONTEND_URL=https://your-domain.com
PORT=8000
```

### 4. Install Dependencies

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 5. Create Systemd Service

Create `/etc/systemd/system/nthu-oauth-proxy.service`:

```ini
[Unit]
Description=NTHU OAuth Proxy Service
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/opt/nthu-oauth-proxy
Environment="PATH=/opt/nthu-oauth-proxy/venv/bin"
EnvironmentFile=/opt/nthu-oauth-proxy/.env
ExecStart=/opt/nthu-oauth-proxy/venv/bin/uvicorn proxy:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable nthu-oauth-proxy
sudo systemctl start nthu-oauth-proxy
sudo systemctl status nthu-oauth-proxy
```

### 6. Configure Nginx (Optional but Recommended)

Install Nginx:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/nthu-oauth-proxy`:

```nginx
server {
    listen 80;
    server_name voting.nthusa.tw;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/nthu-oauth-proxy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Get SSL certificate:

```bash
sudo certbot --nginx -d voting.nthusa.tw
```

## Part 4: Firebase Hosting Setup

### 1. Configure Firebase Hosting

Create/update `firebase.json`:

```json
{
  "hosting": {
    "public": "out",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "nthusa-portal",
          "region": "asia-east1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(jpg|jpeg|gif|png|svg|webp)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=31536000"
          }
        ]
      }
    ]
  }
}
```

### 2. Build and Deploy

```bash
# Build Next.js for static export (for static pages)
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

## Part 5: Environment Variables Summary

### Cloud Run Environment Variables

```env
NODE_ENV=production
FIREBASE_PROJECT_ID=your-project-id
AUTH_HANDSHAKE_API_KEY=your-shared-secret-key
```

### Cloud Run Secrets

- `FIREBASE_SERVICE_ACCOUNT_KEY`: Service account JSON key

### VM Proxy Environment Variables

```env
OAUTH_CLIENT_ID=your-nthu-client-id
OAUTH_CLIENT_SECRET=your-nthu-client-secret
OAUTH_TOKEN_URL=https://oauth.ccxp.nthu.edu.tw/v1.1/token.php
OAUTH_RESOURCE_URL=https://oauth.ccxp.nthu.edu.tw/v1.1/resource.php
CLOUD_RUN_API_URL=https://your-cloud-run-url.run.app
AUTH_HANDSHAKE_API_KEY=your-shared-secret-key (same as Cloud Run)
FRONTEND_URL=https://your-domain.com
PORT=8000
```

## Part 6: OAuth Configuration

### NTHU OAuth Callback URL

Register this callback URL in NTHU CCXP OAuth settings:

```
https://voting.nthusa.tw/callback
```

This points to your VM proxy server.

## Monitoring and Maintenance

### View Cloud Run Logs

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" --limit 50 --format json
```

### View VM Proxy Logs

```bash
sudo journalctl -u nthu-oauth-proxy -f
```

### Update Cloud Run Service

```bash
# Rebuild and redeploy
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME
gcloud run deploy $SERVICE_NAME --image gcr.io/$PROJECT_ID/$SERVICE_NAME --region $REGION
```

### Update VM Proxy

```bash
cd /opt/nthu-oauth-proxy
git pull  # if using git
sudo systemctl restart nthu-oauth-proxy
```

## Security Checklist

- [ ] Set strong `AUTH_HANDSHAKE_API_KEY` (use `openssl rand -base64 32`)
- [ ] Configure Firestore security rules correctly
- [ ] Enable HTTPS on VM proxy (via certbot)
- [ ] Restrict Cloud Run to necessary IAM permissions
- [ ] Regularly rotate service account keys
- [ ] Monitor logs for suspicious activity
- [ ] Keep dependencies updated
- [ ] Enable Cloud Armor for DDoS protection (optional)
- [ ] Set up alerting for errors and high traffic

## Troubleshooting

### Cloud Run 502 Error

- Check application logs
- Verify environment variables
- Ensure Firestore rules allow access
- Check service account permissions

### VM Proxy Not Receiving Callbacks

- Verify NTHU OAuth callback URL is correct
- Check nginx logs: `sudo tail -f /var/log/nginx/error.log`
- Verify proxy service is running: `sudo systemctl status nthu-oauth-proxy`
- Test endpoint: `curl http://localhost:8000/`

### Auth Handshake Fails

- Verify `AUTH_HANDSHAKE_API_KEY` matches on both VM and Cloud Run
- Check timestamp synchronization between VM and Cloud Run
- Review Cloud Run logs for detailed error messages

## Rollback Procedure

### Cloud Run Rollback

```bash
# List revisions
gcloud run revisions list --service $SERVICE_NAME --region $REGION

# Rollback to previous revision
gcloud run services update-traffic $SERVICE_NAME \
  --to-revisions=REVISION_NAME=100 \
  --region $REGION
```

### VM Proxy Rollback

```bash
cd /opt/nthu-oauth-proxy
git checkout previous-commit
sudo systemctl restart nthu-oauth-proxy
```

## Support

For issues and questions:
- Check logs first (Cloud Run and VM proxy)
- Review Firestore security rules
- Verify environment variables
- Test each component independently
