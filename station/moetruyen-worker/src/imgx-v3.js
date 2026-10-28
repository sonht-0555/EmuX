// V3 AES-GCM and the nested IMX4 container follow Keiyoushi ImgxCrypto.kt.
// See THIRD_PARTY_NOTICES.md.
import { ReaderError } from "./errors.js";
import { decodeImgxV4 } from "./imgx-v4.js";

const encode = new TextEncoder();
const fourCc = (bytes, offset) => new TextDecoder().decode(bytes.subarray(offset, offset + 4));

export function extractImx4(bytes) {
    if (bytes.length < 12 || fourCc(bytes, 0) !== "RIFF" || fourCc(bytes, 8) !== "WEBP") return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const invalid = () => new ReaderError("imgx_invalid_container", "IMGX WebP container invalid");
    if (bytes.length > 68157440 || view.getUint32(4, true) + 8 !== bytes.length) throw invalid();
    let payload = null, chunks = 0;
    for (let offset = 12; offset < bytes.length;) {
        if (++chunks > 1024 || offset + 8 > bytes.length) throw invalid();
        const size = view.getUint32(offset + 4, true), end = offset + 8 + size;
        const paddedEnd = end + (size & 1);
        if (paddedEnd > bytes.length) throw invalid();
        if (fourCc(bytes, offset) === "IMX4") {
            if (payload || size <= 78 || fourCc(bytes, offset + 8) !== "IMGX" || bytes[offset + 12] !== 4) throw invalid();
            payload = bytes.subarray(offset + 8, end);
        }
        offset = paddedEnd;
    }
    return payload;
}

export async function decodeImgxV3(binary, key, storageKey, imageId, v4Key) {
    if (!(binary instanceof Uint8Array) || binary.length <= 41 || binary.length > 68157481
        || fourCc(binary, 0) !== "IMGX" || binary[4] !== 3
        || !(key instanceof Uint8Array) || key.length !== 32) {
        throw new ReaderError("imgx_invalid_payload", "IMGX V3 image or key invalid");
    }
    const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    const width = view.getUint32(5), height = view.getUint32(9);
    if (!width || !height || width > 65535 || height > 65535 || width * height > 1e8) {
        throw new ReaderError("imgx_invalid_dimensions", "IMGX V3 dimensions invalid");
    }
    const storage = String(storageKey || "").trim().replace(/^\/+/, "");
    if (!/^[a-f0-9]{32}$/.test(imageId) || !storage || storage.length > 2048) {
        throw new ReaderError("imgx_invalid_context", "IMGX V3 image context invalid");
    }
    const imported = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
    const intermediate = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM",
        iv: binary.subarray(13, 25), tagLength: 128,
        additionalData: encode.encode(["IMGX-v3", imageId, storage, width, height].join("."))
    }, imported, binary.subarray(25)));
    let returned = false;
    try {
        const nested = extractImx4(intermediate);
        if (!nested) { returned = true; return intermediate; }
        if (!v4Key) throw new ReaderError("v4_key_missing", "IMGX V3 contains V4 data but its V4 key is missing");
        return await decodeImgxV4(nested, v4Key, storage, imageId);
    } finally {
        if (!returned) intermediate.fill(0);
    }
}
