"""Regenerate p08.json with an independent PyCryptodome AES-SIV oracle.
Run in a Python environment containing pycryptodome. All keys are test data.
"""
import base64
import json
import os
import struct
from pathlib import Path
from Crypto.Cipher import AES
from Crypto.Hash import SHA256
from Crypto.Protocol.KDF import HKDF

folder = Path(__file__).parent
image = (folder / "page.webp").read_bytes()
key, salt, iv = os.urandom(32), os.urandom(32), os.urandom(12)
prefix = b"IMGX\x04" + struct.pack(">II", 240, 160) + salt + iv
context = json.dumps(["IMGX-v4", "0123456789abcdef0123456789abcdef",
                      "chapters/manga-45/ch-1/001.js"], separators=(",", ":")).encode()
derived = HKDF(key, 64, salt, SHA256, context=b"IMGX-v4.envelope")
envelope = AES.new(derived[:32], AES.MODE_GCM, nonce=iv)
envelope.update(prefix + context)
encrypted, tag = envelope.encrypt_and_digest(bytes([8]) + struct.pack(">I", len(image)))
header = prefix + encrypted + tag
siv_key = HKDF(derived[32:], 64, bytes(32), SHA256, context=b"IMGX-v4.p08")
payload = AES.new(siv_key, AES.MODE_SIV)
payload.update(header + context)
ciphertext, tag = payload.encrypt_and_digest(image)
fixture = {"oracle": "PyCryptodome AES-SIV / AES-GCM / HKDF-SHA256",
           "key": base64.b64encode(key).decode(),
           "binary": base64.b64encode(header + tag + ciphertext).decode()}
(folder / "p08.json").write_text(json.dumps(fixture, indent=2) + "\n")
