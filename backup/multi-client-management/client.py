from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

class ClientBase(BaseModel):
    name: str
    description: Optional[str] = None

class ClientCreate(ClientBase):
    pass

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class ClientResponse(ClientBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

