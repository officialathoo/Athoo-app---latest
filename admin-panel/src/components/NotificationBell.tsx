import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck, X, Loader2, Info, AlertCircle, Megaphone, Shield } from "lucide-react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { adminRealtime } from "@/lib/adminRealtime";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface AdminNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  info: <Info size={14} className="text-blue-500" />,
  warning: <AlertCircle size={14} className="text-yellow-500" />,
  alert: <AlertCircle size={14} className="text-red-500" />,
  broadcast: <Megaphone size={14} className="text-purple-500" />,
  system: <Shield size={14} className="text-slate-500" />,
  booking: <Info size={14} className="text-green-500" />,
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => api<{ notifications: AdminNotification[]; unreadCount: number }>("/api/admin/notifications"),
    refetchInterval: 120000,
  });

  // Connect the admin WebSocket once on mount. Do NOT disconnect on unmount —
  // the bell lives in the persistent header and we never want to drop the socket
  // just because something caused it to remount. Cleanup only removes the listener.
  useEffect(() => {
    adminRealtime.connect();
    const off = adminRealtime.on((msg) => {
      if (msg.type === "notification:new" || msg.type === "admin:event") {
        qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      }
    });
    return () => {
      off();
      // Intentionally NOT calling adminRealtime.disconnect() here.
    };
  }, [qc]);

  const markReadMut = useMutation({
    mutationFn: (id: string) => api(`/api/admin/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });

  const markAllMut = useMutation({
    mutationFn: () => api("/api/admin/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const notifications = data?.notifications || [];
  const unread = data?.unreadCount || 0;

  function handleNotificationClick(n: AdminNotification) {
    if (!n.isRead) markReadMut.mutate(n.id);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
        title="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-slate-700" />
              <span className="text-sm font-semibold text-slate-900">Notifications</span>
              {unread > 0 && (
                <span className="bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{unread}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={() => markAllMut.mutate()}
                  disabled={markAllMut.isPending}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Mark all as read"
                >
                  <CheckCheck size={13} /> All read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2 size={18} className="animate-spin mr-2" /> Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`flex gap-3 px-4 py-3 transition-colors ${
                    n.link ? "cursor-pointer hover:bg-slate-50 active:bg-slate-100" : "hover:bg-slate-50"
                  } ${!n.isRead ? "bg-blue-50/50" : ""}`}
                >
                  {/* Type icon */}
                  <div className="mt-0.5 shrink-0">
                    {TYPE_ICONS[n.type] || TYPE_ICONS.info}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-tight ${!n.isRead ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                        {n.title}
                      </p>
                      <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                    {n.link && (
                      <p className="text-xs text-blue-500 mt-1 font-medium">Tap to view →</p>
                    )}
                  </div>

                  {/* Mark read button */}
                  {!n.isRead && (
                    <button
                      onClick={e => { e.stopPropagation(); markReadMut.mutate(n.id); }}
                      className="p-1 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-100 transition-colors shrink-0 self-start mt-0.5"
                      title="Mark as read"
                    >
                      <Check size={13} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-center">
              <p className="text-xs text-slate-400">{notifications.length} notification{notifications.length !== 1 ? "s" : ""}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
