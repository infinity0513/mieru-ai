# AI分析レポートPDF出力修正プロンプト

## プロンプト案

```
以下のPythonコード（ReportLabを使用したPDF生成コード）を修正してください。

【問題】
AI分析レポートのPDF出力で、アクションプランセクションと詳細パフォーマンス分析（キャンペーン別パフォーマンス）セクションの間に約5cmの大きな空白スペースが発生しています。

【目標】
アクションプランの直後に詳細パフォーマンス分析を詰めて配置し、不要なスペースを完全に削除する。

【修正対象ファイル】
- ファイルパス: backend/app/services/report_service.py
- クラス: ReportService
- メソッド: generate_pdf_report()

【重要な修正ポイント】

1. **改善提案セクション（Recommendations）の見出し**
   - 現在: parent=heading_style（spaceBefore=16ptが大きすぎる）
   - 修正: parent=normal_style に変更
   - spaceAfter: 3pt
   - spaceBefore: 0pt

2. **改善提案カテゴリ**
   - spaceBefore: すべて0pt（最初のカテゴリも含む）
   - spaceAfter: 3pt
   - カテゴリ間のスペーサーは一切追加しない

3. **改善提案の各項目**
   - 最後のカテゴリの最後の項目: spaceAfter=0pt
   - それ以外の項目: spaceAfter=4pt

4. **アクションプランセクション（Action Plan）の見出し**
   - 現在: parent=heading_style（spaceBefore=16ptが大きすぎる）
   - 修正: parent=normal_style に変更
   - spaceAfter: 3pt
   - spaceBefore: 0pt

5. **アクションプランの各項目**
   - 最後の項目: spaceAfter=0pt
   - それ以外の項目: spaceAfter=2pt

6. **アクションプラン終了後**
   - Spacerを一切追加しない
   - コメントで「アクションプランとキャンペーン別パフォーマンスの間にスペーサーを追加しない」ことを明記

7. **キャンペーン別パフォーマンスセクションの見出し**
   - parent: normal_style（heading_styleではない）
   - spaceBefore: 0pt（重要：これによりアクションプラン直後に配置）
   - spaceAfter: 8pt
   - fontSize: 14pt
   - leading: 18pt

【コード構造の確認】

以下の順序で要素が追加されていることを確認してください：
1. 改善提案セクション見出し
2. 改善提案の各カテゴリと項目
3. （ここにSpacerが入っていないことを確認）
4. アクションプラン見出し
5. アクションプランの各項目
6. （ここにSpacerが入っていないことを確認）
7. キャンペーン別パフォーマンス見出し（spaceBefore=0）
8. キャンペーン別パフォーマンステーブル

【スタイル定義の確認】

normal_style と heading_style の定義：
- normal_style: fontSize=10, spaceBefore/Afterのデフォルト値は小さい
- heading_style: spaceBefore=16pt（大きすぎるため、見出しには使用しない）

【修正後の期待結果】

アクションプランの最後の項目の直後（数ポイントの余白のみ）に、詳細パフォーマンス分析の見出しが表示されること。

【注意事項】

- ファイル内に重複したクラス定義がある可能性があります。両方の定義を同じように修正してください。
- spaceBefore と spaceAfter の単位はポイント（pt）です。
- Spacer(1, height) の height もポイント単位です。
- すべてのスペース関連の値を0にしても詰まりすぎる場合は、最小限（2-3pt）に設定してください。
- PageBreak が挿入されていないか確認してください（もしあれば削除）。

【修正例】

改善提案見出しの修正例：
```python
# 修正前
rec_heading_style = ParagraphStyle(
    'RecHeading',
    parent=heading_style,  # ← これを変更
    fontSize=14,
    textColor=colors.HexColor('#111827'),
    spaceAfter=6,
    spaceBefore=0
)

# 修正後
rec_heading_style = ParagraphStyle(
    'RecHeading',
    parent=normal_style,  # ← normal_styleに変更
    fontSize=14,
    textColor=colors.HexColor('#111827'),
    spaceAfter=3,  # ← 削減
    spaceBefore=0,
    leading=18  # ← 追加
)
```

アクションプラン見出しの修正例：
```python
# 修正前
action_heading_style = ParagraphStyle(
    'ActionHeading',
    parent=heading_style,  # ← これを変更
    fontSize=14,
    textColor=colors.HexColor('#111827'),
    spaceAfter=4,
    spaceBefore=0
)

# 修正後
action_heading_style = ParagraphStyle(
    'ActionHeading',
    parent=normal_style,  # ← normal_styleに変更
    fontSize=14,
    textColor=colors.HexColor('#111827'),
    spaceAfter=3,  # ← 削減
    spaceBefore=0,
    leading=18  # ← 追加
)
```

キャンペーン別パフォーマンス見出しの修正例：
```python
# 修正前
campaign_heading_style = ParagraphStyle(
    'CampaignHeading',
    parent=heading_style,  # ← これを変更
    fontSize=14,
    textColor=colors.HexColor('#111827'),
    spaceAfter=10,
    spaceBefore=0
)

# 修正後
campaign_heading_style = ParagraphStyle(
    'CampaignHeading',
    parent=normal_style,  # ← normal_styleに変更
    fontSize=14,
    textColor=colors.HexColor('#111827'),
    spaceAfter=8,  # ← 削減
    spaceBefore=0,  # ← 0を維持（重要）
    leading=18  # ← 追加
)
```

【最終確認】

修正後、以下を確認してください：
1. すべての見出しが normal_style を親として使用していること
2. アクションプラン終了後に Spacer が追加されていないこと
3. 最後の項目の spaceAfter が0ptであること
4. キャンペーン別パフォーマンス見出しの spaceBefore が0ptであること

コードを修正して、完全な修正後のコードを提供してください。
```

## 使用方法

1. 上記のプロンプトをコピー
2. 別のAI（ChatGPT、Claude等）に送信
3. `backend/app/services/report_service.py` の該当部分のコードも一緒に送信することを推奨
4. 修正後のコードを受け取り、ファイルに適用

## 補足情報

詳細な仕様については `PDF_OUTPUT_SPECIFICATION.md` を参照してください。

