# Third-party references and licenses

The IMGX V4 profile layout and JavaScript adaptations in `src/crypto/aegis.js`,
`src/crypto/aes-siv.js`, and `src/crypto/secretstream.js` are based on the MoeTruyen
extension in [Keiyoushi extensions-source](https://github.com/keiyoushi/extensions-source/tree/main/src/vi/moetruyen/src/eu/kanade/tachiyomi/extension/vi/moetruyen),
retrieved on 2026-10-03. That project is licensed under Apache-2.0.

Referenced files: `ImgxCrypto.kt`, `ImgxAccessClient.kt`, `cipher/Aegis256.kt`,
`cipher/Aegis128l.kt`, `cipher/AesSiv.kt`, `cipher/XChaCha20Poly1305.kt`, and
`cipher/AesCbcHmac.kt`. Adaptations use JavaScript typed arrays and Noble primitives,
retain authentication before returning plaintext, and wipe temporary key material.
The upstream Apache-2.0 license is reproduced in `licenses/Keiyoushi-Apache-2.0.txt`.

`@noble/ciphers` 1.3.0 (MIT) supplies ChaCha20-Poly1305, XChaCha20-Poly1305,
XSalsa20-Poly1305, AES-GCM-SIV, AES-ECB and AES-CTR. Its license is included in the
installed package. AES-SIV here is RFC 5297 and is distinct from Noble 1.x's `siv`
alias, which denotes AES-GCM-SIV.

`libsodium-wrappers-sumo` is a development dependency used as an independent
encryption oracle in tests. It is not imported by the Worker or included in its
production bundle. The static p08 fixture was generated independently with
PyCryptodome; `test/fixtures/generate-p08.py` documents regeneration.
