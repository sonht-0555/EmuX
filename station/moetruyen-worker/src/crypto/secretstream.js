// IMGX p05 framing adapted from Keiyoushi's XChaCha20Poly1305.kt (Apache-2.0).
import { chacha20, hchacha } from "@noble/ciphers/chacha";
import { poly1305 } from "@noble/ciphers/_poly1305";
import { concat, authenticate } from "./bytes.js";

export const STREAM_CHUNK = 262144;
function words(bytes) {
    const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    return Uint32Array.from({ length: bytes.length / 4 },(_,i) => view.getUint32(i*4,true));
}
export function decryptSecretstream(key, body, aad, plainBytes) {
    const output = new Uint8Array(plainBytes), subkeyWords = new Uint32Array(8);
    hchacha(words(new TextEncoder().encode("expand 32-byte k")),words(key),words(body.subarray(0,16)),subkeyWords);
    let streamKey = new Uint8Array(32), counter = 1;
    const keyView = new DataView(streamKey.buffer);
    subkeyWords.forEach((word,i) => keyView.setUint32(i*4,word,true)); subkeyWords.fill(0);
    const innerNonce = body.slice(16,24);
    const nonceFor = () => {
        const nonce = new Uint8Array(12);
        new DataView(nonce.buffer).setUint32(0,counter,true); nonce.set(innerNonce,4); return nonce;
    };
    let offset = 24;
    try {
        for (let written = 0; written < plainBytes; written += STREAM_CHUNK) {
            const size = Math.min(STREAM_CHUNK,plainBytes-written), input = body.subarray(offset,offset+size+17);
            if (input.length !== size+17) throw new Error("IMGX stream truncated");
            const nonce = nonceFor(), polyKey = chacha20(streamKey,nonce,new Uint8Array(64)).slice(0,32);
            try {
                const block = new Uint8Array(64); block[0] = input[0];
                const authBlock = chacha20(streamKey,nonce,block,undefined,1), tag = authBlock[0];
                authBlock[0] = input[0];
                const ciphertext = input.subarray(1,size+1), stored = input.subarray(size+1), lengths = new Uint8Array(16);
                const view = new DataView(lengths.buffer);
                view.setBigUint64(0,BigInt(aad.length),true); view.setBigUint64(8,BigInt(64+size),true);
                // libsodium secretstream uses size % 16 here, unlike AEAD pad16.
                const mac = poly1305.create(polyKey);
                mac.update(aad).update(new Uint8Array((16-aad.length%16)%16)).update(authBlock)
                    .update(ciphertext).update(new Uint8Array(size%16)).update(lengths);
                authenticate(mac.digest(),stored);
                const expectedTag = written+size === plainBytes ? 3 : 0;
                if (tag !== expectedTag) throw new Error("IMGX stream tag invalid");
                const message = chacha20(streamKey,nonce,ciphertext,undefined,2);
                output.set(message,written); message.fill(0); authBlock.fill(0);
                for (let i = 0; i < 8; i++) innerNonce[i] ^= stored[i];
                counter = (counter+1) >>> 0;
                if ((tag & 2) || counter === 0) {
                    const material = concat(streamKey,innerNonce);
                    const rekeyed = chacha20(streamKey,nonceFor(),material);
                    streamKey.fill(0); streamKey = rekeyed.slice(0,32); innerNonce.set(rekeyed.subarray(32));
                    material.fill(0); rekeyed.fill(0); counter = 1;
                }
                offset += size+17;
            } finally { polyKey.fill(0); }
        }
        if (offset !== body.length) throw new Error("IMGX stream trailing bytes");
        return output;
    } catch (error) { output.fill(0); throw error; }
    finally { streamKey.fill(0); innerNonce.fill(0); }
}
