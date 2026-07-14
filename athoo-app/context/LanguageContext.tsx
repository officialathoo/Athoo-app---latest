import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "en" | "ur";

const EN = {
  home: "Home", search: "Search", bookings: "Bookings", profile: "Profile", chat: "Chat",
  dashboard: "Dashboard", jobs: "Jobs", earnings: "Earnings",
  findServices: "Find Services", nearYou: "Near You",
  bookNow: "Book Now", viewAll: "View All", seeAll: "See All",
  services: "Services", topRatedNearby: "Top Rated Nearby",
  workers: "Workers", avgRating: "Avg Rating",
  negotiatePrice: "Negotiate Your Price",
  indriveStyle: "Post your offer — let providers compete",
  makeAnOffer: "Make an Offer",
  emergencyService: "Emergency Service", support247: "24/7 support available", callNow: "Call Now",
  available: "Available", busy: "Busy", newProvider: "New",
  generalServices: "General Services",
  myBookings: "My Bookings", myJobs: "My Jobs", myOffers: "My Offers",
  pending: "Pending", active: "Active", completed: "Completed", cancelled: "Cancelled",
  inProgress: "In Progress", live: "Live", accepted: "Accepted",
  awaitingResponse: "Awaiting Response", providerCountered: "Provider Countered",
  noBookings: "No bookings yet", startExploring: "Find a service and book your first job",
  noOffers: "No price offers yet", negotiateHint: "Go to Search and tap Negotiate Price on a provider",
  totalBookings: "total bookings", priceNegotiations: "price negotiations",
  myProfile: "My Profile", editProfile: "Edit Profile",
  personalInfo: "Personal Information", accountSettings: "Account Settings",
  billingHistory: "Billing History", savedProviders: "Saved Providers",
  myAddresses: "My Addresses", help: "Help & FAQs", about: "About Athoo", privacy: "Privacy & Security",
  logout: "Logout", settings: "Settings",
  notifications: "Notifications", clearAll: "Clear All",
  billing: "Billing", invoices: "Invoices",
  chatbot: "Live Chat Support", saved: "Saved Providers", addresses: "My Addresses",
  bookingsPayments: "Bookings & Payments", account: "Account", support: "Support",
  changePassword: "Change Password", language: "Language",
  welcome: "Welcome Back", signIn: "Sign In", register: "Register",
  forgotPassword: "Forgot Password",
  startJob: "Start Job", completeJob: "Mark Completed",
  acceptJob: "Accept Job", declineJob: "Decline",
  enterOtp: "Enter OTP", sendOtp: "Send OTP", verifyOtp: "Verify OTP",
  otpHint: "Demo OTP: 1234",
  negotiate: "Negotiate Price", makeOffer: "Make Offer",
  accept: "Accept", reject: "Reject", counter: "Counter",
  visitCharge: "Visit Charge", totalAmount: "Total Amount",
  english: "English", urdu: "اردو",
  switchToCustomer: "Switch to Customer", switchToProvider: "Switch to Provider",
  searchPlaceholder: "Search services, workers...",
  allAreas: "All Areas", allServices: "All Services",
  noProviders: "No providers found", tryDifferent: "Try different search or remove filters",
  sortBy: "Sort by", rating: "Rating", totalJobs: "Total Jobs",
  onlyAvailable: "Only Available",
  plumber: "Plumber", electrician: "Electrician", carpenter: "Carpenter",
  painter: "Painter", cleaner: "Cleaner", gardener: "Gardener",
  acRepair: "AC Repair", drain: "Drain/Manhole", welder: "Welder",
  tiler: "Tiler", tankCleaner: "Tank Cleaner", pestControl: "Pest Control",
  providerProfile: "Provider Profile", hireNow: "Hire Now", sendMessage: "Message",
  reviews: "Reviews", experience: "Experience", bio: "About",
  bookService: "Book Service", selectDate: "Select Date", selectTime: "Select Time",
  yourAddress: "Your Address", describeIssue: "Describe the issue",
  totalEarnings: "Total Earnings", weeklyEarnings: "This Week",
  todayEarnings: "Today", jobsDone: "Jobs Done",
  providerDashboard: "Provider Dashboard",
  availableForJobs: "Available for Jobs", notAvailable: "Not Available",
  newRequests: "New Requests", noJobsYet: "No jobs yet", noJobsYetSub: "New bookings will appear here when customers hire you",
  yourPerformance: "Your Performance", earned: "Earned", done: "Done",
  customersCanBook: "Customers can book you now", wontReceive: "You won't receive new requests",
  pendingJobs: "Pending", activeJobs: "Active", completedJobs: "Completed",
  hello: "Hello", bookingHistory: "Booking History",
  newBooking: "New Booking",
  bookPlumber: "Book a Plumber", quickFixes: "Quick fixes & emergency repairs",
  acService: "AC Service", summerReady: "Summer ready in 1 visit",
  deepCleaning: "Deep Cleaning", professionalCleaning: "Professional home sanitization",
  totalSpent: "Total Spent", activeBookings: "Active", completedBookings: "Completed",
};

const UR = {
  home: "ہوم", search: "تلاش", bookings: "بکنگ", profile: "پروفائل", chat: "چیٹ",
  dashboard: "ڈیش بورڈ", jobs: "کام", earnings: "آمدنی",
  findServices: "سروسز تلاش کریں", nearYou: "آپ کے قریب",
  bookNow: "ابھی بک کریں", viewAll: "سب دیکھیں", seeAll: "سب دیکھیں",
  services: "سروسز", topRatedNearby: "قریبی بہترین کاریگر",
  workers: "کاریگر", avgRating: "اوسط ریٹنگ",
  negotiatePrice: "قیمت طے کریں",
  indriveStyle: "اپنی پیشکش دیں — کاریگر مقابلہ کریں",
  makeAnOffer: "پیشکش کریں",
  emergencyService: "ہنگامی سروس", support247: "چوبیس گھنٹے دستیاب", callNow: "ابھی کال کریں",
  available: "دستیاب", busy: "مصروف", newProvider: "نیا",
  generalServices: "عمومی سروسز",
  myBookings: "میری بکنگ", myJobs: "میرے کام", myOffers: "میری پیشکشیں",
  pending: "زیر التواء", active: "فعال", completed: "مکمل", cancelled: "منسوخ",
  inProgress: "جاری ہے", live: "براہ راست", accepted: "قبول شدہ",
  awaitingResponse: "جواب کا انتظار", providerCountered: "کاریگر نے جوابی پیشکش کی",
  noBookings: "ابھی کوئی بکنگ نہیں", startExploring: "سروس تلاش کریں اور پہلا کام بک کریں",
  noOffers: "ابھی کوئی پیشکش نہیں", negotiateHint: "تلاش پر جائیں اور کاریگر پر قیمت طے کریں پر کلک کریں",
  totalBookings: "کل بکنگ", priceNegotiations: "قیمت مذاکرات",
  myProfile: "میرا پروفائل", editProfile: "پروفائل ترمیم",
  personalInfo: "ذاتی معلومات", accountSettings: "اکاؤنٹ سیٹنگز",
  billingHistory: "بلنگ تاریخ", savedProviders: "محفوظ کاریگر",
  myAddresses: "میرے پتے", help: "مدد اور سوالات", about: "اتھو کے بارے میں", privacy: "رازداری و سلامتی",
  logout: "لاگ آوٹ", settings: "سیٹنگز",
  notifications: "اطلاعات", clearAll: "سب صاف کریں",
  billing: "بلنگ", invoices: "انوائس",
  chatbot: "لائیو چیٹ سپورٹ", saved: "محفوظ کاریگر", addresses: "میرے پتے",
  bookingsPayments: "بکنگ اور ادائیگی", account: "اکاؤنٹ", support: "مدد",
  changePassword: "پاسورڈ تبدیل کریں", language: "زبان",
  welcome: "خوش آمدید", signIn: "سائن ان", register: "رجسٹر",
  forgotPassword: "پاسورڈ بھول گئے",
  startJob: "کام شروع کریں", completeJob: "مکمل نشان زد کریں",
  acceptJob: "کام قبول کریں", declineJob: "انکار",
  enterOtp: "OTP درج کریں", sendOtp: "OTP بھیجیں", verifyOtp: "OTP تصدیق کریں",
  otpHint: "ڈیمو OTP: 1234",
  negotiate: "قیمت طے کریں", makeOffer: "پیشکش کریں",
  accept: "قبول", reject: "رد کریں", counter: "جوابی پیشکش",
  visitCharge: "وزٹ چارج", totalAmount: "کل رقم",
  english: "English", urdu: "اردو",
  switchToCustomer: "کسٹمر میں جائیں", switchToProvider: "کاریگر میں جائیں",
  searchPlaceholder: "سروسز، کاریگر تلاش کریں...",
  allAreas: "تمام علاقے", allServices: "تمام سروسز",
  noProviders: "کوئی کاریگر نہیں ملا", tryDifferent: "مختلف تلاش یا فلٹر ہٹائیں",
  sortBy: "ترتیب دیں", rating: "ریٹنگ", totalJobs: "کل کام",
  onlyAvailable: "صرف دستیاب",
  plumber: "پلمبر", electrician: "الیکٹریشن", carpenter: "ترکھان",
  painter: "رنگ ساز", cleaner: "صفائی کار", gardener: "مالی",
  acRepair: "اے سی مرمت", drain: "نالی / مین ہول", welder: "ویلڈر",
  tiler: "ٹائل کار", tankCleaner: "ٹینک صفائی", pestControl: "کیڑے مار",
  providerProfile: "کاریگر پروفائل", hireNow: "ابھی بھرتی کریں", sendMessage: "پیغام",
  reviews: "جائزے", experience: "تجربہ", bio: "تعارف",
  bookService: "سروس بک کریں", selectDate: "تاریخ منتخب کریں", selectTime: "وقت منتخب کریں",
  yourAddress: "آپ کا پتہ", describeIssue: "مسئلہ بیان کریں",
  totalEarnings: "کل آمدنی", weeklyEarnings: "اس ہفتے",
  todayEarnings: "آج", jobsDone: "کام مکمل",
  providerDashboard: "کاریگر ڈیش بورڈ",
  availableForJobs: "کاموں کے لیے دستیاب", notAvailable: "دستیاب نہیں",
  customersCanBook: "کسٹمر ابھی بک کر سکتے ہیں", wontReceive: "نئی درخواستیں نہیں ملیں گی",
  newRequests: "نئی درخواستیں", noJobsYet: "ابھی کوئی کام نہیں", noJobsYetSub: "جب کسٹمر آپ کو ہائر کریں گے تو بکنگ یہاں آئے گی",
  yourPerformance: "آپ کی کارکردگی", earned: "کمائی", done: "مکمل",
  pendingJobs: "زیر التواء", activeJobs: "فعال", completedJobs: "مکمل",
  hello: "ہیلو", bookingHistory: "بکنگ تاریخ",
  newBooking: "نئی بکنگ",
  bookPlumber: "پلمبر بک کریں", quickFixes: "فوری مرمت اور ہنگامی کام",
  acService: "اے سی سروس", summerReady: "ایک وزٹ میں گرمیوں کے لیے تیار",
  deepCleaning: "گہری صفائی", professionalCleaning: "پیشہ ور گھر کی صفائی",
  totalSpent: "کل خرچ", activeBookings: "فعال", completedBookings: "مکمل",
};

export type Strings = typeof EN;

interface LangContextType {
  lang: Lang;
  t: Strings;
  setLang: (l: Lang) => void;
  isUrdu: boolean;
}

const LangContext = createContext<LangContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    AsyncStorage.getItem("athoo_lang").then((v) => {
      if (v === "en" || v === "ur") setLangState(v);
    });
  }, []);

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    await AsyncStorage.setItem("athoo_lang", l);
  }, []);

  const t = lang === "ur" ? UR : EN;
  const isUrdu = lang === "ur";

  return (
    <LangContext.Provider value={{ lang, t, setLang, isUrdu }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}

