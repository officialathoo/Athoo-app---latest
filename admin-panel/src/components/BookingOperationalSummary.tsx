import { AlertTriangle, CreditCard, MapPin, MessageCircle } from "lucide-react";

export function BookingOperationalSummary({ booking }: { booking: any }) {
  const items = [
    { label: "Payment", value: booking.paymentStatus || "pending", icon: CreditCard },
    { label: "Arrival", value: booking.providerArrivedAt ? "Provider arrived" : "Awaiting arrival", icon: MapPin },
    { label: "Communication", value: booking.chatId ? "Chat available" : "No chat linked", icon: MessageCircle },
    { label: "Attention", value: booking.status === "cancelled" ? "Review cancellation" : "No exception flagged", icon: AlertTriangle },
  ];
  return <div className="grid grid-cols-2 gap-3" data-testid="admin-booking-operational-summary">
    {items.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-xs text-slate-500"><Icon size={14}/>{label}</div>
      <p className="mt-1 text-sm font-semibold text-slate-800 capitalize">{String(value).replaceAll("_", " ")}</p>
    </div>)}
  </div>;
}
