import React, { useState, useMemo, useEffect } from 'react';
import { AlertOctagon, TrendingDown, TrendingUp, Activity, Search, ArrowRight, Zap, CheckCircle, Calendar, X, Filter } from 'lucide-react';
import { CampaignData } from '../types';
import { Api } from '../services/api';
import { Button } from './ui/Button';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ReferenceDot 
} from 'recharts';

interface AnomalyDetectorProps {
  data: CampaignData[];
  dateRange?: { start: string; end: string };
  searchQuery?: string;
}

interface Incident {
  id: string;
  date: string;
  type: string; // e.g., 'CPA Spike', 'ROAS Drop'
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  metricValue: number;
  metricLabel: string;
  comparison: string; // e.g., "+50% vs avg"
}

export const AnomalyDetector: React.FC<AnomalyDetectorProps> = ({ 
  data: propData, 
  dateRange: propDateRange,
  searchQuery: propSearchQuery = '' 
}) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  // State for API data (Dashboardと同じ方法でデータを取得)
  const [apiData, setApiData] = useState<CampaignData[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  
  // キャンペーン選択のstate（null = すべて、文字列 = キャンペーン名）
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('anomalyDetector_selectedCampaign');
      return saved || null;
    } catch (e) {
      return null;
    }
  });

  // 日付範囲を管理（Dashboardと同期）
  const [dateRange, setDateRange] = useState<{start: string, end: string} | undefined>(() => {
    // propsから取得、なければダッシュボードの設定を初期値として使用
    if (propDateRange) {
      console.log('[AnomalyDetector初期化] propsから取得:', propDateRange);
      return propDateRange;
    }
    try {
      // ダッシュボードの設定を初期値として使用（優先）
      const dashboardRange = localStorage.getItem('dashboard_dateRange');
      if (dashboardRange) {
        const parsed = JSON.parse(dashboardRange);
        if (parsed.start && parsed.end) {
          console.log('[AnomalyDetector初期化] dashboard_dateRangeから復元:', parsed);
          return parsed;
        }
      }
      // AnomalyDetector独自の設定があれば使用
      const saved = localStorage.getItem('anomalyDetector_dateRange');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.start && parsed.end) {
          console.log('[AnomalyDetector初期化] anomalyDetector_dateRangeから復元:', parsed);
          return parsed;
        }
      }
    } catch (e) {
      // 無視
    }
    // デフォルト値（昨日を基準に7日間）
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    const startDate = new Date(yesterday);
    startDate.setDate(yesterday.getDate() - 6); // 昨日から6日前
    startDate.setHours(0, 0, 0, 0);

    const defaultRange = {
      start: startDate.toISOString().split('T')[0],
      end: yesterday.toISOString().split('T')[0],
    };

    console.log('[AnomalyDetector初期化] デフォルト値:', defaultRange);
    console.log('[AnomalyDetector初期化] 実際の今日:', now.toISOString().split('T')[0]);
    return defaultRange;
  });
  
  // Load data from API (Dashboardと同じ方法)
  useEffect(() => {
    const loadData = async () => {
      if (!dateRange) return;
      
      setDataLoading(true);
      try {
        const campaignsResult = await Api.fetchCampaignData();
        
        // Dashboardと同じ方法でフィルタリング（ただし、ここでは日付範囲のみ）
        // 検索クエリのフィルタリングは後でfilteredDataで行う
        const filteredCampaigns = campaignsResult.filter((c: CampaignData) => {
          const cDate = new Date(c.date);
          const start = new Date(dateRange.start);
          const end = new Date(dateRange.end);
          return cDate >= start && cDate <= end;
        });
        
        setApiData(filteredCampaigns);
      } catch (error) {
        console.error('Failed to load anomaly detector data:', error);
        // API取得失敗時は、propDataがある場合はそれを使用、なければ以前のapiDataを保持
        if (propData && propData.length > 0) {
          setApiData(propData);
        }
      } finally {
        setDataLoading(false);
      }
    };
    
    loadData();
  }, [dateRange?.start, dateRange?.end, propData]);

  // Use API data if available, otherwise fallback to prop data (Dashboardと同じ方法)
  const data = apiData.length > 0 ? apiData : propData;
  
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    if (propSearchQuery) return propSearchQuery;
    try {
      const saved = localStorage.getItem('anomalyDetector_searchQuery');
      if (saved !== null) {
        return saved;
      }
    } catch (e) {
      // 無視
    }
    return '';
  });

  // 日付範囲をlocalStorageに保存（Dashboardと同期）
  useEffect(() => {
    if (dateRange) {
      try {
        // Dashboardと同じキーに保存して同期
        localStorage.setItem('dashboard_dateRange', JSON.stringify(dateRange));
        localStorage.setItem('anomalyDetector_dateRange', JSON.stringify(dateRange));
        console.log('[AnomalyDetector] dateRange更新:', dateRange);
      } catch (e) {
        // 無視
      }
    }
  }, [dateRange]);

  // DashboardのdateRange変更を監視して同期
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const dashboardRange = localStorage.getItem('dashboard_dateRange');
        if (dashboardRange) {
          const parsed = JSON.parse(dashboardRange);
          if (parsed.start && parsed.end) {
            // 現在のdateRangeと異なる場合のみ更新
            if (!dateRange || dateRange.start !== parsed.start || dateRange.end !== parsed.end) {
              console.log('[AnomalyDetector] dashboard_dateRangeの変更を検知、同期:', parsed);
              setDateRange(parsed);
            }
          }
        }
      } catch (e) {
        // 無視
      }
    };

    // 初回チェック
    handleStorageChange();

    // storageイベントを監視（他のタブからの変更も検知）
    window.addEventListener('storage', handleStorageChange);

    // 定期的にチェック（同じタブ内での変更も検知）
    const interval = setInterval(handleStorageChange, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [dateRange]);

  // 検索クエリをlocalStorageに保存
  useEffect(() => {
    try {
      localStorage.setItem('anomalyDetector_searchQuery', searchQuery);
    } catch (e) {
      // 無視
    }
  }, [searchQuery]);

  // 選択されたキャンペーンをlocalStorageに保存
  useEffect(() => {
    try {
      if (selectedCampaign) {
        localStorage.setItem('anomalyDetector_selectedCampaign', selectedCampaign);
      } else {
        localStorage.removeItem('anomalyDetector_selectedCampaign');
      }
    } catch (e) {
      // 無視
    }
  }, [selectedCampaign]);

  // 利用可能なキャンペーンリストを取得
  const availableCampaigns = useMemo(() => {
    if (data.length === 0) return [];
    const campaigns = new Set<string>();
    data.forEach(d => {
      if (d.campaign_name) {
        campaigns.add(d.campaign_name);
      }
    });
    return Array.from(campaigns).sort();
  }, [data]);

  // ダッシュボードと同じフィルタリングロジックを適用
  const filteredData = useMemo(() => {
    if (data.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[AnomalyDetector] No data available');
      }
      return [];
    }
    
    // 日付範囲と検索クエリでフィルタリング（ダッシュボードと同じ方法）
    let filtered = [...data];
    const beforeCount = filtered.length;
    
    // 日付範囲でフィルタリング
    if (dateRange) {
      filtered = filtered.filter(d => {
        const dDate = new Date(d.date);
        const start = new Date(dateRange.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateRange.end);
        end.setHours(23, 59, 59, 999);
        const current = new Date(d.date);
        current.setHours(12, 0, 0, 0);
        return current >= start && current <= end;
      });
      
      // デバッグログ
      if (process.env.NODE_ENV === 'development') {
        console.log('[AnomalyDetector] Date filtering:', {
          dateRange: dateRange,
          beforeCount: beforeCount,
          afterCount: filtered.length,
          sampleDates: filtered.slice(0, 3).map(d => d.date)
        });
      }
    }
    
    // 検索クエリでフィルタリング
    if (searchQuery) {
      filtered = filtered.filter(d => 
        d.campaign_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // キャンペーン選択でフィルタリング
    if (selectedCampaign) {
      filtered = filtered.filter(d => d.campaign_name === selectedCampaign);
    }
    
    return filtered;
  }, [data, dateRange, searchQuery, selectedCampaign]);

  // Group data by date - ダッシュボードのtrendDataと完全に同じ計算方法を使用
  const dailyData = useMemo(() => {
    if (filteredData.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[AnomalyDetector] No filtered data for daily grouping');
      }
      return [];
    }
    
    // ダッシュボードのtrendDataの計算方法を完全に再現
    // ダッシュボードでは filteredData を reverse() して使用
    const reversed = [...filteredData].reverse(); // ダッシュボードと同じくreverseを使用
    const groupedMap = new Map<string, any>();
    
    reversed.forEach(curr => {
        const existing = groupedMap.get(curr.date);
        if (existing) {
            // 既存の日付データに加算（ダッシュボードと同じ方法）
            existing.cost += curr.cost;
            existing.clicks += curr.clicks;
            existing.conversions += curr.conversions;
            existing.conversion_value += curr.conversion_value;
            // AnomalyDetectorではimpressionsも必要（CPA/ROAS計算に使用）
            existing.impressions = (existing.impressions || 0) + (curr.impressions || 0);
        } else {
            // 新しい日付データを作成（ダッシュボードと同じ方法）
            // ダッシュボードでは {...curr, campaign_name: 'Aggregated'} を使用
            groupedMap.set(curr.date, { 
                ...curr,  // ダッシュボードと同じ方法でスプレッド演算子を使用
                campaign_name: 'Aggregated',
                impressions: curr.impressions || 0  // impressionsを明示的に設定
            });
        }
    });

    // ダッシュボードのtrendDataと同じ計算ロジック
    const grouped = Array.from(groupedMap.values());
    grouped.forEach(g => {
        // ダッシュボードのtrendDataと同じ計算方法（完全に一致させる）
        // ダッシュボード: g.roas = g.cost > 0 ? (g.conversion_value / g.cost * 100) : 0;
        g.roas = g.cost > 0 ? (g.conversion_value / g.cost * 100) : 0;
        // AnomalyDetectorで必要な追加計算
        g.cpa = g.conversions > 0 ? g.cost / g.conversions : 0;
        g.ctr = g.impressions > 0 ? (g.clicks / g.impressions) * 100 : 0;
        g.cpc = g.clicks > 0 ? g.cost / g.clicks : 0;
        g.cvr = g.clicks > 0 ? (g.conversions / g.clicks) * 100 : 0;
    });

    // 日付順にソート（グラフ表示用）
    const sorted = grouped.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // デバッグ用: 最初の数件をログ出力
    if (process.env.NODE_ENV === 'development' && sorted.length > 0) {
      console.log('[AnomalyDetector] Daily data sample:', sorted.slice(0, 5).map(d => ({
        date: d.date,
        cost: d.cost,
        conversions: d.conversions,
        conversion_value: d.conversion_value,
        cpa: d.cpa,
        roas: d.roas
      })));
      
      // 特定の日付（12月16日、17日、18日）のデータを詳細にログ出力
      const targetDates = ['2024-12-16', '2024-12-17', '2024-12-18'];
      const targetData = sorted.filter(d => targetDates.includes(d.date));
      if (targetData.length > 0) {
        console.log('[AnomalyDetector] Target dates (12/16-18) detailed data:', targetData.map(d => ({
          date: d.date,
          cost: d.cost,
          impressions: d.impressions,
          clicks: d.clicks,
          conversions: d.conversions,
          conversion_value: d.conversion_value,
          cpa: d.cpa,
          roas: d.roas,
          ctr: d.ctr,
          cpc: d.cpc,
          cvr: d.cvr
        })));
      }
      
      // 期間全体の合計値を計算（Dashboardとの整合性確認用）
      const totalCost = sorted.reduce((acc, d) => acc + d.cost, 0);
      const totalConversions = sorted.reduce((acc, d) => acc + d.conversions, 0);
      const totalValue = sorted.reduce((acc, d) => acc + d.conversion_value, 0);
      const avgRoas = totalCost > 0 ? (totalValue / totalCost * 100) : 0;
      const avgCpa = totalConversions > 0 ? (totalCost / totalConversions) : 0;
      
      // filteredDataから直接計算した値も出力（比較用）
      const directTotalCost = filteredData.reduce((acc, d) => acc + d.cost, 0);
      const directTotalConversions = filteredData.reduce((acc, d) => acc + d.conversions, 0);
      const directTotalValue = filteredData.reduce((acc, d) => acc + d.conversion_value, 0);
      const directAvgRoas = directTotalCost > 0 ? (directTotalValue / directTotalCost * 100) : 0;
      const directAvgCpa = directTotalConversions > 0 ? (directTotalCost / directTotalConversions) : 0;
      
      console.log('[AnomalyDetector] Period totals (for comparison with Dashboard):', {
        dateRange: dateRange,
        searchQuery: searchQuery,
        filteredDataCount: filteredData.length,
        dailyDataCount: sorted.length,
        // 日次データから集計した値
        fromDailyData: {
          totalCost: totalCost,
          totalConversions: totalConversions,
          totalValue: totalValue,
          avgRoas: avgRoas,
          avgCpa: avgCpa
        },
        // filteredDataから直接計算した値
        fromFilteredData: {
          totalCost: directTotalCost,
          totalConversions: directTotalConversions,
          totalValue: directTotalValue,
          avgRoas: directAvgRoas,
          avgCpa: directAvgCpa
        },
        // 整合性チェック
        consistencyCheck: {
          costMatches: Math.abs(totalCost - directTotalCost) < 0.01,
          conversionsMatch: totalConversions === directTotalConversions,
          valueMatches: Math.abs(totalValue - directTotalValue) < 0.01,
          roasMatches: Math.abs(avgRoas - directAvgRoas) < 0.01,
          cpaMatches: Math.abs(avgCpa - directAvgCpa) < 0.01
        },
        // 日次データの詳細（最初と最後の3日）
        dailyDataDetails: {
          first3Days: sorted.slice(0, 3).map(d => ({
            date: d.date,
            cost: d.cost,
            conversions: d.conversions,
            conversion_value: d.conversion_value,
            cpa: d.cpa,
            roas: d.roas
          })),
          last3Days: sorted.slice(-3).map(d => ({
            date: d.date,
            cost: d.cost,
            conversions: d.conversions,
            conversion_value: d.conversion_value,
            cpa: d.cpa,
            roas: d.roas
          }))
        }
      });
    }
    
    return sorted;
  }, [filteredData, dateRange]); // dateRangeも依存関係に追加

  // Detect Anomalies
  useEffect(() => {
    // データが少ない場合は早期リターン（ただし、データが0件の場合は空配列を設定）
    if (dailyData.length === 0) {
      setIncidents([]);
      return;
    }
    
    // データが7日未満の場合は、利用可能なデータで計算（最小2日必要）
    if (dailyData.length < 2) {
      setIncidents([]);
      return;
    }

    const detected: Incident[] = [];
    // windowSizeの計算を改善：最小3日、最大7日、データが少ない場合は利用可能な最大値
    // ただし、windowSizeはデータ数の半分以下で、かつ最小3日必要
    const minWindowSize = 3;
    const maxWindowSize = 7;
    const windowSize = Math.min(
      maxWindowSize,
      Math.max(minWindowSize, Math.floor(dailyData.length / 2))
    );
    
    // デバッグログ
    if (process.env.NODE_ENV === 'development') {
      console.log('[AnomalyDetector] Detecting anomalies:', {
        dailyDataLength: dailyData.length,
        windowSize: windowSize,
        dateRange: dateRange,
        dailyDataDates: dailyData.map(d => d.date),
        dailyDataSample: dailyData.slice(0, 3).map(d => ({
          date: d.date,
          cost: d.cost,
          conversions: d.conversions,
          conversion_value: d.conversion_value,
          cpa: d.cpa,
          roas: d.roas
        }))
      });
    }

    // windowSize以上のデータがある場合のみ検出を実行
    if (dailyData.length >= windowSize + 1) {
    for (let i = windowSize; i < dailyData.length; i++) {
        const current = dailyData[i];
        const pastWindow = dailyData.slice(i - windowSize, i);
        
        // Calculate Moving Averages
          const avgCpa = pastWindow.reduce((sum, d) => sum + (d.cpa || 0), 0) / windowSize;
          const avgRoas = pastWindow.reduce((sum, d) => sum + (d.roas || 0), 0) / windowSize;
        
        // Skip if volume is too low to be statistically significant
        if (current.conversions < 2) continue;
          
          // Skip if averages are invalid
          if (avgCpa <= 0 || avgRoas <= 0) continue;

        // Rule 1: CPA Spike (> 1.5x average)
          if (current.cpa > avgCpa * 1.5) {
              const percentIncrease = Math.round((current.cpa - avgCpa) / avgCpa * 100);
              // デバッグログ（特定の日付を検証する場合）
              if (process.env.NODE_ENV === 'development' && 
                  (current.date === '2024-12-16' || current.date === '2024-12-17' || current.date === '2024-12-18')) {
                console.log(`[AnomalyDetector] CPA Spike detected for ${current.date}:`, {
                  date: current.date,
                  currentCPA: current.cpa,
                  avgCPA: avgCpa,
                  percentIncrease: percentIncrease,
                  threshold: avgCpa * 1.5,
                  pastWindowDates: pastWindow.map(d => d.date),
                  pastWindowCPAs: pastWindow.map(d => ({ date: d.date, cpa: d.cpa, cost: d.cost, conversions: d.conversions }))
                });
              }
            detected.push({
                id: `inc_cpa_${current.date}`,
                date: current.date,
                type: 'CPA急騰',
                severity: current.cpa > avgCpa * 2 ? 'HIGH' : 'MEDIUM',
                metricValue: current.cpa,
                metricLabel: 'CPA',
                  comparison: `+${percentIncrease}% vs ${windowSize}日平均`
            });
        }

        // Rule 2: ROAS Drop (< 0.7x average)
          if (current.roas < avgRoas * 0.7) {
            detected.push({
                id: `inc_roas_${current.date}`,
                date: current.date,
                type: 'ROAS急落',
                severity: current.roas < avgRoas * 0.5 ? 'HIGH' : 'MEDIUM',
                metricValue: current.roas,
                metricLabel: 'ROAS',
                  comparison: `${Math.round((current.roas - avgRoas) / avgRoas * 100)}% vs ${windowSize}日平均`
              });
          }
      }
    } else {
      // データが不足している場合のログ
      if (process.env.NODE_ENV === 'development') {
        console.log('[AnomalyDetector] Insufficient data for anomaly detection:', {
          dailyDataLength: dailyData.length,
          requiredMinLength: windowSize + 1
            });
        }
    }

    // デバッグログ
    if (process.env.NODE_ENV === 'development') {
      console.log('[AnomalyDetector] Detected incidents:', detected.length);
    }

    setIncidents(detected.reverse()); // Newest first
  }, [dailyData, dateRange]);

  // 現在選択されているクイックフィルタを判定（Hooksのルールに従い、早期リターンの前に配置）
  // ダッシュボードと同じ計算方法を使用
  const getActiveQuickFilter = useMemo(() => {
    if (!dateRange || data.length === 0) return null;
    
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1); // 昨日
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // 全期間チェック（データの最小日から最大日まで）
    const allData = [...(data || []), ...(propData || [])];
    if (allData.length > 0) {
      const uniqueDates = Array.from(new Set(allData.map(d => d.date)));
      const minDate = new Date(Math.min(...uniqueDates.map(d => new Date(d).getTime())));
      const maxDate = new Date(Math.max(...uniqueDates.map(d => new Date(d).getTime())));
      const minDateStr = minDate.toISOString().split('T')[0];
      const maxDateStr = maxDate.toISOString().split('T')[0];
      
      if (dateRange.start === minDateStr && dateRange.end === maxDateStr) {
        return 'all';
      }
    }
    
    // 7日間チェック（ダッシュボードと同じ: 昨日から6日前まで）
    const sevenDaysAgo = new Date(yesterday);
    sevenDaysAgo.setDate(yesterday.getDate() - (7 - 1));
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    
    if (dateRange.start === sevenDaysAgoStr && dateRange.end === yesterdayStr) {
      return 7;
    }
    
    // 30日間チェック（ダッシュボードと同じ: 昨日から29日前まで）
    const thirtyDaysAgo = new Date(yesterday);
    thirtyDaysAgo.setDate(yesterday.getDate() - (30 - 1));
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
    
    if (dateRange.start === thirtyDaysAgoStr && dateRange.end === yesterdayStr) {
      return 30;
    }
    
    return null;
  }, [dateRange, data, propData]);

  const handleIncidentClick = async (incident: Incident) => {
    setSelectedIncident(incident);
    setAnalysisResult(null);
    setAnalysisLoading(true);

    const metrics = dailyData.find(d => d.date === incident.date);
    if (!metrics) return;

    try {
        const result = await Api.analyzeAnomalyRootCause(incident.type, incident.date, metrics);
        setAnalysisResult(result);
    } catch (e) {
        console.error(e);
        setAnalysisResult("分析に失敗しました。");
    } finally {
        setAnalysisLoading(false);
    }
  };

  if (dataLoading) {
    return <div className="text-center py-20 text-gray-500 dark:text-gray-400">データを読み込み中...</div>;
  }

  if (data.length === 0) {
    return <div className="text-center py-20 text-gray-500 dark:text-gray-400">データがありません。</div>;
  }

  // クイックフィルタ関数（ダッシュボードと同じ計算方法を使用）
  const setQuickFilter = (days: number | 'all') => {
    let newRange: { start: string; end: string };

    if (days === 'all') {
      const allData = [...(data || []), ...(propData || [])];
      if (allData.length > 0) {
        const uniqueDates = Array.from(new Set(allData.map(d => d.date)));
        const minDate = new Date(Math.min(...uniqueDates.map(d => new Date(d).getTime())));
        const maxDate = new Date(Math.max(...uniqueDates.map(d => new Date(d).getTime())));
        
        newRange = {
          start: minDate.toISOString().split('T')[0],
          end: maxDate.toISOString().split('T')[0],
        };
      } else {
        const today = new Date();
        const endDate = new Date(today);
        endDate.setDate(today.getDate() - 1);
        newRange = {
          start: new Date(2020, 0, 1).toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0],
        };
      }
    } else {
      // 7日間 or 30日間（昨日まで）
      const today = new Date();
      
      // 昨日の日付（終了日）
      const endDate = new Date(today);
      endDate.setDate(today.getDate() - 1);
      
      // 開始日 = 昨日 - (days - 1)
      // 例: 7日間の場合、昨日から6日前が開始日
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - (days - 1));
      
      newRange = {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
      };
      
      console.log('[修正後] 今日:', today.toISOString().split('T')[0]);
      console.log('[修正後] 昨日（終了日）:', endDate.toISOString().split('T')[0]);
      console.log('[修正後] 開始日（昨日から' + (days - 1) + '日前）:', startDate.toISOString().split('T')[0]);
      console.log('[修正後] 計算結果:', newRange);
    }

    setDateRange(newRange);
    try {
      localStorage.setItem('dashboard_dateRange', JSON.stringify(newRange));
      localStorage.setItem('anomalyDetector_dateRange', JSON.stringify(newRange));
    } catch (err) {
      // 無視
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
             <AlertOctagon className="mr-2 text-indigo-600 dark:text-indigo-400" />
             AI異常検知モニター
             {selectedCampaign && (
               <span className="ml-3 px-3 py-1 text-sm font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800">
                 {selectedCampaign}
               </span>
             )}
           </h2>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             {selectedCampaign 
               ? `${selectedCampaign}の日々のパフォーマンスを監視し、統計的な異常値（外れ値）を自動検出します。`
               : '日々のパフォーマンスを監視し、統計的な異常値（外れ値）を自動検出します。'}
           </p>
        </div>
      </div>

      {/* Date Range Filter & Campaign Selector */}
      {dateRange && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex flex-col space-y-4">
            {/* Campaign Selector */}
            <div className="flex items-center space-x-2">
              <Filter size={18} className="text-gray-500 dark:text-gray-400" />
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                キャンペーン:
              </label>
              <select
                value={selectedCampaign || ''}
                onChange={(e) => {
                  setSelectedCampaign(e.target.value || null);
                }}
                className="flex-1 block w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg sm:text-sm focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">すべてのキャンペーン</option>
                {availableCampaigns.map(campaign => (
                  <option key={campaign} value={campaign}>
                    {campaign}
                  </option>
                ))}
              </select>
              {selectedCampaign && (
                <button
                  onClick={() => setSelectedCampaign(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="フィルタをクリア"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            
            {/* Date Range Inputs */}
            <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
              <div className="flex items-center space-x-2">
                <Calendar size={18} className="text-gray-500 dark:text-gray-400" />
                <div className="relative">
                  <input 
                    type="date" 
                    value={dateRange.start}
                    onChange={(e) => {
                      setDateRange({...dateRange, start: e.target.value});
                    }}
                    className="block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg sm:text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <span className="text-gray-500 dark:text-gray-400">~</span>
                <div className="relative">
                  <input 
                    type="date" 
                    value={dateRange.end}
                    onChange={(e) => {
                      setDateRange({...dateRange, end: e.target.value});
                    }}
                    className="block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg sm:text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              
              {/* Quick Filter Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setQuickFilter(7)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    getActiveQuickFilter === 7 
                      ? 'bg-indigo-50 border border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500' 
                      : 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  7日間
                </button>
                <button
                  onClick={() => setQuickFilter(30)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    getActiveQuickFilter === 30 
                      ? 'bg-indigo-50 border border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500' 
                      : 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  30日間
                </button>
                <button
                  onClick={() => setQuickFilter('all')}
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    getActiveQuickFilter === 'all' 
                      ? 'bg-indigo-50 border border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500' 
                      : 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  全期間
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Incident List */}
        <div className="lg:col-span-1 space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sticky top-24">
                <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                    <Activity size={18} className="mr-2 text-indigo-500" />
                    検出されたインシデント ({incidents.length})
                </h3>
                
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {incidents.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-sm bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                            <CheckCircle size={24} className="mx-auto mb-2 text-green-500" />
                            <p>異常は検出されませんでした。<br/>運用は安定しています。</p>
                        </div>
                    ) : (
                        incidents.map((inc) => (
                            <div 
                                key={inc.id}
                                onClick={() => handleIncidentClick(inc)}
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                    selectedIncident?.id === inc.id 
                                        ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500 dark:bg-indigo-900/30 dark:border-indigo-400' 
                                        : 'bg-white border-gray-200 hover:border-indigo-300 dark:bg-gray-700/30 dark:border-gray-700'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                        inc.severity === 'HIGH' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                                    }`}>
                                        {inc.type}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{inc.date}</span>
                                </div>
                                <div className="mt-2 flex justify-between items-end">
                                    <div>
                                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                            {inc.metricLabel}: {inc.metricLabel === 'ROAS' 
                                                ? `${Math.round(inc.metricValue)}%` 
                                                : `¥${Math.round(inc.metricValue).toLocaleString()}`}
                                        </p>
                                        <p className="text-xs text-red-500 font-medium">
                                            {inc.comparison}
                                        </p>
                                    </div>
                                    <ArrowRight size={16} className={`text-gray-300 ${selectedIncident?.id === inc.id ? 'text-indigo-500' : ''}`} />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>

        {/* Visualization & Analysis */}
        <div className="lg:col-span-2 space-y-6">
            {/* Charts */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <h4 className="font-bold text-gray-900 dark:text-white mb-4">CPA & ROAS トレンドモニター</h4>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            <XAxis 
                                dataKey="date" 
                                tickFormatter={(val) => val.slice(5)} 
                                stroke="#9ca3af"
                                fontSize={12}
                                minTickGap={30}
                            />
                            <YAxis yAxisId="left" stroke="#9ca3af" fontSize={12} label={{ value: 'CPA (円)', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af', fontSize: 10 } }} />
                            <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={12} label={{ value: 'ROAS (%)', angle: 90, position: 'insideRight', style: { fill: '#9ca3af', fontSize: 10 } }} />
                            <RechartsTooltip 
                                contentStyle={{ borderRadius: '8px' }}
                                formatter={(value: any, name: string) => [
                                    name === 'CPA' ? `¥${Math.round(value).toLocaleString()}` : `${Math.round(value).toFixed(0)}%`,
                                    name
                                ]}
                            />
                            <Legend />
                            <Line yAxisId="left" type="monotone" dataKey="cpa" name="CPA" stroke="#ef4444" strokeWidth={2} dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke="#10b981" strokeWidth={2} dot={false} />
                            
                            {incidents.map((inc) => (
                                <ReferenceDot 
                                    key={inc.id}
                                    yAxisId={inc.metricLabel === 'ROAS' ? 'right' : 'left'}
                                    x={inc.date}
                                    y={inc.metricValue}
                                    r={5}
                                    fill={inc.severity === 'HIGH' ? '#dc2626' : '#f59e0b'}
                                    stroke="white"
                                    strokeWidth={2}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Analysis Panel */}
            {selectedIncident ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 animate-fade-in-up">
                    <div className="flex items-center mb-4">
                        <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-lg text-indigo-600 dark:text-indigo-400 mr-3">
                            <Zap size={20} />
                        </div>
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                            AI自動診断: {selectedIncident.date} の異常要因
                        </h4>
                    </div>

                    {analysisLoading ? (
                        <div className="py-12 flex flex-col items-center justify-center text-gray-500">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-3"></div>
                            <p>根本原因を分析中...</p>
                        </div>
                    ) : (
                        <div className="prose dark:prose-invert max-w-none text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                            {analysisResult}
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-12 text-center text-gray-400">
                    <Search size={40} className="mx-auto mb-3 opacity-50" />
                    <p>リストからインシデントを選択すると、<br/>AIが原因を分析します。</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};