import { Icon } from "@/components/ui/Icon";
import { Colors } from "@/constants/colors";
import { api } from "@/services/api";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type DaySchedule = { enabled: boolean; startTime: string; endTime: string };
type WeeklySchedule = Record<string, DaySchedule>;

const DAYS = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
];

const DEFAULT_SCHEDULE: WeeklySchedule = {
  mon: { enabled: true, startTime: "09:00", endTime: "18:00" },
  tue: { enabled: true, startTime: "09:00", endTime: "18:00" },
  wed: { enabled: true, startTime: "09:00", endTime: "18:00" },
  thu: { enabled: true, startTime: "09:00", endTime: "18:00" },
  fri: { enabled: true, startTime: "09:00", endTime: "18:00" },
  sat: { enabled: true, startTime: "09:00", endTime: "17:00" },
  sun: { enabled: false, startTime: "10:00", endTime: "16:00" },
};

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of ["00", "30"]) {
    const hh = String(h).padStart(2, "0");
    TIME_OPTIONS.push(`${hh}:${m}`);
  }
}

function formatTime(t: string) {
  const [hh, mm] = t.split(":");
  const h = Number(hh);
  const ampm = h >= 12 ? "PM" : "AM";
  const disp = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${disp}:${mm} ${ampm}`;
}

function TimeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen(!open)}
        style={styles.timePicker}
      >
        <Text style={styles.timePickerText}>{formatTime(value)}</Text>
        <Icon name="chevron-down" size={14} color={Colors.textSecondary} />
      </Pressable>
      {open && (
        <View style={styles.timeDropdown}>
          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
            {TIME_OPTIONS.map(t => (
              <Pressable
                key={t}
                style={[styles.timeOption, t === value && styles.timeOptionActive]}
                onPress={() => { onChange(t); setOpen(false); }}
              >
                <Text style={[styles.timeOptionText, t === value && { color: Colors.primary, fontWeight: "700" }]}>
                  {formatTime(t)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export default function AvailabilityScreen() {
  const insets = useSafeAreaInsets();
  const [schedule, setSchedule] = useState<WeeklySchedule>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSchedule();
  }, []);

  async function loadSchedule() {
    try {
      const res = await api.getSchedule();
      if (res.schedule) {
        setSchedule({ ...DEFAULT_SCHEDULE, ...res.schedule });
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  function updateDay(key: string, field: keyof DaySchedule, value: any) {
    setSchedule(s => ({ ...s, [key]: { ...s[key], [field]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateSchedule(schedule);
      Alert.alert("Saved", "Your availability schedule has been updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  }

  function setAllEnabled(enabled: boolean) {
    setSchedule(s => {
      const next = { ...s };
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key], enabled };
      }
      return next;
    });
  }

  const enabledCount = DAYS.filter(d => schedule[d.key]?.enabled).length;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F9FA" }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F8F9FA" }}>
      <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Availability Schedule</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.headerSub}>Set which days and hours you're available for bookings</Text>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryTitle}>
              {enabledCount === 7 ? "Available all week" : enabledCount === 0 ? "Not available" : `${enabledCount} days available`}
            </Text>
            <Text style={styles.summarySub}>Customers can only book during your enabled hours</Text>
          </View>
          <View style={styles.summaryBadge}>
            <Text style={styles.summaryBadgeText}>{enabledCount}/7</Text>
          </View>
        </View>

        {/* Quick toggles */}
        <View style={styles.quickRow}>
          <Pressable style={[styles.quickBtn, { backgroundColor: Colors.primary + "15" }]} onPress={() => setAllEnabled(true)}>
            <Text style={[styles.quickBtnText, { color: Colors.primary }]}>Enable All</Text>
          </Pressable>
          <Pressable style={[styles.quickBtn, { backgroundColor: Colors.error + "12" }]} onPress={() => setAllEnabled(false)}>
            <Text style={[styles.quickBtnText, { color: Colors.error }]}>Disable All</Text>
          </Pressable>
          <Pressable
            style={[styles.quickBtn, { backgroundColor: "#F59E0B15" }]}
            onPress={() => {
              setSchedule(s => {
                const next = { ...s };
                for (const key of ["sat", "sun"]) {
                  next[key] = { ...next[key], enabled: false };
                }
                for (const key of ["mon", "tue", "wed", "thu", "fri"]) {
                  next[key] = { ...next[key], enabled: true };
                }
                return next;
              });
            }}
          >
            <Text style={[styles.quickBtnText, { color: "#D97706" }]}>Weekdays Only</Text>
          </Pressable>
        </View>

        {/* Day rows */}
        <View style={styles.scheduleCard}>
          {DAYS.map((day, i) => {
            const d = schedule[day.key] || DEFAULT_SCHEDULE[day.key];
            return (
              <View key={day.key} style={[styles.dayRow, i < DAYS.length - 1 && styles.dayRowBorder]}>
                <View style={styles.dayLeft}>
                  <Switch
                    value={d.enabled}
                    onValueChange={v => updateDay(day.key, "enabled", v)}
                    trackColor={{ false: Colors.border, true: Colors.primary + "50" }}
                    thumbColor={d.enabled ? Colors.primary : "#ccc"}
                    style={Platform.OS === "ios" ? { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] } : {}}
                  />
                  <Text style={[styles.dayLabel, !d.enabled && styles.dayLabelOff]}>
                    {day.label}
                  </Text>
                </View>
                {d.enabled ? (
                  <View style={styles.timeRow}>
                    <TimeSelector value={d.startTime} onChange={v => updateDay(day.key, "startTime", v)} />
                    <Text style={styles.timeSep}>–</Text>
                    <TimeSelector value={d.endTime} onChange={v => updateDay(day.key, "endTime", v)} />
                  </View>
                ) : (
                  <Text style={styles.offLabel}>Off</Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Icon name="info" size={16} color="#2563EB" />
          <Text style={styles.infoText}>
            Your schedule affects when customers can make new bookings. Existing bookings are not affected.
          </Text>
        </View>

        {/* Save button */}
        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.saveBtnGrad}>
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Icon name="save" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Save Schedule</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff", flex: 1, textAlign: "center" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.75)", textAlign: "center" },
  summaryCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  summaryLeft: { flex: 1 },
  summaryTitle: { fontSize: 15, fontWeight: "700", color: Colors.text, marginBottom: 3 },
  summarySub: { fontSize: 12, color: Colors.textSecondary },
  summaryBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary + "15", justifyContent: "center", alignItems: "center" },
  summaryBadgeText: { fontSize: 15, fontWeight: "800", color: Colors.primary },
  quickRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  quickBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  quickBtnText: { fontSize: 12, fontWeight: "600" },
  scheduleCard: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", overflow: "hidden", marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  dayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  dayRowBorder: { borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  dayLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  dayLabel: { fontSize: 14, fontWeight: "600", color: Colors.text },
  dayLabelOff: { color: Colors.textSecondary },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  timeSep: { fontSize: 14, color: Colors.textSecondary, fontWeight: "500" },
  offLabel: { fontSize: 13, color: Colors.textSecondary, fontStyle: "italic" },
  timePicker: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  timePickerText: { fontSize: 12, fontWeight: "600", color: Colors.text, minWidth: 66 },
  timeDropdown: { position: "absolute", right: 0, top: 36, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", zIndex: 999, width: 120, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 },
  timeOption: { paddingVertical: 8, paddingHorizontal: 12 },
  timeOptionActive: { backgroundColor: Colors.primary + "10" },
  timeOptionText: { fontSize: 13, color: Colors.text },
  infoBanner: { flexDirection: "row", gap: 10, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, marginBottom: 16, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 13, color: "#1D4ED8", lineHeight: 18 },
  saveBtn: { borderRadius: 16, overflow: "hidden" },
  saveBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16 },
  saveBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
