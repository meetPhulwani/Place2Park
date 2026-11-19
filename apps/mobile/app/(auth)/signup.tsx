import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ApiRequestError } from "../../src/api/client";
import { AuthScreen } from "../../src/components/auth-screen";
import { Button } from "../../src/components/button";
import { Field } from "../../src/components/field";
import { LegalLinks, TextLink } from "../../src/components/legal-links";
import { Notice } from "../../src/components/notice";
import { colors } from "../../src/constants/theme";
import { normalizeIndianMobile, signupIssues } from "../../src/lib/account-rules";
import { createSubmitLock } from "../../src/lib/submit-lock";
import { useAuth } from "../../src/services/auth-context";
import type { SignupInput } from "../../src/types/auth";

const submitLock = createSubmitLock();
const ROLES: { id: SignupInput["role"]; label: string }[] = [
  { id: "DRIVER", label: "Seeker" },
  { id: "HOST", label: "Keeper" },
  { id: "BOTH", label: "Both" },
];

export default function SignupScreen() {
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<SignupInput["role"]>("DRIVER");
  const [errors, setErrors] = useState<Partial<Record<"name" | "email" | "phone" | "password", string | null>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    const issues = signupIssues({ name, email, password, phone });
    setErrors(issues);
    setError(null);
    if (issues.name || issues.email || issues.password || issues.phone) return;
    const mobile = normalizeIndianMobile(phone);
    if (!mobile) return;
    await submitLock(async () => {
      setLoading(true);
      try {
        await signup({ name: name.trim(), email: email.trim(), password, phone: mobile, role });
        router.replace("/(auth)/verify-email");
      } catch (err) {
        if (err instanceof ApiRequestError) {
          setErrors({
            name: err.fieldErrors.name ?? null,
            email: err.fieldErrors.email ?? null,
            phone: err.fieldErrors.phone ?? null,
            password: err.fieldErrors.password ?? null,
          });
          setError(err.message);
        } else {
          setError("Something went wrong. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    });
  }

  return (
    <AuthScreen title="Create account" copy="Use the same Place2Park account as the website. We will email a code before the account is opened.">
      <Notice message={error} />
      <Field label="Name" value={name} onChangeText={setName} autoComplete="name" error={errors.name} />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        error={errors.email}
      />
      <Field
        label="Mobile"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        inputMode="tel"
        autoComplete="tel"
        error={errors.phone}
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.password}
      />
      <View style={styles.roles}>
        {ROLES.map((item) => {
          const selected = item.id === role;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setRole(item.id)}
              style={[styles.role, selected && styles.roleSelected]}
            >
              <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Button label="Create account" loading={loading} onPress={() => void onSubmit()} />
      <LegalLinks />
      <TextLink label="Already have an account" onPress={() => router.replace("/(auth)/login")} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  roles: { flexDirection: "row", gap: 8 },
  role: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  roleSelected: { borderColor: colors.blue, backgroundColor: colors.blue },
  roleLabel: { color: colors.midnight, fontWeight: "700", fontSize: 14 },
  roleLabelSelected: { color: colors.white },
});
