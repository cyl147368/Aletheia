import os
from cryptography.fernet import Fernet


class KeyCrypto:
    def __init__(self, key: str = ""):
        if key:
            self._fernet = Fernet(key.encode() if isinstance(key, str) else key)
        else:
            self._fernet = Fernet(Fernet.generate_key())

    @property
    def key(self) -> str:
        return self._fernet._signing_key.decode() if hasattr(self._fernet, '_signing_key') else ""

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        return self._fernet.decrypt(ciphertext.encode()).decode()


_crypto: KeyCrypto | None = None


def get_crypto() -> KeyCrypto:
    global _crypto
    if _crypto is None:
        raise RuntimeError("KeyCrypto not initialized")
    return _crypto


def init_crypto(key: str = "") -> KeyCrypto:
    global _crypto
    if key:
        _crypto = KeyCrypto(key)
    else:
        _crypto = KeyCrypto()
    return _crypto