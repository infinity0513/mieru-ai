import React, { useState } from 'react';
import { Search, Globe, ShieldAlert, Target, Zap, TrendingUp, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { CompetitorAnalysisResult } from '../types';

export const CompetitorResearch: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompetitorAnalysisResult | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    url: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.industry) return;

    setLoading(true);
    setResult(null);
    try {
      const data = await Api.analyzeCompetitor(formData.name, formData.industry, formData.url);
      setResult(data);
    } catch (error) {
      console.error(error);
      alert('分析中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <Search className="mr-2 text-indigo-600 dark:text-indigo-400" />
             競合リサーチ
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             競合の名前と業種を入力するだけで、AIがSWOT分析や広告戦略を推測します。
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Input Form */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sticky top-24">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <Target size={18} className="mr-2 text-indigo-500" />
              分析対象
            </h3>
            <form onSubmit={handleAnalyze} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  競合名・ブランド名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="例: 株式会社Competitor"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  業種・カテゴリー <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="industry"
                  value={formData.industry}
                  onChange={handleChange}
                  placeholder="例: SaaS, アパレル, 英会話スクール"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  参考URL (任意)
                </label>
                <input
                  type="url"
                  name="url"
                  value={formData.url}
                  onChange={handleChange}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="pt-2">
                <Button type="submit" className="w-full" isLoading={loading} icon={<Search size={16} />}>
                  分析を開始
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Results Area */}
        <div className="lg:col-span-2 space-y-6">
          {!result && !loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl min-h-[400px]">
                <Globe size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-center">左側のフォームを入力して<br/>「分析を開始」ボタンを押してください。</p>
             </div>
          )}

          {loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <p>AIが競合情報を分析中...</p>
             </div>
          )}

          {result && (
            <div className="space-y-6 animate-fade-in-up">
              {/* Header Card */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                 <h3 className="text-xl font-bold text-gray-900 dark:text-white">{result.competitorName} の分析結果</h3>
                 <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg">
                       <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 mb-1 flex items-center">
                          <Target size={16} className="mr-1.5" /> 推定ターゲット層
                       </h4>
                       <p className="text-sm text-indigo-800 dark:text-indigo-200">{result.targetAudience}</p>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                       <h4 className="text-sm font-bold text-purple-900 dark:text-purple-300 mb-1 flex items-center">
                          <Zap size={16} className="mr-1.5" /> 推定広告戦略
                       </h4>
                       <p className="text-sm text-purple-800 dark:text-purple-200">{result.adStrategy}</p>
                    </div>
                 </div>
              </div>

              {/* SWOT Matrix */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-t-4 border-green-500 p-5">
                   <h4 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center">
                      <ShieldCheck className="text-green-500 mr-2" size={20} />
                      Strengths (強み)
                   </h4>
                   <ul className="space-y-2">
                      {result.swot.strengths.map((item, i) => (
                        <li key={i} className="text-sm text-gray-600 dark:text-gray-300 flex items-start">
                           <span className="text-green-500 mr-2">•</span> {item}
                        </li>
                      ))}
                   </ul>
                </div>

                {/* Weaknesses */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-t-4 border-red-400 p-5">
                   <h4 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center">
                      <ShieldAlert className="text-red-400 mr-2" size={20} />
                      Weaknesses (弱み)
                   </h4>
                   <ul className="space-y-2">
                      {result.swot.weaknesses.map((item, i) => (
                        <li key={i} className="text-sm text-gray-600 dark:text-gray-300 flex items-start">
                           <span className="text-red-400 mr-2">•</span> {item}
                        </li>
                      ))}
                   </ul>
                </div>

                {/* Opportunities */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-t-4 border-blue-400 p-5">
                   <h4 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center">
                      <TrendingUp className="text-blue-400 mr-2" size={20} />
                      Opportunities (機会)
                   </h4>
                   <ul className="space-y-2">
                      {result.swot.opportunities.map((item, i) => (
                        <li key={i} className="text-sm text-gray-600 dark:text-gray-300 flex items-start">
                           <span className="text-blue-400 mr-2">•</span> {item}
                        </li>
                      ))}
                   </ul>
                </div>

                {/* Threats */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-t-4 border-orange-400 p-5">
                   <h4 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center">
                      <AlertTriangle className="text-orange-400 mr-2" size={20} />
                      Threats (脅威)
                   </h4>
                   <ul className="space-y-2">
                      {result.swot.threats.map((item, i) => (
                        <li key={i} className="text-sm text-gray-600 dark:text-gray-300 flex items-start">
                           <span className="text-orange-400 mr-2">•</span> {item}
                        </li>
                      ))}
                   </ul>
                </div>
              </div>

              {/* Counter Strategy */}
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 dark:from-gray-700 dark:to-gray-800 rounded-xl shadow-lg p-6 text-white">
                 <h4 className="font-bold text-lg mb-2 flex items-center">
                    <ArrowRight className="mr-2 text-yellow-400" />
                    推奨される対抗策
                 </h4>
                 <p className="text-gray-200 leading-relaxed">
                    {result.counterStrategy}
                 </p>
              </div>
              
              <div className="text-xs text-gray-400 text-center mt-4">
                 ※ この分析はAIによる推測であり、実際の内部情報とは異なる場合があります。
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
