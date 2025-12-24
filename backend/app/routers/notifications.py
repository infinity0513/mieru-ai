from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
import uuid
from ..database import get_db
from ..models.user import User
from ..utils.dependencies import get_current_user
from ..services.notification_service import NotificationService

router = APIRouter()

@router.get("/")
def get_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get notifications for current user"""
    notifications = NotificationService.get_user_notifications(
        current_user.id,
        unread_only,
        limit,
        db
    )
    
    return {
        "data": [
            {
                "id": str(n.id),
                "type": n.type,
                "title": n.title,
                "message": n.message,
                "data": n.data,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() + 'Z' if n.created_at else None
            }
            for n in notifications
        ]
    }

@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark notification as read"""
    NotificationService.mark_as_read(notification_id, current_user.id, db)
    return {"message": "Marked as read"}

@router.post("/read-all")
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark all notifications as read"""
    from ..models.notification import Notification
    
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({"is_read": True})
    
    db.commit()
    
    return {"message": "All notifications marked as read"}

@router.get("/unread-count")
def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get count of unread notifications"""
    from ..models.notification import Notification
    
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).count()
    
    return {"count": count}
