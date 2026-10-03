// RFC 5297 AES-SIV framing adapted from Keiyoushi's AesSiv.kt (Apache-2.0).
// Noble 1.x's `siv` alias means GCM-SIV, not RFC 5297 AES-SIV.
import { ecb, ctr } from "@noble/ciphers/aes";
import { xor, authenticate } from "./bytes.js";

function double(block) {
    const out = new Uint8Array(16);
    let carry = 0;
    for (let i = 15; i >= 0; i--) { out[i] = (block[i] << 1) | carry; carry = block[i] >>> 7; }
    if (carry) out[15] ^= 0x87;
    return out;
}
function cmac(key, message) {
    const encrypt = block => ecb(key,{ disablePadding: true }).encrypt(block);
    const k1 = double(encrypt(new Uint8Array(16))), k2 = double(k1);
    const complete = message.length > 0 && message.length % 16 === 0;
    const fullLength = complete ? message.length-16 : message.length-message.length%16;
    let state = new Uint8Array(16);
    for (let offset = 0; offset < fullLength; offset += 16) {
        const next = encrypt(xor(state,message.subarray(offset,offset+16))); state.fill(0); state = next;
    }
    const last = new Uint8Array(16); last.set(message.subarray(fullLength));
    if (!complete) last[message.length%16] = 0x80;
    const result = encrypt(xor(state,xor(last,complete ? k1 : k2)));
    state.fill(0); last.fill(0); k1.fill(0); k2.fill(0);
    return result;
}
export function decryptAesSiv(key, body, aad) {
    if (key.length !== 64 || body.length < 16) throw new Error("AES-SIV input invalid");
    const iv = body.slice(0,16); iv[8] &= 0x7f; iv[12] &= 0x7f;
    const output = ctr(key.subarray(32),iv).decrypt(body.subarray(16));
    let d = cmac(key.subarray(0,32),new Uint8Array(16));
    if (aad.length) { const next = xor(double(d),cmac(key.subarray(0,32),aad)); d.fill(0); d = next; }
    let material;
    if (output.length >= 16) {
        material = output.slice();
        for (let i = 0; i < 16; i++) material[material.length-16+i] ^= d[i];
    } else {
        material = new Uint8Array(16); material.set(output); material[output.length] = 0x80;
        material = xor(material,double(d));
    }
    try { authenticate(cmac(key.subarray(0,32),material),body.subarray(0,16),output); return output; }
    finally { d.fill(0); material.fill(0); }
}
