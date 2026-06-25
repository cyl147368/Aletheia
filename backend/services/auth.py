from datetime import datetime, timezone, timedelta

import bcrypt as _bcrypt
from jose import jwt, JWTError
from config import Settings


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(settings: Settings) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    return jwt.encode(
        {"sub": "admin", "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def verify_token(token: str, settings: Settings) -> bool:
    try:
        jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return True
    except JWTError:
        return False