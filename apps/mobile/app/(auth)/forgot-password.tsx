import { useState } from "react";
import { router } from "expo-router";
import { requestPasswordReset } from "../../src/api/auth";
import { ApiRequestError, createApiClient } from "../../src/api/client";
import { AuthScreen } from "../../src/components/auth-screen";
import { Button } from "../../src/components/button";
import { Field } from "../../src/components/field";
import { TextLink } from "../../src/components/legal-links";
import { Notice } from "../../src/components/notice";
import { apiBaseUrl } from "../../src/constants/env";
import { RESET_SENT_MESSAGE, emailIssue } from "../../src/lib/account-rules";
import { createSubmitLock } from "../../src/lib/submit-lock";

const submitLock = createSubmitLock();

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    const issue = emailIssue(email);
    setEmailError(issue);
    setError(null);
    if (issue) return;
    await submitLock(async () => {
      setLoading(true);
      try {
        const client = createApiClient({ baseUrl: apiBaseUrl(), getAccessToken: async () => null });
        await requestPasswordReset(client, email.trim());
        setSent(true);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    });
  }

  return (
    <AuthScreen
      title="Reset password"
      copy="Enter the email for your account. If we can send mail, the reset link opens on the Place2Park website."
    >
      <Notice message={error} />
      {sent ? <Notice tone="success" message={RESET_SENT_MESSAGE} /> : null}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        error={emailError}
      />
      <Button label="Send reset email" loading={loading} onPress={() => void onSubmit()} />
      <TextLink label="I have a reset token" onPress={() => router.push("/(auth)/reset-password")} />
      <TextLink label="Back to log in" onPress={() => router.replace("/(auth)/login")} />
    </AuthScreen>
  );
}
