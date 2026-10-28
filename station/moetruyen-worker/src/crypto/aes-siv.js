// RFC 5297 AES-SIV framing adapted from Keiyoushi's AesSiv.kt (Apache-2.0).
// Noble 1.x's `siv` alias means GCM-SIV, not RFC 5297 AES-SIV.
import { xor, authenticate } from "./bytes.js";

function double(block) {
    const out = new Uint8Array(16);
    let carry = 0;
    for (let i = 15; i >= 0; i--) { out[i] = (block[i] << 1) | carry; carry = block[i] >>> 7; }
    if (carry) out[15] ^= 0x87;
    return out;
}
async function cmac(key, k1, k2, message) {
    const complete = message.length > 0 && message.length % 16 === 0;
    const fullLength = complete ? message.length-16 : message.length-message.length%16;
    const input = new Uint8Array(fullLength + 16);
    input.set(message);
    if (!complete) input[message.length] = 0x80;
    const subkey = complete ? k1 : k2;
    for (let i = 0; i < 16; i++) input[fullLength + i] ^= subkey[i];
    let encrypted;
    try {
        // Web Crypto adds a PKCS#7 block. The preceding block is the CBC-MAC.
        encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: new Uint8Array(16) }, key, input));
        return encrypted.slice(input.length - 16, input.length);
    } finally { input.fill(0); encrypted?.fill(0); }
}
export async function decryptAesSiv(key, body, aad) {
    if (key.length !== 64 || body.length <= 16) throw new Error("AES-SIV input invalid");
    const macKey = await crypto.subtle.importKey("raw", key.subarray(0,32), "AES-CBC", false, ["encrypt"]);
    const ctrKey = await crypto.subtle.importKey("raw", key.subarray(32), "AES-CTR", false, ["decrypt"]);
    const iv = new Uint8Array(body.subarray(0,16)); iv[8] &= 0x7f; iv[12] &= 0x7f;
    let output, k1, k2, d, material;
    try {
        output = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CTR", counter: iv, length: 128 }, ctrKey, body.subarray(16)));
        const seed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: new Uint8Array(16) }, macKey, new Uint8Array(16)));
        k1 = double(seed.subarray(0,16)); k2 = double(k1); seed.fill(0);
        const mac = message => cmac(macKey, k1, k2, message);
        d = await mac(new Uint8Array(16));
        if (aad.length) { const next = xor(double(d), await mac(aad)); d.fill(0); d = next; }
        if (output.length >= 16) {
            material = output.slice();
            for (let i = 0; i < 16; i++) material[material.length-16+i] ^= d[i];
        } else {
            material = new Uint8Array(16); material.set(output); material[output.length] = 0x80;
            const next = xor(material, double(d)); material.fill(0); material = next;
        }
        const tag = await mac(material);
        try { authenticate(tag, body.subarray(0,16), output); }
        finally { tag.fill(0); }
        return output;
    } catch (error) { output?.fill(0); throw error; }
    finally {
        iv.fill(0); k1?.fill(0); k2?.fill(0); d?.fill(0); material?.fill(0);
    }
}
