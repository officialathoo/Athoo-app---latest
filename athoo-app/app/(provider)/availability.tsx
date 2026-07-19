import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { apiErrorToMessage } from "@/lib/apiError";
import { api } from "@/services/api";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
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
] as const;

const DEFAULT_SCHEDULE: WeeklySchedule = {
  mon: { enabled: true, startTime: "09:00", endTime: "18:00" },
  tue: { enabled: true, startTime: "09:00", endTime: "18:00" },
  wed: { enabled: true, startTime: "09:00", endTime: "18:00" },
  thu: { enabled: true, startTime: "09:00", endTime: "18:00" },
  fri: { enabled: true, startTime: "09:00", endTime: "18:00" },
  sat: { enabled: true, startTime: "09:00", endTime: "17:00" },
  sun: { enabled: false, startTime: "10:00", endTime: "16:00" },
};

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
});

function formatTime(value: string) {
  const [hourText, minute = "00"] = value.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minute} ${suffix}`;
}

function minutesFromMidnight(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function TimeSelector({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.selectorColumn}>
      <Text style={styles.timeCaption}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.timePicker, pressed && styles.timePickerPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatTime(value)}`}
      >
        <Text style={styles.timePickerText}>{formatTime(value)}</Text>
        <Icon name="chevron-down" size={15} color={theme.colors.textSecondary} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.timeSheet}>
            <View style={styles.timeSheetHeader}>
              <View>
                <Text style={styles.timeSheetTitle}>Select {label.toLowerCase()}</Text>
                <Text style={styles.timeSheetSubtitle}>Choose a 30-minute time slot</Text>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close time selector"
              >
                <Icon name="x" size={19} color={theme.colors.text} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.timeList}
              contentContainerStyle={styles.timeListContent}
              showsVerticalScrollIndicator={false}
            >
              {TIME_OPTIONS.map((time) => {
                const selected = time === value;
                return (
                  <Pressable
                    key={time}
                    style={({ pressed }) => [
                      styles.timeOption,
                      selected && styles.timeOptionActive,
                      pressed && styles.timeOptionPressed,
                    ]}
                    onPress={() => {
                      onChange(time);
                      setOpen(false);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.timeOptionText, selected && styles.timeOptionTextActive]}>
                      {formatTime(time)}
                    </Text>
                    {selected ? <Icon name="check-circle" size={18} color={theme.colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function AvailabilityScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [schedule, setSchedule] = useState<WeeklySchedule>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadSchedule();
  }, []);

  async function loadSchedule() {
    try {
      const response = await api.getSchedule();
      if (response.schedule) {
        setSchedule({ ...DEFAULT_SCHEDULE, ...response.schedule });
      }
    } catch {
      // Keep the safe local defaults when the network is temporarily unavailable.
    } finally {
      setLoading(false);
    }
  }

  function updateDay<Field extends keyof DaySchedule>(
    key: string,
    field: Field,
    value: DaySchedule[Field],
  ) {
    setSchedule((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
  }

  async function handleSave() {
    const invalidDay = DAYS.find(({ key }) => {
      const day = schedule[key];
      return day?.enabled && minutesFromMidnight(day.endTime) <= minutesFromMidnight(day.startTime);
    });
    if (invalidDay) {
      Alert.alert(
        "Check availability time",
        `${invalidDay.label}'s end time must be later than its start time.`,
      );
      return;
    }

    setSaving(true);
    try {
      await api.updateSchedule(schedule);
      Alert.alert("Saved", "Your availability schedule has been updated.");
    } catch (error: unknown) {
      Alert.alert("Unable to save", apiErrorToMessage(error, "Could not save your availability. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  function setAllEnabled(enabled: boolean) {
    setSchedule((current) => {
      const next: WeeklySchedule = { ...current };
      for (const { key } of DAYS) {
        next[key] = { ...(current[key] || DEFAULT_SCHEDULE[key]), enabled };
      }
      return next;
    });
  }

  const enabledCount = DAYS.filter(({ key }) => schedule[key]?.enabled).length;

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.primary, theme.colors.primaryPressed]}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Icon name="arrow-left" size={20} color={theme.colors.onBrand} />
          </Pressable>
          <Text style={styles.headerTitle}>Availability Schedule</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={styles.headerSubtitle}>Set the days and hours customers can book you</Text>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryText}>
            <Text style={styles.summaryTitle}>
              {enabledCount === 7 ? "Available all week" : enabledCount === 0 ? "Not available" : `${enabledCount} days available`}
            </Text>
            <Text style={styles.summarySubtitle}>Existing bookings are not changed by this schedule.</Text>
          </View>
          <View style={styles.summaryBadge}>
            <Text style={styles.summaryBadgeText}>{enabledCount}/7</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickActions}
        >
          <Pressable style={[styles.quickButton, styles.enableButton]} onPress={() => setAllEnabled(true)}>
            <Text style={[styles.quickButtonText, { color: theme.colors.primary }]}>Enable All</Text>
          </Pressable>
          <Pressable style={[styles.quickButton, styles.disableButton]} onPress={() => setAllEnabled(false)}>
            <Text style={[styles.quickButtonText, { color: theme.colors.danger }]}>Disable All</Text>
          </Pressable>
          <Pressable
            style={[styles.quickButton, styles.weekdaysButton]}
            onPress={() => {
              setSchedule((current) => {
                const next: WeeklySchedule = { ...current };
                for (const { key } of DAYS) {
                  next[key] = {
                    ...(current[key] || DEFAULT_SCHEDULE[key]),
                    enabled: key !== "sat" && key !== "sun",
                  };
                }
                return next;
              });
            }}
          >
            <Text style={[styles.quickButtonText, { color: theme.colors.warning }]}>Weekdays Only</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.scheduleCard}>
          {DAYS.map((day, index) => {
            const current = schedule[day.key] || DEFAULT_SCHEDULE[day.key];
            return (
              <View
                key={day.key}
                style={[styles.dayBlock, index < DAYS.length - 1 && styles.dayBlockBorder]}
              >
                <View style={styles.dayHeader}>
                  <View style={styles.dayIdentity}>
                    <View style={styles.dayShortBadge}>
                      <Text style={styles.dayShortText}>{day.short}</Text>
                    </View>
                    <View>
                      <Text style={[styles.dayLabel, !current.enabled && styles.dayLabelDisabled]}>{day.label}</Text>
                      <Text style={styles.dayStatus}>{current.enabled ? "Accepting bookings" : "Day off"}</Text>
                    </View>
                  </View>
                  <Switch
                    value={current.enabled}
                    onValueChange={(value) => updateDay(day.key, "enabled", value)}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary + "55" }}
                    thumbColor={current.enabled ? theme.colors.primary : theme.colors.textMuted}
                    style={Platform.OS === "ios" ? styles.compactSwitch : undefined}
                    accessibilityLabel={`${current.enabled ? "Disable" : "Enable"} ${day.label}`}
                  />
                </View>

                {current.enabled ? (
                  <View style={styles.timeRow}>
                    <TimeSelector
                      label="Start time"
                      value={current.startTime}
                      onChange={(value) => updateDay(day.key, "startTime", value)}
                    />
                    <View style={styles.timeConnector}>
                      <Icon name="arrow-right" size={16} color={theme.colors.textMuted} />
                    </View>
                    <TimeSelector
                      label="End time"
                      value={current.endTime}
                      onChange={(value) => updateDay(day.key, "endTime", value)}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={styles.infoBanner}>
          <Icon name="info" size={17} color={theme.colors.info} />
          <Text style={styles.infoText}>
            Customers can create new bookings only inside enabled hours. You can still manage existing bookings at any time.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed, saving && styles.saveButtonDisabled]}
          onPress={() => void handleSave()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save availability schedule"
        >
          <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.saveGradient}>
            {saving ? (
              <ActivityIndicator color={theme.colors.onBrand} size="small" />
            ) : (
              <>
                <Icon name="save" size={18} color={theme.colors.onBrand} />
                <Text style={styles.saveText}>Save Schedule</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background },
    header: { paddingHorizontal: 20, paddingBottom: 20 },
    headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
    headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: theme.colors.onBrand },
    headerSpacer: { width: 40 },
    headerSubtitle: { textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.78)" },
    scroll: { flex: 1 },
    scrollContent: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 16 },
    summaryCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, marginBottom: 12, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
    summaryText: { flex: 1 },
    summaryTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
    summarySubtitle: { marginTop: 3, fontSize: 12, lineHeight: 17, color: theme.colors.textSecondary },
    summaryBadge: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary + "18" },
    summaryBadgeText: { fontSize: 15, fontWeight: "900", color: theme.colors.primary },
    quickActions: { gap: 8, paddingBottom: 12 },
    quickButton: { minHeight: 40, minWidth: 112, paddingHorizontal: 14, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1 },
    enableButton: { backgroundColor: theme.colors.primary + "12", borderColor: theme.colors.primary + "28" },
    disableButton: { backgroundColor: theme.colors.danger + "10", borderColor: theme.colors.danger + "25" },
    weekdaysButton: { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warning + "30" },
    quickButtonText: { fontSize: 12, fontWeight: "700" },
    scheduleCard: { marginBottom: 12, borderRadius: 16, overflow: "hidden", backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
    dayBlock: { padding: 14 },
    dayBlockBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    dayHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    dayIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
    dayShortBadge: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary + "12" },
    dayShortText: { fontSize: 11, fontWeight: "800", color: theme.colors.primary },
    dayLabel: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
    dayLabelDisabled: { color: theme.colors.textSecondary },
    dayStatus: { marginTop: 1, fontSize: 11, color: theme.colors.textMuted },
    compactSwitch: { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] },
    timeRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 12 },
    selectorColumn: { flex: 1, minWidth: 0 },
    timeCaption: { marginBottom: 5, fontSize: 10, fontWeight: "700", color: theme.colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
    timePicker: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, paddingHorizontal: 12, borderRadius: 11, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border },
    timePickerPressed: { opacity: 0.78 },
    timePickerText: { flexShrink: 1, fontSize: 13, fontWeight: "700", color: theme.colors.text },
    timeConnector: { width: 24, height: 46, alignItems: "center", justifyContent: "center" },
    modalOverlay: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.55)" },
    timeSheet: { width: "100%", maxWidth: 440, maxHeight: "78%", alignSelf: "center", overflow: "hidden", borderRadius: 22, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
    timeSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    timeSheetTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
    timeSheetSubtitle: { marginTop: 2, fontSize: 12, color: theme.colors.textSecondary },
    closeButton: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceAlt },
    timeList: { flexGrow: 0 },
    timeListContent: { padding: 10 },
    timeOption: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, borderRadius: 11 },
    timeOptionActive: { backgroundColor: theme.colors.primary + "12" },
    timeOptionPressed: { opacity: 0.72 },
    timeOptionText: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
    timeOptionTextActive: { fontWeight: "800", color: theme.colors.primary },
    infoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, marginBottom: 16, borderRadius: 12, backgroundColor: theme.colors.infoSoft, borderWidth: 1, borderColor: theme.colors.info + "30" },
    infoText: { flex: 1, fontSize: 13, lineHeight: 18, color: theme.colors.info },
    saveButton: { borderRadius: 16, overflow: "hidden" },
    saveButtonPressed: { transform: [{ scale: 0.99 }] },
    saveButtonDisabled: { opacity: 0.7 },
    saveGradient: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 18 },
    saveText: { fontSize: 16, fontWeight: "800", color: theme.colors.onBrand },
  });
}
