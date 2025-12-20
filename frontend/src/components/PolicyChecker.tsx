import React, { useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle, Info, Edit3 } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { PolicyCheckResult } from '../types';

export const PolicyChecker: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PolicyCheckResult | null>(null);
  const [adText, setAdText] = useState('');

  const handleCheck = async () => {
    if (!adText.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await Api.checkAdPolicy(adText);
      setResult(data);
    } catch (error) {
      console.error(error);
      alert('チェック中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'SAFE') {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
          <ShieldCheck className="w-4 h-4 mr-2" />
          承認される可能性が高い
        </span>
      );
    }
    if (status === 'WARNING') {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300">
          <AlertTriangle className="w-4 h-4 mr-2" />
          注意が必要（要修正）
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">
        <ShieldAlert className="w-4 h-4 mr-2" />
        審査落ちのリスク大
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <Shield className="mr-2 text-indigo-600 dark:text-indigo-400" />
             広告ポリシーチェッカー
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             Meta広告のポリシー（個人属性、誇大広告など）に抵触していないか、AIが事前審査します。
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Area */}
        <div className="flex flex-col h-full">
           <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 flex-1 flex flex-col">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                チェックする広告テキスト (メインテキスト・見出し)
              </label>
              <textarea
                value={adText}
                onChange={(e) => setAdText(e.target.value)}
                placeholder="例: たった1週間で-5kg！誰でも簡単に痩せられる魔法のサプリメントが登場。..."
                className="w-full flex-1 min-h-[200px] p-4 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500 resize-none text-base"
              />
              <div className="mt-4 flex justify-end">
                 <Button onClick={handleCheck} isLoading={loading} icon={<ShieldCheck size={16} />}>
                   ポリシー違反をチェック
                 </Button>
              </div>
           </div>
        </div>

        {/* Results Area */}
        <div>
           {loading && (
             <div className="h-full min-h-[300px] flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">ポリシー違反をスキャン中...</p>
             </div>
           )}

           {!loading && !result && (
             <div className="h-full min-h-[300px] flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 text-gray-400">
                <Shield size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                <p>テキストを入力してチェックを開始してください</p>
             </div>
           )}

           {result && (
             <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 h-full animate-fade-in-up">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
                   <StatusBadge status={result.status} />
                   <div className="text-right">
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">安全性スコア</span>
                      <span className={`text-2xl font-bold ${result.safetyScore > 80 ? 'text-green-600' : result.safetyScore > 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {result.safetyScore}/100
                      </span>
                   </div>
                </div>

                <div className="mb-6">
                   <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                      {result.overallComment}
                   </p>
                </div>

                {result.violations.length === 0 ? (
                   <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-lg text-center">
                      <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                      <h4 className="text-lg font-bold text-green-800 dark:text-green-300">問題は見つかりませんでした</h4>
                      <p className="text-green-700 dark:text-green-400 text-sm mt-2">この広告テキストはMetaの広告ポリシーに準拠している可能性が高いです。</p>
                   </div>
                ) : (
                   <div className="space-y-4">
                      <h4 className="font-bold text-gray-900 dark:text-white flex items-center">
                         <AlertTriangle size={18} className="mr-2 text-yellow-500" />
                         検知されたリスク ({result.violations.length}件)
                      </h4>
                      {result.violations.map((v, i) => (
                         <div key={i} className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg p-4">
                            <div className="flex justify-between items-start mb-2">
                               <span className={`text-xs font-bold px-2 py-0.5 rounded ${v.severity === 'HIGH' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'}`}>
                                  {v.category}
                               </span>
                            </div>
                            <div className="mb-3">
                               <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">対象箇所:</p>
                               <p className="font-medium text-red-700 dark:text-red-300 bg-white dark:bg-gray-800 p-2 rounded border border-red-100 dark:border-red-900/50 text-sm">
                                  "{v.segment}"
                               </p>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                               <span className="font-bold">理由:</span> {v.reason}
                            </p>
                            <div className="flex items-start bg-green-50 dark:bg-green-900/20 p-3 rounded">
                               <Edit3 size={14} className="text-green-600 dark:text-green-400 mt-0.5 mr-2 flex-shrink-0" />
                               <div className="text-sm">
                                  <span className="font-bold text-green-800 dark:text-green-300">修正案:</span>
                                  <p className="text-green-700 dark:text-green-200 mt-1">{v.suggestion}</p>
                               </div>
                            </div>
                         </div>
                      ))}
                   </div>
                )}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};
