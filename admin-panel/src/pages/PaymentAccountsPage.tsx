import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, X, Building2 } from "lucide-react";

type Account = {
  id: string;
  label: string;
  bankName: string | null;
  accountTitle: string;
  accountNumber: string;
  iban: string | null;
  instructions: string | null;
  isActive: boolean;
  sortOrder: number | null;
};

export function PaymentAccountsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Account | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payment-accounts"],
    queryFn: () => api<{ accounts: Account[] }>("/api/admin/payments/accounts"),
  });

  const save = useMutation({
    mutationFn: (payload: Partial<Account> & { id?: string }) => {
      const { id, ...body } = payload;
      return id
        ? api(`/api/admin/payments/accounts/${id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api(`/api/admin/payments/accounts`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "payment-accounts"] });
      setShowForm(false); setEditing(null);
      toast({ title: "Saved" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/admin/payments/accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "payment-accounts"] }),
  });

  const accounts = data?.accounts ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Payment Accounts</h1>
          <p className="text-sm text-slate-500">Bank, JazzCash and Easypaisa accounts where providers send commission payments.</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
          <Plus size={16} /> New account
        </button>
      </div>

      {showForm && (
        <AccountForm
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={(p) => save.mutate({ ...p, id: editing?.id })}
          saving={save.isPending}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : accounts.length === 0 ? (
          <div className="col-span-full bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
            No payment accounts yet.
          </div>
        ) : accounts.map((a) => (
          <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Building2 size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 truncate">{a.label}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${a.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {a.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {a.bankName && <p className="text-sm text-slate-500">{a.bankName}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditing(a); setShowForm(true); }} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"><Pencil size={16} /></button>
                {confirmDeleteId === a.id ? (
                  <span className="inline-flex items-center gap-1">
                    <button onClick={() => { remove.mutate(a.id); setConfirmDeleteId(null); }} className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">Confirm</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDeleteId(a.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                )}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-slate-500">Title</div><div className="text-slate-800">{a.accountTitle}</div></div>
              <div><div className="text-xs text-slate-500">Number</div><div className="text-slate-800 font-mono">{a.accountNumber}</div></div>
              {a.iban && <div className="col-span-2"><div className="text-xs text-slate-500">IBAN</div><div className="text-slate-800 font-mono text-xs">{a.iban}</div></div>}
              {a.instructions && <div className="col-span-2"><div className="text-xs text-slate-500">Instructions</div><div className="text-slate-700 text-sm">{a.instructions}</div></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountForm({ initial, onCancel, onSave, saving }: { initial: Account | null; onCancel: () => void; onSave: (a: Partial<Account>) => void; saving: boolean }) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [accountTitle, setAccountTitle] = useState(initial?.accountTitle ?? "");
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? "");
  const [iban, setIban] = useState(initial?.iban ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-900">{initial ? "Edit account" : "New account"}</h2>
        <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <F label="Label *"><input value={label} onChange={(e) => setLabel(e.target.value)} className="i" placeholder="HBL Main" /></F>
        <F label="Bank / Service"><input value={bankName} onChange={(e) => setBankName(e.target.value)} className="i" placeholder="HBL / JazzCash / Easypaisa" /></F>
        <F label="Account title *"><input value={accountTitle} onChange={(e) => setAccountTitle(e.target.value)} className="i" placeholder="Athoo Pakistan" /></F>
        <F label="Account number *"><input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="i" /></F>
        <F label="IBAN" wide><input value={iban} onChange={(e) => setIban(e.target.value)} className="i" /></F>
        <F label="Instructions" wide><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} className="i min-h-[60px]" placeholder="Send screenshot of payment after transfer" /></F>
        <F label="Sort order"><input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="i" /></F>
        <F label="Active"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Show on provider app</label></F>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg">Cancel</button>
        <button
          disabled={saving || !label.trim() || !accountTitle.trim() || !accountNumber.trim()}
          onClick={() => onSave({ label, bankName: bankName || null, accountTitle, accountNumber, iban: iban || null, instructions: instructions || null, isActive, sortOrder: Number(sortOrder) || 0 })}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />} Save
        </button>
      </div>
      <style>{`.i{width:100%;border:1px solid #e2e8f0;border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.i:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.1)}`}</style>
    </div>
  );
}

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? "md:col-span-2" : undefined}><label className="text-xs font-medium text-slate-600 mb-1 block">{label}</label>{children}</div>;
}

