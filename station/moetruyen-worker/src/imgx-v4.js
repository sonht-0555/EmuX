// IMGX V4 envelope/profile layout follows Keiyoushi ImgxCrypto.kt.
import { chacha20poly1305, xchacha20poly1305 } from "@noble/ciphers/chacha";
import { xsalsa20poly1305 } from "@noble/ciphers/salsa";
import { gcmsiv } from "@noble/ciphers/aes";
import { ReaderError } from "./reader-access.js";
import { concat, authenticate } from "./crypto/bytes.js";
import { decryptSecretstream, STREAM_CHUNK } from "./crypto/secretstream.js";
import { decryptAesSiv } from "./crypto/aes-siv.js";
import { decryptAegis } from "./crypto/aegis.js";

const encode = new TextEncoder();
export const decoderProfiles = Array.from({ length: 10 },(_,i) => `p${String(i+1).padStart(2,"0")}`);
async function derive(key, salt, info) {
    const base = await crypto.subtle.importKey("raw",key,"HKDF",false,["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256",salt,
        info: encode.encode(info) },base,512));
}
async function aesGcm(key, iv, aad, body) {
    const imported = await crypto.subtle.importKey("raw",key,"AES-GCM",false,["decrypt"]);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv,
        additionalData: aad, tagLength: 128 },imported,body));
}
function payloadLength(profile, plain) {
    if (profile === 5) return plain+24+17*Math.ceil(plain/STREAM_CHUNK);
    if (profile === 6) return 16+(Math.floor(plain/16)+1)*16+32;
    if (profile === 8) return plain+16;
    if (profile === 9) return plain+64;
    if (profile === 10) return plain+48;
    return plain+([1,2,7].includes(profile) ? 12 : 24)+16+(profile === 4 ? 32 : 0);
}

export async function decodeImgxV4(binary, key, storageKey, imageId) {
    if (!(binary instanceof Uint8Array) || binary.length <= 78 || binary.length > 67117056
        || new TextDecoder().decode(binary.subarray(0,4)) !== "IMGX" || binary[4] !== 4
        || !(key instanceof Uint8Array) || key.length !== 32) {
        throw new ReaderError("imgx_invalid_payload","IMGX V4 image or key invalid");
    }
    const view = new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
    const width = view.getUint32(5), height = view.getUint32(9);
    if (!width || !height || width > 65535 || height > 65535 || width*height > 1e8) {
        throw new ReaderError("imgx_invalid_dimensions","IMGX V4 dimensions invalid");
    }
    const storage = String(storageKey || "").trim().replace(/^\/+/,"");
    if (!/^[a-f0-9]{32}$/.test(imageId) || !storage || storage.length > 2048) {
        throw new ReaderError("imgx_invalid_context","IMGX V4 image context invalid");
    }
    const header = binary.subarray(0,78), body = binary.subarray(78);
    const context = encode.encode(JSON.stringify(["IMGX-v4",imageId,storage]));
    const derived = await derive(key,header.subarray(13,45),"IMGX-v4.envelope");
    let metadata;
    try {
        metadata = await aesGcm(derived.subarray(0,32),header.subarray(45,57),
            concat(header.subarray(0,57),context),header.subarray(57));
        if (metadata.length !== 5 || !decoderProfiles[metadata[0]-1]) {
            throw new ReaderError("imgx_invalid_metadata","IMGX V4 profile metadata invalid");
        }
        const profile = metadata[0], plain = new DataView(metadata.buffer,metadata.byteOffset,5).getUint32(1);
        if (!plain || plain > 67108864 || body.length !== payloadLength(profile,plain)) {
            throw new ReaderError("imgx_invalid_length","IMGX V4 payload length invalid");
        }
        const contentKey = derived.subarray(32), aad = concat(header,context);
        let output;
        switch (profile) {
            case 1: output = await aesGcm(contentKey,body.subarray(0,12),aad,body.subarray(12)); break;
            case 2: output = chacha20poly1305(contentKey,body.subarray(0,12),aad).decrypt(body.subarray(12)); break;
            case 3: output = xchacha20poly1305(contentKey,body.subarray(0,24),aad).decrypt(body.subarray(24)); break;
            case 4: {
                const opened = xsalsa20poly1305(contentKey,body.subarray(0,24)).decrypt(body.subarray(24));
                try {
                    authenticate(new Uint8Array(await crypto.subtle.digest("SHA-256",aad)),opened.subarray(0,32),opened);
                    output = opened.slice(32);
                } finally { opened.fill(0); }
                break;
            }
            case 5: output = decryptSecretstream(contentKey,body,aad,plain); break;
            case 6: {
                const subkey = await derive(contentKey,new Uint8Array(32),"IMGX-v4.p06");
                try {
                    const iv = body.subarray(0,16), ciphertext = body.subarray(16,body.length-32), length = new Uint8Array(8);
                    new DataView(length.buffer).setBigUint64(0,BigInt(aad.length)*8n);
                    const macKey = await crypto.subtle.importKey("raw",subkey.subarray(0,32),{ name: "HMAC",hash: "SHA-512" },false,["sign"]);
                    const tag = new Uint8Array(await crypto.subtle.sign("HMAC",macKey,concat(aad,iv,ciphertext,length))).slice(0,32);
                    authenticate(tag,body.subarray(body.length-32));
                    const aes = await crypto.subtle.importKey("raw",subkey.subarray(32),"AES-CBC",false,["decrypt"]);
                    output = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC",iv },aes,ciphertext));
                } finally { subkey.fill(0); }
                break;
            }
            case 7: output = gcmsiv(contentKey,body.subarray(0,12),aad).decrypt(body.subarray(12)); break;
            case 8: {
                const subkey = await derive(contentKey,new Uint8Array(32),"IMGX-v4.p08");
                try { output = decryptAesSiv(subkey,body,aad); }
                finally { subkey.fill(0); }
                break;
            }
            case 9: output = decryptAegis(contentKey,body.subarray(0,32),body.subarray(32),aad,256); break;
            case 10: output = decryptAegis(contentKey.subarray(0,16),body.subarray(0,16),body.subarray(16),aad,128); break;
        }
        if (output.length !== plain) { output.fill(0); throw new ReaderError("imgx_output_length_invalid","IMGX V4 plaintext length invalid"); }
        return output;
    } finally { derived.fill(0); metadata?.fill(0); }
}
