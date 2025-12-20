import React, { useState } from 'react';
import { Tag, Hash, Ban, Search, Copy, Check, Sparkles } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { KeywordSuggestionResult } from '../types';

export const KeywordSuggestion: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KeywordSuggestionResult | null>(null);
  const [copiedGroup, setCopiedGroup] = useState<string | null>(null);

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
    setResult(null);
    try {
      const data = await Api.suggestKeywords(formData.productName, formData.description);
      setResult(data);
    } catch (error) {
      console.error(error);
      alert('生成中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (items: string[], groupName: string, prefix = '') => {
    const text = items.map(item => `${prefix}${item}`).join(' ');
    navigator.clipboard.writeText(text);
    setCopiedGroup(groupName);
    setTimeout(() => setCopiedGroup(null), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <Tag className="mr-2 text-indigo-600 dark:text-indigo-400" />
             キーワード・ハッシュタグ提案
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             商品情報を入力すると、SEOキーワード、Instagramハッシュタグ、広告除外キーワードをAIが提案します。
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
                  placeholder="例: スマート名刺管理アプリ"
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
                  placeholder="例: スマホで撮影するだけで名刺をデジタル化。AIが自動で情報を補正し、CRMとも連携可能。個人事業主から中小企業まで幅広く利用可能。"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                  required
                />
              </div>

              <div className="pt-2">
                <Button type="submit" className="w-full" isLoading={loading} icon={<Tag size={16} />}>
                  キーワードを分析
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Results Area */}
        <div className="lg:col-span-2 space-y-6">
          {loading && !result && (
             <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <p>AIが市場トレンドとキーワードを分析中...</p>
             </div>
          )}

          {!loading && !result && (
            <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl min-h-[400px]">
               <Tag size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
               <p className="text-center">左側のフォームを入力して<br/>「キーワードを分析」ボタンを押してください。</p>
            </div>
          )}

          {result && (
            <div className="space-y-6 animate-fade-in-up">
              
              {/* SEO Keywords Section */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                       <Search className="mr-2 text-blue-500" size={20} />
                       SEO キーワード
                    </h3>
                 </div>
                 
                 <div className="space-y-4">
                    {/* High Volume */}
                    <div>
                       <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">ビッグワード (検索ボリューム大)</h4>
                          <button 
                             onClick={() => copyToClipboard(result.seoKeywords.highVolume, 'seo_high')}
                             className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center"
                          >
                             {copiedGroup === 'seo_high' ? <Check size={12} className="mr-1"/> : <Copy size={12} className="mr-1"/>}
                             すべてコピー
                          </button>
                       </div>
                       <div className="flex flex-wrap gap-2">
                          {result.seoKeywords.highVolume.map((kw, i) => (
                             <span key={i} className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium">
                                {kw}
                             </span>
                          ))}
                       </div>
                    </div>

                    {/* Long Tail */}
                    <div>
                       <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">ロングテール (購買意欲高)</h4>
                          <button 
                             onClick={() => copyToClipboard(result.seoKeywords.longTail, 'seo_long')}
                             className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center"
                          >
                             {copiedGroup === 'seo_long' ? <Check size={12} className="mr-1"/> : <Copy size={12} className="mr-1"/>}
                             すべてコピー
                          </button>
                       </div>
                       <div className="flex flex-wrap gap-2">
                          {result.seoKeywords.longTail.map((kw, i) => (
                             <span key={i} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm">
                                {kw}
                             </span>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>

              {/* Hashtags Section */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                       <Hash className="mr-2 text-pink-500" size={20} />
                       Instagram ハッシュタグ
                    </h3>
                 </div>
                 
                 <div className="space-y-4">
                    {/* Popular */}
                    <div>
                       <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">人気・定番タグ</h4>
                          <button 
                             onClick={() => copyToClipboard(result.hashtags.popular, 'hash_pop', '#')}
                             className="text-xs text-pink-600 dark:text-pink-400 hover:underline flex items-center"
                          >
                             {copiedGroup === 'hash_pop' ? <Check size={12} className="mr-1"/> : <Copy size={12} className="mr-1"/>}
                             すべてコピー
                          </button>
                       </div>
                       <div className="flex flex-wrap gap-2">
                          {result.hashtags.popular.map((tag, i) => (
                             <span key={i} className="px-3 py-1.5 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 rounded-lg text-sm font-medium">
                                #{tag}
                             </span>
                          ))}
                       </div>
                    </div>

                    {/* Niche */}
                    <div>
                       <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">ニッチ・関連タグ</h4>
                          <button 
                             onClick={() => copyToClipboard(result.hashtags.niche, 'hash_niche', '#')}
                             className="text-xs text-pink-600 dark:text-pink-400 hover:underline flex items-center"
                          >
                             {copiedGroup === 'hash_niche' ? <Check size={12} className="mr-1"/> : <Copy size={12} className="mr-1"/>}
                             すべてコピー
                          </button>
                       </div>
                       <div className="flex flex-wrap gap-2">
                          {result.hashtags.niche.map((tag, i) => (
                             <span key={i} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm">
                                #{tag}
                             </span>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>

              {/* Negative Keywords Section */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                       <Ban className="mr-2 text-red-500" size={20} />
                       推奨除外キーワード (Negative Keywords)
                    </h3>
                    <button 
                       onClick={() => copyToClipboard(result.negativeKeywords, 'negative')}
                       className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center"
                    >
                       {copiedGroup === 'negative' ? <Check size={12} className="mr-1"/> : <Copy size={12} className="mr-1"/>}
                       すべてコピー
                    </button>
                 </div>
                 <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    広告の無駄クリックを防ぐため、以下のキーワードを除外設定することをおすすめします。
                 </p>
                 <div className="flex flex-wrap gap-2">
                    {result.negativeKeywords.map((kw, i) => (
                       <span key={i} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm border border-red-100 dark:border-red-800">
                          {kw}
                       </span>
                    ))}
                 </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};
