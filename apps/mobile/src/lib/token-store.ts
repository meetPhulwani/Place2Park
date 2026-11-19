export const ACCESS_TOKEN_KEY = "place2park.access_token";

export type TokenStore = {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
};

type SecureStoreApi = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export function createMemoryTokenStore(): TokenStore {
  let token: string | null = null;
  return {
    async get() {
      return token;
    },
    async set(value: string) {
      token = value;
    },
    async clear() {
      token = null;
    },
  };
}

/** Wraps Expo SecureStore. The access JWT is the only value stored. */
export function createSecureTokenStore(native: SecureStoreApi): TokenStore {
  return {
    get: () => native.getItemAsync(ACCESS_TOKEN_KEY),
    set: (token) => native.setItemAsync(ACCESS_TOKEN_KEY, token),
    clear: () => native.deleteItemAsync(ACCESS_TOKEN_KEY),
  };
}
