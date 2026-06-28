from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import Settings
from database import get_db
from services.auth import hash_password, verify_password, create_token, verify_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


_stored_password_hash: str | None = None


def get_password_hash() -> str | None:
    return _stored_password_hash


def set_password_hash(h: str):
    global _stored_password_hash
    _stored_password_hash = h


def init_admin_password(settings: Settings):
    global _stored_password_hash
    if settings.admin_password:
        _stored_password_hash = hash_password(settings.admin_password)
    else:
        import secrets
        pwd = secrets.token_urlsafe(16)
        _stored_password_hash = hash_password(pwd)
        print(f"\n{'='*60}")
        print(f"  Aletheia admin password: {pwd}")
        print(f"  Save this — it won't be shown again.")
        print(f"{'='*60}\n")


@router.post("/login")
async def login(req: LoginRequest, settings: Settings = Depends(lambda: Settings())):
    if _stored_password_hash is None or not verify_password(req.password, _stored_password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_token(settings)
    return {"token": token}


@router.post("/change-password")
async def change_password(req: ChangePasswordRequest):
    global _stored_password_hash
    if _stored_password_hash is None or not verify_password(req.old_password, _stored_password_hash):
        raise HTTPException(status_code=401, detail="Invalid old password")
    _stored_password_hash = hash_password(req.new_password)
    return {"ok": True}