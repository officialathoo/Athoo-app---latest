import { LocationSearchPicker, type LocationSelection } from "@/components/maps/LocationSearchPicker";
import { OpenStreetMapPreview } from "@/components/maps/OpenStreetMapPreview";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { Icon } from "@/components/ui/Icon";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { useToast } from "@/context/ToastContext";
import { apiErrorToMessage } from "@/lib/apiError";
import { api } from "@/services/api";
import { reverseGeocode } from "@/services/maps";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { translate: tr, textAlign, writingDirection } = useLang();
  const { showError, showSuccess } = useToast();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newLatitude, setNewLatitude] = useState<number | undefined>(undefined);
  const [newLongitude, setNewLongitude] = useState<number | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await api.getAddresses();
      setAddresses(res.addresses || []);
    } catch (error) {
      setLoadError(apiErrorToMessage(error, tr("We could not load your saved addresses. Please try again.")));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const savedOptions = useMemo(
    () => addresses.map((address) => ({
      id: address.id,
      label: address.label,
      address: address.address,
      latitude: address.latitude,
      longitude: address.longitude,
    })),
    [addresses],
  );

  const applySelection = useCallback((selection: LocationSelection) => {
    setNewAddress(selection.address);
    setNewLatitude(selection.latitude);
    setNewLongitude(selection.longitude);
    if (!newLabel.trim()) {
      setNewLabel(selection.source === "current" ? tr("Current Location") : selection.primary || tr("Saved Place"));
    }
  }, [newLabel, tr]);

  const movePin = useCallback(async (latitude: number, longitude: number) => {
    setNewLatitude(latitude);
    setNewLongitude(longitude);
    setResolving(true);
    try {
      const resolved = await reverseGeocode(latitude, longitude);
      setNewAddress(resolved || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    } catch {
      setNewAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    } finally {
      setResolving(false);
    }
  }, []);

  const resetForm = useCallback(() => {
    setNewLabel("");
    setNewAddress("");
    setNewLatitude(undefined);
    setNewLongitude(undefined);
    setAdding(false);
  }, []);

  const handleAdd = async () => {
    if (!newLabel.trim()) {
      showError(tr("Add a label"), tr("Enter a short label such as Home, Office, or Shop."));
      return;
    }
    if (!newAddress.trim() || newLatitude == null || newLongitude == null) {
      showError(tr("Choose a location"), tr("Search for the address, use your current location, or place the pin on the map."));
      return;
    }
    setSaving(true);
    try {
      const res = await api.addAddress({
        label: newLabel.trim(),
        address: newAddress.trim(),
        icon: "map-pin",
        latitude: newLatitude,
        longitude: newLongitude,
      });
      setAddresses((previous) => [...previous, res.address]);
      resetForm();
      showSuccess(tr("Saved"), tr("Address added successfully."));
    } catch (error) {
      showError(tr("Could not save"), apiErrorToMessage(error, tr("We could not save this address. Please try again.")));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    const id = pendingDeleteId;
    if (!id) return;
    setPendingDeleteId(null);
    try {
      const res = await api.deleteAddress(id);
      setAddresses(res.addresses || []);
      showSuccess(tr("Removed"), tr("Address deleted."));
    } catch (error) {
      showError(tr("Could not delete"), apiErrorToMessage(error, tr("We could not delete this address.")));
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await api.setDefaultAddress(id);
      setAddresses(res.addresses || []);
      showSuccess(tr("Default updated"), tr("This address will be selected first for new bookings."));
    } catch (error) {
      showError(tr("Could not update"), apiErrorToMessage(error, tr("We could not update the default address.")));
    }
  };

  const selectedCoordinate = newLatitude != null && newLongitude != null
    ? { latitude: newLatitude, longitude: newLongitude }
    : null;

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: theme.colors.background }]}> 
      <LocationSearchPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={applySelection}
        savedLocations={savedOptions}
        bias={selectedCoordinate}
        title="Choose address"
        onChooseOnMap={() => {
          if (selectedCoordinate) return;
          const defaultAddress = addresses.find((address) => address.isDefault && address.latitude != null && address.longitude != null);
          if (defaultAddress?.latitude != null && defaultAddress.longitude != null) {
            setNewLatitude(Number(defaultAddress.latitude));
            setNewLongitude(Number(defaultAddress.longitude));
            setNewAddress(defaultAddress.address);
            return;
          }
          const pakistanCenter = { latitude: 30.3753, longitude: 69.3451 };
          setNewLatitude(pakistanCenter.latitude);
          setNewLongitude(pakistanCenter.longitude);
          setNewAddress(tr("Move the pin to your exact service address"));
        }}
      />

      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}> 
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("Back")}
          style={[styles.headerButton, { backgroundColor: theme.colors.surfaceAlt }]}
          onPress={() => router.back()}
        >
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.text, textAlign, writingDirection }]}>{tr("My Addresses")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={adding ? tr("Close address form") : tr("Add address")}
          style={[styles.headerButton, { backgroundColor: theme.colors.infoSoft }]}
          onPress={() => adding ? resetForm() : setAdding(true)}
        >
          <Icon name={adding ? "x" : "plus"} size={18} color={theme.colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {adding ? (
          <AnimatedCard>
            <View style={[styles.addForm, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}> 
              <Text style={[styles.formTitle, { color: theme.colors.text, textAlign, writingDirection }]}>{tr("Add New Address")}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, color: theme.colors.text, textAlign, writingDirection }]}
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder={tr("Label (e.g. Home, Office)")}
                placeholderTextColor={theme.colors.textMuted}
                maxLength={40}
              />

              <Pressable
                accessibilityRole="button"
                onPress={() => setPickerVisible(true)}
                style={[styles.locationSearch, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
              >
                <Icon name="search" size={18} color={theme.colors.primary} />
                <View style={styles.locationSearchText}>
                  <Text numberOfLines={1} style={[styles.locationPrimary, { color: newAddress ? theme.colors.text : theme.colors.textMuted, textAlign, writingDirection }]}>
                    {newAddress || tr("Search street, area, landmark or city")}
                  </Text>
                  <Text style={[styles.locationSecondary, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>
                    {tr("GPS, saved places and map pin are available")}
                  </Text>
                </View>
                <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
              </Pressable>

              {selectedCoordinate ? (
                <View style={[styles.mapPreview, { borderColor: theme.colors.border }]}> 
                  <OpenStreetMapPreview
                    latitude={selectedCoordinate.latitude}
                    longitude={selectedCoordinate.longitude}
                    height={210}
                    markers={[{ id: "saved-address", ...selectedCoordinate, kind: "selected" }]}
                    interactive
                    onCoordinateChange={(latitude, longitude) => void movePin(latitude, longitude)}
                  />
                </View>
              ) : null}

              {resolving ? (
                <View style={styles.resolvingRow}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={[styles.resolvingText, { color: theme.colors.textSecondary }]}>{tr("Updating the address for this pin...")}</Text>
                </View>
              ) : null}

              {selectedCoordinate ? (
                <TextInput
                  style={[styles.input, styles.addressDetailsInput, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, color: theme.colors.text, textAlign, writingDirection }]}
                  value={newAddress}
                  onChangeText={setNewAddress}
                  placeholder={tr("Add house, flat, floor or nearby landmark")}
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                />
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: saving }}
                style={[styles.saveBtn, { backgroundColor: theme.colors.primary }, saving && styles.disabled]}
                onPress={() => void handleAdd()}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.saveBtnText}>{tr("Save Address")}</Text>}
              </Pressable>
            </View>
          </AnimatedCard>
        ) : null}

        {loadError ? (
          <View style={[styles.errorState, { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.danger }]}> 
            <Text style={[styles.errorText, { color: theme.colors.danger, textAlign, writingDirection }]}>{loadError}</Text>
            <Pressable accessibilityRole="button" style={styles.retryButton} onPress={() => void load()}>
              <Text style={[styles.retryText, { color: theme.colors.danger }]}>{tr("Retry")}</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.emptyState}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
        ) : addresses.length === 0 && !adding ? (
          <View style={styles.emptyState}>
            <Icon name="map-pin" size={40} color={theme.colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text, textAlign, writingDirection }]}>{tr("No Saved Addresses")}</Text>
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>{tr("Add your home, office, or another frequent location for faster bookings.")}</Text>
            <Pressable accessibilityRole="button" style={[styles.addFirstBtn, { backgroundColor: theme.colors.primary }]} onPress={() => setAdding(true)}>
              <Icon name="plus" size={16} color={theme.colors.white} />
              <Text style={styles.addFirstText}>{tr("Add Address")}</Text>
            </Pressable>
          </View>
        ) : (
          addresses.map((address, index) => (
            <AnimatedCard key={address.id} delay={index * 60}>
              <View style={[styles.addressCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}> 
                <View style={[styles.addressIcon, { backgroundColor: address.isDefault ? theme.colors.infoSoft : theme.colors.surfaceAlt }]}> 
                  <Icon name={address.icon as any} size={18} color={address.isDefault ? theme.colors.primary : theme.colors.textSecondary} />
                </View>
                <View style={styles.addressInfo}>
                  <View style={styles.labelRow}>
                    <Text style={[styles.addressLabel, { color: theme.colors.text, textAlign, writingDirection }]}>{address.label}</Text>
                    {address.isDefault ? (
                      <View style={[styles.defaultBadge, { backgroundColor: theme.colors.infoSoft }]}> 
                        <Text style={[styles.defaultText, { color: theme.colors.primary }]}>{tr("Default")}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.addressText, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>{address.address}</Text>
                  <View style={styles.actionsRow}>
                    {!address.isDefault ? (
                      <Pressable accessibilityRole="button" onPress={() => void handleSetDefault(address.id)} style={styles.actionBtn}>
                        <Icon name="check-circle" size={14} color={theme.colors.primary} />
                        <Text style={[styles.actionBtnText, { color: theme.colors.primary }]}>{tr("Set Default")}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable accessibilityRole="button" onPress={() => setPendingDeleteId(address.id)} style={styles.actionBtn}>
                      <Icon name="trash-2" size={14} color={theme.colors.danger} />
                      <Text style={[styles.actionBtnText, { color: theme.colors.danger }]}>{tr("Delete")}</Text>
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
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}> 
            <Text style={[styles.modalTitle, { color: theme.colors.text, textAlign, writingDirection }]}>{tr("Delete address?")}</Text>
            <Text style={[styles.modalBody, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>{tr("This address will be permanently removed from your saved list.")}</Text>
            <View style={styles.modalRow}>
              <Pressable onPress={() => setPendingDeleteId(null)} style={[styles.modalBtn, { borderColor: theme.colors.border, borderWidth: 1 }]}>
                <Text style={[styles.modalBtnText, { color: theme.colors.textSecondary }]}>{tr("Cancel")}</Text>
              </Pressable>
              <Pressable onPress={() => void confirmDelete()} style={[styles.modalBtn, { backgroundColor: theme.colors.danger }]}>
                <Text style={styles.modalBtnDangerText}>{tr("Delete")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1 },
  headerButton: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800" },
  content: { padding: 20, gap: 12 },
  addForm: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  formTitle: { fontSize: 16, fontWeight: "800" },
  input: { minHeight: 50, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, borderWidth: 1 },
  addressDetailsInput: { minHeight: 82, textAlignVertical: "top" },
  locationSearch: { minHeight: 64, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  locationSearchText: { flex: 1 },
  locationPrimary: { fontSize: 14, fontWeight: "700" },
  locationSecondary: { marginTop: 3, fontSize: 11 },
  mapPreview: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  resolvingRow: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 8 },
  resolvingText: { fontSize: 12 },
  saveBtn: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: theme.colors.white, fontWeight: "800", fontSize: 14 },
  errorState: { borderRadius: 14, borderWidth: 1, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  retryButton: { minWidth: 58, minHeight: 40, alignItems: "center", justifyContent: "center" },
  retryText: { fontSize: 13, fontWeight: "800" },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptyText: { fontSize: 14, lineHeight: 20 },
  addFirstBtn: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 24, justifyContent: "center", marginTop: 8 },
  addFirstText: { color: theme.colors.white, fontWeight: "800", fontSize: 14 },
  addressCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
  addressIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  addressInfo: { flex: 1, gap: 4 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  addressLabel: { fontSize: 14, fontWeight: "800" },
  defaultBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  defaultText: { fontSize: 10, fontWeight: "800" },
  addressText: { fontSize: 13, lineHeight: 19 },
  actionsRow: { flexDirection: "row", gap: 14, marginTop: 8, flexWrap: "wrap" },
  actionBtn: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6 },
  actionBtnText: { fontSize: 12, fontWeight: "800" },
  modalBackdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)", padding: 20, justifyContent: "center", zIndex: 100 },
  modalCard: { borderRadius: 18, padding: 20, gap: 12 },
  modalTitle: { fontSize: 16, fontWeight: "800" },
  modalBody: { fontSize: 13, lineHeight: 19 },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  modalBtn: { flex: 1, minHeight: 46, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  modalBtnText: { fontWeight: "800", fontSize: 13 },
  modalBtnDangerText: { color: theme.colors.white, fontWeight: "800", fontSize: 13 },
});
