import { useRef } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { colors } from "../constants/theme";
import { digitsOnly } from "../lib/otp";

type CodeField = { focus: () => void };

export function OtpInput({ value, onChange, disabled }: { value: string; onChange: (next: string) => void; disabled?: boolean }) {
  const refs = useRef<(CodeField | null)[]>([]);
  const digits = digitsOnly(value).padEnd(6, " ").slice(0, 6).split("");

  function write(next: string, focusIndex: number) {
    onChange(digitsOnly(next));
    const target = Math.min(Math.max(focusIndex, 0), 5);
    refs.current[target]?.focus();
  }

  return (
    <View style={styles.row}>
      {digits.map((digit, index) => (
        <Pressable key={index} onPress={() => refs.current[index]?.focus()} style={styles.box}>
          <TextInput
            ref={(node) => {
              refs.current[index] = node;
            }}
            value={digit.trim()}
            editable={!disabled}
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType="oneTimeCode"
            autoComplete={index === 0 ? "sms-otp" : "off"}
            maxLength={index === 0 ? 6 : 1}
            selectTextOnFocus
            style={styles.digit}
            accessibilityLabel={`Digit ${index + 1}`}
            onChangeText={(text) => {
              const incoming = digitsOnly(text);
              if (incoming.length > 1) {
                write(incoming, Math.min(incoming.length, 5));
                return;
              }
              const next = digits.map((item) => item.trim()).join("");
              const chars = next.split("");
              chars[index] = incoming;
              write(chars.join(""), incoming ? index + 1 : index);
            }}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === "Backspace" && !digits[index]?.trim() && index > 0) {
                const chars = digits.map((item) => item.trim());
                chars[index - 1] = "";
                write(chars.join(""), index - 1);
              }
            }}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  box: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  digit: { width: "100%", textAlign: "center", fontSize: 22, fontWeight: "700", color: colors.midnight },
});
