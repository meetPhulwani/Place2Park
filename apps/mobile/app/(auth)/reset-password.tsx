import { useState } from "react";
import { router } from "expo-router";
import { submitPasswordReset } from "../../src/api/auth";
import { ApiRequestError, createApiClient } from "../../src/api/client";
import { AuthScreen } from "../../src/components/auth-screen";
import { Button } from "../../src/components/button";
import { Field } from "../../src/components/field";
import { TextLink } from "../../src/components/legal-links";
import { Notice } from "../../src/components/notice";
import { apiBaseUrl } from "../../src/constants/env";
import { resetIssues } from "../../src/lib/account-rules";
import { createSubmitLock } from "../../src/lib/submit-lock";

const submitLock = createSubmitLock();

export default function ResetPasswordScreen() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ token?: string | null; password?: string | null }>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    const issues = resetIssues(token, password);
    setErrors(issues);
    setError(null);
    if (issues.token || issues.password) return;
    await submitLock(async () => {
      setLoading(true);
      try {
        const client = createApiClient({ baseUrl: apiBaseUrl(), getAccessToken: async () => null });
        await submitPasswordReset(client, token.trim(), password);
        setDone(true);
        setPassword("");
        setToken("");
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    });
  }

  return (
    <AuthScreen title="Choose a new password" copy="Paste the token from the reset email. This does not reveal whether an address is registered.">
      <Notice message={error} />
      {done ? <Notice tone="success" message="Password updated. Log in with the new password." /> : null}
      <Field label="Reset token" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} error={errors.token} />
      <Field
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.password}
      />
      <Button label="Update password" loading={loading} onPress={() => void onSubmit()} />
      <TextLink label="Back to log in" onPress={() => router.replace("/(auth)/login")} />
    </AuthScreen>
  );
}
