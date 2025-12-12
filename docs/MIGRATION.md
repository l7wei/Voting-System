# MongoDB to Firestore Migration Guide

## Overview

This guide covers the step-by-step process to migrate from MongoDB/Mongoose to Google Cloud Firestore.

## Migration Strategy

We use a **gradual migration** approach to minimize risk:

1. **Dual Write**: Write to both MongoDB and Firestore
2. **Firestore Read**: Read from Firestore with MongoDB fallback
3. **Validation**: Ensure data consistency
4. **Cutover**: Switch to Firestore-only
5. **Cleanup**: Remove MongoDB code and dependencies

## Pre-Migration Checklist

- [ ] Firebase project created and configured
- [ ] Firestore security rules deployed
- [ ] Firestore indexes created
- [ ] Service account credentials configured
- [ ] Backup MongoDB data
- [ ] Test Firestore with emulator

## Data Model Mapping

### MongoDB → Firestore

#### Activities Collection

**MongoDB (Mongoose):**
```javascript
{
  _id: ObjectId,
  name: String,
  type: String,
  description: String,
  rule: 'choose_all' | 'choose_one',
  users: [String],  // Student IDs who voted
  options: [ObjectId],  // References to Option collection
  open_from: Date,
  open_to: Date,
  created_at: Date,
  updated_at: Date
}
```

**Firestore:**
```typescript
{
  id: string,  // Auto-generated document ID
  name: string,
  type: string,
  description?: string,
  rule: 'choose_all' | 'choose_one',
  options: VotingOption[],  // Embedded array
  eligible_voters: string[],  // From voterList.csv
  participated_voters: string[],  // Who voted (not what)
  open_from: Date,
  open_to: Date,
  created_at: Date,
  updated_at: Date,
  created_by: string  // UID of creator
}
```

**Key Changes:**
- `_id` → `id` (Firestore document ID)
- `users` → `participated_voters` (clearer naming)
- `options` embedded instead of references
- Added `eligible_voters` and `created_by`

#### Votes Collection

**MongoDB (Mongoose):**
```javascript
{
  _id: ObjectId,
  activity_id: ObjectId,
  rule: 'choose_all' | 'choose_one',
  choose_all: [{ option_id: String, remark: String }],
  choose_one: String,
  token: String,  // UUID for anonymity
  created_at: Date,
  updated_at: Date
}
```

**Firestore:**
```typescript
{
  id: string,  // UUID (anonymous)
  campaign_id: string,  // Reference to campaign
  rule: 'choose_all' | 'choose_one',
  choose_all?: ChoiceAllVote[],
  choose_one?: string,
  token: string,  // Anonymous UUID
  created_at: Date
}
```

**Key Changes:**
- `activity_id` → `campaign_id` (renamed collection)
- Removed `updated_at` (ballots are immutable)
- UUID as document ID for anonymity

## Migration Scripts

### Step 1: Data Export from MongoDB

Create `scripts/export-mongodb-data.ts`:

```typescript
import { connectDB } from '@/lib/db';
import { Activity } from '@/lib/models/Activity';
import { Vote } from '@/lib/models/Vote';
import { writeFile } from 'fs/promises';

async function exportData() {
  await connectDB();

  // Export activities
  const activities = await Activity.find({}).lean();
  await writeFile(
    'data/mongodb-export/activities.json',
    JSON.stringify(activities, null, 2)
  );

  // Export votes
  const votes = await Vote.find({}).lean();
  await writeFile(
    'data/mongodb-export/votes.json',
    JSON.stringify(votes, null, 2)
  );

  console.log('Export complete!');
  console.log(`Activities: ${activities.length}`);
  console.log(`Votes: ${votes.length}`);
}

exportData();
```

Run:
```bash
mkdir -p data/mongodb-export
npx tsx scripts/export-mongodb-data.ts
```

### Step 2: Data Import to Firestore

Create `scripts/import-to-firestore.ts`:

```typescript
import { firestore } from '@/src/modules/shared/lib/firebase-admin';
import { readFile } from 'fs/promises';

interface MongoActivity {
  _id: string;
  name: string;
  type: string;
  description?: string;
  rule: 'choose_all' | 'choose_one';
  users: string[];
  options: any[];
  open_from: Date;
  open_to: Date;
  created_at: Date;
  updated_at: Date;
}

interface MongoVote {
  _id: string;
  activity_id: string;
  rule: 'choose_all' | 'choose_one';
  choose_all?: any[];
  choose_one?: string;
  token: string;
  created_at: Date;
}

async function importData() {
  // Read exported data
  const activitiesData = await readFile('data/mongodb-export/activities.json', 'utf-8');
  const votesData = await readFile('data/mongodb-export/votes.json', 'utf-8');

  const activities: MongoActivity[] = JSON.parse(activitiesData);
  const votes: MongoVote[] = JSON.parse(votesData);

  // Import activities
  console.log(`Importing ${activities.length} activities...`);
  const activityIdMap = new Map<string, string>();

  for (const activity of activities) {
    const firestoreActivity = {
      name: activity.name,
      type: activity.type,
      description: activity.description,
      rule: activity.rule,
      options: activity.options.map((opt, index) => ({
        id: `opt-${index}`,
        name: opt.name || opt.title || `Option ${index + 1}`,
        description: opt.description,
      })),
      eligible_voters: [], // Will need to populate from voterList.csv
      participated_voters: activity.users || [],
      open_from: new Date(activity.open_from),
      open_to: new Date(activity.open_to),
      created_at: new Date(activity.created_at),
      updated_at: new Date(activity.updated_at),
      created_by: 'migrated', // Placeholder
    };

    const docRef = await firestore
      .collection('modules_voting_campaigns')
      .add(firestoreActivity);

    activityIdMap.set(activity._id.toString(), docRef.id);
    console.log(`Migrated activity: ${activity.name}`);
  }

  // Import votes
  console.log(`Importing ${votes.length} votes...`);
  
  for (const vote of votes) {
    const campaignId = activityIdMap.get(vote.activity_id.toString());
    if (!campaignId) {
      console.warn(`Campaign not found for vote: ${vote._id}`);
      continue;
    }

    const firestoreBallot = {
      campaign_id: campaignId,
      rule: vote.rule,
      choose_all: vote.choose_all,
      choose_one: vote.choose_one,
      token: vote.token,
      created_at: new Date(vote.created_at),
    };

    await firestore
      .collection('modules_voting_ballots')
      .doc(vote.token) // Use token as document ID for anonymity
      .set(firestoreBallot);
  }

  console.log('Import complete!');
}

importData().catch(console.error);
```

Run:
```bash
npx tsx scripts/import-to-firestore.ts
```

### Step 3: Dual Write Implementation

Create a wrapper service that writes to both databases:

```typescript
// src/modules/shared/lib/dual-write-service.ts
import { submitVote as submitFirestoreVote } from './voting-service';
import { Vote as MongoVote } from '@/lib/models/Vote';

export async function submitVoteDualWrite(
  campaignId: string,
  studentId: string,
  rule: 'choose_all' | 'choose_one',
  vote: any
) {
  // Write to Firestore (primary)
  const firestoreBallot = await submitFirestoreVote(
    campaignId,
    studentId,
    rule,
    vote
  );

  // Write to MongoDB (backup)
  try {
    await MongoVote.create({
      activity_id: campaignId,
      rule,
      choose_all: rule === 'choose_all' ? vote : undefined,
      choose_one: rule === 'choose_one' ? vote : undefined,
      token: firestoreBallot.token,
    });
  } catch (error) {
    console.error('MongoDB write failed:', error);
    // Don't throw - Firestore is primary
  }

  return firestoreBallot;
}
```

### Step 4: Data Validation

Create a validation script to ensure consistency:

```typescript
// scripts/validate-migration.ts
import { firestore } from '@/src/modules/shared/lib/firebase-admin';
import { connectDB } from '@/lib/db';
import { Activity } from '@/lib/models/Activity';
import { Vote } from '@/lib/models/Vote';

async function validateMigration() {
  await connectDB();

  // Validate activities/campaigns
  const mongoActivities = await Activity.countDocuments();
  const firestoreCampaigns = await firestore
    .collection('modules_voting_campaigns')
    .count()
    .get();

  console.log(`MongoDB Activities: ${mongoActivities}`);
  console.log(`Firestore Campaigns: ${firestoreCampaigns.data().count}`);

  // Validate votes/ballots
  const mongoVotes = await Vote.countDocuments();
  const firestoreBallots = await firestore
    .collection('modules_voting_ballots')
    .count()
    .get();

  console.log(`MongoDB Votes: ${mongoVotes}`);
  console.log(`Firestore Ballots: ${firestoreBallots.data().count}`);

  // Validate sample data
  const sampleActivity = await Activity.findOne();
  if (sampleActivity) {
    // Find corresponding campaign in Firestore
    const campaignSnapshot = await firestore
      .collection('modules_voting_campaigns')
      .where('name', '==', sampleActivity.name)
      .limit(1)
      .get();

    if (!campaignSnapshot.empty) {
      console.log('✓ Sample activity found in Firestore');
    } else {
      console.log('✗ Sample activity NOT found in Firestore');
    }
  }

  console.log('Validation complete!');
}

validateMigration();
```

Run:
```bash
npx tsx scripts/validate-migration.ts
```

## Migration Timeline

### Week 1: Preparation
- [ ] Set up Firestore
- [ ] Deploy security rules
- [ ] Create indexes
- [ ] Test with emulator
- [ ] Export MongoDB data

### Week 2: Import and Validation
- [ ] Import data to Firestore
- [ ] Validate data consistency
- [ ] Test with real data
- [ ] Fix any issues

### Week 3: Dual Write
- [ ] Implement dual write service
- [ ] Deploy to production
- [ ] Monitor both databases
- [ ] Ensure consistency

### Week 4: Cutover
- [ ] Switch reads to Firestore-only
- [ ] Stop MongoDB writes
- [ ] Monitor for errors
- [ ] Keep MongoDB as backup

### Week 5: Cleanup
- [ ] Verify Firestore is stable
- [ ] Archive MongoDB data
- [ ] Remove Mongoose dependencies
- [ ] Update documentation

## Rollback Plan

If issues arise during migration:

1. **Immediate Rollback**: Switch reads back to MongoDB
2. **Investigation**: Identify and fix Firestore issues
3. **Retry**: Re-import and validate data
4. **Gradual Re-enable**: Test with small user group first

## Post-Migration Checklist

- [ ] All data migrated successfully
- [ ] Firestore queries optimized
- [ ] Security rules tested
- [ ] Performance metrics acceptable
- [ ] MongoDB backup archived
- [ ] Mongoose dependencies removed
- [ ] Documentation updated
- [ ] Team trained on Firestore

## Common Issues and Solutions

### Issue: Query performance slow

**Solution**: Add Firestore indexes
```bash
firebase deploy --only firestore:indexes
```

### Issue: Security rules blocking legitimate access

**Solution**: Review and update `firestore.rules`
```bash
firebase deploy --only firestore:rules
```

### Issue: Data inconsistency between MongoDB and Firestore

**Solution**: Re-run import script or implement reconciliation
```bash
npx tsx scripts/reconcile-data.ts
```

## Support

For migration issues:
1. Check Firestore emulator logs
2. Review Cloud Logging
3. Consult Firebase documentation
4. Contact team lead
