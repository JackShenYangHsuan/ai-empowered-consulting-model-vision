# Firebase Setup Guide

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name: `command-center-agents` (or your choice)
4. Disable Google Analytics (optional)
5. Click "Create project"

---

## Step 2: Register Web App

1. In your Firebase project, click the **Web** icon (`</>`)
2. Register app nickname: `command-center-web`
3. Check "Also set up Firebase Hosting" (optional)
4. Click "Register app"
5. **Copy the Firebase configuration object**

---

## Step 3: Update firebase-config.js

Open `firebase-config.js` and replace the configuration:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_ACTUAL_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};
```

Replace with your actual values from the Firebase Console.

---

## Step 4: Set Up Firestore Database

1. In Firebase Console, go to **Firestore Database**
2. Click "Create database"
3. Choose **Start in test mode** (for development)
4. Select a location (choose closest to you)
5. Click "Enable"

### Test Mode Rules (Development Only):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

⚠️ **Warning**: These rules allow anyone to read/write. Use only for development!

---

## Step 5: Production Security Rules

When ready for production, update Firestore rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /agents/{agentId} {
      // Allow authenticated users to create
      allow create: if request.auth != null;
      
      // Allow anyone to read (or add auth check)
      allow read: if true;
      
      // Allow owner to update/delete
      allow update, delete: if request.auth != null;
    }
  }
}
```

---

## Step 6: Set Up Firestore Indexes (Optional)

For better performance, create indexes:

1. Go to **Firestore Database** → **Indexes**
2. Add composite index:
   - Collection: `agents`
   - Fields to index:
     - `status` Ascending
     - `createdAt` Descending

---

## Firestore Data Structure

### Agents Collection

```javascript
agents/
  {agentId}/
    name: string            // Agent name
    objective: string       // Main goal
    description: string     // Detailed description
    tools: array           // Selected tools
    status: string         // 'draft', 'planning', 'executing', 'completed'
    currentStep: number    // 1-4
    workplan: array        // Step 2 workplan
    clarifications: object // Step 2 Q&A
    createdAt: timestamp
    updatedAt: timestamp
```

Example agent document:

```json
{
  "name": "Analyze customer feedback",
  "objective": "Analyze customer feedback and generate insights",
  "description": "Collect feedback from support tickets and reviews...",
  "tools": ["Web Search", "Code Executor", "Data Analyzer"],
  "status": "draft",
  "currentStep": 1,
  "createdAt": "2024-11-02T10:30:00Z",
  "updatedAt": "2024-11-02T10:30:00Z"
}
```

---

## Testing Firebase Connection

1. Open browser console
2. Navigate to agent-create.html
3. You should see:
   ```
   ✅ Firebase initialized successfully
   ```

4. Fill out Step 1 form
5. Click "Create Agent"
6. Check console for:
   ```
   ✅ Agent created with ID: abc123...
   ```

7. Verify in Firebase Console:
   - Go to Firestore Database
   - You should see `agents` collection
   - Click to see your agent document

---

## Common Issues

### Issue 1: Firebase not loaded

**Error**: `Firebase SDK not loaded`

**Fix**: Make sure HTML has Firebase scripts:
```html
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
```

### Issue 2: Permission denied

**Error**: `Missing or insufficient permissions`

**Fix**: Update Firestore rules to allow writes (see Step 4)

### Issue 3: Invalid API key

**Error**: `Invalid API key`

**Fix**: Double-check your `firebaseConfig` values match Firebase Console

---

## Files Modified

- ✅ `agent-create.html` - Added Firebase SDK scripts
- ✅ `agent-create.js` - Added createAgent() function
- ✅ `firebase-config.js` - Firebase configuration and database functions

---

## What Happens Now

1. **User fills Step 1 form**:
   - Objective
   - Description
   - Tools

2. **User clicks "Create Agent"**:
   - Form validation
   - Data saved to Firestore
   - Agent ID generated
   - Moves to Step 2

3. **Agent saved in database**:
   - Stored in `agents` collection
   - Has unique ID
   - Has timestamp
   - Status set to 'draft'

---

## Next Steps

After Firebase is set up:
1. Test agent creation
2. Move on to Step 2 (workplan generation)
3. Update agent as user progresses through steps
4. Load existing agents in dashboard
