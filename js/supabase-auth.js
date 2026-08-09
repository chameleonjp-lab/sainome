const AUTH_STORAGE_KEY = 'sainome.supabase-auth.v1';
const ACCESS_TOKEN_SKEW_MS = 30_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function safeStorage(storage = globalThis.localStorage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return null;
    return storage;
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  if (typeof url !== 'string' || !/^https:\/\/[^/]+\.supabase\.co\/?$/u.test(url)) {
    throw new TypeError('Supabase URL is invalid');
  }
  return url.replace(/\/$/u, '');
}

function normalizeToken(value, name) {
  if (typeof value !== 'string' || value.length < 20 || value.length > 8192) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function normalizeSession(value, now = Date.now()) {
  if (!value || typeof value !== 'object') throw new TypeError('session is invalid');
  const accessToken = normalizeToken(value.accessToken, 'accessToken');
  const refreshToken = normalizeToken(value.refreshToken, 'refreshToken');
  const userId = value.userId;
  if (!UUID_PATTERN.test(userId)) throw new TypeError('userId is invalid');
  if (!Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now - 86_400_000) {
    throw new TypeError('expiresAt is invalid');
  }
  return Object.freeze({
    accessToken,
    refreshToken,
    userId,
    isAnonymous: value.isAnonymous === true,
    expiresAt: value.expiresAt
  });
}

function parseAuthResponse(data, now = Date.now()) {
  if (!data || typeof data !== 'object') throw new TypeError('auth response is invalid');
  const expiresIn = Number(data.expires_in);
  const expiresAt = Number.isSafeInteger(data.expires_at)
    ? data.expires_at * 1000
    : now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 3_600_000);
  const userId = data.user?.id;
  if (!UUID_PATTERN.test(userId)) throw new TypeError('auth response user is invalid');
  return normalizeSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId,
    isAnonymous: data.user?.is_anonymous === true,
    expiresAt
  }, now);
}

export class SupabaseAuthError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'SupabaseAuthError';
    this.code = code;
  }
}

export class SupabaseAuthClient {
  constructor({
    url,
    publishableKey,
    fetchImpl = globalThis.fetch,
    storage = safeStorage(),
    timeoutMs = 8_000
  }) {
    this.url = normalizeUrl(url);
    if (typeof publishableKey !== 'string' || publishableKey.length < 20) {
      throw new TypeError('Supabase publishable key is invalid');
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch is unavailable');
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new RangeError('timeoutMs is invalid');
    this.publishableKey = publishableKey;
    this.fetchImpl = fetchImpl;
    this.storage = safeStorage(storage);
    this.timeoutMs = timeoutMs;
    this.session = null;
  }

  #readStoredSession() {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      return normalizeSession(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  #storeSession(session) {
    this.session = session;
    if (!this.storage) return false;
    try {
      this.storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      return true;
    } catch {
      return false;
    }
  }

  #clearStoredSession() {
    this.session = null;
    try {
      this.storage?.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // An unavailable storage area must not stop the game.
    }
  }

  async #request(path, { method = 'POST', body } = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.url}/auth/v1/${path}`, {
        method,
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${this.publishableKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok) {
        throw new SupabaseAuthError(
          response.status === 401 ? 'unauthorized' : 'request-failed',
          '匿名利用者の認証に失敗しました'
        );
      }
      return data;
    } catch (error) {
      if (error instanceof SupabaseAuthError) throw error;
      if (error?.name === 'AbortError') {
        throw new SupabaseAuthError('timeout', '匿名利用者の認証が時間切れになりました', error);
      }
      throw new SupabaseAuthError('network', '匿名利用者の認証へ接続できませんでした', error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async #refresh(session) {
    const data = await this.#request('token?grant_type=refresh_token', {
      body: { refresh_token: session.refreshToken }
    });
    try {
      const refreshed = parseAuthResponse(data);
      if (!refreshed.isAnonymous) {
        throw new TypeError('refreshed session is not anonymous');
      }
      this.#storeSession(refreshed);
      return refreshed;
    } catch (error) {
      throw new SupabaseAuthError('invalid-response', '認証の更新応答が不正です', error);
    }
  }

  async getSession({ create = false, forceRefresh = false } = {}) {
    let session = this.session ?? this.#readStoredSession();
    if (session && !session.isAnonymous) {
      this.#clearStoredSession();
      session = null;
    }
    if (session && !forceRefresh && session.expiresAt > Date.now() + ACCESS_TOKEN_SKEW_MS) {
      this.session = session;
      return session;
    }

    if (session?.refreshToken) {
      return this.#refresh(session);
    }
    if (!create) return null;
    return this.signInAnonymously();
  }

  async signInAnonymously({ captchaToken } = {}) {
    const body = captchaToken
      ? { gotrue_meta_security: { captcha_token: captchaToken } }
      : {};
    const data = await this.#request('signup', { body });
    try {
      const session = parseAuthResponse(data);
      if (!session.isAnonymous) {
        throw new TypeError('signup session is not anonymous');
      }
      this.#storeSession(session);
      return session;
    } catch (error) {
      throw new SupabaseAuthError('invalid-response', '匿名利用者の認証応答が不正です', error);
    }
  }

  async getAccessToken({ create = false } = {}) {
    const session = await this.getSession({ create });
    return session?.accessToken ?? null;
  }

  clear() {
    this.#clearStoredSession();
  }
}

export { AUTH_STORAGE_KEY };
