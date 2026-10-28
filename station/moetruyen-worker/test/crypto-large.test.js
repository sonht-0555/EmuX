import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import sodium from "libsodium-wrappers-sumo";
import { decryptAegis } from "../src/crypto/aegis.js";
import { decryptAesSiv } from "../src/crypto/aes-siv.js";

// Independent Node/OpenSSL RFC 5297 oracle, alongside the static PyCryptodome p08 fixture.
const xor = (a, b) => Buffer.from(a.map((byte, i) => byte ^ b[i]));
function double(input) {
    let value = BigInt("0x" + Buffer.from(input).toString("hex"));
    const carry = value >> 127n;
    value = ((value << 1n) & ((1n << 128n) - 1n)) ^ (carry ? 0x87n : 0n);
    return Buffer.from(value.toString(16).padStart(32, "0"), "hex");
}
function cmac(key, input) {
    const encrypt = bytes => {
        const cipher = createCipheriv("aes-256-cbc", key, Buffer.alloc(16)); cipher.setAutoPadding(false);
        return Buffer.concat([cipher.update(bytes), cipher.final()]);
    };
    const k1 = double(encrypt(Buffer.alloc(16))), k2 = double(k1);
    const full = input.length > 0 && input.length % 16 === 0;
    const bytes = Buffer.alloc(Math.max(16, Math.ceil(input.length / 16) * 16)); bytes.set(input);
    if (!full) bytes[input.length] = 0x80;
    const subkey = full ? k1 : k2;
    for (let i = 0; i < 16; i++) bytes[bytes.length - 16 + i] ^= subkey[i];
    return encrypt(bytes).subarray(-16);
}
function sealSiv(key, plaintext, aad) {
    const macKey = key.subarray(0,32);
    let d = cmac(macKey, Buffer.alloc(16));
    if (aad.length) d = xor(double(d), cmac(macKey, aad));
    let material;
    if (plaintext.length >= 16) {
        material = Buffer.from(plaintext);
        for (let i = 0; i < 16; i++) material[material.length - 16 + i] ^= d[i];
    } else {
        const padded = Buffer.alloc(16); padded.set(plaintext); padded[plaintext.length] = 0x80;
        material = xor(double(d), padded);
    }
    const tag = cmac(macKey, material), counter = Buffer.from(tag); counter[8] &= 0x7f; counter[12] &= 0x7f;
    const cipher = createCipheriv("aes-256-ctr", key.subarray(32), counter);
    return Buffer.concat([tag, cipher.update(plaintext), cipher.final()]);
}
const plaintext = size => Uint8Array.from({ length: size }, (_, i) => (i * 173 + 19) & 255);

test("native AES-SIV authenticates short, aligned, partial and large OpenSSL data", async () => {
    const key = plaintext(64);
    for (const aadSize of [0, 1, 16, 157]) {
        const aad = plaintext(aadSize);
        for (const size of [1, 15, 16, 17, 31, 32, 33, 257, 524291]) {
            const plain = plaintext(size), body = sealSiv(key, plain, aad);
            assert.deepEqual(await decryptAesSiv(key, body, aad), plain);
            body[body.length - 1] ^= 1;
            await assert.rejects(() => decryptAesSiv(key, body, aad));
        }
    }
});

test("word-based AEGIS preserves partial AAD, large payloads, offsets and authentication", async () => {
    await sodium.ready;
    for (const variant of [128, 256]) {
        const key = plaintext(variant === 128 ? 16 : 32), nonce = key.slice().reverse();
        const encrypt = variant === 128 ? sodium.crypto_aead_aegis128l_encrypt : sodium.crypto_aead_aegis256_encrypt;
        for (const size of [15, 16, 31, 32, 33, 524291]) {
            for (const aadSize of [0, 1, 15, 16, 31, 32, 157]) {
                const plain = plaintext(size), aad = plaintext(aadSize), body = encrypt(plain, aad, null, nonce, key);
                // Unaligned typed-array views must not change word byte order.
                const padded = new Uint8Array(body.length + 3); padded.set(body, 3);
                assert.deepEqual(decryptAegis(key, nonce, padded.subarray(3), aad, variant), plain);
                body[body.length - 1] ^= 1;
                assert.throws(() => decryptAegis(key, nonce, body, aad, variant));
            }
        }
    }
});
