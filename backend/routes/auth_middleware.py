from fastapi import APIRouter, Depends, HTTPException, Header
from config import Settings
from services.auth import verify_token

router = APIRouter()


async def require_auth(
    authorization: str = Header(None),
    settings: Settings = Depends(lambda: Settings()),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.removeprefix("Bearer ")
    if not verify_token(token, settings):
        raise HTTPException(status_code=401, detail="Invalid token")
    return True