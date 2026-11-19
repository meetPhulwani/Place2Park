import * as SecureStore from "expo-secure-store";
import { createSecureTokenStore } from "./token-store";

export const secureTokenStore = createSecureTokenStore({
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
});
