import { Colors } from "@/constants/colors";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const ITEM_H = 52;
const VISIBLE = 5;
const PAD_ITEMS = 2;
const COL_PAD = ITEM_H * PAD_ITEMS;

export const HOUR_LIST = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")); // 01..12
export const MINUTE_LIST = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")); // 00,05..55
export const PERIOD_LIST = ["AM", "PM"];

export interface TimeValue {
  hour: number; // 1..12
  minute: number; // 0,5,10..55
  period: "AM" | "PM";
}

export function formatTimeValue(v: TimeValue): string {
  return `${String(v.hour).padStart(2, "0")}:${String(v.minute).padStart(2, "0")} ${v.period}`;
}

interface DrumColProps {
  data: string[];
  selectedIndex: number;
  onChange: (idx: number) => void;
  flex?: number;
  fontSize?: number;
}

function DrumCol({ data, selectedIndex, onChange, flex = 1, fontSize = 22 }: DrumColProps) {
  const ref = useRef<ScrollView>(null);

  const scrollTo = useCallback((idx: number, animated: boolean) => {
    ref.current?.scrollTo({ y: idx * ITEM_H, animated });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => scrollTo(selectedIndex, false), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[drumStyles.col, { flex }]}>
      <View pointerEvents="none" style={drumStyles.selectionFrame} />

      <ScrollView
        ref={ref}
        style={{ height: ITEM_H * VISIBLE }}
        contentContainerStyle={{ paddingVertical: COL_PAD }}
        snapToInterval={ITEM_H}
        decelerationRate={Platform.OS === "ios" ? "fast" : 0.85}
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.max(0, Math.min(
            Math.round(e.nativeEvent.contentOffset.y / ITEM_H),
            data.length - 1
          ));
          onChange(idx);
        }}
        onScrollEndDrag={(e) => {
          if (Platform.OS === "web") {
            const idx = Math.max(0, Math.min(
              Math.round(e.nativeEvent.contentOffset.y / ITEM_H),
              data.length - 1
            ));
            onChange(idx);
          }
        }}
      >
        {data.map((val, i) => (
          <Pressable
            key={val}
            style={drumStyles.item}
            onPress={() => { onChange(i); scrollTo(i, true); }}
          >
            <Text
              style={[
                drumStyles.itemText,
                { fontSize },
                i === selectedIndex && drumStyles.itemTextSel,
              ]}
            >
              {val}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

interface TimePickerProps {
  value: TimeValue;
  onChange: (v: TimeValue) => void;
}

export function TimePicker({ value, onChange }: TimePickerProps) {
  const [showManual, setShowManual] = useState(false);
  const [manualText, setManualText] = useState(formatTimeValue(value));
  const [manualError, setManualError] = useState(false);

  const hourIdx = value.hour - 1; // 1→0, 2→1 ... 12→11
  const minIdx = Math.round(value.minute / 5); // 0→0, 5→1 ... 55→11
  const perIdx = value.period === "AM" ? 0 : 1;

  const handleManualChange = (raw: string) => {
    setManualText(raw);
    setManualError(false);
    const parsed = parseManualTime(raw);
    if (parsed) {
      onChange(parsed);
    } else {
      setManualError(true);
    }
  };

  return (
    <View style={styles.wrap}>
      {/* Displayed time */}
      <View style={styles.displayRow}>
        <Text style={styles.displayTime}>{formatTimeValue(value)}</Text>
        <Pressable
          style={styles.manualToggle}
          onPress={() => {
            setShowManual(!showManual);
            if (!showManual) setManualText(formatTimeValue(value));
          }}
        >
          <Text style={styles.manualToggleText}>
            {showManual ? "Use scroll" : "Type time"}
          </Text>
        </Pressable>
      </View>

      {showManual ? (
        <View style={styles.manualWrap}>
          <TextInput
            style={[styles.manualInput, manualError && styles.manualInputError]}
            value={manualText}
            onChangeText={handleManualChange}
            placeholder="e.g. 02:30 PM or 14:30"
            placeholderTextColor={Colors.textMuted}
            autoFocus
            autoCapitalize="characters"
            returnKeyType="done"
          />
          {manualError && (
            <Text style={styles.manualErrTxt}>Use format like "02:30 PM" or "14:30"</Text>
          )}
        </View>
      ) : (
        <View style={styles.drum}>
          <DrumCol
            data={HOUR_LIST}
            selectedIndex={hourIdx}
            fontSize={28}
            onChange={(idx) => onChange({ ...value, hour: idx + 1 })}
          />

          <View style={styles.colon}>
            <Text style={styles.colonText}>:</Text>
          </View>

          <DrumCol
            data={MINUTE_LIST}
            selectedIndex={minIdx}
            fontSize={28}
            onChange={(idx) => onChange({ ...value, minute: idx * 5 })}
          />

          <View style={styles.separator} />

          <DrumCol
            data={PERIOD_LIST}
            selectedIndex={perIdx}
            flex={0.8}
            fontSize={18}
            onChange={(idx) => onChange({ ...value, period: PERIOD_LIST[idx] as "AM" | "PM" })}
          />
        </View>
      )}

      {/* Quick presets */}
      {!showManual && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.presets}>
            {([
              { label: "Morning", h: 8, m: 0, p: "AM" },
              { label: "Noon", h: 12, m: 0, p: "PM" },
              { label: "Afternoon", h: 2, m: 0, p: "PM" },
              { label: "Evening", h: 5, m: 0, p: "PM" },
              { label: "Night", h: 8, m: 0, p: "PM" },
            ] as Array<{ label: string; h: number; m: number; p: "AM" | "PM" }>).map((q) => {
              const isActive = value.hour === q.h && value.minute === q.m && value.period === q.p;
              return (
                <Pressable
                  key={q.label}
                  style={[styles.preset, isActive && styles.presetActive]}
                  onPress={() => onChange({ hour: q.h, minute: q.m, period: q.p })}
                >
                  <Text style={[styles.presetText, isActive && styles.presetTextActive]}>
                    {q.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function parseManualTime(raw: string): TimeValue | null {
  const s = raw.trim().toUpperCase();

  // 12-hr with AM/PM: "2:30 PM", "02:30PM", "2:30PM"
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/);
  if (m12) {
    const h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const p = m12[3] as "AM" | "PM";
    if (h < 1 || h > 12 || min < 0 || min > 59) return null;
    const snappedMin = Math.round(min / 5) * 5;
    return { hour: h, minute: snappedMin > 55 ? 55 : snappedMin, period: p };
  }

  // 24-hr: "14:30"
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h24 = parseInt(m24[1], 10);
    const min = parseInt(m24[2], 10);
    if (h24 < 0 || h24 > 23 || min < 0 || min > 59) return null;
    const period: "AM" | "PM" = h24 < 12 ? "AM" : "PM";
    let h = h24 % 12;
    if (h === 0) h = 12;
    const snappedMin = Math.round(min / 5) * 5;
    return { hour: h, minute: snappedMin > 55 ? 55 : snappedMin, period };
  }

  return null;
}

const drumStyles = StyleSheet.create({
  col: {
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  selectionFrame: {
    position: "absolute",
    top: ITEM_H * PAD_ITEMS,
    left: 4,
    right: 4,
    height: ITEM_H,
    borderRadius: 12,
    backgroundColor: Colors.primary + "14",
    borderWidth: 1.5,
    borderColor: Colors.primary + "40",
    zIndex: 1,
  },
  item: {
    height: ITEM_H,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  itemText: {
    fontWeight: "600",
    color: Colors.textMuted,
  },
  itemTextSel: {
    color: Colors.primary,
    fontWeight: "800",
  },
});

const styles = StyleSheet.create({
  wrap: { gap: 14 },

  displayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  displayTime: {
    fontSize: 32,
    fontWeight: "900",
    color: Colors.primary,
    letterSpacing: -1,
  },
  manualToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.primary + "14",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  manualToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
  },

  drum: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: "hidden",
    paddingHorizontal: 8,
  },
  colon: {
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  colonText: {
    fontSize: 28,
    fontWeight: "900",
    color: Colors.primary,
  },
  separator: {
    width: 1,
    height: ITEM_H * 3,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },

  manualWrap: { gap: 6 },
  manualInput: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
    letterSpacing: 1,
  },
  manualInputError: {
    borderColor: Colors.error,
    backgroundColor: Colors.error + "08",
  },
  manualErrTxt: {
    fontSize: 12,
    color: Colors.error,
    textAlign: "center",
  },

  presets: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  preset: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  presetActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  presetText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  presetTextActive: { color: "#fff" },
});
