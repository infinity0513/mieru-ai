import React, { useState, useMemo, useEffect } from 'react';
import { CampaignData, BudgetPacingResult } from '../types';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { TrendingUp, AlertTriangle, CheckCircle, Calculator, Calendar, DollarSign, ArrowRight, Target } from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ReferenceLine 
} from 'recharts';

interface BudgetOptimizerProps {
  data: CampaignData[];
}

export const BudgetOptimizer: React.FC<BudgetOptimizerProps> = ({ data }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BudgetPacingResult | null>(null);
  
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [targetBudget, setTargetBudget] = useState<number>(500000);
  
  // Default to current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(startOfMonth);
  const [endDate, setEndDate] = useState(endOfMonth);

  // Extract unique campaigns
  const campaigns = useMemo(() => {
    return Array.from(new Set(data.map(d => d.campaign_name))).sort();
  }, [data]);

  // Set default campaign on load (default to "全体")
  useEffect(() => {
    if (!selectedCampaign) {
      setSelectedCampaign('全体');
    }
  }, [selectedCampaign]);

  const handleAnalyze = async () => {
    if (!selectedCampaign) return;
    setLoading(true);
    setResult(null);

    try {
      // 1. Calculate Current Spend within Date Range
      const start = new Date(startDate);
      const end = new Date(endDate);
      const today = new Date();
      // Cap "elapsed" calculation to today if today is within range, otherwise use full range or 0
      const calcEndDate = today < end ? today : end;
      
      // Filter data for selected campaign and date range
      // "全体"が選択された場合は全キャンペーンのデータを集計
      const filteredData = data.filter(d => {
        const dDate = new Date(d.date);
        const inDateRange = dDate >= start && dDate <= end;
        if (selectedCampaign === '全体') {
          return inDateRange;
        }
        return d.campaign_name === selectedCampaign && inDateRange;
      });

      const currentSpend = filteredData.reduce((sum, d) => sum + (Number(d.cost) || 0), 0);
      
      const daysElapsed = Math.max(1, Math.ceil((calcEndDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const daysRemaining = Math.max(0, totalDays - daysElapsed);

      // 2. Call API
      // "全体"の場合は"全体"という名前でAPIを呼び出す
      const campaignNameForApi = selectedCampaign === '全体' ? '全体' : selectedCampaign;
      const res = await Api.analyzeBudgetPacing(
        campaignNameForApi, 
        currentSpend, 
        targetBudget, 
        daysElapsed, 
        daysRemaining
      );
      
      setResult(res);
    } catch (error) {
      console.error(error);
      alert("分析に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // Generate chart data for visualization
  const chartData = useMemo(() => {
    if (!result) return [];
    
    const dataPoints = [];
    const totalDays = 30; // Simplify for visual if days not passed, but we can infer
    const idealDaily = result.targetBudget / totalDays;
    const currentDaily = result.currentSpend / (totalDays - result.daysRemaining);
    
    // Create logical progression for chart
    // 0 -> Days Elapsed (Real data slope) -> End (Projected slope)
    
    dataPoints.push({ name: 'Start', Ideal: 0, Actual: 0, Forecast: 0 });
    
    // Mid point (Current Status)
    dataPoints.push({ 
        name: '現在', 
        Ideal: result.targetBudget * ((totalDays - result.daysRemaining) / totalDays),
        Actual: result.currentSpend,
        Forecast: result.currentSpend
    });

    // End point
    dataPoints.push({ 
        name: '月末', 
        Ideal: result.targetBudget,
        Actual: null, // Future
        Forecast: result.forecastedSpend
    });

    return dataPoints;
  }, [result]);

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <Calculator className="mr-2 text-indigo-600 dark:text-indigo-400" />
             予算管理・着地予想 (Pacing)
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             現在の消化ペースから月末の着地を予測し、予算超過や使い残しを防ぐための調整プランを提示します。
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Settings Panel */}
        <div className="lg:col-span-1">
           <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sticky top-24">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                 <Target size={18} className="mr-2 text-indigo-500" />
                 設定
              </h3>
              <div className="space-y-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">分析対象キャンペーン</label>
                    <select 
                       value={selectedCampaign}
                       onChange={(e) => setSelectedCampaign(e.target.value)}
                       className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    >
                       <option value="全体">全体</option>
                       {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                 </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">目標月次予算 (¥)</label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400">¥</span>
                        <input
                           type="number"
                           value={targetBudget}
                           onChange={(e) => setTargetBudget(Number(e.target.value))}
                           className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">開始日</label>
                        <input
                           type="date"
                           value={startDate}
                           onChange={(e) => setStartDate(e.target.value)}
                           className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">終了日</label>
                        <input
                           type="date"
                           value={endDate}
                           onChange={(e) => setEndDate(e.target.value)}
                           className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                        />
                    </div>
                 </div>

                 <Button onClick={handleAnalyze} className="w-full mt-2" isLoading={loading} icon={<TrendingUp size={16}/>}>
                    分析・予測を実行
                 </Button>
              </div>
           </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
           {!result && !loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl min-h-[400px]">
                <Calculator size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-center">設定を入力して<br/>「分析・予測を実行」ボタンを押してください。</p>
             </div>
           )}

           {loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <p>予算シミュレーションを実行中...</p>
             </div>
           )}

           {result && (
              <div className="space-y-6 animate-fade-in-up">
                 {/* Status Banner */}
                 <div className={`rounded-xl p-6 border-l-4 shadow-sm ${
                    result.status === 'ON_TRACK' ? 'bg-green-50 border-green-500 dark:bg-green-900/20' : 
                    result.status === 'OVERSPEND' ? 'bg-red-50 border-red-500 dark:bg-red-900/20' : 
                    'bg-yellow-50 border-yellow-500 dark:bg-yellow-900/20'
                 }`}>
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className={`text-xl font-bold flex items-center ${
                                result.status === 'ON_TRACK' ? 'text-green-800 dark:text-green-300' : 
                                result.status === 'OVERSPEND' ? 'text-red-800 dark:text-red-300' : 
                                'text-yellow-800 dark:text-yellow-300'
                            }`}>
                                {result.status === 'ON_TRACK' ? <CheckCircle className="mr-2"/> : <AlertTriangle className="mr-2"/>}
                                {result.status === 'ON_TRACK' ? '順調 (On Track)' : result.status === 'OVERSPEND' ? '予算超過ペース (Overspending)' : '消化不足ペース (Underspending)'}
                            </h3>
                            <p className="mt-1 text-sm font-medium opacity-80 text-gray-700 dark:text-gray-300">
                                {result.advice}
                            </p>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-gray-500 dark:text-gray-400 block">着地予想比率</span>
                            <span className="text-2xl font-bold text-gray-900 dark:text-white">{result.pacingPercentage.toFixed(1)}%</span>
                        </div>
                    </div>
                 </div>

                 {/* Metrics Grid */}
                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400">現在の消化額</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">¥{Math.floor(result.currentSpend).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400">着地予想額</p>
                        <p className={`text-lg font-bold mt-1 ${result.forecastedSpend > result.targetBudget ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                            ¥{Math.floor(result.forecastedSpend).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400">残り日数</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{result.daysRemaining}日</p>
                    </div>
                    <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
                        <p className="text-xs text-indigo-800 dark:text-indigo-300 font-bold">推奨日予算</p>
                        <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-1">¥{Math.floor(result.recommendedDailyBudget).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    </div>
                 </div>

                 {/* Chart */}
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <h4 className="font-bold text-gray-900 dark:text-white mb-4">累積消化予測グラフ</h4>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
                                <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(val) => `¥${val/10000}万`} />
                                <RechartsTooltip 
                                    formatter={(value: any) => `¥${value.toLocaleString()}`}
                                    contentStyle={{ borderRadius: '8px' }}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="Ideal" name="理想ライン" stroke="#10b981" fill="none" strokeWidth={2} strokeDasharray="5 5" />
                                <Area type="monotone" dataKey="Forecast" name="着地予想" stroke="#6366f1" fill="url(#colorForecast)" strokeWidth={2} />
                                <Area type="monotone" dataKey="Actual" name="実績" stroke="#1f2937" fill="none" strokeWidth={3} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                 </div>

                 {/* AI Advice */}
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <h4 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                        <DollarSign size={18} className="mr-2 text-indigo-500" />
                        AI推奨アクション・戦略
                    </h4>
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {result.strategy}
                    </div>
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  );
};
