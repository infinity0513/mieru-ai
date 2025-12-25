import pandas as pd
from datetime import date
from typing import List, Dict
from sqlalchemy.orm import Session
from ..models.campaign import Campaign, Upload
import uuid
import math

class DataService:
    @staticmethod
    def safe_int(value, default=0):
        """Safely convert value to int, handling NaN and None"""
        if value is None:
            return default
        if isinstance(value, str) and value.strip() == '':
            return default
        try:
            if pd.isna(value):
                return default
        except (TypeError, ValueError):
            pass
        try:
            # まずfloatに変換してNaNチェック
            float_val = float(value)
            if math.isnan(float_val) or math.isinf(float_val):
                return default
            # その後intに変換
            result = int(float_val)
            return result
        except (ValueError, TypeError, OverflowError):
            return default
    
    @staticmethod
    def safe_float(value, default=0.0):
        """Safely convert value to float, handling NaN and None"""
        if value is None:
            return default
        if isinstance(value, str) and value.strip() == '':
            return default
        try:
            if pd.isna(value):
                return default
        except (TypeError, ValueError):
            pass
        try:
            result = float(value)
            if math.isnan(result) or math.isinf(result):
                return default
            return result
        except (ValueError, TypeError, OverflowError):
            return default
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
            df = pd.read_csv(file_path, keep_default_na=False, na_values=['', 'nan', 'NaN', 'NaT', 'None', 'null'])
            # 空の行やNaNのみの行を削除
            df = df.dropna(how='all')
            # 日付が空の行を削除
            if '日付' in df.columns:
                df = df[df['日付'].notna()]
                df = df[df['日付'] != '']
                df = df[~df['日付'].astype(str).str.lower().isin(['nat', 'nan', 'none', 'null'])]
            # 数値カラムのNaNを0に置換
            numeric_columns = ['インプレッション', 'クリック数', '費用', 'コンバージョン数', 'リーチ', 'リーチ数', 
                             'エンゲージメント', 'エンゲージメント数', 'リンククリック', 'ランディングページビュー',
                             'コンバージョン価値', 'コンバージョン値']
            for col in numeric_columns:
                if col in df.columns:
                    df[col] = df[col].replace(['', 'nan', 'NaN', 'NaT', 'None', 'null'], 0)
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
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
            # Get values with defaults (safely handle NaN)
            # row.get()がNaNを返す可能性があるため、safe_int/safe_floatで直接処理
            # Meta CSVフォーマット対応: 複数の列名バリエーションをサポート
            impressions = DataService.safe_int(
                row.get('インプレッション') or row.get('impressions') or row.get('Impressions'), 0
            )
            clicks = DataService.safe_int(
                row.get('クリック数') or row.get('clicks') or row.get('Clicks') or row.get('クリック'), 0
            )
            cost = DataService.safe_float(
                row.get('費用') or row.get('cost') or row.get('Cost') or 
                row.get('消化金額 (JPY)') or row.get('消化金額') or row.get('Spend'), 0.0
            )
            # コンバージョン数: Meta CSVでは「結果」列に含まれる
            conversions = DataService.safe_int(
                row.get('コンバージョン数') or row.get('conversions') or row.get('Conversions') or 
                row.get('結果') or row.get('result'), 0
            )
            # Try multiple column name variations for conversion_value
            conversion_value = DataService.safe_float(
                row.get('コンバージョン価値') or row.get('コンバージョン値') or 
                row.get('conversion_value') or row.get('Conversion Value'), 0.0
            )
            # Additional engagement metrics (optional)
            reach = DataService.safe_int(
                row.get('リーチ') or row.get('リーチ数') or row.get('reach') or row.get('Reach'), 0
            )
            engagements = DataService.safe_int(
                row.get('エンゲージメント') or row.get('エンゲージメント数') or 
                row.get('engagements') or row.get('Engagements'), 0
            )
            link_clicks = DataService.safe_int(
                row.get('リンククリック') or row.get('link_clicks') or row.get('Link Clicks'), 0
            )
            landing_page_views = DataService.safe_int(
                row.get('ランディングページビュー') or row.get('landing_page_views') or 
                row.get('Landing Page Views'), 0
            )
            
            # Calculate metrics
            row_dict = {
                'impressions': impressions,
                'clicks': clicks,
                'cost': cost,
                'conversions': conversions,
                'conversion_value': conversion_value
            }
            metrics = DataService.calculate_metrics(row_dict)
            
            # Parse date - handle empty/NaT values
            # Meta CSVフォーマット対応: レポート開始日を使用
            date_value = (
                row.get('日付') or row.get('date') or row.get('Date') or 
                row.get('レポート開始日') or row.get('レポート終了日') or
                row.get('date_start') or row.get('date_end')
            )
            if pd.isna(date_value) or date_value == '' or str(date_value).lower() == 'nat':
                continue  # Skip rows with invalid dates
            try:
                campaign_date = pd.to_datetime(date_value).date()
            except (ValueError, TypeError):
                continue  # Skip rows with invalid dates
            
            # Handle NaN values in string fields
            # Meta CSVフォーマット対応
            campaign_name = str(
                row.get('キャンペーン名', '') or row.get('campaign_name', '') or 
                row.get('Campaign Name', '') or ''
            ).replace('nan', '').replace('NaN', '')
            ad_set_name = str(
                row.get('広告セット名', '') or row.get('ad_set_name', '') or 
                row.get('Ad Set Name', '') or row.get('広告セットの名前', '') or ''
            ).replace('nan', '').replace('NaN', '')
            ad_name = str(
                row.get('広告名', '') or row.get('ad_name', '') or 
                row.get('Ad Name', '') or row.get('広告の名前', '') or ''
            ).replace('nan', '').replace('NaN', '')
            
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
