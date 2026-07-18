# Communication Provider Architecture

Athoo business workflows call stable internal email and push APIs. They do not call a vendor-specific SDK from route handlers, booking logic, notification orchestration, or the mobile app.

Provider credentials remain in the API deployment secret manager. Administrators can select an already configured adapter at runtime without receiving or editing those credentials.

## Runtime control

Super administrators with `settings.write` can manage the active adapters from:

`Admin Panel → Platform Settings → Communication & External Providers`

The existing platform-settings JSON record stores only these non-secret selections:

- runtime provider control enabled/disabled;
- email adapter: environment, SMTP, generic HTTP JSON, or disabled;
- push adapter: environment, Expo, generic HTTP JSON, or disabled.

When runtime control is disabled, deployment environment values remain authoritative. If the settings store cannot be read, Athoo safely falls back to the deployment environment. The existing settings cache prevents a database read on every delivery and is invalidated immediately after an administrator saves settings.

## Email adapters

### SMTP

Any standards-compatible SMTP service can be changed without source changes. Vendor labels such as `zoho_smtp`, `ses_smtp`, or `mailgun_smtp` resolve to the SMTP adapter.

Core settings:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=secret
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
EMAIL_FROM="Athoo <noreply@example.com>"
```

`EMAIL_FROM_ADDRESS` remains supported as the preferred explicit address setting. `SMTP_FROM` and the existing formatted `EMAIL_FROM` setting are retained for backward compatibility.

### Generic HTTP JSON

Conventional HTTPS email APIs can be connected declaratively:

```env
EMAIL_PROVIDER=http_json
EMAIL_HTTP_ENDPOINT=https://email-provider.example/v1/send
EMAIL_HTTP_METHOD=POST
EMAIL_HTTP_AUTH_HEADER=Authorization
EMAIL_HTTP_AUTH_PREFIX="Bearer "
EMAIL_HTTP_AUTH_VALUE=secret
EMAIL_HTTP_BODY_TEMPLATE_JSON={"recipient":"{to}","subject":"{subject}","html":"{html}","text":"{text}","sender":"{from}"}
EMAIL_HTTP_MESSAGE_ID_PATH=data.id
```

Available string placeholders are `{to}`, `{subject}`, `{html}`, `{text}`, `{from}`, `{fromName}`, and `{replyTo}`. The exact raw email headers object can be inserted with `__ATHOO_EMAIL_HEADERS__`.

## Push adapters

### Expo

The existing Expo delivery, retry, ticket, receipt, invalid-token cleanup, channel, sound, and TTL behavior remains intact.

```env
PUSH_PROVIDER=expo
PUSH_PROVIDER_ENDPOINT=https://exp.host/--/api/v2/push/send
PUSH_RECEIPT_ENDPOINT=https://exp.host/--/api/v2/push/getReceipts
```

### Generic HTTP JSON

A conventional push API can be connected without changing business workflows:

```env
PUSH_PROVIDER=http_json
PUSH_HTTP_ENDPOINT=https://push-provider.example/v1/send
PUSH_HTTP_METHOD=POST
PUSH_HTTP_AUTH_HEADER=Authorization
PUSH_HTTP_AUTH_PREFIX="Bearer "
PUSH_HTTP_AUTH_VALUE=secret
PUSH_HTTP_MESSAGE_TEMPLATE_JSON={"device":"{token}","title":"{title}","body":"{body}","data":"__ATHOO_PUSH_DATA__"}
PUSH_HTTP_BODY_TEMPLATE_JSON={"messages":"__ATHOO_MESSAGES__"}
PUSH_HTTP_ACCEPTED_PATH=summary.accepted
PUSH_HTTP_FAILED_PATH=summary.failed
PUSH_HTTP_INVALID_TOKENS_PATH=invalidTokens
```

Message placeholders include `{token}`, `{title}`, `{body}`, `{type}`, `{channelId}`, `{sound}`, `{ttl}`, `{badge}`, and `{priority}`. Raw message data is available through `__ATHOO_PUSH_DATA__`; the complete rendered batch is available through `__ATHOO_MESSAGES__`.

## Operational status

`GET /api/admin/settings/integrations/status` provides a secret-safe readiness summary for maps, email, push, OTP, storage, calls, queue, and cache. It returns provider names and credential-presence booleans, never credential values.

The normal API health endpoints also report the runtime-selected email and push adapter status.

## Switching boundaries

Provider switching without a code change is possible when either:

1. the provider supports an existing standard adapter such as SMTP or Expo; or
2. its HTTPS/JSON request and response shape can be represented by the generic template and field-path configuration.

A provider that requires proprietary request signing, a binary protocol, a vendor-only native SDK, or a multi-step authentication exchange requires one new adapter implementation. That implementation remains isolated behind the provider boundary; Athoo routes, workflows, database records, admin pages, and mobile APIs do not need to change.

Stateful infrastructure such as object storage, queues, caches, and voice/TURN transport intentionally remains deployment-controlled because switching those components can require data movement, connection draining, or process restart. The integration status screen identifies whether an integration is runtime-switchable or restart-required.

## Security rules

- Store secrets only in Render or the deployment secret manager.
- Never place provider secrets in `EXPO_PUBLIC_*` variables or Admin Panel responses.
- Use HTTPS for generic HTTP adapters in staging and production.
- Do not log authentication values, full credential-bearing URLs, or message bodies containing OTPs.
- Test a newly configured provider before selecting it for production traffic.
