import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Upload, CheckCircle, AlertTriangle, Lightbulb, Zap, Type, MousePointer } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { CreativeAnalysisResult } from '../types';

export const CreativeDiagnostic: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreativeAnalysisResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    if (file.type.startsWith('image/')) {
      setFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null); // Clear previous result
    } else {
      alert("画像ファイルのみアップロード可能です。");
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      alert('画像をアップロードしてください。');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const data = await Api.analyzeCreative(file);
      
      // Debug: Log result (only in development)
      if (import.meta.env.DEV) {
        console.log('[CreativeDiagnostic] Analysis result:', data);
        console.log('[CreativeDiagnostic] Scores:', data?.scores);
      }
      
      if (!data || !data.scores) {
        throw new Error('分析結果が正しく取得できませんでした。');
      }
      
      setResult(data);
    } catch (error: any) {
      console.error('[CreativeDiagnostic] Error:', error);
      const errorMessage = error?.message || '分析中にエラーが発生しました。';
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const ScoreBar: React.FC<{ label: string; score: number; icon: React.ReactNode }> = ({ label, score, icon }) => (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
           {icon}
           <span className="ml-2">{label}</span>
        </span>
        <span className="text-sm font-bold text-gray-900 dark:text-white">{score} / 10</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
        <div 
          className={`h-2.5 rounded-full ${score >= 8 ? 'bg-green-500' : score >= 5 ? 'bg-yellow-500' : 'bg-red-500'}`} 
          style={{ width: `${score * 10}%` }}
        ></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <ImageIcon className="mr-2 text-indigo-600 dark:text-indigo-400" />
             クリエイティブ診断
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             広告バナー画像をアップロードしてください。AIが「視認性」「読みやすさ」などを視覚的に分析・診断します。
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upload Area */}
        <div>
          <div 
             className={`relative h-full min-h-[400px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center p-8 transition-colors ${
               dragActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'
             } bg-white dark:bg-gray-800`}
             onDragEnter={handleDrag}
             onDragLeave={handleDrag}
             onDragOver={handleDrag}
             onDrop={handleDrop}
          >
             {!previewUrl ? (
               <>
                 <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
                   <Upload className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                 </div>
                 <p className="text-lg font-medium text-gray-900 dark:text-white mb-1">画像をドラッグ＆ドロップ</p>
                 <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">または</p>
                 <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                   ファイルを選択
                 </Button>
               </>
             ) : (
               <div className="relative w-full h-full flex flex-col items-center">
                  <img src={previewUrl} alt="Preview" className="max-h-[350px] object-contain rounded-lg shadow-md mb-4" />
                  <div className="flex space-x-3">
                     <Button onClick={handleAnalyze} isLoading={loading} icon={<Zap size={16}/>}>
                       この画像を診断する
                     </Button>
                     <Button onClick={() => { setFile(null); setPreviewUrl(null); setResult(null); }} variant="secondary">
                       リセット
                     </Button>
                  </div>
               </div>
             )}
             <input
               ref={fileInputRef}
               type="file"
               accept="image/*"
               className="hidden"
               onChange={handleChange}
             />
          </div>
        </div>

        {/* Results Area */}
        <div>
           {loading && (
             <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">AIが画像を解析中...</p>
                <p className="text-xs text-gray-400 mt-2">デザインの構成要素、テキスト、色使いを評価しています</p>
             </div>
           )}

           {!loading && !result && (
             <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 text-gray-400">
                <ImageIcon size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                <p>画像をアップロードして診断を開始してください</p>
             </div>
           )}

           {result && result.scores && (
             <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 animate-fade-in-up h-full overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                   <h3 className="text-lg font-bold text-gray-900 dark:text-white">診断レポート</h3>
                   <div className="flex flex-col items-end">
                      <span className="text-xs text-gray-500 dark:text-gray-400">総合スコア</span>
                      <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{(result.scores?.overall ?? 0)}/10</span>
                   </div>
                </div>

                {/* Scores */}
                <div className="mb-8">
                   <ScoreBar label="視覚的インパクト" score={result.scores?.visualImpact ?? 0} icon={<Zap size={16} className="text-yellow-500"/>} />
                   <ScoreBar label="テキストの読みやすさ" score={result.scores?.textReadability ?? 0} icon={<Type size={16} className="text-blue-500"/>} />
                   <ScoreBar label="CTAの明確さ" score={result.scores?.ctaClarity ?? 0} icon={<MousePointer size={16} className="text-purple-500"/>} />
                </div>

                {/* Analysis */}
                <div className="space-y-6">
                   <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                      <h4 className="font-bold text-green-800 dark:text-green-300 mb-2 flex items-center">
                         <CheckCircle size={16} className="mr-2" />
                         評価ポイント (Strengths)
                      </h4>
                      <ul className="space-y-1">
                         {(result.strengths || []).map((item, i) => (
                            <li key={i} className="text-sm text-green-700 dark:text-green-200 ml-6 list-disc">{item}</li>
                         ))}
                      </ul>
                   </div>

                   <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                      <h4 className="font-bold text-yellow-800 dark:text-yellow-300 mb-2 flex items-center">
                         <Lightbulb size={16} className="mr-2" />
                         改善提案 (Improvements)
                      </h4>
                      <ul className="space-y-1">
                         {(result.improvements || []).map((item, i) => (
                            <li key={i} className="text-sm text-yellow-700 dark:text-yellow-200 ml-6 list-disc">{item}</li>
                         ))}
                      </ul>
                   </div>

                   <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                      <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">AI総評</h4>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic">
                         "{result.critique || '分析結果が取得できませんでした。'}"
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
