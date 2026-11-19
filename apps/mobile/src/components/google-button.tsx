import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { Button } from "./button";
import { colors } from "../constants/theme";
import { googleClientIds, googleSignInConfigured } from "../lib/google-config";

WebBrowser.maybeCompleteAuthSession();

export function GoogleSignInButton({
  disabled,
  onToken,
  onError,
}: {
  disabled?: boolean;
  onToken: (idToken: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  if (!googleSignInConfigured()) {
    return (
      <>
        <Button label="Continue with Google" variant="secondary" disabled />
        <Text style={styles.note}>Google sign-in needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID on this build.</Text>
      </>
    );
  }
  return <ConfiguredGoogleButton disabled={disabled} onToken={onToken} onError={onError} />;
}

function ConfiguredGoogleButton({
  disabled,
  onToken,
  onError,
}: {
  disabled?: boolean;
  onToken: (idToken: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const ids = googleClientIds();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: ids.webClientId,
    webClientId: ids.webClientId,
    iosClientId: ids.iosClientId || undefined,
    androidClientId: ids.androidClientId || undefined,
    selectAccount: true,
  });
  const [opening, setOpening] = useState(false);
  const handled = useRef<typeof response>(null);

  useEffect(() => {
    if (!response || handled.current === response) return;
    handled.current = response;
    if (response.type === "cancel" || response.type === "dismiss") {
      onError("Google sign-in was cancelled.");
      return;
    }
    if (response.type === "error") {
      onError("Google sign-in could not be completed.");
      return;
    }
    if (response.type !== "success") return;
    const idToken = response.params.id_token || response.authentication?.idToken || "";
    if (!idToken) {
      if (!response.params.code) onError("Google did not return an ID token.");
      return;
    }
    void onToken(idToken).catch((err: unknown) => {
      onError(err instanceof Error ? err.message : "Google sign-in could not be completed.");
    });
  }, [onError, onToken, response]);

  return (
    <Button
      label="Continue with Google"
      variant="secondary"
      loading={opening}
      disabled={disabled || !request}
      onPress={() => {
        setOpening(true);
        void promptAsync()
          .catch(() => onError("Google sign-in could not be opened."))
          .finally(() => setOpening(false));
      }}
    />
  );
}

const styles = StyleSheet.create({
  note: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: "center" },
});
