export interface ServiceCategory {
  id: string;
  name: string;
  nameUrdu: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
  descriptionUrdu: string;
}

export interface Provider {
  id: string;
  name: string;
  phone: string;
  role: string;
  services?: string[];
  rating?: number;
  ratingCount?: number;
  totalJobs?: number;
  isAvailable?: boolean;
  isVerified?: boolean;
  bio?: string;
  experience?: string;
  profileImage?: string;
  profileColor?: string;
  location?: string;
  ratePerHour?: number;
  joinedAt?: string;
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { id: "plumber", name: "Plumber", nameUrdu: "پلمبر", icon: "droplet", color: "#3B82F6", bgColor: "#EFF6FF", description: "Pipe repairs, installation & leaks", descriptionUrdu: "پائپ مرمت، تنصیب اور رساؤ" },
  { id: "electrician", name: "Electrician", nameUrdu: "الیکٹریشن", icon: "zap", color: "#F59E0B", bgColor: "#FFFBEB", description: "Wiring, faults & appliance setup", descriptionUrdu: "وائرنگ، خرابی اور آلات کی ترتیب" },
  { id: "carpenter", name: "Carpenter", nameUrdu: "ترکھان", icon: "tool", color: "#8B5CF6", bgColor: "#F5F3FF", description: "Furniture, doors & woodwork", descriptionUrdu: "فرنیچر، دروازے اور لکڑی کا کام" },
  { id: "painter", name: "Painter", nameUrdu: "رنگ ساز", icon: "edit-3", color: "#10B981", bgColor: "#ECFDF5", description: "Interior & exterior painting", descriptionUrdu: "اندرونی اور بیرونی پینٹنگ" },
  { id: "cleaner", name: "Cleaner", nameUrdu: "صفائی کار", icon: "wind", color: "#EC4899", bgColor: "#FDF2F8", description: "Deep cleaning & sanitization", descriptionUrdu: "گہری صفائی اور جراثیم کشی" },
  { id: "gardener", name: "Gardener", nameUrdu: "مالی", icon: "feather", color: "#22C55E", bgColor: "#F0FDF4", description: "Lawn care & plant maintenance", descriptionUrdu: "لان کی دیکھ بھال اور پودوں کی نگہداشت" },
  { id: "ac_repair", name: "AC Repair", nameUrdu: "اے سی مرمت", icon: "thermometer", color: "#14B8A6", bgColor: "#F0FDFA", description: "AC service, repair & installation", descriptionUrdu: "اے سی سروس، مرمت اور تنصیب" },
  { id: "manhole", name: "Drain/Manhole", nameUrdu: "نالی / مین ہول", icon: "circle", color: "#6B7280", bgColor: "#F9FAFB", description: "Drain cleaning & manhole services", descriptionUrdu: "نالی صفائی اور مین ہول سروس" },
  { id: "welder", name: "Welder", nameUrdu: "ویلڈر", icon: "settings", color: "#F97316", bgColor: "#FFF7ED", description: "Gates, grills & metal work", descriptionUrdu: "گیٹ، جنگلے اور دھاتی کام" },
  { id: "tiler", name: "Tiler", nameUrdu: "ٹائل کار", icon: "grid", color: "#EF4444", bgColor: "#FEF2F2", description: "Floor, wall & bathroom tiling", descriptionUrdu: "فرش، دیوار اور باتھ روم ٹائلنگ" },
  { id: "water_tank", name: "Tank Cleaner", nameUrdu: "ٹینک صفائی", icon: "database", color: "#0EA5E9", bgColor: "#F0F9FF", description: "Water tank cleaning & maintenance", descriptionUrdu: "پانی کی ٹینکی صفائی اور دیکھ بھال" },
  { id: "pest", name: "Pest Control", nameUrdu: "کیڑے مار", icon: "alert-triangle", color: "#84CC16", bgColor: "#F7FEE7", description: "Fumigation & pest treatment", descriptionUrdu: "دھواں دہی اور کیڑے مار علاج" },
];

export function getServiceCategory(serviceId: string): ServiceCategory | undefined {
  return SERVICE_CATEGORIES.find((s) => s.id === serviceId);
}

export function getServiceIcon(serviceId: string): string {
  return getServiceCategory(serviceId)?.icon || "tool";
}

