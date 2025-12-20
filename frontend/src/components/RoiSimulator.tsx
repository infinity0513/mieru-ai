import React, { useState, useEffect, useContext } from 'react';
import { DollarSign, TrendingUp, AlertTriangle, Scale, ArrowRight, HelpCircle, BarChart2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { ProfitAnalysisResult, CampaignData } from '../types';
import { ThemeContext } from './Layout';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface RoiSimulatorProps {
  data: CampaignData[];
}

export const RoiSimulator: React.FC<RoiSimulatorProps> = ({ data }) => {
  const { isDark } = useContext(ThemeContext);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProfitAnalysisResult | null>(null);

  // Inputs - use string for better input handling
  const [productPrice, setProductPrice] = useState<string>('10000');
  const [costOfGoods, setCostOfGoods] = useState<string>('3000');
  const [otherExpenses, setOtherExpenses] = useState<string>('1000');
  const [currentCpa, setCurrentCpa] = useState<string>('3000');
  const [monthlyConversions, setMonthlyConversions] = useState<string>('100');
  const [hasManualInput, setHasManualInput] = useState<boolean>(false);

  // Simulation State
  const [simulatedCpa, setSimulatedCpa] = useState<number>(3000);

  // Auto-fill from data if available (only on initial load, not after manual input)
  useEffect(() => {
    if (data.length > 0 && !hasManualInput) {
        // Calculate average CPA from all data (same logic as Dashboard)
        const totalCost = data.reduce((sum, d) => sum + (Number(d.cost) || 0), 0);
        const totalConversions = data.reduce((sum, d) => sum + (Number(d.conversions) || 0), 0);
        
        if (totalConversions > 0) {
            const avgCpa = Math.round(totalCost / totalConversions);
            setCurrentCpa(String(avgCpa));
            setSimulatedCpa(avgCpa);
            
            // Calculate monthly conversions (estimate from data date range)
            const dates = data.map(d => new Date(d.date).getTime());
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            const daysDiff = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
            const dailyAvgConversions = totalConversions / daysDiff;
            const estimatedMonthly = Math.round(dailyAvgConversions * 30);
            setMonthlyConversions(String(estimatedMonthly > 0 ? estimatedMonthly : totalConversions));
        }
    }
  }, [data, hasManualInput]);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      // Use currentCpa (not simulatedCpa) for initial analysis
      const currentCpaValue = Number(currentCpa) || 0;
      const productPriceValue = Number(productPrice) || 0;
      const costOfGoodsValue = Number(costOfGoods) || 0;
      const otherExpensesValue = Number(otherExpenses) || 0;
      const monthlyConversionsValue = Number(monthlyConversions) || 0;

      // Validate inputs
      if (productPriceValue <= 0) {
        alert("商品単価を入力してください");
        setLoading(false);
        return;
      }
      if (costOfGoodsValue < 0 || otherExpensesValue < 0) {
        alert("原価・経費は0以上で入力してください");
        setLoading(false);
        return;
      }
      if (currentCpaValue < 0) {
        alert("CPAは0以上で入力してください");
        setLoading(false);
        return;
      }
      if (monthlyConversionsValue <= 0) {
        alert("月間獲得数を入力してください");
        setLoading(false);
        return;
      }

      // Debug: Log input values (only in development)
      if (import.meta.env.DEV) {
        console.log('[RoiSimulator] Input values:', {
          productPrice: productPriceValue,
          costOfGoods: costOfGoodsValue,
          otherExpenses: otherExpensesValue,
          currentCpa: currentCpaValue,
          monthlyConversions: monthlyConversionsValue
        });
      }

      const res = await Api.analyzeProfitability({
        productPrice: productPriceValue,
        costOfGoods: costOfGoodsValue,
        otherExpenses: otherExpensesValue,
        currentCpa: currentCpaValue, // Use currentCpa for initial analysis
        monthlyConversions: monthlyConversionsValue
      });
      
      // Debug: Log calculated results (only in development)
      if (import.meta.env.DEV) {
        console.log('[RoiSimulator] Calculated results:', {
          breakEvenRoas: res.breakEvenRoas,
          breakEvenCpa: res.breakEvenCpa,
          profitPerUnit: res.profitPerUnit,
          totalMonthlyProfit: res.totalMonthlyProfit,
          profitMargin: res.profitMargin
        });
      }
      
      // Set simulatedCpa to currentCpa initially
      setSimulatedCpa(currentCpaValue);
      setResult(res);
    } catch (error: any) {
      console.error('Profit Analysis Error:', error);
      const errorMessage = error?.message || '計算中にエラーが発生しました。';
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Waterfall Chart Data
  const waterfallData = result ? [
    { name: '売上', value: Number(productPrice) || 0, type: 'total' },
    { name: '原価', value: -(Number(costOfGoods) || 0), type: 'minus' },
    { name: '諸経費', value: -(Number(otherExpenses) || 0), type: 'minus' },
    { name: '広告費(CPA)', value: -simulatedCpa, type: 'minus' },
    { name: '利益', value: result.profitPerUnit, type: 'result' }
  ] : [];

  // When simulated CPA changes, update result locally without API call
  // Recalculate profit based on simulated CPA
  useEffect(() => {
      if (result) {
          const productPriceValue = Number(productPrice) || 0;
          const costOfGoodsValue = Number(costOfGoods) || 0;
          const otherExpensesValue = Number(otherExpenses) || 0;
          const monthlyConversionsValue = Number(monthlyConversions) || 0;
          
          // Calculate gross margin (same as API)
          const totalVariableCost = costOfGoodsValue + otherExpensesValue;
          const grossMarginPerUnit = productPriceValue - totalVariableCost;
          
          // Calculate profit with simulated CPA
          const profit = grossMarginPerUnit - simulatedCpa;
          const totalProfit = profit * monthlyConversionsValue;
          
          // Only update if values actually changed to prevent infinite loop
          setResult(prev => {
              if (!prev) return null;
              
              // Check if values are actually different
              if (prev.profitPerUnit === profit && prev.totalMonthlyProfit === totalProfit) {
                  return prev; // No change, return same object
              }
              
              return {
                  ...prev,
                  profitPerUnit: profit,
                  totalMonthlyProfit: totalProfit
              };
          });
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulatedCpa, productPrice, costOfGoods, otherExpenses, monthlyConversions]);

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <DollarSign className="mr-2 text-indigo-600 dark:text-indigo-400" />
             利益シミュレーター・損益分岐点分析
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             商品単価や原価を入力して、広告運用の損益分岐点（Break-even Point）と最終利益をシミュレーションします。
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Input Panel */}
        <div className="lg:col-span-4 space-y-6">
           <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sticky top-24">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                 <Scale size={18} className="mr-2 text-indigo-500" />
                 ユニットエコノミクス設定
              </h3>
              
              <div className="space-y-4">
                 <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">商品単価 (売上/1件)</label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">¥</span>
                        <input
                           type="number"
                           value={productPrice}
                           onChange={(e) => {
                             setProductPrice(e.target.value);
                             setHasManualInput(true);
                           }}
                           className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">原価 (COGS)</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">¥</span>
                            <input
                               type="number"
                               value={costOfGoods}
                               onChange={(e) => {
                                 setCostOfGoods(e.target.value);
                                 setHasManualInput(true);
                               }}
                               className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">諸経費 (送料等)</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">¥</span>
                            <input
                               type="number"
                               value={otherExpenses}
                               onChange={(e) => {
                                 setOtherExpenses(e.target.value);
                                 setHasManualInput(true);
                               }}
                               className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>
                 </div>

                 <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">現在のCPA (獲得単価)</label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">¥</span>
                        <input
                           type="number"
                           value={currentCpa}
                           onChange={(e) => {
                             const value = e.target.value;
                             setCurrentCpa(value);
                             const numValue = Number(value) || 0;
                             setSimulatedCpa(numValue);
                             setHasManualInput(true);
                           }}
                           className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                 </div>

                 <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">月間獲得数 (CV)</label>
                    <input
                       type="number"
                       value={monthlyConversions}
                       onChange={(e) => {
                         setMonthlyConversions(e.target.value);
                         setHasManualInput(true);
                       }}
                       className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                 </div>

                 <Button onClick={handleAnalyze} className="w-full" isLoading={loading} icon={<BarChart2 size={16}/>}>
                    利益構造を分析
                 </Button>
              </div>
           </div>
        </div>

        {/* Visualization Panel */}
        <div className="lg:col-span-8 space-y-6">
           {!result && !loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl min-h-[400px]">
                <DollarSign size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                <p>左側の数値を入力して分析を開始してください</p>
             </div>
           )}

           {loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">損益分岐点を計算中...</p>
             </div>
           )}

           {result && (
              <div className="animate-fade-in-up space-y-6">
                 {/* Data Verification Info (Development Mode Only) */}
                 {import.meta.env.DEV && (
                   <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-xs text-yellow-800 dark:text-yellow-200">
                     <p className="font-bold mb-1">計算検証情報（開発モードのみ表示）:</p>
                     <div className="grid grid-cols-2 gap-2">
                       <div>
                         <p>入力値:</p>
                         <p>商品単価: ¥{Number(productPrice).toLocaleString()}</p>
                         <p>原価: ¥{Number(costOfGoods).toLocaleString()}</p>
                         <p>諸経費: ¥{Number(otherExpenses).toLocaleString()}</p>
                         <p>現在のCPA: ¥{Number(currentCpa).toLocaleString()}</p>
                         <p>月間獲得数: {Number(monthlyConversions).toLocaleString()}</p>
                       </div>
                       <div>
                         <p>計算結果:</p>
                         <p>粗利益: ¥{(Number(productPrice) - Number(costOfGoods) - Number(otherExpenses)).toLocaleString()}</p>
                         <p>損益分岐点ROAS: {result.breakEvenRoas.toFixed(2)}%</p>
                         <p>損益分岐点CPA: ¥{result.breakEvenCpa.toLocaleString()}</p>
                         <p>1件あたり利益: ¥{result.profitPerUnit.toLocaleString()}</p>
                         <p>月間予想利益: ¥{result.totalMonthlyProfit.toLocaleString()}</p>
                       </div>
                     </div>
                   </div>
                 )}
                 
                 {/* Key Metrics Cards */}
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-indigo-600 text-white p-4 rounded-xl shadow-lg">
                        <p className="text-indigo-200 text-xs font-medium uppercase">損益分岐点 ROAS</p>
                        <p className="text-3xl font-bold mt-1">{result.breakEvenRoas.toFixed(0)}%</p>
                        <p className="text-indigo-200 text-xs mt-2">これ以下は赤字</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                        <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase">損益分岐点 CPA</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">¥{result.breakEvenCpa.toLocaleString()}</p>
                        <p className="text-gray-400 text-xs mt-2">これ以上は赤字</p>
                    </div>
                    <div className={`p-4 rounded-xl border shadow-sm ${result.profitPerUnit > 0 ? 'bg-white dark:bg-gray-800 border-green-200 dark:border-green-900' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                        <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase">1件あたり利益</p>
                        <p className={`text-2xl font-bold mt-1 ${result.profitPerUnit > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            ¥{result.profitPerUnit.toLocaleString()}
                        </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                        <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase">月間予想利益</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">¥{result.totalMonthlyProfit.toLocaleString()}</p>
                    </div>
                 </div>

                 {/* Simulator Slider */}
                 <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                    <h4 className="font-bold text-gray-900 dark:text-white mb-6 flex items-center">
                        <TrendingUp size={20} className="mr-2 text-indigo-500" />
                        CPA変動シミュレーション
                    </h4>
                    <div className="mb-8 px-4">
                        <input
                           type="range"
                           min={Math.max(0, currentCpa * 0.5)}
                           max={currentCpa * 2}
                           step={100}
                           value={simulatedCpa}
                           onChange={(e) => setSimulatedCpa(Number(e.target.value))}
                           className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <div className="flex justify-between mt-2 text-sm text-gray-600 dark:text-gray-400">
                            <span>¥{Math.round(currentCpa * 0.5).toLocaleString()}</span>
                            <span className="font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-900/30">
                                シミュレーションCPA: ¥{simulatedCpa.toLocaleString()}
                            </span>
                            <span>¥{(currentCpa * 2).toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Waterfall Chart */}
                    <div className="h-64 w-full" style={{ minHeight: '256px', minWidth: '100%' }}>
                       <ResponsiveContainer width="100%" height={256}>
                          <BarChart data={waterfallData} width={undefined} height={undefined}>
                             <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#374151" : "#f0f0f0"} />
                             <XAxis dataKey="name" stroke={isDark ? "#9ca3af" : "#6b7280"} fontSize={12} />
                             <YAxis stroke={isDark ? "#9ca3af" : "#6b7280"} fontSize={12} />
                             <RechartsTooltip 
                                formatter={(value: any) => `¥${Math.abs(value).toLocaleString()}`}
                                contentStyle={{ backgroundColor: isDark ? '#1f2937' : '#fff', borderRadius: '8px' }}
                             />
                             <ReferenceLine y={0} stroke="#000" />
                             <Bar dataKey="value">
                                {waterfallData.map((entry, index) => (
                                   <Cell key={`cell-${index}`} fill={
                                      entry.type === 'total' ? '#6366f1' : 
                                      entry.type === 'minus' ? '#ef4444' : 
                                      entry.value > 0 ? '#10b981' : '#dc2626'
                                   } />
                                ))}
                             </Bar>
                          </BarChart>
                       </ResponsiveContainer>
                    </div>
                 </div>

                 {/* AI Advice */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-xl border border-indigo-100 dark:border-indigo-800">
                        <h4 className="font-bold text-indigo-900 dark:text-indigo-200 mb-3 flex items-center">
                            <HelpCircle size={18} className="mr-2" />
                            収益改善アドバイス
                        </h4>
                        <p className="text-sm text-indigo-800 dark:text-indigo-300 leading-relaxed whitespace-pre-wrap">
                            {result.advice}
                        </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700">
                        <h4 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center">
                            <ArrowRight size={18} className="mr-2 text-green-500" />
                            スケーリング判断
                        </h4>
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                            {result.scalingPotential}
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
