import { authReturnParams } from './aiSearchEntry';

const callbackPath = '/auth/kakao/callback';
const flowStorageKey = 'readonme.kakao-login';
const flowValue = /^[0-9a-f]{64}$/;
const sdkUrl = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js';
const sdkIntegrity = 'sha384-v6JKY3z4FUkWq21oZDHZe74YvuPk/WUrVLrDHTBojHXClOSa3iXy7sCXPY1jkFbj';

export type KakaoFlow = {
  state: string;
  verifier: string;
  expiresAt: number;
  returnParams: ReturnType<typeof authReturnParams>;
};

export type KakaoStart = {
  state: string;
  javascript_key: string;
  redirect_uri: string;
  expires_in_seconds: number;
};

export type KakaoExchange = { code: string; state: string; verifier: string };

type KakaoSdk = {
  init: (key: string) => void;
  isInitialized: () => boolean;
  Auth: { authorize: (options: { redirectUri: string; state: string; throughTalk: boolean }) => void };
};

const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

export async function createKakaoVerifier() {
  const verifier = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: hex(new Uint8Array(hash)) };
}

export function isKakaoStartForOrigin(start: KakaoStart, origin: string) {
  return flowValue.test(start.state) && !!start.javascript_key &&
    start.redirect_uri === origin + callbackPath &&
    Number.isFinite(start.expires_in_seconds) && start.expires_in_seconds > 0;
}

export function saveKakaoFlow(storage: Pick<Storage, 'setItem'>, flow: KakaoFlow) {
  storage.setItem(flowStorageKey, JSON.stringify(flow));
}

export function consumeKakaoCallback(storage: Pick<Storage, 'getItem' | 'removeItem'>, search: string, now = Date.now()) {
  const query = new URLSearchParams(search);
  const states = query.getAll('state');
  if (states.length !== 1 || !flowValue.test(states[0])) return null;

  const stored = storage.getItem(flowStorageKey);
  if (!stored) return null;
  let flow: KakaoFlow;
  try {
    flow = JSON.parse(stored);
  } catch {
    storage.removeItem(flowStorageKey);
    return null;
  }
  if (!flow || flow.state !== states[0]) return null;
  storage.removeItem(flowStorageKey);
  if (!flowValue.test(flow.verifier) || !Number.isFinite(flow.expiresAt) || flow.expiresAt <= now) return null;

  const { returnTo, prompt, isbn, tags } = flow.returnParams ?? {};
  const returnParams = authReturnParams(returnTo, prompt, isbn, tags);
  const codes = query.getAll('code');
  if (query.has('error') || codes.length !== 1 || !codes[0] || codes[0].length > 2048) {
    return { returnParams, cancelled: query.get('error') === 'access_denied', exchange: null };
  }
  return {
    returnParams,
    cancelled: false,
    exchange: { code: codes[0], state: flow.state, verifier: flow.verifier },
  };
}

let loadSdk: Promise<KakaoSdk> | undefined;

export function loadKakaoSdk() {
  const browser = window as Window & { Kakao?: KakaoSdk };
  if (browser.Kakao) return Promise.resolve(browser.Kakao);
  if (loadSdk) return loadSdk;
  loadSdk = new Promise<KakaoSdk>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      loadSdk = undefined;
      reject(new Error('Could not load Kakao SDK'));
    };
    const timeout = window.setTimeout(fail, 8000);
    script.src = sdkUrl;
    script.integrity = sdkIntegrity;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => {
      if (!browser.Kakao) { fail(); return; }
      clearTimeout(timeout);
      resolve(browser.Kakao);
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return loadSdk;
}
