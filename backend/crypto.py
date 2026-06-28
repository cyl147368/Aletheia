from cryptography.fernet import Fernet


class KeyCrypto:
    def __init__(self, key: str = ""):
        if key:
            self._key = key
            self._fernet = Fernet(key.encode())
        else:
            self._key = Fernet.generate_key().decode()
            self._fernet = Fernet(self._key.encode())

    @property
    def key(self) -> str:
        return self._key

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