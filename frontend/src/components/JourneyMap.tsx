import React, { useState, useEffect } from 'react';
import { Map, UserPlus, Target, Sparkles, Activity, Layers, FileText, X, Copy, Check, Loader2, Trash2, Share2, Briefcase, Lightbulb, Video } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { JourneyStage, CreativeBrief } from '../types';
import { useToast } from './ui/Toast';

export const JourneyMap: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [journey, setJourney] = useState<JourneyStage[]>([]);
  const [formData, setFormData] = useState({
    persona: '',
    product: ''
  });

  // Brief Generation State
  const [generatingBrief, setGeneratingBrief] = useState<string | null>(null); // stageName
  const [selectedBrief, setSelectedBrief] = useState<{ stage: string, brief: CreativeBrief } | null>(null);
  const [copied, setCopied] = useState(false);
  
  const { addToast } = useToast();

  // Load from local storage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('ad_analyzer_journey_map');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setJourney(parsed.journey || []);
        setFormData(parsed.formData || { persona: '', product: '' });
      } catch (e) {
        console.error("Failed to load saved journey map", e);
      }
    }
  }, []);

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem('ad_analyzer_journey_map', JSON.stringify({
      journey,
      formData
    }));
  }, [journey, formData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.persona || !formData.product) return;

    setLoading(true);
    setJourney([]);
    setSelectedBrief(null);
    try {
      const result = await Api.generateJourneyMap(formData.persona, formData.product);
      setJourney(result);
      addToast('ジャーニーマップを生成しました', 'success');
    } catch (error) {
      console.error(error);
      addToast('生成中にエラーが発生しました', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateBrief = async (stage: JourneyStage) => {
    setGeneratingBrief(stage.stageName);
    try {
      const brief = await Api.generateCreativeBrief(stage, formData.product, formData.persona);
      setSelectedBrief({ stage: stage.stageName, brief });
      addToast('クリエイティブ指示書を作成しました', 'success');
    } catch (error) {
        console.error(error);
        addToast('クリエイティブ指示書の生成に失敗しました', 'error');
    } finally {
        setGeneratingBrief(null);
    }
  };

  const copyBriefToClipboard = () => {
      if (!selectedBrief) return;
      const text = `
【クリエイティブ指示書 - ${selectedBrief.stage}】
ターゲット: ${selectedBrief.brief.target}
目的: ${selectedBrief.brief.objective}
コアメッセージ: ${selectedBrief.brief.coreMessage}
ビジュアルの方向性: ${selectedBrief.brief.visualDirection}
トーン＆マナー: ${selectedBrief.brief.toneOfVoice}
コピー案:
${selectedBrief.brief.copyIdeas.map(c => `- ${c}`).join('\n')}
      `;
      navigator.clipboard.writeText(text);
      setCopied(true);
      addToast('クリップボードにコピーしました', 'success');
      setTimeout(() => setCopied(false), 2000);
  };

  const clearData = () => {
      if(confirm('データをリセットしますか？')) {
          setJourney([]);
          setFormData({ persona: '', product: '' });
          setSelectedBrief(null);
          localStorage.removeItem('ad_analyzer_journey_map');
          addToast('データをリセットしました', 'info');
      }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <Map className="mr-2 text-indigo-600 dark:text-indigo-400" />
             カスタマージャーニーマップ & クリエイティブ指示書
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             ペルソナの心理変容（ジャーニー）を可視化し、各フェーズに最適なクリエイティブ指示書を生成します。
           </p>
        </div>
        <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={clearData} icon={<Trash2 size={14}/>}>
                リセット
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Input Panel */}
        <div className="lg:col-span-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sticky top-24">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <Target size={18} className="mr-2 text-indigo-500" />
                    前提条件
                </h3>
                <form onSubmit={handleGenerate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            商品・サービス名 <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            name="product"
                            value={formData.product}
                            onChange={handleChange}
                            placeholder="例: 高級スキンケアセット"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            ターゲットペルソナ <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            name="persona"
                            value={formData.persona}
                            onChange={handleChange}
                            rows={4}
                            placeholder="例: 30代後半の働く女性。肌の衰えを感じ始めているが、忙しくてケアに時間をかけられない。オーガニック志向がある。"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                            required
                        />
                    </div>

                    <Button type="submit" className="w-full" isLoading={loading} icon={<Map size={16} />}>
                        ジャーニーマップを生成
                    </Button>
                </form>
            </div>
        </div>

        {/* Journey Map & Brief Display */}
        <div className="lg:col-span-8 space-y-6">
            {!loading && journey.length === 0 && (
                 <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 min-h-[400px]">
                    <Layers size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                    <p className="text-center">前提条件を入力して<br/>「ジャーニーマップを生成」してください。</p>
                 </div>
            )}

            {loading && (
                 <div className="h-full flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 min-h-[400px]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                    <p className="text-gray-500 dark:text-gray-400">ユーザー心理を分析中...</p>
                 </div>
            )}

            {journey.length > 0 && (
                <div className="space-y-6 animate-fade-in-up">
                    <div className="relative">
                        {/* Vertical Timeline for Mobile, Horizontal for Desktop might be hard, stick to Cards */}
                        <div className="space-y-4">
                            {journey.map((stage, idx) => (
                                <div key={idx} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
                                    <div className={`px-6 py-3 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center ${
                                        idx === 0 ? 'bg-blue-50 dark:bg-blue-900/20' : 
                                        idx === 1 ? 'bg-indigo-50 dark:bg-indigo-900/20' : 
                                        idx === 2 ? 'bg-purple-50 dark:bg-purple-900/20' : 
                                        idx === 3 ? 'bg-pink-50 dark:bg-pink-900/20' : 
                                        'bg-green-50 dark:bg-green-900/20'
                                    }`}>
                                        <div className="flex items-center">
                                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-gray-800 text-xs font-bold mr-3 shadow-sm border border-gray-100 dark:border-gray-600">
                                                {idx + 1}
                                            </span>
                                            <h3 className="font-bold text-gray-800 dark:text-white">{stage.stageName}</h3>
                                        </div>
                                        <Button 
                                            size="sm" 
                                            variant="outline" 
                                            onClick={() => handleGenerateBrief(stage)}
                                            isLoading={generatingBrief === stage.stageName}
                                            icon={<FileText size={14}/>}
                                        >
                                            指示書作成
                                        </Button>
                                    </div>
                                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center">
                                                <Activity size={12} className="mr-1"/> ユーザー心理 (Mindset)
                                            </h4>
                                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-gray-700/30 p-3 rounded-lg">
                                                {stage.userMindset}
                                            </p>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center">
                                                    <Target size={12} className="mr-1"/> 広告アングル
                                                </h4>
                                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                                    {stage.adAngle}
                                                </p>
                                            </div>
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1 mr-2">
                                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center">
                                                        <Video size={12} className="mr-1"/> 推奨フォーマット
                                                    </h4>
                                                    <p className="text-xs text-gray-600 dark:text-gray-300">{stage.creativeFormat}</p>
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center">
                                                        <Activity size={12} className="mr-1"/> 重要KPI
                                                    </h4>
                                                    <div className="flex flex-wrap gap-1">
                                                        {stage.keyMetrics.map((m, i) => (
                                                            <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                                                                {m}
                                                            </span>
                                                        ))}
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
            )}
        </div>
      </div>

      {/* Creative Brief Modal */}
      {selectedBrief && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-80 transition-opacity" aria-hidden="true" onClick={() => setSelectedBrief(null)}></div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700/50">
                 <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                    <FileText className="mr-2 text-indigo-500" size={20} />
                    クリエイティブ指示書 ({selectedBrief.stage})
                 </h3>
                 <button onClick={() => setSelectedBrief(null)} className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                    <X size={20} />
                 </button>
              </div>
              
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">ターゲット詳細</h4>
                        <p className="text-sm text-gray-800 dark:text-gray-200">{selectedBrief.brief.target}</p>
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">目的 (Objective)</h4>
                        <p className="text-sm text-gray-800 dark:text-gray-200">{selectedBrief.brief.objective}</p>
                    </div>
                 </div>

                 <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
                    <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 mb-2 flex items-center">
                        <Target size={16} className="mr-2"/> コアメッセージ
                    </h4>
                    <p className="text-base font-medium text-indigo-800 dark:text-indigo-200">
                        "{selectedBrief.brief.coreMessage}"
                    </p>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 flex items-center">
                            <Sparkles size={12} className="mr-1"/> ビジュアルの方向性
                        </h4>
                        <p className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/30 p-3 rounded-lg">
                            {selectedBrief.brief.visualDirection}
                        </p>
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 flex items-center">
                            <Lightbulb size={12} className="mr-1"/> トーン＆マナー
                        </h4>
                        <p className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/30 p-3 rounded-lg">
                            {selectedBrief.brief.toneOfVoice}
                        </p>
                    </div>
                 </div>

                 <div>
                    <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">コピーアイデア</h4>
                    <ul className="space-y-2">
                        {selectedBrief.brief.copyIdeas.map((copy, i) => (
                            <li key={i} className="flex items-start bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600 shadow-sm">
                                <span className="text-indigo-500 font-bold mr-3">{i+1}.</span>
                                <span className="text-sm text-gray-800 dark:text-gray-200">{copy}</span>
                            </li>
                        ))}
                    </ul>
                 </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 flex justify-end space-x-3">
                 <Button variant="secondary" onClick={() => setSelectedBrief(null)}>
                    閉じる
                 </Button>
                 <Button onClick={copyBriefToClipboard} icon={copied ? <Check size={16}/> : <Copy size={16}/>}>
                    {copied ? 'コピーしました' : 'クリップボードにコピー'}
                 </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};