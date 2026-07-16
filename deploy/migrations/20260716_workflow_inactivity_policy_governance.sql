-- Phase 8: inactivity lifecycle automation and policy governance.
-- Permanent deletion is intentionally never automatic. Long-inactive accounts
-- enter an admin review queue after user notifications and provider matching
-- restrictions have been applied.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivity_state text DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivity_warning_sent_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivity_restricted_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivity_review_at timestamp;

UPDATE users
SET last_active_at = COALESCE(last_active_at, updated_at, joined_at, NOW()),
    inactivity_state = COALESCE(NULLIF(inactivity_state, ''), 'active')
WHERE last_active_at IS NULL OR inactivity_state IS NULL OR inactivity_state = '';

ALTER TABLE users ALTER COLUMN last_active_at SET DEFAULT NOW();
ALTER TABLE users ALTER COLUMN inactivity_state SET DEFAULT 'active';

CREATE INDEX IF NOT EXISTS users_last_active_at_idx ON users(last_active_at);
CREATE INDEX IF NOT EXISTS users_inactivity_state_idx ON users(inactivity_state);
CREATE INDEX IF NOT EXISTS users_inactivity_review_queue_idx
  ON users(inactivity_review_at, last_active_at)
  WHERE role IN ('customer', 'provider')
    AND account_status = 'active'
    AND is_deactivated = false
    AND is_blocked = false;

CREATE TABLE IF NOT EXISTS policy_documents (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  title_ur text,
  summary text,
  summary_ur text,
  body_en text NOT NULL,
  body_ur text,
  version text NOT NULL DEFAULT '1.0',
  audience text NOT NULL DEFAULT 'all',
  requires_acceptance boolean DEFAULT false,
  is_published boolean DEFAULT false,
  published_at timestamp,
  updated_by text,
  created_at timestamp DEFAULT NOW(),
  updated_at timestamp DEFAULT NOW(),
  CONSTRAINT policy_documents_audience_check CHECK (audience IN ('all', 'customer', 'provider')),
  CONSTRAINT policy_documents_slug_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE INDEX IF NOT EXISTS policy_documents_audience_idx ON policy_documents(audience);
CREATE INDEX IF NOT EXISTS policy_documents_published_idx ON policy_documents(is_published, audience);

INSERT INTO policy_documents
  (id, slug, title, title_ur, summary, summary_ur, body_en, body_ur, version, audience, requires_acceptance, is_published, published_at)
VALUES
  ('policy-privacy', 'privacy', 'Privacy Policy', 'رازداری پالیسی',
   'How Athoo collects, uses, protects, retains, and deletes information.',
   'اتھو معلومات کیسے جمع، استعمال، محفوظ، برقرار اور حذف کرتا ہے۔',
   $policy$Athoo collects only the account, profile, location, booking, communication, security, verification, payment-evidence, and support information needed to operate the platform safely. Access is limited to authorized workflows. Private documents are not displayed publicly. Information may be retained where required for dispute handling, fraud prevention, safety, financial records, audits, or applicable obligations. Users may request account deletion from Privacy & Security. Device permissions can be managed in phone settings. Privacy requests should be submitted through Athoo Support so they can be verified and tracked.$policy$,
   $policy$اتھو صرف وہ اکاؤنٹ، پروفائل، لوکیشن، بکنگ، رابطہ، سیکیورٹی، تصدیق، ادائیگی کے ثبوت اور سپورٹ معلومات جمع کرتا ہے جو پلیٹ فارم کو محفوظ طریقے سے چلانے کے لیے ضروری ہوں۔ رسائی صرف مجاز ورک فلو تک محدود ہے۔ نجی دستاویزات عوامی طور پر ظاہر نہیں کی جاتیں۔ تنازعات، فراڈ کی روک تھام، حفاظت، مالی ریکارڈ، آڈٹ یا قابلِ اطلاق ذمہ داریوں کے لیے معلومات ضروری مدت تک محفوظ رہ سکتی ہیں۔ صارف رازداری و سیکیورٹی سے اکاؤنٹ حذف کرنے کی درخواست دے سکتے ہیں۔$policy$,
   '1.0', 'all', true, true, NOW()),
  ('policy-terms', 'terms', 'Terms of Service', 'سروس کی شرائط',
   'Rules for accounts, bookings, providers, payments, conduct, and platform use.',
   'اکاؤنٹس، بکنگ، فراہم کنندگان، ادائیگی، رویے اور پلیٹ فارم استعمال کے اصول۔',
   $policy$Athoo is a technology marketplace connecting customers with independent service providers. Users must provide accurate information, protect account credentials, communicate and agree service terms through the app, submit genuine evidence, comply with applicable laws, and avoid abuse, fraud, harassment, unsafe work, or platform circumvention. Providers are responsible for accepting only work they are qualified and available to perform. Athoo may warn, restrict, suspend, or remove accounts to protect users, enforce policies, meet legal obligations, or address unpaid platform obligations. Available review and support channels remain subject to safety and evidence requirements.$policy$,
   $policy$اتھو ایک ٹیکنالوجی مارکیٹ پلیس ہے جو کسٹمر کو آزاد سروس فراہم کنندگان سے جوڑتا ہے۔ صارف درست معلومات فراہم کریں، اکاؤنٹ کی حفاظت کریں، سروس کی شرائط ایپ میں طے کریں، حقیقی ثبوت جمع کریں، قابلِ اطلاق قوانین پر عمل کریں اور بدسلوکی، فراڈ، ہراسانی، غیر محفوظ کام یا پلیٹ فارم کو نظرانداز کرنے سے گریز کریں۔ اتھو صارفین کے تحفظ اور پالیسی نافذ کرنے کے لیے اکاؤنٹ محدود، معطل یا ختم کر سکتا ہے۔$policy$,
   '1.0', 'all', true, true, NOW()),
  ('policy-community', 'community-guidelines', 'Community Guidelines', 'کمیونٹی رہنما اصول',
   'Professional, safe, respectful conduct for every Athoo user.',
   'ہر اتھو صارف کے لیے پیشہ ورانہ، محفوظ اور باعزت رویہ۔',
   $policy$Treat every person with respect. Do not harass, threaten, discriminate, exploit, impersonate, share illegal content, request unsafe services, misuse personal information, manipulate ratings, create fake jobs, or submit false documents or payment evidence. Keep communication relevant to the service and use Athoo reporting and support tools when something is unsafe or inappropriate. Serious or repeated violations may result in immediate restriction or suspension.$policy$,
   $policy$ہر شخص کے ساتھ احترام سے پیش آئیں۔ ہراسانی، دھمکی، امتیاز، استحصال، جعل سازی، غیر قانونی مواد، غیر محفوظ سروس، ذاتی معلومات کا غلط استعمال، جعلی ریٹنگ، جعلی جاب، غلط دستاویز یا ادائیگی کا جعلی ثبوت ممنوع ہے۔ غیر محفوظ یا نامناسب صورت میں اتھو کی رپورٹ اور سپورٹ سہولت استعمال کریں۔$policy$,
   '1.0', 'all', false, true, NOW()),
  ('policy-complaints', 'complaints-policy', 'Complaints and Support Policy', 'شکایات اور سپورٹ پالیسی',
   'How complaints are submitted, evidenced, prioritized, investigated, and resolved.',
   'شکایات کیسے جمع، ثابت، ترجیح، تحقیق اور حل کی جاتی ہیں۔',
   $policy$Complaints should be submitted through the in-app support system with accurate details, the related booking when available, and relevant evidence. Athoo may request more information, contact involved users, preserve records, restrict accounts during a safety review, or close duplicate and abusive tickets. Resolution timing depends on urgency, evidence, third-party responses, and complexity. Emergency situations should be reported to the appropriate local emergency authority in addition to Athoo.$policy$,
   $policy$شکایت ایپ کے سپورٹ سسٹم کے ذریعے درست تفصیل، متعلقہ بکنگ اور دستیاب ثبوت کے ساتھ جمع کریں۔ اتھو مزید معلومات مانگ سکتا ہے، متعلقہ صارفین سے رابطہ، ریکارڈ محفوظ، حفاظتی جائزے کے دوران اکاؤنٹ محدود یا دہرائے گئے اور نامناسب ٹکٹ بند کر سکتا ہے۔$policy$,
   '1.0', 'all', false, true, NOW()),
  ('policy-commission', 'commission-policy', 'Provider Commission Policy', 'فراہم کنندہ کمیشن پالیسی',
   'Commission calculation, evidence, approval, dues, restrictions, and disputes.',
   'کمیشن کی گنتی، ثبوت، منظوری، واجبات، پابندیاں اور تنازعات۔',
   $policy$The commission rate and any eligible premium discount are shown in the app and applied to completed services according to the active platform configuration. Providers must submit genuine payment references and evidence. Evidence can be rejected when incomplete, duplicate, altered, or inconsistent. Unpaid commission above the configured limit may pause new-job eligibility until reviewed or paid. Commission disputes should identify the booking, amount, and supporting evidence through Athoo Support.$policy$,
   $policy$کمیشن کی شرح اور اہل پریمیم رعایت ایپ میں دکھائی جاتی ہے اور فعال پلیٹ فارم ترتیب کے مطابق مکمل سروس پر لاگو ہوتی ہے۔ فراہم کنندہ حقیقی ادائیگی ریفرنس اور ثبوت جمع کرے۔ نامکمل، دہرایا ہوا یا تبدیل شدہ ثبوت مسترد ہو سکتا ہے۔ مقررہ حد سے زیادہ واجب الادا کمیشن نئی جاب کی اہلیت روک سکتا ہے۔$policy$,
   '1.0', 'provider', false, true, NOW()),
  ('policy-refund', 'refund-cancellation-policy', 'Refund and Cancellation Policy', 'رقم واپسی اور منسوخی پالیسی',
   'Rules for cancellations, manual-payment evidence, refund review, and outcomes.',
   'منسوخی، دستی ادائیگی کے ثبوت، رقم واپسی کے جائزے اور نتائج کے اصول۔',
   $policy$Cancellation windows, fees, and provider penalties are shown in the booking flow and controlled by current platform settings. Refund eligibility depends on booking status, agreed terms, evidence, service delivery, cancellations, and payment verification. Athoo may approve, partially approve, reject, or request additional evidence. Because payments are currently manual, users must provide accurate transaction references and payment evidence. A submitted request does not guarantee a refund.$policy$,
   $policy$منسوخی کی مدت، فیس اور فراہم کنندہ جرمانے بکنگ ورک فلو میں دکھائے جاتے ہیں اور موجودہ پلیٹ فارم سیٹنگز کے مطابق ہوتے ہیں۔ رقم واپسی کی اہلیت بکنگ کی حالت، طے شدہ شرائط، ثبوت، سروس کی فراہمی، منسوخی اور ادائیگی کی تصدیق پر منحصر ہے۔$policy$,
   '1.0', 'all', false, true, NOW()),
  ('policy-restriction', 'account-restriction-policy', 'Account Restriction Policy', 'اکاؤنٹ پابندی پالیسی',
   'Reasons, safeguards, notices, reviews, and effects of account restrictions.',
   'اکاؤنٹ پابندی کی وجوہات، حفاظتی اقدامات، اطلاعات، جائزے اور اثرات۔',
   $policy$Athoo may warn, limit matching, disable provider availability, revoke sessions, block actions, suspend, or deactivate an account for safety risks, fraud indicators, false evidence, abusive conduct, repeated no-shows, unresolved commission obligations, policy breaches, legal requirements, or extended inactivity. Restrictions should be proportionate to risk and recorded in the audit trail. Where appropriate, the user receives a reason and can request review through support. Athoo may withhold detailed security methods when disclosure could enable abuse.$policy$,
   $policy$اتھو حفاظتی خطرات، فراڈ، غلط ثبوت، بدسلوکی، بار بار عدم حاضری، غیر حل شدہ کمیشن، پالیسی خلاف ورزی، قانونی تقاضے یا طویل غیر فعالیت کی وجہ سے وارننگ، میچنگ محدود، دستیابی بند، سیشن منسوخ، اکاؤنٹ معطل یا غیر فعال کر سکتا ہے۔ مناسب صورت میں صارف وجہ اور جائزے کی درخواست کا حق رکھتا ہے۔$policy$,
   '1.0', 'all', false, true, NOW()),
  ('policy-deletion', 'account-deletion-retention-policy', 'Account Deletion and Retention Policy', 'اکاؤنٹ حذف اور معلومات برقرار رکھنے کی پالیسی',
   'Deletion requests, grace periods, inactivity review, and records Athoo may retain.',
   'حذف درخواست، مہلت، غیر فعالیت جائزہ اور برقرار رکھے جانے والے ریکارڈ۔',
   $policy$A user-requested deletion enters a seven-day grace period and can be cancelled before completion. Permanent deletion is not triggered automatically by inactivity. Long-inactive accounts may receive reminders, have provider matching paused, and enter an administrator review queue. Athoo may retain limited records needed for fraud prevention, disputes, safety, financial reconciliation, audits, or applicable obligations. Retained records must remain access-controlled and should not be used for unrelated marketing.$policy$,
   $policy$صارف کی حذف درخواست سات دن کی مہلت میں داخل ہوتی ہے اور تکمیل سے پہلے منسوخ کی جا سکتی ہے۔ صرف غیر فعالیت کی وجہ سے مستقل حذف خودکار نہیں ہوتا۔ طویل غیر فعال اکاؤنٹ کو یاددہانی، فراہم کنندہ میچنگ کی عارضی پابندی اور ایڈمن جائزہ ہو سکتا ہے۔ ضروری حفاظتی، مالی، تنازعہ اور آڈٹ ریکارڈ محدود مدت تک محفوظ رہ سکتے ہیں۔$policy$,
   '1.0', 'all', false, true, NOW()),
  ('policy-rights', 'athoo-rights-and-controls', 'Athoo Rights and Platform Controls', 'اتھو کے حقوق اور پلیٹ فارم کنٹرولز',
   'Operational controls Athoo may use to protect users and maintain the service.',
   'صارفین کے تحفظ اور سروس برقرار رکھنے کے لیے اتھو کے عملی کنٹرولز۔',
   $policy$Athoo may configure categories, service areas, pricing rules, commission, verification requirements, matching radius, notification delivery, premium benefits, booking limits, safety controls, evidence requirements, maintenance mode, and access permissions. Athoo may investigate activity, preserve evidence, correct operational errors, reverse unauthorized actions, and cooperate with lawful requests. Product names, branding, interfaces, content, and platform technology remain protected. These controls do not remove rights that users have under applicable law.$policy$,
   $policy$اتھو کیٹیگری، سروس ایریا، قیمت کے اصول، کمیشن، تصدیق، میچنگ ریڈیئس، نوٹیفکیشن، پریمیم فوائد، بکنگ حدود، حفاظتی کنٹرول، ثبوت، مینٹیننس اور رسائی اجازتیں ترتیب دے سکتا ہے۔ اتھو سرگرمی کی تحقیق، ثبوت محفوظ، آپریشنل غلطی درست اور غیر مجاز کارروائی واپس کر سکتا ہے۔$policy$,
   '1.0', 'all', false, true, NOW())
ON CONFLICT (slug) DO NOTHING;
