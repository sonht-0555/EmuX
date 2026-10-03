export function concat(...parts) {
    const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of parts) { result.set(part, offset); offset += part.length; }
    return result;
}
export function equal(a, b) {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
    return difference === 0;
}
export const xor = (a, b) => a.map((byte, i) => byte ^ b[i]);
export function authenticate(expected, supplied, plaintext) {
    if (!equal(expected, supplied)) {
        plaintext?.fill(0);
        throw new Error("IMGX authentication failed");
    }
}
