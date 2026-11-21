from fastapi import APIRouter
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from uuid import uuid4

router = APIRouter(prefix="/projects", tags=["projects"])

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

@router.post("")
def create_project(payload: ProjectCreate):
    return {
        "id": str(uuid4()),
        "name": payload.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scenes": [],
    }
