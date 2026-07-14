import { useState } from "react";
import { getApiBase } from "@/lib/api";
import { Eye, EyeOff, Shield, Loader2, AlertCircle } from "lucide-react";

const logoUrl = "/logo.png";

interface LoginPageProps {
  onLogin: (identifier: string, password: string, apiBase: string) => Promise<void>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const apiBase = getApiBase();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      await onLogin(identifier.trim(), password, apiBase);
    } catch (err) {
      setError((err as Error).message || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background circles */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/8 rounded-full -translate-y-48 translate-x-48 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/6 rounded-full translate-y-40 -translate-x-40 blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo & branding */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-5">
            <div className="absolute inset-0 bg-blue-500/20 rounded-3xl blur-xl" />
            <div className="relative w-20 h-20 flex items-center justify-center mx-auto bg-white backdrop-blur-sm border border-white/20 rounded-3xl shadow-2xl">
              <img src={logoUrl} alt="Athoo" className="w-12 h-12 object-contain drop-shadow-lg" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Athoo Admin</h1>
          <p className="text-slate-400 mt-1.5 text-sm">Operations, Finance & Verification Hub</p>
        </div>

        {/* Card */}
        <div className="bg-white/[0.06] backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-7">
          <div className="flex items-center gap-2 mb-6">
            <Shield size={16} className="text-blue-400 shrink-0" />
            <h2 className="text-base font-semibold text-white">Sign in to continue</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-widest">
                Email or Phone
              </label>
              <input
                data-testid="admin-login-identifier"
                type="text"
                value={identifier}
                onChange={(e) => { setIdentifier(e.target.value); setError(""); }}
                className="w-full px-3.5 py-2.5 text-sm bg-white/[0.07] border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/40 text-white placeholder:text-slate-500 transition-all"
                placeholder="admin@athoo.pk or 03001234567"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-widest">
                Password
              </label>
              <div className="relative">
                <input
                  data-testid="admin-login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  className="w-full px-3.5 py-2.5 text-sm bg-white/[0.07] border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/40 text-white placeholder:text-slate-500 transition-all pr-10"
                  placeholder="Enter your password"
                  minLength={12}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-0.5"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl px-3.5 py-2.5">
                <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <button
              data-testid="admin-login-submit"
              type="submit"
              disabled={loading || !identifier.trim() || !password}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-all duration-150 text-sm mt-1 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-white/8">
            <p className="text-xs text-slate-500 text-center">
              Admin access only · Five failed attempts temporarily lock the account · Requires <code className="bg-white/10 text-slate-300 px-1.5 py-0.5 rounded-md text-xs">role = admin</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
