from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..models.user import User
from ..schemas.user import UserResponse, MetaAccountSettings, MetaAccountSettingsResponse
from ..utils.dependencies import get_current_user
from ..database import get_db

router = APIRouter()

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/me/meta-settings/", response_model=MetaAccountSettingsResponse)
def update_meta_settings(
    settings: MetaAccountSettings,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user's Meta account settings"""
    if settings.meta_account_id is not None:
        current_user.meta_account_id = settings.meta_account_id
    if settings.meta_access_token is not None:
        current_user.meta_access_token = settings.meta_access_token
    
    db.commit()
    db.refresh(current_user)
    
    return MetaAccountSettingsResponse(
        message="Metaアカウント設定を更新しました",
        meta_account_id=current_user.meta_account_id
    )

@router.get("/me/meta-settings/", response_model=MetaAccountSettings)
def get_meta_settings(
    current_user: User = Depends(get_current_user)
):
    """Get user's Meta account settings"""
    return MetaAccountSettings(
        meta_account_id=current_user.meta_account_id,
        meta_access_token=None  # セキュリティのため、トークンは返さない
    )
