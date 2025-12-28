import React, { useState, useEffect } from 'react';
import { Api } from '../services/api';

interface DashboardProps {
  data: any[]; // 既存の互換性のため
}

interface CampaignData {
  campaign_name: string;
  start_date: string;
  end_date: string;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number;
  cpc: number;
  spend: number;
  cpm: number;
  conversions: number;
  cvr: number;
  cpa: number;
  conversion_value: number;
  roas: number;
  engagements: number;
  engagement_rate: number;
  landing_page_views: number;
}

const Dashboard: React.FC<DashboardProps> = () => {
  // State: キャンペーンと日付範囲のみ
  const [campaign, setCampaign] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('2022-11-28');
  const [endDate, setEndDate] = useState<string>('2025-12-28');
  const [data, setData] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availableCampaigns, setAvailableCampaigns] = useState<string[]>([]);

  // 利用可能なキャンペーン一覧を取得
  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const response = await Api.getCampaigns({ limit: 1000 });
        if (response.data) {
          const uniqueCampaigns = Array.from(
            new Set(response.data.map((item: any) => item.campaign_name))
          ).filter((name): name is string => name !== null && name !== undefined) as string[];
          setAvailableCampaigns(uniqueCampaigns);
        }
      } catch (err) {
        console.error('Failed to fetch campaigns:', err);
      }
    };
    fetchCampaigns();
  }, []);

  // データ取得
  const fetchData = async () => {
    if (!campaign) {
      setError('キャンペーンを選択してください');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/campaigns/data/?campaign_name=${encodeURIComponent(campaign)}&start_date=${startDate}&end_date=${endDate}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // 数値フォーマット関数
  const formatNumber = (value: number): string => {
    return value.toLocaleString('ja-JP');
  };

  const formatCurrency = (value: number): string => {
    return `¥${value.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`;
  };

  const formatPercent = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
        Meta広告ダッシュボード
      </h1>

      {/* コントロールパネル */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              キャンペーン
            </label>
            <select
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">選択してください</option>
              {availableCampaigns.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              開始日
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              終了日
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={fetchData}
              disabled={loading || !campaign}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '取得中...' : 'データ取得'}
            </button>
          </div>
        </div>
      </div>

      {/* エラーメッセージ */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 mb-6">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* データ表示 */}
      {data && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            {data.campaign_name} ({data.start_date} ～ {data.end_date})
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. インプレッション */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">インプレッション</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatNumber(data.impressions)}
              </div>
            </div>

            {/* 2. リーチ */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">リーチ</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatNumber(data.reach)}
              </div>
            </div>

            {/* 3. フリークエンシー */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">フリークエンシー</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {data.frequency.toFixed(2)}
              </div>
            </div>

            {/* 4. クリック数 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">クリック数</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatNumber(data.clicks)}
              </div>
            </div>

            {/* 5. クリック率 (CTR) */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">クリック率 (CTR)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatPercent(data.ctr)}
              </div>
            </div>

            {/* 6. クリック単価 (CPC) */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">クリック単価 (CPC)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(data.cpc)}
              </div>
            </div>

            {/* 7. 費用 (Spend) */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">費用</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(data.spend)}
              </div>
            </div>

            {/* 8. CPM (インプレッション単価) */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">CPM (インプレッション単価)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(data.cpm)}
              </div>
            </div>

            {/* 9. コンバージョン数 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">コンバージョン数</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatNumber(data.conversions)}
              </div>
            </div>

            {/* 10. コンバージョン率 (CVR) */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">コンバージョン率 (CVR)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatPercent(data.cvr)}
              </div>
            </div>

            {/* 11. 獲得単価 (CPA) */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">獲得単価 (CPA)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(data.cpa)}
              </div>
            </div>

            {/* 12. コンバージョン価値 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">コンバージョン価値</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(data.conversion_value)}
              </div>
            </div>

            {/* 13. ROAS (費用対効果) */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">ROAS (費用対効果)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {data.roas.toFixed(2)}
              </div>
            </div>

            {/* 14. エンゲージメント数 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">エンゲージメント数</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatNumber(data.engagements)}
              </div>
            </div>

            {/* 15. エンゲージメント率 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">エンゲージメント率</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatPercent(data.engagement_rate)}
              </div>
            </div>

            {/* 16. LPビュー数 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">LPビュー数</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatNumber(data.landing_page_views)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
