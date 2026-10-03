import test from "node:test";
import assert from "node:assert/strict";
import { decodeImgxV4 } from "../src/imgx-v4.js";
import { encryptImage, image, random, storageKey, imageId } from "./helpers.js";

for (let profile = 1; profile <= 10; profile++) {
    test(`p${String(profile).padStart(2,"0")} decrypts oracle data and rejects wrong keys, context and tampering`,async () => {
        const { key,binary } = await encryptImage(profile);
        assert.deepEqual(await decodeImgxV4(binary,key,storageKey,imageId),image);
        const damaged = binary.slice(); damaged[damaged.length-1] ^= 1;
        await assert.rejects(() => decodeImgxV4(damaged,key,storageKey,imageId));
        await assert.rejects(() => decodeImgxV4(binary,random(32),storageKey,imageId));
        await assert.rejects(() => decodeImgxV4(binary,key,"wrong/storage.js",imageId));
        await assert.rejects(() => decodeImgxV4(binary.subarray(0,binary.length-1),key,storageKey,imageId),{ code: "imgx_invalid_length" });
    });
}

test("secretstream restores multiple chunks and authenticates each chunk and final tag",async () => {
    const plaintext = random(65536);
    const large = new Uint8Array(2*262144+31);
    for (let i = 0; i < large.length; i++) large[i] = plaintext[i%plaintext.length];
    const { key,binary } = await encryptImage(5,large);
    assert.deepEqual(await decodeImgxV4(binary,key,storageKey,imageId),large);
    const changed = binary.slice(); changed[78+24+262144+1] ^= 1;
    await assert.rejects(() => decodeImgxV4(changed,key,storageKey,imageId));
});

test("AEGIS handles full and partial blocks with independent libsodium encryption",async () => {
    for (const profile of [9,10]) {
        for (const length of [1,15,16,17,31,32,33,63,64,65,257]) {
            const plain = random(length), { key,binary } = await encryptImage(profile,plain);
            assert.deepEqual(await decodeImgxV4(binary,key,storageKey,imageId),plain);
        }
    }
});
