import { useEffect, useState } from "react";
import { Text, StyleSheet } from "react-native";
import { Redirect, router } from "expo-router";
import { ApiRequestError } from "../../src/api/client";
import { AuthScreen } from "../../src/components/auth-screen";
import { Button } from "../../src/components/button";
import { Notice } from "../../src/components/notice";
import { OtpInput } from "../../src/components/otp-input";
import { TextLink } from "../../src/components/legal-links";
import { colors } from "../../src/constants/theme";
import { formatWait, isChallengeExpired, resendWaitMs } from "../../src/lib/otp";
import { createSubmitLock } from "../../src/lib/submit-lock";
import { useAuth } from "../../src/services/auth-context";

const submitLock = createSubmitLock();

export default function VerifyEmailScreen() {
  const { state, verify, resend, cancelChallenge } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (state.status === "signed-in") return <Redirect href="/(app)" />;
  if (state.status !== "verify-email") return <Redirect href="/(auth)/login" />;

  const challenge = state.challenge;
  const expired = isChallengeExpired(challenge.expiresAt, now);
  const wait = resendWaitMs(challenge.resendAvailableAt, now);
  const purposeCopy = challenge.purpose === "signup" ? "Finish creating your account" : "Enter the login code";

  async function onVerify() {
    setError(null);
    if (expired) {
      setError("That code has expired. Request a new one.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code.");
      return;
    }
    await submitLock(async () => {
      setLoading(true);
      try {
        await verify(code);
        router.replace("/(app)");
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    });
  }

  async function onResend() {
    if (wait > 0 || loading) return;
    setError(null);
    setLoading(true);
    try {
      await resend();
      setCode("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "A new code could not be requested.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen title={purposeCopy} copy={`We sent a code to ${challenge.maskedEmail}. The code is not your session.`}>
      <Notice message={error} />
      <OtpInput value={code} onChange={setCode} disabled={loading} />
      {expired ? <Text style={styles.meta}>This code has expired.</Text> : null}
      <Button label="Verify" loading={loading} disabled={expired} onPress={() => void onVerify()} />
      <Button
        label={wait > 0 ? `Resend in ${formatWait(wait)}` : "Resend code"}
        variant="secondary"
        disabled={wait > 0 || loading}
        onPress={() => void onResend()}
      />
      <TextLink
        label="Use a different email"
        onPress={() => {
          cancelChallenge();
          router.replace("/(auth)/login");
        }}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  meta: { color: colors.danger, fontSize: 13 },
});
