# Firestore Security Rules Setup

## What the Error Means

If you see: **"Unable to load team data. Check Firestore security rules..."**

This means your Firestore security rules are blocking access to the `flowhub/appdata` document.

## Fix Firestore Rules

1. Go to **Firebase Console** → **Firestore Database** → **Rules** tab

2. Replace the existing rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public access to flowhub collection (unauthenticated users can read/write)
    match /flowhub/{document=**} {
      allow read, write;
    }
    
    // Alternative: Require Firebase Auth (more secure for production)
    // match /flowhub/{document=**} {
    //   allow read, write: if request.auth != null;
    // }
    
    // Deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Click **Publish**

4. Refresh the FlowHub app in your browser

## Why This Happens

- Firestore starts in **locked mode** (deny all)
- You need to explicitly allow reads/writes to the `flowhub` collection
- The app stores all team data in a single document: `/flowhub/appdata`

## For Production

For better security, use the commented-out rules that require Firebase Authentication:

```javascript
match /flowhub/{document=**} {
  allow read, write: if request.auth != null;
}
```

This ensures only signed-in users can access team data.

## Testing the Fix

After updating rules:
1. Refresh the FlowHub app
2. You should see the Login screen (not an error)
3. Try logging in with existing credentials
4. If still stuck, check browser console for specific Firestore error codes
