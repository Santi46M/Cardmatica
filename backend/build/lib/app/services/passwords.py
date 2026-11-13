"""Password hashing with scrypt (Python's standard library, no extra package).

scrypt is memory-hard, like Argon2: each guess costs 16 MB of memory and
several passes, which makes stolen hashes slow to crack. N=2^14, r=8, p=5 is
one of the OWASP-recommended equivalents (same strength as N=2^17, p=1) that
needs an eighth of the memory per login. The parameters travel
inside the stored value, so they can be raised later without breaking
existing accounts (needs_rehash tells when to upgrade one at login).
"""

import base64
import hashlib
import hmac
import secrets

# n = CPU/memory cost (power of two), r = block size, p = parallelism.
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 5
KEY_BYTES = 32
SALT_BYTES = 16
# hashlib refuses scrypt above this memory unless told; 128 · n · r · p plus headroom.
MAX_MEMORY = 64 * 1024 * 1024

MIN_LENGTH = 10
MAX_LENGTH = 200
# The most common passwords, refused outright even when long enough.
COMMON = {
    "1234567890",
    "12345678910",
    "contraseña",
    "contrasena",
    "contraseña1",
    "password123",
    "password1234",
    "qwertyuiop",
    "1q2w3e4r5t",
    "iloveyou12",
    "yugioh1234",
    "cardmatica",
}


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _derive(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(
        password.encode(), salt=salt, n=n, r=r, p=p, dklen=KEY_BYTES, maxmem=MAX_MEMORY
    )


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    key = _derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_encode(salt)}${_encode(key)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, key = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = _decode(key)
        actual = _derive(password, _decode(salt), int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def needs_rehash(stored: str) -> bool:
    return not stored.startswith(f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}$")


def password_problem(password: str, email: str) -> str | None:
    """A reason the password is not acceptable, in Spanish, or None."""
    if len(password) < MIN_LENGTH:
        return f"La contraseña debe tener al menos {MIN_LENGTH} caracteres."
    if len(password) > MAX_LENGTH:
        return f"La contraseña puede tener como máximo {MAX_LENGTH} caracteres."
    lowered = password.casefold()
    if lowered in COMMON or len(set(lowered)) < 4:
        return "Esa contraseña es demasiado fácil de adivinar."
    if lowered == email.casefold() or lowered == email.split("@")[0].casefold():
        return "La contraseña no puede ser tu correo."
    return None
