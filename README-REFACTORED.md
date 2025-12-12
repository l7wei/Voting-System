# NTHUSA Student Portal - Refactored Architecture

> **Note**: This is the refactored version migrating from MongoDB to Firebase/Firestore with a modular monolith architecture.

## Overview

The NTHUSA Student Portal is a cloud-native web application built with **Next.js 15**, **Firebase**, and a **Modular Monolith** architecture. It provides a scalable foundation for student services, starting with an anonymous voting system.

## Key Features

### 🗳️ Anonymous Voting System
- **Complete Anonymity**: UUID-based tokens ensure votes cannot be traced to individuals
- **Dual Voting Methods**: 
  - `choose_all`: Rate each option (support/oppose/neutral)
  - `choose_one`: Single choice selection
- **Participation Tracking**: System tracks who voted, not what they voted

### 🔐 Hybrid Authentication
- **Google OAuth**: Easy access for all users
- **NTHU OAuth**: Student verification via CCXP
- **Account Linking**: Link Google account to NTHU student ID
- **Role-Based Access**: Admin and student roles with granular permissions

### 🏗️ Modular Architecture
- **Feature Modules**: Self-contained modules for easy extension
- **Shared Components**: Reusable UI kit and utilities
- **Future-Ready**: Easy to add new features (facility booking, complaints, etc.)

### ☁️ Cloud-Native
- **Firebase Hosting**: Static assets with global CDN
- **Google Cloud Run**: Auto-scaling serverless containers
- **Cloud Firestore**: NoSQL database with real-time updates
- **Firebase Auth**: Secure authentication and session management

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: Google Cloud Firestore
- **Authentication**: Firebase Auth + Hybrid OAuth (Google + NTHU)
- **Styling**: Tailwind CSS
- **Deployment**: Firebase Hosting + Google Cloud Run
- **VM Proxy**: FastAPI (for NTHU OAuth static IP requirement)

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- Firebase CLI (`npm install -g firebase-tools`)
- Java Runtime (for Firebase Emulators)

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.development.example .env.development
# Edit .env.development as needed

# 3. Start Firebase Emulators (in a separate terminal)
firebase emulators:start

# 4. Start Next.js dev server
npm run dev
```

Access the application at `http://localhost:3000`

Firebase Emulator UI: `http://localhost:4000`

### Development with Emulators

The Firebase emulators provide a local development environment:

- **Firestore**: `localhost:8080` - Local database
- **Authentication**: `localhost:9099` - Local auth
- **UI**: `http://localhost:4000` - Visual interface

No need for a cloud Firebase project during development!

## Project Structure

```
Voting-System/
├── src/
│   ├── modules/              # Feature modules
│   │   ├── auth/             # Authentication module
│   │   │   ├── components/   # Auth UI components
│   │   │   ├── lib/          # Auth logic
│   │   │   └── types/        # Auth types
│   │   ├── voting/           # Voting module
│   │   │   ├── components/   # Voting UI components
│   │   │   ├── lib/          # Voting logic & Server Actions
│   │   │   └── types/        # Voting types
│   │   └── shared/           # Shared module
│   │       ├── components/   # Shared UI components (future)
│   │       ├── lib/          # Core services
│   │       │   ├── firebase-admin.ts
│   │       │   ├── user-service.ts
│   │       │   └── voting-service.ts
│   │       └── types/        # Shared types
│   │           └── firestore.ts
│   └── app/
│       └── (portal)/         # Portal routes (future)
│           ├── api/          # API routes
│           ├── admin/        # Admin pages
│           ├── vote/         # Voting pages
│           └── layout.tsx    # Portal layout
├── proxy/                    # VM OAuth proxy
│   ├── proxy.py              # FastAPI server
│   ├── requirements.txt      # Python dependencies
│   └── README.md             # Proxy documentation
├── docs/                     # Documentation
│   ├── ARCHITECTURE.md       # Architecture overview
│   ├── DEVELOPMENT.md        # Development guide
│   ├── DEPLOYMENT.md         # Deployment guide
│   └── MIGRATION.md          # MongoDB → Firestore migration
├── data/                     # Configuration
│   ├── adminList.csv         # Admin student IDs
│   └── voterList.csv         # Eligible voters
├── firebase.json             # Firebase configuration
├── firestore.rules           # Firestore security rules
└── firestore.indexes.json    # Firestore indexes
```

## Architecture

### Modular Monolith

Instead of microservices, we use a **modular monolith**:

- ✅ **Single Deployment**: Easier to manage and debug
- ✅ **No Network Overhead**: Direct function calls
- ✅ **Easy to Extract**: Modules can become services later
- ✅ **Fast Development**: Less infrastructure complexity

### Hybrid OAuth Architecture

**Problem**: NTHU OAuth requires a static IP callback, but Cloud Run uses dynamic IPs.

**Solution**: Auth Proxy Pattern

```
User → NTHU OAuth → VM Proxy (Static IP) → Cloud Run API → Firestore
```

1. User clicks "Login with NTHU"
2. Redirected to NTHU OAuth
3. Callback hits VM proxy at `voting.nthusa.tw/callback`
4. VM exchanges code for user data
5. VM forwards to Cloud Run `/api/internal/auth-handshake`
6. Cloud Run creates user in Firestore
7. User gets session token

**Security**: Secured with API key + timestamp validation

### Database: Firestore

**Collections**:

- **users**: User profiles and roles
- **modules_voting_campaigns**: Voting campaigns
- **modules_voting_ballots**: Anonymous votes

**Anonymity**: Ballots use UUID document IDs with no voter reference

## Documentation

- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)**: System architecture and design decisions
- **[DEVELOPMENT.md](./docs/DEVELOPMENT.md)**: Local development setup and workflows
- **[DEPLOYMENT.md](./docs/DEPLOYMENT.md)**: Production deployment to Cloud Run and Firebase
- **[MIGRATION.md](./docs/MIGRATION.md)**: MongoDB to Firestore migration guide
- **[proxy/README.md](./proxy/README.md)**: VM OAuth proxy setup

## Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
```

### Server Actions

All business logic uses Next.js Server Actions:

```typescript
// src/modules/voting/lib/actions.ts
'use server';

export async function getCampaigns() {
  return await getFirestoreCampaigns();
}

export async function submitVote(campaignId, rule, vote) {
  // Validates user, checks eligibility, submits vote
}
```

### Firebase Emulators

Start emulators for local development:

```bash
firebase emulators:start
```

Access Emulator UI: `http://localhost:4000`

## Deployment

### Production Environment

- **Frontend**: Firebase Hosting (CDN, custom domain)
- **Backend**: Google Cloud Run (auto-scaling)
- **Database**: Cloud Firestore (global scale)
- **VM Proxy**: FastAPI on static IP VM

### Deploy to Production

See [DEPLOYMENT.md](./docs/DEPLOYMENT.md) for detailed instructions.

Quick deploy:

```bash
# Build and deploy to Cloud Run
gcloud builds submit --tag gcr.io/PROJECT_ID/nthusa-portal
gcloud run deploy nthusa-portal --image gcr.io/PROJECT_ID/nthusa-portal

# Deploy to Firebase Hosting
npm run build
firebase deploy --only hosting
```

## Migration from MongoDB

See [MIGRATION.md](./docs/MIGRATION.md) for the complete migration guide.

**Status**: Currently in Phase 1 - Project setup complete

## Security

### Implemented Measures

- ✅ Firebase Auth for session management
- ✅ Firestore security rules for data access control
- ✅ API key protection for internal endpoints
- ✅ UUID-based vote anonymization
- ✅ HTTPS/TLS for all traffic
- ✅ Role-based access control (RBAC)
- ✅ Replay attack prevention (timestamp validation)

### Privacy Guarantees

- Ballots contain **no voter identification**
- Database breach cannot reveal voter-vote mapping
- UUID tokens are cryptographically random
- Campaign tracks participation, not vote content

## Future Modules

The modular architecture supports easy extension:

- 📅 **Facility Booking**: Reserve rooms and facilities
- 📢 **Announcements**: Student association announcements
- 📝 **Complaints**: Student complaint system
- 📊 **Analytics**: Usage statistics and insights

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes following the modular architecture
4. Write tests for new features
5. Submit a pull request

## License

[Add your license here]

## Maintainers

National Tsing Hua University Student Association - IT Department

---

## Migration Progress

- [x] Phase 1: Project setup, Firebase integration, VM proxy
- [x] Phase 2: Firestore services, Server Actions, documentation
- [ ] Phase 3: Auth integration (Google + NTHU OAuth)
- [ ] Phase 4: UI migration to new modules
- [ ] Phase 5: Data migration from MongoDB
- [ ] Phase 6: Testing and production deployment

**Current Status**: Foundation complete, ready for auth implementation

---

**Note**: This refactored architecture is designed for scalability, security, and maintainability. The modular approach allows the system to grow from a voting platform to a comprehensive student portal.
