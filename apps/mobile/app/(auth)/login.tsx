import { useState } from "react";
import { router } from "expo-router";
import { ApiRequestError, loginFailureMessage } from "../../src/api/client";
import { AuthScreen } from "../../src/components/auth-screen";
import { Button } from "../../src/components/button";
import { Field } from "../../src/components/field";
import { GoogleSignInButton } from "../../src/components/google-button";
import { Notice } from "../../src/components/notice";
import { TextLink } from "../../src/components/legal-links";
import { loginIssues } from "../../src/lib/account-rules";
import { createSubmitLock } from "../../src/lib/submit-lock";
import { useAuth } from "../../src/services/auth-context";

const submitLock = createSubmitLock();

export default function LoginScreen() {
  const { login, continueWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    const issues = loginIssues(email, password);
    setEmailError(issues.email);
    setPasswordError(issues.password);
    setError(null);
    if (issues.email || issues.password) return;
    await submitLock(async () => {
      setLoading(true);
      try {
        await login(email.trim(), password);
        router.replace("/(auth)/verify-email");
      } catch (err) {
        if (err instanceof ApiRequestError) {
          setEmailError(err.fieldErrors.email ?? null);
          setPasswordError(err.fieldErrors.password ?? null);
        }
        setError(loginFailureMessage(err));
      } finally {
        setLoading(false);
      }
    });
  }

  return (
    <AuthScreen title="Log in" copy="Use the email and password for your Place2Park account. We will email a 6-digit code before opening a session.">
      <Notice message={error} />
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
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        error={passwordError}
      />
      <Button label="Continue" loading={loading} onPress={() => void onSubmit()} />
      <TextLink label="Forgot password" onPress={() => router.push("/(auth)/forgot-password")} />
      <GoogleSignInButton
        disabled={loading}
        onError={setError}
        onToken={async (idToken) => {
          const kind = await continueWithGoogle(idToken);
          router.replace(kind === "registration" ? "/(auth)/google-role" : "/(auth)/verify-email");
        }}
      />
      <TextLink label="Create an account" onPress={() => router.push("/(auth)/signup")} />
    </AuthScreen>
  );
}
