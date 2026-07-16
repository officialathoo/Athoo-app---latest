import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { getFastForegroundLocation } from "@/services/location";
import { reverseGeocode, searchAddress, type PlaceSuggestion } from "@/services/maps";

const RECENTS_KEY = "athoo:recent-locations:v2";
const MAX_RECENTS = 6;

type Coordinate = { latitude: number; longitude: number };

export type LocationSelection = Coordinate & {
  address: string;
  primary?: string;
  secondary?: string;
  city?: string;
  province?: string;
  postcode?: string;
  source: "search" | "current" | "saved" | "recent" | "map";
  accuracy?: number | null;
};

export type SavedLocationOption = {
  id: string;
  label: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (location: LocationSelection) => void;
  onChooseOnMap?: () => void;
  bias?: Coordinate | null;
  savedLocations?: SavedLocationOption[];
  title?: string;
  placeholder?: string;
};

type RecentLocation = LocationSelection & { selectedAt: number };

function validCoordinate(latitude: unknown, longitude: unknown): boolean {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

async function readRecents(): Promise<RecentLocation[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentLocation[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => validCoordinate(item.latitude, item.longitude) && typeof item.address === "string").slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
}

async function saveRecent(location: LocationSelection): Promise<void> {
  try {
    const existing = await readRecents();
    const key = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
    const next: RecentLocation[] = [
      { ...location, source: "recent" as const, selectedAt: Date.now() },
      ...existing.filter((item) => `${item.latitude.toFixed(5)},${item.longitude.toFixed(5)}` !== key),
    ].slice(0, MAX_RECENTS);
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Recent locations are convenience data only.
  }
}

export function LocationSearchPicker({
  visible,
  onClose,
  onSelect,
  onChooseOnMap,
  bias,
  savedLocations = [],
  title = "Choose service location",
  placeholder = "Search street, area or landmark",
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { translate: tr, textAlign, writingDirection } = useLang();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [recents, setRecents] = useState<RecentLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const requestSequence = useRef(0);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setResults([]);
    setMessage("");
    void readRecents().then(setRecents);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const trimmed = query.replace(/\s+/g, " ").trim();
    if (trimmed.length < 3) {
      setSearching(false);
      setResults([]);
      setMessage("");
      return;
    }
    const sequence = ++requestSequence.current;
    setSearching(true);
    setMessage("");
    const timer = setTimeout(() => {
      void searchAddress(trimmed, bias, 12)
        .then((items) => {
          if (sequence !== requestSequence.current) return;
          setResults(items);
          setMessage(items.length ? "" : tr("No matching locations found. Try a street, area, landmark or city."));
        })
        .catch(() => {
          if (sequence !== requestSequence.current) return;
          setResults([]);
          setMessage(tr("Location search is temporarily unavailable. Check your connection and try again."));
        })
        .finally(() => {
          if (sequence === requestSequence.current) setSearching(false);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [bias, query, tr, visible]);

  const savedOptions = useMemo(
    () => savedLocations.filter((item) => validCoordinate(item.latitude, item.longitude)).slice(0, 8),
    [savedLocations],
  );

  const commit = useCallback((selection: LocationSelection) => {
    void saveRecent(selection);
    onSelect(selection);
    onClose();
  }, [onClose, onSelect]);

  const useCurrentLocation = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    setMessage("");
    try {
      const result = await getFastForegroundLocation({
        timeoutMs: 12_000,
        maxCacheAgeMs: 2 * 60 * 1000,
        requiredAccuracy: 120,
        freshAccuracy: "high",
        rationaleTitle: tr("Location permission"),
        rationaleBody: tr("Athoo uses your location so providers can find the correct service address."),
      });
      if (!result.location) {
        setMessage(tr("We could not get an accurate location. Search for your address or place the pin on the map."));
        return;
      }
      const address = await reverseGeocode(result.location.latitude, result.location.longitude);
      commit({
        latitude: result.location.latitude,
        longitude: result.location.longitude,
        address: address || `${result.location.latitude.toFixed(5)}, ${result.location.longitude.toFixed(5)}`,
        primary: address || tr("Current location"),
        source: "current",
        accuracy: result.location.accuracy,
      });
    } catch {
      setMessage(tr("We could not get your location. Search for an address or choose it on the map."));
    } finally {
      setLocating(false);
    }
  }, [commit, locating, tr]);

  const renderSearchResult = ({ item }: { item: PlaceSuggestion }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.primary}. ${item.secondary || item.label}`}
      onPress={() => commit({
        latitude: item.lat,
        longitude: item.lng,
        address: item.label,
        primary: item.primary,
        secondary: item.secondary,
        city: item.city,
        province: item.province,
        postcode: item.postcode,
        source: "search",
      })}
      style={({ pressed }) => [
        styles.resultRow,
        { borderBottomColor: theme.colors.border, backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface },
      ]}
    >
      <View style={[styles.resultIcon, { backgroundColor: theme.colors.infoSoft }]}> 
        <Icon name="map-pin" size={18} color={theme.colors.primary} />
      </View>
      <View style={styles.resultText}>
        <Text numberOfLines={1} style={[styles.primaryText, { color: theme.colors.text, textAlign, writingDirection }]}>{item.primary}</Text>
        <Text numberOfLines={2} style={[styles.secondaryText, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>{item.secondary || item.label}</Text>
        {item.distanceKm != null ? (
          <Text style={[styles.distanceText, { color: theme.colors.primary, textAlign, writingDirection }]}>{item.distanceKm.toFixed(1)} km {tr("away")}</Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.screen, { backgroundColor: theme.colors.background, paddingTop: Math.max(insets.top, 12) }]}
      >
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}> 
          <Pressable accessibilityRole="button" accessibilityLabel={tr("Close")} onPress={onClose} style={styles.headerButton}>
            <Icon name="arrow-left" size={22} color={theme.colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.colors.text, textAlign, writingDirection }]}>{tr(title)}</Text>
          <View style={styles.headerButton} />
        </View>

        <View style={[styles.searchBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}> 
          <Icon name="search" size={19} color={theme.colors.textMuted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={tr(placeholder)}
            placeholderTextColor={theme.colors.textMuted}
            selectionColor={theme.colors.primary}
            returnKeyType="search"
            autoCorrect={false}
            style={[styles.input, { color: theme.colors.text, textAlign, writingDirection }]}
          />
          {searching ? <ActivityIndicator size="small" color={theme.colors.primary} /> : query ? (
            <Pressable accessibilityRole="button" accessibilityLabel={tr("Clear search")} onPress={() => setQuery("")} style={styles.clearButton}>
              <Icon name="x" size={17} color={theme.colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.quickActions}>
          <Pressable
            accessibilityRole="button"
            disabled={locating}
            onPress={() => void useCurrentLocation()}
            style={[styles.quickButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          >
            {locating ? <ActivityIndicator color={theme.colors.primary} /> : <Icon name="crosshair" size={19} color={theme.colors.primary} />}
            <Text style={[styles.quickButtonText, { color: theme.colors.text }]}>{tr("Use current location")}</Text>
          </Pressable>
          {onChooseOnMap ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => { onClose(); onChooseOnMap(); }}
              style={[styles.quickButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              <Icon name="map" size={19} color={theme.colors.primary} />
              <Text style={[styles.quickButtonText, { color: theme.colors.text }]}>{tr("Choose on map")}</Text>
            </Pressable>
          ) : null}
        </View>

        {message ? (
          <View style={[styles.messageBox, { backgroundColor: theme.colors.surfaceAlt }]}> 
            <Text style={[styles.messageText, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>{message}</Text>
          </View>
        ) : null}

        {query.trim().length >= 3 ? (
          <FlatList
            data={results}
            keyExtractor={(item) => item.placeId}
            renderItem={renderSearchResult}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <FlatList
            data={[
              ...savedOptions.map((item) => ({ kind: "saved" as const, item })),
              ...recents.map((item) => ({ kind: "recent" as const, item })),
            ]}
            keyExtractor={(entry, index) => {
              const itemId = "id" in entry.item ? entry.item.id : `${entry.item.latitude}:${entry.item.longitude}`;
              return `${entry.kind}:${itemId}:${index}`;
            }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={savedOptions.length || recents.length ? (
              <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>{tr("Saved and recent places")}</Text>
            ) : (
              <View style={styles.emptyPrompt}>
                <Icon name="map-pin" size={32} color={theme.colors.primary} />
                <Text style={[styles.emptyTitle, { color: theme.colors.text, textAlign, writingDirection }]}>{tr("Search anywhere in Pakistan")}</Text>
                <Text style={[styles.emptyText, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>{tr("Enter a street, area, landmark, housing society or city.")}</Text>
              </View>
            )}
            renderItem={({ item: entry }) => {
              const isSaved = entry.kind === "saved";
              const source = entry.item;
              const latitude = Number(source.latitude);
              const longitude = Number(source.longitude);
              const label = "label" in source ? source.label : tr("Recent location");
              const address = source.address;
              return (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => commit({ latitude, longitude, address, primary: label, source: isSaved ? "saved" : "recent" })}
                  style={({ pressed }) => [styles.resultRow, { borderBottomColor: theme.colors.border, backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface }]}
                >
                  <View style={[styles.resultIcon, { backgroundColor: theme.colors.infoSoft }]}> 
                    <Icon name={isSaved ? "home" : "clock"} size={18} color={theme.colors.primary} />
                  </View>
                  <View style={styles.resultText}>
                    <Text numberOfLines={1} style={[styles.primaryText, { color: theme.colors.text, textAlign, writingDirection }]}>{label}</Text>
                    <Text numberOfLines={2} style={[styles.secondaryText, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>{address}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
                </Pressable>
              );
            }}
            contentContainerStyle={styles.listContent}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { height: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center" },
  searchBox: { marginHorizontal: 16, marginTop: 14, minHeight: 52, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 },
  input: { flex: 1, minHeight: 50, fontSize: 16 },
  clearButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  quickActions: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  quickButton: { flex: 1, minHeight: 52, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 10 },
  quickButtonText: { fontSize: 13, fontWeight: "700" },
  messageBox: { marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 12 },
  messageText: { fontSize: 13, lineHeight: 19 },
  listContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: "800", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
  resultRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 4 },
  resultIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  resultText: { flex: 1 },
  primaryText: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
  secondaryText: { marginTop: 2, fontSize: 12, lineHeight: 17 },
  distanceText: { marginTop: 3, fontSize: 11, fontWeight: "700" },
  emptyPrompt: { paddingTop: 56, alignItems: "center", paddingHorizontal: 28 },
  emptyTitle: { marginTop: 14, fontSize: 18, fontWeight: "800" },
  emptyText: { marginTop: 7, fontSize: 14, lineHeight: 21 },
});
