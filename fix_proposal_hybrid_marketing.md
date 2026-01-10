# ハイブリッドマーケティング・ハイブリッドマーケティング１ リーチデータ取得問題 修正案

## 問題の整理

1. **日別のリーチデータがしっかり取得できていない**
   - ハイブリッドマーケティング
   - ハイブリッドマーケティング１

2. **ユニークリーチもしっかりできていない**
   - 同じキャンペーン

## 原因の特定

### 問題1: 日次データ取得の不完全性

**考えられる原因**:
1. Meta APIからの日次データ取得が不完全
   - `time_increment=1`が正しく動作していない可能性
   - ページネーション処理が不完全な可能性
   - 特定のキャンペーンだけデータが取得できていない可能性

2. データベースへの保存が不完全
   - 日次データが正しく保存されていない
   - データの重複や不整合

### 問題2: ユニークリーチのマッピングエラー

**考えられる原因**:
1. キャンペーン名の不一致
   - Meta APIから取得したキャンペーン名と、日次データのキャンペーン名が完全に一致していない
   - 全角・半角の違い、スペースの違い、特殊文字の違い

2. マッピングのタイミング
   - 期間別ユニークリーチの取得が、日次データの取得の前に行われている
   - マッピングが正しく行われていない

## 修正案

### 修正案1: 日次データ取得の強化と検証

#### 1.1 Meta API同期処理の改善

**場所**: `backend/app/routers/meta_api.py`

**修正内容**:
1. **日次データ取得の検証を強化**
   - 各キャンペーンごとに取得した日次データの件数をログ出力
   - 期待される日数と実際に取得した日数の差を検証
   - 特定のキャンペーン（ハイブリッドマーケティング、ハイブリッドマーケティング１）のデータ取得を詳細にログ出力

2. **ページネーション処理の改善**
   - すべてのページが正しく取得されているか確認
   - ページネーションエラーのハンドリングを改善

3. **エラーハンドリングの改善**
   - 特定のキャンペーンでエラーが発生した場合、そのキャンペーンだけをスキップして続行
   - エラーが発生したキャンペーンのリストを返す

**修正コード例**:
```python
# Line 305-350付近: 日次データ取得の検証を強化
for idx, batch_item in enumerate(batch_data):
    campaign = batch_campaigns[idx]
    campaign_name = campaign.get('name', 'Unknown')
    campaign_id = campaign.get('id')
    
    if batch_item.get('code') == 200:
        try:
            item_body = json.loads(batch_item.get('body', '{}'))
            page_insights = item_body.get('data', [])
            
            if len(page_insights) > 0:
                all_insights.extend(page_insights)
                
                # 特定のキャンペーンの場合、詳細なログを出力
                if 'ハイブリッドマーケティング' in campaign_name:
                    dates = [insight.get('date_start') for insight in page_insights if insight.get('date_start')]
                    unique_dates = sorted(list(set(dates)))
                    print(f"[Meta API] 🔍 DEBUG: {campaign_name} - First page insights:")
                    print(f"  Total insights: {len(page_insights)}")
                    print(f"  Unique dates: {len(unique_dates)}")
                    print(f"  Date range: {unique_dates[0] if unique_dates else 'N/A'} to {unique_dates[-1] if unique_dates else 'N/A'}")
                    print(f"  Sample dates: {unique_dates[:10]}")
                
                # ページネーション処理
                paging = item_body.get('paging', {})
                page_count = 1
                while 'next' in paging:
                    page_count += 1
                    next_url = paging['next']
                    print(f"[Meta API] Fetching page {page_count} for {campaign_name}...")
                    next_response = await client.get(next_url)
                    next_response.raise_for_status()
                    next_data = next_response.json()
                    next_insights = next_data.get('data', [])
                    all_insights.extend(next_insights)
                    paging = next_data.get('paging', {})
                    print(f"[Meta API] Retrieved {len(next_insights)} more insights for {campaign_name} (page {page_count}, total: {len(all_insights)})")
                    
                    # 特定のキャンペーンの場合、詳細なログを出力
                    if 'ハイブリッドマーケティング' in campaign_name:
                        next_dates = [insight.get('date_start') for insight in next_insights if insight.get('date_start')]
                        next_unique_dates = sorted(list(set(next_dates)))
                        print(f"[Meta API] 🔍 DEBUG: {campaign_name} - Page {page_count} insights:")
                        print(f"  Insights: {len(next_insights)}")
                        print(f"  Unique dates: {len(next_unique_dates)}")
                        print(f"  Sample dates: {next_unique_dates[:10]}")
                
                if page_count > 1:
                    print(f"[Meta API] Completed pagination for {campaign_name}: {page_count} pages, {len([i for i in all_insights if i.get('campaign_name') == campaign_name])} total insights")
                
                # 特定のキャンペーンの場合、最終的なデータを検証
                if 'ハイブリッドマーケティング' in campaign_name:
                    campaign_insights = [i for i in all_insights if i.get('campaign_name') == campaign_name]
                    campaign_dates = [i.get('date_start') for i in campaign_insights if i.get('date_start')]
                    campaign_unique_dates = sorted(list(set(campaign_dates)))
                    print(f"[Meta API] 🔍 DEBUG: {campaign_name} - Final data summary:")
                    print(f"  Total insights: {len(campaign_insights)}")
                    print(f"  Unique dates: {len(campaign_unique_dates)}")
                    print(f"  Date range: {campaign_unique_dates[0] if campaign_unique_dates else 'N/A'} to {campaign_unique_dates[-1] if campaign_unique_dates else 'N/A'}")
                    print(f"  All dates: {campaign_unique_dates}")
            else:
                if 'ハイブリッドマーケティング' in campaign_name:
                    print(f"[Meta API] ⚠️ WARNING: No insights data returned for {campaign_name}")
                    print(f"[Meta API] Response body: {item_body}")
        except json.JSONDecodeError as e:
            print(f"[Meta API] Error parsing batch response for {campaign_name}: {str(e)}")
            if 'ハイブリッドマーケティング' in campaign_name:
                print(f"[Meta API] Response body: {batch_item.get('body', '{}')[:500]}")
```

#### 1.2 データ保存時の検証を強化

**場所**: `backend/app/routers/meta_api.py`

**修正内容**:
1. **特定のキャンペーンのデータ保存を詳細にログ出力**
   - 保存されたレコード数
   - 保存された日付の範囲
   - 各日付のリーチ数

**修正コード例**:
```python
# Line 875-1220付近: データ保存時の検証を強化
saved_count = 0
hybrid_marketing_records = []  # デバッグ用

for insight in all_insights:
    try:
        # ... 既存の処理 ...
        
        # 特定のキャンペーンの場合、詳細なログを出力
        if 'ハイブリッドマーケティング' in campaign_name:
            hybrid_marketing_records.append({
                'campaign_name': campaign_name,
                'date': campaign_date,
                'reach': reach,
                'period_unique_reach_all': period_unique_reach_all
            })
        
        db.add(campaign)
        saved_count += 1
        
    except Exception as e:
        print(f"[Meta API] Error processing insight: {str(e)}")
        if 'ハイブリッドマーケティング' in campaign_name:
            print(f"[Meta API] Failed insight: {insight}")
        continue

# 特定のキャンペーンのデータ保存結果をログ出力
if hybrid_marketing_records:
    print(f"[Meta API] 🔍 DEBUG: Hybrid Marketing records saved:")
    print(f"  Total records: {len(hybrid_marketing_records)}")
    dates = sorted(set([r['date'] for r in hybrid_marketing_records]))
    print(f"  Date range: {dates[0] if dates else 'N/A'} to {dates[-1] if dates else 'N/A'}")
    print(f"  Unique dates: {len(dates)}")
    for record in hybrid_marketing_records[:10]:
        print(f"    {record['date']}: reach={record['reach']}, period_unique_reach_all={record['period_unique_reach_all']}")
```

### 修正案2: ユニークリーチのマッピング改善

#### 2.1 キャンペーン名の正規化

**場所**: `backend/app/routers/meta_api.py`

**修正内容**:
1. **キャンペーン名の正規化関数を追加**
   - 全角・半角の統一
   - スペースの統一
   - 特殊文字の処理

**修正コード例**:
```python
# ファイルの先頭に追加
def normalize_campaign_name(name: str) -> str:
    """
    キャンペーン名を正規化（全角・半角の統一、スペースの統一など）
    """
    if not name:
        return ''
    # 全角スペースを半角スペースに変換
    name = name.replace('　', ' ')
    # 連続するスペースを1つに統一
    import re
    name = re.sub(r'\s+', ' ', name)
    # 前後のスペースを削除
    name = name.strip()
    return name

# Line 1155-1174付近: マッピング時に正規化を使用
if not ad_set_name and not ad_name:  # キャンペーンレベルのデータのみ
    # キャンペーン名を正規化
    normalized_campaign_name = normalize_campaign_name(campaign_name)
    
    # 期間別のマップから取得（正規化された名前で検索）
    try:
        # まず正規化された名前で検索
        period_unique_reach_7days = campaign_period_reach_7days_map.get(normalized_campaign_name, 0)
        period_unique_reach_30days = campaign_period_reach_30days_map.get(normalized_campaign_name, 0)
        period_unique_reach_all = campaign_period_reach_all_map.get(normalized_campaign_name, 0)
        
        # 見つからない場合は、元の名前で検索（後方互換性）
        if period_unique_reach_all == 0:
            period_unique_reach_7days = campaign_period_reach_7days_map.get(campaign_name, 0)
            period_unique_reach_30days = campaign_period_reach_30days_map.get(campaign_name, 0)
            period_unique_reach_all = campaign_period_reach_all_map.get(campaign_name, 0)
        
        # まだ見つからない場合は、全期間のマップから取得
        if period_unique_reach_all == 0:
            period_unique_reach_all = campaign_period_reach_map.get(normalized_campaign_name, 0)
            if period_unique_reach_all == 0:
                period_unique_reach_all = campaign_period_reach_map.get(campaign_name, 0)
    except:
        # マップが存在しない場合は、全期間のマップから取得
        period_unique_reach_all = campaign_period_reach_map.get(normalized_campaign_name, 0)
        if period_unique_reach_all == 0:
            period_unique_reach_all = campaign_period_reach_map.get(campaign_name, 0)
    
    # 特定のキャンペーンの場合、マッピング結果をログ出力
    if 'ハイブリッドマーケティング' in campaign_name:
        print(f"[Meta API] 🔍 DEBUG: Unique reach mapping for '{campaign_name}':")
        print(f"  Normalized name: '{normalized_campaign_name}'")
        print(f"  period_unique_reach_7days: {period_unique_reach_7days}")
        print(f"  period_unique_reach_30days: {period_unique_reach_30days}")
        print(f"  period_unique_reach_all: {period_unique_reach_all}")
        print(f"  Available keys in map: {[k for k in campaign_period_reach_all_map.keys() if 'ハイブリッドマーケティング' in k]}")
```

#### 2.2 期間別ユニークリーチ取得時のキャンペーン名の正規化

**場所**: `backend/app/routers/meta_api.py`

**修正内容**:
1. **期間別ユニークリーチ取得時にもキャンペーン名を正規化**
   - マップに保存する際に正規化された名前を使用
   - 検索時にも正規化された名前を使用

**修正コード例**:
```python
# Line 470-475付近: 期間別ユニークリーチ取得時に正規化
if len(period_insights) > 0:
    insight_data = period_insights[0]
    period_reach = safe_int(insight_data.get('reach'), 0)
    
    # キャンペーン名を正規化
    normalized_campaign_name = normalize_campaign_name(campaign_name)
    period_map[normalized_campaign_name] = period_reach
    
    # 元の名前でも保存（後方互換性）
    if normalized_campaign_name != campaign_name:
        period_map[campaign_name] = period_reach
    
    print(f"[Meta API] {period_name} unique reach for {campaign_name} (normalized: {normalized_campaign_name}): {period_reach:,}")
```

### 修正案3: データベースの検証と修正

#### 3.1 データベースの実際のデータを確認するエンドポイント

**場所**: `backend/app/routers/campaigns.py`

**修正内容**:
1. **特定のキャンペーンのデータを詳細に確認するエンドポイントを追加**

**修正コード例**:
```python
@router.get("/debug/campaign-detail")
def debug_campaign_detail(
    campaign_name: str = Query(..., description="キャンペーン名"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    特定のキャンペーンのデータを詳細に確認
    """
    try:
        # キャンペーンレベルのデータのみを取得
        campaigns = db.query(Campaign).filter(
            Campaign.user_id == current_user.id,
            Campaign.campaign_name == campaign_name,
            or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)),
            or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
        ).order_by(Campaign.date).all()
        
        if len(campaigns) == 0:
            return {
                "message": "データが見つかりませんでした。",
                "campaign_name": campaign_name,
                "records": []
            }
        
        # 日付ごとのデータを整理
        records_by_date = {}
        for c in campaigns:
            date_str = str(c.date)
            if date_str not in records_by_date:
                records_by_date[date_str] = {
                    "date": date_str,
                    "reach": 0,
                    "period_unique_reach_all": c.period_unique_reach_all or 0,
                    "period_unique_reach_30days": c.period_unique_reach_30days or 0,
                    "period_unique_reach_7days": c.period_unique_reach_7days or 0,
                    "period_unique_reach": c.period_unique_reach or 0,
                    "record_count": 0
                }
            records_by_date[date_str]["reach"] += c.reach or 0
            records_by_date[date_str]["record_count"] += 1
        
        records = sorted(records_by_date.values(), key=lambda x: x["date"])
        
        # 統計情報
        total_reach = sum(r["reach"] for r in records)
        unique_dates = len(records)
        period_unique_reach_all = records[0]["period_unique_reach_all"] if records else 0
        
        return {
            "message": "確認完了",
            "campaign_name": campaign_name,
            "total_records": len(campaigns),
            "unique_dates": unique_dates,
            "total_reach": total_reach,
            "period_unique_reach_all": period_unique_reach_all,
            "date_range": {
                "start": records[0]["date"] if records else None,
                "end": records[-1]["date"] if records else None
            },
            "records": records
        }
    except Exception as e:
        import traceback
        logger.error(f"[Debug Campaign Detail] Error: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"確認エラー: {str(e)}"
        )
```

## 修正の優先順位

1. **最優先**: 修正案1.1（日次データ取得の検証を強化）
   - 問題の根本原因を特定するために必要

2. **高**: 修正案2.1（キャンペーン名の正規化）
   - ユニークリーチのマッピング問題を解決

3. **中**: 修正案1.2（データ保存時の検証を強化）
   - データ保存が正しく行われているか確認

4. **低**: 修正案3.1（データベースの検証エンドポイント）
   - デバッグ用のエンドポイント

## 実装手順

1. **修正案1.1を実装**
   - 日次データ取得の検証を強化
   - 特定のキャンペーンのデータ取得を詳細にログ出力

2. **Meta APIからデータを再取得**
   - 修正後のコードでデータを再取得
   - ログを確認して問題を特定

3. **修正案2.1を実装**
   - キャンペーン名の正規化を実装
   - マッピング処理を改善

4. **再度データを再取得**
   - 修正後のコードでデータを再取得
   - 問題が解決したか確認

5. **修正案1.2と3.1を実装（必要に応じて）**
   - データ保存時の検証を強化
   - デバッグ用のエンドポイントを追加

