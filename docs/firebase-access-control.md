# Firebase Access Control Setup

This project uses Firestore for:

- IP whitelist checks
- subscription plan checks (`free`, `pro`, `elite`)
- role-based management (`user`, `admin`, `superadmin`)

This project supports two access-control backends:

- `spark` (default): client-side Firestore reads/writes, no Cloud Functions required
- `blaze`: Cloud Functions callables for access resolution, claims, and token workflows

## 1) Environment Variables

Set these values in your Vite environment file (`.env` or `.env.local`):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID` (optional)
- `VITE_ACCESS_CONTROL_MODE` (`spark` or `blaze`, defaults to `spark`)

Quick start:

1. Copy [.env.example](../.env.example) to `.env.local`.
2. In Firebase Console, open **Project settings** > **Your apps** > **Web app config**.
3. Paste the values into `.env.local`.

Example:

```bash
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_ACCESS_CONTROL_MODE=spark
```

After editing env values, restart the Vite dev/build process.

## 2) Firestore Collections

Before creating collections, enable Firestore in Firebase Console:

1. Open **Build** > **Firestore Database**.
2. Click **Create database** and choose a region.
3. Use production mode if you will apply [firestore.rules](../firestore.rules).

### `whitelist/{ip}`

Document ID is the public IP address.

Suggested fields:

- `enabled`: boolean
- `blocked`: boolean
- `role`: `user` | `admin` | `superadmin`
- `canGenerateTokens`: boolean
- `updatedAt`: string (ISO timestamp)
- `updatedBy`: string (actor IP)

Notes:

- Whitelisted users can access the tool even without a subscription token.
- Whitelisted users with `canGenerateTokens=true` (or `role=superadmin`) can issue subscription tokens.

### `subscriptions/{ip}`

Document ID is the public IP address.

Suggested fields:

- `plan`: `free` | `pro` | `elite`
- `status`: `active` | `inactive`
- `expiresAt`: string ISO timestamp or `null`
- `updatedAt`: string (ISO timestamp)
- `updatedBy`: string (actor IP)

### `subscriptionTokens/{tokenHash}`

Document ID is SHA-256 hash of the generated token.

Suggested fields:

- `tokenHash`: string
- `plan`: `free` | `pro` | `elite`
- `status`: `active` | `inactive`
- `expiresAt`: string ISO timestamp
- `createdAt`: string ISO timestamp
- `createdByIp`: string

## 3) Deploy Security Rules

Current default profile is Spark-friendly and allows client-side access-control reads/writes.

Important:

- Spark profile is easier to operate but less secure.
- Blaze profile should use strict claim-based rules and Cloud Functions for hardened production.

Rules template is in [firestore.rules](../firestore.rules).

Mode profile templates:

- Spark profile: [firestore.rules.spark](../firestore.rules.spark)
- Blaze profile: [firestore.rules.blaze](../firestore.rules.blaze)

Firebase CLI config file is in [firebase.json](../firebase.json).

Copy [.firebaserc.example](../.firebaserc.example) to `.firebaserc` and set your project id.

Deploy using Firebase CLI:

```bash
npm run firebase:rules
```

### One-Command Mode Switch

Switch to Spark mode (default local/dev profile):

```bash
npm run access:mode:spark
```

Switch to Blaze mode (hardened + callable backend):

```bash
npm run access:mode:blaze
```

What these commands do:

1. Copy the selected template into [firestore.rules](../firestore.rules)
2. Update `.env.local` with `VITE_ACCESS_CONTROL_MODE=spark|blaze`

After switching, deploy rules:

```bash
npm run firebase:rules
```

For Blaze mode, also deploy functions:

```bash
npm run firebase:functions
```

For Blaze mode only (claims + callable backend), deploy Cloud Functions once:

```bash
cd functions
npm install
cd ..
npm run firebase:functions
```

If this is your first Firebase CLI setup in this repo:

```bash
firebase login
copy .firebaserc.example .firebaserc
# edit .firebaserc and set your project id
```

## 4) Bootstrap Firebase Auth Claims (Role + IP)

This section is required for Blaze mode.

Firestore rules expect custom Auth claims for secure role enforcement.

This repo includes [scripts/set-firebase-claims.mjs](../scripts/set-firebase-claims.mjs).

Set Google Application Default Credentials first:

```bash
# Windows PowerShell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
```

Then assign claims:

```bash
# set admin
npm run firebase:claims -- --uid <firebase-uid> --role admin

# set superadmin and bind allowed IP
npm run firebase:claims -- --uid <firebase-uid> --role superadmin --ip 203.0.113.10

# resolve the user by email instead of looking up UID manually
npm run firebase:claims-email -- --email admin@example.com --role admin

# resolve by email and bind to a specific IP
npm run firebase:claims-email -- --email admin@example.com --role superadmin --ip 203.0.113.10
```

Recommended admin workflow:

1. Have the target Google user sign in once so Firebase Auth creates the user.
2. In the app's Access Control panel, set the target IP whitelist/subscription and role.
3. Paste the target Google email into the same panel and copy the generated claims command.
4. Run that command in PowerShell with `GOOGLE_APPLICATION_CREDENTIALS` set.
5. Ask the target user to sign out/sign in again so their token refreshes with the new claims.

## 4.1) Assign Claims Through UI (Superadmin)

After Cloud Functions are deployed:

1. Open Settings -> Access Control.
2. Enter target IP and set role as needed.
3. Enter target Google email.
4. Click `Assign Claims by Email (UI)`.

You can also verify claims in-app:

5. Click `Lookup Claims by Email (UI)` to view the current `role` and `ip` custom claims for that user.

## 4.2) Subscription Token Workflow

1. Whitelisted issuer users ( `canGenerateTokens=true` or `role=superadmin` ) can generate tokens in Settings -> Access Control.
2. Generated tokens are plan-bound and expire automatically by plan:

- `free`: 7 days
- `pro`: 30 days
- `elite`: 90 days

3. Non-whitelisted users must input a valid token in `Subscription Access Token` and click `Validate Token`.
4. Invalid or expired tokens do not grant access.
5. Token input is persisted in IndexedDB through app settings storage.

Security behavior:

- In Blaze mode:
  - Claims endpoints require a whitelisted `superadmin` requester.
  - Token generation requires a whitelisted requester with token issuer privileges.
  - Token validation only succeeds for active, unexpired token records.
- In Spark mode:
  - Access checks and token workflows run client-side against Firestore.
  - This is operationally simpler but weaker from a security perspective.

## 5) Important Security Note

If `VITE_ACCESS_CONTROL_MODE=spark`, client-side reads/writes are intentionally enabled for easier operation without Functions.
Do not treat Spark mode as hardened security.

The rules template expects authenticated users and custom auth claims:

- `request.auth.token.role`
- optional `request.auth.token.ip`

If you do not have Firebase Auth + custom claims in place, do not allow client writes to admin endpoints in production.

For production-hardening, use one of these approaches:

- Add Firebase Auth and issue custom claims for `role` and `ip`.
- Move admin write operations to trusted backend endpoints (Cloud Functions/your server) and keep Firestore client writes denied.

## 6) Role Behavior

- `user`: cannot manage whitelist/subscriptions
- `admin`: can manage whitelist/subscriptions
- `superadmin`: can manage whitelist/subscriptions and assign roles (including admins)
