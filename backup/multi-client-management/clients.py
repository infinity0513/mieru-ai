from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models.client import Client
from ..models.user import User
from ..schemas.client import ClientCreate, ClientUpdate, ClientResponse
from ..utils.dependencies import get_current_user

router = APIRouter()

@router.post("/", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(
    client_data: ClientCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new client/company"""
    # Check if client name already exists for this user
    existing = db.query(Client).filter(
        Client.user_id == current_user.id,
        Client.name == client_data.name
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail="この名前のクライアントは既に存在します"
        )
    
    client = Client(
        user_id=current_user.id,
        name=client_data.name,
        description=client_data.description
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    
    return client

@router.get("/", response_model=List[ClientResponse])
def get_clients(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all clients for the current user"""
    clients = db.query(Client).filter(
        Client.user_id == current_user.id
    ).order_by(Client.created_at.desc()).all()
    
    return clients

@router.get("/{client_id}", response_model=ClientResponse)
def get_client(
    client_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific client"""
    import uuid
    try:
        client_uuid = uuid.UUID(client_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="無効なクライアントIDです")
    
    client = db.query(Client).filter(
        Client.id == client_uuid,
        Client.user_id == current_user.id
    ).first()
    
    if not client:
        raise HTTPException(status_code=404, detail="クライアントが見つかりません")
    
    return client

@router.put("/{client_id}", response_model=ClientResponse)
def update_client(
    client_id: str,
    client_data: ClientUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a client"""
    import uuid
    try:
        client_uuid = uuid.UUID(client_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="無効なクライアントIDです")
    
    client = db.query(Client).filter(
        Client.id == client_uuid,
        Client.user_id == current_user.id
    ).first()
    
    if not client:
        raise HTTPException(status_code=404, detail="クライアントが見つかりません")
    
    # Check name uniqueness if name is being updated
    if client_data.name and client_data.name != client.name:
        existing = db.query(Client).filter(
            Client.user_id == current_user.id,
            Client.name == client_data.name,
            Client.id != client_uuid
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail="この名前のクライアントは既に存在します"
            )
    
    # Update fields
    if client_data.name is not None:
        client.name = client_data.name
    if client_data.description is not None:
        client.description = client_data.description
    
    db.commit()
    db.refresh(client)
    
    return client

@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(
    client_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a client"""
    import uuid
    try:
        client_uuid = uuid.UUID(client_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="無効なクライアントIDです")
    
    client = db.query(Client).filter(
        Client.id == client_uuid,
        Client.user_id == current_user.id
    ).first()
    
    if not client:
        raise HTTPException(status_code=404, detail="クライアントが見つかりません")
    
    db.delete(client)
    db.commit()
    
    return None

