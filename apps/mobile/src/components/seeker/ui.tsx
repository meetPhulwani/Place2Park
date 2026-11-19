import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../constants/theme";
import { formatHourlyPrice } from "../../lib/money";

export function Screen({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  if (scroll) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.screen, { paddingTop: insets.top }]}>{children}</View>;
}

export function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      ) : null}
      <Text style={styles.headerTitle}>{title}</Text>
      {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SearchBar({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="search" onPress={onPress} style={styles.search}>
      <Text style={styles.searchLabel}>{label}</Text>
    </Pressable>
  );
}

export function PriceText({ paise }: { paise: number }) {
  return <Text style={styles.price}>{formatHourlyPrice(paise)}</Text>;
}

export function RatingText({ average, count }: { average: number; count: number }) {
  if (count <= 0) return <Text style={styles.muted}>New</Text>;
  return <Text style={styles.rating}>{average.toFixed(1)} · {count}</Text>;
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelOn]}>{label}</Text>
    </Pressable>
  );
}

export function SkeletonBlock() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonPhoto} />
      <View style={styles.skeletonLine} />
      <View style={[styles.skeletonLine, styles.skeletonShort]} />
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>Something went wrong</Text>
      <Text style={styles.stateBody}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.sheetTitle}>{title}</Text>
        {children}
      </View>
    </Modal>
  );
}

export function ViewToggle({ mode, onChange }: { mode: "list" | "map"; onChange: (mode: "list" | "map") => void }) {
  return (
    <View style={styles.toggle}>
      <Chip label="List" selected={mode === "list"} onPress={() => onChange("list")} />
      <Chip label="Map" selected={mode === "map"} onPress={() => onChange("map")} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  scroll: { paddingHorizontal: 20, gap: 16 },
  header: { paddingHorizontal: 20, paddingBottom: 8, gap: 4 },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  backLabel: { color: colors.blue, fontWeight: "700", fontSize: 16 },
  headerTitle: { color: colors.midnight, fontSize: 28, fontWeight: "800" },
  headerSubtitle: { color: colors.muted, fontSize: 14 },
  search: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: colors.midnight,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  searchLabel: { color: colors.white, fontSize: 16, fontWeight: "600" },
  price: { color: colors.blue, fontSize: 16, fontWeight: "800" },
  rating: { color: colors.midnight, fontSize: 13, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 13 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipLabel: { color: colors.midnight, fontWeight: "700", fontSize: 14 },
  chipLabelOn: { color: colors.white },
  skeletonCard: { gap: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line },
  skeletonPhoto: { height: 120, borderRadius: 12, backgroundColor: "#EEF2F6" },
  skeletonLine: { height: 14, borderRadius: 7, backgroundColor: "#EEF2F6" },
  skeletonShort: { width: "45%" },
  state: { paddingVertical: 28, gap: 8, alignItems: "flex-start" },
  stateTitle: { color: colors.midnight, fontSize: 18, fontWeight: "800" },
  stateBody: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  retry: { minHeight: 44, justifyContent: "center" },
  retryLabel: { color: colors.blue, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(21, 26, 38, 0.4)" },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  sheetTitle: { color: colors.midnight, fontSize: 18, fontWeight: "800" },
  toggle: { flexDirection: "row", gap: 8 },
});
