import React from "react";
import { View, Text } from "react-native";

export function AthooMapFallback() {
  return (
    <View style={{ minHeight: 220, borderRadius: 16, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", textAlign: "center" }}>
        Map system is being upgraded
      </Text>
      <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginTop: 8 }}>
        Athoo is switching to GraphHopper/OpenStreetMap provider-based maps.
      </Text>
    </View>
  );
}
