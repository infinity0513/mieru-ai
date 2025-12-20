import React, { useState, useMemo } from 'react';
import { FileText, Copy, Check, Send, Settings, Calendar, RefreshCw, Filter, X } from 'lucide-react';
import { Button } from './ui/Button';
import { Api } from '../services/api';
import { ReportConfig, CampaignData } from '../types';
import { useToast } from './ui/Toast';

interface SmartReportGeneratorProps {
  data: CampaignData[];
}

export const SmartReportGenerator: React.FC<SmartReportGeneratorProps> = ({ data }) => {
  const [loading, setLoading] = useState(false);
  const [reportText, setReportText] = useState('');
  const [copied, setCopied] = useState(false);
  const { addToast } = useToast();

  const [config, setConfig] = useState<ReportConfig>({
    periodType: 'last7days', // デフォルトを過去7日間に変更
    format: 'client_email',
    tone: 'formal'
  });

  // Get unique campaigns from data
  const availableCampaigns = useMemo(() => {
    const campaigns = Array.from(new Set(data.map(d => d.campaign_name))).sort();
    return campaigns;
  }, [data]);

  // Selected campaign state (single selection, null means "all")
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);

  // Selected year state (for yearly reports)
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Get available years from data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    data.forEach(d => {
      const year = new Date(d.date).getFullYear();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a); // 降順（最新年が先頭）
  }, [data]);

  // Select campaign (radio button - single selection)
  const selectCampaign = (campaignName: string | null) => {
    setSelectedCampaign(campaignName);
  };

  // Filter data by selected campaign and period
  const filteredData = useMemo(() => {
    let filtered = data;
    
    // Filter by campaign (null means "all")
    if (selectedCampaign) {
      filtered = filtered.filter(d => d.campaign_name === selectedCampaign);
    }
    
    // Filter by period
    if (config.periodType === 'all') {
      // 年別選択の場合、選択された年でフィルタリング
      if (selectedYear !== null) {
        filtered = filtered.filter(d => {
          const year = new Date(d.date).getFullYear();
          return year === selectedYear;
        });
      }
      // selectedYearがnullの場合は全期間（年別集計用）
    } else {
      // ダッシュボードと同じ計算方法を使用（昨日までを基準にする）
      const now = new Date();
      
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1); // 昨日
      yesterday.setHours(23, 59, 59, 999); // 昨日の23:59:59
      
      // ダッシュボードと同じ日付範囲を計算
      let startDate: Date;
      let endDate: Date;
      
      if (config.periodType === 'last7days') {
        // ダッシュボードと同じ: 昨日を含めて過去7日間
        // 開始日 = 昨日 - (7 - 1) = 昨日 - 6日
        endDate = new Date(yesterday);
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date(yesterday);
        startDate.setDate(yesterday.getDate() - (7 - 1));
        startDate.setHours(0, 0, 0, 0);
      } else if (config.periodType === 'last30days') {
        // ダッシュボードと同じ: 昨日を含めて過去30日間
        // 開始日 = 昨日 - (30 - 1) = 昨日 - 29日
        endDate = new Date(yesterday);
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date(yesterday);
        startDate.setDate(yesterday.getDate() - (30 - 1));
        startDate.setHours(0, 0, 0, 0);
      } else {
        // その他の期間タイプ
        endDate = new Date(yesterday);
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date(yesterday);
        startDate.setHours(0, 0, 0, 0);
      }
      
      filtered = filtered.filter(d => {
        const date = new Date(d.date);
        // ダッシュボードと同じ比較方法を使用
        date.setHours(12, 0, 0, 0);
        
        // 比較用のstartとendを準備（ダッシュボードと同じ方法）
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        
        switch (config.periodType) {
          case 'last7days':
          case 'last30days':
            // ダッシュボードと同じ日付範囲でフィルタリング
            return date >= start && date <= end;
          case 'thisMonth':
            // 今月の1日から昨日まで
            const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            return date >= thisMonthStart && date <= yesterday;
          case 'lastMonth':
            // 先月の1日から月末まで
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            return date >= lastMonthStart && date <= lastMonthEnd;
          default:
            return true;
        }
      });
    }
    
    return filtered;
  }, [data, selectedCampaign, config.periodType, selectedYear]);

  const handleGenerate = async () => {
    if (filteredData.length === 0) {
      addToast('レポート対象のデータがありません。', 'error');
      return;
    }

    setLoading(true);
    setReportText('');
    try {
      // 年別選択の場合、selectedYearを渡す
      const text = await Api.generateSmartReport(filteredData, config, selectedYear);
      setReportText(text);
      addToast('レポートが生成されました', 'success');
    } catch (error: any) {
      console.error(error);
      addToast(error.message || 'レポート生成中にエラーが発生しました', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    addToast('レポートをクリップボードにコピーしました', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfigChange = (field: keyof ReportConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  if (data.length === 0) {
    return <div className="text-center py-20 text-gray-500 dark:text-gray-400">データがありません。先にデータをアップロードしてください。</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <FileText className="mr-2 text-indigo-600 dark:text-indigo-400" />
             スマートレポート生成
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             実績データから、クライアントやチーム向けの報告テキストをAIが自動作成します。
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Configuration Panel */}
        <div className="lg:col-span-1">
           <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sticky top-24">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                 <Settings size={18} className="mr-2 text-indigo-500" />
                 レポート設定
              </h3>
              
              <div className="space-y-5">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                      <Filter size={14} className="mr-1" />
                      対象キャンペーン（1つ選択）
                    </label>
                    <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2 space-y-2 bg-gray-50 dark:bg-gray-700/30">
                      {/* 全体オプション */}
                      <label
                        className="flex items-center space-x-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="campaign-selection"
                          checked={selectedCampaign === null}
                          onChange={() => selectCampaign(null)}
                          className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">全体</span>
                        {selectedCampaign === null && (
                          <span className="text-xs text-indigo-600 dark:text-indigo-400">
                            ({filteredData.length}件)
                          </span>
                        )}
                      </label>
                      
                      {/* キャンペーン一覧 */}
                      {availableCampaigns.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">キャンペーンがありません</p>
                      ) : (
                        availableCampaigns.map(campaign => (
                          <label
                            key={campaign}
                            className="flex items-center space-x-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name="campaign-selection"
                              checked={selectedCampaign === campaign}
                              onChange={() => selectCampaign(campaign)}
                              className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{campaign}</span>
                            {selectedCampaign === campaign && (
                              <span className="text-xs text-indigo-600 dark:text-indigo-400">
                                ({filteredData.filter(d => d.campaign_name === campaign).length}件)
                              </span>
                            )}
                          </label>
                        ))
                      )}
                    </div>
                    {selectedCampaign && (
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                          {selectedCampaign}
                          <button
                            onClick={() => setSelectedCampaign(null)}
                            className="ml-1 hover:text-indigo-600"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      </div>
                    )}
                    {selectedCampaign === null && (
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                          全体
                        </span>
                      </div>
                    )}
                 </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">対象期間</label>
                    <div className="grid grid-cols-2 gap-2">
                       <button 
                          onClick={() => {
                            handleConfigChange('periodType', 'last7days');
                            setSelectedYear(null);
                          }}
                          className={`px-3 py-2 text-sm rounded-lg border ${config.periodType === 'last7days' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                       >
                          過去7日間
                       </button>
                       <button 
                          onClick={() => {
                            handleConfigChange('periodType', 'last30days');
                            setSelectedYear(null);
                          }}
                          className={`px-3 py-2 text-sm rounded-lg border ${config.periodType === 'last30days' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                       >
                          過去30日間
                       </button>
                       <button 
                          onClick={() => {
                            handleConfigChange('periodType', 'thisMonth');
                            setSelectedYear(null);
                          }}
                          className={`px-3 py-2 text-sm rounded-lg border ${config.periodType === 'thisMonth' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                       >
                          今月
                       </button>
                       <button 
                          onClick={() => {
                            handleConfigChange('periodType', 'lastMonth');
                            setSelectedYear(null);
                          }}
                          className={`px-3 py-2 text-sm rounded-lg border ${config.periodType === 'lastMonth' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                       >
                          先月
                       </button>
                       <button 
                          onClick={() => {
                            handleConfigChange('periodType', 'all');
                            // 年別を選択したら、最初の年を自動選択（またはnullで全期間）
                            if (availableYears.length > 0 && selectedYear === null) {
                              setSelectedYear(availableYears[0]);
                            }
                          }}
                          className={`px-3 py-2 text-sm rounded-lg border col-span-2 ${config.periodType === 'all' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                       >
                          年別
                       </button>
                    </div>
                    
                    {/* 年別選択時の年選択UI */}
                    {config.periodType === 'all' && availableYears.length > 0 && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">対象年を選択</label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setSelectedYear(null)}
                            className={`px-3 py-1.5 text-xs rounded-lg border ${
                              selectedYear === null
                                ? 'bg-indigo-100 border-indigo-500 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                                : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            全期間
                          </button>
                          {availableYears.map(year => (
                            <button
                              key={year}
                              onClick={() => setSelectedYear(year)}
                              className={`px-3 py-1.5 text-xs rounded-lg border ${
                                selectedYear === year
                                  ? 'bg-indigo-100 border-indigo-500 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                                  : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {year}年
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                 </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">報告フォーマット</label>
                    <select 
                       value={config.format}
                       onChange={(e) => handleConfigChange('format', e.target.value)}
                       className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                       <option value="client_email">クライアント向けメール (丁寧・詳細)</option>
                       <option value="internal_slack">社内Slack速報 (箇条書き・要点のみ)</option>
                       <option value="executive_summary">役員向けサマリー (ROI重視)</option>
                    </select>
                 </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">文章のトーン</label>
                    <div className="flex space-x-2">
                       {['formal', 'casual', 'bullet_points'].map((t) => (
                          <button
                             key={t}
                             onClick={() => handleConfigChange('tone', t)}
                             className={`flex-1 py-2 text-xs font-medium rounded-lg border ${config.tone === t ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                          >
                             {t === 'formal' ? '標準' : t === 'casual' ? '柔らかめ' : '箇条書き'}
                          </button>
                       ))}
                    </div>
                 </div>

                 <div className="pt-2">
                    <Button onClick={handleGenerate} className="w-full py-3" isLoading={loading} icon={<Send size={16} />}>
                       レポートを作成
                    </Button>
                 </div>
              </div>
           </div>
        </div>

        {/* Output Panel */}
        <div className="lg:col-span-2">
           {!reportText && !loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl min-h-[500px]">
                <FileText size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-center">左側の設定を選んで<br/>「レポートを作成」ボタンを押してください。</p>
             </div>
           )}

           {loading && (
             <div className="h-full flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 min-h-[500px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">実績データを集計し、レポートを執筆中...</p>
             </div>
           )}

           {reportText && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col animate-fade-in-up">
                 <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 rounded-t-xl">
                    <h3 className="font-bold text-gray-700 dark:text-gray-200 flex items-center">
                       <Check size={18} className="mr-2 text-green-500" />
                       生成完了
                    </h3>
                    <div className="flex space-x-2">
                       <Button variant="secondary" size="sm" onClick={handleGenerate} icon={<RefreshCw size={14}/>}>
                          再生成
                       </Button>
                       <Button size="sm" onClick={copyToClipboard} icon={copied ? <Check size={14}/> : <Copy size={14}/>}>
                          {copied ? 'コピーしました' : 'クリップボードにコピー'}
                       </Button>
                    </div>
                 </div>
                 <div className="flex-1 p-0">
                    <textarea 
                       className="w-full h-full min-h-[500px] p-6 text-gray-800 dark:text-gray-200 bg-transparent border-none focus:ring-0 resize-none font-mono text-sm leading-relaxed"
                       value={reportText}
                       onChange={(e) => setReportText(e.target.value)}
                    ></textarea>
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  );
};