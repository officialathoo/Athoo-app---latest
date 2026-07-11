import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

interface FAQ { keywords: string[]; answer: string; }

const CUSTOMER_FAQS: FAQ[] = [
  {
    keywords: ["book", "booking", "schedule", "how to book", "reserve", "how do i book", "make appointment"],
    answer: "To book a service:\n\n1. Go to the Search tab and select your service type\n2. Browse providers — tap any card to see their profile, hourly rate, and reviews\n3. Tap 'Book Now', choose your date, time, and service address\n4. Confirm — you'll get instant booking confirmation!\n\nTip: Use the filter to sort by rating, distance, or price to find your best match.",
  },
  {
    keywords: ["search", "find provider", "browse", "discover", "look for"],
    answer: "To find a provider:\n\n• Open the Search tab and choose a service category (e.g. Plumber, Electrician, Cleaner)\n• View all available providers in your area on a map or list\n• Filter by rating, experience, or price\n• Tap any provider to see their full profile, reviews, and availability\n\nYou can also use the Home screen banners to jump directly to popular services.",
  },
  {
    keywords: ["negotiate", "price", "offer", "negotiation", "counter", "indriver", "my price", "custom rate"],
    answer: "Athoo's negotiation works just like InDrive!\n\n1. Open a provider's profile and tap 'Negotiate'\n2. Enter your offered price for the job\n3. The provider will either Accept, Counter-offer, or Decline\n4. If you receive a counter, you can accept it or send a new offer\n5. Once both sides agree, the booking is automatically created\n\nNegotiation is free — no extra charges!",
  },
  {
    keywords: ["broadcast", "open request", "multiple providers", "send to all", "post job"],
    answer: "With Broadcast Requests, you post a job to all available providers at once:\n\n1. From the Home screen, tap 'Broadcast'\n2. Describe your job and set your budget\n3. Multiple providers will send you their offers\n4. Compare offers and choose the best one\n5. Your selected provider starts the booking\n\nBroadcast is perfect for urgent or custom jobs where you want competitive offers!",
  },
  {
    keywords: ["start otp", "arrival otp", "provider arrived", "confirm arrival", "otp to start"],
    answer: "When your provider arrives at your doorstep:\n\n• They will show you a 4-digit Start OTP on their app\n• Enter this OTP in your booking screen to confirm their arrival\n• The job timer starts immediately after you enter the OTP\n\nThis OTP confirms the provider physically arrived — never share it before they're at your door!",
  },
  {
    keywords: ["complete otp", "completion otp", "finish service", "end job", "close booking", "job done"],
    answer: "When the job is complete:\n\n• A 4-digit Completion OTP will appear in your booking screen\n• Share this code with your provider\n• They'll enter it in their app to close the booking\n• Your final invoice and earnings summary are generated instantly\n\nOnly share the completion OTP when you're fully satisfied with the work!",
  },
  {
    keywords: ["payment", "pay", "cash", "how do i pay", "payment method", "online payment"],
    answer: "Payment on Athoo is straightforward:\n\n• All payments are made directly in cash to the provider after service completion\n• Athoo does not process online payments currently\n• Your invoice shows: visit charge (Rs. 200) + hourly rate × hours worked\n• Always confirm the final amount before paying\n\nTip: Review your invoice in the booking detail screen before making payment.",
  },
  {
    keywords: ["invoice", "bill", "receipt", "billing", "how much", "total cost", "price breakdown"],
    answer: "Your invoice is auto-generated when a booking completes:\n\n• Visit Charge: Rs. 200 (fixed per job)\n• Service Rate: Provider's hourly rate × hours worked\n• Total is shown clearly before you pay\n\nYou can view all past invoices under My Bookings → Invoice. Bills are also available in Profile → Billing History.",
  },
  {
    keywords: ["refund", "money back", "dispute", "wrong charge", "overcharged"],
    answer: "For billing disputes or refund requests:\n\n1. Go to Profile → Help → Contact Support\n2. Select 'Billing Issue' and describe the problem\n3. Our team reviews all disputes within 24 hours\n4. We'll contact you via the app or WhatsApp\n\nFor urgent payment issues, WhatsApp us directly: +92 339 0051068 (9am–9pm).",
  },
  {
    keywords: ["cancel", "cancellation", "cancel booking", "how to cancel"],
    answer: "To cancel a booking:\n\n1. Go to My Bookings and open the booking\n2. Tap 'Cancel Booking' at the bottom\n3. Select a reason and confirm\n\nCancellation policy:\n• Free if cancelled 1+ hour before the scheduled time\n• Frequent last-minute cancellations may affect your account\n\nNote: Once a provider has entered the Start OTP, the booking cannot be cancelled.",
  },
  {
    keywords: ["provider no show", "didn't arrive", "late", "not coming", "never showed", "waiting"],
    answer: "If your provider is late or hasn't arrived:\n\n• Wait at least 15 minutes past the scheduled time\n• Use the in-app chat to contact the provider directly\n• If unreachable, go to your booking and tap 'Report Issue'\n• Our team will investigate and can rebook you with another provider free of charge\n\nFor urgent help: WhatsApp +92 339 0051068.",
  },
  {
    keywords: ["complaint", "problem", "issue", "not satisfied", "bad service", "poor quality", "report provider"],
    answer: "We take quality seriously. If you're not satisfied:\n\n1. Go to your completed booking\n2. Tap 'Report Issue' or leave a detailed review\n3. Or go to Profile → Help → Submit Complaint\n\nOur team reviews all complaints within 24 hours. Providers with repeated complaints are suspended. Your feedback makes Athoo better for everyone!",
  },
  {
    keywords: ["rating", "review", "rate provider", "stars", "feedback"],
    answer: "After every completed booking, you can rate your provider:\n\n• A rating prompt appears automatically after job completion\n• Rate 1–5 stars and leave a written review\n• Your review helps other customers choose trusted providers\n• Providers with consistently low ratings are reviewed by our team\n\nHonest reviews make the platform safer for everyone!",
  },
  {
    keywords: ["save", "saved", "favorite", "bookmark", "wishlist"],
    answer: "You can save your favorite providers for quick re-booking:\n\n• Tap the heart icon on any provider's profile card or detail page\n• Access all saved providers from Profile → Saved Providers\n• Saved providers are shown at the top of search results\n\nThis is great for providers you've worked with before and trust!",
  },
  {
    keywords: ["address", "my addresses", "location", "add address", "home address", "service location"],
    answer: "To manage your service addresses:\n\n• Go to Profile → My Addresses\n• Add, edit, or delete saved addresses (Home, Work, Other)\n• During booking, you can pick a saved address or add a new one\n• Addresses help providers navigate accurately to your location",
  },
  {
    keywords: ["track", "location", "map", "live tracking", "where is provider", "track job"],
    answer: "Live tracking is available for active bookings:\n\n• Open your booking detail screen after the Start OTP is entered\n• Tap the map icon to see your provider's real-time location\n• Providers can also see your address on their map\n• Tracking automatically stops when the job is completed",
  },
  {
    keywords: ["chat", "message", "talk to provider", "in-app chat", "contact provider"],
    answer: "You can chat with your provider directly in the app:\n\n• From a confirmed booking, tap the chat icon in the booking detail\n• Or go to the Chat tab to see all your conversations\n• Messages are stored permanently for your reference\n• Phone numbers are never shared — all communication is through Athoo's chat",
  },
  {
    keywords: ["call", "voice call", "phone call", "in-app call"],
    answer: "In-app voice calls let you speak to your provider without sharing phone numbers:\n\n• Available from the booking detail screen\n• Calls use your internet connection (no phone charges)\n• Call history is logged for dispute resolution\n• Available on both iOS and Android",
  },
  {
    keywords: ["phone", "privacy", "safe", "contact info", "number sharing", "personal info"],
    answer: "Your privacy is our priority:\n\n• Your phone number is NEVER shared with providers\n• All communication happens through Athoo's in-app chat and call\n• Providers only see your name, area, and service request\n• Your personal data is encrypted and stored securely\n• We are fully compliant with Pakistani data protection guidelines",
  },
  {
    keywords: ["notification", "alert", "push notification", "not getting alerts"],
    answer: "To make sure you receive booking and chat notifications:\n\n1. Allow notifications when prompted during app setup\n2. On Android: Settings → Apps → Athoo → Notifications → Enable All\n3. On iPhone: Settings → Athoo → Notifications → Allow Notifications\n\nNotifications are sent for: booking confirmations, provider arrivals, chat messages, and status updates.",
  },
  {
    keywords: ["area", "city", "serve", "available city", "coverage", "where available", "which cities"],
    answer: "Athoo currently serves:\n\n📍 Rawalpindi\n📍 Islamabad\n\nWe're actively expanding to Lahore, Karachi, Faisalabad, and more cities very soon!\n\nTo get notified when Athoo reaches your city, follow us on Instagram @athoo_services or join our Facebook page athoo.services.",
  },
  {
    keywords: ["services", "types of service", "what services", "available services", "categories", "what can i book"],
    answer: "Athoo currently offers:\n\n🔧 Plumber — pipe repairs, installations\n⚡ Electrician — wiring, fixtures, faults\n❄️ AC Repair & Service — servicing, gas, installations\n🪚 Carpenter — furniture, doors, repairs\n🎨 Painter — interior/exterior, touch-up\n🧹 Cleaner — deep clean, regular cleaning\n🚗 Driver — car driving, daily trips\n👩‍⚕️ Nurse/Caretaker — patient care, elderly\n📚 Tutor — home tuition, all subjects\n\nMore services are being added regularly!",
  },
  {
    keywords: ["emergency", "urgent", "immediately", "right now", "asap", "emergency service"],
    answer: "For urgent or emergency service requests:\n\n• Use the Broadcast feature to send your request to ALL available providers instantly\n• Set your budget and describe the urgency in the job description\n• Providers who can come immediately will respond within minutes\n\nFor life-threatening emergencies, please call 1122 (Rescue) or 115 (Edhi Foundation) directly.",
  },
  {
    keywords: ["subscription", "premium", "upgrade", "plan", "vip", "membership"],
    answer: "Athoo Premium unlocks exclusive benefits:\n\n• Priority placement — your requests are shown first to providers\n• No service fees on broadcast requests\n• Access to verified and top-rated providers only\n• Exclusive discount codes and seasonal offers\n\nGo to Profile → Subscription to view current plans and subscribe.",
  },
  {
    keywords: ["verified", "verification", "background check", "cnic", "is provider safe"],
    answer: "Provider safety is our top priority:\n\n✅ All providers submit CNIC (National ID) for identity verification\n✅ Our team manually reviews every provider before activation\n✅ Providers build a verified work history through customer ratings\n✅ A 'Verified' badge appears on approved provider profiles\n\nWe recommend always booking verified providers for peace of mind.",
  },
  {
    keywords: ["become provider", "join provider", "register provider", "how to become", "work on athoo", "provider registration"],
    answer: "To join Athoo as a service provider:\n\n1. From the Welcome screen, tap 'Join as Provider'\n2. Fill in your personal details and select your services\n3. Upload your CNIC (front and back)\n4. Submit any relevant certificates or experience proof\n5. Our team reviews your application within 24–48 hours\n6. Once approved, you'll appear in customer searches!\n\nFor help with registration, WhatsApp: +92 339 0051068.",
  },
  {
    keywords: ["account", "my account", "profile", "account settings", "my profile"],
    answer: "Manage your account from the Profile tab:\n\n• Edit your name, profile photo, and contact info\n• Change your city and service address\n• View booking history and invoices\n• Manage saved addresses and providers\n• Change language (English / اردو)\n• Update notification preferences",
  },
  {
    keywords: ["password", "forgot password", "reset password", "login problem", "can't login", "forgot"],
    answer: "To reset your password:\n\n1. On the login screen, tap 'Forgot Password'\n2. Enter your registered phone number\n3. You'll receive a 6-digit OTP via SMS\n4. Enter the OTP and set your new password\n5. Log in with your new password\n\nIf you're not receiving the OTP, check that your phone number is correct or contact support.",
  },
  {
    keywords: ["delete account", "deactivate account", "remove account", "close account"],
    answer: "To deactivate or delete your account:\n\n• Go to Profile → Settings → Account → Delete Account\n• Account deletion is permanent and removes all your data\n• Active bookings must be completed or cancelled first\n\nIf you're having issues and want to take a break, consider deactivating instead — your account can be restored anytime.",
  },
  {
    keywords: ["commission", "fee", "athoo fee", "platform fee", "service charge", "how much does athoo take"],
    answer: "As a customer, you pay NO platform commission or service fee to Athoo.\n\nAthoo's commission is collected from providers — not from customers. The price you agree on with your provider is the full amount you pay them directly in cash.\n\nThe only charges on your invoice are: visit charge (Rs. 200) + the provider's hourly rate × hours worked.",
  },
  {
    keywords: ["language", "urdu", "english", "change language", "app language"],
    answer: "Athoo supports both English and Urdu:\n\n• Go to Profile → Language\n• Toggle between English and اردو\n• The entire app interface switches instantly\n\nOur support team can also assist you in Urdu via WhatsApp.",
  },
  {
    keywords: ["support", "contact", "whatsapp", "team", "contact us", "reach you", "contact support"],
    answer: "Our support team is ready to help!\n\n📱 WhatsApp: +92 339 0051068 (9am–9pm daily)\n📸 Instagram: @athoo_services\n📘 Facebook: athoo.services\n\nFor in-app support, go to Profile → Help → Contact Support to submit a ticket. We respond within a few hours!",
  },
  {
    keywords: ["hello", "hi", "hey", "assalam", "salam", "good morning", "good afternoon"],
    answer: "Hello! Welcome to Athoo! 😊\n\nI'm your Athoo Assistant and I'm here to help you with:\n• Booking services\n• Understanding how payments work\n• Provider privacy and safety\n• Account and profile settings\n• Complaints or billing issues\n\nWhat can I help you with today?",
  },
  {
    keywords: ["thank", "thanks", "thank you", "shukria", "jazakallah"],
    answer: "You're most welcome! 😊\n\nIs there anything else I can help you with? I'm always here if you have more questions about bookings, providers, payments, or anything else on Athoo.",
  },
  {
    keywords: ["referral", "refer", "invite friend", "referral code", "discount for inviting", "earn by inviting", "share app"],
    answer: "Athoo's Referral Program rewards you for inviting friends! 🎉\n\n• Go to Profile → Referral Code\n• Share your unique code with friends and family\n• When they sign up and complete their first booking using your code, you both earn a reward\n• Track your referral count and rewards from the same screen\n\nThe more friends you invite, the more rewards you earn! Spread the word and enjoy Athoo together.",
  },
  {
    keywords: ["badge", "top rated", "100 jobs", "what are badges", "provider badge", "new provider", "premium badge", "highly rated"],
    answer: "Provider badges make it easy to pick the best!\n\n⭐ Top Rated — providers with 4.7+ average rating\n⭐ Highly Rated — providers with 4.0+ rating\n💼 100+ Jobs — proven experience with 100 or more completed jobs\n💼 50+ Jobs — solid experience with 50+ jobs\n✨ Premium — subscribed to an Athoo Premium plan\n🆕 New — freshly onboarded provider\n\nBadges appear on provider search cards. Choose a Top Rated or 100+ Jobs provider for the best experience!",
  },
  {
    keywords: ["book again", "rebook", "re-book", "same provider again", "book same provider", "repeat booking"],
    answer: "Booking the same provider again is easy!\n\n• Go to My Bookings → Completed tab\n• Find a past booking with a provider you liked\n• Tap the 'Book Again' button below that booking card\n• You'll be taken to the provider's profile to book them directly\n\nYou can also save your favorite providers by tapping the heart icon on their profile — they'll appear at the top of your search results!",
  },
  {
    keywords: ["reminder", "booking reminder", "notification before", "pre-job reminder", "advance notification"],
    answer: "Athoo sends you an automatic reminder before your scheduled booking!\n\n• About 30–60 minutes before your appointment, you'll receive a push notification\n• The reminder includes the provider's name, service, and scheduled time\n• Make sure push notifications are enabled for the Athoo app on your phone\n• This helps you prepare (unlock the gate, arrange access, etc.) before the provider arrives\n\nNever miss a booking appointment with Athoo's smart reminders!",
  },
];

const PROVIDER_FAQS: FAQ[] = [
  {
    keywords: ["accept", "job", "pending", "new job", "how to accept", "booking request", "incoming job"],
    answer: "When a customer books you:\n\n1. You'll receive a push notification immediately\n2. Go to My Jobs tab — look for 'Pending' bookings\n3. Open the booking to see the details (service, location, date, time)\n4. Tap 'Accept Job' to confirm\n\nImportant: You have 15 minutes to respond before the booking is reassigned to another provider. Keep notifications enabled!",
  },
  {
    keywords: ["start otp", "arrive", "arrival", "begin job", "how to start job", "customer otp"],
    answer: "When you arrive at the customer's location:\n\n1. Tap 'I've Arrived' on your job screen\n2. Ask the customer for their 4-digit Start OTP (shown on their app)\n3. Enter the OTP to begin the job timer\n4. The timer starts tracking your work hours from this moment\n\nNever enter the Start OTP until you are physically at the customer's location.",
  },
  {
    keywords: ["complete", "completion otp", "finish", "end job", "close booking", "job done", "how to complete"],
    answer: "When the work is complete:\n\n1. Confirm with the customer that they're satisfied\n2. Tap 'Generate Completion OTP' in your job screen\n3. Show the 4-digit OTP to the customer\n4. They'll enter it in their app to close the booking\n5. Your earnings are instantly credited to your wallet!\n\nOnly generate the Completion OTP when the job is fully finished.",
  },
  {
    keywords: ["earn", "earning", "salary", "payment", "income", "how much do i earn", "wage", "pay"],
    answer: "Your earnings are calculated automatically:\n\n💰 Formula: (Hourly Rate × Hours Worked) + Rs. 200 Visit Charge\n\nExample: Rs. 1,000/hr × 2 hours + Rs. 200 = Rs. 2,200 gross\n\nAthoo's commission is then deducted from this amount. Net earnings are visible in your Earnings screen after each completed job. All earnings history is downloadable as a report.",
  },
  {
    keywords: ["commission", "athoo due", "commission limit", "blocked", "dues", "platform commission", "how much commission"],
    answer: "How Athoo commission works:\n\n• A % commission is deducted from each completed job's earnings\n• When your accumulated unpaid commission reaches your limit, your account is temporarily paused\n• To clear dues: contact Finance Support from your Wallet screen and pay via bank transfer\n• After confirmation, your account is reactivated within a few hours\n\nKeep an eye on your commission meter in the Wallet screen!",
  },
  {
    keywords: ["negotiation", "offer", "counter", "price", "negotiate", "customer offer", "counter offer"],
    answer: "Handling price negotiations:\n\n1. Go to My Jobs → Negotiations tab\n2. You'll see pending offers from customers with their proposed price\n3. Options:\n   • Accept — booking is created at their price\n   • Counter — send your own price offer back\n   • Reject — decline the offer politely\n4. If both sides agree, the booking is confirmed automatically\n\nFast responses to negotiations increase your booking rate!",
  },
  {
    keywords: ["broadcast", "broadcast job", "open request", "find jobs", "bid"],
    answer: "Broadcast Jobs are open requests from customers:\n\n• When a customer broadcasts a job, you get notified instantly\n• View it in My Jobs → Broadcast Requests\n• See the job details, customer's budget, and location area\n• Send your offer price to compete with other providers\n• If the customer selects you, the booking is created\n\nBroadcast jobs are great for filling gaps in your schedule!",
  },
  {
    keywords: ["profile", "update profile", "edit profile", "services", "bio", "rate", "edit info"],
    answer: "Keep your profile updated to get more bookings:\n\n• Go to Profile → Edit Profile\n• Update: photo, bio, services offered, hourly rate, experience, and city\n• Add a professional bio — customers read this before booking!\n• A complete profile with a clear photo gets 3× more bookings\n• Upload your CNIC and certificates for the Verified badge",
  },
  {
    keywords: ["rating", "review", "stars", "feedback", "how to get good rating", "improve rating"],
    answer: "Tips to maintain a high rating:\n\n⭐ Always arrive on time (or notify the customer if delayed)\n⭐ Be professional, polite, and respectful\n⭐ Complete the work thoroughly — don't rush\n⭐ Keep your uniform/appearance clean\n⭐ Follow up with the customer: 'Are you satisfied?'\n\nYour average rating is shown on your profile and directly affects your search ranking. Aim for 4.5+ stars!",
  },
  {
    keywords: ["availability", "online", "offline", "toggle status", "go online", "go offline"],
    answer: "To control when you receive job requests:\n\n• Toggle your availability from the Dashboard or Profile screen\n• Online = you appear in customer searches and receive bookings\n• Offline = you're hidden from search and won't get new jobs\n• Your availability status syncs instantly across the app\n\nPro tip: Stay online during peak hours (9am–7pm) to maximize your earnings!",
  },
  {
    keywords: ["verification", "verified badge", "document", "cnic", "background check", "how to get verified"],
    answer: "Getting your Verified badge:\n\n1. Go to Profile → Verification\n2. Upload clear photos of your CNIC (front and back)\n3. Optionally: add experience certificates, police verification letter\n4. Our team reviews within 24 business hours\n5. Once approved, the ✅ Verified badge appears on your profile\n\nVerified providers appear higher in search results and get up to 40% more bookings!",
  },
  {
    keywords: ["privacy", "customer phone", "contact info", "customer number", "customer address"],
    answer: "Customer privacy is strictly protected:\n\n• Customer phone numbers are NEVER shown to providers\n• You only see the customer's first name and service area\n• Full address is revealed only after booking is confirmed\n• All communication must be through Athoo's in-app chat and call\n\nViolating customer privacy leads to immediate account suspension.",
  },
  {
    keywords: ["chat", "message", "customer", "in-app chat", "how to message"],
    answer: "Stay professional with in-app communication:\n\n• Chat with customers from any active booking's detail screen\n• Or open the Chat tab to see all your conversations\n• Messages are logged for dispute resolution\n• Never ask customers to communicate outside the app\n• Use the voice call feature for quick conversations",
  },
  {
    keywords: ["cancel", "cancelling", "booking cancelled", "how to cancel", "job cancellation"],
    answer: "If you need to cancel an accepted job:\n\n1. Open the booking from My Jobs\n2. Tap 'Cancel Booking' and provide a reason\n3. The customer is notified immediately\n\nCancellation policy:\n• Frequent cancellations reduce your reliability score\n• Low reliability score = lower search ranking = fewer bookings\n• Only cancel when absolutely necessary",
  },
  {
    keywords: ["more jobs", "visibility", "ranking", "search ranking", "get more work", "more bookings"],
    answer: "How to get more jobs on Athoo:\n\n✅ Keep your profile 100% complete with a clear photo\n✅ Maintain a rating of 4.0+ stars\n✅ Stay online during peak hours (9am–7pm)\n✅ Respond to booking requests within 5 minutes\n✅ Accept Broadcast jobs to build your history\n✅ Get your Verified badge\n✅ Keep your cancellation rate below 5%",
  },
  {
    keywords: ["subscription", "premium", "provider plan", "upgrade", "plan", "subscribe"],
    answer: "Athoo Provider Subscription benefits:\n\n• Higher priority in search results\n• Reduced commission rate\n• Access to premium Broadcast jobs first\n• Detailed earnings analytics\n• Priority customer support\n\nGo to Profile → Subscription to see available plans and subscribe.",
  },
  {
    keywords: ["withdrawal", "withdraw money", "cash out", "get money", "payout", "bank transfer"],
    answer: "To withdraw your wallet balance:\n\n1. Go to Wallet → Withdrawal Requests\n2. Enter the amount you want to withdraw\n3. Select your bank account or mobile wallet (JazzCash/Easypaisa)\n4. Submit the request\n5. Processing takes 24–48 business hours\n\nMake sure your payment account is set up in Profile → Payment Accounts before requesting a withdrawal.",
  },
  {
    keywords: ["payment account", "bank account", "jazzcash", "easypaisa", "add bank", "payout method"],
    answer: "To add your payout account:\n\n• Go to Profile → Payment Accounts\n• Add your bank account (IBAN) or mobile wallet (JazzCash/Easypaisa)\n• Verify your account with a small test deposit\n• You can have multiple accounts saved\n\nWithdrawal requests are only processed to verified accounts.",
  },
  {
    keywords: ["visit charge", "200", "call-out fee", "arrival fee", "fixed fee"],
    answer: "The Rs. 200 Visit Charge is a fixed fee added to every completed job:\n\n• It covers your travel/call-out cost to reach the customer\n• It's charged to the customer on top of your hourly rate\n• You receive it as part of your gross earnings before commission deduction\n• It applies to every job regardless of duration\n\nExample: 1 hour job at Rs. 1,000/hr → You earn Rs. 1,200 (before commission).",
  },
  {
    keywords: ["dispute", "complaint", "customer complaint", "unfair review", "false review"],
    answer: "If a customer files an unfair complaint or review:\n\n1. Submit your side from the booking detail → 'Dispute Review'\n2. Or contact us via Profile → Help → Contact Support\n3. Provide any evidence (photos, chat history)\n4. Our team investigates within 48 hours and reaches out to both parties\n\nWe ensure fair treatment for all providers. Malicious reviews are removed after investigation.",
  },
  {
    keywords: ["customer dispute", "job dispute", "payment dispute", "customer not paying"],
    answer: "If a customer refuses to pay or disputes the job:\n\n1. Do not escalate — stay calm and professional\n2. Take photos of the completed work immediately\n3. Report the issue via the booking → 'Report Issue'\n4. Contact Finance Support: WhatsApp +92 339 0051068\n\nAthoo mediates all payment disputes. Our logs (OTP entries, chat, timestamps) serve as evidence.",
  },
  {
    keywords: ["registration", "how to register", "join athoo", "become provider", "sign up"],
    answer: "To register as an Athoo provider:\n\n1. Download the Athoo app and select 'Join as Provider'\n2. Enter your personal details and choose your services\n3. Upload your CNIC front and back\n4. Submit any certificates (plumbing, electrical, etc.)\n5. Our team reviews within 24–48 hours\n6. Once approved, set your rate and go online!\n\nFor help: WhatsApp +92 339 0051068",
  },
  {
    keywords: ["hello", "hi", "hey", "assalam", "salam", "good morning"],
    answer: "Hello! Welcome to Athoo Provider Support! 😊\n\nI'm here to help you with:\n• Job flow (accepting, starting, completing jobs)\n• Earnings and commission\n• Profile and verification\n• Negotiations and broadcast jobs\n• Withdrawals and payments\n\nWhat can I help you with today?",
  },
  {
    keywords: ["thank", "thanks", "thank you", "shukria"],
    answer: "You're welcome! Keep up the great work! 💪\n\nIs there anything else I can help you with? I'm always here if you have more questions about jobs, earnings, or your Athoo account.",
  },
  {
    keywords: ["support", "contact", "whatsapp", "team", "contact us", "contact support"],
    answer: "Provider Support is available:\n\n📱 WhatsApp: +92 339 0051068 (9am–9pm daily)\n📸 Instagram: @athoo_services\n📘 Facebook: athoo.services\n\nOr go to Profile → Help → Contact Support to submit a support ticket. We prioritize provider queries and respond within a few hours!",
  },
  {
    keywords: ["travel distance", "service area", "service radius", "how far", "travel radius", "max distance", "coverage area", "work distance", "km limit"],
    answer: "You can set your maximum travel distance to only receive jobs you're willing to reach!\n\n• Go to Profile → Service Radius\n• Set your maximum travel distance in kilometers (e.g. 5 km, 10 km, 20 km)\n• Customers outside your radius won't see you in their search results\n• You can change this setting at any time\n\nTip: A radius of 10–15 km covers most of Rawalpindi or Islamabad comfortably. Set a larger radius to get more jobs, smaller for convenience.",
  },
  {
    keywords: ["badge", "top rated", "100 jobs", "what are badges", "how to get badge", "premium badge", "earn badge", "my badges"],
    answer: "Provider badges are automatically awarded based on your performance:\n\n⭐ Top Rated — maintain a 4.7+ average rating\n⭐ Highly Rated — maintain a 4.0+ average rating\n💼 100+ Jobs — complete 100 or more jobs on Athoo\n💼 50+ Jobs — complete 50 or more jobs\n✨ Premium — subscribe to an Athoo Premium plan\n\nBadges appear on your profile card in customer search results. Top Rated and 100+ Jobs badges significantly increase your booking rate. Focus on quality and consistency!",
  },
  {
    keywords: ["pre job reminder", "advance reminder", "booking reminder", "reminder sent", "appointment reminder", "notification before job"],
    answer: "Athoo automatically sends your customer a reminder before their booking!\n\n• 30–60 minutes before the scheduled time, the customer receives a push notification\n• This reduces 'no one home' situations when you arrive\n• You'll also see the booking highlighted in your Jobs screen before the appointment\n\nThis system reduces cancellations and wasted trips. Keep your scheduled bookings on time and you'll earn more 5-star reviews!",
  },
];

function findAnswer(input: string, role: "customer" | "provider"): string {
  const q = input.toLowerCase().trim();
  const faqs = role === "provider" ? PROVIDER_FAQS : CUSTOMER_FAQS;

  // ── 1. GREETING ──────────────────────────────────────────────────────────
  if (/^(hi+|hello+|hey+|salam|assalamualaikum|assalam|aoa|good\s*(morning|afternoon|evening|day)|howdy)\b/.test(q)) {
    const f = faqs.find((x) => x.keywords.includes("hello"));
    if (f) return f.answer;
  }

  // ── 2. THANK YOU ─────────────────────────────────────────────────────────
  if (/thank|shukria|shukriya|jazakallah|jazak allah|meherbani/.test(q)) {
    const f = faqs.find((x) => x.keywords.includes("thank"));
    if (f) return f.answer;
  }

  // ── 3. "CAN YOU HELP ME?" / "I NEED HELP" ────────────────────────────────
  if (
    /can you help|could you help|help me|i need help|need some help|need assistance|please help|koi help|madad|help kar/.test(q) &&
    !q.includes("billing") && !q.includes("payment") && !q.includes("cancel") &&
    !q.includes("booking") && !q.includes("provider") && !q.includes("refund")
  ) {
    return role === "provider"
      ? "Of course! I'm here to help you. 😊\n\nI can assist you with things like:\n• Accepting and managing jobs\n• Understanding your earnings and commission\n• Handling negotiations and broadcast jobs\n• Getting your Verified badge\n• Withdrawal and payment accounts\n• Profile tips to get more bookings\n\nWhat would you like help with?"
      : "Of course! I'm here to help you. 😊\n\nI can assist you with things like:\n• Booking a service\n• Finding and choosing a provider\n• Understanding payments and invoices\n• Tracking your provider\n• Cancellations, complaints, or refunds\n• Account and profile settings\n\nWhat would you like to know?";
  }

  // ── 4. "WHAT CAN YOU DO?" / CAPABILITIES ─────────────────────────────────
  if (
    /what can you do|what do you do|how can you help|what are you (for|capable|able)|your capabilities|capabilities|what (topics|things|questions)|how do you work|what (will|shall) you|tell me what you|guide me|assist me/.test(q) &&
    q.length < 80
  ) {
    return role === "provider"
      ? "Great question! Here's what I can help you with as an Athoo provider:\n\n🔧 Job Management — accepting, starting, completing jobs with OTPs\n💰 Earnings & Commission — how your pay is calculated, dues, withdrawals\n🤝 Negotiations — handling customer offers and counter-offers\n📢 Broadcast Jobs — finding and bidding on open requests\n⭐ Profile & Ratings — getting more bookings and the Verified badge\n🔐 Privacy & Chat — communicating safely with customers\n📱 App Features — availability toggle, notifications, and more\n\nJust type your question and I'll guide you right away!"
      : "Great question! Here's what I can help you with as an Athoo customer:\n\n📅 Booking Services — how to book, schedule, and manage bookings\n🔍 Finding Providers — searching, filtering, and comparing providers\n💬 Negotiating Prices — sending offers and counter-offers like InDrive\n📢 Broadcast Requests — posting a job to all providers at once\n💸 Payments & Invoices — understanding your bill and payment process\n📍 Live Tracking — tracking your provider on the map\n🌟 Reviews & Complaints — rating providers and reporting issues\n🔐 Account & Privacy — your data, addresses, and profile\n\nJust ask me anything — I'm happy to help!";
  }

  // ── 5. WHO ARE YOU / WHAT ARE YOU ────────────────────────────────────────
  if (/who are you|what are you|are you (a bot|an ai|a robot|human|real|automated)|are you real|you (a bot|an ai)/.test(q)) {
    return role === "provider"
      ? "I'm Athoo Assistant — your smart support companion built into the Athoo provider app! 🤖\n\nI'm here 24/7 to answer your questions about jobs, earnings, bookings, commissions, and everything else related to your Athoo provider account.\n\nI'm not a human, but I'm trained specifically on Athoo's platform so I can give you fast and accurate answers. For complex issues, I'll direct you to our human support team.\n\nWhat can I help you with today?"
      : "I'm Athoo Assistant — your smart support companion built right into the Athoo app! 🤖\n\nI'm here 24/7 to answer your questions about bookings, providers, payments, and everything Athoo-related.\n\nI'm not a human, but I know Athoo inside out and can guide you through anything quickly. For issues that need human attention, I'll connect you with our support team.\n\nWhat would you like to know?";
  }

  // ── 6. BRIEF AFFIRMATION / SHORT AMBIGUOUS INPUT ─────────────────────────
  if (/^(ok|okay|alright|sure|fine|got it|understood|i see|achha|thik hai|theek|haan|han|yes|no|nope|yep|yeah|hmm+|k|kk|cool)\.?$/.test(q)) {
    return role === "provider"
      ? "Got it! 😊 Feel free to ask me anything about your jobs, earnings, bookings, or Athoo provider account. I'm here to help!"
      : "Got it! 😊 Feel free to ask me anything about bookings, providers, payments, or your Athoo account. I'm here whenever you need me!";
  }

  // ── 7. KEYWORDS SCORING ──────────────────────────────────────────────────
  let bestMatch: FAQ | null = null;
  let bestScore = 0;

  for (const faq of faqs) {
    let score = 0;
    for (const keyword of faq.keywords) {
      if (q.includes(keyword)) {
        const wordCount = keyword.split(" ").length;
        score += wordCount * 2;
        if (q.startsWith(keyword)) score += 3;
        if (q === keyword) score += 5;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = faq;
    }
  }

  if (bestMatch && bestScore > 0) return bestMatch.answer;

  // ── 8. FRIENDLY FALLBACK ─────────────────────────────────────────────────
  const hasQuestion = q.includes("?") || q.startsWith("how") || q.startsWith("what") || q.startsWith("why") || q.startsWith("when") || q.startsWith("where") || q.startsWith("can") || q.startsWith("is ");

  if (hasQuestion) {
    return role === "provider"
      ? "Hmm, I'm not sure about that one! 🤔\n\nYou can reach our Provider Support team who can answer this for you:\n\n📱 WhatsApp: +92 339 0051068 (9am–9pm daily)\n\nOr go to Profile → Help → Contact Support in your app. We'll get back to you within a few hours!"
      : "Hmm, I'm not sure about that one! 🤔\n\nYou can reach our support team who will be happy to help:\n\n📱 WhatsApp: +92 339 0051068 (9am–9pm daily)\n\nOr go to Profile → Help → Contact Support in the app. We'll get back to you within a few hours!";
  }

  return role === "provider"
    ? "I didn't quite catch that. Could you rephrase your question? 😊\n\nYou can ask me about jobs, earnings, negotiations, commission, withdrawals, verification, or anything else about your Athoo provider account!"
    : "I didn't quite catch that. Could you rephrase your question? 😊\n\nYou can ask me about bookings, providers, payments, tracking, cancellations, complaints, or anything else about your Athoo experience!";
}

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message?.trim()) return res.status(400).json({ error: "Message is required" });
    const role = (req.user!.role === "provider" ? "provider" : "customer") as "customer" | "provider";
    const answer = findAnswer(message.trim(), role);
    // Simulate slight thinking delay for realism (100-300ms)
    await new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 180));
    return res.json({ reply: answer, role });
  } catch (e) {
    return res.status(500).json({ error: "Chatbot error" });
  }
});

export default router;
