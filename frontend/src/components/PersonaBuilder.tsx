import React, { useState } from 'react';
import { Users, UserPlus, Heart, Frown, Target, Briefcase, Sparkles, Hash } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { TargetPersona } from '../types';

export const PersonaBuilder: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TargetPersona[]>([]);
  
  const [formData, setFormData] = useState({
    productName: '',
    description: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.productName || !formData.description) return;

    setLoading(true);
    setResults([]);
    try {
      const personas = await Api.generatePersonas(formData.productName, formData.description);
      setResults(personas);
    } catch (error) {
      console.error(error);
      alert('生成中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <UserPlus className="mr-2 text-indigo-600 dark:text-indigo-400" />
             ターゲットペルソナ生成
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             商品について教えてください。AIが最適なターゲット顧客像（ペルソナ）を3パターン具体化し、Meta広告のターゲティング設定を提案します。
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Input Form */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sticky top-24">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <Sparkles size={18} className="mr-2 text-indigo-500" />
              商品情報
            </h3>
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  商品・サービス名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="productName"
                  value={formData.productName}
                  onChange={handleChange}
                  placeholder="例: オーガニック・プロテイン"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  商品・サービス概要 <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={5}
                  placeholder="例: 人工甘味料不使用、植物性100%。忙しい朝でも手軽に栄養補給できる、働く女性向けのプロテイン。パッケージがおしゃれでキッチンに置いても違和感がない。"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                  required
                />
              </div>

              <div className="pt-2">
                <Button type="submit" className="w-full" isLoading={loading} icon={<UserPlus size={16} />}>
                  ペルソナを生成
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Results Area */}
        <div className="lg:col-span-2 space-y-6">
          {loading && results.length === 0 && (
             <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <p>AIがターゲット層を分析・生成中...</p>
             </div>
          )}

          {!loading && results.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl min-h-[400px]">
               <Users size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
               <p className="text-center">左側のフォームを入力して<br/>「ペルソナを生成」ボタンを押してください。</p>
            </div>
          )}

          {results.map((persona, idx) => (
            <div key={idx} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-fade-in-up" style={{ animationDelay: `${idx * 150}ms` }}>
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Persona {idx + 1}</span>
                        <h3 className="text-xl font-bold mt-1">{persona.label}</h3>
                    </div>
                    <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm">
                        <Users size={24} className="text-white" />
                    </div>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Demographics & Psychographics */}
                <div className="space-y-6">
                    {/* Demographics */}
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                            <Briefcase size={16} className="mr-2 text-indigo-500" />
                            基本属性 (Demographics)
                        </h4>
                        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                            <li className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-1">
                                <span className="text-gray-500 dark:text-gray-400">年齢</span>
                                <span className="font-medium">{persona.demographics.age}</span>
                            </li>
                            <li className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-1">
                                <span className="text-gray-500 dark:text-gray-400">性別</span>
                                <span className="font-medium">{persona.demographics.gender}</span>
                            </li>
                            <li className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-1">
                                <span className="text-gray-500 dark:text-gray-400">職業</span>
                                <span className="font-medium">{persona.demographics.occupation}</span>
                            </li>
                            <li className="flex justify-between pb-1">
                                <span className="text-gray-500 dark:text-gray-400">収入イメージ</span>
                                <span className="font-medium">{persona.demographics.income}</span>
                            </li>
                        </ul>
                    </div>

                    {/* Psychographics */}
                    <div className="space-y-4">
                         <div>
                            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                                <Frown size={16} className="mr-2 text-red-500" />
                                悩み・課題 (Pain Points)
                            </h4>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                {persona.psychographics.painPoints.map((p, i) => (
                                    <li key={i}>{p}</li>
                                ))}
                            </ul>
                         </div>
                         <div>
                            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                                <Heart size={16} className="mr-2 text-pink-500" />
                                興味・関心 (Interests)
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {persona.psychographics.interests.map((tag, i) => (
                                    <span key={i} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                         </div>
                    </div>
                </div>

                {/* Right Column: Meta Targeting */}
                <div className="flex flex-col h-full">
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-5 border border-indigo-100 dark:border-indigo-800 flex-1">
                        <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 mb-4 flex items-center">
                            <Target size={18} className="mr-2 text-indigo-600 dark:text-indigo-400" />
                            推奨 Meta広告ターゲティング
                        </h4>
                        
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-2 font-medium">興味・関心設定 (Detailed Targeting)</p>
                                <div className="space-y-2">
                                    {persona.metaTargeting.map((kw, i) => (
                                        <div key={i} className="flex items-center bg-white dark:bg-gray-800 px-3 py-2 rounded border border-indigo-100 dark:border-gray-700 shadow-sm">
                                            <Hash size={14} className="text-indigo-400 mr-2" />
                                            <span className="text-sm text-gray-800 dark:text-gray-200">{kw}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-white/60 dark:bg-gray-800/60 rounded p-3 text-xs text-indigo-800 dark:text-indigo-300">
                                <p className="leading-relaxed">
                                    <span className="font-bold">Pro Tip:</span> これらのキーワードを「詳細ターゲット設定」に入力し、Metaの「おすすめ」機能を使って関連する類似キーワードをさらに広げるのが効果的です。
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
