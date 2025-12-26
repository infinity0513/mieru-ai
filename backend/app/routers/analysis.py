from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, date as date_type
from typing import Optional
from ..database import get_db
from ..models.analysis import AnalysisResult
from ..models.user import User
from ..models.campaign import Campaign
from ..utils.dependencies import get_current_user
from ..services.ai_service import AIAnalysisService
from sqlalchemy import func
import uuid

router = APIRouter()

def perform_analysis_task(
    analysis_id: uuid.UUID,
    user_id: uuid.UUID,
    start_date: date_type,
    end_date: date_type,
    campaign_name: Optional[str] = None
):
    """Background task to perform AI analysis"""
    from ..database import SessionLocal
    
    db = SessionLocal()
    try:
        # Get campaign data
        query = db.query(Campaign).filter(
            Campaign.user_id == user_id,
            Campaign.date >= start_date,
            Campaign.date <= end_date
        )
        
        # Filter by campaign name if provided
        if campaign_name:
            query = query.filter(Campaign.campaign_name == campaign_name)
        
        # データの重複排除: キャンペーンレベルのみを使用
        from sqlalchemy import or_
        query = query.filter(
            or_(
                Campaign.ad_set_name == '',
                Campaign.ad_set_name.is_(None)
            )
        )
        
        # Get summary - 16項目すべてを取得
        result = query.with_entities(
            func.sum(Campaign.impressions).label('total_impressions'),
            func.sum(Campaign.clicks).label('total_clicks'),
            func.sum(Campaign.cost).label('total_cost'),
            func.sum(Campaign.conversions).label('total_conversions'),
            func.sum(Campaign.conversion_value).label('total_conversion_value'),
            func.sum(Campaign.reach).label('total_reach'),
            func.sum(Campaign.engagements).label('total_engagements'),
            func.sum(Campaign.link_clicks).label('total_link_clicks'),
            func.sum(Campaign.landing_page_views).label('total_landing_page_views')
        ).first()
        
        total_impressions = int(result.total_impressions or 0)
        total_clicks = int(result.total_clicks or 0)
        total_cost = float(result.total_cost or 0)
        total_conversions = int(result.total_conversions or 0)
        total_conversion_value = float(result.total_conversion_value or 0)
        total_reach = int(result.total_reach or 0)
        total_engagements = int(result.total_engagements or 0)
        total_link_clicks = int(result.total_link_clicks or 0)
        total_landing_page_views = int(result.total_landing_page_views or 0)
        
        # 16項目すべてを計算（Meta広告マネージャの定義に合わせる）
        # CTR = (clicks / impressions) * 100（clicksはinline_link_clicks）
        ctr = (total_clicks / total_impressions * 100) if total_impressions > 0 else 0
        # CPC = cost / clicks
        cpc = (total_cost / total_clicks) if total_clicks > 0 else 0
        # CPA = cost / conversions
        cpa = (total_cost / total_conversions) if total_conversions > 0 else 0
        # CVR = (conversions / clicks) * 100
        cvr = (total_conversions / total_clicks * 100) if total_clicks > 0 else 0
        # ROAS = conversion_value / cost（比率、パーセンテージではない）
        roas = (total_conversion_value / total_cost) if total_cost > 0 else 0
        # CPM = (cost / impressions) * 1000
        cpm = (total_cost / total_impressions * 1000) if total_impressions > 0 else 0
        # Frequency = impressions / reach
        frequency = (total_impressions / total_reach) if total_reach > 0 else 0
        # Engagement Rate = (engagements / impressions) * 100
        engagement_rate = (total_engagements / total_impressions * 100) if total_impressions > 0 else 0
        
        summary = {
            "period": {
                "start_date": str(start_date),
                "end_date": str(end_date)
            },
            "totals": {
                "impressions": total_impressions,
                "clicks": total_clicks,
                "cost": total_cost,
                "conversions": total_conversions,
                "conversion_value": total_conversion_value,
                "reach": total_reach,
                "engagements": total_engagements,
                "link_clicks": total_link_clicks,
                "landing_page_views": total_landing_page_views
            },
            "averages": {
                "ctr": ctr,
                "cpc": cpc,
                "cpa": cpa,
                "cvr": cvr,
                "roas": roas,
                "cpm": cpm,
                "frequency": frequency,
                "engagement_rate": engagement_rate
            }
        }
        
        # Get top and bottom campaigns (only if not campaign-specific)
        top_campaigns = []
        bottom_campaigns = []
        if not campaign_name:
            campaigns = query.with_entities(
                Campaign.campaign_name,
                func.sum(Campaign.cost).label('cost'),
                func.sum(Campaign.conversions).label('conversions'),
                func.sum(Campaign.conversion_value).label('conversion_value')
            ).group_by(Campaign.campaign_name).all()
            
            campaign_list = []
            for c in campaigns:
                cost = float(c.cost or 0)
                conversions = int(c.conversions or 0)
                conversion_value = float(c.conversion_value or 0)
                # ROAS = conversion_value / cost（比率、パーセンテージではない）
                roas = (conversion_value / cost) if cost > 0 else 0
                cpa = (cost / conversions) if conversions > 0 else 0
                
                campaign_list.append({
                    "campaign_name": c.campaign_name,
                    "cost": cost,
                    "conversions": conversions,
                    "roas": roas,
                    "cpa": cpa
                })
            
            campaign_list.sort(key=lambda x: x['roas'], reverse=True)
            top_campaigns = campaign_list[:3]
            bottom_campaigns = list(reversed(campaign_list[-3:]))
        
        # Prepare AI prompt
        prompt = AIAnalysisService.prepare_analysis_data(
            summary, top_campaigns, bottom_campaigns, {}
        )
        
        # Add campaign-specific context to prompt if applicable
        if campaign_name:
            prompt = f"【分析対象キャンペーン】\n{campaign_name}\n\n" + prompt
        
        # Call AI
        import asyncio
        print(f"[Analysis] Starting AI analysis for analysis_id: {analysis_id}")
        try:
            ai_result = asyncio.run(AIAnalysisService.analyze_campaigns(prompt))
            print(f"[Analysis] AI result received: overall_rating={ai_result.get('overall_rating')}, issues_count={len(ai_result.get('issues', []))}, recommendations_count={len(ai_result.get('recommendations', []))}, action_plan_count={len(ai_result.get('action_plan', []))}")
        except Exception as ai_error:
            print(f"[Analysis] AI analysis failed: {ai_error}")
            raise
        
        # Update analysis result
        analysis = db.query(AnalysisResult).filter(AnalysisResult.id == analysis_id).first()
        if analysis:
            analysis.overall_rating = ai_result.get('overall_rating')
            analysis.overall_comment = ai_result.get('overall_comment')
            analysis.issues = ai_result.get('issues', [])
            analysis.recommendations = ai_result.get('recommendations', [])
            analysis.action_plan = ai_result.get('action_plan', [])
            print(f"[Analysis] Updated analysis result: issues={analysis.issues}, recommendations={analysis.recommendations}, action_plan={analysis.action_plan}")
            analysis.raw_data = summary
            if campaign_name:
                analysis.campaign_name = campaign_name
            analysis.status = "completed"
            db.commit()
            
            # Create notification
            try:
                from ..services.notification_service import NotificationService
                campaign_text = f"キャンペーン「{campaign_name}」の" if campaign_name else ""
                NotificationService.create_notification(
                    user_id=user_id,
                    type="analysis_complete",
                    title="AI分析が完了しました",
                    message=f"{campaign_text}期間 {start_date} 〜 {end_date} の分析が完了しました",
                    data={"analysis_id": str(analysis_id)},
                    db=db
                )
            except Exception as notif_error:
                # Log notification error but don't fail the analysis
                print(f"Failed to create notification: {notif_error}")
        
    except Exception as e:
        # Update with error
        analysis = db.query(AnalysisResult).filter(AnalysisResult.id == analysis_id).first()
        if analysis:
            analysis.status = "error"
            analysis.error_message = str(e)
            db.commit()
    finally:
        db.close()

@router.post("/")
async def create_analysis(
    background_tasks: BackgroundTasks,
    start_date: Optional[date_type] = Query(None),
    end_date: Optional[date_type] = Query(None),
    campaign_name: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create new AI analysis (overall or campaign-specific)"""
    
    # Default to last 30 days
    if not start_date:
        start_date = date_type.today() - timedelta(days=30)
    if not end_date:
        end_date = date_type.today()
    
    # Check user plan limits (FREE plan: 3 analyses per month)
    if current_user.plan == "FREE":
        # Count analyses this month
        this_month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        analysis_count = db.query(AnalysisResult).filter(
            AnalysisResult.user_id == current_user.id,
            AnalysisResult.created_at >= this_month_start
        ).count()
        
        if analysis_count >= 3:
            raise HTTPException(
                status_code=403,
                detail="月間の分析回数制限に達しました。Proプランにアップグレードしてください。"
            )
    
    # Create analysis record
    analysis = AnalysisResult(
        user_id=current_user.id,
        analysis_period_start=datetime.combine(start_date, datetime.min.time()),
        analysis_period_end=datetime.combine(end_date, datetime.max.time()),
        campaign_name=campaign_name,  # None for overall, campaign name for campaign-specific
        status="processing"
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    
    # Add background task
    background_tasks.add_task(
        perform_analysis_task,
        analysis.id,
        current_user.id,
        start_date,
        end_date,
        campaign_name
    )
    
    return {
        "id": str(analysis.id),
        "status": "processing",
        "message": "Analysis started. This may take a minute."
    }

@router.get("/")
def get_analyses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all analyses for current user"""
    analyses = db.query(AnalysisResult).filter(
        AnalysisResult.user_id == current_user.id
    ).order_by(AnalysisResult.created_at.desc()).all()
    
    return {"data": analyses}

@router.get("/{analysis_id}")
def get_analysis(
    analysis_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get specific analysis result"""
    analysis = db.query(AnalysisResult).filter(
        AnalysisResult.id == analysis_id,
        AnalysisResult.user_id == current_user.id
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    return analysis

@router.get("/status/{analysis_id}")
def get_analysis_status(
    analysis_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get analysis status (for polling)"""
    analysis = db.query(AnalysisResult).filter(
        AnalysisResult.id == analysis_id,
        AnalysisResult.user_id == current_user.id
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    return {
        "id": str(analysis.id),
        "status": analysis.status,
        "error_message": analysis.error_message,
        "overall_rating": analysis.overall_rating,
        "overall_comment": analysis.overall_comment,
        "issues": analysis.issues,
        "recommendations": analysis.recommendations,
        "action_plan": analysis.action_plan,
        "created_at": analysis.created_at,
        "campaign_name": analysis.campaign_name,
        "raw_data": analysis.raw_data
    }

@router.delete("/{analysis_id}")
def delete_analysis(
    analysis_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete analysis"""
    analysis = db.query(AnalysisResult).filter(
        AnalysisResult.id == analysis_id,
        AnalysisResult.user_id == current_user.id
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    db.delete(analysis)
    db.commit()
    
    return {"message": "Analysis deleted"}
