import { Icon } from "@/components/ui/Icon";
import * as Location from "expo-location";
import { reverseGeocodeGoogle } from "@/services/maps";
import { ensureForegroundLocation } from "@/lib/permissions";
import { useToast } from "@/context/ToastContext";
import { apiErrorToMessage } from "@/lib/apiError";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { api } from "@/services/api";

type SavedAddress = {
  id: string;
  userId: string;
  label: string;
  address: string;
  icon: string;
  isDefault: boolean;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
};

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { showError, showSuccess } = useToast();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);

  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newLatitude, setNewLatitude] = useState<number | undefined>(undefined);
  const [newLongitude, setNewLongitude] = useState<number | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAddresses();
      setAddresses(res.addresses || []);
    } catch (e: any) {
      // silent fail — show empty addresses list
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleUseCurrentLocation = async () => {
    try {
      setLoadingLocation(true);
      const perm = await ensureForegroundLocation({
        rationaleTitle: "Location permission",
        rationaleBody: "ATHOO needs your location to save your current address for faster bookings.",
      });
      if (perm !== "granted") {
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setNewLatitude(loc.coords.latitude);
      setNewLongitude(loc.coords.longitude);

      const resolved = await reverseGeocodeGoogle(loc.coords.latitude, loc.coords.longitude);
      if (resolved) setNewAddress(resolved);

      if (!newLabel.trim()) setNewLabel("Current Location");
    } catch (e) {
      showError("Location Error", apiErrorToMessage(e, "Could not fetch your current location."));
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleAdd = async () => {
    if (!newLabel.trim() || !newAddress.trim()) {
      showError("Fill all fields", "Please enter both a label and an address.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.addAddress({
        label: newLabel.trim(),
        address: newAddress.trim(),
        icon: "map-pin",
        latitude: newLatitude ?? null,
        longitude: newLongitude ?? null,
      });
      setAddresses((prev) => [...prev, res.address]);
      setNewLabel("");
      setNewAddress("");
      setNewLatitude(undefined);
      setNewLongitude(undefined);
      setAdding(false);
      showSuccess("Saved", "Address added.");
    } catch (e) {
      showError("Could not save", apiErrorToMessage(e, "Failed to save address."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    const id = pendingDeleteId;
    if (!id) return;
    setPendingDeleteId(null);
    try {
      const res = await api.deleteAddress(id);
      setAddresses(res.addresses || []);
      showSuccess("Removed", "Address deleted.");
    } catch (e) {
      showError("Could not delete", apiErrorToMessage(e, "Failed to delete address."));
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await api.setDefaultAddress(id);
      setAddresses(res.addresses || []);
    } catch (e) {
      showError("Could not update", apiErrorToMessage(e, "Failed to update default address."));
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Addresses</Text>
        <Pressable style={styles.addBtn} onPress={() => setAdding(!adding)}>
          <Icon name={adding ? "x" : "plus"} size={18} color={Colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
        {adding && (
          <AnimatedCard>
            <View style={styles.addForm}>
              <Text style={styles.formTitle}>Add New Address</Text>
              <TextInput
                style={styles.input}
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder="Label (e.g. Home, Office)"
                placeholderTextColor={Colors.textMuted}
              />
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                value={newAddress}
                onChangeText={setNewAddress}
                placeholder="Full address in Pakistan"
                placeholderTextColor={Colors.textMuted}
                multiline
              />
              <Pressable style={styles.locationBtn} onPress={handleUseCurrentLocation} disabled={loadingLocation}>
                {loadingLocation
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Icon name="crosshair" size={16} color={Colors.primary} />}
                <Text style={styles.locationBtnText}>{loadingLocation ? "Detecting..." : "Use Current Location"}</Text>
              </Pressable>
              {newLatitude !== undefined && newLongitude !== undefined && (
                <View style={styles.coordsBox}>
                  <Icon name="map-pin" size={14} color={Colors.success} />
                  <Text style={styles.coordsText}>{newLatitude.toFixed(4)}, {newLongitude.toFixed(4)}</Text>
                </View>
              )}
              <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleAdd} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>Save Address</Text>}
              </Pressable>
            </View>
          </AnimatedCard>
        )}

        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : addresses.length === 0 && !adding ? (
          <View style={styles.emptyState}>
            <Icon name="map-pin" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Saved Addresses</Text>
            <Text style={styles.emptyText}>Add your home, office, or any frequent location for quick booking.</Text>
            <Pressable style={styles.addFirstBtn} onPress={() => setAdding(true)}>
              <Icon name="plus" size={16} color="#fff" />
              <Text style={styles.addFirstText}>Add Address</Text>
            </Pressable>
          </View>
        ) : (
          addresses.map((a, i) => (
            <AnimatedCard key={a.id} delay={i * 60}>
              <View style={styles.addressCard}>
                <View style={[styles.addressIcon, a.isDefault && styles.addressIconDefault]}>
                  <Icon name={a.icon as any} size={18} color={a.isDefault ? Colors.primary : Colors.textSecondary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.labelRow}>
                    <Text style={styles.addressLabel}>{a.label}</Text>
                    {a.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultText}>Default</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.addressText}>{a.address}</Text>
                  {a.latitude != null && a.longitude != null && (
                    <Text style={styles.coordsSmall}>
                      📍 {Number(a.latitude).toFixed(4)}, {Number(a.longitude).toFixed(4)}
                    </Text>
                  )}
                  <View style={styles.actionsRow}>
                    {!a.isDefault && (
                      <Pressable onPress={() => handleSetDefault(a.id)} style={styles.actionBtn}>
                        <Icon name="check-circle" size={14} color={Colors.primary} />
                        <Text style={styles.actionBtnText}>Set Default</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => handleDelete(a.id)} style={styles.actionBtn}>
                      <Icon name="trash-2" size={14} color={Colors.error} />
                      <Text style={[styles.actionBtnText, { color: Colors.error }]}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </AnimatedCard>
          ))
        )}
      </ScrollView>

      {pendingDeleteId ? (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete address?</Text>
            <Text style={styles.modalBody}>This address will be permanently removed from your saved list.</Text>
            <View style={styles.modalRow}>
              <Pressable onPress={() => setPendingDeleteId(null)} style={[styles.modalBtn, styles.modalBtnGhost]}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirmDelete} style={[styles.modalBtn, styles.modalBtnDanger]}>
                <Text style={styles.modalBtnDangerText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: Colors.text },
  addBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 12, paddingBottom: 80 },
  addForm: { backgroundColor: Colors.white, borderRadius: 18, padding: 16, gap: 12 },
  formTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  input: {
    backgroundColor: Colors.background, borderRadius: 12, padding: 13,
    fontSize: 14, color: Colors.text, borderWidth: 1.5, borderColor: Colors.border,
  },
  locationBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.primary + "12", borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.primary + "40",
  },
  locationBtnText: { color: Colors.primary, fontWeight: "700", fontSize: 13 },
  coordsBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.success + "15", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.success + "40",
  },
  coordsText: { fontSize: 12, fontWeight: "600", color: Colors.text },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  addFirstBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  addFirstText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  addressCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: Colors.white, borderRadius: 16, padding: 14 },
  addressIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: Colors.background, alignItems: "center", justifyContent: "center",
  },
  addressIconDefault: { backgroundColor: Colors.primary + "15" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  addressLabel: { fontSize: 14, fontWeight: "700", color: Colors.text },
  defaultBadge: { backgroundColor: Colors.primary + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  defaultText: { fontSize: 10, fontWeight: "700", color: Colors.primary },
  addressText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  coordsSmall: { fontSize: 11, color: Colors.textMuted },
  actionsRow: { flexDirection: "row", gap: 14, marginTop: 8, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionBtnText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  modalBackdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", padding: 20, justifyContent: "center", zIndex: 100 },
  modalCard: { backgroundColor: Colors.white, borderRadius: 18, padding: 20, gap: 12 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: Colors.text },
  modalBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  modalBtn: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: "center" },
  modalBtnGhost: { borderWidth: 1, borderColor: Colors.border },
  modalBtnGhostText: { color: Colors.textSecondary, fontWeight: "700", fontSize: 13 },
  modalBtnDanger: { backgroundColor: Colors.error },
  modalBtnDangerText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});

