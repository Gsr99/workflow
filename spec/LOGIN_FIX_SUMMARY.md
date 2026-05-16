# Login Bug Fix Summary

## Problem
Users with existing accounts in Firestore could not log in. When Firestore had permission errors or network issues:
1. The app silently failed to load members
2. Users saw the "Create Admin Account" (first-run) screen, allowing anyone to create an admin account
3. No error message indicated what went wrong
4. Existing users' sessions couldn't be restored

## Root Cause
1. **First-run fallback bug**: When `onSnapshot(FH_DOC)` failed with a permission error, `members` array stayed empty but `dbLoaded=true`, triggering the first-run UI
2. **Missing error tracking**: No `dbLoadError` state to distinguish permission errors from legitimate "no members" state
3. **Silent failure**: Users received no feedback about Firestore connectivity issues

## Solution

### Step 1: Add Error State & Guard Logic
**Files**: `src/authHelpers.js`, `src/authHelpers.test.js`

Created helper functions:
- `canShowFirstRun({ dbLoaded, members, dbLoadError })` — Returns true ONLY when Firestore loaded successfully AND no members exist
- `getDbErrorMessage(dbLoadError)` — Formats user-friendly error messages for permission-denied, unavailable, etc.

Tests verify:
- First-run screen does NOT show when `dbLoadError` is set
- First-run screen ONLY shows when Firestore truly succeeds with empty members

### Step 2: Track Firestore Errors in App
**File**: `src/App.jsx`

Changes:
- Added `dbLoadError` state to track Firestore snapshot listener failures
- Updated error handler to set `dbLoadError` instead of just logging
- Pass `dbLoadError` to `Login` component
- Import and use `getDbErrorMessage` helper

### Step 3: Display Error to Users
**File**: `src/App.jsx` (Login component)

- Added visible warning box on signin screen when `dbLoadError` exists
- Users now see: "⚠️ Unable to load team data. Check Firestore security rules or contact your admin."
- Allows users to attempt login even with Firestore connectivity issues

## Testing

```bash
npm test  # Run all tests
```

Tests cover:
- ✅ First-run screen does NOT appear when Firestore fails
- ✅ First-run screen appears only when Firestore loads successfully with empty members
- ✅ Error messages are formatted correctly for different error types
- ✅ App builds without errors

## Deployment

Build and deploy normally:
```bash
npm run build
npm run preview
```

## User Impact

**Before**: Users stuck on first-run admin creation screen, no feedback about Firestore errors

**After**: 
- Users see clear error message if Firestore can't load
- Existing team members cannot accidentally create duplicate admin accounts
- Users can attempt login even during temporary Firestore issues
- Session restore only happens when Firestore data is confirmed valid

## Security

This fix **prevents** the authorization bypass where anyone could create an admin account by hitting "refresh" during a Firestore permission error.
