from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from models import Base

engine = None
SessionLocal = None


async def init_db(database_url: str):
    global engine, SessionLocal
    engine = create_async_engine(database_url, echo=False)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        columns = await conn.execute(text("PRAGMA table_info(relay_stations)"))
        column_names = {row[1] for row in columns.fetchall()}
        if "official_url" not in column_names:
            await conn.execute(text("ALTER TABLE relay_stations ADD COLUMN official_url TEXT"))


async def get_db():
    async with SessionLocal() as session:
        yield session
