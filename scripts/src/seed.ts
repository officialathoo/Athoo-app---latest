/**
 * ATHOO — Database Seed Script
 *
 * Seeds: Super Admin, Demo Customer, Demo Provider, Categories,
 * Service Areas, Payment Accounts, Emergency Contacts,
 * Subscription Plans, Platform Settings, Notification Templates.
 *
 * Run: pnpm --filter @workspace/scripts run seed
 *
 * Development-only seed. Never run against production.
 * Required: SEED_ADMIN_PASSWORD (12+ chars, upper/lower/number/symbol).
 * Optional: SEED_DEMO_PASSWORD (defaults to a development-only value).
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as bcrypt from "bcryptjs";
import * as schema from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import crypto from "crypto";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

if (process.env.NODE_ENV === "production" || process.env.ALLOW_PRODUCTION_SEED === "1") {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Database seeding is disabled in production. Create the first administrator through the secure bootstrap command.");
  }
}

const seedAdminPassword = String(process.env.SEED_ADMIN_PASSWORD || "");
const seedDemoPassword = String(process.env.SEED_DEMO_PASSWORD || "Demo@123!dev");
const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
if (!strongPassword.test(seedAdminPassword)) {
  throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters and include upper, lower, number, and symbol.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const id = () => crypto.randomUUID();
const hash = (pw: string) => bcrypt.hashSync(pw, 12);
const publicUserId = (role: "customer" | "provider" | "admin", rawId: string) => {
  const prefix = role === "provider" ? "PRO" : role === "admin" ? "ADM" : "CUS";
  const digest = crypto.createHash("sha256").update(`${role}:${rawId}`).digest("hex").slice(0, 16).toUpperCase();
  return `${prefix}-${digest}`;
};

async function seed() {
  console.log("🌱 Starting ATHOO seed...\n");

  // ─── PLATFORM SETTINGS ────────────────────────────────────────────────────
  console.log("⚙️  Platform settings...");
  await db
    .insert(schema.appSettingsTable)
    .values({
      key: "platform",
      value: {
        commissionRate: 10,
        defaultCommissionLimit: 5000,
        platformName: "Athoo",
        supportPhone: "+92 339 0051068",
        supportEmail: "support@athoo.pk",
        maintenanceMode: false,
        defaultVisitCharge: 200,
        maxBookingsPerDay: 10,
        appVersion: "1.0.0",
        minBookingNoticeHours: 1,
        allowGuestBrowsing: true,
        providerAutoApprove: false,
        bookingCancellationWindowHours: 1,
        broadcastTTLMinutes: 3,
        broadcastExpandIntervalMinutes: 1,
        defaultServiceRadiusKm: 15,
        maxNegotiationRounds: 3,
        premiumProfileBadgeEnabled: true,
        customerCancellationFee: 0,
        providerCancellationPenalty: 0,
        premiumCommissionDiscountPercent: 10,
      },
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  // ─── SERVICE CATEGORIES ───────────────────────────────────────────────────
  console.log("📂 Service categories...");
  const categories = [
    { id: "cat-electrician", name: "Electrician",      nameUr: "الیکٹریشن",  slug: "electrician",  icon: "zap",          color: "#F59E0B", visitCharge: 200, commissionPct: 10, minHourlyRate: 500,  maxHourlyRate: 2000, sortOrder: 1  },
    { id: "cat-plumber",     name: "Plumber",          nameUr: "پلمبر",       slug: "plumber",      icon: "droplets",     color: "#3B82F6", visitCharge: 200, commissionPct: 10, minHourlyRate: 500,  maxHourlyRate: 2000, sortOrder: 2  },
    { id: "cat-carpenter",   name: "Carpenter",        nameUr: "ترکھان",      slug: "carpenter",    icon: "hammer",       color: "#92400E", visitCharge: 200, commissionPct: 10, minHourlyRate: 600,  maxHourlyRate: 2500, sortOrder: 3  },
    { id: "cat-painter",     name: "Painter",          nameUr: "رنگ ساز",     slug: "painter",      icon: "paint-bucket", color: "#EF4444", visitCharge: 150, commissionPct: 10, minHourlyRate: 400,  maxHourlyRate: 1500, sortOrder: 4  },
    { id: "cat-ac-repair",   name: "AC Repair",        nameUr: "اے سی مرمت", slug: "ac-repair",    icon: "wind",         color: "#06B6D4", visitCharge: 300, commissionPct: 12, minHourlyRate: 800,  maxHourlyRate: 3000, sortOrder: 5  },
    { id: "cat-cleaning",    name: "Cleaning",         nameUr: "صفائی",       slug: "cleaning",     icon: "sparkles",     color: "#10B981", visitCharge: 150, commissionPct: 10, minHourlyRate: 300,  maxHourlyRate: 1200, sortOrder: 6  },
    { id: "cat-pest",        name: "Pest Control",     nameUr: "کیڑے مار",    slug: "pest-control", icon: "bug",          color: "#84CC16", visitCharge: 200, commissionPct: 12, minHourlyRate: 600,  maxHourlyRate: 2000, sortOrder: 7  },
    { id: "cat-gas",         name: "Gas Repair",       nameUr: "گیس مرمت",    slug: "gas-repair",   icon: "flame",        color: "#F97316", visitCharge: 200, commissionPct: 10, minHourlyRate: 500,  maxHourlyRate: 2000, sortOrder: 8  },
    { id: "cat-cctv",        name: "CCTV & Security",  nameUr: "سیکیورٹی",    slug: "cctv",         icon: "camera",       color: "#6366F1", visitCharge: 300, commissionPct: 12, minHourlyRate: 800,  maxHourlyRate: 3000, sortOrder: 9  },
    { id: "cat-appliance",   name: "Appliance Repair", nameUr: "آلات مرمت",   slug: "appliance",    icon: "tv",           color: "#8B5CF6", visitCharge: 200, commissionPct: 10, minHourlyRate: 500,  maxHourlyRate: 2000, sortOrder: 10 },
    { id: "cat-shifting",    name: "House Shifting",   nameUr: "گھر شفٹنگ",   slug: "shifting",     icon: "truck",        color: "#64748B", visitCharge: 500, commissionPct: 10, minHourlyRate: 1000, maxHourlyRate: 5000, sortOrder: 11 },
    { id: "cat-gardening",   name: "Gardening",        nameUr: "باغبانی",      slug: "gardening",    icon: "leaf",         color: "#22C55E", visitCharge: 150, commissionPct: 10, minHourlyRate: 400,  maxHourlyRate: 1500, sortOrder: 12 },
  ];
  for (const cat of categories) {
    await db
      .insert(schema.serviceCategoriesTable)
      .values({ ...cat, isActive: true, createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoNothing();
  }

  // ─── SERVICE AREAS ────────────────────────────────────────────────────────
  console.log("📍 Service areas...");
  const areas = [
    { id: "area-lahore",     name: "Lahore",      province: "Punjab",      sortOrder: 1  },
    { id: "area-karachi",    name: "Karachi",     province: "Sindh",       sortOrder: 2  },
    { id: "area-islamabad",  name: "Islamabad",   province: "ICT",         sortOrder: 3  },
    { id: "area-rwp",        name: "Rawalpindi",  province: "Punjab",      sortOrder: 4  },
    { id: "area-faisalabad", name: "Faisalabad",  province: "Punjab",      sortOrder: 5  },
    { id: "area-multan",     name: "Multan",      province: "Punjab",      sortOrder: 6  },
    { id: "area-peshawar",   name: "Peshawar",    province: "KPK",         sortOrder: 7  },
    { id: "area-quetta",     name: "Quetta",      province: "Balochistan", sortOrder: 8  },
    { id: "area-gujranwala", name: "Gujranwala",  province: "Punjab",      sortOrder: 9  },
    { id: "area-sialkot",    name: "Sialkot",     province: "Punjab",      sortOrder: 10 },
    { id: "area-hyderabad",  name: "Hyderabad",   province: "Sindh",       sortOrder: 11 },
    { id: "area-bahawalpur", name: "Bahawalpur",  province: "Punjab",      sortOrder: 12 },
  ];
  for (const area of areas) {
    await db
      .insert(schema.serviceAreasTable)
      .values({ ...area, isActive: true, createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoNothing();
  }

  // ─── PAYMENT ACCOUNTS ─────────────────────────────────────────────────────
  console.log("🏦 Payment accounts...");
  await db
    .insert(schema.paymentAccountsTable)
    .values([
      { id: "pac-hbl",       label: "HBL Main Account", bankName: "Habib Bank Limited", accountTitle: "ATHOO Technologies", accountNumber: "01234567890123",  iban: "PK36HABB0000000123456701", instructions: "Transfer exact amount. Use your phone number as reference.", isActive: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: "pac-jazz",      label: "JazzCash",          bankName: null,                 accountTitle: "ATHOO Technologies", accountNumber: "03001234567",      iban: null,                       instructions: "Send to mobile account. Screenshot required.",               isActive: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
      { id: "pac-easypaisa", label: "Easypaisa",         bankName: null,                 accountTitle: "ATHOO Technologies", accountNumber: "03001234567",      iban: null,                       instructions: "Send to mobile account. Screenshot required.",               isActive: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
    ])
    .onConflictDoNothing();

  // ─── EMERGENCY CONTACTS ───────────────────────────────────────────────────
  console.log("🆘 Emergency contacts...");
  await db
    .insert(schema.emergencyContactsTable)
    .values([
      { id: "ec-police",       name: "Police",          number: "15",            description: "Emergency police helpline",          icon: "shield",      sortOrder: 1, isActive: true },
      { id: "ec-fire",         name: "Fire Brigade",    number: "16",            description: "Fire emergency services",            icon: "flame",       sortOrder: 2, isActive: true },
      { id: "ec-ambulance",    name: "Ambulance",       number: "1122",          description: "Emergency ambulance service",        icon: "activity",    sortOrder: 3, isActive: true },
      { id: "ec-womenhelpline",name: "Women Helpline",  number: "1099",          description: "Women safety and support helpline",  icon: "heart",       sortOrder: 4, isActive: true },
      { id: "ec-rescue",       name: "Rescue 1122",     number: "1122",          description: "Punjab emergency rescue service",    icon: "phone-call",  sortOrder: 5, isActive: true },
      { id: "ec-athoo",        name: "ATHOO Support",   number: "+923390051068", description: "ATHOO platform customer support",    icon: "headphones",  sortOrder: 6, isActive: true },
    ])
    .onConflictDoNothing();

  // ─── SUBSCRIPTION PLANS ───────────────────────────────────────────────────
  console.log("💳 Subscription plans...");
  await db
    .insert(schema.subscriptionPlansTable)
    .values([
      { id: "plan-basic", name: "Basic",          description: "Get started on ATHOO with essential features.",                           audience: "provider", priceMonthly: 0,    priceYearly: 0,     features: ["Profile listing","Customer messaging","Standard support"],                                                                                                    isActive: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: "plan-pro",   name: "Pro Provider",   description: "Priority listing and reduced commission for serious professionals.",       audience: "provider", priceMonthly: 999,  priceYearly: 9999,  features: ["Priority search ranking","Pro badge on profile","10% commission discount","Dedicated support","Analytics dashboard"],                                       isActive: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
      { id: "plan-elite", name: "Elite Provider", description: "Maximum visibility and lowest commission for top providers.",             audience: "provider", priceMonthly: 1999, priceYearly: 19999, features: ["Top search ranking","Elite badge","20% commission discount","Priority broadcast responses","Featured on home screen","24/7 support"],                   isActive: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
    ])
    .onConflictDoNothing();

  // ─── NOTIFICATION TEMPLATES ───────────────────────────────────────────────
  console.log("🔔 Notification templates...");
  await db
    .insert(schema.notificationTemplatesTable)
    .values([
      { id: "nt-1", key: "booking_confirmed",   name: "Booking Confirmed",            channel: "push", targetAudience: "customer", subject: null, body: "Your booking with {{providerName}} has been confirmed for {{date}} at {{time}}.",           isActive: true },
      { id: "nt-2", key: "booking_accepted",    name: "Booking Accepted",             channel: "push", targetAudience: "customer", subject: null, body: "{{providerName}} accepted your booking! They will arrive on {{date}} at {{time}}.",           isActive: true },
      { id: "nt-3", key: "booking_started",     name: "Provider On The Way",          channel: "push", targetAudience: "customer", subject: null, body: "{{providerName}} has started the job and is on their way to you.",                           isActive: true },
      { id: "nt-4", key: "booking_completed",   name: "Job Completed",                channel: "push", targetAudience: "customer", subject: null, body: "Your job with {{providerName}} is complete. Please rate your experience.",                    isActive: true },
      { id: "nt-5", key: "booking_cancelled",   name: "Booking Cancelled",            channel: "push", targetAudience: "all",      subject: null, body: "Booking #{{bookingId}} has been cancelled.",                                                 isActive: true },
      { id: "nt-6", key: "new_booking_request", name: "New Booking Request",          channel: "push", targetAudience: "provider", subject: null, body: "You have a new booking request from {{customerName}} for {{service}}.",                      isActive: true },
      { id: "nt-7", key: "commission_due",      name: "Commission Payment Due",       channel: "push", targetAudience: "provider", subject: null, body: "Your pending commission has reached PKR {{amount}}. Please clear dues to continue accepting bookings.", isActive: true },
      { id: "nt-8", key: "commission_approved", name: "Commission Payment Approved",  channel: "push", targetAudience: "provider", subject: null, body: "Your commission payment of PKR {{amount}} has been approved. You can now accept new bookings.", isActive: true },
      { id: "nt-9", key: "broadcast_response",  name: "Provider Responded",           channel: "push", targetAudience: "customer", subject: null, body: "{{providerName}} responded to your broadcast request with PKR {{amount}}.",                  isActive: true },
    ])
    .onConflictDoNothing();

  // ─── FAQs ─────────────────────────────────────────────────────────────────
  console.log("❓ FAQs...");
  const faqs = [
    { id: id(), question: "How do I book a service?",                      questionUr: "میں سروس کیسے بک کروں؟",               answer: "Open the app, browse service categories or search for a specific service, select a provider, choose a date and time, then confirm your booking.", answerUr: "ایپ کھولیں، سروس کیٹیگریز براؤز کریں یا مخصوص سروس تلاش کریں، پرووائیڈر منتخب کریں، تاریخ اور وقت چنیں، پھر بکنگ کنفرم کریں۔", category: "booking",  sortOrder: 1, isActive: true },
    { id: id(), question: "What payment methods are accepted?",            questionUr: "کون سے ادائیگی کے طریقے قبول کیے جاتے ہیں؟", answer: "We accept JazzCash, Easypaisa, and bank transfers. Cash payments can also be arranged directly with your service provider.", answerUr: "ہم جیز کیش، ایزی پیسہ اور بینک ٹرانسفر قبول کرتے ہیں۔ نقد ادائیگی بھی پرووائیڈر کے ساتھ ترتیب دی جا سکتی ہے۔", category: "payment",  sortOrder: 2, isActive: true },
    { id: id(), question: "How do I become a provider on ATHOO?",          questionUr: "میں ATHOO پر پرووائیڈر کیسے بنوں؟",     answer: "Register with your phone number, select 'Provider' as your role, complete your profile with your skills and experience, upload required documents (CNIC, selfie), and submit for verification.", answerUr: "اپنے فون نمبر سے رجسٹر کریں، 'پرووائیڈر' کا کردار منتخب کریں، اپنی پروفائل مکمل کریں، مطلوبہ دستاویزات اپ لوڈ کریں اور تصدیق کے لیے جمع کروائیں۔", category: "provider", sortOrder: 3, isActive: true },
    { id: id(), question: "Can I cancel a booking?",                       questionUr: "کیا میں بکنگ منسوخ کر سکتا ہوں؟",       answer: "Yes, you can cancel a booking before the provider arrives. Cancellations within 1 hour of the scheduled time may incur a fee.", answerUr: "ہاں، آپ پرووائیڈر کے آنے سے پہلے بکنگ منسوخ کر سکتے ہیں۔ مقررہ وقت سے 1 گھنٹے کے اندر منسوخی پر فیس لگ سکتی ہے۔", category: "booking",  sortOrder: 4, isActive: true },
    { id: id(), question: "How does commission work for providers?",        questionUr: "پرووائیڈرز کے لیے کمیشن کیسے کام کرتا ہے؟", answer: "ATHOO charges a platform commission (typically 10%) on completed bookings. You can track and pay your commission from the Earnings section in your app.", answerUr: "ATHOO مکمل بکنگز پر پلیٹ فارم کمیشن (عام طور پر 10%) چارج کرتا ہے۔ آپ اپنی ایپ کے کمائی سیکشن سے کمیشن ٹریک اور ادا کر سکتے ہیں۔", category: "payment",  sortOrder: 5, isActive: true },
    { id: id(), question: "How do I report an issue with a booking?",       questionUr: "میں بکنگ کے مسئلے کی رپورٹ کیسے کروں؟", answer: "Go to your booking details, tap 'Report Issue', describe the problem, and submit. Our support team will review and respond within 24 hours.", answerUr: "اپنی بکنگ تفصیلات میں جائیں، 'مسئلہ رپورٹ کریں' پر ٹیپ کریں، مسئلہ بیان کریں اور جمع کروائیں۔ ہماری سپورٹ ٹیم 24 گھنٹے میں جواب دے گی۔", category: "support",  sortOrder: 6, isActive: true },
  ];
  for (const faq of faqs) {
    await db.insert(schema.faqsTable).values(faq).onConflictDoNothing();
  }

  // ─── MARKETING BANNERS ────────────────────────────────────────────────────
  console.log("📢 Marketing banners...");
  await db
    .insert(schema.marketingBannersTable)
    .values([
      { id: "banner-1", title: "Book a Plumber",  subtitle: "Quick fixes at your door",   bgColorFrom: "#1A6EE0", bgColorTo: "#0D4BA0", iconName: "droplets",     linkType: "category", linkTarget: "plumber",   isActive: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: "banner-2", title: "AC Service",       subtitle: "Stay cool this summer",       bgColorFrom: "#14B8A6", bgColorTo: "#0E8A7E", iconName: "wind",         linkType: "category", linkTarget: "ac-repair", isActive: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
      { id: "banner-3", title: "Deep Cleaning",    subtitle: "Professional cleaning team",  bgColorFrom: "#F97316", bgColorTo: "#C2570A", iconName: "sparkles",     linkType: "category", linkTarget: "cleaning",  isActive: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
    ])
    .onConflictDoNothing();

  // ─── SUPER ADMIN ──────────────────────────────────────────────────────────
  console.log("\n👑 Creating development Super Admin...");
  await db
    .insert(schema.usersTable)
    .values({
      id: "user-admin-001",
      publicId: publicUserId("admin", "user-admin-001"),
      name: "Super Admin",
      phone: "03000000001",
      email: "admin@athoo.pk",
      role: "admin",
      adminRole: "super_admin",
      adminPermissions: [
        "manage_users", "manage_providers", "manage_bookings", "manage_payments",
        "manage_categories", "manage_settings", "manage_promotions", "manage_subscriptions",
        "manage_complaints", "manage_admin_users", "view_reports", "manage_notifications",
        "manage_areas", "manage_faqs", "manage_marketing",
      ],
      password: hash(seedAdminPassword),
      isVerified: true,
      isAvailable: true,
      isDeactivated: false,
      isBlocked: false,
      accountStatus: "active",
      verificationStatus: "approved",
      joinedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  // ─── DEMO CUSTOMER ────────────────────────────────────────────────────────
  console.log("👤 Creating Demo Customer (phone=03000000002 / Demo@123)...");
  await db
    .insert(schema.usersTable)
    .values({
      id: "user-customer-001",
      publicId: publicUserId("customer", "user-customer-001"),
      name: "Ali Hassan",
      phone: "03000000002",
      email: "customer@athoo.pk",
      role: "customer",
      password: hash(seedDemoPassword),
      isVerified: true,
      isAvailable: true,
      isDeactivated: false,
      isBlocked: false,
      accountStatus: "active",
      verificationStatus: "approved",
      profileColor: "#10B981",
      location: "Lahore",
      latitude: "31.5204",
      longitude: "74.3587",
      joinedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  // ─── DEMO PROVIDER ────────────────────────────────────────────────────────
  console.log("🔧 Creating Demo Provider (phone=03000000004 / Demo@123)...");
  await db
    .insert(schema.usersTable)
    .values({
      id: "user-provider-001",
      publicId: publicUserId("provider", "user-provider-001"),
      name: "Usman Khalid",
      phone: "03000000004",
      email: "provider@athoo.pk",
      role: "provider",
      password: hash(seedDemoPassword),
      isVerified: true,
      isAvailable: true,
      isDeactivated: false,
      isBlocked: false,
      accountStatus: "active",
      verificationStatus: "approved",
      profileColor: "#6366F1",
      bio: "Experienced electrician with 8 years of professional service. Specializing in residential and commercial wiring, AC installation, and electrical fault finding.",
      experience: "8 years",
      services: ["cat-electrician", "cat-ac-repair"],
      location: "Lahore",
      latitude: "31.5105",
      longitude: "74.3432",
      ratePerHour: 1500,
      rating: 47,
      ratingCount: 12,
      totalJobs: 28,
      pendingCommission: 0,
      totalCommission: 2800,
      commissionLimit: 5000,
      maxTravelDistanceKm: 20,
      joinedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  // ─── DEMO CUSTOMER 2 ──────────────────────────────────────────────────────
  console.log("👤 Creating Demo Customer 2 (phone=03000000003 / Demo@123)...");
  await db
    .insert(schema.usersTable)
    .values({
      id: "user-customer-002",
      publicId: publicUserId("customer", "user-customer-002"),
      name: "Sara Malik",
      phone: "03000000003",
      email: "sara@athoo.pk",
      role: "customer",
      password: hash(seedDemoPassword),
      isVerified: true,
      isAvailable: true,
      isDeactivated: false,
      isBlocked: false,
      accountStatus: "active",
      verificationStatus: "approved",
      profileColor: "#EC4899",
      location: "Lahore",
      latitude: "31.5497",
      longitude: "74.3436",
      joinedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  // ─── DEMO PROVIDER 2 ──────────────────────────────────────────────────────
  console.log("🔧 Creating Demo Provider 2 (phone=03000000005 / Demo@123)...");
  await db
    .insert(schema.usersTable)
    .values({
      id: "user-provider-002",
      publicId: publicUserId("provider", "user-provider-002"),
      name: "Bilal Ahmed",
      phone: "03000000005",
      email: "bilal@athoo.pk",
      role: "provider",
      password: hash(seedDemoPassword),
      isVerified: true,
      isAvailable: true,
      isDeactivated: false,
      isBlocked: false,
      accountStatus: "active",
      verificationStatus: "approved",
      profileColor: "#F59E0B",
      bio: "Professional plumber with expertise in pipe fitting, leak repair, bathroom renovation, and water pump installation.",
      experience: "5 years",
      services: ["cat-plumber", "cat-gas"],
      location: "Lahore",
      latitude: "31.5300",
      longitude: "74.3600",
      ratePerHour: 1200,
      rating: 43,
      ratingCount: 9,
      totalJobs: 19,
      pendingCommission: 0,
      totalCommission: 1900,
      commissionLimit: 5000,
      maxTravelDistanceKm: 25,
      joinedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  console.log("\n✅ Seed complete!\n");
  console.log("─".repeat(50));
  console.log("DEMO CREDENTIALS");
  console.log("─".repeat(50));
  console.log("  Super Admin   | phone: 03000000001 | password supplied via SEED_ADMIN_PASSWORD");
  console.log("  Customer 1    | phone: 03000000002 | password supplied via SEED_DEMO_PASSWORD");
  console.log("  Customer 2    | phone: 03000000003 | password supplied via SEED_DEMO_PASSWORD");
  console.log("  Provider 1    | phone: 03000000004 | password supplied via SEED_DEMO_PASSWORD");
  console.log("  Provider 2    | phone: 03000000005 | password supplied via SEED_DEMO_PASSWORD");
  console.log("─".repeat(50));

  await pool.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
