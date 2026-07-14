# Final Connected Deployment — GitHub, Render, Neon, Vercel and EAS

Use this package as the only source baseline.

## 1. Replace the local source safely

Extract the ZIP into a new folder. Copy your protected local `.env` values into the new folder; do not copy placeholder values over real secrets.

## 2. Run local gates

```powershell
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
pnpm check:project
pnpm typecheck
pnpm test
pnpm build
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:validate
```

## 3. Push the exact version to GitHub

```powershell
git status
git add .
git commit -m "Athoo RC2 final connected testing candidate"
git push origin main
```

## 4. Render API

Configure these production values in Render without trailing spaces:

- `DATABASE_URL`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `SESSION_SECRET`
- `CORS_ORIGIN` and `CORS_ORIGINS`
- Cloudflare R2 variables
- `EXPO_ACCESS_TOKEN`
- At least one OTP channel:
  - `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`, or
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `ALLOW_DEV_OTP_RESPONSE=false`

After deployment, verify:

```text
https://athoo-api.onrender.com/api/healthz
```

## 5. Neon

```powershell
pnpm db:migrate
pnpm db:verify
pnpm db:integrity
```

## 6. Vercel admin

Confirm the admin project deploys the same GitHub commit and points to:

```text
https://athoo-api.onrender.com
```

## 7. EAS development APK

Run from the `athoo-app` directory:

```powershell
eas whoami
eas build --platform android --profile development
```

Install the resulting APK and complete `CLOSED_BETA_CHECKLIST.md`.
