from sqlalchemy.orm import Session
from sqlalchemy import desc
from ..models.notification import Notification
import uuid

class NotificationService:
    @staticmethod
    def create_notification(
        user_id: uuid.UUID,
        type: str,
        title: str,
        message: str,
        data: dict = None,
        db: Session = None
    ) -> Notification:
        """Create a new notification"""
        notification = Notification(
            id=uuid.uuid4(),
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            data=data or {},
            is_read=False
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)
        return notification
    
    @staticmethod
    def get_user_notifications(
        user_id: uuid.UUID,
        unread_only: bool = False,
        limit: int = 20,
        db: Session = None
    ) -> list[Notification]:
        """Get notifications for a user"""
        query = db.query(Notification).filter(Notification.user_id == user_id)
        
        if unread_only:
            query = query.filter(Notification.is_read == False)
        
        notifications = query.order_by(desc(Notification.created_at)).limit(limit).all()
        return notifications
    
    @staticmethod
    def mark_as_read(notification_id: uuid.UUID, user_id: uuid.UUID, db: Session):
        """Mark a notification as read"""
        notification = db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.user_id == user_id
        ).first()
        
        if notification:
            notification.is_read = True
            db.commit()
            db.refresh(notification)
        
        return notification
    
    @staticmethod
    def get_unread_count(user_id: uuid.UUID, db: Session) -> int:
        """Get count of unread notifications for a user"""
        count = db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False
        ).count()
        return count




