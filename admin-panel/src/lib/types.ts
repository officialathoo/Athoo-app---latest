export interface AdminUser {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: string;
  adminRole?: string | null;
  adminPermissions?: string[];
  isDeactivated?: boolean;
  joinedAt?: string;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: string;
  profileImage?: string | null;
  profileColor?: string | null;
  bio?: string | null;
  experience?: string | null;
  services?: string[];
  location?: string | null;
  isVerified: boolean;
  isAvailable: boolean;
  rating: number;
  ratingCount: number;
  totalJobs: number;
  ratePerHour?: number | null;
  maxTravelDistanceKm?: number | null;
  cnicNumber?: string | null;
  fatherName?: string | null;
  isDeactivated: boolean;
  pendingCommission: number;
  totalCommission: number;
  commissionLimit: number;
  isBlocked: boolean;
  blockedReason?: string | null;
  adminNotes?: string | null;
  verificationStatus?: "pending" | "in_process" | "approved" | "rejected" | null;
  verificationNote?: string | null;
  joinedAt: string;
  updatedAt: string;
}

export interface ProviderDocument {
  id: string;
  providerId: string;
  type: string;
  label?: string | null;
  url: string;
  status: "pending" | "approved" | "rejected";
  rejectionNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: string;
  publicId?: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string;
  providerId: string;
  providerName: string;
  providerPhone: string;
  service: string;
  serviceIcon: string;
  description?: string | null;
  videoUrl?: string | null;
  attachment?: string | null;
  address: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  price?: number | null;
  commissionAmount: number;
  providerAmount: number;
  commissionRate: number;
  rating?: number | null;
  review?: string | null;
  paymentStatus?: string;
  providerArrivedAt?: string | null;
  jobStartedAt?: string | null;
  jobCompletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardData {
  users: number;
  providers: number;
  customers: number;
  admins: number;
  blockedProviders: number;
  onlineProviders: number;
  pendingBookings: number;
  acceptedBookings: number;
  inProgressBookings: number;
  activeBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  pendingVerification: number;
  approvedVerification: number;
  openSupportTickets: number;
  pendingCommissionPayments: number;
  pendingWithdrawals: number;
  pendingRefunds: number;
  pendingServiceRequests: number;
  pendingRateRequests: number;
  activeNegotiations: number;
  overdueNegotiations: number;
  staleAcceptedBookings: number;
  totalCommission: number;
  pendingCommission: number;
  earnedCommission: number;
  completedJobValue: number;
  totalRevenue: number;
  activePromotions: number;
  alerts: { key: string; label: string; count: number; severity: "medium" | "high"; to: string }[];
  generatedAt: string;
  recentBookings?: RecentBookingItem[];
  settings: PlatformSettings;
}

export interface RecentBookingItem {
  id: string;
  customerName: string;
  providerName: string;
  service: string;
  status: string;
  price?: number | null;
  createdAt: string;
}

export interface PlatformSettings {
  commissionRate: number;
  defaultCommissionLimit: number;
  platformName?: string;
  supportPhone?: string;
  supportEmail?: string;
  maintenanceMode?: boolean;
  defaultVisitCharge?: number;
  maxBookingsPerDay?: number;
  appVersion?: string;
  minBookingNoticeHours?: number;
  allowGuestBrowsing?: boolean;
  providerAutoApprove?: boolean;
  bookingCancellationWindowHours?: number;
  broadcastTTLMinutes?: number;
  broadcastInitialRadiusKm?: number;
  broadcastExpansionRadiusKm?: number;
  broadcastExpandAfterMinutes?: number;
  maxNegotiationRounds?: number;
  premiumCommissionDiscountPercent?: number;
  premiumPriorityBoost?: boolean;
  premiumProfileBadgeEnabled?: boolean;
  defaultServiceRadiusKm?: number;
  customerCancellationFee?: number;
  providerCancellationPenalty?: number;
  inactivityLifecycleEnabled?: boolean;
  inactivityWarningDays?: number;
  inactivityRestrictionDays?: number;
  inactivityReviewDays?: number;
}

export interface AdminBlacklist {
  id: string;
  type: "phone" | "email";
  value: string;
  reason?: string | null;
  addedBy?: string | null;
  addedByName?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SidebarCounts {
  pendingVerifications: number;
  pendingCommissionPayments: number;
  pendingWithdrawals: number;
  pendingRefunds: number;
  openSupportTickets: number;
  pendingRateRequests: number;
  pendingSubscriptions: number;
  pendingServiceRequests: number;
  pendingDeletionRequests: number;
  inactiveAccountsForReview: number;
  unreadNotifications: number;
}

export interface Broadcast {
  id: string;
  title: string;
  message: string;
  audience: string;
  createdBy: string;
  sentCount?: number;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  assignedTo?: string | null;
  assignedToName?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  relatedBookingId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketNote {
  id: string;
  ticketId: string;
  adminId: string;
  adminName: string;
  note: string;
  isInternal: boolean;
  createdAt: string;
}

export interface Promotion {
  id: string;
  code: string;
  description?: string | null;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minBookingValue?: number | null;
  maxUses?: number | null;
  usedCount: number;
  validFrom?: string | null;
  validUntil?: string | null;
  serviceTypes?: string[] | null;
  isActive: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

