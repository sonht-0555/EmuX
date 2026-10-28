// Adapted from Keiyoushi's Aegis256.kt / Aegis128l.kt (Apache-2.0).
// See THIRD_PARTY_NOTICES.md. IMGX uses 32-byte tags for both algorithms.
// Keep state in 32-bit words and reuse round buffers: no per-block allocation.
import { authenticate } from "./bytes.js";

const C0 = new Uint32Array([0x02010100, 0x0d080503, 0x59372215, 0x6279e990]);
const C1 = new Uint32Array([0x55183ddb, 0xf12fc26d, 0x42311120, 0xdd28b573]);
const SBOX = new Uint8Array([
    99, 124, 119, 123, 242, 107, 111, 197, 48, 1, 103, 43, 254, 215, 171, 118,
    202, 130, 201, 125, 250, 89, 71, 240, 173, 212, 162, 175, 156, 164, 114, 192,
    183, 253, 147, 38, 54, 63, 247, 204, 52, 165, 229, 241, 113, 216, 49, 21,
    4, 199, 35, 195, 24, 150, 5, 154, 7, 18, 128, 226, 235, 39, 178, 117,
    9, 131, 44, 26, 27, 110, 90, 160, 82, 59, 214, 179, 41, 227, 47, 132,
    83, 209, 0, 237, 32, 252, 177, 91, 106, 203, 190, 57, 74, 76, 88, 207,
    208, 239, 170, 251, 67, 77, 51, 133, 69, 249, 2, 127, 80, 60, 159, 168,
    81, 163, 64, 143, 146, 157, 56, 245, 188, 182, 218, 33, 16, 255, 243, 210,
    205, 12, 19, 236, 95, 151, 68, 23, 196, 167, 126, 61, 100, 93, 25, 115,
    96, 129, 79, 220, 34, 42, 144, 136, 70, 238, 184, 20, 222, 94, 11, 219,
    224, 50, 58, 10, 73, 6, 36, 92, 194, 211, 172, 98, 145, 149, 228, 121,
    231, 200, 55, 109, 141, 213, 78, 169, 108, 86, 244, 234, 101, 122, 174, 8,
    186, 120, 37, 46, 28, 166, 180, 198, 232, 221, 116, 31, 75, 189, 139, 138,
    112, 62, 181, 102, 72, 3, 246, 14, 97, 53, 87, 185, 134, 193, 29, 158,
    225, 248, 152, 17, 105, 217, 142, 148, 155, 30, 135, 233, 206, 85, 40, 223,
    140, 161, 137, 13, 191, 230, 66, 104, 65, 153, 45, 15, 176, 84, 187, 22,
]);
const T0 = new Uint32Array(256), T1 = new Uint32Array(256), T2 = new Uint32Array(256), T3 = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    const s = SBOX[i], twice = ((s << 1) ^ ((s >>> 7) * 0x11b)) & 255;
    const word = (twice | (s << 8) | (s << 16) | ((twice ^ s) << 24)) >>> 0;
    T0[i] = word; T1[i] = (word << 8) | (word >>> 24);
    T2[i] = (word << 16) | (word >>> 16); T3[i] = (word << 24) | (word >>> 8);
}

export function decryptAegis(key, nonce, ciphertext, aad, variant) {
    const wide = variant === 128;
    if (key.length !== (wide ? 16 : 32) || nonce.length !== key.length || ciphertext.length < 32) {
        throw new Error("AEGIS input invalid");
    }
    const blocks = wide ? 8 : 6, words = wide ? 8 : 4, blockSize = words * 4;
    let state = new Uint32Array(blocks * 4), next = new Uint32Array(blocks * 4);
    const message = new Uint32Array(8), mask = new Uint32Array(8), finalBlock = new Uint32Array(4);
    const k = new Uint32Array(key.length / 4), n = new Uint32Array(nonce.length / 4);
    const keyView = new DataView(key.buffer, key.byteOffset, key.byteLength);
    const nonceView = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
    for (let i = 0; i < k.length; i++) { k[i] = keyView.getUint32(i * 4, true); n[i] = nonceView.getUint32(i * 4, true); }
    const update = (m0, m1 = m0) => {
        for (let block = 0; block < blocks; block++) {
            const source = ((block + blocks - 1) % blocks) * 4, dest = block * 4;
            const a = state[source], b = state[source + 1], c = state[source + 2], d = state[source + 3];
            next[dest] = T0[a & 255] ^ T1[(b >>> 8) & 255] ^ T2[(c >>> 16) & 255] ^ T3[d >>> 24] ^ state[dest];
            next[dest + 1] = T0[b & 255] ^ T1[(c >>> 8) & 255] ^ T2[(d >>> 16) & 255] ^ T3[a >>> 24] ^ state[dest + 1];
            next[dest + 2] = T0[c & 255] ^ T1[(d >>> 8) & 255] ^ T2[(a >>> 16) & 255] ^ T3[b >>> 24] ^ state[dest + 2];
            next[dest + 3] = T0[d & 255] ^ T1[(a >>> 8) & 255] ^ T2[(b >>> 16) & 255] ^ T3[c >>> 24] ^ state[dest + 3];
        }
        for (let i = 0; i < 4; i++) { next[i] ^= m0[i]; if (wide) next[16 + i] ^= m1[i]; }
        const previous = state; state = next; next = previous;
    };
    const message1 = wide ? message.subarray(4) : message;
    const absorb = () => update(message, message1);
    const length = ciphertext.length - 32, output = new Uint8Array(length);
    const inputView = new DataView(ciphertext.buffer, ciphertext.byteOffset, ciphertext.byteLength);
    const outputView = new DataView(output.buffer);
    try {
        if (wide) {
            for (let i = 0; i < 4; i++) {
                state[i] = state[16 + i] = k[i] ^ n[i]; state[4 + i] = state[12 + i] = C1[i];
                state[8 + i] = C0[i]; state[20 + i] = state[28 + i] = k[i] ^ C0[i]; state[24 + i] = k[i] ^ C1[i];
            }
            for (let i = 0; i < 10; i++) update(n, k);
        } else {
            for (let i = 0; i < 4; i++) {
                state[i] = k[i] ^ n[i]; state[4 + i] = k[4 + i] ^ n[4 + i];
                state[8 + i] = C1[i]; state[12 + i] = C0[i];
                state[16 + i] = k[i] ^ C0[i]; state[20 + i] = k[4 + i] ^ C1[i];
            }
            const k1 = k.subarray(4), kn0 = state.slice(0, 4), kn1 = state.slice(4, 8);
            for (let i = 0; i < 4; i++) { update(k); update(k1); update(kn0); update(kn1); }
            kn0.fill(0); kn1.fill(0);
        }
        for (let offset = 0; offset < aad.length; offset += blockSize) {
            message.fill(0);
            const size = Math.min(blockSize, aad.length - offset);
            for (let i = 0; i < size; i++) message[i >>> 2] |= aad[offset + i] << ((i & 3) * 8);
            absorb();
        }
        for (let offset = 0; offset < length; offset += blockSize) {
            for (let i = 0; i < 4; i++) {
                mask[i] = wide ? state[4 + i] ^ state[24 + i] ^ (state[8 + i] & state[12 + i])
                    : state[4 + i] ^ state[16 + i] ^ state[20 + i] ^ (state[8 + i] & state[12 + i]);
                if (wide) mask[4 + i] = state[8 + i] ^ state[20 + i] ^ (state[24 + i] & state[28 + i]);
            }
            const size = Math.min(blockSize, length - offset), fullWords = size >>> 2;
            message.fill(0);
            for (let i = 0; i < fullWords; i++) {
                const word = inputView.getUint32(offset + i * 4, true) ^ mask[i];
                message[i] = word; outputView.setUint32(offset + i * 4, word, true);
            }
            for (let i = fullWords * 4; i < size; i++) {
                const byte = ciphertext[offset + i] ^ ((mask[i >>> 2] >>> ((i & 3) * 8)) & 255);
                output[offset + i] = byte; message[i >>> 2] |= byte << ((i & 3) * 8);
            }
            absorb();
        }
        const finalOffset = wide ? 8 : 12;
        for (let i = 0; i < 4; i++) finalBlock[i] = state[finalOffset + i];
        finalBlock[0] ^= (aad.length * 8) >>> 0; finalBlock[1] ^= Math.floor(aad.length / 536870912);
        finalBlock[2] ^= (length * 8) >>> 0; finalBlock[3] ^= Math.floor(length / 536870912);
        for (let i = 0; i < 7; i++) update(finalBlock);
        const tag = new Uint8Array(32), tagView = new DataView(tag.buffer), half = wide ? 4 : 3;
        for (let i = 0; i < 8; i++) {
            let word = 0;
            for (let block = i < 4 ? 0 : half; block < (i < 4 ? half : blocks); block++) word ^= state[block * 4 + (i & 3)];
            tagView.setUint32(i * 4, word, true);
        }
        try { authenticate(tag, ciphertext.subarray(length), output); }
        finally { tag.fill(0); }
        return output;
    } catch (error) { output.fill(0); throw error; }
    finally { state.fill(0); next.fill(0); message.fill(0); mask.fill(0); finalBlock.fill(0); k.fill(0); n.fill(0); }
}
