# Second Brain — Setup Guide

## 1. Deploy Firestore Security Rules

The `firestore.rules` file ensures only authenticated users can access their own data.

### Option A: Firebase CLI
```bash
npm install -g firebase-tools
firebase login
firebase init        # Select your project: website-todo-ae952
firebase deploy --only firestore:rules
```

### Option B: Manual (Firebase Console)
1. Go to [Firebase Console](https://console.firebase.google.com/) > **Firestore Database** > **Rules**
2. Paste the contents of `firestore.rules`
3. Click **Publish**

---

## 1b. Deploy Storage Security Rules

The `storage.rules` file ensures only authenticated users can access their own uploaded files (Documents module).

### Option A: Firebase CLI
```bash
firebase deploy --only storage
```

### Option B: Manual (Firebase Console)
1. Go to [Firebase Console](https://console.firebase.google.com/) > **Storage** > **Rules**
2. Paste the contents of `storage.rules`
3. Click **Publish**

---

## 2. Google Calendar Integration

### Step 1: Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** > **New Project**
3. Name it (e.g. "Second Brain") and click **Create**

### Step 2: Enable the Google Calendar API
1. In the project, go to **APIs & Services** > **Library**
2. Search for **Google Calendar API**
3. Click **Enable**

### Step 3: Configure the OAuth Consent Screen
1. Go to **APIs & Services** > **OAuth consent screen**
2. Select **External** user type, click **Create**
3. Fill in:
   - App name: `Second Brain`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue**
5. On **Scopes** page, click **Add or Remove Scopes**, search and add:
   - `https://www.googleapis.com/auth/calendar.readonly`
6. Click **Save and Continue**
7. On **Test users** page, add your Google email
8. Click **Save and Continue**

### Step 4: Create OAuth 2.0 Client ID
1. Go to **APIs & Services** > **Credentials**
2. Click **+ Create Credentials** > **OAuth client ID**
3. Application type: **Web application**
4. Name: `Second Brain`
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:8080` (for local dev)
   - Your production URL (e.g. `https://your-app.netlify.app`)
6. Click **Create**
7. Copy the **Client ID** (ends with `.apps.googleusercontent.com`)

### Step 5: Create an API Key
1. Still on **Credentials** page, click **+ Create Credentials** > **API key**
2. Copy the API key
3. Click **Restrict Key**:
   - Under **API restrictions**, select **Restrict key**
   - Enable only **Google Calendar API**
   - Under **Application restrictions**, add your domains
4. Click **Save**

### Step 6: Add credentials to app.js
Open `app.js` and replace the placeholders:
```javascript
const GCAL_CLIENT_ID  = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const GCAL_API_KEY    = 'YOUR_API_KEY';
```

---

## 3. Microsoft Outlook Calendar Integration

### Step 1: Register an App in Azure
1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Microsoft Entra ID** (left sidebar)
3. Click **App registrations** > **New registration**
4. Fill in:
   - Name: `Second Brain`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: Select **Single-page application**, enter `http://localhost:8080` (dev) or your production URL
5. Click **Register**

### Step 2: Configure Authentication
1. In your app registration, go to **Authentication**
2. Under **Advanced settings** for SPA platform:
   - Check **Access tokens** and **ID tokens**
3. Under **Redirect URIs**, add your production URL as well
4. Click **Save**

### Step 3: Add API Permissions
1. Go to **API permissions** > **Add a permission**
2. Select **Microsoft Graph** > **Delegated permissions**
3. Add these permissions:
   - `Calendars.ReadWrite`
   - `User.Read`
   - `offline_access`
   - `openid`
   - `profile`
   - `email`
4. Click **Add permissions**

### Step 4: Copy the Client ID
1. Go to **Overview** page
2. Copy the **Application (client) ID** (a UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### Step 5: Add credential to app.js
Open `app.js` and replace the placeholder:
```javascript
const O365_CLIENT_ID = 'YOUR_MICROSOFT_CLIENT_ID';
```

---

## 4. Test Locally

1. Start a local server:
   ```bash
   # Using Python
   python -m http.server 8080

   # Using Node.js
   npx serve -p 8080
   ```
2. Open `http://localhost:8080`
3. Sign in and try creating a task, note, or habit
4. Check the Firebase Console > Firestore Database to see if data appears
5. Go to Calendar view and click "Connect Google Calendar" or "Connect Outlook Calendar"

---

## Troubleshooting

### Saves not appearing in Firestore
- Make sure you deployed the Firestore rules (Section 1)
- Check browser console for errors
- Make sure `currentUser` is not null when saving

### Google Calendar "Access blocked"
- Your app is in "Testing" mode — only added test users can authorize
- Add more test users in Google Cloud Console > OAuth consent screen > Test users
- Or publish the app (requires Google verification for external users)

### Outlook Calendar "Need admin approval"
- Your app registration may require admin consent
- For personal Microsoft accounts, you may need to grant consent via the consent URL
- Check Azure Portal > App registration > API permissions for any pending admin consent
