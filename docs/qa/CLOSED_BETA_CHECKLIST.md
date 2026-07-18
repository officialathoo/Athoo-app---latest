# Athoo Closed Beta Test Checklist

Build under test: ____________________  
Build URL: __________________________  
Tester: ______________________________  
Device: ______________________________  
Android version: _____________________  
Test date: ___________________________

## Installation and startup

- [ ] APK downloads and installs successfully.
- [ ] App icon is centered and uses one consistent background color.
- [ ] Splash screen is centered, uses one background color, and does not stretch or crop.
- [ ] App launches without a crash, black screen, or repeated blinking.
- [ ] Layout fits the device screen without clipped cards, edge-to-edge overflow, or hidden controls.

## Authentication and session

- [ ] Customer registration and phone OTP work.
- [ ] Provider registration and phone OTP work.
- [ ] Registration email verification sends and verifies a 6-digit code.
- [ ] Email OTP login works only for an existing, active account with a verified email and the selected role.
- [ ] Missing, blocked, deactivated, deleted, and wrong-role accounts receive safe errors and no email OTP.
- [ ] Forgot-password email delivery remains generic and does not reveal whether an account exists.
- [ ] Password login works.
- [ ] Biometric login works after setup.
- [ ] Reopening the app restores the correct screen.
- [ ] After login, Home opens instead of Notifications.
- [ ] Logout completes immediately without welcome-screen flicker.
- [ ] A new-device login invalidates the previous device session.

## Customer workflow

- [ ] Home banners, broadcasts, categories, services, and emergency content load from admin data.
- [ ] Search and service-area selection work.
- [ ] GPS returns quickly or uses a safe cached/manual fallback.
- [ ] Open map preview and marker selection work.
- [ ] Booking, negotiation, chat, calling, completion PIN, invoice, and refund flows work.
- [ ] Camera and gallery uploads work; cropping is optional.

## Provider workflow

- [ ] Dashboard, jobs, availability, service area, negotiation, and profile work.
- [ ] Earnings, commission evidence, withdrawal, invoice, and Premium flows work.
- [ ] Reference numbers and uploaded screenshots appear in the admin panel.
- [ ] Incoming jobs and calls work while foregrounded, backgrounded, and after reopening.

## Notifications and email

- [ ] Welcome, password-change, new-device, account-status, booking, and transaction emails use the configured Athoo sender and template.
- [ ] Email preferences save for booking, account, product, and promotional emails; security emails remain mandatory.
- [ ] Promotional unsubscribe requires confirmation, works through POST/one-click, and does not disable security emails.
- [ ] Admin Email Center can verify transport, send a test email, review delivery status, and safely queue/cancel a limited campaign.
- [ ] Job, chat, general, and incoming-call notifications use distinct sounds.
- [ ] Tapping each notification opens the correct destination.
- [ ] Badge count and read state synchronize correctly.
- [ ] Signed-out accounts stop receiving account notifications.

## Theme, language, and accessibility

- [ ] System, Light, and Dark appearance modes work across tested screens.
- [ ] Branding, text, buttons, inputs, cards, and icons remain visible in Dark mode.
- [ ] English and Urdu switch correctly.
- [ ] Urdu text direction and alignment are correct.
- [ ] Text remains readable with larger system font settings.

## Network and errors

- [ ] Slow internet shows loading, retry, or cached content rather than a broken screen.
- [ ] Offline mode shows a clear user-friendly message.
- [ ] Errors never expose XML, SQL, credentials, stack traces, request IDs, or developer-only text.
- [ ] R2 profile, document, Premium, commission, support, and refund media upload and preview work.

## Result

- [ ] PASS — suitable for the next beta stage.
- [ ] FAIL — issues recorded below.

Issues found:

1. 
2. 
3. 
