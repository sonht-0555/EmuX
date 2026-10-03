import { readFile } from "node:fs/promises";
import { createCipheriv, createHmac, hkdfSync } from "node:crypto";
import sodium from "libsodium-wrappers-sumo";
import { gcmsiv } from "@noble/ciphers/aes";

export const enc = new TextEncoder();
export const random = length => crypto.getRandomValues(new Uint8Array(length));
export const concat = (...parts) => new Uint8Array(Buffer.concat(parts.map(part => Buffer.from(part))));
export const imageId = "0123456789abcdef0123456789abcdef";
export const storageKey = "chapters/manga-45/ch-1/001.js";
export const image = new Uint8Array(await readFile(new URL("./fixtures/page.webp", import.meta.url)));

export async function encryptImage(profile = 1, plaintext = image) {
    if (profile === 8) {
        const fixture = JSON.parse(await readFile(new URL("./fixtures/p08.json",import.meta.url),"utf8"));
        return { key: new Uint8Array(Buffer.from(fixture.key,"base64")), binary: new Uint8Array(Buffer.from(fixture.binary,"base64")) };
    }
    const key = random(32), header = new Uint8Array(78);
    header.set(enc.encode("IMGX")); header[4] = 4;
    const view = new DataView(header.buffer);
    view.setUint32(5, 240); view.setUint32(9, 160);
    header.set(random(32), 13); header.set(random(12), 45);
    const base = await crypto.subtle.importKey("raw", key, "HKDF", false, ["deriveBits"]);
    const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256",
        salt: header.subarray(13, 45), info: enc.encode("IMGX-v4.envelope") }, base, 512));
    const context = enc.encode(JSON.stringify(["IMGX-v4", imageId, storageKey]));
    const metadata = new Uint8Array(5); metadata[0] = profile;
    new DataView(metadata.buffer).setUint32(1, plaintext.length);
    const envelopeKey = await crypto.subtle.importKey("raw", derived.subarray(0, 32), "AES-GCM", false, ["encrypt"]);
    header.set(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: header.subarray(45, 57),
        additionalData: concat(header.subarray(0, 57), context) }, envelopeKey, metadata)), 57);
    const aad = concat(header,context), contentKey = derived.subarray(32);
    await sodium.ready;
    let body;
    if (profile === 2 || profile === 3) {
        const nonce = random(profile === 2 ? 12 : 24);
        const encrypt = profile === 2 ? sodium.crypto_aead_chacha20poly1305_ietf_encrypt : sodium.crypto_aead_xchacha20poly1305_ietf_encrypt;
        body = concat(nonce,encrypt(plaintext,aad,null,nonce,contentKey));
    } else if (profile === 4) {
        const nonce = random(24), digest = new Uint8Array(await crypto.subtle.digest("SHA-256",aad));
        body = concat(nonce,sodium.crypto_secretbox_easy(concat(digest,plaintext),nonce,contentKey));
    } else if (profile === 5) {
        const stream = sodium.crypto_secretstream_xchacha20poly1305_init_push(contentKey), chunks = [stream.header];
        for (let offset = 0; offset < plaintext.length; offset += 262144) {
            const end = Math.min(offset+262144,plaintext.length);
            const tag = end === plaintext.length ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
            chunks.push(sodium.crypto_secretstream_xchacha20poly1305_push(stream.state,plaintext.subarray(offset,end),aad,tag));
        }
        body = concat(...chunks);
    } else if (profile === 6) {
        const subkey = new Uint8Array(hkdfSync("sha256",contentKey,new Uint8Array(32),"IMGX-v4.p06",64));
        const iv = random(16), cipher = createCipheriv("aes-256-cbc",subkey.subarray(32),iv);
        const ciphertext = Buffer.concat([cipher.update(plaintext),cipher.final()]), length = Buffer.alloc(8);
        length.writeBigUInt64BE(BigInt(aad.length)*8n);
        const mac = createHmac("sha512",subkey.subarray(0,32)).update(aad).update(iv).update(ciphertext).update(length).digest().subarray(0,32);
        body = concat(iv,ciphertext,mac);
    } else if (profile === 7) {
        const nonce = random(12); body = concat(nonce,gcmsiv(contentKey,nonce,aad).encrypt(plaintext));
    } else if (profile === 9 || profile === 10) {
        const nonce = random(profile === 9 ? 32 : 16);
        const encrypt = profile === 9 ? sodium.crypto_aead_aegis256_encrypt : sodium.crypto_aead_aegis128l_encrypt;
        body = concat(nonce,encrypt(plaintext,aad,null,nonce,profile === 9 ? contentKey : contentKey.subarray(0,16)));
    } else {
        const nonce = random(12);
        const payloadKey = await crypto.subtle.importKey("raw",contentKey,"AES-GCM",false,["encrypt"]);
        const payload = await crypto.subtle.encrypt({ name: "AES-GCM",iv: nonce,additionalData: aad },payloadKey,plaintext);
        body = concat(nonce,new Uint8Array(payload));
    }
    return { key, binary: concat(header,body) };
}
