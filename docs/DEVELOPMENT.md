# Development Guide

## Prerequisites

- Node.js 18+
- npm 9+
- Firebase CLI (`npm install -g firebase-tools`)
- Java Runtime (for Firebase Emulators)

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/l7wei/Voting-System.git
cd Voting-System
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.development` file:

```bash
cp .env.development.example .env.development
```

Edit `.env.development`:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=demo-voting-portal
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099

# Auth Handshake (for local testing)
AUTH_HANDSHAKE_API_KEY=local-dev-secret-key

# Application Settings
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Set Up Firebase Emulators

Initialize Firebase (if not already done):

```bash
firebase init
```

Select:
- Firestore
- Authentication
- Emulators

Create `firebase.json`:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

Create `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      // Users can read their own data
      allow read: if request.auth != null && request.auth.uid == userId;
      // Only system can write user data (via admin SDK)
      allow write: if false;
    }
    
    // Voting campaigns
    match /modules_voting_campaigns/{campaignId} {
      // Anyone can read campaigns
      allow read: if true;
      // Only admins can write
      allow write: if request.auth != null && 
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roles.admin == true;
    }
    
    // Voting ballots
    match /modules_voting_ballots/{ballotId} {
      // Only admins can read ballots (for statistics)
      allow read: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roles.admin == true;
      // Only authenticated users can create ballots
      allow create: if request.auth != null;
      // No updates or deletes allowed
      allow update, delete: if false;
    }
  }
}
```

### 5. Start Firebase Emulators

In a separate terminal:

```bash
firebase emulators:start
```

This will start:
- Firestore Emulator: `localhost:8080`
- Authentication Emulator: `localhost:9099`
- Emulator UI: `http://localhost:4000`

### 6. Prepare Data Files

Create admin and voter lists:

```bash
cp data/adminList.csv.example data/adminList.csv
cp data/voterList.csv.example data/voterList.csv
```

Edit the CSV files with test student IDs:

**data/adminList.csv:**
```csv
student_id
110000114
```

**data/voterList.csv:**
```csv
student_id
110000114
110000115
110000116
```

### 7. Run Development Server

```bash
npm run dev
```

Access the application at `http://localhost:3000`

## Project Structure

```
Voting-System/
├── src/
│   ├── modules/
│   │   ├── auth/           # Authentication module
│   │   │   ├── components/ # Auth UI components
│   │   │   ├── lib/        # Auth logic
│   │   │   └── types/      # Auth types
│   │   ├── voting/         # Voting module
│   │   │   ├── components/ # Voting UI components
│   │   │   ├── lib/        # Voting logic
│   │   │   └── types/      # Voting types
│   │   └── shared/         # Shared module
│   │       ├── components/ # Shared UI components
│   │       ├── lib/        # Shared utilities
│   │       │   ├── firebase-admin.ts
│   │       │   └── user-service.ts
│   │       └── types/      # Shared types
│   │           └── firestore.ts
│   └── app/
│       └── (portal)/       # Portal routes
│           ├── api/        # API routes
│           │   └── internal/
│           │       └── auth-handshake/
│           ├── admin/      # Admin pages
│           ├── vote/       # Voting pages
│           └── layout.tsx  # Portal layout
├── proxy/                  # VM Proxy script
│   ├── proxy.py
│   ├── requirements.txt
│   └── .env.example
├── docs/                   # Documentation
│   ├── DEVELOPMENT.md
│   └── DEPLOYMENT.md
├── data/                   # CSV configuration
│   ├── adminList.csv
│   └── voterList.csv
├── firebase.json           # Firebase configuration
├── firestore.rules         # Firestore security rules
└── package.json
```

## Development Workflow

### Testing Authentication

#### Mock Google OAuth (Development)

For development, you can use mock authentication:

1. Navigate to any protected route
2. You'll be redirected to the login page
3. Click "Login with Mock OAuth"
4. Fill in test data:
   - Student ID: `110000114`
   - Name: `測試學生`
   - In-school: `true`
5. Click "Authorize"

#### Testing NTHU OAuth Proxy (Local)

To test the complete NTHU OAuth flow locally:

1. Start the proxy server:

```bash
cd proxy
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python proxy.py
```

2. Configure environment variables in `proxy/.env`
3. Access the OAuth flow from your Next.js app

### Working with Firestore

#### Viewing Data

Use the Firebase Emulator UI at `http://localhost:4000` to:
- View Firestore collections
- Inspect documents
- Test security rules
- View authentication users

#### Querying Data

Example queries in your code:

```typescript
import { firestore } from '@/src/modules/shared/lib/firebase-admin';

// Get a user
const userDoc = await firestore.collection('users').doc(uid).get();
const user = userDoc.data();

// Query campaigns
const campaigns = await firestore
  .collection('modules_voting_campaigns')
  .where('open_to', '>', new Date())
  .get();
```

### Server Actions

All business logic should use Next.js Server Actions:

```typescript
// src/modules/voting/lib/actions.ts
'use server';

import { firestore } from '@/src/modules/shared/lib/firebase-admin';

export async function getCampaigns() {
  const snapshot = await firestore
    .collection('modules_voting_campaigns')
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}
```

## Testing

### Run Tests

```bash
npm test
```

### Watch Mode

```bash
npm run test:watch
```

## Linting and Type Checking

```bash
# Lint
npm run lint

# Type check
npm run type-check
```

## Troubleshooting

### Firebase Emulators Won't Start

- Ensure Java Runtime is installed
- Check if ports 8080, 9099, 4000 are available
- Try `firebase emulators:start --only firestore,auth`

### Connection Refused to Firestore

- Verify `FIRESTORE_EMULATOR_HOST=localhost:8080` is set
- Ensure Firebase emulators are running
- Check emulator UI for status

### Mock OAuth Not Working

- Clear browser cookies
- Check console for errors
- Verify data files (`adminList.csv`, `voterList.csv`) exist

### Module Resolution Errors

- Ensure `tsconfig.json` has correct path mappings
- Try `npm install` again
- Restart development server

## Next Steps

- See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
- Review Firestore data models in `src/modules/shared/types/firestore.ts`
- Explore the modular architecture in `src/modules/`
