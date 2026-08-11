import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_STORAGE_KEY,
  SupabaseAuthClient,
  SupabaseAuthError
} from '../js/supabase-auth.js';

const URL = 'https://example.supabase.co';
const KEY = `sb_publishable_${'x'.repeat(28)}`;
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function response(data, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => data };
}

function storageWith(value = null) {
  const values = new Map(value === null ? [] : [[AUTH_STORAGE_KEY, value]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, next) => values.set(key, next),
    removeItem: (key) => values.delete(key),
    read: (key) => values.get(key) ?? null
  };
}

function authResponse({
  accessToken = 'access-token-for-tests-1234567890',
  refreshToken = 'refresh-token-for-tests-1234567890',
  expiresAt = Math.floor(Date.now() / 1000) + 3_600,
  isAnonymous = true
} = {}) {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 3600,
    expires_at: expiresAt,
    user: { id: USER_ID, is_anonymous: isAnonymous }
  };
}

test('認証セッションがない読み取りでは匿名利用者を作らない', async () => {
  let requests = 0;
  const client = new SupabaseAuthClient({
    url: URL,
    publishableKey: KEY,
    storage: storageWith(),
    fetchImpl: async () => {
      requests += 1;
      throw new Error('must not request');
    }
  });

  assert.equal(await client.getSession({ create: false }), null);
  assert.equal(requests, 0);
});

test('匿名サインインの応答を保存し、既存セッションとして再利用する', async () => {
  const storage = storageWith();
  const requests = [];
  const client = new SupabaseAuthClient({
    url: URL,
    publishableKey: KEY,
    storage,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response(authResponse());
    }
  });

  const first = await client.getSession({ create: true });
  const second = await client.getSession({ create: false });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${URL}/auth/v1/signup`);
  assert.deepEqual(JSON.parse(requests[0].options.body), {});
  assert.equal(requests[0].options.headers.apikey, KEY);
  assert.equal(first.userId, USER_ID);
  assert.equal(first.isAnonymous, true);
  assert.deepEqual(second, first);
  assert.equal(JSON.parse(storage.read(AUTH_STORAGE_KEY)).refreshToken, first.refreshToken);
});

test('期限切れが近い保存セッションだけをrefresh tokenで更新する', async () => {
  const expiredAt = Date.now() - 60_000;
  const stored = JSON.stringify({
    accessToken: 'old-access-token-for-tests-123456',
    refreshToken: 'old-refresh-token-for-tests-123456',
    userId: USER_ID,
    isAnonymous: true,
    expiresAt: expiredAt
  });
  const storage = storageWith(stored);
  const requests = [];
  const client = new SupabaseAuthClient({
    url: URL,
    publishableKey: KEY,
    storage,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response(authResponse({
        accessToken: 'new-access-token-for-tests-123456',
        refreshToken: 'new-refresh-token-for-tests-123456'
      }));
    }
  });

  const session = await client.getSession({ create: false });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${URL}/auth/v1/token?grant_type=refresh_token`);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    refresh_token: 'old-refresh-token-for-tests-123456'
  });
  assert.equal(session.accessToken, 'new-access-token-for-tests-123456');
  assert.equal(JSON.parse(storage.read(AUTH_STORAGE_KEY)).accessToken, session.accessToken);
});

test('refresh失敗時は新しい匿名利用者を黙って作らず認証エラーを返す', async () => {
  const expiredAt = Date.now() - 60_000;
  const storage = storageWith(JSON.stringify({
    accessToken: 'old-access-token-for-tests-123456',
    refreshToken: 'old-refresh-token-for-tests-123456',
    userId: USER_ID,
    isAnonymous: true,
    expiresAt: expiredAt
  }));
  const paths = [];
  const client = new SupabaseAuthClient({
    url: URL,
    publishableKey: KEY,
    storage,
    fetchImpl: async (url) => {
      paths.push(url);
      return response({ error: 'invalid refresh token' }, { ok: false, status: 401 });
    }
  });

  await assert.rejects(
    client.getSession({ create: false }),
    (error) => error instanceof SupabaseAuthError && error.code === 'unauthorized'
  );
  assert.deepEqual(paths, [`${URL}/auth/v1/token?grant_type=refresh_token`]);
});

test('認証応答のUUIDやtokenが不正なら保存しない', async () => {
  const storage = storageWith();
  const client = new SupabaseAuthClient({
    url: URL,
    publishableKey: KEY,
    storage,
    fetchImpl: async () => response({
      ...authResponse(),
      access_token: 'short',
      user: { id: 'not-a-uuid', is_anonymous: true }
    })
  });

  await assert.rejects(
    client.signInAnonymously(),
    (error) => error instanceof SupabaseAuthError && error.code === 'invalid-response'
  );
  assert.equal(storage.read(AUTH_STORAGE_KEY), null);
});

test('通常利用者のsignup応答を匿名セッションとして受け入れない', async () => {
  const storage = storageWith();
  const client = new SupabaseAuthClient({
    url: URL,
    publishableKey: KEY,
    storage,
    fetchImpl: async () => response(authResponse({ isAnonymous: false }))
  });

  await assert.rejects(
    client.signInAnonymously(),
    (error) => error instanceof SupabaseAuthError && error.code === 'invalid-response'
  );
  assert.equal(storage.read(AUTH_STORAGE_KEY), null);
});

test('clearは保存済み認証情報とメモリ上のsessionを消す', async () => {
  const storage = storageWith();
  const client = new SupabaseAuthClient({
    url: URL,
    publishableKey: KEY,
    storage,
    fetchImpl: async () => response(authResponse())
  });

  await client.signInAnonymously();
  client.clear();

  assert.equal(storage.read(AUTH_STORAGE_KEY), null);
  assert.equal(await client.getSession({ create: false }), null);
});
