# Athoo Closed-Beta Automation

## Static release gate

```bash
pnpm beta:verify
```

## Staging API authentication smoke

Set the staging API URL and dedicated non-production customer, provider, and admin credentials, then run:

```bash
pnpm beta:api-smoke
```

This verifies deep health, categories, all three login roles, and authenticated identity endpoints without creating or mutating bookings or financial records.

## Physical-device flows

Install Maestro, install the Athoo preview build, and run:

```bash
ATHOO_APP_ID=com.athoo26436.athooapp \
BETA_CUSTOMER_IDENTIFIER=... BETA_CUSTOMER_PASSWORD=... \
maestro test .maestro/customer-login.yaml

ATHOO_APP_ID=com.athoo26436.athooapp \
BETA_PROVIDER_IDENTIFIER=... BETA_PROVIDER_PASSWORD=... \
maestro test .maestro/provider-login.yaml
```

Use dedicated staging accounts only. Never place credentials in the repository.
