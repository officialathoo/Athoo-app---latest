import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, MessageCircle, Search, ShieldAlert, Unlock } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Chat = {
  id: string; participant1Name: string; participant2Name: string; bookingId?: string | null;
  service?: string | null; lastMessage?: string | null; lastMessageAt?: string | null;
  isLocked: boolean; lockedReason?: string | null;
};
type Message = { id: string; senderName: string; text: string; createdAt: string; isRead?: boolean };

export function ChatModerationPage() {
  const [q, setQ] = useState("");
  const [locked, setLocked] = useState("all");
  const [selected, setSelected] = useState<Chat | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-chats", q, locked],
    queryFn: () => api<{ chats: Chat[] }>(`/api/admin/chats?q=${encodeURIComponent(q)}&locked=${locked}`),
  });
  const details = useQuery({
    queryKey: ["admin-chat", selected?.id],
    queryFn: () => api<{ chat: Chat; messages: Message[] }>(`/api/admin/chats/${selected!.id}/messages`),
    enabled: Boolean(selected?.id),
  });
  const mutation = useMutation({
    mutationFn: async ({ chat, isLocked }: { chat: Chat; isLocked: boolean }) => {
      const reason = isLocked ? window.prompt("Why should this conversation be locked?")?.trim() : "";
      if (isLocked && !reason) throw new Error("Lock cancelled");
      return api(`/api/admin/chats/${chat.id}/lock`, { method: "PATCH", body: { isLocked, reason } });
    },
    onSuccess: () => {
      toast({ title: "Conversation updated" });
      qc.invalidateQueries({ queryKey: ["admin-chats"] });
      qc.invalidateQueries({ queryKey: ["admin-chat"] });
    },
    onError: (error: Error) => error.message !== "Lock cancelled" && toast({ title: error.message, variant: "destructive" }),
  });
  const chats = useMemo(() => query.data?.chats || [], [query.data]);

  return <div className="space-y-5" data-testid="chat-moderation-page">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Safety & Support</p>
      <h1 className="text-2xl font-bold text-slate-900">Conversation Moderation</h1>
      <p className="text-sm text-slate-500 mt-1">Review booking-linked conversations and lock messaging when safety or dispute handling requires it.</p>
    </div>
    <div className="flex gap-3 bg-white border rounded-xl p-3">
      <div className="relative flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name, booking, service or chat ID" className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm"/></div>
      <select value={locked} onChange={e=>setLocked(e.target.value)} className="border rounded-lg px-3 text-sm"><option value="all">All</option><option value="true">Locked</option><option value="false">Open</option></select>
    </div>
    <div className="grid lg:grid-cols-[360px_1fr] gap-4 min-h-[520px]">
      <div className="bg-white border rounded-xl overflow-hidden">
        {query.isLoading ? <p className="p-5 text-sm text-slate-500">Loading conversations…</p> : chats.length===0 ? <p className="p-5 text-sm text-slate-500">No conversations found.</p> : chats.map(chat=><button key={chat.id} onClick={()=>setSelected(chat)} className={`w-full text-left p-4 border-b hover:bg-slate-50 ${selected?.id===chat.id?'bg-blue-50':''}`}>
          <div className="flex justify-between gap-2"><p className="font-medium text-sm text-slate-800">{chat.participant1Name} ↔ {chat.participant2Name}</p>{chat.isLocked?<Lock size={14} className="text-amber-600"/>:null}</div>
          <p className="text-xs text-slate-500 mt-1">{chat.service || "General conversation"}{chat.bookingId?` • ${chat.bookingId}`:""}</p>
          <p className="text-xs text-slate-400 mt-1 line-clamp-1">{chat.lastMessage || "No messages yet"}</p>
        </button>)}
      </div>
      <div className="bg-white border rounded-xl p-5 flex flex-col">
        {!selected ? <div className="m-auto text-center"><MessageCircle className="mx-auto text-slate-300" size={38}/><p className="text-sm text-slate-500 mt-2">Select a conversation to review evidence.</p></div> : <>
          <div className="flex items-start justify-between border-b pb-4">
            <div><h2 className="font-semibold text-slate-900">{selected.participant1Name} ↔ {selected.participant2Name}</h2><p className="text-xs text-slate-500 mt-1">{selected.bookingId || "No booking linked"}</p>{details.data?.chat.lockedReason?<p className="text-xs text-amber-700 mt-2 flex gap-1"><ShieldAlert size={13}/>{details.data.chat.lockedReason}</p>:null}</div>
            <button disabled={mutation.isPending} onClick={()=>mutation.mutate({chat: details.data?.chat || selected, isLocked: !(details.data?.chat.isLocked ?? selected.isLocked)})} className="border rounded-lg px-3 py-2 text-xs font-medium flex gap-2 items-center">{(details.data?.chat.isLocked ?? selected.isLocked)?<><Unlock size={14}/>Unlock</>:<><Lock size={14}/>Lock</>}</button>
          </div>
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {details.isLoading?<p className="text-sm text-slate-500">Loading messages…</p>:(details.data?.messages||[]).map(m=><div key={m.id} className="border rounded-lg p-3"><div className="flex justify-between"><p className="text-xs font-semibold text-slate-700">{m.senderName}</p><p className="text-[11px] text-slate-400">{new Date(m.createdAt).toLocaleString()}</p></div><p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{m.text}</p></div>)}
          </div>
        </>}
      </div>
    </div>
  </div>;
}
