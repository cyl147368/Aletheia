import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from config import Settings
from database import init_db
from crypto import init_crypto
from routes.auth import router as auth_router, init_admin_password
from routes.stations import router as stations_router
from routes.probe import router as probe_router
from routes.settings import router as settings_router
from services.scheduler import init_scheduler
from database import SessionLocal
from static_files import SPAStaticFiles

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aletheia")

settings = Settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs("data", exist_ok=True)
    await init_db(settings.database_url)

    if settings.encryption_key:
        init_crypto(settings.encryption_key)
    else:
        crypto = init_crypto()
        logger.warning("No ALETHEIA_ENCRYPTION_KEY set — auto-generated:")
        logger.warning(f"  ALETHEIA_ENCRYPTION_KEY={crypto.key}")

    if settings.jwt_secret:
        pass
    else:
        import secrets
        settings.jwt_secret = secrets.token_urlsafe(32)
        logger.warning("No ALETHEIA_JWT_SECRET set — auto-generated.")

    init_admin_password(settings)

    init_scheduler(SessionLocal, settings)

    yield

    # Shutdown
    from services.scheduler import scheduler
    scheduler.shutdown(wait=False)


app = FastAPI(title="Aletheia", lifespan=lifespan)

app.include_router(auth_router)
app.include_router(stations_router)
app.include_router(probe_router)
app.include_router(settings_router)


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.api_route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def api_root_not_found():
    raise HTTPException(status_code=404, detail="Not Found")


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def api_not_found(path: str):
    raise HTTPException(status_code=404, detail="Not Found")


# 前端静态文件（支持镜像内复制和仓库目录挂载两种部署方式）
backend_dir = os.path.dirname(__file__)
static_candidates = [
    os.path.join(backend_dir, "frontend", "dist"),
    os.path.join(os.path.dirname(backend_dir), "frontend", "dist"),
]
static_dir = next((path for path in static_candidates if os.path.isdir(path)), None)
if static_dir:
    app.mount("/", SPAStaticFiles(directory=static_dir, html=True), name="static")
