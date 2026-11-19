export function googleClientIds(env: Record<string, string | undefined> = process.env) {
  return {
    webClientId: env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "",
    iosClientId: env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "",
    androidClientId: env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ?? "",
  };
}

export function googleSignInConfigured(env: Record<string, string | undefined> = process.env) {
  return googleClientIds(env).webClientId.length > 0;
}
