import { useMemo, useState } from "react";

const HEX_PATTERN = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_PRESETS = [
  "#1A6EE0", "#0D4BA0", "#0EA5E9", "#14B8A6", "#10B981", "#16A34A",
  "#84CC16", "#F59E0B", "#F97316", "#EF4444", "#EC4899", "#8B5CF6",
  "#6366F1", "#334155", "#111827", "#FFFFFF",
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeHex(value: string, fallback = "#1A6EE0") {
  const raw = String(value || "").trim();
  if (HEX_PATTERN.test(raw)) return raw.slice(0, 7).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const chars = raw.slice(1).split("");
    return `#${chars.map((char) => char + char).join("")}`.toUpperCase();
  }
  return fallback;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex).slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255;
  const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn);
  let h = 0; let s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h: number, s: number, l: number) {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = clamp(s, 0, 100) / 100; const ln = clamp(l, 0, 100) / 100;
  if (sn === 0) { const gray = Math.round(ln * 255); return { r: gray, g: gray, b: gray }; }
  const hue2rgb = (p: number, q: number, t: number) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return { r: hue2rgb(p, q, hn + 1 / 3) * 255, g: hue2rgb(p, q, hn) * 255, b: hue2rgb(p, q, hn - 1 / 3) * 255 };
}

export function AdvancedColorPicker({ value, onChange, label = "Color", disabled = false }: { value: string; onChange: (value: string) => void; label?: string; disabled?: boolean }) {
  const normalized = normalizeHex(value);
  const rgb = useMemo(() => hexToRgb(normalized), [normalized]);
  const hsl = useMemo(() => rgbToHsl(rgb.r, rgb.g, rgb.b), [rgb.r, rgb.g, rgb.b]);
  const [mode, setMode] = useState<"hex" | "rgb" | "hsl">("hex");

  const updateRgb = (key: "r" | "g" | "b", next: number) => onChange(rgbToHex(key === "r" ? next : rgb.r, key === "g" ? next : rgb.g, key === "b" ? next : rgb.b));
  const updateHsl = (key: "h" | "s" | "l", next: number) => {
    const converted = hslToRgb(key === "h" ? next : hsl.h, key === "s" ? next : hsl.s, key === "l" ? next : hsl.l);
    onChange(rgbToHex(converted.r, converted.g, converted.b));
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(["hex", "rgb", "hsl"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setMode(item)} className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase ${mode === item ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{item}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input type="color" value={normalized} disabled={disabled} onChange={(event) => onChange(event.target.value.toUpperCase())} className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1 disabled:opacity-50" />
        {mode === "hex" ? (
          <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} onBlur={() => onChange(normalizeHex(value))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-blue-500" placeholder="#1A6EE0" />
        ) : null}
        {mode === "rgb" ? (
          <div className="grid flex-1 grid-cols-3 gap-2">
            {(["r", "g", "b"] as const).map((key) => <label key={key} className="space-y-1"><span className="text-[10px] font-semibold uppercase text-slate-400">{key}</span><input type="number" min={0} max={255} value={rgb[key]} disabled={disabled} onChange={(event) => updateRgb(key, Number(event.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm" /></label>)}
          </div>
        ) : null}
        {mode === "hsl" ? (
          <div className="grid flex-1 grid-cols-3 gap-2">
            {(["h", "s", "l"] as const).map((key) => <label key={key} className="space-y-1"><span className="text-[10px] font-semibold uppercase text-slate-400">{key}</span><input type="number" min={0} max={key === "h" ? 360 : 100} value={hsl[key]} disabled={disabled} onChange={(event) => updateHsl(key, Number(event.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm" /></label>)}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {COLOR_PRESETS.map((preset) => <button key={preset} type="button" disabled={disabled} onClick={() => onChange(preset)} className={`h-7 w-7 rounded-md border-2 ${normalized === preset ? "border-slate-900" : "border-white shadow-sm"}`} style={{ backgroundColor: preset }} title={preset} />)}
      </div>
      {!HEX_PATTERN.test(String(value || "").trim()) ? <p className="text-xs text-amber-700">Enter a six-digit HEX value. The saved value will be normalized automatically.</p> : null}
    </div>
  );
}

export function AdvancedGradientPicker({ from, to, onFromChange, onToChange, disabled = false }: { from: string; to: string; onFromChange: (value: string) => void; onToChange: (value: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="h-20 rounded-xl border border-slate-200 shadow-inner" style={{ background: `linear-gradient(135deg, ${normalizeHex(from)}, ${normalizeHex(to)})` }} />
      <div className="grid gap-3 md:grid-cols-2">
        <AdvancedColorPicker value={from} onChange={onFromChange} label="Gradient start" disabled={disabled} />
        <AdvancedColorPicker value={to} onChange={onToChange} label="Gradient end" disabled={disabled} />
      </div>
    </div>
  );
}
