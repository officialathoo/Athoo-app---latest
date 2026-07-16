import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";

const ITEM_H = 52;
const VISIBLE = 5;
const PAD_ITEMS = 2;
const COL_PAD = ITEM_H * PAD_ITEMS;

export const HOUR_LIST = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
export const MINUTE_LIST = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
export const PERIOD_LIST = ["AM", "PM"];

export interface TimeValue {
  hour: number;
  minute: number;
  period: "AM" | "PM";
}

export function formatTimeValue(value: TimeValue): string {
  return `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")} ${value.period}`;
}

interface DrumColProps {
  data: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  flex?: number;
  fontSize?: number;
}

function DrumCol({ data, selectedIndex, onChange, flex = 1, fontSize = 22 }: DrumColProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createDrumStyles(theme), [theme]);
  const ref = useRef<ScrollView>(null);

  const scrollTo = useCallback((index: number, animated: boolean) => {
    ref.current?.scrollTo({ y: index * ITEM_H, animated });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => scrollTo(selectedIndex, false), 80);
    return () => clearTimeout(timer);
  }, [scrollTo, selectedIndex]);

  return (
    <View style={[styles.col, { flex }]}>
      <View pointerEvents="none" style={styles.selectionFrame} />
      <ScrollView
        ref={ref}
        style={{ height: ITEM_H * VISIBLE }}
        contentContainerStyle={{ paddingVertical: COL_PAD }}
        snapToInterval={ITEM_H}
        decelerationRate={Platform.OS === "ios" ? "fast" : 0.85}
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const index = Math.max(
            0,
            Math.min(Math.round(event.nativeEvent.contentOffset.y / ITEM_H), data.length - 1),
          );
          onChange(index);
        }}
        onScrollEndDrag={(event) => {
          if (Platform.OS === "web") {
            const index = Math.max(
              0,
              Math.min(Math.round(event.nativeEvent.contentOffset.y / ITEM_H), data.length - 1),
            );
            onChange(index);
          }
        }}
      >
        {data.map((value, index) => (
          <Pressable
            key={value}
            style={styles.item}
            onPress={() => {
              onChange(index);
              scrollTo(index, true);
            }}
          >
            <Text style={[styles.itemText, { fontSize }, index === selectedIndex && styles.itemTextSelected]}>
              {value}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

interface TimePickerProps {
  value: TimeValue;
  onChange: (value: TimeValue) => void;
}

export function TimePicker({ value, onChange }: TimePickerProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [showManual, setShowManual] = useState(false);
  const [manualText, setManualText] = useState(formatTimeValue(value));
  const [manualError, setManualError] = useState(false);

  const hourIndex = value.hour - 1;
  const minuteIndex = Math.round(value.minute / 5);
  const periodIndex = value.period === "AM" ? 0 : 1;

  const handleManualChange = (raw: string) => {
    setManualText(raw);
    const parsed = parseManualTime(raw);
    setManualError(!parsed);
    if (parsed) onChange(parsed);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.displayRow}>
        <Text style={styles.displayTime}>{formatTimeValue(value)}</Text>
        <Pressable
          style={styles.manualToggle}
          onPress={() => {
            setShowManual((current) => !current);
            if (!showManual) setManualText(formatTimeValue(value));
          }}
          accessibilityRole="button"
        >
          <Text style={styles.manualToggleText}>{showManual ? "Use scroll" : "Type time"}</Text>
        </Pressable>
      </View>

      {showManual ? (
        <View style={styles.manualWrap}>
          <TextInput
            style={[styles.manualInput, manualError && styles.manualInputError]}
            value={manualText}
            onChangeText={handleManualChange}
            placeholder="e.g. 02:30 PM or 14:30"
            placeholderTextColor={theme.colors.textMuted}
            autoFocus
            autoCapitalize="characters"
            returnKeyType="done"
          />
          {manualError ? (
            <Text style={styles.manualErrorText}>Use format like “02:30 PM” or “14:30”</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.drum}>
          <DrumCol
            data={HOUR_LIST}
            selectedIndex={hourIndex}
            fontSize={28}
            onChange={(index) => onChange({ ...value, hour: index + 1 })}
          />
          <View style={styles.colon}>
            <Text style={styles.colonText}>:</Text>
          </View>
          <DrumCol
            data={MINUTE_LIST}
            selectedIndex={minuteIndex}
            fontSize={28}
            onChange={(index) => onChange({ ...value, minute: index * 5 })}
          />
          <View style={styles.separator} />
          <DrumCol
            data={PERIOD_LIST}
            selectedIndex={periodIndex}
            flex={0.8}
            fontSize={18}
            onChange={(index) => onChange({ ...value, period: PERIOD_LIST[index] as "AM" | "PM" })}
          />
        </View>
      )}

      {!showManual ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.presets}>
            {([
              { label: "Morning", hour: 8, minute: 0, period: "AM" },
              { label: "Noon", hour: 12, minute: 0, period: "PM" },
              { label: "Afternoon", hour: 2, minute: 0, period: "PM" },
              { label: "Evening", hour: 5, minute: 0, period: "PM" },
              { label: "Night", hour: 8, minute: 0, period: "PM" },
            ] as Array<{ label: string; hour: number; minute: number; period: "AM" | "PM" }>).map((preset) => {
              const active = value.hour === preset.hour
                && value.minute === preset.minute
                && value.period === preset.period;
              return (
                <Pressable
                  key={preset.label}
                  style={[styles.preset, active && styles.presetActive]}
                  onPress={() => onChange({ hour: preset.hour, minute: preset.minute, period: preset.period })}
                >
                  <Text style={[styles.presetText, active && styles.presetTextActive]}>{preset.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function parseManualTime(raw: string): TimeValue | null {
  const input = raw.trim().toUpperCase();
  const twelveHour = input.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/);
  if (twelveHour) {
    const hour = Number.parseInt(twelveHour[1], 10);
    const minute = Number.parseInt(twelveHour[2], 10);
    const period = twelveHour[3] as "AM" | "PM";
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    const snapped = Math.round(minute / 5) * 5;
    return { hour, minute: Math.min(snapped, 55), period };
  }

  const twentyFourHour = input.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHour) {
    const hour24 = Number.parseInt(twentyFourHour[1], 10);
    const minute = Number.parseInt(twentyFourHour[2], 10);
    if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) return null;
    const period: "AM" | "PM" = hour24 < 12 ? "AM" : "PM";
    const hour = hour24 % 12 || 12;
    const snapped = Math.round(minute / 5) * 5;
    return { hour, minute: Math.min(snapped, 55), period };
  }

  return null;
}

function createDrumStyles(theme: AthooTheme) {
  return StyleSheet.create({
    col: { alignItems: "center", position: "relative", overflow: "hidden" },
    selectionFrame: {
      position: "absolute",
      top: ITEM_H * PAD_ITEMS,
      left: 4,
      right: 4,
      height: ITEM_H,
      borderRadius: 12,
      backgroundColor: theme.colors.infoSoft,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
      zIndex: 1,
    },
    item: { height: ITEM_H, justifyContent: "center", alignItems: "center", paddingHorizontal: 4 },
    itemText: { fontWeight: "600", color: theme.colors.textMuted },
    itemTextSelected: { color: theme.colors.primary, fontWeight: "800" },
  });
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    wrap: { gap: 14 },
    displayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    displayTime: { fontSize: 32, fontWeight: "900", color: theme.colors.primary, letterSpacing: -1 },
    manualToggle: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: theme.colors.infoSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    manualToggleText: { fontSize: 12, fontWeight: "700", color: theme.colors.primary },
    drum: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.elevated,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      overflow: "hidden",
      paddingHorizontal: 8,
    },
    colon: { paddingHorizontal: 4, paddingBottom: 4 },
    colonText: { fontSize: 28, fontWeight: "900", color: theme.colors.primary },
    separator: { width: 1, height: ITEM_H * 3, backgroundColor: theme.colors.divider, marginHorizontal: 4 },
    manualWrap: { gap: 6 },
    manualInput: {
      backgroundColor: theme.colors.input,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 22,
      fontWeight: "700",
      color: theme.colors.text,
      textAlign: "center",
      letterSpacing: 1,
    },
    manualInputError: { borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerSoft },
    manualErrorText: { fontSize: 12, color: theme.colors.danger, textAlign: "center" },
    presets: { flexDirection: "row", gap: 8, paddingVertical: 2 },
    preset: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
    },
    presetActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    presetText: { fontSize: 13, fontWeight: "600", color: theme.colors.textSecondary },
    presetTextActive: { color: theme.colors.white },
  });
}
