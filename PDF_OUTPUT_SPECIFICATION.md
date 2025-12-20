# AI分析レポートPDF出力仕様書

## 概要
このドキュメントは、AI分析レポートのPDF出力機能の仕様と条件を定義します。別のAIに修正依頼を行う際のプロンプト作成に使用してください。

## ファイル情報
- **ファイルパス**: `backend/app/services/report_service.py`
- **クラス名**: `ReportService`
- **メソッド名**: `generate_pdf_report()`
- **使用ライブラリ**: ReportLab (reportlab)

## 入力データ構造

### 関数シグネチャ
```python
def generate_pdf_report(
    user_name: str,
    analysis_data: Dict,
    summary_data: Dict,
    campaigns_data: List[Dict]
) -> bytes:
```

### analysis_data の構造
```python
{
    "overall_rating": int,  # 1-5の整数
    "overall_comment": str,  # 総合評価のコメント
    "issues": [
        {
            "issue": str,  # 課題の説明
            "severity": str,  # "高" | "中" | "低"
            "impact": str  # 影響の説明
        }
    ],
    "recommendations": [
        {
            "title": str,  # 改善提案のタイトル
            "description": str,  # 改善提案の詳細説明
            "expected_impact": str,  # 期待される影響
            "priority": str,  # "高" | "中" | "低"
            "category": str,  # カテゴリ名
            "difficulty": int  # 1-5の整数
        }
    ],
    "action_plan": [
        {
            "action": str,  # アクションの説明
            "timeline": str,  # 期限
            "responsible": str,  # 担当者
            "step": int  # ステップ番号
        }
    ]
}
```

### campaigns_data の構造
```python
[
    {
        "campaign_name": str,  # キャンペーン名（最大30文字）
        "cost": float,  # 費用
        "conversions": int,  # コンバージョン数
        "roas": float,  # ROAS (%)
        "cpa": float  # CPA
    }
]
```

## PDFレイアウト仕様

### 1. ヘッダー
- **タイトル**: "分析レポート" (左寄せ、20pt、太字)
- **日時**: 生成日時を "◎ YYYY/MM/DD HH:MM:SS 生成" 形式で右寄せ（9pt）
- **スペース**: ヘッダー後に 0.25*inch のスペーサー

### 2. 総合評価セクション
- **見出し**: "総合評価" (14pt、太字)
- **表示**: 星評価（★×rating + ☆×(5-rating)）と "rating/5"
- **コメント**: overall_comment を引用符付きで表示（10pt）
- **スペース**: 見出し後に 0.1*inch、コメント後に 0.2*inch

### 3. 主要課題セクション（▲ 主要課題）
- **見出しスタイル**:
  - parent: `heading_style`
  - fontSize: 14pt
  - textColor: #111827
  - spaceAfter: 10pt
  - spaceBefore: 0pt
- **項目スタイル**:
  - parent: `normal_style`
  - fontSize: 10pt
  - textColor: #374151
  - spaceAfter: 10pt
  - leading: 16pt
- **表示形式**: 
  - 重要度記号（高: ▲、中/低: ◆）+ 課題名（太字）
  - 改行して影響の説明
- **スペース**: セクション終了後に 0.15*inch

### 4. 改善提案詳細セクション（◎ 改善提案詳細）
- **見出しスタイル**:
  - parent: `normal_style`（重要：heading_styleではない）
  - fontSize: 14pt
  - textColor: #111827
  - spaceAfter: 3pt
  - spaceBefore: 0pt
  - leading: 18pt
- **カテゴリ別にグループ化**:
  - カテゴリ名（太字、11pt、色: #6366f1）
  - spaceAfter: 3pt
  - spaceBefore: 0pt（すべてのカテゴリ）
- **各改善提案項目**:
  - fontSize: 10pt
  - textColor: #374151
  - spaceAfter: 最後のカテゴリの最後の項目は0pt、それ以外は4pt
  - 表示内容:
    - タイトル（太字）
    - 説明
    - 期待効果（太字）
    - 難易度（★×difficulty + ☆×(5-difficulty)）
- **重要**: カテゴリ間のスペーサーは一切追加しない

### 5. アクションプランセクション（☐ アクションプラン）
- **見出しスタイル**:
  - parent: `normal_style`（重要：heading_styleではない）
  - fontSize: 14pt
  - textColor: #111827
  - spaceAfter: 3pt
  - spaceBefore: 0pt
  - leading: 18pt
- **各アクション項目**:
  - fontSize: 10pt
  - textColor: #374151
  - spaceAfter: 最後の項目は0pt、それ以外は2pt
  - leading: 16pt
  - 表示形式:
    - ステップ番号 + アクション名（太字）
    - 改行して "期間: {timeline} ▼担当: {responsible}"
- **重要**: アクションプラン終了後、キャンペーン別パフォーマンスの前にスペーサーを追加しない

### 6. キャンペーン別パフォーマンスセクション
- **見出しスタイル**:
  - parent: `normal_style`（重要：heading_styleではない）
  - fontSize: 14pt
  - textColor: #111827
  - spaceAfter: 8pt
  - spaceBefore: 0pt（重要：これによりアクションプラン直後に配置）
  - leading: 18pt
- **テーブル**:
  - 列: キャンペーン名、費用、CV、ROAS、CPA
  - 最大10件表示
  - キャンペーン名は30文字まで
  - ヘッダー背景色: #f9fafb
  - 行の背景色: 白と#f9fafbを交互

## スタイル定義

### 基本スタイル
```python
normal_style = ParagraphStyle(
    'CustomNormal',
    parent=styles['Normal'],
    fontName=font_name,  # 日本語フォント
    fontSize=10
)

heading_style = ParagraphStyle(
    'CustomHeading',
    parent=styles['Heading2'],
    fontName=font_name,
    fontSize=15,
    textColor=colors.HexColor('#1e40af'),
    spaceAfter=10,
    spaceBefore=16,  # 注意：この値が大きいため、見出しには使用しない
    leading=20
)
```

## 重要な制約事項

### スペーシング制約
1. **改善提案セクションとアクションプランセクションの間**: スペーサーなし
2. **アクションプランとキャンペーン別パフォーマンスの間**: スペーサーなし（重要）
3. **改善提案の最後の項目**: spaceAfter=0pt
4. **アクションプランの最後の項目**: spaceAfter=0pt
5. **キャンペーン別パフォーマンスの見出し**: spaceBefore=0pt

### 親スタイルの選択
- **改善提案見出し**: `normal_style` を使用（`heading_style` は `spaceBefore=16` が大きすぎるため使用不可）
- **アクションプラン見出し**: `normal_style` を使用
- **キャンペーン別パフォーマンス見出し**: `normal_style` を使用

### フォント
- 日本語フォントを優先使用（システムフォントから自動検出）
- フォントが見つからない場合は 'Helvetica' を使用

## 現在の問題点

### 問題
アクションプランと詳細パフォーマンス分析（キャンペーン別パフォーマンス）の間に約5cmの大きな空白スペースが発生している。

### 原因
1. `heading_style` の `spaceBefore=16pt` が大きすぎる
2. セクション間のスペーサーが追加されている可能性
3. 親スタイルの継承による意図しないスペーシング

### 解決策
1. すべての見出しで `normal_style` を親として使用
2. アクションプラン終了後にスペーサーを追加しない
3. 最後の項目の `spaceAfter` を0ptに設定
4. キャンペーン別パフォーマンス見出しの `spaceBefore` を0ptに設定

## 修正時のチェックリスト

- [ ] 改善提案見出しの親スタイルが `normal_style` であること
- [ ] アクションプラン見出しの親スタイルが `normal_style` であること
- [ ] キャンペーン別パフォーマンス見出しの親スタイルが `normal_style` であること
- [ ] 改善提案の最後の項目の `spaceAfter` が0ptであること
- [ ] アクションプランの最後の項目の `spaceAfter` が0ptであること
- [ ] アクションプラン終了後に `Spacer` が追加されていないこと
- [ ] キャンペーン別パフォーマンス見出しの `spaceBefore` が0ptであること
- [ ] カテゴリ間のスペーサーが追加されていないこと

## 期待される結果

アクションプランの最後の項目の直後（最小限の余白のみ、数ポイント程度）に、詳細パフォーマンス分析（キャンペーン別パフォーマンス）の見出しが表示されること。

## テスト方法

1. バックエンドサーバーを再起動: `uvicorn app.main:app --reload`
2. AI分析レポートを生成
3. PDFをダウンロード
4. アクションプランとキャンペーン別パフォーマンスの間のスペースを測定
5. スペースが最小限（数ポイント程度）であることを確認

