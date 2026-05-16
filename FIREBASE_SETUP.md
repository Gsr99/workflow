# Daylighting v3 — Firebase Setup Guide (From Scratch)

## Prerequisites
- Node.js 18+ installed  
- A Google account

---

## Step 1 — Install Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

---

## Step 2 — Create a Firebase Project

1. Go to https://console.firebase.google.com
2. Click **Add project**
3. Name it (e.g. `team-dashboard-grg`)
4. Disable Google Analytics (optional but not required)
5. Click **Create project**

---

## Step 3 — Register a Web App

1. In your project, click the **</>** (web) icon
2. Register app with nickname **FlowHub**
3. Copy the `firebaseConfig` object shown — it looks like:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "...",
  appId: "..."
}
```

4. Paste these values into `src/App.jsx` at the top (`FIREBASE_CONFIG` constant)

---

## Step 4 — Enable Authentication

1. Firebase Console → **Authentication** → Get started
2. **Sign-in method** tab → Enable **Google** provider
   - Set support email to your Gmail address
   - Click Save
3. Also enable **Email/Password** if you want manual login
4. **Authorized domains** tab → Add your hosting domain:
   - `your-project.web.app` (added automatically)
   - `localhost` (for local dev — already there)

---

## Step 5 — Create Firestore Database

1. Firebase Console → **Firestore Database** → Create database
2. Choose **Production mode** (rules are deployed separately)
3. Select a region close to your users (e.g. `europe-west1` for EU)
4. Click **Enable**

The app uses these Firestore paths (auto-created on first write):
- `flowhub/appdata` — main data store (tasks, members, messages, etc.)
- `flowhub/canvas` — whiteboard data
- `flowhub/tasknotes` → sub-collection — collab docs per task
- `mail/{id}` — outbound email queue (for Trigger Email extension)

---

## Step 6 — Deploy Firestore Security Rules

```bash
firebase deploy --only firestore:rules
```

This deploys `firestore.rules` which requires authenticated users
for all reads/writes.

---

## Step 7 — Enable Firebase Hosting

```bash
firebase init hosting
```

When prompted:
- **Public directory**: `dist`
- **Configure as single-page app**: **Yes**
- **Set up automatic builds**: No

Or simply use the existing `firebase.json` (already configured).

---

## Step 8 — (Optional) Email Notifications

The app writes to the `mail` collection to trigger task assignment emails.

1. Firebase Console → **Extensions** → Browse extensions
2. Find **"Trigger Email from Firestore"** → Install
3. Configure with your mail provider:

### Option A — SendGrid (recommended)
- Create account at sendgrid.com
- Create an API key with "Mail Send" permission
- SMTP settings:
  - Host: `smtp.sendgrid.net`
  - Port: `587`
  - User: `apikey`
  - Password: `<your SendGrid API key>`

### Option B — Gmail App Password
- Google Account → Security → App passwords
- Generate a password for "Mail"
- SMTP: `smtp.gmail.com:587`, user = your Gmail address

4. Set **"Email documents collection"** to `mail`
5. Set a **default FROM address** (e.g. `noreply@yourdomain.com`)

---

## Step 9 — (Optional) Google Calendar Integration

1. Go to https://console.cloud.google.com
2. Select your Firebase project
3. APIs & Services → **Enable APIs** → search "Google Calendar API" → Enable
4. APIs & Services → **Credentials** → Create credentials → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:5173`
     - `https://your-project.web.app`
5. Copy the **Client ID**
6. Paste it into `src/App.jsx`:
   ```js
   const GOOGLE_CAL_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com'
   ```

---

## Step 10 — Local Development

```bash
# Install dependencies
npm install

# Run dev server (hot reload)
npm run dev
# Opens at http://localhost:5173
```

---

## Step 11 — Build & Deploy

```bash
# Build + deploy in one command
npm run deploy
# Equivalent to: npm run build && firebase deploy --only hosting
```

Your app will be live at `https://your-project.web.app`

---

## Firestore Data Structure (Reference)

```
flowhub/
  appdata         ← single document, entire app state
    tasks[]
    messages[]
    members[]
    rewards[]
    meetings[]
    categories[]
    deletedItems[]
    timeLog{}
    files{}
    ...

  canvas          ← whiteboard state
    strokes[]
    notes[]

  tasknotes/
    {taskId}      ← collaborative doc per task
      content: ""
      updatedAt: ""
      updatedBy: ""

mail/
  {auto-id}       ← one doc per email, consumed by extension
    to: "user@example.com"
    message:
      subject: "..."
      html: "..."
```

---

## Environment Checklist

- [ ] Firebase project created
- [ ] Web app registered, `FIREBASE_CONFIG` updated in App.jsx
- [ ] Google Auth enabled (+ Email/Password if needed)
- [ ] Authorized domains added to Auth
- [ ] Firestore database created
- [ ] Firestore rules deployed
- [ ] Firebase Hosting configured
- [ ] (Optional) Trigger Email extension installed
- [ ] (Optional) Google Calendar Client ID added
- [ ] `npm run deploy` succeeds
- [ ] App loads at `https://your-project.web.app`

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Google sign-in blocked | Add your domain to Auth → Authorized domains |
| Firestore permission denied | Deploy `firestore.rules` with `firebase deploy --only firestore:rules` |
| Blank page after deploy | Check `firebase.json` has SPA rewrite `"** → /index.html"` |
| Fonts not loading | Check `index.html` Google Fonts link is present |
| Email not sending | Check Trigger Email extension logs in Firebase Console |
| Calendar not syncing | Verify Client ID + authorized origins in Google Cloud Console |
