import os
import json
from openai import OpenAI
from ..config import settings

class AIAnalysisService:
    @staticmethod
    def get_client():
        """Get OpenAI client"""
        api_key = os.getenv("OPENAI_API_KEY") or settings.OPENAI_API_KEY
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not set")
        return OpenAI(api_key=api_key)
    
    @staticmethod
    def prepare_analysis_data(summary, top_campaigns, bottom_campaigns, daily_data):
        """Prepare analysis data for AI prompt - ダッシュボードの16項目すべてを含める"""
        prompt = f"""
以下のMeta広告データを分析してください。

【期間】
開始日: {summary['period']['start_date']}
終了日: {summary['period']['end_date']}

【全体サマリー（基本指標）】
1. 総広告費: ¥{summary['totals']['cost']:,.0f}
2. インプレッション数: {summary['totals']['impressions']:,}
3. クリック数: {summary['totals']['clicks']:,}
4. コンバージョン数: {summary['totals']['conversions']:,}
5. 総コンバージョン価値: ¥{summary['totals']['conversion_value']:,.0f}

【計算指標（パフォーマンス指標）】
6. ROAS: {summary['averages']['roas']:.2f}%
7. CTR: {summary['averages']['ctr']:.2f}%
8. CVR: {summary['averages']['cvr']:.2f}%
9. CPC: ¥{summary['averages']['cpc']:.2f}
10. CPA: ¥{summary['averages']['cpa']:.2f}
11. CPM: ¥{summary['averages'].get('cpm', 0):.2f}

【リーチ・エンゲージメント指標】
12. リーチ数: {summary['totals'].get('reach', 0):,}
13. フリークエンシー: {summary['averages'].get('frequency', 0):.2f}
14. エンゲージメント率: {summary['averages'].get('engagement_rate', 0):.2f}%
15. リンククリック数: {summary['totals'].get('link_clicks', 0):,}
16. LPビュー数: {summary['totals'].get('landing_page_views', 0):,}

【トップ3キャンペーン】
"""
        for i, camp in enumerate(top_campaigns, 1):
            prompt += f"{i}. {camp['campaign_name']}: 費用¥{camp['cost']:,.0f}, コンバージョン{camp['conversions']}, ROAS{camp['roas']:.2f}%, CPA¥{camp['cpa']:.2f}\n"
        
        prompt += "\n【ワースト3キャンペーン】\n"
        for i, camp in enumerate(bottom_campaigns, 1):
            prompt += f"{i}. {camp['campaign_name']}: 費用¥{camp['cost']:,.0f}, コンバージョン{camp['conversions']}, ROAS{camp['roas']:.2f}%, CPA¥{camp['cpa']:.2f}\n"
        
        prompt += """
【依頼内容】
上記のデータを元に、以下の項目を含む詳細な分析を行ってください。
1. 総合評価 (1-5) とその理由
2. 具体的な課題（重要度付き）
3. 改善提案（難易度、優先度、期待効果付き）
4. アクションプラン（ステップバイステップ）

レスポンスは必ず以下のJSONスキーマに従ってください：

{
  "overall_rating": 1-5の整数,
  "overall_comment": "総合評価のコメント",
  "issues": [
    {
      "issue": "課題の説明",
      "severity": "高" または "中" または "低",
      "impact": "影響の説明"
    }
  ],
  "recommendations": [
    {
      "title": "改善提案のタイトル",
      "description": "改善提案の詳細説明",
      "expected_impact": "期待される影響",
      "priority": "高" または "中" または "低",
      "category": "カテゴリ名",
      "difficulty": 1-5の整数
    }
  ],
  "action_plan": [
    {
      "action": "アクションの説明",
      "timeline": "期限",
      "responsible": "担当者",
      "step": 1
    }
  ]
}

必ず上記の形式で、issues、recommendations、action_planは配列として返してください。
各配列には少なくとも2-3個の項目を含めてください。
"""
        return prompt
    
    @staticmethod
    async def analyze_campaigns(prompt):
        """Call OpenAI API to analyze campaigns"""
        client = AIAnalysisService.get_client()
        
        print(f"[AI Service] Calling OpenAI API with prompt length: {len(prompt)}")
        
        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert Meta advertising analyst. Always respond in valid JSON format with the exact structure specified in the user's request. Make sure to include at least 2-3 items in each array (issues, recommendations, action_plan)."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                max_tokens=2000
            )
            
            result_text = response.choices[0].message.content
            if not result_text:
                raise ValueError("AI response is empty")
            
            print(f"[AI Service] Received response: {result_text[:200]}...")
            
            result = json.loads(result_text)
            
            # Ensure required fields exist and are properly formatted
            issues = result.get("issues", [])
            recommendations = result.get("recommendations", [])
            action_plan = result.get("action_plan", [])
            
            # Validate that arrays are actually arrays
            if not isinstance(issues, list):
                print(f"[AI Service] Warning: issues is not a list: {type(issues)}")
                issues = []
            if not isinstance(recommendations, list):
                print(f"[AI Service] Warning: recommendations is not a list: {type(recommendations)}")
                recommendations = []
            if not isinstance(action_plan, list):
                print(f"[AI Service] Warning: action_plan is not a list: {type(action_plan)}")
                action_plan = []
            
            # Add step numbers to action_plan if missing
            for idx, plan in enumerate(action_plan):
                if isinstance(plan, dict) and "step" not in plan:
                    plan["step"] = idx + 1
            
            print(f"[AI Service] Parsed result: rating={result.get('overall_rating')}, issues={len(issues)}, recommendations={len(recommendations)}, action_plan={len(action_plan)}")
            
            return {
                "overall_rating": result.get("overall_rating", 3),
                "overall_comment": result.get("overall_comment", "分析を実行しました。"),
                "issues": issues,
                "recommendations": recommendations,
                "action_plan": action_plan
            }
        except json.JSONDecodeError as e:
            print(f"[AI Service] JSON decode error: {e}")
            print(f"[AI Service] Response text: {result_text}")
            raise ValueError(f"AI response is not valid JSON: {e}")
        except Exception as e:
            print(f"[AI Service] Error calling OpenAI API: {e}")
            raise
