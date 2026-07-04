from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # MySQL
    MYSQL_HOST: str = "localhost"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "dr_user"
    MYSQL_PASSWORD: str = "dr_password"
    MYSQL_DB: str = "demand_response"

    # Telemetry store
    TELEMETRY_BACKEND: str = "sqlite"  # "sqlite" or "hbase"
    TELEMETRY_SQLITE_PATH: str = "./telemetry.db"
    HBASE_HOST: str = "localhost"
    HBASE_PORT: int = 9090

    # AI
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    AI_MODEL: str = "gemini-2.5-flash"

    # Relational Database URL (e.g. sqlite:///./main.db)
    DATABASE_URL: str = ""

    # Simulator
    SIM_TENANT_UID: str = "demo-utility"
    SIM_DEVICE_COUNT: int = 200
    SIM_INTERVAL_SECONDS: int = 45
    SIM_RANDOMNESS: float = 0.3

    # Recommendation engine
    RECOMMENDATION_INTERVAL_SECONDS: int = 300

    @property
    def SQLALCHEMY_DATABASE_URL(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DB}"
        )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
