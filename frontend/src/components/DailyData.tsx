import React, { useState, useMemo, useEffect } from 'react';
import { CampaignData } from '../types';
import { Calendar, Table as TableIcon, ExternalLink, Download, Upload, Link as LinkIcon, Target, MousePointer } from 'lucide-react';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import { Api } from '../services/api';

interface DailyDataProps {
  data: CampaignData[];
}

export const DailyData: React.FC<DailyDataProps> = ({ data: propData }) => {
  const [selectedDateRange, setSelectedDateRange] = useState<{ start: string; end: string } | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const { addToast } = useToast();
  
  // JST基準で日付文字列を生成（YYYY-MM-DD形式）
  const formatDateJST = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // JST基準（0時）で日付文字列をパース（YYYY-MM-DD形式）
  const parseDateJST = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day); // ローカル時刻（JST）で作成
  };
  
  // Asset selection state
  const [metaAccounts, setMetaAccounts] = useState<Array<{ account_id: string; name: string; data_count: number; latest_date: string | null }>>([]);
  const [selectedMetaAccountId, setSelectedMetaAccountId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('dailydata_selectedMetaAccountId');
      return saved !== null && saved !== '' ? saved : null;
    } catch (e) {
      return null;
    }
  });
  const [apiData, setApiData] = useState<CampaignData[]>([]);
  const [allApiData, setAllApiData] = useState<CampaignData[]>([]); // 全期間データ（ダッシュボードと同じロジック）
  const [loading, setLoading] = useState(false);

  // キャンペーン別にスプレッドシートURLを読み込む
  const loadSpreadsheetUrl = (campaign: string | null): string => {
    try {
      const key = campaign ? `dailydata_spreadsheet_${campaign}` : 'dailydata_spreadsheet_all';
      const saved = localStorage.getItem(key);
      return saved || '';
    } catch (e) {
      return '';
    }
  };

  // キャンペーン別にスプレッドシートURLを保存する
  const saveSpreadsheetUrl = (campaign: string | null, url: string) => {
    try {
      const key = campaign ? `dailydata_spreadsheet_${campaign}` : 'dailydata_spreadsheet_all';
      localStorage.setItem(key, url);
    } catch (e) {
      // 無視
    }
  };

  // キャンペーンが変更されたときにURLを読み込む
  React.useEffect(() => {
    const savedUrl = loadSpreadsheetUrl(selectedCampaign);
    setSpreadsheetUrl(savedUrl);
  }, [selectedCampaign]);

  // Load meta accounts on mount (キャッシュを使用)
  useEffect(() => {
    console.log('[DailyData] useEffect for loadMetaAccounts triggered');
    const loadMetaAccounts = async () => {
      // まずキャッシュを確認
      try {
        const cachedAccounts = localStorage.getItem('dashboard_metaAccounts');
        const cacheTime = localStorage.getItem('dashboard_metaAccounts_time');
        const CACHE_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24時間キャッシュ有効（App.tsxと同じ）
        const isCacheValid = cacheTime && (Date.now() - parseInt(cacheTime)) < CACHE_VALIDITY_MS;
        
        if (cachedAccounts && isCacheValid) {
          try {
            const parsedAccounts = JSON.parse(cachedAccounts);
            if (parsedAccounts && parsedAccounts.length > 0) {
              console.log('[DailyData] Loaded meta accounts from cache:', parsedAccounts.length, 'accounts');
              setMetaAccounts(parsedAccounts);
              return; // キャッシュが有効な場合はAPI呼び出しをスキップ
            }
          } catch (e) {
            console.error('[DailyData] Failed to parse cached meta accounts:', e);
            localStorage.removeItem('dashboard_metaAccounts');
            localStorage.removeItem('dashboard_metaAccounts_time');
          }
        }
      } catch (e) {
        // 無視して続行
      }
      
      // キャッシュがない、または期限切れの場合のみAPIから取得
      try {
        console.log('[DailyData] Calling Api.getMetaAccounts()');
        const accounts = await Api.getMetaAccounts();
        console.log('[DailyData] Api.getMetaAccounts() completed, accounts count:', accounts.accounts?.length || 0);
        setMetaAccounts(accounts.accounts || []);
        // localStorageにキャッシュを保存
        try {
          localStorage.setItem('dashboard_metaAccounts', JSON.stringify(accounts.accounts || []));
          localStorage.setItem('dashboard_metaAccounts_time', Date.now().toString());
        } catch (e) {
          console.error('[DailyData] Failed to cache meta accounts:', e);
        }
      } catch (error) {
        console.error('[DailyData] Failed to load meta accounts:', error);
      }
    };
    loadMetaAccounts();
  }, []);

  // Load data from API (ダッシュボードと同じロジック)
  useEffect(() => {
    const loadData = async () => {
        setLoading(true);
        try {
        // 1. 全期間データを取得（ダッシュボードと同じ）
        const allPeriodResult = await Promise.allSettled([
          Api.fetchCampaignData() // 全期間データを取得
        ]);
        
        let allPeriodData: CampaignData[] = [];
        if (allPeriodResult[0].status === 'fulfilled') {
          allPeriodData = allPeriodResult[0].value || [];
          console.log('[DailyData] All period data loaded:', allPeriodData.length, 'records');
        } else {
          console.error('[DailyData] Failed to load all period data:', allPeriodResult[0].reason);
        }
        
        // 全期間データをallApiDataに保存
        setAllApiData(allPeriodData);
        
        // 2. アセット選択時はallApiDataをフィルタリング（ダッシュボードと同じ）
        if (selectedMetaAccountId) {
          // データベースには act_ プレフィックス付きで保存されているので、それに合わせて比較
          const selectedAccountIdWithPrefix = selectedMetaAccountId.startsWith('act_') 
            ? selectedMetaAccountId 
            : `act_${selectedMetaAccountId}`;
          const filteredByAsset = allPeriodData.filter((d: CampaignData) => {
            const accountId = d.meta_account_id || (d as any).meta_account_id;
            return accountId === selectedAccountIdWithPrefix || accountId === selectedMetaAccountId;
          });
          setApiData(filteredByAsset);
          console.log('[DailyData] Filtered by asset:', filteredByAsset.length, 'records');
        } else {
          // 全アセット選択時はallApiDataを使用
          setApiData(allPeriodData);
        }
        } catch (error) {
          console.error('[DailyData] Failed to load campaign data:', error);
        setAllApiData([]);
          setApiData([]);
        } finally {
          setLoading(false);
      }
    };
    loadData();
  }, [selectedMetaAccountId]);

  // Determine which data source to use (ダッシュボードと同じロジック)
  const data = useMemo(() => {
    // allApiDataを優先してデータソースを統一（ダッシュボードと同じ）
    if (selectedMetaAccountId === 'all' || !selectedMetaAccountId) {
      // 「すべてのアカウント」が選択されている場合、またはアカウントが選択されていない場合
      // allApiDataを優先、なければapiData、それもなければpropData
      return (allApiData && allApiData.length > 0) 
        ? allApiData 
        : (apiData && apiData.length > 0 
          ? apiData 
          : (propData && propData.length > 0 ? propData : []));
      } else {
      // 特定のアカウントが選択されている場合
      if (allApiData && allApiData.length > 0) {
        // allApiDataをアセットでフィルタリング（既にapiDataに設定されているが、念のため）
        return apiData && apiData.length > 0 ? apiData : allApiData;
    } else {
        // allApiDataがない場合、propDataをフォールバックとして使用
        if (propData && propData.length > 0) {
          // データベースには act_ プレフィックス付きで保存されているので、それに合わせて比較
          const selectedAccountIdWithPrefix = selectedMetaAccountId.startsWith('act_') 
            ? selectedMetaAccountId 
            : `act_${selectedMetaAccountId}`;
          const propDataFiltered = propData.filter(d => {
            const accountId = d.meta_account_id || (d as any).meta_account_id;
            return accountId === selectedAccountIdWithPrefix || accountId === selectedMetaAccountId;
          });
          return propDataFiltered.length > 0 ? propDataFiltered : propData;
        }
        return apiData && apiData.length > 0 ? apiData : [];
      }
    }
  }, [propData, apiData, allApiData, selectedMetaAccountId]);

  // Get unique campaigns
  const availableCampaigns = useMemo(() => {
    const campaigns = new Set(data.map(d => d.campaign_name).filter(Boolean));
    return Array.from(campaigns).sort();
  }, [data]);

  // 全アセット選択時はキャンペーン選択を「すべて」に、特定アセット選択時は最初のキャンペーンを選択
  useEffect(() => {
    if (availableCampaigns.length > 0 && !selectedCampaign) {
      // 全アセットを選択している場合は「すべて」のまま（null）
      if (!selectedMetaAccountId) {
        // 全アセット選択時はキャンペーン選択を「すべて」のまま
        return;
      }
      
      // 特定アセット選択時は、ローカルストレージから保存された選択を確認
      try {
        const saved = localStorage.getItem(`dailydata_selectedCampaign_${selectedMetaAccountId}`);
        if (saved && availableCampaigns.includes(saved)) {
          setSelectedCampaign(saved);
        } else {
          // 保存された選択がない、または無効な場合は最初のキャンペーンを選択
          setSelectedCampaign(availableCampaigns[0]);
        }
      } catch (e) {
        // エラーが発生した場合は最初のキャンペーンを選択
        setSelectedCampaign(availableCampaigns[0]);
      }
    }
  }, [availableCampaigns, selectedCampaign, selectedMetaAccountId]);

  // アセット選択が変更されたときに、キャンペーン選択をリセット
  useEffect(() => {
    if (selectedMetaAccountId) {
      // 特定アセット選択時は、そのアセットの最初のキャンペーンを選択
      if (availableCampaigns.length > 0 && !selectedCampaign) {
        setSelectedCampaign(availableCampaigns[0]);
      }
    } else {
      // 全アセット選択時は必ずキャンペーン選択を「すべて」（null）に
      setSelectedCampaign(null);
      // ローカルストレージからも削除
      try {
        localStorage.removeItem('dailydata_selectedCampaign_all');
      } catch (e) {
        // エラーは無視
      }
    }
  }, [selectedMetaAccountId, availableCampaigns]);

  // Filter data by date range and campaign
  const filteredData = useMemo(() => {
    let filtered = [...data];

    // Filter by date range
    if (selectedDateRange) {
      filtered = filtered.filter(d => {
        // JST基準（0時）で日付文字列をパース
        const date = parseDateJST(d.date);
        const start = parseDateJST(selectedDateRange.start);
        const end = parseDateJST(selectedDateRange.end);
        return date >= start && date <= end;
      });
    }

    // Filter by campaign
    if (selectedCampaign) {
      filtered = filtered.filter(d => d.campaign_name === selectedCampaign);
    }

    // Sort by date descending
    return filtered.sort((a, b) => parseDateJST(b.date).getTime() - parseDateJST(a.date).getTime());
  }, [data, selectedDateRange, selectedCampaign]);

  // Group by date and calculate daily totals
  const dailyData = useMemo(() => {
    const grouped = new Map<string, {
      date: string;
      campaign_name: string;
      impressions: number;
      clicks: number;
      cost: number;
      conversions: number;
      conversion_value: number;
      reach: number;
      engagements: number;
      link_clicks: number;
      landing_page_views: number;
      // Calculated metrics
      roas: number;
      ctr: number;
      cvr: number;
      cpc: number;
      cpa: number;
      cpm: number;
      frequency: number;
      engagement_rate: number;
    }>();

    filteredData.forEach(d => {
      // 広告レベルのデータは個別に表示（ad_nameが存在する場合）
      // 広告セットレベルのデータも個別に表示（ad_set_nameが存在し、ad_nameが存在しない場合）
      // キャンペーンレベルのデータは日付+キャンペーンで集計
      const hasAdName = d.ad_name && d.ad_name.trim() !== '';
      const hasAdSetName = d.ad_set_name && d.ad_set_name.trim() !== '';
      
      let key: string;
      if (hasAdName) {
        // 広告レベルのデータ: 日付+キャンペーン+広告セット+広告でグループ化
        key = `${d.date}_${d.campaign_name}_${d.ad_set_name || ''}_${d.ad_name}`;
      } else if (hasAdSetName) {
        // 広告セットレベルのデータ: 日付+キャンペーン+広告セットでグループ化
        key = `${d.date}_${d.campaign_name}_${d.ad_set_name}`;
      } else {
        // キャンペーンレベルのデータ: 日付+キャンペーンでグループ化
        key = `${d.date}_${d.campaign_name}`;
      }
      
      const existing = grouped.get(key);
      
      if (existing) {
        existing.impressions += d.impressions;
        existing.clicks += d.clicks;
        existing.cost += d.cost;
        existing.conversions += d.conversions;
        existing.conversion_value += d.conversion_value;
        existing.reach += d.reach || 0;
        existing.engagements += d.engagements || 0;
        existing.link_clicks += d.link_clicks || 0;
        existing.landing_page_views += d.landing_page_views || 0;
      } else {
        grouped.set(key, {
          date: d.date,
          campaign_name: d.campaign_name,
          ad_set_name: d.ad_set_name || '',
          ad_name: d.ad_name || '',
          impressions: d.impressions,
          clicks: d.clicks,
          cost: d.cost,
          conversions: d.conversions,
          conversion_value: d.conversion_value,
          reach: d.reach || 0,
          engagements: d.engagements || 0,
          link_clicks: d.link_clicks || 0,
          landing_page_views: d.landing_page_views || 0,
          roas: 0,
          ctr: 0,
          cvr: 0,
          cpc: 0,
          cpa: 0,
          cpm: 0,
          frequency: 0,
          engagement_rate: 0,
        });
      }
    });

    // Calculate metrics for each day
    Array.from(grouped.values()).forEach(day => {
      day.roas = day.cost > 0 ? (day.conversion_value / day.cost * 100) : 0;
      day.ctr = day.impressions > 0 ? (day.clicks / day.impressions * 100) : 0;
      day.cvr = day.clicks > 0 ? (day.conversions / day.clicks * 100) : 0;
      day.cpc = day.clicks > 0 ? (day.cost / day.clicks) : 0;
      day.cpa = day.conversions > 0 ? (day.cost / day.conversions) : 0;
      day.cpm = day.impressions > 0 ? (day.cost / day.impressions * 1000) : 0;
      day.frequency = day.reach > 0 ? (day.impressions / day.reach) : 0;
      day.engagement_rate = day.impressions > 0 ? (day.engagements / day.impressions * 100) : 0;
    });

    // 全アセット選択時はキャンペーン毎にまとめてから日付順、特定アセット選択時は日付順
    return Array.from(grouped.values()).sort((a, b) => {
      // 全アセット選択時（selectedMetaAccountIdがnull）は、キャンペーン名でグループ化してから日付順
      if (!selectedMetaAccountId) {
        // まずキャンペーン名でソート
        const campaignCompare = (a.campaign_name || '').localeCompare(b.campaign_name || '');
        if (campaignCompare !== 0) return campaignCompare;
        
        // 同じキャンペーンの場合は日付でソート（新しい日付が上）
        const dateCompare = parseDateJST(b.date).getTime() - parseDateJST(a.date).getTime();
        if (dateCompare !== 0) return dateCompare;
        
        // 同じ日付の場合は広告セット名、広告名でソート
        const adSetCompare = (a.ad_set_name || '').localeCompare(b.ad_set_name || '');
        if (adSetCompare !== 0) return adSetCompare;
        
        return (a.ad_name || '').localeCompare(b.ad_name || '');
      } else {
        // 特定アセット選択時は日付順（従来通り）
      const dateCompare = parseDateJST(b.date).getTime() - parseDateJST(a.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      
      const campaignCompare = (a.campaign_name || '').localeCompare(b.campaign_name || '');
      if (campaignCompare !== 0) return campaignCompare;
      
      const adSetCompare = (a.ad_set_name || '').localeCompare(b.ad_set_name || '');
      if (adSetCompare !== 0) return adSetCompare;
      
      return (a.ad_name || '').localeCompare(b.ad_name || '');
      }
    });
  }, [filteredData, selectedMetaAccountId]);

  // Set default date range (last 30 days or all data)
  const setDefaultDateRange = () => {
    if (data.length === 0) return;
    // JST基準（0時）で日付文字列をパース
    const dates = data.map(d => parseDateJST(d.date).getTime());
    const maxDate = new Date(Math.max(...dates));
    const minDate = new Date(Math.min(...dates));
    setSelectedDateRange({
      start: formatDateJST(minDate),
      end: formatDateJST(maxDate),
    });
  };

  // Initialize date range on mount
  React.useEffect(() => {
    if (!selectedDateRange && data.length > 0) {
      setDefaultDateRange();
    }
  }, [data]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      '日付',
      'キャンペーン名',
      '広告セット名',
      '広告名',
      'インプレッション',
      'クリック数',
      '費用',
      'コンバージョン',
      'コンバージョン価値',
      'ROAS (%)',
      'CTR (%)',
      'CVR (%)',
      'CPC (¥)',
      'CPA (¥)',
      'CPM (¥)',
      'リーチ数',
      'フリークエンシー',
      'エンゲージメント率 (%)',
      'リンククリック数',
      'LPビュー数',
    ];

    const rows = dailyData.map(d => [
      d.date,
      d.campaign_name,
      d.ad_set_name || '',
      d.ad_name || '',
      d.impressions,
      d.clicks,
      d.cost,
      d.conversions,
      d.conversion_value,
      d.roas.toFixed(2),
      d.ctr.toFixed(2),
      d.cvr.toFixed(2),
      d.cpc.toFixed(2),
      d.cpa.toFixed(2),
      d.cpm.toFixed(2),
      d.reach,
      d.frequency.toFixed(2),
      d.engagement_rate.toFixed(2),
      d.link_clicks,
      d.landing_page_views,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `日別データ_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast('CSVファイルをダウンロードしました', 'success');
  };

  // Sync to Google Sheets
  const handleSyncToSheets = async () => {
    if (!spreadsheetUrl.trim()) {
      addToast('スプレッドシートのURLを入力してください', 'error');
      return;
    }

    // Extract spreadsheet ID from URL (support multiple URL formats)
    let spreadsheetId = '';
    const patterns = [
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
      /\/d\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = spreadsheetUrl.match(pattern);
      if (match) {
        spreadsheetId = match[1];
        break;
      }
    }

    if (!spreadsheetId) {
      addToast('無効なスプレッドシートURLです。正しいURLを入力してください。', 'error');
      return;
    }

    if (dailyData.length === 0) {
      addToast('表示するデータがありません', 'error');
      return;
    }

    setIsSyncing(true);
    try {
      // Prepare data for Google Sheets (tab-separated for better compatibility)
      const headers = [
        '日付',
        'キャンペーン名',
        '広告セット名',
        '広告名',
        'インプレッション',
        'クリック数',
        '費用',
        'コンバージョン',
        'コンバージョン価値',
        'ROAS (%)',
        'CTR (%)',
        'CVR (%)',
        'CPC (¥)',
        'CPA (¥)',
        'CPM (¥)',
        'リーチ数',
        'フリークエンシー',
        'エンゲージメント率 (%)',
        'リンククリック数',
        'LPビュー数',
      ];

      const values = dailyData.map(d => [
        d.date,
        d.campaign_name,
        d.ad_set_name || '',
        d.ad_name || '',
        d.impressions.toString(),
        d.clicks.toString(),
        d.cost.toString(),
        d.conversions.toString(),
        d.conversion_value.toString(),
        d.roas.toFixed(2),
        d.ctr.toFixed(2),
        d.cvr.toFixed(2),
        d.cpc.toFixed(2),
        d.cpa.toFixed(2),
        d.cpm.toFixed(2),
        d.reach.toString(),
        d.frequency.toFixed(2),
        d.engagement_rate.toFixed(2),
        d.link_clicks.toString(),
        d.landing_page_views.toString(),
      ]);

      // Create tab-separated content (Google Sheets prefers tabs)
      const tabContent = [
        headers.join('\t'),
        ...values.map(row => row.join('\t'))
      ].join('\n');

      // Try to copy to clipboard
      let copySuccess = false;
      try {
        // Modern clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(tabContent);
          copySuccess = true;
        } else {
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = tabContent;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          try {
            const successful = document.execCommand('copy');
            if (successful) {
              copySuccess = true;
            }
          } catch (err) {
            console.error('Fallback copy failed:', err);
          }
          document.body.removeChild(textArea);
        }
      } catch (err) {
        console.error('Clipboard copy failed:', err);
      }

      // Open Google Sheets
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      window.open(sheetUrl, '_blank');

      if (copySuccess) {
        addToast(
          `データをクリップボードにコピーしました（${dailyData.length}行）。スプレッドシートを開いて、セルA1を選択してCtrl+V（Mac: Cmd+V）で貼り付けてください。`,
          'success'
        );
      } else {
        // If clipboard copy failed, show data in a modal or textarea
        const dataText = tabContent;
        const modal = document.createElement('div');
        modal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
          background: white;
          padding: 20px;
          border-radius: 8px;
          max-width: 90%;
          max-height: 90%;
          overflow: auto;
        `;
        
        const title = document.createElement('h3');
        title.textContent = 'データをコピーしてください';
        title.style.cssText = 'margin-bottom: 10px; font-weight: bold;';
        
        const textarea = document.createElement('textarea');
        textarea.value = dataText;
        textarea.style.cssText = 'width: 100%; height: 400px; padding: 10px; font-family: monospace;';
        textarea.readOnly = true;
        
        const button = document.createElement('button');
        button.textContent = '閉じる';
        button.style.cssText = 'margin-top: 10px; padding: 8px 16px; background: #4F46E5; color: white; border: none; border-radius: 4px; cursor: pointer;';
        button.onclick = () => {
          document.body.removeChild(modal);
        };
        
        content.appendChild(title);
        content.appendChild(textarea);
        content.appendChild(button);
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Select all text in textarea
        textarea.select();
        
        addToast('クリップボードへのコピーに失敗しました。表示されたデータを手動でコピーしてください。', 'warning');
      }
      
    } catch (error) {
      console.error('Error syncing to sheets:', error);
      addToast('スプレッドシートへの同期に失敗しました', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <TableIcon size={24} />
            日別データ
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            アップロードしたデータを日別で確認できます
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Download size={16} />} onClick={handleExportCSV}>
            CSVエクスポート
          </Button>
        </div>
      </div>

      {/* Asset Selection */}
      {metaAccounts.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 p-5 rounded-xl border-2 border-indigo-200 dark:border-indigo-700 shadow-lg no-print">
          <div className="flex items-center gap-4">
            {/* ターゲットアイコン */}
            <div className="flex-shrink-0">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                <Target size={20} className="text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
            
            {/* アセット選択ラベル */}
            <div className="flex-shrink-0">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                アセット選択
              </span>
            </div>
            
            {/* ドロップダウンとカーソルアイコン */}
            <div className="flex items-center gap-2 flex-1">
              <select
                value={selectedMetaAccountId || ''}
                onChange={(e) => {
                  const newAccountId = e.target.value || null;
                  setSelectedMetaAccountId(newAccountId);
                  try {
                    localStorage.setItem('dailydata_selectedMetaAccountId', newAccountId || '');
                  } catch (err) {
                    console.error('[DailyData] Failed to save asset selection to localStorage:', err);
                  }
                }}
                className="max-w-md pl-4 pr-12 py-3 border-2 border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg text-base font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
              >
                <option value="">全アセットを表示</option>
                {metaAccounts.map((account) => (
                  <option key={account.account_id} value={account.account_id}>
                    {account.name} ({account.data_count}件)
                  </option>
                ))}
              </select>
              <MousePointer size={20} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
            </div>
            
            {/* フィルター適用中バッジ */}
            {selectedMetaAccountId && (
              <div className="flex-shrink-0">
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
                  フィルター適用中
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              開始日
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
              value={selectedDateRange?.start || ''}
              onChange={(e) => setSelectedDateRange(prev => ({
                start: e.target.value,
                end: prev?.end || ''
              }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              終了日
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
              value={selectedDateRange?.end || ''}
              onChange={(e) => setSelectedDateRange(prev => ({
                start: prev?.start || '',
                end: e.target.value
              }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              キャンペーン
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
              value={selectedCampaign || ''}
              onChange={(e) => {
                const newCampaign = e.target.value || null;
                setSelectedCampaign(newCampaign);
                // 選択をローカルストレージに保存（アセット別に保存）
                try {
                  const storageKey = selectedMetaAccountId 
                    ? `dailydata_selectedCampaign_${selectedMetaAccountId}`
                    : 'dailydata_selectedCampaign_all';
                  if (newCampaign) {
                    localStorage.setItem(storageKey, newCampaign);
                  } else {
                    localStorage.removeItem(storageKey);
                  }
                } catch (err) {
                  console.error('[DailyData] Failed to save campaign selection to localStorage:', err);
                }
              }}
            >
              <option value="">すべて</option>
              {availableCampaigns.length > 0 ? (
                availableCampaigns.map(campaign => (
                <option key={campaign} value={campaign}>{campaign}</option>
                ))
              ) : (
                <option value="" disabled>キャンペーンがありません</option>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Spreadsheet Sync */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <LinkIcon size={20} className="text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">スプレッドシート連携</h3>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="GoogleスプレッドシートのURLを入力"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
            value={spreadsheetUrl}
            onChange={(e) => {
              const newUrl = e.target.value;
              setSpreadsheetUrl(newUrl);
              // URLを変更したら即座に保存
              saveSpreadsheetUrl(selectedCampaign, newUrl);
            }}
          />
          <Button 
            variant="primary" 
            icon={<Upload size={16} />} 
            onClick={handleSyncToSheets}
            disabled={isSyncing}
          >
            {isSyncing ? '同期中...' : 'スプレッドシートに反映'}
          </Button>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 space-y-1">
          <p>GoogleスプレッドシートのURLを入力して「スプレッドシートに反映」をクリックしてください。</p>
          {selectedCampaign && (
            <p className="text-indigo-600 dark:text-indigo-400 font-semibold">
              ※ 現在選択中のキャンペーン「{selectedCampaign}」用のURLが保存されます。
            </p>
          )}
          {!selectedCampaign && (
            <p className="text-indigo-600 dark:text-indigo-400 font-semibold">
              ※ 「すべて」選択時は、全体用のURLが保存されます。
            </p>
          )}
          <p className="font-semibold text-indigo-600 dark:text-indigo-400 mt-2">手順：</p>
          <ol className="list-decimal list-inside ml-2 space-y-1">
            <li>スプレッドシートのURLを入力（自動保存されます）</li>
            <li>「スプレッドシートに反映」をクリック</li>
            <li>開いたスプレッドシートでセルA1を選択</li>
            <li>Ctrl+V（Mac: Cmd+V）で貼り付け</li>
          </ol>
          <p className="text-yellow-600 dark:text-yellow-400 mt-2">
            ※ クリップボードへのコピーが失敗した場合は、表示されたデータを手動でコピーしてください。
          </p>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 whitespace-nowrap">
                  日付
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky left-16 bg-gray-50 dark:bg-gray-900 z-10 whitespace-nowrap">
                  キャンペーン名
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  広告セット名
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  広告名
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  インプレッション
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  クリック数
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  費用
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  コンバージョン
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  コンバージョン価値
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  ROAS (%)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  CTR (%)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  CVR (%)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  CPC (¥)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  CPA (¥)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  CPM (¥)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  リーチ数
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  フリークエンシー
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  エンゲージメント率 (%)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  リンククリック数
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  LPビュー数
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={20} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 rounded-full"></div>
                      <p className="ml-4">データを読み込み中...</p>
                    </div>
                  </td>
                </tr>
              ) : dailyData.length === 0 ? (
                <tr>
                  <td colSpan={20} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    データがありません
                  </td>
                </tr>
              ) : (
                dailyData.map((row, idx) => (
                  <tr key={`${row.date}_${row.campaign_name}_${row.ad_set_name || ''}_${row.ad_name || ''}_${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 z-10">
                      {parseDateJST(row.date).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white sticky left-16 bg-white dark:bg-gray-800 z-10">
                      {row.campaign_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {row.ad_set_name || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {row.ad_name || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      {row.impressions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      {row.clicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      ¥{row.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      {row.conversions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      ¥{row.conversion_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      {row.roas.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      {row.ctr.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      {row.cvr.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      ¥{row.cpc.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      ¥{row.cpa.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      ¥{row.cpm.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      {row.reach > 0 ? row.reach.toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      {row.frequency > 0 ? row.frequency.toFixed(2) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      {row.engagement_rate > 0 ? `${row.engagement_rate.toFixed(2)}%` : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      {row.link_clicks > 0 ? row.link_clicks.toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right">
                      {row.landing_page_views > 0 ? row.landing_page_views.toLocaleString() : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      {dailyData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">合計</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">インプレッション</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {dailyData.reduce((sum, d) => sum + d.impressions, 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">クリック数</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {dailyData.reduce((sum, d) => sum + d.clicks, 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">費用</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                ¥{dailyData.reduce((sum, d) => sum + d.cost, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">コンバージョン</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {dailyData.reduce((sum, d) => sum + d.conversions, 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">コンバージョン価値</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                ¥{dailyData.reduce((sum, d) => sum + d.conversion_value, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">ROAS</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {(() => {
                  const totalCost = dailyData.reduce((sum, d) => sum + d.cost, 0);
                  const totalValue = dailyData.reduce((sum, d) => sum + d.conversion_value, 0);
                  return totalCost > 0 ? `${(totalValue / totalCost * 100).toFixed(2)}%` : '0%';
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
