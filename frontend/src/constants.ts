import { CampaignData, AIAnalysisResult } from './types';

export const MOCK_CAMPAIGNS: CampaignData[] = Array.from({ length: 30 }).map((_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  const dateStr = date.toISOString().split('T')[0];
  
  // Simulate some realistic volatility
  const baseImpressions = 10000 + Math.random() * 5000;
  const clicks = baseImpressions * (0.01 + Math.random() * 0.02);
  const cost = clicks * (80 + Math.random() * 40);
  const conversions = clicks * (0.02 + Math.random() * 0.03);
  const conversion_value = conversions * (3000 + Math.random() * 1000);

  return {
    id: `cmp_${i}`,
    date: dateStr,
    campaign_name: i % 2 === 0 ? 'Spring Sale 2024' : 'Brand Awareness',
    impressions: Math.round(baseImpressions),
    clicks: Math.round(clicks),
    cost: Math.round(cost),
    conversions: Math.round(conversions),
    conversion_value: Math.round(conversion_value),
    ctr: (clicks / baseImpressions) * 100,
    cpc: cost / clicks,
    cpa: cost / (conversions || 1),
    roas: (conversion_value / cost) * 100
  };
});

export const MOCK_ANALYSIS_RESULT: AIAnalysisResult = {
  id: 'an_12345',
  date: new Date().toISOString(),
  overall_rating: 4,
  overall_comment: "全体的に良好なパフォーマンスですが、獲得単価（CPA）が徐々に上昇傾向にあります。特に週末のコンバージョン率（CVR）低下が顕著です。",
  issues: [
    {
      issue: "キャンペーンDの低ROAS",
      severity: "高",
      impact: "全体ROASを15%押し下げています"
    },
    {
      issue: "CVRの低下トレンド",
      severity: "中",
      impact: "CPAが先月比+12%悪化"
    }
  ],
  recommendations: [
    {
      title: "予算配分の最適化",
      description: "キャンペーンA（ROAS 450%）へ予算を20%シフトし、低パフォーマンスのキャンペーンDを縮小してください。",
      expected_impact: "ROAS 15%向上、月間+50CV見込み",
      difficulty: 2,
      priority: "高",
      category: "予算配分"
    },
    {
      title: "クリエイティブの疲弊対策",
      description: "「Spring Sale」バナーのフリークエンシーが高まっています。新バリエーション（動画）を追加してください。",
      expected_impact: "CTR 0.5%改善",
      difficulty: 3,
      priority: "中",
      category: "クリエイティブ"
    },
    {
      title: "週末限定の入札調整",
      description: "土日のCVR低下に合わせて、入札単価を15%引き下げるルールを設定してください。",
      expected_impact: "CPA 8%改善",
      difficulty: 1,
      priority: "中",
      category: "入札戦略"
    }
  ],
  action_plan: [
    {
      step: 1,
      action: "キャンペーンAの予算を日額5万円→6万円に増額",
      timeline: "即時",
      responsible: "広告運用者"
    },
    {
      step: 2,
      action: "キャンペーンDの予算を日額3万円→1.5万円に減額",
      timeline: "即時",
      responsible: "広告運用者"
    },
    {
      step: 3,
      action: "動画クリエイティブ（UGC風）を3パターン制作",
      timeline: "1週間以内",
      responsible: "クリエイティブチーム"
    }
  ]
};