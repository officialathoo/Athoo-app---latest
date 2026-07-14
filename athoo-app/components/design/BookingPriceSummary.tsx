import React from "react";
import { StyleSheet, View } from "react-native";
import { AppCard } from "./AppCard";
import { AppText } from "./AppText";
import { useTheme } from "@/context/ThemeContext";

interface BookingPriceSummaryProps {
  hourlyRate?: number | null;
  travelCharge?: number | null;
  discount?: number | null;
  openOffer?: boolean;
  title?: string;
  testID?: string;
}

const money = (value: number) => `Rs. ${Math.max(0, Math.round(value)).toLocaleString()}`;

export function BookingPriceSummary({
  hourlyRate,
  travelCharge,
  discount = 0,
  openOffer = false,
  title = "Estimated price",
  testID = "booking-price-summary",
}: BookingPriceSummaryProps) {
  const { theme } = useTheme();
  const rate = Number(hourlyRate || 0);
  const travel = Number(travelCharge || 0);
  const saved = Number(discount || 0);
  const estimated = Math.max(0, rate + travel - saved);

  return (
    <AppCard testID={testID} elevated={false} style={{ backgroundColor: theme.colors.surfaceAlt }}>
      <View style={styles.headerRow}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="bodyStrong" tone="success">
          {openOffer && rate <= 0 ? "Provider quote" : money(estimated)}
        </AppText>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />
      <Row label="Service offer" value={openOffer && rate <= 0 ? "Open" : money(rate)} />
      <Row label="Travel charge" value={travel > 0 ? money(travel) : "Free"} />
      {saved > 0 && <Row label="Discount" value={`− ${money(saved)}`} success />}
      <AppText variant="caption" tone="muted" style={styles.note}>
        Final amount is confirmed before work starts. Material costs, when required, are agreed separately.
      </AppText>
    </AppCard>
  );
}

function Row({ label, value, success = false }: { label: string; value: string; success?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" tone="secondary">{label}</AppText>
      <AppText variant="label" tone={success ? "success" : "primary"}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  divider: { height: 1, marginVertical: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  note: { marginTop: 6, lineHeight: 17 },
});
