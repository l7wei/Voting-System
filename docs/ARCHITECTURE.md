# NTHUSA Student Portal Architecture

## Overview

The NTHUSA Student Portal is a cloud-native application built with a **Modular Monolith** architecture. It uses Next.js 15 (App Router), Firebase (Firestore + Auth), and a hybrid OAuth authentication system.

## Key Design Decisions

### 1. Modular Monolith Architecture

Instead of microservices, we use a **modular monolith** for:
- **Simplicity**: Single deployment, easier debugging
- **Performance**: No network overhead between modules
- **Flexibility**: Easy to extract modules into services later if needed
- **Development Speed**: Faster iteration, less infrastructure complexity

```
src/modules/
├── auth/          # Authentication and user management
├── voting/        # Voting system (campaigns, ballots)
└── shared/        # Shared utilities and components
```

Each module is **self-contained** with its own:
- `components/` - UI components
- `lib/` - Business logic and utilities
- `types/` - TypeScript interfaces

### 2. Hybrid OAuth Authentication

**Problem**: NTHU OAuth requires a static IP callback, but Cloud Run has dynamic IPs.

**Solution**: Auth Proxy Pattern

```
User → NTHU OAuth → VM Proxy (Static IP) → Cloud Run API → Firestore
```

**Flow**:
1. User clicks "Login with NTHU"
2. Redirected to NTHU OAuth page
3. NTHU OAuth callback hits VM proxy at `voting.nthusa.tw/callback`
4. VM proxy exchanges code for user data
5. VM proxy forwards data to Cloud Run `/api/internal/auth-handshake`
6. Cloud Run creates/updates user in Firestore
7. Cloud Run issues Firebase session token
8. User redirected back to portal with session

**Security**:
- VM ↔ Cloud Run communication secured with shared API key
- Timestamp validation prevents replay attacks
- All traffic over HTTPS

### 3. Database: Firestore

**Migration Path**: MongoDB → Firestore

**Reasons for Firestore**:
- **Serverless**: No server management, auto-scaling
- **Real-time**: Built-in real-time updates
- **Integration**: Native Firebase Auth integration
- **Security**: Declarative security rules
- **Offline**: Built-in offline support
- **Cost**: Pay-per-use, free tier for small apps

**Collections**:

#### `users`
```typescript
{
  uid: string              // Firebase UID (document ID)
  email: string            // Email from OAuth
  name: string             // Display name
  inschool: boolean        // Verified student status
  student_id?: string      // NTHU Student ID
  roles: {
    admin: boolean
    student: boolean
  }
  auth_providers: ['google' | 'nthu'][]
  created_at: Date
  updated_at: Date
}
```

#### `modules_voting_campaigns`
```typescript
{
  id: string                    // Auto-generated
  name: string
  type: string
  description?: string
  rule: 'choose_all' | 'choose_one'
  options: VotingOption[]
  open_from: Date
  open_to: Date
  eligible_voters: string[]     // Student IDs
  participated_voters: string[] // Student IDs (participation only)
  created_at: Date
  updated_at: Date
  created_by: string            // Creator UID
}
```

#### `modules_voting_ballots`
```typescript
{
  id: string              // UUID (document ID) for anonymity
  campaign_id: string     // Reference to campaign
  rule: 'choose_all' | 'choose_one'
  choose_all?: ChoiceAllVote[]
  choose_one?: string     // Option ID
  token: string           // Anonymous UUID
  created_at: Date
}
```

**Anonymity Model**:
- Ballots have **no voter identification**
- UUID-based tokens ensure anonymity
- Campaign tracks **who voted**, not **what they voted**
- Database breach cannot reveal voter-vote mapping

### 4. Deployment Architecture

```
┌─────────────────┐
│   Firebase      │
│   Hosting       │ ← Static Assets (HTML, CSS, JS)
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   Cloud Run     │ ← Next.js Server (SSR, API Routes)
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   Firestore     │ ← Database
└─────────────────┘

┌─────────────────┐
│   VM Proxy      │ ← NTHU OAuth Callback (Static IP)
│ (FastAPI)       │
└────────┬────────┘
         │
         ↓
   (Auth Handshake to Cloud Run)
```

**Components**:
1. **Firebase Hosting**: Serves static files, CDN, custom domain
2. **Cloud Run**: Runs Next.js server, handles SSR and API routes
3. **Firestore**: NoSQL database, auto-scaling, real-time
4. **VM Proxy**: Lightweight FastAPI server for NTHU OAuth callback

### 5. Security Measures

#### Authentication
- ✅ Firebase Auth for session management
- ✅ Custom claims for roles (admin, student)
- ✅ Secure session cookies (HttpOnly, Secure, SameSite)
- ✅ API key protection for internal endpoints

#### Authorization
- ✅ Firestore security rules enforce access control
- ✅ Role-based access control (RBAC)
- ✅ Admin verification via CSV (loaded from secure storage)
- ✅ Student eligibility validation

#### Data Privacy
- ✅ Anonymous voting (UUID tokens)
- ✅ No PII in ballots
- ✅ Encrypted at rest (Firestore default)
- ✅ Encrypted in transit (HTTPS/TLS)

#### Application Security
- ✅ Environment variable validation
- ✅ Input validation with Zod
- ✅ CSRF protection (Next.js built-in)
- ✅ Rate limiting (Cloud Run + Firebase)
- ✅ Replay attack prevention (timestamp validation)

### 6. Development Workflow

#### Local Development
```bash
# Terminal 1: Start Firebase Emulators
firebase emulators:start

# Terminal 2: Start Next.js Dev Server
npm run dev

# Terminal 3: (Optional) Start VM Proxy for NTHU OAuth testing
cd proxy && python proxy.py
```

**Firebase Emulators**:
- Firestore: `localhost:8080`
- Auth: `localhost:9099`
- UI: `http://localhost:4000`

**Next.js Dev Server**:
- App: `http://localhost:3000`

#### Testing
- **Unit Tests**: Jest + React Testing Library
- **Integration Tests**: Test Firestore with emulators
- **E2E Tests**: (Future) Playwright or Cypress

#### CI/CD
```
Code Push → GitHub Actions → Build → Test → Deploy to Cloud Run
```

### 7. Scalability Considerations

#### Current Scale
- Users: ~10,000 students
- Concurrent Users: ~1,000 during peak voting
- Campaigns: ~10-20 per semester
- Ballots: ~100,000 per semester

#### Firestore Limits
- **Writes**: 10,000/second per database (we need ~100/second)
- **Reads**: 10,000/second per database (we need ~1,000/second)
- **Storage**: 1 TB free tier (we use ~100 MB)

#### Cloud Run Autoscaling
- Min instances: 0 (cost optimization)
- Max instances: 10 (adequate for 10,000 users)
- Concurrency: 80 requests per instance

#### Caching Strategy
- Static assets: CDN cache (Firebase Hosting)
- Campaign list: Client-side cache (React Query)
- Admin/Voter lists: Server-side cache (5-minute TTL)

### 8. Future Extensions

The modular architecture allows easy addition of new modules:

```
src/modules/
├── auth/
├── voting/
├── facility-booking/   # Future: Facility reservation system
├── complaints/         # Future: Student complaint system
├── announcements/      # Future: Announcement board
└── shared/
```

Each new module:
1. Has its own Firestore collections (`modules_{name}_*`)
2. Has isolated business logic
3. Shares common UI components from `shared/`
4. Can be extracted to a microservice if needed

### 9. Migration Strategy

**Phase 1**: Setup (Current)
- ✅ Create modular folder structure
- ✅ Set up Firebase and Firestore
- ✅ Create data models and types
- ✅ Implement auth handshake endpoint
- ✅ Create VM proxy script
- ✅ Write documentation

**Phase 2**: Gradual Migration
- [ ] Run Firebase and MongoDB in parallel
- [ ] Write to both databases (dual-write pattern)
- [ ] Read from Firestore, fallback to MongoDB
- [ ] Migrate existing data using scripts
- [ ] Validate data consistency

**Phase 3**: Cutover
- [ ] Switch to Firestore-only reads
- [ ] Stop MongoDB writes
- [ ] Archive MongoDB data
- [ ] Remove Mongoose dependencies
- [ ] Clean up legacy code

**Phase 4**: Optimization
- [ ] Optimize Firestore queries
- [ ] Implement caching strategies
- [ ] Monitor performance metrics
- [ ] Tune autoscaling parameters

### 10. Monitoring and Observability

**Metrics**:
- Cloud Run: Request latency, error rate, instance count
- Firestore: Read/write operations, storage size
- VM Proxy: Response time, success rate

**Logging**:
- Structured logging with Winston/Pino
- Log aggregation in Google Cloud Logging
- Error tracking with Sentry (optional)

**Alerting**:
- High error rate (>5%)
- High latency (>1s p95)
- Failed auth handshakes
- Unusual traffic patterns

## Summary

This architecture provides:
- ✅ **Scalability**: Auto-scaling with Cloud Run and Firestore
- ✅ **Security**: Multi-layered security with Firebase Auth and Firestore rules
- ✅ **Privacy**: Anonymous voting with UUID tokens
- ✅ **Maintainability**: Modular structure with clear boundaries
- ✅ **Extensibility**: Easy to add new features as modules
- ✅ **Cost-Effectiveness**: Pay-per-use with generous free tiers
- ✅ **Developer Experience**: Fast local development with emulators

The hybrid OAuth pattern solves the static IP constraint while maintaining security and user experience.
