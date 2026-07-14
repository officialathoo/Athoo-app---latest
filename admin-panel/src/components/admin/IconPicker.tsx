import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Accessibility, AirVent, AlarmClock, Ambulance, Apple, Archive, Armchair, Award,
  BadgeCheck, Banknote, Bath, Bed, Bell, Bike, BookOpen, BriefcaseBusiness, Brush,
  Building, Bus, CalendarDays, Camera, Car, ChefHat, CircleHelp, ClipboardCheck,
  ClipboardList, Clock, Cloud, Coffee, Construction, CookingPot, CreditCard, Crown,
  DoorOpen, Drill, Droplets, Dumbbell, Fan, FileCheck, FileText, Flame, Flower2,
  Gift, GraduationCap, Hammer, HandCoins, HandHeart, HardHat, Headphones, Heart,
  Home, Hospital, HousePlug, KeyRound, Laptop, Leaf, Lightbulb, LockKeyhole,
  Mail, MapPin, MessageCircle, Microwave, MonitorSmartphone, Package, Paintbrush,
  PaintBucket, PawPrint, Phone, Plug, Receipt, Refrigerator, Rocket, Scissors,
  Search, Settings2, ShieldCheck, Shirt, ShoppingBag, ShoppingCart, ShowerHead,
  Snowflake, Sofa, Sparkles, Star, Store, Stethoscope, Sun, Tag, Thermometer,
  Toilet, Tractor, Trash2, Truck, Tv, Umbrella, University, UserCheck, Users,
  Utensils, Video, Wallet, Warehouse, WashingMachine, Waves, Wifi, Wind, Wrench,
  Zap,
} from "lucide-react";

export type IconOption = { name: string; label: string; icon: LucideIcon; keywords: string[] };

const icon = (name: string, label: string, glyph: LucideIcon, keywords: string[] = []): IconOption => ({ name, label, icon: glyph, keywords });

export const ADMIN_ICON_OPTIONS: IconOption[] = [
  icon("wrench", "Wrench", Wrench, ["repair", "mechanic", "tool"]),
  icon("hammer", "Hammer", Hammer, ["carpenter", "construction"]),
  icon("drill", "Drill", Drill, ["hardware", "repair"]),
  icon("hard-hat", "Hard Hat", HardHat, ["worker", "construction"]),
  icon("construction", "Construction", Construction, ["building", "road"]),
  icon("paintbrush", "Paintbrush", Paintbrush, ["paint", "decorator"]),
  icon("paint-bucket", "Paint Bucket", PaintBucket, ["paint", "color"]),
  icon("brush", "Brush", Brush, ["cleaner", "cleaning"]),
  icon("sparkles", "Sparkles", Sparkles, ["clean", "premium"]),
  icon("scissors", "Scissors", Scissors, ["salon", "tailor"]),
  icon("droplets", "Droplets", Droplets, ["water", "plumber"]),
  icon("shower-head", "Shower", ShowerHead, ["bathroom", "plumber"]),
  icon("toilet", "Toilet", Toilet, ["bathroom", "plumber"]),
  icon("bath", "Bath", Bath, ["bathroom", "plumber"]),
  icon("washing-machine", "Washing Machine", WashingMachine, ["laundry", "appliance"]),
  icon("refrigerator", "Refrigerator", Refrigerator, ["fridge", "appliance"]),
  icon("microwave", "Microwave", Microwave, ["kitchen", "appliance"]),
  icon("air-vent", "Air Vent", AirVent, ["ac", "cooling"]),
  icon("fan", "Fan", Fan, ["ac", "cooling"]),
  icon("snowflake", "Snowflake", Snowflake, ["ac", "cooling"]),
  icon("thermometer", "Thermometer", Thermometer, ["temperature", "ac"]),
  icon("wind", "Wind", Wind, ["air", "ventilation"]),
  icon("flame", "Flame", Flame, ["gas", "heater"]),
  icon("zap", "Electric", Zap, ["electrician", "power"]),
  icon("plug", "Plug", Plug, ["electrician", "power"]),
  icon("house-plug", "House Plug", HousePlug, ["electrician", "home"]),
  icon("lightbulb", "Lightbulb", Lightbulb, ["electrician", "lighting"]),
  icon("home", "Home", Home, ["house", "property"]),
  icon("building", "Building", Building, ["office", "property"]),
  icon("warehouse", "Warehouse", Warehouse, ["storage", "business"]),
  icon("store", "Store", Store, ["shop", "retail"]),
  icon("door-open", "Door", DoorOpen, ["carpenter", "lock"]),
  icon("key-round", "Key", KeyRound, ["locksmith", "security"]),
  icon("lock-keyhole", "Lock", LockKeyhole, ["security", "locksmith"]),
  icon("shield-check", "Shield", ShieldCheck, ["security", "verified"]),
  icon("badge-check", "Verified Badge", BadgeCheck, ["verified", "approved"]),
  icon("user-check", "Verified User", UserCheck, ["provider", "approved"]),
  icon("users", "Users", Users, ["team", "community"]),
  icon("accessibility", "Accessibility", Accessibility, ["care", "support"]),
  icon("ambulance", "Ambulance", Ambulance, ["emergency", "health"]),
  icon("hospital", "Hospital", Hospital, ["health", "medical"]),
  icon("stethoscope", "Stethoscope", Stethoscope, ["doctor", "health"]),
  icon("hand-heart", "Care", HandHeart, ["care", "support"]),
  icon("dumbbell", "Fitness", Dumbbell, ["gym", "trainer"]),
  icon("paw-print", "Pet Care", PawPrint, ["pet", "animal"]),
  icon("car", "Car", Car, ["vehicle", "mechanic"]),
  icon("bike", "Bike", Bike, ["vehicle", "delivery"]),
  icon("bus", "Bus", Bus, ["transport", "vehicle"]),
  icon("truck", "Truck", Truck, ["moving", "delivery"]),
  icon("tractor", "Tractor", Tractor, ["agriculture", "farm"]),
  icon("map-pin", "Location", MapPin, ["area", "address"]),
  icon("phone", "Phone", Phone, ["call", "contact"]),
  icon("message-circle", "Message", MessageCircle, ["chat", "support"]),
  icon("mail", "Mail", Mail, ["email", "contact"]),
  icon("headphones", "Support", Headphones, ["help", "call center"]),
  icon("circle-help", "Help", CircleHelp, ["faq", "support"]),
  icon("camera", "Camera", Camera, ["photo", "media"]),
  icon("video", "Video", Video, ["media", "camera"]),
  icon("file-text", "Document", FileText, ["paper", "document"]),
  icon("file-check", "Verified Document", FileCheck, ["document", "approved"]),
  icon("clipboard-list", "Checklist", ClipboardList, ["tasks", "form"]),
  icon("clipboard-check", "Completed Checklist", ClipboardCheck, ["tasks", "approved"]),
  icon("calendar-days", "Calendar", CalendarDays, ["booking", "schedule"]),
  icon("clock", "Clock", Clock, ["time", "schedule"]),
  icon("alarm-clock", "Alarm", AlarmClock, ["reminder", "time"]),
  icon("credit-card", "Card", CreditCard, ["payment", "finance"]),
  icon("wallet", "Wallet", Wallet, ["payment", "finance"]),
  icon("banknote", "Cash", Banknote, ["payment", "finance"]),
  icon("receipt", "Receipt", Receipt, ["invoice", "finance"]),
  icon("hand-coins", "Commission", HandCoins, ["payment", "earnings"]),
  icon("tag", "Tag", Tag, ["offer", "price"]),
  icon("gift", "Gift", Gift, ["promotion", "reward"]),
  icon("crown", "Premium", Crown, ["premium", "vip"]),
  icon("award", "Award", Award, ["quality", "top"]),
  icon("star", "Star", Star, ["rating", "featured"]),
  icon("heart", "Heart", Heart, ["favorite", "care"]),
  icon("bell", "Bell", Bell, ["notification", "alert"]),
  icon("sun", "Sun", Sun, ["day", "weather"]),
  icon("cloud", "Cloud", Cloud, ["weather", "online"]),
  icon("umbrella", "Umbrella", Umbrella, ["weather", "protection"]),
  icon("waves", "Waves", Waves, ["water", "pool"]),
  icon("leaf", "Leaf", Leaf, ["garden", "eco"]),
  icon("flower", "Flower", Flower2, ["garden", "decor"]),
  icon("apple", "Food", Apple, ["food", "nutrition"]),
  icon("cooking-pot", "Cooking", CookingPot, ["chef", "kitchen"]),
  icon("chef-hat", "Chef", ChefHat, ["food", "cooking"]),
  icon("utensils", "Dining", Utensils, ["food", "restaurant"]),
  icon("coffee", "Coffee", Coffee, ["cafe", "beverage"]),
  icon("sofa", "Sofa", Sofa, ["furniture", "home"]),
  icon("bed", "Bed", Bed, ["furniture", "home"]),
  icon("armchair", "Armchair", Armchair, ["furniture", "home"]),
  icon("shirt", "Clothing", Shirt, ["laundry", "tailor"]),
  icon("shopping-bag", "Shopping Bag", ShoppingBag, ["retail", "store"]),
  icon("shopping-cart", "Shopping Cart", ShoppingCart, ["retail", "store"]),
  icon("package", "Package", Package, ["delivery", "parcel"]),
  icon("archive", "Archive", Archive, ["storage", "records"]),
  icon("briefcase", "Business", BriefcaseBusiness, ["office", "professional"]),
  icon("graduation-cap", "Education", GraduationCap, ["teacher", "school"]),
  icon("university", "Institution", University, ["education", "bank"]),
  icon("book-open", "Book", BookOpen, ["education", "reading"]),
  icon("laptop", "Laptop", Laptop, ["computer", "repair"]),
  icon("monitor-smartphone", "Devices", MonitorSmartphone, ["computer", "mobile"]),
  icon("tv", "Television", Tv, ["electronics", "repair"]),
  icon("wifi", "Wi-Fi", Wifi, ["internet", "network"]),
  icon("rocket", "Rocket", Rocket, ["launch", "growth"]),
  icon("settings", "Settings", Settings2, ["configuration", "service"]),
  icon("trash", "Waste", Trash2, ["garbage", "cleaning"]),
];

export function resolveAdminIcon(name: string | null | undefined): LucideIcon {
  const normalized = String(name || "").trim().toLowerCase();
  return ADMIN_ICON_OPTIONS.find((option) => option.name === normalized)?.icon ?? Settings2;
}

export function IconPicker({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return ADMIN_ICON_OPTIONS;
    return ADMIN_ICON_OPTIONS.filter((option) =>
      [option.name, option.label, ...option.keywords].some((term) => term.toLowerCase().includes(query)),
    );
  }, [search]);
  const SelectedIcon = resolveAdminIcon(value);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <Search size={15} className="shrink-0 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={disabled}
          className="w-full bg-transparent text-sm outline-none"
          placeholder="Search icons by name or purpose"
        />
        <span className="text-xs text-slate-400">{filtered.length}</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
        <SelectedIcon size={17} />
        <span className="font-medium">Selected: {value || "settings"}</span>
      </div>
      <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 md:grid-cols-5">
        {filtered.map((option) => {
          const Icon = option.icon;
          const active = value === option.name;
          return (
            <button
              key={option.name}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.name)}
              title={`${option.label} (${option.name})`}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center transition-colors disabled:opacity-50 ${
                active ? "border-blue-600 bg-blue-100 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              <Icon size={17} />
              <span className="line-clamp-1 text-[10px] leading-tight">{option.label}</span>
            </button>
          );
        })}
      </div>
      {!filtered.length ? <p className="py-3 text-center text-sm text-slate-500">No matching icon.</p> : null}
    </div>
  );
}
