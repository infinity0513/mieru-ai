import React, { useState, useMemo, useContext } from 'react';
import { CampaignData } from '../types';
import { Button } from './ui/Button';
import { ThemeContext } from './Layout';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { Calculator, ArrowRight, RotateCcw, TrendingUp, DollarSign, Info } from 'lucide-react';

interface SimulationProps {
  data: CampaignData[];
}

interface CampaignSimState {
  name: string;
  baseCost: number;
  baseConversions: number;
  baseValue: number;
  avgCpa: number;
  avgRoas: number;
  budgetMultiplier: number; // 0.5 to 2.0
}

export const Simulation: React.FC<SimulationProps> = ({ data }) => {
  const { isDark } = useContext(ThemeContext);
  
  // Initialize simulation state from data
  const initialSimData = useMemo(() => {
    if (data.length === 0) return [];
    
    const stats: Record<string, { cost: number; conversions: number; value: number }> = {};
    
    // Aggregate by campaign - 数値変換を明示的に行う
    data.forEach(d => {
      if (!stats[d.campaign_name]) {
        stats[d.campaign_name] = { cost: 0, conversions: 0, value: 0 };
      }
      stats[d.campaign_name].cost += Number(d.cost) || 0;
      stats[d.campaign_name].conversions += Number(d.conversions) || 0;
      stats[d.campaign_name].value += Number(d.conversion_value) || 0;
    });

    return Object.entries(stats)
        .map(([name, s]) => {
            const cost = Number(s.cost) || 0;
            const conversions = Number(s.conversions) || 0;
            const value = Number(s.value) || 0;
            
            return {
            name,
                baseCost: cost,
                baseConversions: conversions,
                baseValue: value,
                avgCpa: conversions > 0 ? cost / conversions : 0,
                avgRoas: cost > 0 ? (value / cost) * 100 : 0,
            budgetMultiplier: 1.0
            };
        })
        // Filter out very small campaigns to keep UI clean
        .filter(c => c.baseCost > 1000)
        .sort((a, b) => b.baseCost - a.baseCost)
        .slice(0, 10); // Limit to top 10
  }, [data]);

  const [simState, setSimState] = useState<CampaignSimState[]>(initialSimData);

  // Reset function
  const handleReset = () => {
    setSimState(initialSimData);
  };

  // Update multiplier
  const handleSliderChange = (name: string, value: number) => {
    setSimState(prev => prev.map(c => 
      c.name === name ? { ...c, budgetMultiplier: value } : c
    ));
  };

  // Calculate Totals (Current vs Projected)
  const results = useMemo(() => {
    const current = {
      cost: 0,
      conversions: 0,
      value: 0,
      roas: 0
    };
    
    const projected = {
      cost: 0,
      conversions: 0,
      value: 0,
      roas: 0
    };

    simState.forEach(c => {
      // Current Totals - 数値変換を明示的に行う
      const baseCost = Number(c.baseCost) || 0;
      const baseConversions = Number(c.baseConversions) || 0;
      const baseValue = Number(c.baseValue) || 0;
      const avgCpa = Number(c.avgCpa) || 0;
      const avgRoas = Number(c.avgRoas) || 0;
      const budgetMultiplier = Number(c.budgetMultiplier) || 1.0;
      
      current.cost += baseCost;
      current.conversions += baseConversions;
      current.value += baseValue;

      // Projected Calculations
      // Simplified Model: Assumes CPA/ROAS stays relatively constant for small shifts
      // For larger shifts (+20%), efficiency might drop slightly (diminishing returns).
      // Let's implement a simple diminishing returns factor.
      
      const newCost = baseCost * budgetMultiplier;
      let efficiencyFactor = 1.0;
      
      if (budgetMultiplier > 1.0) {
        // Spending more: CPA likely increases slightly (efficiency drops)
        // e.g. 1.5x budget -> 0.95x efficiency
        efficiencyFactor = Math.max(0.5, 1.0 - ((budgetMultiplier - 1.0) * 0.1)); // 最小0.5に制限
      } else if (budgetMultiplier < 1.0) {
        // Spending less: CPA might decrease slightly (efficiency gains, cutting waste)
        // e.g. 0.5x budget -> 1.05x efficiency
        efficiencyFactor = Math.min(1.5, 1.0 + ((1.0 - budgetMultiplier) * 0.1)); // 最大1.5に制限
      }
      
      // コンバージョン数の計算: 新しい費用をCPAで割る（CPAが0の場合は0）
      const newConversions = avgCpa > 0 ? (newCost / avgCpa) * efficiencyFactor : 0;
      
      // 売上の計算: 新しい費用にROASを掛ける（ROASはパーセンテージなので100で割る）
      const newValue = avgRoas > 0 ? newCost * (avgRoas / 100) * efficiencyFactor : 0;

      // Debug: Log calculation details (only in development)
      if (import.meta.env.DEV && c.name === simState[0]?.name) {
        console.log('[Simulation] Calculation for campaign:', {
          campaignName: c.name,
          baseCost,
          budgetMultiplier,
          newCost,
          avgCpa,
          avgRoas,
          efficiencyFactor,
          newConversions,
          newValue
        });
      }

      projected.cost += newCost;
      projected.conversions += newConversions;
      projected.value += newValue;
    });

    current.roas = current.cost > 0 ? (current.value / current.cost) * 100 : 0;
    projected.roas = projected.cost > 0 ? (projected.value / projected.cost) * 100 : 0;

    return { current, projected };
  }, [simState]);

  // Chart Data
  const chartData = [
    { name: '費用 (円)', Current: results.current.cost, Projected: results.projected.cost },
    { name: '売上 (円)', Current: results.current.value, Projected: results.projected.value },
  ];
  
  // Conversion Chart Data (separate scale)
  const cvChartData = [
    { name: 'CV数', Current: results.current.conversions, Projected: results.projected.conversions },
  ];

  if (data.length === 0) {
    return <div className="text-center py-20 text-gray-500 dark:text-gray-400">データがありません。</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <Calculator className="mr-2 text-indigo-600 dark:text-indigo-400" />
             予算最適化シミュレーター
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             各キャンペーンの予算配分を調整し、将来のパフォーマンスを予測します。
           </p>
        </div>
        <Button variant="outline" onClick={handleReset} icon={<RotateCcw size={16}/>}>
          リセット
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sliders Panel */}
        <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 overflow-hidden">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">予算配分調整</h3>
          <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
            {simState.map((campaign) => (
              <div key={campaign.name} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300 truncate w-2/3" title={campaign.name}>
                    {campaign.name}
                  </span>
                  <span className={`font-mono ${campaign.budgetMultiplier > 1 ? 'text-green-600' : campaign.budgetMultiplier < 1 ? 'text-red-500' : 'text-gray-500'}`}>
                    {Math.round(campaign.budgetMultiplier * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.1"
                  value={campaign.budgetMultiplier}
                  onChange={(e) => handleSliderChange(campaign.name, parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
                  <span>停止 (0%)</span>
                  <span>維持 (100%)</span>
                  <span>倍増 (200%)</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                   現在: ¥{campaign.baseCost.toLocaleString()} → 予定: ¥{(campaign.baseCost * campaign.budgetMultiplier).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Metrics Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
             {/* Total Value */}
             <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                   <DollarSign size={40} />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">予想売上 (Total Value)</p>
                <div className="flex items-baseline mt-1 space-x-2">
                   <span className="text-2xl font-bold text-gray-900 dark:text-white">¥{results.projected.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className={`text-sm mt-2 flex items-center ${results.projected.value >= results.current.value ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                   {results.projected.value >= results.current.value ? <TrendingUp size={14} className="mr-1"/> : <TrendingUp size={14} className="mr-1 transform rotate-180"/>}
                   <span>{Math.abs((results.projected.value - results.current.value) / results.current.value * 100).toFixed(1)}%</span>
                   <span className="text-gray-400 ml-1">vs 現在</span>
                </div>
             </div>

             {/* Conversions */}
             <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <p className="text-sm text-gray-500 dark:text-gray-400">予想CV数</p>
                <div className="flex items-baseline mt-1 space-x-2">
                   <span className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(results.projected.conversions).toLocaleString()}</span>
                </div>
                <div className={`text-sm mt-2 flex items-center ${results.projected.conversions >= results.current.conversions ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                   {results.projected.conversions >= results.current.conversions ? <TrendingUp size={14} className="mr-1"/> : <TrendingUp size={14} className="mr-1 transform rotate-180"/>}
                   <span>{Math.abs((results.projected.conversions - results.current.conversions) / results.current.conversions * 100).toFixed(1)}%</span>
                   <span className="text-gray-400 ml-1">vs 現在</span>
                </div>
             </div>

             {/* ROAS */}
             <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <p className="text-sm text-gray-500 dark:text-gray-400">予想ROAS</p>
                <div className="flex items-baseline mt-1 space-x-2">
                   <span className="text-2xl font-bold text-gray-900 dark:text-white">{results.projected.roas.toFixed(0)}%</span>
                </div>
                <div className={`text-sm mt-2 flex items-center ${results.projected.roas >= results.current.roas ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                   {results.projected.roas >= results.current.roas ? <TrendingUp size={14} className="mr-1"/> : <TrendingUp size={14} className="mr-1 transform rotate-180"/>}
                   <span>{Math.abs(results.projected.roas - results.current.roas).toFixed(1)}pt</span>
                   <span className="text-gray-400 ml-1">vs 現在</span>
                </div>
             </div>
          </div>

          {/* Charts */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
             <h4 className="font-semibold text-gray-900 dark:text-white mb-6">シミュレーション比較</h4>
             <div className="h-64 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDark ? "#374151" : "#f0f0f0"} />
                    <XAxis type="number" stroke={isDark ? "#9ca3af" : "#9ca3af"} fontSize={12} tickFormatter={(val) => `¥${val/10000}万`} />
                    <YAxis dataKey="name" type="category" width={80} stroke={isDark ? "#9ca3af" : "#9ca3af"} fontSize={12} />
                    <RechartsTooltip 
                      cursor={{fill: isDark ? '#374151' : '#f3f4f6'}}
                      contentStyle={{ 
                        backgroundColor: isDark ? '#1f2937' : '#fff', 
                        borderRadius: '8px', 
                        border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
                        color: isDark ? '#f3f4f6' : '#111827'
                      }}
                      formatter={(value: any) => `¥${value.toLocaleString()}`}
                    />
                    <Legend />
                    <Bar dataKey="Current" name="現在 (実績)" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={20} />
                    <Bar dataKey="Projected" name="シミュレーション" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                 </BarChart>
               </ResponsiveContainer>
             </div>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex items-start">
             <Info className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5 mr-3" size={18} />
             <p className="text-sm text-blue-800 dark:text-blue-300">
               <span className="font-bold">シミュレーションの前提:</span> 予算の増減に伴い、効率（CPA/ROAS）は変動します。予算を大幅に増やすとCPAが悪化する（獲得効率が下がる）傾向を加味して算出しています。
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};