import React, { useState } from 'react';
import { PenTool, Copy, Check, Sparkles, Wand2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { GeneratedAdCopy } from '../types';
import { useToast } from './ui/Toast';

export const AdGenerator: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GeneratedAdCopy[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    productName: '',
    targetAudience: '',
    sellingPoints: '',
    tone: '親しみやすい'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.productName || !formData.sellingPoints) {
      addToast('商品名と訴求ポイントを入力してください', 'error');
      return;
    }

    setLoading(true);
    setResults([]);
    try {
      const copies = await Api.generateAdCopies(formData);
      
      // Debug: Log results (only in development)
      if (import.meta.env.DEV) {
        console.log('[AdGenerator] Generated copies:', copies);
        console.log('[AdGenerator] Copies count:', copies?.length);
      }
      
      if (!copies || copies.length === 0) {
        addToast('コピーが生成されませんでした。もう一度お試しください。', 'error');
        return;
      }
      
      setResults(copies);
      addToast(`広告コピーを${copies.length}件生成しました`, 'success');
    } catch (error: any) {
      console.error('[AdGenerator] Error:', error);
      const errorMessage = error?.message || '生成中にエラーが発生しました';
      addToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    addToast('コピーをクリップボードに保存しました', 'success');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <PenTool className="mr-2 text-indigo-600 dark:text-indigo-400" />
             AI広告コピー生成
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             商品情報を入力すると、AIがMeta広告向けの効果的なコピー案を自動生成します。
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Input Form */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sticky top-24">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <Wand2 size={18} className="mr-2 text-indigo-500" />
              生成条件
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
                  placeholder="例: AdAnalyzer Pro"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ターゲット層
                </label>
                <input
                  type="text"
                  name="targetAudience"
                  value={formData.targetAudience}
                  onChange={handleChange}
                  placeholder="例: 30代のマーケティング担当者、効率化したい人"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  訴求ポイント・特徴 <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="sellingPoints"
                  value={formData.sellingPoints}
                  onChange={handleChange}
                  rows={4}
                  placeholder="例: AIが自動で広告分析、レポート作成時間を90%削減、ROAS改善提案機能付き"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  トーン＆マナー
                </label>
                <select
                  name="tone"
                  value={formData.tone}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="親しみやすい">親しみやすい・フレンドリー</option>
                  <option value="プロフェッショナル">プロフェッショナル・信頼感</option>
                  <option value="緊急感・限定感">緊急感・限定感（セールなど）</option>
                  <option value="高級感">高級感・ラグジュアリー</option>
                  <option value="ユーモア">ユーモア・面白い</option>
                </select>
              </div>

              <div className="pt-2">
                <Button type="submit" className="w-full" isLoading={loading} icon={<Sparkles size={16} />}>
                  コピーを生成する
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
                <p>AIが最適な広告コピーを考案中...</p>
             </div>
          )}

          {!loading && results.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
               <Sparkles size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
               <p className="text-center">左側のフォームを入力して<br/>「コピーを生成する」ボタンを押してください。</p>
            </div>
          )}

          {results.map((item, idx) => (
            <div key={idx} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-all hover:shadow-md animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
              <div className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 px-6 py-3 flex justify-between items-center">
                <h4 className="font-bold text-gray-700 dark:text-gray-200">案 {idx + 1}</h4>
                <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 rounded">
                  AI推奨
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                {/* Headline Section */}
                <div className="group relative">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">見出し (Headline)</label>
                    <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-lg font-bold text-gray-900 dark:text-white pr-10">
                        {item.headline}
                    </div>
                    <button 
                        onClick={() => copyToClipboard(item.headline, idx * 10 + 1)}
                        className="absolute right-2 top-6 p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        title="コピー"
                    >
                        {copiedIndex === idx * 10 + 1 ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                </div>

                {/* Primary Text Section */}
                <div className="group relative">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">メインテキスト (Primary Text)</label>
                    <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-gray-700 dark:text-gray-300 whitespace-pre-wrap pr-10 min-h-[80px]">
                        {item.primaryText}
                    </div>
                    <button 
                        onClick={() => copyToClipboard(item.primaryText, idx * 10 + 2)}
                        className="absolute right-2 top-6 p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        title="コピー"
                    >
                        {copiedIndex === idx * 10 + 2 ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                </div>

                {/* Explanation */}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-start">
                        <Sparkles size={16} className="text-yellow-500 mt-1 mr-2 flex-shrink-0" />
                        <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                            <span className="font-semibold not-italic">解説: </span>
                            {item.explanation}
                        </p>
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