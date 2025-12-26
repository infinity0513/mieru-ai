
export interface User {
  id: string;
  name: string;
  email: string;
  plan: 'FREE' | 'STANDARD' | 'PRO';
  organization: string;
}

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';
export type MemberStatus = 'ACTIVE' | 'INVITED';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: MemberStatus;
  joinedAt: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'SUCCESS';
  isRead: boolean;
  date: string;
}

export interface CampaignData {
  id: string;
  date: string;
  campaign_name: string;
  ad_set_name?: string;
  ad_name?: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversion_value: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  cpm?: number;
  cvr?: number;
  // Optional fields for future expansion
  reach?: number;
  frequency?: number;
  engagements?: number;
  engagement_rate?: number;
  link_clicks?: number;
  landing_page_views?: number;
}

export interface AnalysisIssue {
  issue: string;
  severity: '高' | '中' | '低';
  impact: string;
}

export interface AnalysisRecommendation {
  title: string;
  description: string;
  expected_impact: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  priority: '高' | '中' | '低';
  category: string;
}

export interface ActionPlanStep {
  step: number;
  action: string;
  timeline: string;
  responsible: string;
}

export interface AIAnalysisResult {
  id: string;
  date: string;
  campaign_name?: string | null;
  overall_rating: number;
  overall_comment: string;
  issues: AnalysisIssue[];
  recommendations: AnalysisRecommendation[];
  action_plan: ActionPlanStep[];
  raw_data?: {
    period?: {
      start_date: string;
      end_date: string;
    };
    totals?: {
      impressions: number;
      clicks: number;
      cost: number;
      conversions: number;
      conversion_value: number;
    };
    averages?: {
      ctr: number;
      cpc: number;
      cpa: number;
      cvr: number;
      roas: number;
    };
  } | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface AdCopyParams {
  productName: string;
  targetAudience: string;
  sellingPoints: string;
  tone: string;
}

export interface GeneratedAdCopy {
  headline: string;
  primaryText: string;
  explanation: string;
}

export interface CompetitorAnalysisResult {
  competitorName: string;
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  targetAudience: string;
  adStrategy: string;
  counterStrategy: string;
}

export interface TargetPersona {
  label: string;
  demographics: {
    age: string;
    gender: string;
    occupation: string;
    income: string;
  };
  psychographics: {
    painPoints: string[];
    motivations: string[];
    interests: string[];
  };
  metaTargeting: string[];
}

export interface KeywordSuggestionResult {
  seoKeywords: {
    highVolume: string[];
    longTail: string[];
  };
  hashtags: {
    popular: string[];
    niche: string[];
  };
  negativeKeywords: string[];
}

export interface CreativeAnalysisResult {
  scores: {
    visualImpact: number;
    textReadability: number;
    ctaClarity: number;
    overall: number;
  };
  strengths: string[];
  improvements: string[];
  critique: string;
}

export interface PolicyViolation {
  segment: string;
  category: string;
  reason: string;
  suggestion: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface PolicyCheckResult {
  status: 'SAFE' | 'WARNING' | 'DANGER';
  safetyScore: number;
  violations: PolicyViolation[];
  overallComment: string;
}

export interface ABVariantMetrics {
  ctr: number;
  cvr: number;
  cpa: number;
  roas: number;
}

export interface ABTestResult {
  winner: 'A' | 'B' | 'DRAW';
  confidenceScore: string; // e.g. "95%以上", "80%程度"
  metricsA: ABVariantMetrics;
  metricsB: ABVariantMetrics;
  improvement: {
    metric: string;
    value: string;
  } | null;
  analysis: string;
  recommendation: string;
}

export interface ABTestInput {
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  conversionValue: number;
}

export interface BudgetPacingResult {
  campaignName: string;
  currentSpend: number;
  targetBudget: number;
  forecastedSpend: number;
  pacingPercentage: number;
  daysRemaining: number;
  recommendedDailyBudget: number;
  status: 'ON_TRACK' | 'OVERSPEND' | 'UNDERSPEND';
  advice: string;
  strategy: string;
}

export interface LPAnalysisResult {
  score: number;
  consistencyRating: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR';
  matchingPoints: string[];
  mismatchingPoints: string[];
  suggestions: string[];
  critique: string;
}

export interface ReportConfig {
  periodType: 'all' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth';
  format: 'client_email' | 'internal_slack' | 'executive_summary';
  tone: 'formal' | 'casual' | 'bullet_points';
}

export interface FunnelAnalysisResult {
  campaignName: string;
  metrics: {
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cvr: number;
  };
  benchmarks: {
    ctr: number;
    cvr: number;
  };
  bottleneck: 'CTR' | 'CVR' | 'NONE';
  diagnosis: string;
  recommendations: string[];
}

export interface ProfitInput {
  productPrice: number;
  costOfGoods: number; // variable cost per unit
  otherExpenses: number; // shipping, fees per unit
  currentCpa: number;
  monthlyConversions: number;
}

export interface ProfitAnalysisResult {
  breakEvenRoas: number;
  breakEvenCpa: number;
  profitPerUnit: number;
  totalMonthlyProfit: number;
  profitMargin: number;
  advice: string;
  scalingPotential: string;
}

export interface JourneyStage {
  stageName: 'Awareness' | 'Interest' | 'Consideration' | 'Conversion' | 'Retention';
  userMindset: string;
  adAngle: string;
  creativeFormat: string;
  keyMetrics: string[];
}

export interface CreativeBrief {
  target: string;
  objective: string;
  coreMessage: string;
  visualDirection: string;
  toneOfVoice: string;
  copyIdeas: string[];
}

export type ViewState = 'DASHBOARD' | 'DATA_UPLOAD' | 'DAILY_DATA' | 'ANALYSIS' | 'ANOMALY_DETECTOR' | 'SIMULATION' | 'AD_GENERATOR' | 'KEYWORD_SUGGESTION' | 'PERSONA_BUILDER' | 'COMPETITOR_RESEARCH' | 'CREATIVE_DIAGNOSTIC' | 'POLICY_CHECKER' | 'AB_TEST_SIMULATOR' | 'BUDGET_OPTIMIZER' | 'LP_ANALYZER' | 'REPORT_GENERATOR' | 'FUNNEL_ANALYSIS' | 'ROI_SIMULATOR' | 'JOURNEY_MAP' | 'SETTINGS';