from sqlalchemy import Column, Integer, Text, Float, ForeignKey
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class RelayStation(Base):
    __tablename__ = "relay_stations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    base_url = Column(Text, nullable=False)
    api_key_encrypted = Column(Text, nullable=False)
    schedule_enabled = Column(Integer, default=1)
    schedule_interval_hours = Column(Integer, default=6)
    status = Column(Text, default="unknown")
    last_probe_at = Column(Text, nullable=True)
    created_at = Column(Text, nullable=False)
    updated_at = Column(Text, nullable=False)

    probe_batches = relationship("ProbeBatch", back_populates="station", cascade="all, delete-orphan")


class ProbeBatch(Base):
    __tablename__ = "probe_batches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    station_id = Column(Integer, ForeignKey("relay_stations.id"), nullable=False)
    probed_at = Column(Text, nullable=False)
    total_models = Column(Integer, default=0)
    available_models = Column(Integer, default=0)
    unavailable_models = Column(Integer, default=0)
    models_json = Column(Text, nullable=True)
    duration_ms = Column(Integer, default=0)

    station = relationship("RelayStation", back_populates="probe_batches")
    model_results = relationship("ModelResult", back_populates="batch", cascade="all, delete-orphan")


class ModelResult(Base):
    __tablename__ = "model_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("probe_batches.id"), nullable=False)
    model_id = Column(Text, nullable=False)
    available = Column(Integer, default=0)
    ttft_ms = Column(Integer, default=-1)
    response_preview = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    authenticity_score = Column(Float, nullable=True)
    degradation_flags = Column(Text, nullable=True)

    batch = relationship("ProbeBatch", back_populates="model_results")