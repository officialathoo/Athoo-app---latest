import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpCircle,
  Award,
  BarChart2,
  Bell,
  BellOff,
  Briefcase,
  Brush,
  Calendar,
  Camera,
  Bookmark,
  Check,
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleDashed,
  Clock,
  CreditCard,
  Crosshair,
  Crown,
  Cpu,
  Database,
  DollarSign,
  Download,
  Droplet,
  Edit,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Feather,
  FileText,
  Film,
  Filter,
  Flag,
  Globe,
  Fingerprint,
  Grid,
  HardDrive,
  Headphones,
  Hammer,
  Hash,
  Heart,
  HelpCircle,
  Home,
  Image,
  Inbox,
  Key,
  Info,
  Layers,
  List,
  Loader,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Map,
  MapPin,
  MessageCircle,
  MessageSquare,
  Mic,
  MicOff,
  MoreHorizontal,
  MoreVertical,
  Navigation,
  Package,
  Percent,
  Pencil,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PlayCircle,
  Radio,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Save,
  ScanFace,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  Sliders,
  Star,
  StopCircle,
  Tag,
  Thermometer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  User,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume1,
  Volume2,
  Wifi,
  WifiOff,
  Wind,
  Wrench,
  X,
  XCircle,
  Zap,
  ZoomIn,
} from "lucide-react-native";
import React from "react";
import * as LucideIcons from "lucide-react-native";

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: object;
}>;

const ICON_MAP: Record<string, IconComponent> = {
  "alert-circle": AlertCircle,
  "alert-triangle": AlertTriangle,
  "arrow-down": ArrowDown,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  "arrow-up-circle": ArrowUpCircle,
  award: Award,
  "bar-chart-2": BarChart2,
  bell: Bell,
  "bell-off": BellOff,
  briefcase: Briefcase,
  bookmark: Bookmark,
  calendar: Calendar,
  camera: Camera,
  check: Check,
  "check-circle": CheckCircle,
  "check-square": CheckSquare,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  circle: Circle,
  clock: Clock,
  "credit-card": CreditCard,
  crosshair: Crosshair,
  crown: Crown,
  cpu: Cpu,
  database: Database,
  "dollar-sign": DollarSign,
  download: Download,
  droplet: Droplet,
  edit: Edit,
  "edit-2": Pencil,
  "edit-3": Edit3,
  "external-link": ExternalLink,
  eye: Eye,
  "eye-off": EyeOff,
  facebook: Share2,
  feather: Feather,
  "file-text": FileText,
  film: Film,
  filter: Filter,
  flag: Flag,
  globe: Globe,
  fingerprint: Fingerprint,
  "fingerprint-pattern": Fingerprint,
  grid: Grid,
  "hard-drive": HardDrive,
  hash: Hash,
  headphones: Headphones,
  heart: Heart,
  "heart-outline": Heart,
  help: HelpCircle,
  "help-circle": HelpCircle,
  home: Home,
  image: Image,
  inbox: Inbox,
  info: Info,
  key: Key,
  instagram: Share2,
  layers: Layers,
  list: List,
  loader: Loader,
  lock: Lock,
  "log-in": LogIn,
  "log-out": LogOut,
  mail: Mail,
  map: Map,
  "map-pin": MapPin,
  "message-circle": MessageCircle,
  "message-square": MessageSquare,
  mic: Mic,
  "mic-off": MicOff,
  "more-horizontal": MoreHorizontal,
  "more-vertical": MoreVertical,
  navigation: Navigation,
  package: Package,
  percent: Percent,
  phone: Phone,
  "phone-call": PhoneCall,
  "phone-incoming": PhoneIncoming,
  "phone-missed": PhoneMissed,
  "phone-off": PhoneOff,
  "play-circle": PlayCircle,
  radio: Radio,
  plus: Plus,
  "refresh-cw": RefreshCw,
  repeat: Repeat,
  "rotate-ccw": RotateCcw,
  save: Save,
  "scan-face": ScanFace,
  search: Search,
  send: Send,
  settings: Settings,
  "share-2": Share2,
  shield: Shield,
  sliders: Sliders,
  star: Star,
  "stop-circle": StopCircle,
  tag: Tag,
  thermometer: Thermometer,
  "trash-2": Trash2,
  tool: Wrench,
  "trending-down": TrendingDown,
  "trending-up": TrendingUp,
  user: User,
  "user-plus": UserPlus,
  users: Users,
  video: Video,
  "video-off": VideoOff,
  "volume-1": Volume1,
  "volume-2": Volume2,
  wifi: Wifi,
  "wifi-off": WifiOff,
  wind: Wind,
  wrench: Wrench,
  x: X,
  "x-circle": XCircle,
  zap: Zap,
  "zoom-in": ZoomIn,
};


function toPascalIconName(name: string): string {
  return String(name || "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function inferAthooIcon(name: string): IconComponent | null {
  const key = String(name || "").toLowerCase();
  const dynamic = (LucideIcons as any)[toPascalIconName(key)] as IconComponent | undefined;
  if (dynamic) return dynamic;
  if (/plumb|pipe|water|tap|leak/.test(key)) return Droplet;
  if (/electric|wire|power|ac|air|cool|heat/.test(key)) return Zap;
  if (/mechanic|car|bike|auto|vehicle/.test(key)) return Wrench;
  if (/paint|color/.test(key)) return Brush;
  if (/clean|maid|wash|sweep/.test(key)) return Brush;
  if (/carpenter|wood|furniture/.test(key)) return Hammer;
  if (/delivery|truck|move|shifting/.test(key)) return Truck;
  if (/camera|media|photo/.test(key)) return Camera;
  if (/phone|call/.test(key)) return Phone;
  if (/chat|message/.test(key)) return MessageCircle;
  if (/home|house/.test(key)) return Home;
  return null;
}

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: object;
}

export function Icon({
  name,
  size = 24,
  color = "#000000",
  strokeWidth = 2,
  style,
}: IconProps) {
  const Comp = ICON_MAP[name] || inferAthooIcon(name) || Settings;

  return (
    <Comp
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      style={style}
    />
  );
}

export default Icon;

