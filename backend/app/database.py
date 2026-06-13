from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

_engine = None
_session_factory = None


def get_engine():
    """Lazy engine creation - only connects when first needed."""
    global _engine, _session_factory
    if _engine is None:
        if not settings.DATABASE_URL:
            raise RuntimeError(
                "DATABASE_URL is not set! "
                "Add it to Railway environment variables."
            )
        
        db_url = settings.DATABASE_URL
        # Auto-convert synchronous Postgres scheme to asyncpg
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif db_url.startswith("postgresql://"):
            db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

        _engine = create_async_engine(
            db_url,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,  # Verify connection before using
            echo=False,
        )
        _session_factory = async_sessionmaker(
            _engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _engine


class Base(DeclarativeBase):
    pass


async def get_db():
    get_engine()  # Ensure engine is initialized
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
