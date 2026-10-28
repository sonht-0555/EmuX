import { decodeImgxV3 } from "../imgx-v3.js";
import { decodeImgxV4 } from "../imgx-v4.js";

const protocol = "emux-imgx-v1";
function key(value) {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("Invalid IMGX key");
    return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/") + "="), char => char.charCodeAt(0));
}
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
    queue = queue.then(async () => {
        const { id, bytes, drm } = data || {};
        let k, k3, binary, output;
        try {
            if (!Number.isSafeInteger(id) || !(bytes instanceof ArrayBuffer) || bytes.byteLength > 68157481
                || drm?.type !== protocol) throw new Error("Invalid IMGX task");
            binary = new Uint8Array(bytes);
            k = key(drm.k); k3 = key(drm.k3);
            if (binary[4] === 3) output = await decodeImgxV3(binary, k3, drm.storageKey, drm.imageId, k);
            else if (binary[4] === 4) output = await decodeImgxV4(binary, k, drm.storageKey, drm.imageId);
            else throw new Error("Unsupported IMGX version");
            if (output.length < 12 || new TextDecoder().decode(output.subarray(0, 4)) !== "RIFF"
                || new TextDecoder().decode(output.subarray(8, 12)) !== "WEBP") throw new Error("Invalid decoded WebP");
            // Transfer only plaintext. Keys are never included in responses or errors.
            const result = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
            self.postMessage({ id, bytes: result }, [result]);
        } catch {
            self.postMessage({ id, error: "Không thể xác thực hoặc giải mã ảnh IMGX trên thiết bị." });
        } finally {
            k?.fill(0); k3?.fill(0); binary?.fill(0); output?.fill(0);
            if (drm) { delete drm.k; delete drm.k3; }
        }
    });
};
self.postMessage({ ready: protocol });
