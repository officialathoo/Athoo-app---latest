# Evolution WhatsApp OTP

Athoo can deliver authentication OTPs through an Evolution API / Baileys instance while retaining the existing email, Meta WhatsApp Cloud, and HTTP SMS adapters.

## Production configuration

Set these values in the **Athoo API deployment secret manager** (never commit real secrets):

```env
OTP_DELIVERY_CHANNELS=evolution_whatsapp,email
OTP_DELIVERY_MODE=first_success

EVOLUTION_API_URL=https://athoo-evolution-whatsapp.onrender.com
EVOLUTION_API_KEY=REPLACE_WITH_EVOLUTION_GLOBAL_API_KEY
EVOLUTION_INSTANCE=Athoo
EVOLUTION_TIMEOUT_MS=10000
# Optional. Supported placeholders: {brand}, {code}, {minutes}, {purpose}
EVOLUTION_OTP_MESSAGE_TEMPLATE=Your {brand} verification code is {code}. It expires in {minutes} minutes. Do not share this code.
```

`EVOLUTION_API_KEY` must remain server-side. Do not expose it to mobile or browser clients.

With `first_success`, Evolution WhatsApp is attempted first. For login OTPs, verified email can be used as the fallback when WhatsApp delivery fails. Registration OTPs remain phone-bound by design, so email is not used to prove registration phone ownership.

## Evolution request contract

The adapter sends:

```http
POST {EVOLUTION_API_URL}/message/sendText/{EVOLUTION_INSTANCE}
apikey: <server-side secret>
Content-Type: application/json
```

```json
{
  "number": "923001234567",
  "text": "Your Athoo verification code is 1234. It expires in 10 minutes. Do not share this code."
}
```

Athoo normalizes supported Pakistani mobile formats to `92XXXXXXXXXX` before calling Evolution. OTP values are not included in production logs by this adapter.

## Operational note

The current Evolution/Baileys channel is an unofficial WhatsApp Web integration. Keep a fallback channel available and use an always-on Evolution deployment for production authentication traffic. A sleeping/free host may add enough cold-start latency to make OTP delivery unreliable.
