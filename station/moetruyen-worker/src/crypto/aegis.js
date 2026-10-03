// Adapted from Keiyoushi's Aegis256.kt / Aegis128l.kt (Apache-2.0).
// See THIRD_PARTY_NOTICES.md. IMGX uses 32-byte tags for both algorithms.
import { concat, xor, authenticate } from "./bytes.js";

const C0 = Uint8Array.from([0,1,1,2,3,5,8,13,21,34,55,89,144,233,121,98]);
const C1 = Uint8Array.from([219,61,24,85,109,194,47,241,32,17,49,66,115,181,40,221]);
const xtime = a => ((a << 1) ^ ((a >>> 7) * 0x1b)) & 255;
function multiply(a, b) {
    let result = 0;
    while (b) { if (b & 1) result ^= a; a = xtime(a); b >>>= 1; }
    return result;
}
// AES S-box derived in GF(2^8), avoiding a second hand-maintained lookup table.
const sbox = Uint8Array.from({ length: 256 }, (_, a) => {
    let inverse = 0;
    if (a) {
        inverse = 1;
        for (let i = 0; i < 254; i++) inverse = multiply(inverse, a);
    }
    let result = inverse ^ 0x63;
    for (let i = 1; i <= 4; i++) result ^= ((inverse << i) | (inverse >>> (8 - i))) & 255;
    return result;
});
function round(input, key) {
    const shifted = new Uint8Array(16), result = new Uint8Array(16);
    for (let column = 0; column < 4; column++) {
        for (let row = 0; row < 4; row++) shifted[4 * column + row] = sbox[input[4 * ((column + row) % 4) + row]];
    }
    for (let i = 0; i < 16; i += 4) {
        const [a,b,c,d] = shifted.subarray(i, i + 4);
        result[i] = xtime(a) ^ xtime(b) ^ b ^ c ^ d;
        result[i+1] = a ^ xtime(b) ^ xtime(c) ^ c ^ d;
        result[i+2] = a ^ b ^ xtime(c) ^ xtime(d) ^ d;
        result[i+3] = xtime(a) ^ a ^ b ^ c ^ xtime(d);
    }
    return xor(result, key);
}
const and = (a,b) => a.map((byte,i) => byte & b[i]);
const xorAll = (...parts) => parts.reduce(xor, new Uint8Array(16));

export function decryptAegis(key, nonce, ciphertext, aad, variant) {
    const wide = variant === 128;
    if (key.length !== (wide ? 16 : 32) || nonce.length !== key.length || ciphertext.length < 32) {
        throw new Error("AEGIS input invalid");
    }
    let state;
    const update = (m0, m1) => {
        const next = state.map((block, i) => round(state[(i + state.length - 1) % state.length],
            i === 0 ? xor(block, m0) : wide && i === 4 ? xor(block, m1) : block));
        state.forEach(block => block.fill(0)); state = next;
    };
    const stream = () => wide
        ? concat(xorAll(state[1],state[6],and(state[2],state[3])), xorAll(state[2],state[5],and(state[6],state[7])))
        : xorAll(state[1],state[4],state[5],and(state[2],state[3]));
    if (wide) {
        const kn = xor(key, nonce);
        state = [kn, C1.slice(), C0.slice(), C1.slice(), kn.slice(), xor(key,C0), xor(key,C1), xor(key,C0)];
        for (let i = 0; i < 10; i++) update(nonce, key);
    } else {
        const k0 = key.subarray(0,16), k1 = key.subarray(16), kn0 = xor(k0,nonce.subarray(0,16)), kn1 = xor(k1,nonce.subarray(16));
        state = [kn0.slice(), kn1.slice(), C1.slice(), C0.slice(), xor(k0,C0), xor(k1,C1)];
        for (let i = 0; i < 4; i++) { update(k0); update(k1); update(kn0); update(kn1); }
        kn0.fill(0); kn1.fill(0);
    }
    const blockSize = wide ? 32 : 16, length = ciphertext.length - 32, output = new Uint8Array(length);
    const absorb = block => update(block.subarray(0,16), block.subarray(16));
    try {
        for (let offset = 0; offset < aad.length; offset += blockSize) {
            const block = new Uint8Array(blockSize); block.set(aad.subarray(offset,offset+blockSize)); absorb(block);
        }
        for (let offset = 0; offset < length; offset += blockSize) {
            const count = Math.min(blockSize,length-offset), mask = stream(), block = new Uint8Array(blockSize);
            for (let i = 0; i < count; i++) block[i] = ciphertext[offset+i] ^ mask[i];
            output.set(block.subarray(0,count),offset); absorb(block); block.fill(0); mask.fill(0);
        }
        const lengths = new Uint8Array(16), view = new DataView(lengths.buffer);
        view.setBigUint64(0,BigInt(aad.length)*8n,true); view.setBigUint64(8,BigInt(length)*8n,true);
        const finalBlock = xor(state[wide ? 2 : 3],lengths);
        for (let i = 0; i < 7; i++) update(finalBlock,finalBlock);
        finalBlock.fill(0);
        const half = wide ? 4 : 3;
        const tag = concat(xorAll(...state.slice(0,half)),xorAll(...state.slice(half)));
        authenticate(tag,ciphertext.subarray(length),output); tag.fill(0);
        return output;
    } catch (error) { output.fill(0); throw error; }
    finally { state.forEach(block => block.fill(0)); }
}
