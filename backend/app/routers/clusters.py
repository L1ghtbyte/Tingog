from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.clustering import get_active_clusters
from app.routers.puroks import get_db
from app.schemas import ClusterOut

router = APIRouter(prefix="/api", tags=["clusters"])


@router.get("/clusters", response_model=list[ClusterOut])
def get_clusters(db: Session = Depends(get_db)):
    """Public exposure of the same clustering logic the Briefing Agent's
    get_active_clusters tool already uses — needed for the dashboard map's cluster
    overlay, which must be driven by real inference output, not a rendering trick."""
    return get_active_clusters(db)
