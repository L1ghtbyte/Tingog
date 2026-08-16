import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()

    # Reset escalation.py's module-level cluster-tracking state — it's process-local by
    # design (see escalation.py's docstring), but that means it persists ACROSS tests
    # sharing this process unless reset per-test, which would make cluster-detection
    # tests order-dependent on each other.
    from app import escalation

    escalation._last_seen_cluster_keys = set()

    try:
        yield session
    finally:
        session.close()
