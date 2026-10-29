import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, space, toneColors, type, useColors, type Tone } from "./theme";
import { cap, CHANNELS, initials, ORDER_TONE } from "./format";

export type IconName = keyof typeof Ionicons.glyphMap;

type TextVariant = "title" | "heading" | "body" | "small" | "tiny";
export function Text({ variant = "body", muted, faint, style, ...p }: TextProps & { variant?: TextVariant; muted?: boolean; faint?: boolean }) {
  const c = useColors();
  return <RNText {...p} style={[type[variant], { color: faint ? c.text3 : muted ? c.text2 : c.text }, style]} />;
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.surface, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg }, padded && { padding: space(4) }, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(5), marginBottom: space(2), paddingHorizontal: space(1) }}>
      <Text variant="small" muted style={{ fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  small,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const colors = {
    primary: { bg: c.brand, fg: c.brandInk, border: c.brand },
    secondary: { bg: c.surface, fg: c.text, border: c.controlBorder },
    ghost: { bg: "transparent", fg: c.link, border: "transparent" },
    danger: { bg: c.surface, fg: c.bad, border: c.bad },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.md,
          minHeight: small ? 36 : 48,
          paddingHorizontal: small ? space(3) : space(4),
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space(2),
          opacity: off && !loading ? 0.5 : 1,
          transform: [{ scale: pressed && !off ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={colors.fg} /> : null}
      <RNText style={{ color: colors.fg, fontSize: small ? 14 : 16, fontWeight: "600" }}>{title}</RNText>
    </Pressable>
  );
}

export const Field = forwardRef<TextInputInstance, TextInputProps & { label?: string; hint?: string; error?: string | null; prefix?: string }>(function Field(
  { label, hint, error, prefix, style, ...p },
  ref,
) {
  const c = useColors();
  return (
    <View style={{ gap: space(1.5) }}>
      {label ? (
        <Text variant="small" muted style={{ fontWeight: "600" }}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: c.surface,
          borderColor: error ? c.bad : c.controlBorder,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingHorizontal: space(3),
        }}
      >
        {prefix ? <Text muted style={{ marginRight: space(1.5) }}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={c.text3}
          // 16px text: no zoom on focus in the web preview, comfortable on phones.
          style={[{ flex: 1, minHeight: 46, fontSize: 16, color: c.text, paddingVertical: space(2) }, style as StyleProp<TextStyle>]}
          {...p}
        />
      </View>
      {error ? (
        <Text variant="small" style={{ color: c.bad }}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" faint>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

export function SearchBar({ value, onChangeText, placeholder }: { value: string; onChangeText: (s: string) => void; placeholder: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: c.surface2, borderRadius: radius.md, paddingHorizontal: space(3) }}>
      <Ionicons name="search" size={18} color={c.text3} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.text3}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        style={{ flex: 1, minHeight: 42, fontSize: 16, color: c.text }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={10} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={c.text3} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, count }: { label: string; selected?: boolean; onPress?: () => void; count?: number }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space(1.5),
        paddingHorizontal: space(3),
        height: 34,
        borderRadius: radius.pill,
        backgroundColor: selected ? c.brand : c.surface,
        borderWidth: 1,
        borderColor: selected ? c.brand : c.border,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <RNText style={{ color: selected ? c.brandInk : c.text, fontSize: 14, fontWeight: "500" }}>{label}</RNText>
      {count !== undefined ? <RNText style={{ color: selected ? c.brandInk : c.text3, fontSize: 13, fontVariant: ["tabular-nums"] }}>{count}</RNText> : null}
    </Pressable>
  );
}

/** A horizontally scrolling row of filter chips. */
export function ChipRow<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2), paddingHorizontal: space(4) }} keyboardShouldPersistTaps="handled">
      {options.map((o) => (
        <Chip key={o.value} label={o.label} count={o.count} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </ScrollView>
  );
}

/** Status always carries text, never color alone; the dot is reinforcement. */
export function Badge({ tone = "neutral", dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  const c = useColors();
  const t = toneColors(c, tone);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: t.bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.fg }} /> : null}
      <RNText style={{ color: t.fg, fontSize: 12, fontWeight: "600" }}>{children}</RNText>
    </View>
  );
}

export const OrderStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={ORDER_TONE[status] ?? "neutral"} dot>
    {cap(status)}
  </Badge>
);

export const PaymentBadge = ({ status }: { status: string }) => <Badge tone={status === "paid" ? "good" : "neutral"}>{cap(status)}</Badge>;

export function ChannelTag({ channel }: { channel: string }) {
  const ch = CHANNELS[channel] ?? { label: cap(channel), color: "#858c9b" };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ch.color }} />
      <Text variant="tiny" muted style={{ fontWeight: "500" }}>
        {ch.label}
      </Text>
    </View>
  );
}

export function Avatar({ name, size = 40 }: { name: string | null | undefined; size?: number }) {
  const c = useColors();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}>
      <RNText style={{ color: c.brandText, fontWeight: "700", fontSize: size * 0.38 }}>{initials(name)}</RNText>
    </View>
  );
}

export function CountBadge({ n }: { n: number }) {
  const c = useColors();
  if (!n) return null;
  return (
    <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" }}>
      <RNText style={{ color: c.brandInk, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{n > 99 ? "99+" : n}</RNText>
    </View>
  );
}

export function Center({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(3) }, style]}>{children}</View>;
}

export function Loading() {
  const c = useColors();
  return (
    <Center>
      <ActivityIndicator color={c.brand} size="large" />
    </Center>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <Center style={{ paddingVertical: space(16) }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={26} color={c.text3} />
      </View>
      <Text variant="heading" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {body ? (
        <Text muted style={{ textAlign: "center", maxWidth: 300 }}>
          {body}
        </Text>
      ) : null}
      {action}
    </Center>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Couldn't load this"
      body={error instanceof Error ? error.message : String(error)}
      action={onRetry ? <Button title="Try again" variant="secondary" small onPress={onRetry} /> : undefined}
    />
  );
}

/** A tappable list row with a chevron. */
export function ListRow({ children, onPress, chevron = true, style }: { children: ReactNode; onPress?: () => void; chevron?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3), backgroundColor: pressed ? c.surface2 : c.surface },
        style,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {chevron && onPress ? <Ionicons name="chevron-forward" size={18} color={c.text3} /> : null}
    </Pressable>
  );
}

export function Separator({ inset = space(4) }: { inset?: number }) {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: inset }} />;
}

export function IconButton({ icon, onPress, label, ...p }: { icon: IconName; label: string } & Omit<PressableProps, "children">) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={({ pressed }) => ({ padding: space(2), opacity: pressed ? 0.6 : 1 })} {...p}>
      <Ionicons name={icon} size={22} color={c.link} />
    </Pressable>
  );
}

/** Label/value line for detail screens. */
export function KeyValue({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space(3), paddingVertical: space(1) }}>
      <Text muted>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={[type.number, strong && { fontWeight: "700" }, { flexShrink: 1, textAlign: "right" }]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}
