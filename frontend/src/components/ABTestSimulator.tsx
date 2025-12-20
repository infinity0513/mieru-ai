import React, { useState, useEffect } from 'react';
import { Split, ArrowRight, Trophy, AlertCircle, RefreshCw, TrendingUp, DollarSign, MousePointer, Eye, Target } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { ABTestResult, ABTestInput } from '../types';

// デフォルト値
const DEFAULT_INPUT: ABTestInput = {
  impressions: 100000,
  clicks: 1000,
  conversions: 100,
  cost: 100000,
  conversionValue: 1000000
};

// localStorageから保存された値を読み込む
const loadSavedInput = (variant: 'A' | 'B'): ABTestInput => {
  try {
    const saved = localStorage.getItem(`abtest_${variant}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        impressions: parsed.impressions ?? DEFAULT_INPUT.impressions,
        clicks: parsed.clicks ?? DEFAULT_INPUT.clicks,
        conversions: parsed.conversions ?? DEFAULT_INPUT.conversions,
        cost: parsed.cost ?? DEFAULT_INPUT.cost,
        conversionValue: parsed.conversionValue ?? DEFAULT_INPUT.conversionValue
      };
    }
  } catch (e) {
    // 無視
  }
  return { ...DEFAULT_INPUT };
};

// localStorageに保存する
const saveInput = (variant: 'A' | 'B', input: ABTestInput) => {
  try {
    localStorage.setItem(`abtest_${variant}`, JSON.stringify(input));
  } catch (e) {
    // 無視
  }
};

export const ABTestSimulator: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ABTestResult | null>(null);
  
  // localStorageから初期値を読み込む
  const [variantA, setVariantA] = useState<ABTestInput>(() => loadSavedInput('A'));
  const [variantB, setVariantB] = useState<ABTestInput>(() => loadSavedInput('B'));

  // 入力値を保存するためのstate（空文字列を許可）
  const [inputValuesA, setInputValuesA] = useState<Record<keyof ABTestInput, string>>(() => {
    const saved = loadSavedInput('A');
    // 保存された値が0の場合はデフォルト値を使用
    const values = {
      impressions: saved.impressions || DEFAULT_INPUT.impressions,
      clicks: saved.clicks || DEFAULT_INPUT.clicks,
      conversions: saved.conversions || DEFAULT_INPUT.conversions,
      cost: saved.cost || DEFAULT_INPUT.cost,
      conversionValue: saved.conversionValue || DEFAULT_INPUT.conversionValue
    };
    return {
      impressions: String(values.impressions),
      clicks: String(values.clicks),
      conversions: String(values.conversions),
      cost: String(values.cost),
      conversionValue: String(values.conversionValue)
    };
  });

  const [inputValuesB, setInputValuesB] = useState<Record<keyof ABTestInput, string>>(() => {
    const saved = loadSavedInput('B');
    // 保存された値が0の場合はデフォルト値を使用
    const values = {
      impressions: saved.impressions || DEFAULT_INPUT.impressions,
      clicks: saved.clicks || DEFAULT_INPUT.clicks,
      conversions: saved.conversions || DEFAULT_INPUT.conversions,
      cost: saved.cost || DEFAULT_INPUT.cost,
      conversionValue: saved.conversionValue || DEFAULT_INPUT.conversionValue
    };
    return {
      impressions: String(values.impressions),
      clicks: String(values.clicks),
      conversions: String(values.conversions),
      cost: String(values.cost),
      conversionValue: String(values.conversionValue)
    };
  });

  const handleChange = (variant: 'A' | 'B', field: keyof ABTestInput, value: string) => {
    // 空文字列を許可
    const trimmedValue = value.trim();
    
    if (variant === 'A') {
      setInputValuesA(prev => ({ ...prev, [field]: trimmedValue }));
      // 数値に変換（空文字列の場合は0）
      const numValue = trimmedValue === '' ? 0 : parseInt(trimmedValue) || 0;
      const newVariantA = { ...variantA, [field]: numValue };
      setVariantA(newVariantA);
      saveInput('A', newVariantA);
    } else {
      setInputValuesB(prev => ({ ...prev, [field]: trimmedValue }));
      // 数値に変換（空文字列の場合は0）
      const numValue = trimmedValue === '' ? 0 : parseInt(trimmedValue) || 0;
      const newVariantB = { ...variantB, [field]: numValue };
      setVariantB(newVariantB);
      saveInput('B', newVariantB);
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setResult(null);
    try {
      const data = await Api.runABTestAnalysis(variantA, variantB);
      setResult(data);
    } catch (error) {
      console.error(error);
      alert('分析中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  const MetricCard = ({ label, valueA, valueB, format, winner }: { label: string, valueA: number, valueB: number, format: (v: number) => string, winner?: 'A' | 'B' }) => {
    const isBetter = (a: number, b: number) => {
       // Lower is better for CPA, Higher is better for others
       if (label === 'CPA') return b < a ? 'B' : (a < b ? 'A' : 'DRAW');
       return b > a ? 'B' : (a > b ? 'A' : 'DRAW');
    };
    
    const better = isBetter(valueA, valueB);
    const highlightA = better === 'A' ? 'text-green-600 font-bold bg-green-50 dark:bg-green-900/30 dark:text-green-400' : 'text-gray-600 dark:text-gray-400';
    const highlightB = better === 'B' ? 'text-green-600 font-bold bg-green-50 dark:bg-green-900/30 dark:text-green-400' : 'text-gray-600 dark:text-gray-400';

    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
         <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-2 font-medium uppercase tracking-wider">{label}</p>
         <div className="flex justify-between items-center text-sm">
            <span className={`px-2 py-1 rounded ${highlightA}`}>{format(valueA)}</span>
            <span className="text-gray-300 dark:text-gray-600">vs</span>
            <span className={`px-2 py-1 rounded ${highlightB}`}>{format(valueB)}</span>
         </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <Split className="mr-2 text-indigo-600 dark:text-indigo-400" />
             A/Bテストシミュレーター
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             パターンAとBの実績値を入力すると、AIが統計的な勝敗を判定し、次のアクションを提案します。
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Input Column */}
        <div className="lg:col-span-5 space-y-6">
           <div className="grid grid-cols-2 gap-4">
              {/* Variant A */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-l-4 border-gray-300 dark:border-gray-600 p-5">
                 <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                    <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2">A</span>
                    コントロール
                 </h3>
                 <div className="space-y-3">
                    <div>
                       <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">表示回数 (Imp)</label>
                       <input type="number" value={inputValuesA.impressions} onChange={(e) => handleChange('A', 'impressions', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                       <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">クリック数 (Click)</label>
                       <input type="number" value={inputValuesA.clicks} onChange={(e) => handleChange('A', 'clicks', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                       <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">コンバージョン数 (CV)</label>
                       <input type="number" value={inputValuesA.conversions} onChange={(e) => handleChange('A', 'conversions', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                       <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">消化金額 (Cost)</label>
                       <input type="number" value={inputValuesA.cost} onChange={(e) => handleChange('A', 'cost', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                       <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">売上 (Value)</label>
                       <input type="number" value={inputValuesA.conversionValue} onChange={(e) => handleChange('A', 'conversionValue', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                 </div>
              </div>

              {/* Variant B */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-l-4 border-indigo-500 p-5">
                 <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                    <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2">B</span>
                    テストパターン
                 </h3>
                 <div className="space-y-3">
                    <div>
                       <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">表示回数 (Imp)</label>
                       <input type="number" value={inputValuesB.impressions} onChange={(e) => handleChange('B', 'impressions', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                       <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">クリック数 (Click)</label>
                       <input type="number" value={inputValuesB.clicks} onChange={(e) => handleChange('B', 'clicks', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                       <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">コンバージョン数 (CV)</label>
                       <input type="number" value={inputValuesB.conversions} onChange={(e) => handleChange('B', 'conversions', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                       <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">消化金額 (Cost)</label>
                       <input type="number" value={inputValuesB.cost} onChange={(e) => handleChange('B', 'cost', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                       <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">売上 (Value)</label>
                       <input type="number" value={inputValuesB.conversionValue} onChange={(e) => handleChange('B', 'conversionValue', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                 </div>
              </div>
           </div>

           <Button onClick={handleAnalyze} className="w-full py-3" isLoading={loading} icon={<TrendingUp size={18}/>}>
              勝敗を判定する
           </Button>
        </div>

        {/* Results Column */}
        <div className="lg:col-span-7">
           {!result && !loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <Split size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                <p>データを入力して判定を開始してください</p>
             </div>
           )}
           
           {loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">統計データを分析中...</p>
             </div>
           )}

           {result && (
              <div className="space-y-6 animate-fade-in-up">
                 {/* Winner Banner */}
                 <div className={`rounded-xl p-6 text-center border-2 ${
                    result.winner === 'B' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800' : 
                    result.winner === 'A' ? 'bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600' :
                    'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800'
                 }`}>
                    <div className="inline-flex p-3 rounded-full bg-white dark:bg-gray-800 shadow-sm mb-3">
                       {result.winner === 'B' ? <Trophy className="text-indigo-600" size={32} /> : 
                        result.winner === 'A' ? <Trophy className="text-gray-600" size={32} /> :
                        <AlertCircle className="text-yellow-600" size={32} />
                       }
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                       {result.winner === 'B' ? 'パターンBの勝利！' : 
                        result.winner === 'A' ? 'パターンA（コントロール）が優勢' : 
                        '引き分け / 有意差なし'}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 font-medium">
                       判定: {result.confidenceScore}
                    </p>
                    {result.improvement && (
                       <div className="mt-4 inline-block bg-white dark:bg-gray-800 px-4 py-2 rounded-lg text-sm font-bold text-green-600 dark:text-green-400 shadow-sm border border-green-100 dark:border-green-900">
                          {result.improvement.metric} が {result.improvement.value} 改善
                       </div>
                    )}
                 </div>

                 {/* Comparison Metrics */}
                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MetricCard 
                        label="CTR (クリック率)" 
                        valueA={result.metricsA.ctr} 
                        valueB={result.metricsB.ctr} 
                        format={(v) => `${v.toFixed(2)}%`} 
                        winner={result.winner}
                    />
                    <MetricCard 
                        label="CVR (獲得率)" 
                        valueA={result.metricsA.cvr} 
                        valueB={result.metricsB.cvr} 
                        format={(v) => `${v.toFixed(2)}%`} 
                        winner={result.winner}
                    />
                    <MetricCard 
                        label="CPA (獲得単価)" 
                        valueA={result.metricsA.cpa} 
                        valueB={result.metricsB.cpa} 
                        format={(v) => `¥${Math.round(v).toLocaleString()}`} 
                        winner={result.winner}
                    />
                    <MetricCard 
                        label="ROAS (費用対効果)" 
                        valueA={result.metricsA.roas} 
                        valueB={result.metricsB.roas} 
                        format={(v) => `${v.toFixed(0)}%`} 
                        winner={result.winner}
                    />
                 </div>

                 {/* Analysis & Recommendation */}
                 <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                    <div className="mb-6">
                       <h4 className="font-bold text-gray-900 dark:text-white flex items-center mb-3">
                          <Eye size={18} className="mr-2 text-indigo-500" />
                          AI分析コメント
                       </h4>
                       <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                          {result.analysis}
                       </p>
                    </div>
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-xl">
                       <h4 className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center mb-3">
                          <ArrowRight size={18} className="mr-2" />
                          推奨ネクストアクション
                       </h4>
                       <p className="text-indigo-800 dark:text-indigo-300 text-sm leading-relaxed font-medium">
                          {result.recommendation}
                       </p>
                    </div>
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  );
};
