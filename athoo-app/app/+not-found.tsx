import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export default function NotFoundScreen() {
  const colors = useColors();

  useEffect(() => {
    const t = setTimeout(() => {
      try { router.replace("/"); } catch {}
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: "Redirecting..." }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          Redirecting...
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 18, fontWeight: "600" },
});

