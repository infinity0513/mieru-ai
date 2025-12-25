import React, { useState, useMemo, useEffect, useContext } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, ScatterChart, Scatter, ZAxis, ReferenceLine, Cell
} from 'recharts';
import Papa from 'papaparse';
import { CampaignData } from '../types';
import { ArrowUpRight, ArrowDownRight, DollarSign, MousePointer, Target, Eye, Filter, Calendar, ChevronDown, ChevronUp, Download, Search, X, TrendingUp, Activity, PieChart, Users, Zap, Link2, BarChart3, Heart } from 'lucide-react';
import { Button } from './ui/Button';
import { ThemeContext } from './Layout';
import { Api } from '../services/api';

interface DashboardProps {
  data: CampaignData[];
}

const KPICard = ({ title, value, subtext, trend, icon: Icon, format = (v: any) => v, color = "indigo" }: any) => {
  const colorClasses = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
    green: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    pink: "bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400"
  };

  return (
    <div className="bg-white dark:bg-gray-800 overflow-hidden rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 avoid-break h-full transition-colors">
      <div className="flex items-center">
        <div className={`p-1.5 rounded-lg ${colorClasses[color as keyof typeof colorClasses] || colorClasses.indigo}`}>
          <Icon size={16} />
        </div>
        <div className="ml-2 truncate flex-1">
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{title}</dt>
          <dd className="text-sm font-semibold text-gray-900 dark:text-white">{format(value)}</dd>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <div className={`flex items-center text-xs ${trend > 0 ? 'text-green-600 dark:text-green-400' : (trend < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400')}`}>
          {trend > 0 ? <ArrowUpRight size={14} className="mr-0.5" /> : (trend < 0 ? <ArrowDownRight size={14} className="mr-0.5" /> : null)}
          <span className="font-medium">{Math.abs(trend).toFixed(1)}%</span>
          <span className="ml-0.5 text-gray-400 dark:text-gray-500 text-[10px]">vs 前期間</span>
        </div>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">{subtext}</span>
      </div>
    </div>
  );
};

// Campaign Detail Modal Component
const CampaignDetailModal = ({ campaignName, allData, onClose }: { campaignName: string, allData: CampaignData[], onClose: () => void }) => {
  const { isDark } = useContext(ThemeContext);

  // Filter and Sort Data for this campaign
  const campaignHistory = useMemo(() => {
    return allData
      .filter(d => d.campaign_name === campaignName)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [campaignName, allData]);

  // Calculate Aggregates
  const stats = useMemo(() => {
    if (!campaignHistory || campaignHistory.length === 0) {
      return {
        totalCost: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalConversions: 0,
        totalValue: 0,
        totalReach: 0,
        totalEngagements: 0,
        totalLinkClicks: 0,
        totalLandingPageViews: 0,
        avgRoas: 0,
        avgCpa: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        cvr: 0,
        frequency: 0,
        engagementRate: 0
      };
    }
    
    const totalCost = campaignHistory.reduce((acc, curr) => acc + (curr.cost || 0), 0);
    const totalImpressions = campaignHistory.reduce((acc, curr) => acc + (curr.impressions || 0), 0);
    const totalClicks = campaignHistory.reduce((acc, curr) => acc + (curr.clicks || 0), 0);
    const totalConversions = campaignHistory.reduce((acc, curr) => acc + (curr.conversions || 0), 0);
    const totalValue = campaignHistory.reduce((acc, curr) => acc + (curr.conversion_value || 0), 0);
    const totalReach = campaignHistory.reduce((acc, curr) => acc + (curr.reach || 0), 0);
    const totalEngagements = campaignHistory.reduce((acc, curr) => acc + (curr.engagements || 0), 0);
    const totalLinkClicks = campaignHistory.reduce((acc, curr) => acc + (curr.link_clicks || 0), 0);
    const totalLandingPageViews = campaignHistory.reduce((acc, curr) => acc + (curr.landing_page_views || 0), 0);
    
    const avgRoas = totalCost > 0 ? (totalValue / totalCost * 100) : 0;
    const avgCpa = totalConversions > 0 ? (totalCost / totalConversions) : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    const cpc = totalClicks > 0 ? (totalCost / totalClicks) : 0;
    const cpm = totalImpressions > 0 ? (totalCost / totalImpressions * 1000) : 0;
    const cvr = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0;
    const frequency = totalReach > 0 ? (totalImpressions / totalReach) : 0;
    const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions * 100) : 0;
    
    return { 
      totalCost, 
      totalImpressions,
      totalClicks,
      totalConversions, 
      totalReach,
      totalEngagements,
      totalLinkClicks,
      totalLandingPageViews,
      avgRoas, 
      avgCpa,
      ctr,
      cpc,
      cpm,
      cvr,
      frequency,
      engagementRate
    };
  }, [campaignHistory]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-80 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full animate-fade-in-up">
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-lg leading-6 font-bold text-gray-900 dark:text-white" id="modal-title">
                  {campaignName}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">詳細パフォーマンス分析</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-300 focus:outline-none bg-gray-100 dark:bg-gray-700 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Performance Analysis - ダッシュボードと同じ形式 */}
            <div className="mb-6">
              <div className="flex items-center mb-6">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 mr-3">
                  <TrendingUp size={20} />
              </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">詳細パフォーマンス分析</h3>
              </div>
              
              {/* Totals - 全体サマリー */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 break-words">全体サマリー</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium break-words leading-tight">インプレッション</div>
                    <div className="text-lg font-bold text-blue-700 dark:text-blue-300 break-words leading-tight">
                      {(stats.totalImpressions || 0).toLocaleString()}
              </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">合計</div>
              </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-green-600 dark:text-green-400 mb-1 font-medium break-words leading-tight">クリック数</div>
                    <div className="text-lg font-bold text-green-700 dark:text-green-300 break-words leading-tight">
                      {(stats.totalClicks || 0).toLocaleString()}
            </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">合計</div>
              </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-red-600 dark:text-red-400 mb-1 font-medium break-words leading-tight">費用</div>
                    <div className="text-lg font-bold text-red-700 dark:text-red-300 break-words leading-tight">
                      ¥{((stats.totalCost || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">合計</div>
              </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium break-words leading-tight">コンバージョン</div>
                    <div className="text-lg font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                      {(stats.totalConversions || 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">合計</div>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-yellow-600 dark:text-yellow-400 mb-1 font-medium break-words leading-tight" style={{ lineHeight: '1.3' }}>コンバージョン価値</div>
                    <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300 break-words leading-tight">
                      ¥{((stats.totalValue || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">合計</div>
                  </div>
              </div>
            </div>

              {/* Averages - 計算指標（パフォーマンス指標） */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 break-words">計算指標（パフォーマンス指標）</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">ROAS</div>
                    <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                      {((stats.avgRoas || 0)).toFixed(2)}%
              </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">費用対効果</div>
              </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CTR</div>
                    <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                      {((stats.ctr || 0)).toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">クリック率</div>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CVR</div>
                    <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                      {((stats.cvr || 0)).toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">コンバージョン率</div>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CPC</div>
                    <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                      ¥{((stats.cpc || 0)).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">クリック単価</div>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CPA</div>
                    <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                      ¥{((stats.avgCpa || 0)).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">獲得単価</div>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CPM</div>
                    <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                      ¥{((stats.cpm || 0)).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">インプレッション単価</div>
                  </div>
                </div>
              </div>

              {/* リーチ・エンゲージメント指標 */}
              {(stats.totalReach > 0 || stats.frequency > 0 || stats.engagementRate > 0 || stats.totalLinkClicks > 0 || stats.totalLandingPageViews > 0) && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 break-words">リーチ・エンゲージメント指標</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {stats.totalReach > 0 && (
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                        <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">リーチ数</div>
                        <div className="text-lg font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                          {(stats.totalReach || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                </div>
              )}
              {stats.frequency > 0 && (
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                        <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">フリークエンシー</div>
                        <div className="text-lg font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                          {(stats.frequency || 0).toFixed(2)}
                </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">平均</div>
            </div>
                    )}
                {stats.engagementRate > 0 && (
                      <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-3 border border-pink-200 dark:border-pink-800 min-w-0 overflow-hidden">
                        <div className="text-xs text-pink-600 dark:text-pink-400 mb-1 font-medium truncate">エンゲージメント率</div>
                        <div className="text-lg font-bold text-pink-700 dark:text-pink-300 break-words leading-tight">
                          {(stats.engagementRate || 0).toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">平均</div>
                  </div>
                )}
                {stats.totalLinkClicks > 0 && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800 min-w-0 overflow-hidden">
                        <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium truncate">リンククリック数</div>
                        <div className="text-lg font-bold text-blue-700 dark:text-blue-300 break-words leading-tight">
                          {(stats.totalLinkClicks || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                  </div>
                )}
                {stats.totalLandingPageViews > 0 && (
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800 min-w-0 overflow-hidden">
                        <div className="text-xs text-green-600 dark:text-green-400 mb-1 font-medium truncate">LPビュー数</div>
                        <div className="text-lg font-bold text-green-700 dark:text-green-300 break-words leading-tight">
                          {(stats.totalLandingPageViews || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                  </div>
                )}
                  </div>
              </div>
            )}
            </div>

            {/* Detailed Chart */}
            <div className="mb-6">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                <Activity size={16} className="mr-2 text-indigo-600 dark:text-indigo-400" />
                日次パフォーマンス推移
              </h4>
              <div className="h-64 w-full bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={campaignHistory}>
                    <defs>
                      <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorRoas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#374151" : "#f0f0f0"} />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => val.slice(5)} 
                      stroke={isDark ? "#9ca3af" : "#9ca3af"}
                      fontSize={11}
                    />
                    <YAxis yAxisId="left" stroke={isDark ? "#9ca3af" : "#9ca3af"} fontSize={11} />
                    <YAxis yAxisId="right" orientation="right" stroke={isDark ? "#9ca3af" : "#9ca3af"} fontSize={11} />
                    <RechartsTooltip 
                      contentStyle={{ 
                        backgroundColor: isDark ? '#1f2937' : '#fff', 
                        borderRadius: '8px', 
                        border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
                        color: isDark ? '#f3f4f6' : '#111827'
                      }}
                      itemStyle={{ color: isDark ? '#f3f4f6' : '#111827' }}
                      formatter={(value: any, name: string) => [
                        name === 'cost' ? `¥${value.toLocaleString()}` : `${value.toFixed(0)}%`,
                        name === 'cost' ? '消化金額' : 'ROAS'
                      ]}
                    />
                    <Legend />
                    <Area 
                      yAxisId="left" 
                      type="monotone" 
                      dataKey="cost" 
                      name="cost" 
                      stroke="#6366f1" 
                      fillOpacity={1} 
                      fill="url(#colorCost)" 
                    />
                    <Area 
                      yAxisId="right" 
                      type="monotone" 
                      dataKey="roas" 
                      name="roas" 
                      stroke="#10b981" 
                      fillOpacity={1} 
                      fill="url(#colorRoas)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* AI Insight Mock */}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg p-4 flex items-start">
               <div className="p-1 bg-white dark:bg-gray-700 rounded-full mr-3 text-indigo-600 dark:text-indigo-400 shadow-sm">
                   <TrendingUp size={16} />
               </div>
               <div>
                   <h5 className="text-sm font-bold text-indigo-900 dark:text-indigo-300">AI分析インサイト</h5>
                   <p className="text-sm text-indigo-800 dark:text-indigo-200 mt-1">
                       このキャンペーンは過去7日間でROASが<span className="font-bold">12%向上</span>しています。特に週末のコンバージョン率が高いため、金曜日の午後から予算を増額することを推奨します。
                   </p>
               </div>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <Button onClick={onClose} variant="secondary">
              閉じる
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ data: propData }) => {
  const { isDark } = useContext(ThemeContext);

  // State for API data
  const [apiData, setApiData] = useState<CampaignData[]>([]);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [trendsData, setTrendsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Initialize date range - localStorageから復元、なければデータの全期間
  const [dateRange, setDateRange] = useState<{start: string, end: string}>(() => {
    const savedRange = localStorage.getItem('dashboard_dateRange');
    if (savedRange) {
      try {
        const parsed = JSON.parse(savedRange);
        if (parsed.start && parsed.end) {
          return parsed;
        }
      } catch (e) {
        // 無視
      }
    }

    // デフォルト: データが存在する全期間、なければ7日間（昨日まで）
    const allData = [...(propData || [])];
    if (allData.length > 0) {
      const uniqueDates = Array.from(new Set(allData.map(d => d.date)));
      const minDate = new Date(Math.min(...uniqueDates.map(d => new Date(d).getTime())));
      const maxDate = new Date(Math.max(...uniqueDates.map(d => new Date(d).getTime())));
      
      return {
        start: minDate.toISOString().split('T')[0],
        end: maxDate.toISOString().split('T')[0],
      };
    }

    // データがない場合は7日間（昨日まで）
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() - 1);
    
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 6); // 昨日から6日前

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    };
  });
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(() => {
    // localStorageから選択されたキャンペーンを復元
    try {
      const saved = localStorage.getItem('dashboard_selectedCampaign');
      if (saved !== null && saved !== '') {
        return saved;
      }
    } catch (e) {
      // 無視
    }
    return null; // nullの場合は全キャンペーン表示
  });
  const [sortConfig, setSortConfig] = useState<{ key: keyof CampaignData; direction: 'asc' | 'desc' } | null>({ key: 'cost', direction: 'desc' });
  
  // Selected Campaign for Modal
  const [selectedCampaignName, setSelectedCampaignName] = useState<string | null>(null);

  // Meta Account (Asset) Selection
  const [metaAccounts, setMetaAccounts] = useState<Array<{ account_id: string; name: string; data_count: number; latest_date: string | null }>>([]);
  const [selectedMetaAccountId, setSelectedMetaAccountId] = useState<string | null>(() => {
    // localStorageから選択されたアセットIDを復元
    try {
      const saved = localStorage.getItem('dashboard_selectedMetaAccountId');
      if (saved !== null && saved !== '') {
        return saved;
      }
    } catch (e) {
      // 無視
    }
    return null; // nullの場合は全アセット表示
  });

  // Load Meta Accounts list
  useEffect(() => {
    const loadMetaAccounts = async () => {
      try {
        const result = await Api.getMetaAccounts();
        setMetaAccounts(result.accounts || []);
      } catch (error) {
        console.error('Failed to load Meta accounts:', error);
        // エラー時は空配列を設定
        setMetaAccounts([]);
      }
    };
    
    loadMetaAccounts();
  }, []);

  // Load dashboard data from API
  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      console.log('[Dashboard] Loading data with params:', {
        start: dateRange.start,
        end: dateRange.end,
        selectedMetaAccountId: selectedMetaAccountId
      });
      
      try {
        // 各API呼び出しを個別に処理し、1つが失敗しても他のデータは取得できるようにする
        const metaAccountParam = selectedMetaAccountId || undefined;
        console.log('[Dashboard] Calling APIs with metaAccountId:', metaAccountParam);
        
        const [summaryResult, trendsResult, campaignsResult] = await Promise.allSettled([
          Api.getCampaignSummary(dateRange.start, dateRange.end, metaAccountParam),
          Api.getCampaignTrends(dateRange.start, dateRange.end, 'day', metaAccountParam),
          Api.fetchCampaignData(metaAccountParam) // Get detailed daily data
        ]);
        
        // Summary data
        if (summaryResult.status === 'fulfilled') {
          console.log('[Dashboard] Summary loaded:', summaryResult.value);
          setSummaryData(summaryResult.value);
        } else {
          console.error('[Dashboard] Failed to load summary:', summaryResult.reason);
        }
        
        // Trends data
        if (trendsResult.status === 'fulfilled') {
          console.log('[Dashboard] Trends loaded:', trendsResult.value);
          setTrendsData(trendsResult.value);
        } else {
          console.error('[Dashboard] Failed to load trends:', trendsResult.reason);
        }
        
        // Campaigns data
        if (campaignsResult.status === 'fulfilled') {
          const campaignsResponse = campaignsResult.value;
          console.log('[Dashboard] Campaigns response:', {
            type: typeof campaignsResponse,
            isArray: Array.isArray(campaignsResponse),
            length: Array.isArray(campaignsResponse) ? campaignsResponse.length : 'N/A',
            data: campaignsResponse
          });
          
          if (!Array.isArray(campaignsResponse)) {
            console.error('[Dashboard] Invalid campaigns response format:', campaignsResponse);
            // API取得失敗時は、アセットが選択されている場合は空配列を設定
            // propDataはアセットでフィルタリングできないため使用しない
            if (selectedMetaAccountId) {
              console.warn('[Dashboard] Invalid response but asset is selected, clearing apiData');
              setApiData([]);
            } else if (propData && propData.length > 0) {
              console.log('[Dashboard] Using propData as fallback:', propData.length);
              setApiData(propData);
            } else {
              console.warn('[Dashboard] No propData available, keeping previous apiData');
            }
            setLoading(false);
            return;
          }
          
          // apiDataには全データを保存（日付範囲でフィルタリングしない）
          // 日付範囲のフィルタリングはdataの計算時に行う
          console.log('[Dashboard] Loaded campaigns:', {
            total: campaignsResponse.length,
            selectedMetaAccountId: selectedMetaAccountId,
            dateRange: { start: dateRange.start, end: dateRange.end }
          });
          
          setApiData(campaignsResponse);
        } else {
          console.error('[Dashboard] Failed to load campaigns:', campaignsResult.reason);
          // API取得失敗時は、アセットが選択されている場合は空配列を設定
          // propDataはアセットでフィルタリングできないため使用しない
          if (selectedMetaAccountId) {
            console.warn('[Dashboard] API failed but asset is selected, clearing apiData');
            setApiData([]);
          } else if (propData && propData.length > 0) {
            console.log('[Dashboard] Using propData as fallback:', propData.length);
            setApiData(propData);
          } else {
            console.warn('[Dashboard] No propData available, keeping previous apiData');
          }
        }
      } catch (error) {
        console.error('[Dashboard] Error loading dashboard data:', error);
        // エラー時も、アセットが選択されている場合は空配列を設定
        // propDataはアセットでフィルタリングできないため使用しない
        if (selectedMetaAccountId) {
          console.warn('[Dashboard] Error occurred but asset is selected, clearing apiData');
          setApiData([]);
        } else if (propData && propData.length > 0) {
          console.log('[Dashboard] Using propData as fallback after error:', propData.length);
          setApiData(propData);
        } else {
          console.warn('[Dashboard] No propData available after error, keeping previous apiData');
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadDashboardData();
    // propDataを依存配列から削除して、不要な再レンダリングを防ぐ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end, selectedMetaAccountId]);

  // Use propData if available (from App.tsx), otherwise fallback to apiData
  // Filter by asset and date range
  // propData contains all data (may not have meta_account_id), apiData is filtered by asset only
  const data = useMemo(() => {
    let sourceData: CampaignData[];
    
    if (selectedMetaAccountId) {
      // Asset is selected: use apiData which is filtered by asset
      // propData from CSV uploads doesn't have meta_account_id, so we can't filter it
      sourceData = apiData;
    } else {
      // No asset selected: use propData if available, otherwise apiData
      sourceData = (propData && propData.length > 0) ? propData : apiData;
    }
    
    // Filter by date range
    if (sourceData.length === 0) return [];
    
    const startDateStr = dateRange.start;
    const endDateStr = dateRange.end;
    
    const filtered = sourceData.filter((d: CampaignData) => {
      const inDateRange = d.date >= startDateStr && d.date <= endDateStr;
      return inDateRange;
    });
    
    console.log('[Dashboard] Data filtered:', {
      selectedMetaAccountId,
      sourceDataCount: sourceData.length,
      filteredCount: filtered.length,
      dateRange: { start: startDateStr, end: endDateStr }
    });
    
    return filtered;
  }, [propData, apiData, selectedMetaAccountId, dateRange.start, dateRange.end]);

  // 利用可能なキャンペーン一覧を取得
  const availableCampaigns = useMemo(() => {
    // dataが既にアセットでフィルタリングされている場合は、そのまま使用
    // dataが空の場合は、propDataから取得を試みる（アセットが選択されていない場合のみ）
    let sourceData = data;
    if ((!data || data.length === 0) && !selectedMetaAccountId && propData && propData.length > 0) {
      sourceData = propData;
    }
    
    if (!sourceData || sourceData.length === 0) {
      console.log('[Dashboard] No data available for campaigns');
      return [];
    }
    
    // dataは既にアセットでフィルタリングされているので、そのまま使用
    const campaigns = Array.from(new Set(sourceData.map(d => d.campaign_name))).sort();
    
    console.log('[Dashboard] Available campaigns:', {
      selectedMetaAccountId,
      dataCount: data.length,
      sourceDataCount: sourceData.length,
      campaigns: campaigns
    });
    
    return campaigns;
  }, [data, propData, selectedMetaAccountId]);

  // 初回ロード時のみ日付範囲を自動設定（localStorageに保存されていない場合のみ）
  const [isInitialLoad, setIsInitialLoad] = useState(() => {
    // localStorageに保存されている場合は、自動設定しない
    try {
      const saved = localStorage.getItem('dashboard_dateRange');
      return saved === null;
    } catch (e) {
      return true;
    }
  });
  
  useEffect(() => {
    // 初回ロード時のみ、かつlocalStorageに保存されていない場合のみ自動設定
    if (isInitialLoad && data.length > 0) {
      // Find actual min and max dates in data (use actual data range, not calculated 30 days ago)
      const dates = data.map(d => new Date(d.date).getTime());
      const maxDate = new Date(Math.max(...dates));
      const minDate = new Date(Math.min(...dates)); // Use actual minimum date in data
      
      const initialRange = {
        start: minDate.toISOString().split('T')[0],
        end: maxDate.toISOString().split('T')[0]
      };
      setDateRange(initialRange);
      setIsInitialLoad(false); // 初回ロード完了後は自動更新しない
      // localStorageに保存（AnomalyDetectorと同期）
      try {
        localStorage.setItem('dashboard_dateRange', JSON.stringify(initialRange));
      } catch (err) {
        // 無視
      }
    }
  }, [data.length, isInitialLoad]); 

  // Filter Data for Date Range Only (for Campaign Table)
  const dateFilteredData = useMemo(() => {
    if (data.length === 0) return [];
    
    // 日付範囲を事前に計算（毎回Dateオブジェクトを作成しない）
    const startDateStr = dateRange.start;
    const endDateStr = dateRange.end;
    
    // Sort raw data by date desc first
    const sortedRaw = [...data].sort((a, b) => {
      // 文字列比較で高速化
      return b.date.localeCompare(a.date);
    });
    
    // 日付範囲のみでフィルタリング（キャンペーンフィルタは適用しない）
    return sortedRaw.filter(d => {
      // 文字列比較で高速化（日付フォーマットがYYYY-MM-DDの場合）
      const inDateRange = d.date >= startDateStr && d.date <= endDateStr;
      return inDateRange;
    });
  }, [data, dateRange.start, dateRange.end]);

  // Filter Data - パフォーマンス最適化版（KPIカード用：日付範囲 + キャンペーン）
  const filteredData = useMemo(() => {
    if (dateFilteredData.length === 0) return [];
    
    // キャンペーンフィルタを適用
    if (selectedCampaign === null) {
      return dateFilteredData;
    }
    
    return dateFilteredData.filter(d => d.campaign_name === selectedCampaign);
  }, [dateFilteredData, selectedCampaign]);

  // Aggregate for KPI Cards - 常にfilteredDataから計算（AnomalyDetectorと整合性を保つため）
  const kpiData = useMemo(() => {
    // filteredDataから直接計算（API summaryは使用しない）
    const current = filteredData;
    
    // 基本指標を計算
    const totalCost = current.reduce((acc, curr) => acc + curr.cost, 0);
    const totalImpressions = current.reduce((acc, curr) => acc + curr.impressions, 0);
    const totalClicks = current.reduce((acc, curr) => acc + curr.clicks, 0);
    const totalConversions = current.reduce((acc, curr) => acc + curr.conversions, 0);
    const totalValue = current.reduce((acc, curr) => acc + curr.conversion_value, 0);
    
    // 追加指標を計算
    const totalReach = current.reduce((acc, curr) => acc + (curr.reach || 0), 0);
    const totalEngagements = current.reduce((acc, curr) => acc + (curr.engagements || 0), 0);
    const totalLinkClicks = current.reduce((acc, curr) => acc + (curr.link_clicks || 0), 0);
    const totalLandingPageViews = current.reduce((acc, curr) => acc + (curr.landing_page_views || 0), 0);
    
    // 計算指標
    const avgRoas = totalCost > 0 ? (totalValue / totalCost * 100) : 0;
    const avgCpa = totalConversions > 0 ? (totalCost / totalConversions) : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    const cpc = totalClicks > 0 ? (totalCost / totalClicks) : 0;
    const cpm = totalImpressions > 0 ? (totalCost / totalImpressions * 1000) : 0;
    const cvr = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0;
    const frequency = totalReach > 0 ? (totalImpressions / totalReach) : 0;
    const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions * 100) : 0;
    
    // デバッグ用ログは削除（パフォーマンス向上のため）

    return {
      totalCost,
      totalImpressions,
      totalClicks,
      totalConversions,
      totalValue, // 総コンバージョン価値
      totalReach,
      totalEngagements,
      totalLinkClicks,
      totalLandingPageViews,
      avgRoas,
      avgCpa,
      ctr,
      cpc,
      cpm,
      cvr,
      frequency,
      engagementRate,
      // Randomized trends for demo visual
      costTrend: (Math.random() * 20) - 10,
      roasTrend: (Math.random() * 10) - 5,
      cvTrend: (Math.random() * 15) - 5,
      cvValueTrend: (Math.random() * 15) - 5, // コンバージョン価値のトレンド
      ctrTrend: (Math.random() * 2) - 1,
      impressionsTrend: (Math.random() * 10) - 5,
      clicksTrend: (Math.random() * 8) - 4,
      cpcTrend: (Math.random() * 5) - 2.5,
      cvrTrend: (Math.random() * 3) - 1.5
    };
  }, [filteredData, dateRange, selectedCampaign]); // summaryDataへの依存を削除（常にfilteredDataから計算）

  // Group by Date for Trend Chart - use API trends if available
  const trendData = useMemo(() => {
    if (trendsData && trendsData.data && trendsData.data.length > 0) {
      return trendsData.data.map((t: any) => ({
        date: t.date.split('T')[0], // Ensure date format is consistent
        cost: t.cost,
        clicks: t.clicks,
        conversions: t.conversions,
        conversion_value: 0 // API doesn't return this in trends, calculate if needed
      }));
    }
    
    // Fallback to calculated from filteredData
    const reversed = [...filteredData].reverse();
    const groupedMap = new Map<string, CampaignData>();
    
    reversed.forEach(curr => {
        const existing = groupedMap.get(curr.date);
        if (existing) {
            existing.cost += curr.cost;
            existing.clicks += curr.clicks;
            existing.conversions += curr.conversions;
            existing.conversion_value += curr.conversion_value;
        } else {
            groupedMap.set(curr.date, { ...curr, campaign_name: 'Aggregated' });
        }
    });

    const grouped = Array.from(groupedMap.values());
    grouped.forEach(g => {
        g.roas = g.cost > 0 ? (g.conversion_value / g.cost * 100) : 0;
    });

    return grouped;
  }, [trendsData, filteredData]);

  // Group by Campaign for Table (全キャンペーンを表示するため、dateFilteredDataを使用)
  const campaignStats = useMemo(() => {
    const stats: { [key: string]: CampaignData } = {};
    dateFilteredData.forEach(d => {
      if (!stats[d.campaign_name]) {
        stats[d.campaign_name] = { ...d, impressions: 0, clicks: 0, cost: 0, conversions: 0, conversion_value: 0 };
      }
      stats[d.campaign_name].impressions += d.impressions;
      stats[d.campaign_name].clicks += d.clicks;
      stats[d.campaign_name].cost += d.cost;
      stats[d.campaign_name].conversions += d.conversions;
      stats[d.campaign_name].conversion_value += d.conversion_value;
    });

    return Object.values(stats).map(s => ({
      ...s,
      ctr: s.impressions > 0 ? (s.clicks / s.impressions * 100) : 0,
      cpc: s.clicks > 0 ? s.cost / s.clicks : 0,
      cpa: s.conversions > 0 ? s.cost / s.conversions : 0,
      cpm: s.impressions > 0 ? (s.cost / s.impressions * 1000) : 0,
      cvr: s.clicks > 0 ? (s.conversions / s.clicks * 100) : 0,
      roas: s.cost > 0 ? (s.conversion_value / s.cost * 100) : 0,
      // Optional fields (will be 0 if not in data)
      reach: s.reach || 0,
      frequency: (s.reach || 0) > 0 ? (s.impressions / s.reach) : 0,
      engagements: s.engagements || 0,
      engagementRate: s.impressions > 0 ? ((s.engagements || 0) / s.impressions * 100) : 0,
      link_clicks: s.link_clicks || 0,
      landing_page_views: s.landing_page_views || 0
    }));
  }, [dateFilteredData]);

  // Scatter Chart Data
  const scatterData = useMemo(() => {
    return campaignStats.map(c => ({
        x: c.cost,
        y: c.roas,
        z: c.conversion_value, // Size bubble by value? or conversions?
        name: c.campaign_name
    }));
  }, [campaignStats]);

  // Sort Logic for Table
  const sortedCampaigns = useMemo(() => {
    let sortableItems = [...campaignStats];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [campaignStats, sortConfig]);

  const requestSort = (key: keyof CampaignData) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const setQuickFilter = (days: number | 'all') => {
    setIsInitialLoad(false); // ユーザーが手動で変更した場合は自動更新を無効化
    
    let newRange: { start: string; end: string };

    if (days === 'all') {
      // 全期間
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
    }

    setDateRange(newRange);
    try {
      localStorage.setItem('dashboard_dateRange', JSON.stringify(newRange));
    } catch (err) {
      console.error('[setQuickFilter] localStorage保存エラー:', err);
    }
  };

  // 現在選択されているクイックフィルタを判定
  const getActiveQuickFilter = useMemo(() => {
    if (data.length === 0) return null;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    // 全期間チェック（データの最小日から最大日まで）
    const minDate = new Date(Math.min(...data.map(d => new Date(d.date).getTime())));
    const maxDate = new Date(Math.max(...data.map(d => new Date(d.date).getTime())));
    const minDateStr = minDate.toISOString().split('T')[0];
    const maxDateStr = maxDate.toISOString().split('T')[0];
    
    if (dateRange.start === minDateStr && dateRange.end === maxDateStr) {
      return 'all';
    }
    
    // 7日間チェック
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    
    if (dateRange.start === sevenDaysAgoStr && dateRange.end === todayStr) {
      return 7;
    }
    
    // 30日間チェック
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 29);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
    
    if (dateRange.start === thirtyDaysAgoStr && dateRange.end === todayStr) {
      return 30;
    }
    
    return null;
  }, [dateRange, data]);

  const handleExportCSV = () => {
    const csv = Papa.unparse(sortedCampaigns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `campaign_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortIcon = ({ colKey }: { colKey: keyof CampaignData }) => {
    if (sortConfig?.key !== colKey) return <div className="w-4 h-4 ml-1 inline-block opacity-20"><ChevronDown size={14} /></div>;
    return sortConfig.direction === 'asc' ? 
      <ChevronUp size={14} className="ml-1 inline-block text-indigo-600 dark:text-indigo-400" /> : 
      <ChevronDown size={14} className="ml-1 inline-block text-indigo-600 dark:text-indigo-400" />;
  };

  // ローディング中の表示
  if (loading && data.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 rounded-full mx-auto"></div>
        <p className="mt-4 text-gray-500 dark:text-gray-400">データを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Campaign Detail Modal */}
      {selectedCampaignName && (
        <CampaignDetailModal 
            campaignName={selectedCampaignName} 
            allData={data} 
            onClose={() => setSelectedCampaignName(null)} 
        />
      )}

      {/* Asset Selection - Top Row (Prominent Design) */}
      {metaAccounts.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 p-5 rounded-xl border-2 border-indigo-200 dark:border-indigo-700 shadow-lg no-print mb-6">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                <Target size={20} className="text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                アセット選択
              </label>
              <select
                value={selectedMetaAccountId || ''}
                onChange={(e) => {
                  const newAccountId = e.target.value || null;
                  setSelectedMetaAccountId(newAccountId);
                  try {
                    localStorage.setItem('dashboard_selectedMetaAccountId', newAccountId || '');
                  } catch (err) {
                    // 無視
                  }
                }}
                className="w-full max-w-md pl-4 pr-12 py-3 border-2 border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg text-base font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
              >
                <option value="">全アセットを表示</option>
                {metaAccounts.map((account) => (
                  <option key={account.account_id} value={account.account_id}>
                    {account.name} ({account.data_count}件)
                  </option>
                ))}
              </select>
            </div>
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

      {/* Advanced Filter Bar - Campaign and Date Selection */}
      <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm no-print space-y-3 lg:space-y-0 lg:flex lg:items-start lg:gap-3 transition-colors">
        
        {/* Campaign Selection Tabs */}
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap flex items-center shrink-0">
                    <Filter size={14} className="mr-1" />
                    キャンペーン:
                </label>
                <div className="relative flex-1 min-w-0">
                    <div className="block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent dark:scrollbar-thumb-gray-600 dark:scrollbar-track-transparent hover:scrollbar-track-gray-100 dark:hover:scrollbar-track-gray-800">
                            <div className="flex items-center gap-2 min-w-fit">
                                {/* 全体タブ */}
                <button 
                                    onClick={() => {
                                        setSelectedCampaign(null);
                                        try {
                                            localStorage.setItem('dashboard_selectedCampaign', '');
                                        } catch (err) {
                                            // 無視
                                        }
                                    }}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                                        selectedCampaign === null
                                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500'
                                            : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    全体
                </button>
                                {/* キャンペーンタブ */}
                                {availableCampaigns.map(campaign => (
                                    <button
                                        key={campaign}
                                        onClick={() => {
                                            setSelectedCampaign(campaign);
                                            try {
                                                localStorage.setItem('dashboard_selectedCampaign', campaign);
                                            } catch (err) {
                                                // 無視
                                            }
                                        }}
                                        className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                                            selectedCampaign === campaign
                                                ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500'
                                                : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        {campaign}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            {/* Date Range Inputs */}
            <div className="flex items-center space-x-2">
                <div className="relative">
                    <input 
                        type="date" 
                        value={dateRange.start || ''}
                        max={dateRange.end || undefined}
                        onChange={(e) => {
                            const newStart = e.target.value;
                            setIsInitialLoad(false); // ユーザーが手動で変更した場合は自動更新を無効化
                            
                            // 開始日が終了日より後の場合は、終了日も調整
                            let newEnd = dateRange.end;
                            if (newStart && newEnd && newStart > newEnd) {
                                newEnd = newStart;
                            }
                            
                            const newRange = { start: newStart, end: newEnd };
                            setDateRange(newRange);
                            // localStorageに保存（AnomalyDetectorと同期）
                            try {
                                localStorage.setItem('dashboard_dateRange', JSON.stringify(newRange));
                            } catch (err) {
                                // 無視
                            }
                        }}
                        className="block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg sm:text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <span className="text-gray-500 dark:text-gray-400">~</span>
                <div className="relative">
                    <input 
                        type="date" 
                        value={dateRange.end || ''}
                        min={dateRange.start || undefined}
                        onChange={(e) => {
                            const newEnd = e.target.value;
                            setIsInitialLoad(false); // ユーザーが手動で変更した場合は自動更新を無効化
                            
                            // 終了日が開始日より前の場合は、開始日も調整
                            let newStart = dateRange.start;
                            if (newStart && newEnd && newEnd < newStart) {
                                newStart = newEnd;
                            }
                            
                            const newRange = { start: newStart, end: newEnd };
                            setDateRange(newRange);
                            // localStorageに保存（AnomalyDetectorと同期）
                            try {
                                localStorage.setItem('dashboard_dateRange', JSON.stringify(newRange));
                            } catch (err) {
                                // 無視
                            }
                        }}
                        className="block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg sm:text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
            </div>

            {/* Quick Filters */}
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button 
                    onClick={() => setQuickFilter(7)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors hover:bg-white dark:hover:bg-gray-600 dark:text-gray-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        getActiveQuickFilter === 7 
                            ? 'bg-indigo-50 border border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500' 
                            : ''
                    }`}
                >
                    7日間
                </button>
                <button 
                    onClick={() => setQuickFilter(30)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors hover:bg-white dark:hover:bg-gray-600 dark:text-gray-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        getActiveQuickFilter === 30 
                            ? 'bg-indigo-50 border border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500' 
                            : ''
                    }`}
                >
                    30日間
                </button>
                <button 
                    onClick={() => setQuickFilter('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors hover:bg-white dark:hover:bg-gray-600 dark:text-gray-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        getActiveQuickFilter === 'all' 
                            ? 'bg-indigo-50 border border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500' 
                            : ''
                    }`}
                >
                    全期間
                </button>
            </div>
        </div>
      </div>

      {/* No Data Message */}
      {data.length === 0 && !loading && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6 text-center">
          <div className="flex items-center justify-center mb-2">
            <Calendar size={24} className="text-yellow-600 dark:text-yellow-400 mr-2" />
            <p className="text-base font-semibold text-yellow-800 dark:text-yellow-200">
              選択した期間にデータがありません
            </p>
          </div>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
            日付範囲を変更するか、「全期間」を選択してデータがある期間を表示してください。
          </p>
        </div>
      )}

      {/* Performance Analysis - AI分析レポートと同じ形式 */}
      {data.length > 0 && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 md:p-8 avoid-break transition-colors">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 mr-3">
              <TrendingUp size={20} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">詳細パフォーマンス分析</h3>
          </div>

          {/* Totals - 全体サマリー */}
          <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 break-words">全体サマリー</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800 min-w-0 overflow-hidden">
              <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium truncate">インプレッション</div>
              <div className="text-lg font-bold text-blue-700 dark:text-blue-300 break-words leading-tight">
                {kpiData.totalImpressions.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800 min-w-0 overflow-hidden">
              <div className="text-xs text-green-600 dark:text-green-400 mb-1 font-medium truncate">クリック数</div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300 break-words leading-tight">
                {kpiData.totalClicks.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800 min-w-0 overflow-hidden">
              <div className="text-xs text-red-600 dark:text-red-400 mb-1 font-medium truncate">費用</div>
              <div className="text-lg font-bold text-red-700 dark:text-red-300 break-words leading-tight">
                ¥{kpiData.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
              <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">コンバージョン</div>
              <div className="text-lg font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                {kpiData.totalConversions.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800 min-w-0 overflow-hidden">
              <div className="text-xs text-yellow-600 dark:text-yellow-400 mb-1 font-medium truncate">コンバージョン価値</div>
              <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300 break-words leading-tight">
                ¥{kpiData.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
            </div>
          </div>
          </div>

          {/* Averages - 計算指標（パフォーマンス指標） */}
          <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 break-words">計算指標（パフォーマンス指標）</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
              <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">ROAS</div>
              <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                {kpiData.avgRoas.toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">費用対効果</div>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
              <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CTR</div>
              <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                {kpiData.ctr.toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">クリック率</div>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
              <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CVR</div>
              <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                {kpiData.cvr.toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">コンバージョン率</div>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
              <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CPC</div>
              <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                ¥{kpiData.cpc.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">クリック単価</div>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
              <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CPA</div>
              <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                ¥{kpiData.avgCpa.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">獲得単価</div>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800 min-w-0 overflow-hidden">
              <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium truncate">CPM</div>
              <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 break-words leading-tight">
                ¥{kpiData.cpm.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">インプレッション単価</div>
            </div>
          </div>
          </div>

          {/* リーチ・エンゲージメント指標 */}
          {(kpiData.totalReach > 0 || kpiData.frequency > 0 || kpiData.engagementRate > 0 || kpiData.totalLinkClicks > 0 || kpiData.totalLandingPageViews > 0) && (
            <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 break-words">リーチ・エンゲージメント指標</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {kpiData.totalReach > 0 && (
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">リーチ数</div>
                  <div className="text-lg font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                    {kpiData.totalReach.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                </div>
              )}
              {kpiData.frequency > 0 && (
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">フリークエンシー</div>
                  <div className="text-lg font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                    {kpiData.frequency.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">平均</div>
                </div>
              )}
              {kpiData.engagementRate > 0 && (
                <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-3 border border-pink-200 dark:border-pink-800 min-w-0 overflow-hidden">
                  <div className="text-xs text-pink-600 dark:text-pink-400 mb-1 font-medium truncate">エンゲージメント率</div>
                  <div className="text-lg font-bold text-pink-700 dark:text-pink-300 break-words leading-tight">
                    {kpiData.engagementRate.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">平均</div>
                </div>
              )}
              {kpiData.totalLinkClicks > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800 min-w-0 overflow-hidden">
                  <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium truncate">リンククリック数</div>
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-300 break-words leading-tight">
                    {kpiData.totalLinkClicks.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                </div>
              )}
              {kpiData.totalLandingPageViews > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800 min-w-0 overflow-hidden">
                  <div className="text-xs text-green-600 dark:text-green-400 mb-1 font-medium truncate">LPビュー数</div>
                  <div className="text-lg font-bold text-green-700 dark:text-green-300 break-words leading-tight">
                    {kpiData.totalLandingPageViews.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                </div>
              )}
            </div>
          </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 print:block print:space-y-6">
            {/* Trend Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 transition-colors">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center">
            <TrendingUp size={16} className="mr-2 text-indigo-600 dark:text-indigo-400" />
            日次トレンド
          </h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#374151" : "#f0f0f0"} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => val.slice(5)} 
                  stroke={isDark ? "#9ca3af" : "#9ca3af"}
                  fontSize={11}
                />
                <YAxis stroke={isDark ? "#9ca3af" : "#9ca3af"} fontSize={11} />
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: isDark ? '#1f2937' : '#fff', 
                    borderRadius: '8px', 
                    border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
                    color: isDark ? '#f3f4f6' : '#111827'
                  }}
                  formatter={(value: any) => `¥${value.toLocaleString()}`}
                />
                <Area 
                  type="monotone" 
                  dataKey="cost" 
                  stroke="#6366f1" 
                  fillOpacity={1} 
                  fill="url(#colorCost)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Campaign Performance Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 transition-colors">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center">
            <PieChart size={16} className="mr-2 text-indigo-600 dark:text-indigo-400" />
            キャンペーン別パフォーマンス
          </h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedCampaigns.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#374151" : "#f0f0f0"} />
                <XAxis 
                  dataKey="campaign_name" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  stroke={isDark ? "#9ca3af" : "#9ca3af"}
                  fontSize={10}
                />
                <YAxis stroke={isDark ? "#9ca3af" : "#9ca3af"} fontSize={11} />
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: isDark ? '#1f2937' : '#fff', 
                    borderRadius: '8px', 
                    border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
                    color: isDark ? '#f3f4f6' : '#111827'
                  }}
                  formatter={(value: any) => `¥${value.toLocaleString()}`}
                />
                <Bar dataKey="cost" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
          </div>

          {/* Campaign Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">キャンペーン一覧</h3>
          <Button variant="outline" icon={<Download size={16} />} onClick={handleExportCSV}>
            CSVエクスポート
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th 
                  className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => requestSort('campaign_name')}
                >
                  <div className="flex items-center">
                    キャンペーン名
                    <SortIcon colKey="campaign_name" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => requestSort('impressions')}
                >
                  <div className="flex items-center justify-end">
                    インプレッション
                    <SortIcon colKey="impressions" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => requestSort('clicks')}
                >
                  <div className="flex items-center justify-end">
                    クリック
                    <SortIcon colKey="clicks" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => requestSort('cost')}
                >
                  <div className="flex items-center justify-end">
                    費用
                    <SortIcon colKey="cost" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => requestSort('conversions')}
                >
                  <div className="flex items-center justify-end">
                    CV
                    <SortIcon colKey="conversions" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => requestSort('roas')}
                >
                  <div className="flex items-center justify-end">
                    ROAS
                    <SortIcon colKey="roas" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => requestSort('ctr')}
                >
                  <div className="flex items-center justify-end">
                    CTR
                    <SortIcon colKey="ctr" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => requestSort('cpc')}
                >
                  <div className="flex items-center justify-end">
                    CPC
                    <SortIcon colKey="cpc" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => requestSort('cvr')}
                >
                  <div className="flex items-center justify-end">
                    CVR
                    <SortIcon colKey="cvr" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => requestSort('cpa')}
                >
                  <div className="flex items-center justify-end">
                    CPA
                    <SortIcon colKey="cpa" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {sortedCampaigns.map((campaign, idx) => (
                <tr 
                  key={idx}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                  onClick={(e) => {
                    // テーブルヘッダーのクリックと区別するため、行のクリックのみ処理
                    e.stopPropagation();
                    setSelectedCampaign(campaign.campaign_name);
                    try {
                      localStorage.setItem('dashboard_selectedCampaign', campaign.campaign_name);
                    } catch (err) {
                      // 無視
                    }
                    // モーダルを開いて詳細分析結果を表示
                    setSelectedCampaignName(campaign.campaign_name);
                  }}
                >
                  <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {campaign.campaign_name}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-right">
                    {campaign.impressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-right">
                    {campaign.clicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right font-medium">
                    ¥{campaign.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-right">
                    {campaign.conversions}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-right">
                    <span className={`font-medium ${campaign.roas >= 100 ? 'text-green-600 dark:text-green-400' : campaign.roas >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                      {campaign.roas.toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-right">
                    {campaign.ctr.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-right">
                    ¥{campaign.cpc.toFixed(0)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-right">
                    {campaign.cvr ? campaign.cvr.toFixed(2) + '%' : '-'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-right">
                    ¥{campaign.cpa.toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
