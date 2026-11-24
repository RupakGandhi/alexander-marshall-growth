// A single aes128gcm Web Push record (RFC 8291, section 4).
const encoder = new TextEncoder();

function decodeBase64url(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
}

function concatenate(...parts: Uint8Array[]) {
  const buffer = new Uint8Array(parts.reduce((size, bytes) => size + bytes.length, 0));
  let offset = 0;
  for (const bytes of parts) {
    buffer.set(bytes, offset);
    offset += bytes.length;
  }
  return buffer;
}

async function derive(secret: BufferSource, salt: BufferSource, info: Uint8Array, bits: number) {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits);
}

export async function encryptPush(subscription: { p256dh: string; auth: string }, message: string) {
  const recipient = decodeBase64url(subscription.p256dh);
  const auth = decodeBase64url(subscription.auth);
  const ec = { name: 'ECDH', namedCurve: 'P-256' };
  const peer = await crypto.subtle.importKey('raw', recipient, ec, false, []);
  const sender = await crypto.subtle.generateKey(ec, true, ['deriveBits']) as CryptoKeyPair;
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey));
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, sender.privateKey, 256);
  const info = concatenate(encoder.encode('WebPush: info\0'), recipient, senderPublic);
  const inputKey = await derive(shared, auth, info, 256);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const rawKey = await derive(inputKey, salt, encoder.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await derive(inputKey, salt, encoder.encode('Content-Encoding: nonce\0'), 96);
  const aesKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  const plaintext = concatenate(encoder.encode(message), Uint8Array.of(2));
  if (plaintext.length + 16 >= 4096) throw new Error('Push message exceeds one record');
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext);
  // Salt, four-byte big-endian record size, key length, sender key, ciphertext.
  return concatenate(salt, Uint8Array.of(0, 0, 16, 0, senderPublic.length), senderPublic, new Uint8Array(encrypted));
}

// Browser-generated subscriptions use the browser vendor's HTTPS push service.
// Never follow redirects or send requests to arbitrary user-supplied servers.
export function isBrowserPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return false;
    const host = u.hostname;
    return host === 'fcm.googleapis.com' || host === 'fcm-push.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') ||
      host === 'web.push.apple.com' || host.endsWith('.push.apple.com') ||
      host === 'notify.windows.com' || host.endsWith('.notify.windows.com');
  } catch {
    return false;
  }
}
