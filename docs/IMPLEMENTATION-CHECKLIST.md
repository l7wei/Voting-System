# Implementation Checklist

This document provides a step-by-step checklist for completing the NTHUSA Student Portal refactoring.

## Phase 1: Foundation ✅ COMPLETE

- [x] Project structure created
- [x] Firebase integration complete
- [x] Service layers implemented
- [x] VM proxy created
- [x] Documentation written
- [x] Security verified (0 vulnerabilities)

## Phase 2: Session Management (Next Priority)

### Authentication Infrastructure
- [ ] Create session management utilities
  - [ ] `src/modules/auth/lib/session.ts`
  - [ ] Session cookie creation with Firebase Auth
  - [ ] Session verification middleware
  - [ ] Refresh token handling

- [ ] Implement `getCurrentUser()` in Server Actions
  ```typescript
  // src/modules/voting/lib/actions.ts
  async function getCurrentUser() {
    const sessionCookie = cookies().get("session")?.value;
    if (!sessionCookie) return null;
    
    const decodedToken = await firebaseAuth.verifySessionCookie(sessionCookie, true);
    return await getUserByUid(decodedToken.uid);
  }
  ```

- [ ] Create auth context provider
  - [ ] `src/modules/auth/components/AuthProvider.tsx`
  - [ ] Client-side auth state management
  - [ ] User profile hook

### Testing
- [ ] Test session creation
- [ ] Test session verification
- [ ] Test session expiration
- [ ] Test refresh token flow

## Phase 3: Google OAuth Integration

### OAuth Flow
- [ ] Create Google OAuth configuration
  - [ ] Register OAuth app in Google Cloud Console
  - [ ] Configure redirect URIs
  - [ ] Store credentials in environment

- [ ] Implement Google OAuth routes
  - [ ] `src/app/(portal)/api/auth/google/login/route.ts`
  - [ ] `src/app/(portal)/api/auth/google/callback/route.ts`
  - [ ] OAuth state parameter handling

- [ ] Create or update user from Google OAuth
  - [ ] Call `createOrUpdateUserFromGoogle()` in callback
  - [ ] Create Firebase session cookie
  - [ ] Redirect to dashboard

### UI Components
- [ ] Login page with Google button
  - [ ] `src/modules/auth/components/LoginPage.tsx`
  - [ ] Google sign-in button
  - [ ] NTHU OAuth button

- [ ] Account linking UI
  - [ ] Profile page showing auth providers
  - [ ] "Link NTHU Account" button
  - [ ] Verification status display

### Testing
- [ ] Test Google OAuth login flow
- [ ] Test user creation from Google
- [ ] Test account linking
- [ ] Test session persistence

## Phase 4: NTHU OAuth Completion

### Callback Endpoint
- [ ] Create NTHU OAuth completion route
  - [ ] `src/app/(portal)/api/auth/nthu-complete/route.ts`
  - [ ] Receive token from VM proxy
  - [ ] Set session cookie
  - [ ] Redirect to dashboard

- [ ] Handle account linking
  - [ ] Check if user is already logged in with Google
  - [ ] If yes, link NTHU to existing account
  - [ ] If no, create new account from NTHU

### UI Updates
- [ ] Update login page for NTHU OAuth
  - [ ] NTHU login button redirects to VM proxy
  - [ ] Handle OAuth errors from VM proxy

- [ ] Link account flow
  - [ ] From profile page, initiate NTHU OAuth
  - [ ] Pass current user UID to handshake
  - [ ] Link accounts after verification

### Testing
- [ ] Test NTHU OAuth login (via VM proxy)
- [ ] Test account linking (Google + NTHU)
- [ ] Test student verification
- [ ] Test admin role assignment

## Phase 5: UI Component Migration

### Voting Components
- [ ] Move components to module structure
  - [ ] `src/modules/voting/components/CampaignList.tsx`
  - [ ] `src/modules/voting/components/CampaignCard.tsx`
  - [ ] `src/modules/voting/components/VoteForm.tsx`
  - [ ] `src/modules/voting/components/ResultsDisplay.tsx`

- [ ] Update to use Server Actions
  ```typescript
  // Before
  const response = await fetch('/api/activities');
  const campaigns = await response.json();
  
  // After
  import { getCampaigns } from '@/src/modules/voting/lib/actions';
  const campaigns = await getCampaigns();
  ```

- [ ] Remove old API routes (after verification)
  - [ ] app/api/activities/
  - [ ] app/api/votes/
  - [ ] app/api/stats/

### Admin Components
- [ ] Campaign management UI
  - [ ] `src/modules/voting/components/admin/CampaignEditor.tsx`
  - [ ] Create/edit campaign form
  - [ ] Delete campaign confirmation

- [ ] Statistics dashboard
  - [ ] `src/modules/voting/components/admin/StatsDashboard.tsx`
  - [ ] Results visualization
  - [ ] Participation metrics

### Shared Components
- [ ] UI Kit components
  - [ ] `src/modules/shared/components/Button.tsx`
  - [ ] `src/modules/shared/components/Card.tsx`
  - [ ] `src/modules/shared/components/Modal.tsx`
  - [ ] Move from `components/ui/` to module

### Testing
- [ ] Test all voting flows with Firestore
- [ ] Test admin campaign management
- [ ] Test vote submission
- [ ] Test results display

## Phase 6: Data Migration

### Pre-Migration
- [ ] Backup MongoDB database
  ```bash
  mongodump --uri="$MONGODB_URI" --out=./backups/$(date +%Y%m%d)
  ```

- [ ] Load eligible voters and admins
  - [ ] Update `data/voterList.csv` with current roster
  - [ ] Update `data/adminList.csv` with admin IDs

### Migration Scripts
- [ ] Create export script
  - [ ] `scripts/export-mongodb-data.ts`
  - [ ] Export activities to JSON
  - [ ] Export votes to JSON
  - [ ] Export options to JSON

- [ ] Create import script
  - [ ] `scripts/import-to-firestore.ts`
  - [ ] Import campaigns (activities)
  - [ ] Import ballots (votes)
  - [ ] Map MongoDB IDs to Firestore IDs

- [ ] Create validation script
  - [ ] `scripts/validate-migration.ts`
  - [ ] Compare counts
  - [ ] Verify sample data
  - [ ] Check data integrity

### Dual Write Period
- [ ] Implement dual write service
  - [ ] Write to both MongoDB and Firestore
  - [ ] Read from Firestore with MongoDB fallback
  - [ ] Monitor for inconsistencies

- [ ] Run dual write for 1 week
  - [ ] Monitor error rates
  - [ ] Compare data between systems
  - [ ] Fix any issues

### Cutover
- [ ] Stop MongoDB writes
- [ ] Switch to Firestore-only reads
- [ ] Monitor for 48 hours
- [ ] Archive MongoDB data

### Cleanup
- [ ] Remove MongoDB dependencies
  ```bash
  npm uninstall mongodb mongoose
  ```

- [ ] Delete MongoDB-related code
  - [ ] lib/db.ts
  - [ ] lib/models/
  - [ ] API routes using Mongoose

- [ ] Update environment examples
  - [ ] Remove MongoDB variables

## Phase 7: Production Deployment

### Cloud Run Setup
- [ ] Build Docker image
  ```bash
  docker build -t gcr.io/$PROJECT_ID/nthusa-portal .
  docker push gcr.io/$PROJECT_ID/nthusa-portal
  ```

- [ ] Deploy to Cloud Run
  - [ ] Set environment variables
  - [ ] Configure service account
  - [ ] Set up secrets
  - [ ] Enable auto-scaling

- [ ] Set up Firebase Hosting
  - [ ] Configure rewrites to Cloud Run
  - [ ] Deploy static assets
  - [ ] Configure custom domain

### VM Proxy Deployment
- [ ] Set up VM
  - [ ] Install Python and dependencies
  - [ ] Copy proxy files
  - [ ] Configure environment

- [ ] Configure systemd service
  - [ ] Enable service
  - [ ] Start service
  - [ ] Verify health check

- [ ] Set up Nginx
  - [ ] Install Nginx
  - [ ] Configure reverse proxy
  - [ ] Get SSL certificate

- [ ] Register OAuth callback
  - [ ] Update NTHU OAuth settings
  - [ ] Set callback URL to VM

### Monitoring
- [ ] Set up Cloud Logging
  - [ ] Cloud Run logs
  - [ ] Firestore logs
  - [ ] VM proxy logs

- [ ] Configure alerts
  - [ ] High error rate
  - [ ] High latency
  - [ ] Failed auth handshakes

- [ ] Set up dashboards
  - [ ] Request metrics
  - [ ] Database metrics
  - [ ] Auth metrics

### Testing
- [ ] Smoke tests in production
  - [ ] Google OAuth login
  - [ ] NTHU OAuth login
  - [ ] Vote submission
  - [ ] Results viewing

- [ ] Load testing
  - [ ] Simulate 1000 concurrent users
  - [ ] Monitor performance
  - [ ] Validate auto-scaling

## Phase 8: User Rollout

### Soft Launch
- [ ] Deploy to production (beta)
- [ ] Enable for test group (10-20 users)
- [ ] Gather feedback
- [ ] Fix issues

### Full Launch
- [ ] Announce to all students
- [ ] Monitor traffic and errors
- [ ] Be ready to rollback if needed
- [ ] Document any issues

### Post-Launch
- [ ] Monitor for 1 week
- [ ] Address user feedback
- [ ] Optimize performance
- [ ] Plan next features

## Phase 9: MongoDB Deprecation

### Final Steps
- [ ] Verify Firestore is stable (1 month)
- [ ] Archive MongoDB backups
- [ ] Remove MongoDB credentials
- [ ] Shut down MongoDB instance
- [ ] Update documentation

## Future Enhancements

### New Modules
- [ ] Facility Booking
  - [ ] Create `src/modules/booking/`
  - [ ] Implement booking service
  - [ ] Create UI components

- [ ] Announcements
  - [ ] Create `src/modules/announcements/`
  - [ ] Implement announcement service
  - [ ] Create UI components

- [ ] Complaints
  - [ ] Create `src/modules/complaints/`
  - [ ] Implement complaint tracking
  - [ ] Create admin dashboard

### Optimizations
- [ ] Implement caching strategy
  - [ ] Redis for session cache
  - [ ] CDN for static assets
  - [ ] Query result caching

- [ ] Performance improvements
  - [ ] Optimize Firestore queries
  - [ ] Add pagination
  - [ ] Implement lazy loading

- [ ] Analytics
  - [ ] Add Google Analytics
  - [ ] Track user behavior
  - [ ] Generate reports

## Success Metrics

### Technical
- [ ] Zero downtime migration
- [ ] < 500ms p95 latency
- [ ] > 99.9% uptime
- [ ] 0 security vulnerabilities

### User
- [ ] > 80% user satisfaction
- [ ] < 5% error rate
- [ ] Successful voting campaigns
- [ ] Positive feedback

### Business
- [ ] Cost reduction vs MongoDB
- [ ] Easier maintenance
- [ ] Faster feature development
- [ ] Foundation for new modules

## Notes

- Always test in Firebase emulators first
- Document any issues encountered
- Keep MongoDB backup for 6 months
- Monitor error rates closely during migration
- Have rollback plan ready

## Current Status

✅ **Phase 1 Complete**: Foundation, services, documentation
⏳ **Next**: Phase 2 - Session management implementation

Last Updated: 2024-12-12
