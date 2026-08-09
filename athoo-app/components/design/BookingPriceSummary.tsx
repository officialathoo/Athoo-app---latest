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

const money = (value: number) =>
  `Rs. ${Math.max(0, Math.round(value)).toLocaleString()}`;

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
    <AppCard
      testID={testID}
      elevated={false}
      padding="md"
      style={{ backgroundColor: theme.colors.surfaceAlt }}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <AppText variant="bodyStrong">{title}</AppText>
          <AppText variant="caption" tone="muted">
            Clear price breakdown before work starts
          </AppText>
        </View>

        <View style={[styles.totalPill, { backgroundColor: theme.colors.successSoft }]}>
          <AppText variant="bodyStrong" tone="success">
            {openOffer && rate <= 0 ? "Provider quote" : money(estimated)}
          </AppText>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />

      <Row label="Service offer" value={openOffer && rate <= 0 ? "Open" : money(rate)} />
      <Row label="Travel charge" value={travel > 0 ? money(travel) : "Free"} />
      {saved > 0 ? <Row label="Discount" value={`âˆ’ ${money(saved)}`} success /> : null}

      <AppText variant="caption" tone="muted" style={styles.note}>
        Final amount is confirmed before work starts. Material costs, when required, are agreed separately.
      </AppText>
    </AppCard>
  );
}

function Row({
  label,
  value,
  success = false,
}: {
  label: string;
  value: string;
  success?: boolean;
}) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="label" tone={success ? "success" : "primary"}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  totalPill: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
    gap: 12,
  },
  note: {
    marginTop: 4,
    lineHeight: 16,
  },
});