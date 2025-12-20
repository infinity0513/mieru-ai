import React, { useState } from 'react';
import { LayoutTemplate, ArrowRightLeft, CheckCircle, XCircle, Lightbulb, Zap, FileText } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { LPAnalysisResult } from '../types';

export const LPAnalyzer: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LPAnalysisResult | null>(null);
  
  const [adText, setAdText] = useState('');
  const [lpText, setLpText] = useState('');

  const handleAnalyze = async () => {
    if (!adText.trim() || !lpText.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await Api.analyzeLP(adText, lpText);
      setResult(data);
    } catch (error) {
      console.error(error);
      alert('分析中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100 dark:bg-green-900/30';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
    return 'text-red-600 bg-red-100 dark:bg-red-900/30';
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <LayoutTemplate className="mr-2 text-indigo-600 dark:text-indigo-400" />
             LP分析・整合性チェック
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             広告コピーとLP（ランディングページ）の内容を入力してください。メッセージの一貫性（Message Match）を診断し、離脱要因を特定します。
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Area */}
        <div className="space-y-6">
           <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <h3 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center">
                 <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2">1</span>
                 広告コピー
              </h3>
              <textarea
                value={adText}
                onChange={(e) => setAdText(e.target.value)}
                placeholder="見出し、メインテキストを入力してください..."
                className="w-full min-h-[120px] p-3 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500 resize-none text-sm"
              />
           </div>

           <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <h3 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center">
                 <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2">2</span>
                 LPコンテンツ (テキスト)
              </h3>
              <textarea
                value={lpText}
                onChange={(e) => setLpText(e.target.value)}
                placeholder="LPのファーストビューや主な訴求内容をコピー＆ペーストしてください..."
                className="w-full min-h-[200px] p-3 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500 resize-none text-sm"
              />
           </div>

           <Button onClick={handleAnalyze} className="w-full py-3" isLoading={loading} icon={<ArrowRightLeft size={18} />}>
              整合性をチェックする
           </Button>
        </div>

        {/* Results Area */}
        <div className="h-full">
           {!result && !loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl min-h-[400px]">
                <FileText size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-center">広告とLPを入力して<br/>診断を開始してください。</p>
             </div>
           )}

           {loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">メッセージの一貫性を分析中...</p>
             </div>
           )}

           {result && (
             <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 animate-fade-in-up h-full overflow-y-auto">
                {/* Score Header */}
                <div className="flex items-center justify-between mb-6 pb-6 border-b border-gray-100 dark:border-gray-700">
                   <div>
                      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Message Match Score</h4>
                      <div className="flex items-baseline mt-1">
                         <span className={`text-4xl font-bold mr-2 ${getScoreColor(result.score).split(' ')[0]}`}>{result.score}</span>
                         <span className="text-gray-400 text-sm">/ 100</span>
                      </div>
                   </div>
                   <div className={`px-4 py-2 rounded-lg font-bold text-sm ${getScoreColor(result.score)}`}>
                      {result.consistencyRating}
                   </div>
                </div>

                <div className="mb-6">
                   <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed italic">
                      "{result.critique}"
                   </p>
                </div>

                {/* Matches & Mismatches */}
                <div className="space-y-6">
                   <div className="grid grid-cols-1 gap-4">
                      <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                         <h5 className="font-bold text-green-800 dark:text-green-300 mb-2 flex items-center text-sm">
                            <CheckCircle size={16} className="mr-2" />
                            一致しているポイント (Matches)
                         </h5>
                         <ul className="space-y-1">
                            {result.matchingPoints.map((item, i) => (
                               <li key={i} className="text-sm text-green-700 dark:text-green-200 ml-6 list-disc">{item}</li>
                            ))}
                         </ul>
                      </div>

                      <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                         <h5 className="font-bold text-red-800 dark:text-red-300 mb-2 flex items-center text-sm">
                            <XCircle size={16} className="mr-2" />
                            ズレ・不足している点 (Mismatches)
                         </h5>
                         <ul className="space-y-1">
                            {result.mismatchingPoints.map((item, i) => (
                               <li key={i} className="text-sm text-red-700 dark:text-red-200 ml-6 list-disc">{item}</li>
                            ))}
                         </ul>
                      </div>
                   </div>

                   {/* Suggestions */}
                   <div className="bg-yellow-50 dark:bg-yellow-900/20 p-5 rounded-lg border border-yellow-100 dark:border-yellow-800">
                      <h5 className="font-bold text-yellow-900 dark:text-yellow-200 mb-3 flex items-center">
                         <Zap size={18} className="mr-2" />
                         CVR改善アクション
                      </h5>
                      <ul className="space-y-3">
                         {result.suggestions.map((item, i) => (
                            <li key={i} className="text-sm text-yellow-800 dark:text-yellow-100 flex items-start">
                               <Lightbulb size={14} className="mt-0.5 mr-2 flex-shrink-0 opacity-70" />
                               {item}
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
