import pandas as pd
from datetime import date
from typing import List, Dict
from sqlalchemy.orm import Session
from ..models.campaign import Campaign, Upload
import uuid

class DataService:
    @staticmethod
    def calculate_metrics(row: Dict) -> Dict:
        """Calculate KPI metrics"""
        impressions = row.get('impressions', 0) or 0
        clicks = row.get('clicks', 0) or 0
        cost = float(row.get('cost', 0) or 0)
        conversions = row.get('conversions', 0) or 0
        
        # CTR
        ctr = (clicks / impressions * 100) if impressions > 0 else 0
        
        # CPC
        cpc = (cost / clicks) if clicks > 0 else 0
        
        # CPM
        cpm = (cost / impressions * 1000) if impressions > 0 else 0
        
        # CPA
        cpa = (cost / conversions) if conversions > 0 else 0
        
        # CVR
        cvr = (conversions / clicks * 100) if clicks > 0 else 0
        
        # ROAS
        conversion_value = float(row.get('conversion_value', 0) or 0)
        roas = (conversion_value / cost * 100) if cost > 0 else 0
        
        return {
            'ctr': round(ctr, 2),
            'cpc': round(cpc, 2),
            'cpm': round(cpm, 2),
            'cpa': round(cpa, 2),
            'cvr': round(cvr, 2),
            'roas': round(roas, 2)
        }
    
    @staticmethod
    def parse_csv_file(file_path: str) -> pd.DataFrame:
        """Parse CSV file"""
        try:
            df = pd.read_csv(file_path)
            return df
        except Exception as e:
            raise ValueError(f"CSVファイルの解析に失敗しました: {str(e)}")
    
    @staticmethod
    def parse_excel_file(file_path: str) -> pd.DataFrame:
        """Parse Excel file"""
        try:
            df = pd.read_excel(file_path)
            return df
        except Exception as e:
            raise ValueError(f"Excelファイルの解析に失敗しました: {str(e)}")
    
    @staticmethod
    def validate_dataframe(df: pd.DataFrame) -> tuple[bool, str]:
        """Validate required columns"""
        required_columns = [
            '日付', 'キャンペーン名', '広告セット名', '広告名',
            'インプレッション', 'クリック数', '費用', 'コンバージョン数'
        ]
        
        # Alternative column names (English)
        alt_columns = {
            'date': '日付',
            'campaign_name': 'キャンペーン名',
            'ad_set_name': '広告セット名',
            'ad_name': '広告名',
            'impressions': 'インプレッション',
            'clicks': 'クリック数',
            'cost': '費用',
            'conversions': 'コンバージョン数'
        }
        
        # Check for required columns
        missing_cols = []
        for col in required_columns:
            if col not in df.columns:
                # Check alternative names
                found = False
                for alt, jp in alt_columns.items():
                    if jp == col and alt in df.columns:
                        df.rename(columns={alt: jp}, inplace=True)
                        found = True
                        break
                if not found:
                    missing_cols.append(col)
        
        if missing_cols:
            return False, f"必須カラムが不足しています: {', '.join(missing_cols)}"
        
        return True, ""
    
    @staticmethod
    def process_and_save_data(
        df: pd.DataFrame,
        user_id: uuid.UUID,
        upload_id: uuid.UUID,
        db: Session
    ) -> int:
        """Process dataframe and save to database with duplicate check"""
        saved_count = 0
        updated_count = 0
        
        for _, row in df.iterrows():
            # Get values with defaults
            impressions = int(row.get('インプレッション', 0) or 0)
            clicks = int(row.get('クリック数', 0) or 0)
            cost = float(row.get('費用', 0) or 0)
            conversions = int(row.get('コンバージョン数', 0) or 0)
            # Try multiple column name variations for conversion_value
            conversion_value = float(row.get('コンバージョン価値', row.get('コンバージョン値', 0)) or 0)
            # Additional engagement metrics (optional)
            reach = int(row.get('リーチ', row.get('リーチ数', 0)) or 0)
            engagements = int(row.get('エンゲージメント', row.get('エンゲージメント数', 0)) or 0)
            link_clicks = int(row.get('リンククリック', 0) or 0)
            landing_page_views = int(row.get('ランディングページビュー', 0) or 0)
            
            # Calculate metrics
            row_dict = {
                'impressions': impressions,
                'clicks': clicks,
                'cost': cost,
                'conversions': conversions,
                'conversion_value': conversion_value
            }
            metrics = DataService.calculate_metrics(row_dict)
            
            # Parse date
            campaign_date = pd.to_datetime(row['日付']).date()
            campaign_name = str(row['キャンペーン名'])
            ad_set_name = str(row.get('広告セット名', '') or '')
            ad_name = str(row.get('広告名', '') or '')
            
            # Check for duplicate (same date, campaign_name, ad_set_name, ad_name)
            existing_campaign = db.query(Campaign).filter(
                Campaign.user_id == user_id,
                Campaign.date == campaign_date,
                Campaign.campaign_name == campaign_name,
                Campaign.ad_set_name == ad_set_name,
                Campaign.ad_name == ad_name
            ).first()
            
            if existing_campaign:
                # Update existing record
                existing_campaign.upload_id = upload_id
                existing_campaign.impressions = impressions
                existing_campaign.clicks = clicks
                existing_campaign.cost = cost
                existing_campaign.conversions = conversions
                existing_campaign.conversion_value = conversion_value
                existing_campaign.reach = reach
                existing_campaign.engagements = engagements
                existing_campaign.link_clicks = link_clicks
                existing_campaign.landing_page_views = landing_page_views
                existing_campaign.ctr = metrics['ctr']
                existing_campaign.cpc = metrics['cpc']
                existing_campaign.cpm = metrics['cpm']
                existing_campaign.cpa = metrics['cpa']
                existing_campaign.cvr = metrics['cvr']
                existing_campaign.roas = metrics['roas']
                updated_count += 1
            else:
                # Create new campaign record
                campaign = Campaign(
                    user_id=user_id,
                    upload_id=upload_id,
                    date=campaign_date,
                    campaign_name=campaign_name,
                    ad_set_name=ad_set_name,
                    ad_name=ad_name,
                    impressions=impressions,
                    clicks=clicks,
                    cost=cost,
                    conversions=conversions,
                    conversion_value=conversion_value,
                    reach=reach,
                    engagements=engagements,
                    link_clicks=link_clicks,
                    landing_page_views=landing_page_views,
                    **metrics
                )
                db.add(campaign)
                saved_count += 1
        
        db.commit()
        return saved_count + updated_count




from typing import List, Dict
from sqlalchemy.orm import Session
from ..models.campaign import Campaign, Upload
import uuid

class DataService:
    @staticmethod
    def calculate_metrics(row: Dict) -> Dict:
        """Calculate KPI metrics"""
        impressions = row.get('impressions', 0) or 0
        clicks = row.get('clicks', 0) or 0
        cost = float(row.get('cost', 0) or 0)
        conversions = row.get('conversions', 0) or 0
        
        # CTR
        ctr = (clicks / impressions * 100) if impressions > 0 else 0
        
        # CPC
        cpc = (cost / clicks) if clicks > 0 else 0
        
        # CPM
        cpm = (cost / impressions * 1000) if impressions > 0 else 0
        
        # CPA
        cpa = (cost / conversions) if conversions > 0 else 0
        
        # CVR
        cvr = (conversions / clicks * 100) if clicks > 0 else 0
        
        # ROAS
        conversion_value = float(row.get('conversion_value', 0) or 0)
        roas = (conversion_value / cost * 100) if cost > 0 else 0
        
        return {
            'ctr': round(ctr, 2),
            'cpc': round(cpc, 2),
            'cpm': round(cpm, 2),
            'cpa': round(cpa, 2),
            'cvr': round(cvr, 2),
            'roas': round(roas, 2)
        }
    
    @staticmethod
    def parse_csv_file(file_path: str) -> pd.DataFrame:
        """Parse CSV file"""
        try:
            df = pd.read_csv(file_path)
            return df
        except Exception as e:
            raise ValueError(f"CSVファイルの解析に失敗しました: {str(e)}")
    
    @staticmethod
    def parse_excel_file(file_path: str) -> pd.DataFrame:
        """Parse Excel file"""
        try:
            df = pd.read_excel(file_path)
            return df
        except Exception as e:
            raise ValueError(f"Excelファイルの解析に失敗しました: {str(e)}")
    
    @staticmethod
    def validate_dataframe(df: pd.DataFrame) -> tuple[bool, str]:
        """Validate required columns"""
        required_columns = [
            '日付', 'キャンペーン名', '広告セット名', '広告名',
            'インプレッション', 'クリック数', '費用', 'コンバージョン数'
        ]
        
        # Alternative column names (English)
        alt_columns = {
            'date': '日付',
            'campaign_name': 'キャンペーン名',
            'ad_set_name': '広告セット名',
            'ad_name': '広告名',
            'impressions': 'インプレッション',
            'clicks': 'クリック数',
            'cost': '費用',
            'conversions': 'コンバージョン数'
        }
        
        # Check for required columns
        missing_cols = []
        for col in required_columns:
            if col not in df.columns:
                # Check alternative names
                found = False
                for alt, jp in alt_columns.items():
                    if jp == col and alt in df.columns:
                        df.rename(columns={alt: jp}, inplace=True)
                        found = True
                        break
                if not found:
                    missing_cols.append(col)
        
        if missing_cols:
            return False, f"必須カラムが不足しています: {', '.join(missing_cols)}"
        
        return True, ""
    
    @staticmethod
    def process_and_save_data(
        df: pd.DataFrame,
        user_id: uuid.UUID,
        upload_id: uuid.UUID,
        db: Session
    ) -> int:
        """Process dataframe and save to database with duplicate check"""
        saved_count = 0
        updated_count = 0
        
        for _, row in df.iterrows():
            # Get values with defaults
            impressions = int(row.get('インプレッション', 0) or 0)
            clicks = int(row.get('クリック数', 0) or 0)
            cost = float(row.get('費用', 0) or 0)
            conversions = int(row.get('コンバージョン数', 0) or 0)
            # Try multiple column name variations for conversion_value
            conversion_value = float(row.get('コンバージョン価値', row.get('コンバージョン値', 0)) or 0)
            # Additional engagement metrics (optional)
            reach = int(row.get('リーチ', row.get('リーチ数', 0)) or 0)
            engagements = int(row.get('エンゲージメント', row.get('エンゲージメント数', 0)) or 0)
            link_clicks = int(row.get('リンククリック', 0) or 0)
            landing_page_views = int(row.get('ランディングページビュー', 0) or 0)
            
            # Calculate metrics
            row_dict = {
                'impressions': impressions,
                'clicks': clicks,
                'cost': cost,
                'conversions': conversions,
                'conversion_value': conversion_value
            }
            metrics = DataService.calculate_metrics(row_dict)
            
            # Parse date
            campaign_date = pd.to_datetime(row['日付']).date()
            campaign_name = str(row['キャンペーン名'])
            ad_set_name = str(row.get('広告セット名', '') or '')
            ad_name = str(row.get('広告名', '') or '')
            
            # Check for duplicate (same date, campaign_name, ad_set_name, ad_name)
            existing_campaign = db.query(Campaign).filter(
                Campaign.user_id == user_id,
                Campaign.date == campaign_date,
                Campaign.campaign_name == campaign_name,
                Campaign.ad_set_name == ad_set_name,
                Campaign.ad_name == ad_name
            ).first()
            
            if existing_campaign:
                # Update existing record
                existing_campaign.upload_id = upload_id
                existing_campaign.impressions = impressions
                existing_campaign.clicks = clicks
                existing_campaign.cost = cost
                existing_campaign.conversions = conversions
                existing_campaign.conversion_value = conversion_value
                existing_campaign.reach = reach
                existing_campaign.engagements = engagements
                existing_campaign.link_clicks = link_clicks
                existing_campaign.landing_page_views = landing_page_views
                existing_campaign.ctr = metrics['ctr']
                existing_campaign.cpc = metrics['cpc']
                existing_campaign.cpm = metrics['cpm']
                existing_campaign.cpa = metrics['cpa']
                existing_campaign.cvr = metrics['cvr']
                existing_campaign.roas = metrics['roas']
                updated_count += 1
            else:
                # Create new campaign record
                campaign = Campaign(
                    user_id=user_id,
                    upload_id=upload_id,
                    date=campaign_date,
                    campaign_name=campaign_name,
                    ad_set_name=ad_set_name,
                    ad_name=ad_name,
                    impressions=impressions,
                    clicks=clicks,
                    cost=cost,
                    conversions=conversions,
                    conversion_value=conversion_value,
                    reach=reach,
                    engagements=engagements,
                    link_clicks=link_clicks,
                    landing_page_views=landing_page_views,
                    **metrics
                )
                db.add(campaign)
                saved_count += 1
        
        db.commit()
        return saved_count + updated_count
