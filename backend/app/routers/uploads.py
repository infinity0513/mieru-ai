from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from datetime import datetime
import os
import uuid
import pandas as pd
import base64
from typing import Optional
from ..database import get_db
from ..models.campaign import Upload, Campaign
from ..services.data_service import DataService
from ..utils.dependencies import get_current_user
from ..models.user import User

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/")
async def upload_file(
    fileBase64: str = Form(...),
    filename: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # n8nからのBase64文字列を受け取る場合
    # Validate file type
    if not filename.endswith(('.csv', '.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="CSVまたはExcelファイルのみサポートされています")
    
    # Create upload record
    upload = Upload(
        user_id=current_user.id,
        file_name=filename,
        file_size=0,
        status="processing"
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)
    
    # Save file
    file_path = os.path.join(UPLOAD_DIR, f"{upload.id}_{filename}")
    
    try:
        # Base64文字列をデコード
        content = base64.b64decode(fileBase64)
        
        # Save uploaded file
        with open(file_path, "wb") as f:
            f.write(content)
        
        upload.file_size = len(content)
        upload.file_url = file_path
        
        # Parse file
        if filename.endswith('.csv'):
            df = DataService.parse_csv_file(file_path)
        else:
            df = DataService.parse_excel_file(file_path)
        
        # Validate
        is_valid, error_msg = DataService.validate_dataframe(df)
        if not is_valid:
            upload.status = "error"
            upload.error_message = error_msg
            db.commit()
            raise HTTPException(status_code=400, detail=error_msg)
        
        # Check for duplicates before processing
        duplicate_count = 0
        for _, row in df.iterrows():
            # Handle empty/NaT dates
            date_value = row.get('日付', '')
            if pd.isna(date_value) or date_value == '' or str(date_value).lower() == 'nat':
                continue  # Skip rows with invalid dates
            try:
                campaign_date = pd.to_datetime(date_value).date()
            except (ValueError, TypeError):
                continue  # Skip rows with invalid dates
            
            # Handle NaN values in string fields
            campaign_name = str(row.get('キャンペーン名', '') or '').replace('nan', '').replace('NaN', '')
            ad_set_name = str(row.get('広告セット名', '') or '').replace('nan', '').replace('NaN', '')
            ad_name = str(row.get('広告名', '') or '').replace('nan', '').replace('NaN', '')
            
            existing = db.query(Campaign).filter(
                Campaign.user_id == current_user.id,
                Campaign.date == campaign_date,
                Campaign.campaign_name == campaign_name,
                Campaign.ad_set_name == ad_set_name,
                Campaign.ad_name == ad_name
            ).first()
            
            if existing:
                duplicate_count += 1
        
        # Process and save (duplicates will be updated)
        row_count = DataService.process_and_save_data(df, current_user.id, upload.id, db)
        
        # Get date range - filter out NaT values
        valid_dates = pd.to_datetime(df['日付'], errors='coerce').dropna()
        if len(valid_dates) > 0:
            upload.start_date = valid_dates.min().date()
            upload.end_date = valid_dates.max().date()
        else:
            raise HTTPException(status_code=400, detail="有効な日付データが見つかりませんでした")
        upload.row_count = row_count
        upload.status = "completed"
        upload.processed_at = datetime.utcnow()
        
        db.commit()
        
        # Create notification with duplicate info
        from ..services.notification_service import NotificationService
        if duplicate_count > 0:
            message = f"{upload.file_name} の処理が完了しました（{row_count}件のデータ、うち{duplicate_count}件は既存データを更新）"
        else:
            message = f"{upload.file_name} の処理が完了しました（{row_count}件のデータ）"
        
        NotificationService.create_notification(
            user_id=current_user.id,
            type="upload_complete",
            title="ファイルアップロードが完了しました",
            message=message,
            data={"upload_id": str(upload.id)},
            db=db
        )
        
        return {
            "id": str(upload.id),
            "file_name": upload.file_name,
            "row_count": row_count,
            "start_date": str(upload.start_date),
            "end_date": str(upload.end_date),
            "status": "completed"
        }
        
    except Exception as e:
        db.rollback()  # トランザクションをロールバック
        upload.status = "error"
        upload.error_message = str(e)
        try:
            db.commit()
        except:
            db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/")
def get_uploads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    uploads = db.query(Upload).filter(Upload.user_id == current_user.id).order_by(Upload.created_at.desc()).all()
    return uploads
