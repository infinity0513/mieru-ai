import React, { useState, useMemo, useEffect } from 'react';
import { Filter, AlertCircle, ArrowDown, CheckCircle, TrendingDown, Lightbulb, Activity, BarChart2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { CampaignData, FunnelAnalysisResult } from '../types';
import { useToast } from './ui/Toast';

interface FunnelAnalysisProps {
  data: CampaignData[];
}

// Mock Industry Benchmarks
const BENCHMARKS = {
  ctr: 1.0, // 1.0%
  cvr: 1.5, // 1.5%
};

export const FunnelAnalysis: React.FC<FunnelAnalysisProps> = ({ data }) => {
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FunnelAnalysisResult | null>(null);
  const { addToast } = useToast();

  // Extract unique campaigns
  const campaigns = useMemo(() => {
    return Array.from(new Set(data.map(d => d.campaign_name))).sort();
  }, [data]);

  useEffect(() => {
    if (campaigns.length > 0 && !selectedCampaign) {
      setSelectedCampaign(campaigns[0]);
    }
  }, [campaigns, selectedCampaign]);

  const handleAnalyze = async () => {
    if (!selectedCampaign) return;
    setLoading(true);
    setResult(null);

    // Aggregate data for selected campaign (same logic as Dashboard)
    // Filter by campaign name exactly (case-sensitive match)
    const campaignData = data.filter(d => d.campaign_name === selectedCampaign);
    
    if (campaignData.length === 0) {
      addToast('選択したキャンペーンのデータが見つかりません', 'error');
      setLoading(false);
      return;
    }
    
    // Calculate totals (same as Dashboard kpiData calculation)
    // Ensure all values are numbers and handle undefined/null
    const totalImpressions = campaignData.reduce((sum, d) => sum + (Number(d.impressions) || 0), 0);
    const totalClicks = campaignData.reduce((sum, d) => sum + (Number(d.clicks) || 0), 0);
    const totalConversions = campaignData.reduce((sum, d) => sum + (Number(d.conversions) || 0), 0);
    
    // Calculate metrics (same as Dashboard)
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    const cvr = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0;
    
    const metrics = {
      impressions: totalImpressions,
      clicks: totalClicks,
      conversions: totalConversions,
      ctr: ctr,
      cvr: cvr
    };

    // Debug: Log calculated metrics to verify (only in development)
    if (import.meta.env.DEV) {
      console.log('[FunnelAnalysis] Campaign:', selectedCampaign);
      console.log('[FunnelAnalysis] Data rows:', campaignData.length);
      console.log('[FunnelAnalysis] Sample data:', campaignData.slice(0, 3));
      console.log('[FunnelAnalysis] Calculated Metrics:', metrics);
      console.log('[FunnelAnalysis] Verification:', {
        totalImpressions,
        totalClicks,
        totalConversions,
        ctr: `${ctr.toFixed(2)}%`,
        cvr: `${cvr.toFixed(2)}%`
      });
    }

    try {
      const analysis = await Api.analyzeFunnel(selectedCampaign, metrics, BENCHMARKS);
      setResult(analysis);
      addToast('ファネル分析が完了しました', 'success');
    } catch (error: any) {
      console.error('Funnel Analysis Error:', error);
      const errorMessage = error?.message || '分析中にエラーが発生しました。';
      addToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (data.length === 0) {
    return <div className="text-center py-20 text-gray-500 dark:text-gray-400">データがありません。</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <Filter className="mr-2 text-indigo-600 dark:text-indigo-400" />
             ファネル分析・ボトルネック診断
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             インプレッションからコンバージョンまでの流れを可視化し、離脱要因（ボトルネック）を特定します。
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Settings */}
        <div className="lg:col-span-3">
           <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sticky top-24">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                 <Activity size={18} className="mr-2 text-indigo-500" />
                 分析対象
              </h3>
              <div className="space-y-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">キャンペーン選択</label>
                    <select 
                       value={selectedCampaign}
                       onChange={(e) => setSelectedCampaign(e.target.value)}
                       className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    >
                       {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                 </div>
                 
                 <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-xs text-gray-500 dark:text-gray-400">
                    <p className="font-bold mb-1">比較ベンチマーク (標準値):</p>
                    <div className="flex justify-between mb-1">
                       <span>CTR (クリック率):</span>
                       <span>{BENCHMARKS.ctr}%</span>
                    </div>
                    <div className="flex justify-between">
                       <span>CVR (転換率):</span>
                       <span>{BENCHMARKS.cvr}%</span>
                    </div>
                 </div>

                 <Button onClick={handleAnalyze} className="w-full" isLoading={loading} icon={<BarChart2 size={16}/>}>
                    診断を実行
                 </Button>
              </div>
           </div>
        </div>

        {/* Visualization & Result */}
        <div className="lg:col-span-9 space-y-6">
           {!result && !loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl min-h-[400px]">
                <Filter size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                <p>キャンペーンを選択して診断を開始してください</p>
             </div>
           )}

           {loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">ファネルデータを解析中...</p>
             </div>
           )}

           {result && (
              <div className="animate-fade-in-up space-y-8">
                 {/* Data Verification Info */}
                 {import.meta.env.DEV && (
                   <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-xs text-yellow-800 dark:text-yellow-200">
                     <p className="font-bold mb-1">データ検証情報（開発モードのみ表示）:</p>
                     <p>キャンペーン: {result.campaignName}</p>
                     <p>データ行数: {data.filter(d => d.campaign_name === selectedCampaign).length}</p>
                     <p>計算値: Impressions={result.metrics.impressions.toLocaleString()}, Clicks={result.metrics.clicks.toLocaleString()}, Conversions={result.metrics.conversions.toLocaleString()}</p>
                     <p>CTR={result.metrics.ctr.toFixed(2)}%, CVR={result.metrics.cvr.toFixed(2)}%</p>
                   </div>
                 )}
                 
                 {/* Visual Funnel */}
                 <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 flex flex-col items-center">
                    
                    {/* Step 1: Impression */}
                    <div className="w-full max-w-2xl">
                       <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 p-4 rounded-t-lg flex justify-between items-center relative">
                          <span className="font-bold">Impressions (表示)</span>
                          <span className="text-xl font-bold">{result.metrics.impressions.toLocaleString()}</span>
                       </div>
                       
                       {/* Connection / CTR */}
                       <div className="h-16 flex justify-center items-center relative">
                          <div className="absolute h-full w-0.5 bg-gray-200 dark:bg-gray-700"></div>
                          <div className={`z-10 px-4 py-1 rounded-full text-sm font-bold shadow-sm border ${
                             result.metrics.ctr < BENCHMARKS.ctr ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/50 dark:border-red-800 dark:text-red-300' : 'bg-green-50 border-green-200 text-green-600 dark:bg-green-900/50 dark:border-green-800 dark:text-green-300'
                          }`}>
                             CTR: {result.metrics.ctr.toFixed(2)}%
                             <span className="text-xs font-normal text-gray-500 ml-2">(基準: {BENCHMARKS.ctr}%)</span>
                          </div>
                       </div>

                       {/* Step 2: Click */}
                       <div className="mx-8 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 p-4 flex justify-between items-center relative" style={{ clipPath: 'polygon(5% 0, 95% 0, 100% 100%, 0% 100%)' }}>
                          <span className="font-bold ml-4">Clicks (クリック)</span>
                          <span className="text-xl font-bold mr-4">{result.metrics.clicks.toLocaleString()}</span>
                       </div>

                       {/* Connection / CVR */}
                       <div className="h-16 flex justify-center items-center relative">
                          <div className="absolute h-full w-0.5 bg-gray-200 dark:bg-gray-700"></div>
                          <div className={`z-10 px-4 py-1 rounded-full text-sm font-bold shadow-sm border ${
                             result.metrics.cvr < BENCHMARKS.cvr ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/50 dark:border-red-800 dark:text-red-300' : 'bg-green-50 border-green-200 text-green-600 dark:bg-green-900/50 dark:border-green-800 dark:text-green-300'
                          }`}>
                             CVR: {result.metrics.cvr.toFixed(2)}%
                             <span className="text-xs font-normal text-gray-500 ml-2">(基準: {BENCHMARKS.cvr}%)</span>
                          </div>
                       </div>

                       {/* Step 3: Conversion */}
                       <div className="mx-24 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-4 rounded-b-lg flex justify-between items-center relative shadow-sm">
                          <span className="font-bold">Conversions (獲得)</span>
                          <span className="text-xl font-bold">{result.metrics.conversions.toLocaleString()}</span>
                       </div>
                    </div>
                 </div>

                 {/* Diagnosis Report */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                       <h4 className={`text-lg font-bold flex items-center mb-4 ${
                          result.bottleneck === 'NONE' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                       }`}>
                          {result.bottleneck === 'NONE' ? <CheckCircle className="mr-2"/> : <AlertCircle className="mr-2"/>}
                          診断結果: {result.bottleneck === 'CTR' ? 'クリエイティブに課題あり (CTR低)' : result.bottleneck === 'CVR' ? 'LP/オファーに課題あり (CVR低)' : 'パフォーマンスは良好です'}
                       </h4>
                       <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                          <p className="font-bold mb-2">AIによる分析:</p>
                          {result.diagnosis}
                       </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                       <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center mb-4">
                          <Lightbulb className="mr-2 text-yellow-500" />
                          推奨アクション
                       </h4>
                       <ul className="space-y-3">
                          {result.recommendations.map((rec, i) => (
                             <li key={i} className="flex items-start text-sm text-gray-700 dark:text-gray-300">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold mr-3">
                                   {i + 1}
                                </span>
                                <span className="pt-0.5">{rec}</span>
                             </li>
                          ))}
                       </ul>
                    </div>
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  );
};