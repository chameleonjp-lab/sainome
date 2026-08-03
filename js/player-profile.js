export const PLAYER_PROFILE_STORAGE_KEY = 'sainome.player-profile.v1';
export const PLAYER_NAME_MAX_LENGTH = 20;

const PLAYER_PROFILE_VERSION = 1;
const DISALLOWED_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u206f\ufeff]/u;

function freezeResult(result) {
  return Object.freeze(result);
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function validatePlayerName(value) {
  if (typeof value !== 'string') {
    return freezeResult({
      ok: false,
      code: 'empty',
      message: 'ランキング名を入力してください'
    });
  }

  if (DISALLOWED_CHARACTERS.test(value)) {
    return freezeResult({
      ok: false,
      code: 'invalid-characters',
      message: '改行や制御文字は使えません'
    });
  }

  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const length = Array.from(name).length;

  if (length === 0) {
    return freezeResult({
      ok: false,
      code: 'empty',
      message: 'ランキング名を入力してください'
    });
  }

  if (length > PLAYER_NAME_MAX_LENGTH) {
    return freezeResult({
      ok: false,
      code: 'too-long',
      message: `ランキング名は${PLAYER_NAME_MAX_LENGTH}文字以内にしてください`
    });
  }

  return freezeResult({ ok: true, name, length });
}

export class PlayerProfile {
  constructor({ storage = safeStorage() } = {}) {
    this.storage = storage;
    this.name = '';
    this.restore();
  }

  restore() {
    if (!this.storage) return '';

    try {
      const raw = this.storage.getItem(PLAYER_PROFILE_STORAGE_KEY);
      if (!raw) return '';
      const saved = JSON.parse(raw);
      if (saved?.version !== PLAYER_PROFILE_VERSION) return '';
      const validated = validatePlayerName(saved.name);
      if (!validated.ok) return '';
      this.name = validated.name;
      return this.name;
    } catch {
      return '';
    }
  }

  getName() {
    return this.name;
  }

  saveName(value) {
    const validated = validatePlayerName(value);
    if (!validated.ok) return validated;

    this.name = validated.name;
    let persisted = false;

    try {
      if (this.storage) {
        this.storage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({
          version: PLAYER_PROFILE_VERSION,
          name: this.name
        }));
        persisted = true;
      }
    } catch {
      persisted = false;
    }

    return freezeResult({
      ok: true,
      name: this.name,
      length: validated.length,
      persisted
    });
  }
}
