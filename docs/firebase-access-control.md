# Firebase Access Control Setup

This project now uses a token-only access model.

- Access is granted by a valid subscription token.
- Each token carries both plan and role.
- Roles are `user`, `admin`, `superadmin`.
- The admin panel can issue tokens for `user` and `admin` only.
- `superadmin` is managed through Firebase Auth custom claims workflows.

Supported plans:

- `free` (7 days)
- `pro` (30 days)
- `elite` (90 days)
- `unlimited` (no expiry, all features)

## 1) Environment Variables

Set these values in your Vite environment file (`.env` or `.env.local`):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID` (optional)
- `VITE_ACCESS_CONTROL_MODE` (`spark` or `blaze`, defaults to `spark`)

Example:

```bash
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_ACCESS_CONTROL_MODE=spark
```

After editing env values, restart Vite.

## 2) Firestore Collections

Enable Firestore first in Firebase Console, then create:

### `subscriptionTokens/{tokenHash}`

Document ID is SHA-256 hash of the generated token.

Suggested fields:

- `tokenHash`: string
- `plan`: `free` | `pro` | `elite` | `unlimited`
- `role`: `user` | `admin` | `superadmin`
- `status`: `active` | `inactive`
- `expiresAt`: string ISO timestamp or `null` for `unlimited`
- `createdAt`: string ISO timestamp
- `createdByIp`: string

## 3) Deploy Security Rules

Rules templates:

- Spark profile: [firestore.rules.spark](../firestore.rules.spark)
- Blaze profile: [firestore.rules.blaze](../firestore.rules.blaze)

Default [firestore.rules](../firestore.rules) is Spark-friendly.

Deploy rules:

```bash
npm run firebase:rules
```

Switch profile quickly:

```bash
npm run access:mode:spark
npm run access:mode:blaze
```

These commands:

1. Copy selected template into [firestore.rules](../firestore.rules)
2. Update `.env.local` with `VITE_ACCESS_CONTROL_MODE=spark|blaze`

For Blaze mode, also deploy Functions:

```bash
cd functions
npm install
cd ..
npm run firebase:functions
```

## 4) Bootstrap Firebase Auth Claims (Blaze)

Blaze mode should enforce privileged operations by role.

Set Application Default Credentials:

```bash
# Windows PowerShell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
```

Assign claims:

```bash
npm run firebase:claims -- --uid <firebase-uid> --role admin
npm run firebase:claims -- --uid <firebase-uid> --role superadmin
npm run firebase:claims-email -- --email admin@example.com --role admin
npm run firebase:claims-email -- --email admin@example.com --role superadmin
```

## 5) Token Workflow

1. Admin or superadmin opens the Admin panel.
2. Choose role (`user` or `admin`) and plan (`free`, `pro`, `elite`, `unlimited`).
3. Generate token and deliver it securely.
4. Recipient enters token in `Subscription Access Token` and validates it.
5. Access is granted only when the token is valid and active.

Behavior notes:

- `unlimited` tokens never expire (`expiresAt = null`) and unlock all features.
- Revoked tokens are marked `inactive` and stop granting access immediately.
- Token input is persisted in app settings storage.

### Manual Token Creation (NPM)

Use the CLI script when you need to mint a token directly, including
`superadmin` role tokens.

Command:

```bash
npm run firebase:token -- --role <user|admin|superadmin> --plan unlimited
```

Examples (no expiry):

```bash
npm run firebase:token -- --role superadmin --plan unlimited
npm run firebase:token -- --role admin --plan unlimited
npm run firebase:token -- --role user --plan unlimited
```

Notes:

- Default plan is `unlimited`, so `--plan unlimited` is optional.
- The command prints the raw token once. Store it securely.
- This writes to `subscriptionTokens/{tokenHash}` with `status=active`.
- Ensure `GOOGLE_APPLICATION_CREDENTIALS` is set before running the command.

## 6) Security Note

Spark mode is operationally convenient but not hardened.

For production hardening, prefer Blaze mode with:

- Firebase Auth custom claims (`role`)
- callable-only privileged operations
- denied direct Firestore writes for token management from clients
