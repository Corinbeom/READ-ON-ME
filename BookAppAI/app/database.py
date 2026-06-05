
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

Base = declarative_base()

# validate_prod_config() 이후 lifespan에서 init_db()를 호출해 설정
engine = None
async_session = None


def init_db() -> None:
    """DATABASE_URL이 설정된 뒤(lifespan 안)에 호출해야 한다."""
    global engine, async_session
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL 환경 변수가 설정되지 않았습니다. "
            ".env 파일 또는 시스템 환경 변수를 확인하세요."
        )
    echo = os.getenv("SQL_ECHO", "false").lower() == "true"
    engine = create_async_engine(url, echo=echo)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session
