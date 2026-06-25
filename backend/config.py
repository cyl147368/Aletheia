from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///data/aletheia.db"
    encryption_key: str = ""
    admin_password: str = ""
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 72
    default_probe_interval_hours: int = 6
    probe_concurrency: int = 5
    probe_timeout_seconds: int = 30
    probe_prompt: str = "hi"
    probe_max_tokens: int = 5

    model_config = {"env_prefix": "ALETHEIA_", "env_file": ".env"}