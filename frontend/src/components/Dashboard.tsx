// Netlifyデプロイ用の変更検知 - 2025-12-30
// Fix: リーチ数をMeta APIから期間全体のユニーク数として取得
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
    // クリック数はlink_clicksを使用（Meta広告マネージャの「リンクのクリック」に相当）
    // link_clicksが存在する場合はそれを使用、なければclicksを使用
    const totalClicks = campaignHistory.reduce((acc, curr) => {
      const linkClicks = curr.link_clicks || 0;
      const clicks = curr.clicks || 0;
      return acc + (linkClicks > 0 ? linkClicks : clicks);
    }, 0);
    const totalConversions = campaignHistory.reduce((acc, curr) => acc + (curr.conversions || 0), 0);
    const totalValue = campaignHistory.reduce((acc, curr) => acc + (curr.conversion_value || 0), 0);
    const totalReach = campaignHistory.reduce((acc, curr) => acc + (curr.reach || 0), 0);
    // ユニークリーチ数: period_unique_reachの合計（0より大きい値のみ、キャンペーンごとに1回のみカウント）
    const campaignUniqueReachMap = new Map<string, number>();
    campaignHistory.forEach(curr => {
      if (curr.period_unique_reach && curr.period_unique_reach > 0) {
        const campaignKey = curr.campaign_name || 'unknown';
        if (!campaignUniqueReachMap.has(campaignKey)) {
          campaignUniqueReachMap.set(campaignKey, curr.period_unique_reach);
        }
      }
    });
    const totalUniqueReach = Array.from(campaignUniqueReachMap.values()).reduce((sum, reach) => sum + reach, 0);
    // 注意: period_unique_reachが0の場合は、0のまま表示（日次のreachの合計はユニークリーチではない）
    const totalEngagements = campaignHistory.reduce((acc, curr) => acc + (curr.engagements || 0), 0);
    const totalLinkClicks = campaignHistory.reduce((acc, curr) => acc + (curr.link_clicks || 0), 0);
    const totalLandingPageViews = campaignHistory.reduce((acc, curr) => acc + (curr.landing_page_views || 0), 0);
    
    // 計算指標（Meta広告マネージャの定義に合わせる）
    // ROAS = conversion_value / cost（比率、パーセンテージではない）
    const avgRoas = totalCost > 0 ? (totalValue / totalCost) : 0;
    // CPA = cost / conversions
    const avgCpa = totalConversions > 0 ? (totalCost / totalConversions) : 0;
    // CTR = (clicks / impressions) * 100（clicksはlink_clicks）
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    // CPC = cost / clicks（clicksはlink_clicks）
    const cpc = totalClicks > 0 ? (totalCost / totalClicks) : 0;
    // CPM = (cost / impressions) * 1000
    const cpm = totalImpressions > 0 ? (totalCost / totalImpressions * 1000) : 0;
    // CVR = (conversions / clicks) * 100（clicksはlink_clicks）
    const cvr = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0;
    // Frequency = impressions / reach
    const frequency = totalReach > 0 ? (totalImpressions / totalReach) : 0;
    // Engagement Rate = (engagements / impressions) * 100
    const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions * 100) : 0;
    
    return { 
      totalCost, 
      totalImpressions,
      totalClicks,
      totalConversions, 
      totalReach,
      totalUniqueReach,
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
                      {((stats.avgRoas || 0)).toFixed(2)}
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
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 break-words">リーチ・エンゲージメント指標</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                        <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">リーチ数（全体）</div>
                        <div className="text-lg font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                          {(stats.totalReach || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                </div>
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                        <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">リーチ数（ユニーク）</div>
                        <div className="text-lg font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                          {(stats.totalUniqueReach || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">ユニーク</div>
                </div>
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                        <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">フリークエンシー</div>
                        <div className="text-lg font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                          {(stats.frequency || 0).toFixed(2)}
                </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">平均</div>
            </div>
                  <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-3 border border-pink-200 dark:border-pink-800 min-w-0 overflow-hidden">
                    <div className="text-xs text-pink-600 dark:text-pink-400 mb-1 font-medium truncate">エンゲージメント数</div>
                    <div className="text-lg font-bold text-pink-700 dark:text-pink-300 break-words leading-tight">
                      {(stats.totalEngagements || 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                  </div>
                      <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-3 border border-pink-200 dark:border-pink-800 min-w-0 overflow-hidden">
                        <div className="text-xs text-pink-600 dark:text-pink-400 mb-1 font-medium truncate">エンゲージメント率</div>
                        <div className="text-lg font-bold text-pink-700 dark:text-pink-300 break-words leading-tight">
                          {(stats.engagementRate || 0).toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">平均</div>
                  </div>
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800 min-w-0 overflow-hidden">
                        <div className="text-xs text-green-600 dark:text-green-400 mb-1 font-medium truncate">LPビュー数</div>
                        <div className="text-lg font-bold text-green-700 dark:text-green-300 break-words leading-tight">
                          {(stats.totalLandingPageViews || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                  </div>
                  </div>
              </div>
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
  const [apiData, setApiData] = useState<CampaignData[]>([]); // 日付範囲でフィルタリングされたデータ（表示用）
  const [allApiData, setAllApiData] = useState<CampaignData[]>([]); // 全データ（キャンペーン/広告セット/広告一覧用）
  const [summaryData, setSummaryData] = useState<any>(null);
  // campaignReachMapを削除（DBから直接取得する方式に変更）
  const [trendsData, setTrendsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // データ取得のキャッシュキー（同じパラメータの場合は再取得しない）
  // useRefを使用して、再レンダリングをトリガーせずにキャッシュキーを管理
  const lastFetchParamsRef = React.useRef<{
    start: string;
    end: string;
    metaAccountId: string | null;
  } | null>(null);
  
  // 前回のロードパラメータを保存（キャンペーン切り替え時の最適化用）
  const prevLoadParamsRef = React.useRef<{
    selectedMetaAccountId: string | null;
    dateRange: { start: string; end: string };
    selectedCampaign: string | null;
    selectedAdSet: string | null;
    selectedAd: string | null;
  } | null>(null);
  
  // 前回のパラメータを保存（API呼び出し最適化用）
  const prevApiParamsRef = React.useRef<{
    metaAccountId?: string;
    startDate?: string;
    endDate?: string;
    selectedCampaign?: string;
  } | null>(null);
  
  // 初回ロード判定用
  const hasLoadedRef = React.useRef(false);
  const metaAccountsLoadedRef = React.useRef(false); // loadMetaAccounts専用
  const prevSelectedCampaignRef = React.useRef<string | null>(null);
  const prevStartDateRef = React.useRef<string | null>(null);
  const prevEndDateRef = React.useRef<string | null>(null);
  const prevSelectedMetaAccountIdRef = React.useRef<string | null>(null);
  const prevPropDataRef = React.useRef<CampaignData[] | null>(null);
  // summaryDataが取得された時のキャンペーン名を保存（不一致チェック用）
  const summaryDataCampaignRef = React.useRef<string | null>(null);

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
    const allData = [...(apiData.length > 0 ? apiData : propData || [])];
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
  
  // 広告セット選択
  const [selectedAdSet, setSelectedAdSet] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('dashboard_selectedAdSet');
      if (saved !== null && saved !== '') {
        return saved;
      }
    } catch (e) {
      // 無視
    }
    return null;
  });
  
  // 広告選択
  const [selectedAd, setSelectedAd] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('dashboard_selectedAd');
      if (saved !== null && saved !== '') {
        return saved;
      }
    } catch (e) {
      // 無視
    }
    return null;
  });
  
  const [sortConfig, setSortConfig] = useState<{ key: keyof CampaignData; direction: 'asc' | 'desc' } | null>({ key: 'cost', direction: 'desc' });
  
  // Selected Campaign for Modal
  const [selectedCampaignName, setSelectedCampaignName] = useState<string | null>(null);

  // Meta Account (Asset) Selection
  // localStorageからキャッシュを読み込む（再マウント時も再利用）
  const [metaAccounts, setMetaAccounts] = useState<Array<{ account_id: string; name: string; data_count: number; campaign_count: number; latest_date: string | null }>>(() => {
    try {
      const cached = localStorage.getItem('dashboard_metaAccounts');
      const cacheTime = localStorage.getItem('dashboard_metaAccounts_time');
      if (cached && cacheTime) {
        const age = Date.now() - parseInt(cacheTime);
        // キャッシュが1時間以内の場合は使用
        if (age < 3600000) {
          const parsed = JSON.parse(cached);
          console.log('[Dashboard] Meta accounts loaded from cache (initial state):', parsed.length, 'accounts');
          console.log('[Dashboard] Initial cached accounts data:', JSON.stringify(parsed, null, 2));
          return Array.isArray(parsed) ? parsed : [];
        }
      }
    } catch (e) {
      // 無視
    }
    return [];
  });
  const [metaAccountsError, setMetaAccountsError] = useState<string | null>(null);
  const [metaAccountsLoading, setMetaAccountsLoading] = useState(() => {
    // キャッシュが有効な場合はローディング不要
    try {
      const cached = localStorage.getItem('dashboard_metaAccounts');
      const cacheTime = localStorage.getItem('dashboard_metaAccounts_time');
      if (cached && cacheTime) {
        const age = Date.now() - parseInt(cacheTime);
        if (age < 3600000) {
          return false;
        }
      }
    } catch (e) {
      // 無視
    }
    return true;
  });
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
    // 初回のみ実行（React Strict Modeでの重複実行を防ぐ）
    if (metaAccountsLoadedRef.current) {
      return;
    }
    
    console.log('[Dashboard] useEffect for loadMetaAccounts triggered');
    const loadMetaAccounts = async () => {
      // まずキャッシュを確認
      try {
        const cachedAccounts = localStorage.getItem('dashboard_metaAccounts');
        const cacheTime = localStorage.getItem('dashboard_metaAccounts_time');
        const CACHE_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24時間キャッシュ有効（App.tsxと同じ）
        
        // キャッシュ時間の検証
        let isCacheValid = false;
        if (cacheTime) {
          const cacheTimestamp = parseInt(cacheTime);
          if (!isNaN(cacheTimestamp) && cacheTimestamp > 0) {
            isCacheValid = (Date.now() - cacheTimestamp) < CACHE_VALIDITY_MS;
          }
        }
        
        // キャッシュが有効で、データが存在する場合
        if (cachedAccounts && cachedAccounts !== '[]' && cachedAccounts !== 'null' && isCacheValid) {
          try {
            const parsedAccounts = JSON.parse(cachedAccounts);
            if (parsedAccounts && Array.isArray(parsedAccounts) && parsedAccounts.length > 0) {
              console.log('[Dashboard] Loaded meta accounts from cache:', parsedAccounts.length, 'accounts');
              console.log('[Dashboard] Cached accounts data:', JSON.stringify(parsedAccounts, null, 2));
              setMetaAccounts(parsedAccounts);
              setMetaAccountsError(null);
              setMetaAccountsLoading(false);
              metaAccountsLoadedRef.current = true; // キャッシュが有効な場合も、loadedフラグを設定
              return; // キャッシュが有効な場合はAPI呼び出しをスキップ
            }
          } catch (e) {
            console.error('[Dashboard] Failed to parse cached meta accounts:', e);
            localStorage.removeItem('dashboard_metaAccounts');
            localStorage.removeItem('dashboard_metaAccounts_time');
          }
        } else if (cachedAccounts && isCacheValid) {
          // キャッシュは有効だが、データが空の場合はAPIから取得
          console.log('[Dashboard] Cache is valid but empty, fetching from API');
        } else if (cachedAccounts && !isCacheValid) {
          console.log('[Dashboard] Cache expired, fetching from API');
        } else {
          console.log('[Dashboard] No cache found, fetching from API');
        }
      } catch (e) {
        console.error('[Dashboard] Error checking cache:', e);
        // エラーが発生した場合はAPIから取得を続行
      }
      
      // キャッシュがない、または期限切れの場合のみAPIから取得
      setMetaAccountsLoading(true);
      setMetaAccountsError(null);
      try {
        console.log('[Dashboard] Calling Api.getMetaAccounts()');
        const result = await Api.getMetaAccounts();
        console.log('[Dashboard] Api.getMetaAccounts() completed, accounts count:', result.accounts?.length || 0);
        console.log('[Dashboard] API accounts data:', JSON.stringify(result.accounts, null, 2));
        setMetaAccounts(result.accounts || []);
        setMetaAccountsError(null);
        // localStorageにキャッシュを保存
        try {
          localStorage.setItem('dashboard_metaAccounts', JSON.stringify(result.accounts || []));
          localStorage.setItem('dashboard_metaAccounts_time', Date.now().toString());
        } catch (e) {
          console.error('[Dashboard] Failed to cache meta accounts:', e);
        }
      } catch (error: any) {
        console.error('[Dashboard] Failed to load Meta accounts:', error);
        setMetaAccountsError(error?.message || 'アセット情報の取得に失敗しました');
        setMetaAccounts([]);
      } finally {
        setMetaAccountsLoading(false);
        metaAccountsLoadedRef.current = true; // API呼び出し完了後、loadedフラグを設定
      }
    };
    
    // 初回のみ実行
    metaAccountsLoadedRef.current = true; // 実行前にフラグを設定（重複実行を防ぐ）
    loadMetaAccounts();
    // 依存配列を空にして、初回マウント時のみ実行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // propDataの前回の参照を保持（変更検知用）
  // propDataの内容ベースのハッシュを計算（参照ではなく内容で判定）
  const propDataHash = useMemo(() => {
    if (!propData || propData.length === 0) return '';
    // データの内容に基づいたハッシュを作成
    const firstId = propData[0]?.id || '';
    const lastId = propData[propData.length - 1]?.id || '';
    const length = propData.length;
    return `${length}-${firstId}-${lastId}`;
  }, [propData]);
  
  const prevPropDataHashRef = React.useRef<string>(propDataHash);

  // キャンペーン切替時の高速化用関数（summaryのみ取得）
  // DBから取得したデータから集計（API呼び出しなし）
  const loadSummaryOnly = React.useCallback(async (campaignName?: string | null) => {
    const targetCampaign = campaignName !== undefined ? campaignName : selectedCampaign;
    
    // apiDataまたはallApiDataから集計
    const sourceData = apiData.length > 0 ? apiData : (allApiData.length > 0 ? allApiData : []);
    
    if (sourceData.length === 0) {
      console.warn('[Dashboard] loadSummaryOnly: No data available, skipping summary calculation');
      return;
    }
    
    // 日付範囲でフィルタリング
    let filteredData = sourceData.filter((d: CampaignData) => {
      if (!d.date) return false;
      return d.date >= dateRange.start && d.date <= dateRange.end;
    });
    
    // フィルタリング（キャンペーン/広告セット/広告）
    if (targetCampaign && targetCampaign !== 'all') {
      filteredData = filteredData.filter(d => d.campaign_name === targetCampaign);
    }
    if (selectedAdSet && selectedAdSet !== 'all') {
      filteredData = filteredData.filter(d => d.ad_set_name === selectedAdSet);
    }
    if (selectedAd && selectedAd !== 'all') {
      filteredData = filteredData.filter(d => d.ad_name === selectedAd);
    }
    
    // フィルタリング後のデータが空の場合はsummaryDataをクリア
    if (filteredData.length === 0) {
      console.log('[Dashboard] loadSummaryOnly: No data after filtering, clearing summaryData');
      setSummaryData(null);
      summaryDataCampaignRef.current = targetCampaign || null;
      return;
    }
    
    // フロントエンドでsummaryDataを集計
    const totalImpressions = filteredData.reduce((sum, d) => sum + (d.impressions || 0), 0);
    const totalClicks = filteredData.reduce((sum, d) => {
      const linkClicks = d.link_clicks || 0;
      const clicks = d.clicks || 0;
      return sum + (linkClicks > 0 ? linkClicks : clicks);
    }, 0);
    const totalCost = filteredData.reduce((sum, d) => sum + (d.cost || 0), 0);
    const totalConversions = filteredData.reduce((sum, d) => sum + (d.conversions || 0), 0);
    const totalConversionValue = filteredData.reduce((sum, d) => sum + (d.conversion_value || 0), 0);
    
    // リーチ数の計算: period_unique_reachを優先的に使用（0より大きい場合のみ）
    // キャンペーンごとにperiod_unique_reachを取得し、複数キャンペーンの場合は合計（重複排除は困難なため、近似値として合計）
    // period_unique_reachは期間全体のユニークリーチ数なので、同じキャンペーンの複数日付データでは同じ値のはず
    const campaignReachMap = new Map<string, number>();
    filteredData.forEach(d => {
      const campaignKey = d.campaign_name || 'unknown';
      // period_unique_reachが存在し、0より大きい場合のみ使用
      if (d.period_unique_reach && d.period_unique_reach > 0) {
        // period_unique_reachが設定されている場合は、最初に見つかった値を使用
        if (!campaignReachMap.has(campaignKey)) {
          campaignReachMap.set(campaignKey, d.period_unique_reach);
        }
      }
    });
    
    // period_unique_reachが未設定または0のキャンペーンについては、日次のreachの合計を使用（フォールバック）
    const campaignDailyReachMap = new Map<string, number>();
    filteredData.forEach(d => {
      const campaignKey = d.campaign_name || 'unknown';
      if (!campaignReachMap.has(campaignKey)) {
        // period_unique_reachが未設定または0のキャンペーンの場合、日次のreachの合計を使用
        const currentDailyReach = campaignDailyReachMap.get(campaignKey) || 0;
        campaignDailyReachMap.set(campaignKey, currentDailyReach + (d.reach || 0));
      }
    });
    
    // 各キャンペーンのリーチ数を合計
    const totalReach = Array.from(campaignReachMap.values()).reduce((sum, reach) => sum + reach, 0) +
                      Array.from(campaignDailyReachMap.values()).reduce((sum, reach) => sum + reach, 0);
    
    // ユニークリーチ数の合計（period_unique_reachのみ）
    // period_unique_reachが0の場合は、日次のreachの合計は使用しない（ユニークリーチではないため）
    const totalUniqueReach = Array.from(campaignReachMap.values()).reduce((sum, reach) => sum + reach, 0);
    // 注意: period_unique_reachが0の場合は、0のまま表示（日次のreachの合計はユニークリーチではない）
    
    const totalEngagements = filteredData.reduce((sum, d) => sum + (d.engagements || 0), 0);
    const totalLinkClicks = filteredData.reduce((sum, d) => sum + (d.link_clicks || 0), 0);
    const totalLandingPageViews = filteredData.reduce((sum, d) => sum + (d.landing_page_views || 0), 0);
    
    // 計算指標
    const avgRoas = totalCost > 0 ? (totalConversionValue / totalCost) : 0;
    const avgCpa = totalConversions > 0 ? (totalCost / totalConversions) : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    const cpc = totalClicks > 0 ? (totalCost / totalClicks) : 0;
    const cpm = totalImpressions > 0 ? (totalCost / totalImpressions * 1000) : 0;
    const cvr = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0;
    const frequency = totalReach > 0 ? (totalImpressions / totalReach) : 0;
    const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions * 100) : 0;
    
    // summaryDataを生成
    const calculatedSummary = {
      period: {
        start: dateRange.start,
        end: dateRange.end
      },
      totals: {
        impressions: totalImpressions,
        clicks: totalClicks,
        cost: totalCost,
        conversions: totalConversions,
        conversion_value: totalConversionValue,
        reach: totalReach,
        unique_reach: totalUniqueReach,
        engagements: totalEngagements,
        link_clicks: totalLinkClicks,
        landing_page_views: totalLandingPageViews
      },
      averages: {
        roas: avgRoas,
        cpa: avgCpa,
        ctr: ctr,
        cpc: cpc,
        cpm: cpm,
        cvr: cvr,
        frequency: frequency,
        engagement_rate: engagementRate
      }
    };
    
    setSummaryData(calculatedSummary);
    summaryDataCampaignRef.current = targetCampaign || null;
    
    console.log('[Dashboard] loadSummaryOnly: Summary calculated from DB data:', calculatedSummary);
  }, [selectedCampaign, selectedMetaAccountId, dateRange, selectedAdSet, selectedAd, apiData, allApiData]);

  // キャンペーン切替時のハンドラー（summaryのみ取得して全データ再取得を回避）
  const handleCampaignChange = React.useCallback(async (campaignName: string | null) => {
    console.log('[Dashboard] handleCampaignChange: Campaign change to:', campaignName);
    
    // 前のキャンペーンを保存
    const previousCampaign = prevSelectedCampaignRef.current;
    
    // キャンペーンを更新
    setSelectedCampaign(campaignName);
    
    // 広告セットと広告をクリア
    setSelectedAdSet(null);
    setSelectedAd(null);
    
    // localStorageに保存
    try {
      localStorage.setItem('dashboard_selectedCampaign', campaignName || '');
      localStorage.setItem('dashboard_selectedAdSet', '');
      localStorage.setItem('dashboard_selectedAd', '');
    } catch (err) {
      console.error('[Dashboard] Failed to save to localStorage:', err);
    }
    
    // summaryDataをクリア（前のキャンペーンのデータが残らないように）
    if (previousCampaign && previousCampaign !== campaignName) {
      console.log('[Dashboard] Clearing previous summaryData for campaign switch');
      setSummaryData(null);
      summaryDataCampaignRef.current = null; // キャンペーン名もクリア
    }
    
    // summaryのみ取得（全データは再取得しない）
    try {
      console.log('[Dashboard] Fetching summary for campaign:', campaignName);
      await loadSummaryOnly(campaignName);
      console.log('[Dashboard] Summary updated successfully');
    } catch (error) {
      console.error('[Dashboard] Failed to update summary:', error);
      // エラー時はfilteredDataの値を使用（既存の動作を維持）
    }
    
    // 参照を更新
    prevSelectedCampaignRef.current = campaignName;
  }, [loadSummaryOnly]);

  // Load dashboard data from API
  useEffect(() => {
    const loadDashboardData = async () => {
      // propDataが存在する場合は、それを使用してAPI呼び出しをスキップ
      if (propData && propData.length > 0) {
        console.log('[Dashboard] propData available, using it instead of API call:', propData.length, 'records');
        setAllApiData(propData);
        if (selectedMetaAccountId) {
          // データベースには act_ プレフィックス付きで保存されているので、それに合わせて比較
          const selectedAccountIdWithPrefix = selectedMetaAccountId.startsWith('act_') 
            ? selectedMetaAccountId 
            : `act_${selectedMetaAccountId}`;
          const filteredByAsset = propData.filter((d: CampaignData) => {
            const accountId = d.meta_account_id;
            return accountId === selectedAccountIdWithPrefix || accountId === selectedMetaAccountId;
          });
          setApiData(filteredByAsset);
        } else {
          setApiData(propData);
        }
        setLoading(false);
        return; // propDataがある場合はAPI呼び出しをスキップ
      }
      
      const currentParams = {
        start: dateRange.start,
        end: dateRange.end
      };
      
      // キャンペーン切替時の最適化チェック
      // アセット選択変更時は再取得しない（フィルタリングのみ）
      const prevParams = prevApiParamsRef.current;
      const needsFullReload = 
        !prevParams ||
        prevParams.startDate !== dateRange.start ||
        prevParams.endDate !== dateRange.end;
      
      const isCampaignOnlyChange = 
        !needsFullReload &&
        prevParams &&
        prevParams.selectedCampaign !== selectedCampaign &&
        selectedCampaign !== 'all';
      
      // キャンペーン切替時にsummaryDataをクリア
      if (selectedCampaign && prevSelectedCampaignRef.current && prevSelectedCampaignRef.current !== selectedCampaign) {
        console.log('[Dashboard] Clearing previous summaryData for campaign switch');
        console.log('[Dashboard] Previous campaign:', prevSelectedCampaignRef.current);
        console.log('[Dashboard] New campaign:', selectedCampaign);
        setSummaryData(null);
      }
      
      if (isCampaignOnlyChange) {
        console.log('[Dashboard] Campaign-only change detected, loading summary only');
        await loadSummaryOnly();
        // パラメータを更新
        prevApiParamsRef.current = {
          metaAccountId: selectedMetaAccountId || undefined,
          startDate: dateRange.start,
          endDate: dateRange.end,
          selectedCampaign: selectedCampaign || undefined
        };
        return;
      }
      
      // データ取得前にstateをクリアしてキャッシュを防ぐ（フルリロード時のみ）
      if (needsFullReload) {
        setSummaryData(null);
        setTrendsData(null);
        setApiData([]);
        setAllApiData([]);
      }
      
      setLoading(true);
      console.log('[Dashboard] ===== Loading data =====');
      console.log('[Dashboard] Loading data with params:', {
        start: dateRange.start,
        end: dateRange.end,
        selectedMetaAccountId: selectedMetaAccountId,
        selectedCampaign: selectedCampaign,
        selectedAdSet: selectedAdSet,
        selectedAd: selectedAd,
        hasPropData: !!(propData && propData.length > 0),
        propDataLength: propData?.length || 0,
        currentApiDataLength: apiData?.length || 0,
        lastFetchParams: lastFetchParamsRef.current,
        needsFullReload,
        isCampaignOnlyChange
      });
      
      try {
        // 各API呼び出しを個別に処理し、1つが失敗しても他のデータは取得できるようにする
        // 全期間データを1回だけ取得（metaAccountParamは使わない）
        const allCampaignsResult = await Promise.allSettled([
          Api.fetchCampaignData() // 全期間データを取得（全アカウント）
        ]);
        
        // 全期間データを取得
        let allCampaignsResponse: CampaignData[] = [];
        if (allCampaignsResult[0].status === 'fulfilled') {
          allCampaignsResponse = allCampaignsResult[0].value || [];
          console.log('[Dashboard] All campaigns loaded:', allCampaignsResponse.length, 'campaigns');
        } else {
          console.error('[Dashboard] Failed to load campaigns:', allCampaignsResult[0].reason);
        }
        
        // フィルタリング用パラメータ
        const campaignNameParam = selectedCampaign && selectedCampaign !== 'all' ? selectedCampaign : undefined;
        const adSetNameParam = selectedAdSet && selectedAdSet !== 'all' ? selectedAdSet : undefined;
        const adNameParam = selectedAd && selectedAd !== 'all' ? selectedAd : undefined;
        
        // 日付範囲でフィルタリング
        const dateFilteredData = allCampaignsResponse.filter((d: CampaignData) => {
          if (!d.date) return false;
          return d.date >= dateRange.start && d.date <= dateRange.end;
        });
        
        // フィルタリング（キャンペーン/広告セット/広告）
        let filteredData = dateFilteredData;
        if (campaignNameParam) {
          filteredData = filteredData.filter(d => d.campaign_name === campaignNameParam);
        }
        if (adSetNameParam) {
          filteredData = filteredData.filter(d => d.ad_set_name === adSetNameParam);
        }
        if (adNameParam) {
          filteredData = filteredData.filter(d => d.ad_name === adNameParam);
        }
        
        // フロントエンドでsummaryDataを集計
        const totalImpressions = filteredData.reduce((sum, d) => sum + (d.impressions || 0), 0);
        const totalClicks = filteredData.reduce((sum, d) => {
          const linkClicks = d.link_clicks || 0;
          const clicks = d.clicks || 0;
          return sum + (linkClicks > 0 ? linkClicks : clicks);
        }, 0);
        const totalCost = filteredData.reduce((sum, d) => sum + (d.cost || 0), 0);
        const totalConversions = filteredData.reduce((sum, d) => sum + (d.conversions || 0), 0);
        const totalConversionValue = filteredData.reduce((sum, d) => sum + (d.conversion_value || 0), 0);
        
        // リーチ数の計算: period_unique_reachを優先的に使用（0より大きい場合のみ）
        // キャンペーンごとにperiod_unique_reachを取得し、複数キャンペーンの場合は合計（重複排除は困難なため、近似値として合計）
        // period_unique_reachは期間全体のユニークリーチ数なので、同じキャンペーンの複数日付データでは同じ値のはず
        const campaignReachMap = new Map<string, number>();
        filteredData.forEach(d => {
          const campaignKey = d.campaign_name || 'unknown';
          // period_unique_reachが存在し、0より大きい場合のみ使用
          if (d.period_unique_reach && d.period_unique_reach > 0) {
            // period_unique_reachが設定されている場合は、最初に見つかった値を使用
            if (!campaignReachMap.has(campaignKey)) {
              campaignReachMap.set(campaignKey, d.period_unique_reach);
            }
          }
        });
        
        // period_unique_reachが未設定または0のキャンペーンについては、日次のreachの合計を使用（フォールバック）
        const campaignDailyReachMap = new Map<string, number>();
        filteredData.forEach(d => {
          const campaignKey = d.campaign_name || 'unknown';
          if (!campaignReachMap.has(campaignKey)) {
            // period_unique_reachが未設定または0のキャンペーンの場合、日次のreachの合計を使用
            const currentDailyReach = campaignDailyReachMap.get(campaignKey) || 0;
            campaignDailyReachMap.set(campaignKey, currentDailyReach + (d.reach || 0));
          }
        });
        
        // 各キャンペーンのリーチ数を合計
        const totalReach = Array.from(campaignReachMap.values()).reduce((sum, reach) => sum + reach, 0) +
                          Array.from(campaignDailyReachMap.values()).reduce((sum, reach) => sum + reach, 0);
        
        // ユニークリーチ数の合計（period_unique_reachのみ）
        // period_unique_reachが0の場合は、日次のreachの合計は使用しない（ユニークリーチではないため）
        const totalUniqueReach = Array.from(campaignReachMap.values()).reduce((sum, reach) => sum + reach, 0);
        // 注意: period_unique_reachが0の場合は、0のまま表示（日次のreachの合計はユニークリーチではない）
        
        const totalEngagements = filteredData.reduce((sum, d) => sum + (d.engagements || 0), 0);
        const totalLinkClicks = filteredData.reduce((sum, d) => sum + (d.link_clicks || 0), 0);
        const totalLandingPageViews = filteredData.reduce((sum, d) => sum + (d.landing_page_views || 0), 0);
        
        // 計算指標
        const avgRoas = totalCost > 0 ? (totalConversionValue / totalCost) : 0;
        const avgCpa = totalConversions > 0 ? (totalCost / totalConversions) : 0;
        const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
        const cpc = totalClicks > 0 ? (totalCost / totalClicks) : 0;
        const cpm = totalImpressions > 0 ? (totalCost / totalImpressions * 1000) : 0;
        const cvr = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0;
        const frequency = totalReach > 0 ? (totalImpressions / totalReach) : 0;
        const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions * 100) : 0;
        
        // summaryDataを生成
        const calculatedSummary = {
          period: {
            start: dateRange.start,
            end: dateRange.end
          },
          totals: {
            impressions: totalImpressions,
            clicks: totalClicks,
            cost: totalCost,
            conversions: totalConversions,
            conversion_value: totalConversionValue,
            reach: totalReach,
            unique_reach: totalUniqueReach,
            engagements: totalEngagements,
            link_clicks: totalLinkClicks,
            landing_page_views: totalLandingPageViews
          },
          averages: {
            roas: avgRoas,
            cpa: avgCpa,
            ctr: ctr,
            cpc: cpc,
            cpm: cpm,
            cvr: cvr,
            frequency: frequency,
            engagement_rate: engagementRate
          }
        };
        
        console.log('[Dashboard] Summary calculated from DB data:', calculatedSummary);
        setSummaryData(calculatedSummary);
        summaryDataCampaignRef.current = campaignNameParam || null;
        
        // デバッグ用: windowオブジェクトにsummaryDataを公開
        if (typeof window !== 'undefined') {
          (window as any).summaryData = calculatedSummary;
        }
        
        // フロントエンドでtrendsDataを集計（日付別）
        const trendsMap = new Map<string, {
          date: string;
          cost: number;
          clicks: number;
          conversions: number;
          conversion_value: number;
          impressions: number;
          reach: number;
        }>();
        
        filteredData.forEach(d => {
          if (!d.date) return;
          const existing = trendsMap.get(d.date);
          if (existing) {
            existing.cost += d.cost || 0;
            existing.clicks += (d.link_clicks || d.clicks || 0);
            existing.conversions += d.conversions || 0;
            existing.conversion_value += d.conversion_value || 0;
            existing.impressions += d.impressions || 0;
            // リーチ数はユニークな値のため、合算せず最大値を使用
            existing.reach = Math.max(existing.reach || 0, d.reach || 0);
          } else {
            trendsMap.set(d.date, {
              date: d.date,
              cost: d.cost || 0,
              clicks: (d.link_clicks || d.clicks || 0),
              conversions: d.conversions || 0,
              conversion_value: d.conversion_value || 0,
              impressions: d.impressions || 0,
              reach: d.reach || 0
            });
          }
        });
        
        const calculatedTrends = {
          data: Array.from(trendsMap.values()).sort((a, b) => a.date.localeCompare(b.date))
        };
        
        console.log('[Dashboard] Trends calculated from DB data:', calculatedTrends);
        setTrendsData(calculatedTrends);
        
        // キャンペーンデータを結合
        const combinedData: CampaignData[] = filteredData;
        
        console.log('[Dashboard] Combined data:', {
          campaigns: filteredData.length,
          total: combinedData.length
        });
        
        // デバッグ: 広告セットと広告のデータを詳細に確認
        console.log('===== Ad Sets Response =====');
        const allAdSets = combinedData.filter(d => d.ad_set_name && (!d.ad_name || d.ad_name === ''));
        console.log('All ad sets:', allAdSets);
        console.log('Ad sets count:', allAdSets.length);
        const adSetsByCampaign: { [key: string]: string[] } = {};
        allAdSets.forEach(item => {
          if (!adSetsByCampaign[item.campaign_name]) {
            adSetsByCampaign[item.campaign_name] = [];
          }
          if (item.ad_set_name && !adSetsByCampaign[item.campaign_name].includes(item.ad_set_name)) {
            adSetsByCampaign[item.campaign_name].push(item.ad_set_name);
          }
        });
        console.log('Ad sets grouped by campaign:', adSetsByCampaign);
        
        console.log('===== Ads Response =====');
        const allAds = combinedData.filter(d => d.ad_name && d.ad_name !== '');
        console.log('All ads:', allAds);
        console.log('Ads count:', allAds.length);
        const adsByCampaign: { [key: string]: string[] } = {};
        allAds.forEach(item => {
          if (!adsByCampaign[item.campaign_name]) {
            adsByCampaign[item.campaign_name] = [];
          }
          if (item.ad_name && !adsByCampaign[item.campaign_name].includes(item.ad_name)) {
            adsByCampaign[item.campaign_name].push(item.ad_name);
          }
        });
        console.log('Ads grouped by campaign:', adsByCampaign);
        
        console.log('===== All Campaign Names =====');
        const uniqueCampaigns = [...new Set(combinedData.map(d => d.campaign_name).filter(name => name && name !== ''))];
        console.log('Unique campaigns:', uniqueCampaigns);
        
        // 全期間データをallApiDataに設定（キャンペーン/広告セット/広告一覧用）
        if (allCampaignsResponse.length > 0) {
          setAllApiData(allCampaignsResponse);
          console.log('[Dashboard] All campaigns loaded (for lists):', allCampaignsResponse.length, 'campaigns');
          
        // 日付範囲とアセットでフィルタリングされたデータをapiDataに設定
        let filteredByAsset = dateFilteredData;
        if (selectedMetaAccountId) {
          // アセットが選択されている場合、該当アセットでフィルタリング
          filteredByAsset = dateFilteredData.filter((d: CampaignData) => {
            return d.meta_account_id === selectedMetaAccountId;
          });
          console.log('[Dashboard] apiData filtered (asset selected):', filteredByAsset.length, 'records');
        } else {
          console.log('[Dashboard] apiData set to dateFilteredData (no asset selected):', dateFilteredData.length, 'records');
        }
        setApiData(filteredByAsset);
        } else {
          console.warn('[Dashboard] No campaigns data available');
          // Fallback: propDataを使用
          if (propData && propData.length > 0) {
            setAllApiData(propData);
            setApiData(propData);
            console.log('[Dashboard] Using propData as fallback:', propData.length, 'records');
          } else {
            setAllApiData([]);
            setApiData([]);
          }
        }
        
        // データ取得成功時にキャッシュキーを更新
        if (combinedData.length > 0 || summaryData !== null || trendsData !== null) {
          // キャッシュキーを更新（デバッグ用のみ）
          lastFetchParamsRef.current = {
            start: dateRange.start,
            end: dateRange.end
          };
          prevLoadParamsRef.current = {
            selectedMetaAccountId,
            dateRange,
            selectedCampaign,
            selectedAdSet,
            selectedAd
          };
          // パラメータを更新（metaAccountIdは保存しない）
          prevApiParamsRef.current = {
            startDate: dateRange.start,
            endDate: dateRange.end,
            selectedCampaign: selectedCampaign || undefined
          };
          console.log('[Dashboard] Data fetched successfully:', lastFetchParamsRef.current);
        }
      } catch (error) {
        console.error('[Dashboard] Error loading dashboard data:', error);
        // エラー時も、アセットが選択されている場合は空配列を設定
        // propDataはアセットでフィルタリングできないため使用しない
        if (selectedMetaAccountId) {
          console.warn('[Dashboard] Error occurred but asset is selected, clearing apiData');
          setApiData([]);
          setAllApiData([]);
        } else if (propData && propData.length > 0) {
          console.log('[Dashboard] Using propData as fallback after error:', propData.length);
          setApiData(propData);
          setAllApiData(propData);
        } else {
          console.warn('[Dashboard] No propData available after error, keeping previous apiData');
        }
      } finally {
        setLoading(false);
      }
    };
    
    // 初回ロード: propDataがあればそれを使用、なければApp.tsxのデータ取得を待つ
    if (!hasLoadedRef.current) {
      if (propData && propData.length > 0) {
        // propDataが存在する場合は、それを使用してAPI呼び出しをスキップ
        console.log('[Dashboard] Using propData for initial load, skipping API call:', propData.length, 'records');
        setAllApiData(propData);
        if (selectedMetaAccountId) {
          // データベースには act_ プレフィックス付きで保存されているので、それに合わせて比較
          const selectedAccountIdWithPrefix = selectedMetaAccountId.startsWith('act_') 
            ? selectedMetaAccountId 
            : `act_${selectedMetaAccountId}`;
          const filteredByAsset = propData.filter((d: CampaignData) => {
            const accountId = d.meta_account_id;
            return accountId === selectedAccountIdWithPrefix || accountId === selectedMetaAccountId;
          });
          setApiData(filteredByAsset);
        } else {
          setApiData(propData);
        }
        hasLoadedRef.current = true; // propDataが存在する場合のみ、hasLoadedRefをtrueにする
        return;
      } else {
        // propDataがない場合、App.tsxがデータ取得中なので、propDataが更新されるまで待つ
        // propDataが更新されたら、このuseEffectが再実行される（propDataを依存配列に追加したため）
        // hasLoadedRefは更新しない（propDataが更新されるまで待つ）
        console.log('[Dashboard] propData is empty, waiting for App.tsx to load data...');
        return; // propDataが更新されるまで待つ（API呼び出しはしない）
      }
    }
    
    // キャンペーン/日付が変わった場合: 全期間データがあればフィルタリングのみ、なければAPIから取得
    if (
      selectedCampaign !== prevSelectedCampaignRef.current ||
      dateRange.start !== prevStartDateRef.current ||
      dateRange.end !== prevEndDateRef.current
    ) {
      // 全期間データが既に取得済みの場合は、フィルタリングのみ実行
      if (allApiData.length > 0 || (propData && propData.length > 0)) {
        const sourceData = allApiData.length > 0 ? allApiData : propData || [];
        const dateFiltered = sourceData.filter((d: CampaignData) => {
          if (!d.date) return false;
          return d.date >= dateRange.start && d.date <= dateRange.end;
        });
        const assetFiltered = selectedMetaAccountId
          ? (() => {
              // データベースには act_ プレフィックス付きで保存されているので、それに合わせて比較
              const selectedAccountIdWithPrefix = selectedMetaAccountId.startsWith('act_') 
                ? selectedMetaAccountId 
                : `act_${selectedMetaAccountId}`;
              return dateFiltered.filter((d: CampaignData) => {
                const accountId = d.meta_account_id;
                return accountId === selectedAccountIdWithPrefix || accountId === selectedMetaAccountId;
              });
            })()
          : dateFiltered;
        setApiData(assetFiltered);
        setLoading(false); // フィルタリングのみの場合はローディングを終了
        console.log('[Dashboard] Date range changed, filtered from existing data:', assetFiltered.length, 'records');
      } else {
        // データがない場合でも、propDataが空の場合はApp.tsxのデータ取得完了を待つ
        // propDataが更新されない場合（App.tsxがデータ取得に失敗した場合など）のみ、APIから取得
        if (!propData || propData.length === 0) {
          // propDataが空の場合は、App.tsxのデータ取得完了を待つ
          console.log('[Dashboard] No data available, but propData is empty, waiting for App.tsx to load data...');
          return;
        } else if (!hasLoadedRef.current) {
          // propDataがあるが、まだ初回ロードが完了していない場合、propDataの更新を待つ
          console.log('[Dashboard] No data available, but waiting for propData update...');
          return;
        } else {
          // 初回ロードが完了しているがデータがない場合、APIから取得
          console.log('[Dashboard] No data available after initial load, fetching from API...');
          loadDashboardData();
        }
      }
      
      // 参照を更新
      prevSelectedCampaignRef.current = selectedCampaign;
      prevStartDateRef.current = dateRange.start;
      prevEndDateRef.current = dateRange.end;
    }
    
    // アセット選択変更時は、取得済みデータからフィルタリングのみ実行
    if (selectedMetaAccountId !== prevSelectedMetaAccountIdRef.current) {
      if (allApiData.length > 0 || (propData && propData.length > 0)) {
        // ソースデータを決定（allApiDataがあればそれを使用、なければpropDataを使用）
        const sourceData = allApiData.length > 0 ? allApiData : propData || [];
        
        // 日付範囲でフィルタリング
        const dateFiltered = sourceData.filter((d: CampaignData) => {
          if (!d.date) return false;
          return d.date >= dateRange.start && d.date <= dateRange.end;
        });
        
        // アセットでフィルタリング
        const assetFiltered = selectedMetaAccountId
          ? (() => {
              // データベースには act_ プレフィックス付きで保存されているので、それに合わせて比較
              const selectedAccountIdWithPrefix = selectedMetaAccountId.startsWith('act_') 
                ? selectedMetaAccountId 
                : `act_${selectedMetaAccountId}`;
              return dateFiltered.filter((d: CampaignData) => {
                const accountId = d.meta_account_id;
                return accountId === selectedAccountIdWithPrefix || accountId === selectedMetaAccountId;
              });
            })()
          : dateFiltered;
        
        setApiData(assetFiltered);
        setLoading(false); // フィルタリングのみの場合はローディングを終了
        console.log('[Dashboard] Asset changed, filtered from existing data:', assetFiltered.length, 'records');
      } else {
        // データがない場合でも、ローディングを終了（無限読み込みを防ぐ）
        setLoading(false);
        console.log('[Dashboard] No data available for asset change, setting loading to false');
      }
      prevSelectedMetaAccountIdRef.current = selectedMetaAccountId;
    }
    // propDataが変更された場合のみ、データを更新（API呼び出しはしない）
    if (propData && propData.length > 0 && propData !== prevPropDataRef.current) {
      console.log('[Dashboard] propData updated, refreshing display data:', propData.length, 'records');
      setAllApiData(propData);
      if (selectedMetaAccountId) {
        const filteredByAsset = propData.filter((d: CampaignData) => d.meta_account_id === selectedMetaAccountId);
        setApiData(filteredByAsset);
      } else {
        setApiData(propData);
      }
      prevPropDataRef.current = propData;
      // propDataが更新されたら、hasLoadedRefをtrueにする（初回ロード完了）
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        console.log('[Dashboard] Initial load completed with propData');
      }
    }
    // selectedCampaign, selectedAdSet, selectedAdも依存配列に追加（summary APIのフィルタに使用）
    // selectedMetaAccountIdは依存配列から削除（アセット選択変更時は再取得しない）
    // propDataは依存配列に追加（propDataが更新された場合に再実行するため）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end, propData, selectedCampaign, selectedAdSet, selectedAd, loadSummaryOnly]);

  // Use propData if available (from App.tsx), otherwise fallback to apiData
  // Filter by asset and date range
  // propData contains all data (may not have meta_account_id), apiData is filtered by asset and date range
  const data = useMemo(() => {
    console.log('[Dashboard] ===== data useMemo execution =====');
    console.log('[Dashboard] propData length:', propData?.length || 0);
    console.log('[Dashboard] apiData length:', apiData?.length || 0);
    console.log('[Dashboard] allApiData length:', allApiData?.length || 0);
    console.log('[Dashboard] selectedMetaAccountId:', selectedMetaAccountId);
    
    // propData の最初のデータのフィールド名を確認
    if (propData && propData.length > 0) {
      console.log('[Dashboard] propData[0] sample:', propData[0]);
      console.log('[Dashboard] propData[0] keys:', Object.keys(propData[0]));
      console.log('[Dashboard] propData[0] meta_account_id:', propData[0].meta_account_id);
      // propData内のすべてのmeta_account_idを確認
      const uniqueAccountIds = Array.from(new Set(propData.map(d => d.meta_account_id).filter(Boolean)));
      console.log('[Dashboard] Unique meta_account_ids in propData:', uniqueAccountIds);
    }
    
    let sourceData: CampaignData[] = [];
    
    // apiData を優先的に使用するロジック
    // propData は全アカウントのデータなので、フィルタリングせずそのまま使用
    console.log('[Dashboard] selectedMetaAccountId:', selectedMetaAccountId);
    console.log('[Dashboard] propData length:', propData?.length || 0);
    console.log('[Dashboard] apiData length:', apiData?.length || 0);
    console.log('[Dashboard] allApiData length:', allApiData?.length || 0);
    
    if (selectedMetaAccountId === 'all' || !selectedMetaAccountId) {
      // 「すべてのアカウント」が選択されている場合、またはアカウントが選択されていない場合
      // apiDataを優先してデータソースを統一
      sourceData = (allApiData && allApiData.length > 0) ? allApiData : (apiData && apiData.length > 0 ? apiData : (propData && propData.length > 0 ? propData : []));
      console.log('[Dashboard] Using allApiData/apiData (all accounts or no selection):', sourceData.length, 'records');
    } else {
      // 特定のアカウントが選択されている場合
      if (allApiData && allApiData.length > 0) {
        // アセット選択時は、allApiDataをアセットでフィルタリング
        // データベースには act_ プレフィックス付きで保存されているので、それに合わせて比較
        const selectedAccountIdWithPrefix = selectedMetaAccountId.startsWith('act_') 
          ? selectedMetaAccountId 
          : `act_${selectedMetaAccountId}`;
        sourceData = allApiData.filter(d => {
          const accountId = d.meta_account_id || (d as any).meta_account_id;
          return accountId === selectedAccountIdWithPrefix || accountId === selectedMetaAccountId;
        });
        // フィルタリング結果が0件の場合、propDataをフォールバックとして使用
        if (sourceData.length === 0 && propData && propData.length > 0) {
          // データベースには act_ プレフィックス付きで保存されているので、それに合わせて比較
          const selectedAccountIdWithPrefix = selectedMetaAccountId.startsWith('act_') 
            ? selectedMetaAccountId 
            : `act_${selectedMetaAccountId}`;
          const propDataFiltered = propData.filter(d => {
            const accountId = d.meta_account_id || (d as any).meta_account_id;
            return accountId === selectedAccountIdWithPrefix || accountId === selectedMetaAccountId;
          });
          if (propDataFiltered.length > 0) {
            sourceData = propDataFiltered;
            console.log('[Dashboard] Using propData as fallback (allApiData filtered to 0, filtered):', sourceData.length, 'records');
          } else {
            // propDataにも該当アカウントのデータがない場合、空配列を返す（無限読み込みを防ぐため、propDataは使用しない）
            sourceData = [];
            console.log('[Dashboard] No data for selected account in propData, returning empty array (to prevent infinite loading)');
          }
        } else {
        console.log('[Dashboard] Using allApiData (asset selected, filtered):', sourceData.length, 'records');
        }
      } else if (apiData && apiData.length > 0) {
        // apiDataは既にアセットでフィルタリング済み
        sourceData = apiData;
        console.log('[Dashboard] Using apiData (asset selected):', sourceData.length, 'records');
      } else {
        // apiData がない場合、propData をアセットでフィルタリング
        if (propData && propData.length > 0) {
          // データベースには act_ プレフィックス付きで保存されているので、それに合わせて比較
          const selectedAccountIdWithPrefix = selectedMetaAccountId.startsWith('act_') 
            ? selectedMetaAccountId 
            : `act_${selectedMetaAccountId}`;
          const propDataFiltered = propData.filter(d => {
            const accountId = d.meta_account_id || (d as any).meta_account_id;
            return accountId === selectedAccountIdWithPrefix || accountId === selectedMetaAccountId;
          });
          if (propDataFiltered.length > 0) {
            sourceData = propDataFiltered;
        console.log('[Dashboard] Using propData as fallback (no apiData/allApiData, filtered):', sourceData.length, 'records');
          } else {
            // propDataにも該当アカウントのデータがない場合、空配列を返す（無限読み込みを防ぐため、propDataは使用しない）
            sourceData = [];
            console.log('[Dashboard] No data for selected account in propData, returning empty array (to prevent infinite loading)');
          }
        } else {
          sourceData = propData || [];
          console.log('[Dashboard] Using propData as fallback (no apiData/allApiData):', sourceData.length, 'records');
        }
      }
    }
    
    console.log('[Dashboard] sourceData length:', sourceData.length);
    
    // 日付範囲でフィルタリング（全期間データは日付範囲でフィルタリングが必要）
    if (!sourceData || sourceData.length === 0) {
      console.log('[Dashboard] No source data available');
      return [];
    }
    
    const startDateStr = dateRange.start;
    const endDateStr = dateRange.end;
    
    // 日付範囲が設定されていない場合は、データの全期間を使用
    if (!startDateStr || !endDateStr) {
      console.warn('[Dashboard] ⚠️ dateRangeが設定されていません。データの全期間を使用します。');
      const sourceDates = sourceData.map(d => d.date).filter(Boolean).sort();
      if (sourceDates.length > 0) {
        const actualStartDate = sourceDates[0];
        const actualEndDate = sourceDates[sourceDates.length - 1];
        console.log('[Dashboard] データの全期間を使用:', { start: actualStartDate, end: actualEndDate });
        return sourceData; // フィルタリングせずに全データを返す
      }
      return [];
    }
    
    
    const filtered = sourceData.filter((d: CampaignData) => {
      if (!d.date) return false;
      return d.date >= startDateStr && d.date <= endDateStr;
    });
    
    
    return filtered;
  }, [propData, apiData, allApiData, selectedMetaAccountId, dateRange.start, dateRange.end]);

  // 利用可能なキャンペーン一覧を取得
  // 重要: 日付範囲でフィルタリングしない（全期間のデータから取得）
  // これにより、日付範囲を選択しても、選択されているキャンペーンが自動的に変更されない
  const availableCampaigns = useMemo(() => {
    // アセットが選択されている場合は、allApiDataを使用（日付範囲でフィルタリングされていない全データ）
    // アセットが選択されていない場合は、allApiDataまたはpropDataを使用（日付範囲でフィルタリングされていない全データ）
    let sourceData: CampaignData[];
    
    if (selectedMetaAccountId && selectedMetaAccountId !== 'all') {
      // アセットが選択されている場合: アセットでフィルタリング（日付範囲ではフィルタリングしない）
      if (allApiData && allApiData.length > 0) {
        // データベースには act_ プレフィックス付きで保存されているので、それに合わせて比較
        const selectedAccountIdWithPrefix = selectedMetaAccountId.startsWith('act_') 
          ? selectedMetaAccountId 
          : `act_${selectedMetaAccountId}`;
        sourceData = allApiData.filter(d => {
          const accountId = d.meta_account_id;
          return accountId === selectedAccountIdWithPrefix || accountId === selectedMetaAccountId;
        });
        // フィルタリング結果が0件の場合、propDataをフォールバックとして使用
        if (sourceData.length === 0 && propData && propData.length > 0) {
          sourceData = propData.filter(d => {
            // meta_account_idがnullやundefinedの場合も考慮
            const accountId = d.meta_account_id || (d as any).meta_account_id;
            return accountId === selectedMetaAccountId;
          });
          console.log('[Dashboard] Using propData for campaigns (allApiData filtered to 0, filtered by asset only, not by date):', sourceData.length, 'records');
      } else {
          console.log('[Dashboard] Using allApiData for campaigns (asset selected, filtered by asset only, not by date):', sourceData.length, 'records');
      }
    } else {
        // allApiDataが空の場合は、propDataから取得を試みる（アセットでフィルタリング、日付範囲ではフィルタリングしない）
        if (propData && propData.length > 0) {
          // データベースには act_ プレフィックス付きで保存されているので、それに合わせて比較
          const selectedAccountIdWithPrefix = selectedMetaAccountId.startsWith('act_') 
            ? selectedMetaAccountId 
            : `act_${selectedMetaAccountId}`;
          sourceData = propData.filter(d => {
            const accountId = d.meta_account_id;
            return accountId === selectedAccountIdWithPrefix || accountId === selectedMetaAccountId;
          });
        } else {
          sourceData = [];
        }
        console.log('[Dashboard] Using propData for campaigns (allApiData empty, filtered by asset only, not by date):', sourceData.length, 'records');
      }
    } else {
      // アセットが選択されていない場合: allApiDataまたはpropDataを使用（日付範囲でフィルタリングされていない全データ）
      if (allApiData && allApiData.length > 0) {
        sourceData = allApiData;
        console.log('[Dashboard] Using allApiData for campaigns (no asset selected, not filtered by date):', allApiData.length, 'records');
      } else if (propData && propData.length > 0) {
        sourceData = propData;
        console.log('[Dashboard] Using propData for campaigns (no asset selected, not filtered by date):', propData.length, 'records');
      } else {
        sourceData = [];
        console.log('[Dashboard] No data available for campaigns');
      }
    }
    
    if (!sourceData || sourceData.length === 0) {
      console.log('[Dashboard] No data available for campaigns');
      return [];
    }
    
    // campaign_nameが空でないもののみを取得
    const campaignNames = sourceData
      .map(d => d.campaign_name)
      .filter(name => name && name.trim() !== ''); // 空文字列を除外
    
    const campaigns = Array.from(new Set(campaignNames)).sort();
    
    // デバッグログ: 各データ行のcampaign_nameを確認
    console.log('[Dashboard] ===== Available campaigns calculation =====');
    console.log('[Dashboard] Source data sample (first 10 rows):', 
      sourceData.slice(0, 10).map(d => ({
        campaign_name: d.campaign_name,
        date: d.date,
        id: d.id,
        meta_account_id: d.meta_account_id
      }))
    );
    console.log('[Dashboard] All campaign names in source data:', campaignNames);
    console.log('[Dashboard] Unique campaigns (after Set):', campaigns);
    console.log('[Dashboard] Available campaigns summary:', {
      selectedMetaAccountId,
      dataCount: data.length,
      allApiDataCount: allApiData?.length || 0,
      apiDataCount: apiData?.length || 0,
      propDataCount: propData?.length || 0,
      sourceDataCount: sourceData.length,
      campaignNamesCount: campaignNames.length,
      uniqueCampaignsCount: campaigns.length,
      campaigns: campaigns
    });
    console.log('[Dashboard] ===== End available campaigns calculation =====');
    
    return campaigns;
  }, [propData, allApiData, selectedMetaAccountId]); // dataとapiDataを依存配列から削除（日付範囲でフィルタリングされていない全データを使用するため）

  // selectedCampaign の自動選択
  useEffect(() => {
    console.log('[Dashboard] useEffect for auto-selecting campaign triggered');
    console.log('[Dashboard] selectedCampaign:', selectedCampaign);
    console.log('[Dashboard] availableCampaigns:', availableCampaigns);
    
    // 「全体」（null）または「all」が選択されている場合は自動選択をスキップ
    if (selectedCampaign === null || selectedCampaign === 'all') {
      console.log('[Dashboard] "全体" is selected, skipping auto-selection');
      return;
    }
    
    if (availableCampaigns.length > 0) {
      // selectedCampaignがnullでなく、かつavailableCampaignsに含まれていない場合のみ自動選択
      if (selectedCampaign && !availableCampaigns.includes(selectedCampaign)) {
        const defaultCampaign = availableCampaigns[0];
        console.log('[Dashboard] Auto-selecting campaign:', defaultCampaign);
        setSelectedCampaign(defaultCampaign);
        try {
          localStorage.setItem('dashboard_selectedCampaign', defaultCampaign);
        } catch (err) {
          console.error('[Dashboard] Failed to save selected campaign to localStorage:', err);
        }
      }
    }
  }, [availableCampaigns, selectedCampaign]);

  // デバッグ用: apiDataをwindowオブジェクトに公開（apiDataが更新されるたびに更新）
  useEffect(() => {
    (window as any).apiData = apiData;
    if (apiData && apiData.length > 0) {
      console.log('[Dashboard] window.apiData updated:', apiData.length, 'records');
    }
  }, [apiData]);

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
  // 注意: data useMemoで既にアセットフィルタリング済みのため、ここでは日付範囲のみでフィルタリング
  // dateFilteredDataはdataをそのまま使用（dataで既に日付フィルタリング済み）
  const dateFilteredData = useMemo(() => {
    // dataは既にアセットと日付範囲でフィルタリング済みなので、そのまま使用
    return data;
  }, [data]);

  // Get unique ad sets for selected campaign
  const availableAdSets = useMemo(() => {
    console.log('[Dashboard] ===== availableAdSets calculation =====');
    console.log('[Dashboard] selectedCampaign:', selectedCampaign);
    console.log('[Dashboard] selectedMetaAccountId:', selectedMetaAccountId);
    console.log('[Dashboard] data length:', data?.length || 0);

    if (!selectedCampaign) {
      console.log('[Dashboard] No campaign selected, returning empty ad sets');
      return [];
    }

    // dataを使用（dateFilteredDataから計算されたデータ）
    const sourceData = data || [];

    // 広告セットのみを抽出
    // 新API構造: { ad_set_name, campaign_name, ... }
    // 広告セットレベルのデータ: ad_set_nameが存在し、ad_nameが空
    const adSetsData = sourceData.filter(item => 
      item.campaign_name === selectedCampaign && 
      item.ad_set_name && 
      item.ad_set_name !== '' &&
      (!item.ad_name || item.ad_name === '') // 広告レベルではない
    );

    console.log('[Dashboard] Ad sets for campaign "' + selectedCampaign + '":', {
      count: adSetsData.length,
      sample: adSetsData.length > 0 ? adSetsData[0] : null
    });

    // ad_set_name でユニーク化
    const uniqueAdSetNames = [...new Set(adSetsData.map(item => item.ad_set_name))];
    
    console.log('[Dashboard] Available ad sets for "' + selectedCampaign + '":', uniqueAdSetNames.length, 'ad sets:', uniqueAdSetNames);
    console.log('[Dashboard] ===== End availableAdSets calculation =====');

    return uniqueAdSetNames.sort();
  }, [selectedCampaign, selectedMetaAccountId, data]);
  
  // Get unique ads for selected campaign and ad set
  const availableAds = useMemo(() => {
    console.log('[Dashboard] ===== availableAds calculation =====');
    console.log('[Dashboard] selectedCampaign:', selectedCampaign);
    console.log('[Dashboard] selectedAdSet:', selectedAdSet);
    console.log('[Dashboard] selectedMetaAccountId:', selectedMetaAccountId);
    console.log('[Dashboard] data length:', data?.length || 0);

    if (!selectedCampaign) {
      console.log('[Dashboard] Campaign not selected, returning empty ads');
      return [];
    }

    // dataを使用（dateFilteredDataから計算されたデータ）
    const sourceData = data || [];

    // 広告のみを抽出
    // 新API構造: { ad_name, ad_set_name, campaign_name, ... }
    // 広告レベルのデータ: ad_nameが存在し、ad_set_nameも存在
    const adsData = sourceData.filter(item => 
      item.campaign_name === selectedCampaign &&
      item.ad_name &&
      item.ad_name !== '' &&
      item.ad_set_name &&
      item.ad_set_name !== '' &&
      (selectedAdSet ? item.ad_set_name === selectedAdSet : true) // 広告セットが選択されていればフィルタ
    );

    console.log('[Dashboard] Ads for campaign "' + selectedCampaign + '"' + 
      (selectedAdSet ? ' and ad set "' + selectedAdSet + '"' : '') + ':', {
      count: adsData.length,
      sample: adsData.length > 0 ? adsData[0] : null
    });

    // ad_name でユニーク化
    const uniqueAdNames = [...new Set(adsData.map(item => item.ad_name))];
    
    console.log('[Dashboard] Available ads:', uniqueAdNames.length, 'ads:', uniqueAdNames);
    console.log('[Dashboard] ===== End availableAds calculation =====');

    return uniqueAdNames.sort();
  }, [selectedCampaign, selectedAdSet, selectedMetaAccountId, data]);

  // Filter Data - シンプル版（重複排除付き）
  const filteredData = useMemo(() => {
    if (dateFilteredData.length === 0) return [];
    
    // dateFilteredDataは既にselectedMetaAccountIdでフィルタリング済み（data経由）
    let filtered = dateFilteredData;
    
    // キャンペーンフィルタ
    if (selectedCampaign) {
      const beforeCampaignFilter = filtered.length;
      const beforeCampaignFilterData = [...filtered]; // フィルタリング前のデータを保存
      filtered = filtered.filter(d => d.campaign_name === selectedCampaign);
      console.log('[Dashboard] After campaign filter:', { before: beforeCampaignFilter, after: filtered.length, selectedCampaign });
      if (filtered.length === 0 && beforeCampaignFilter > 0) {
        const campaignNames = Array.from(new Set(beforeCampaignFilterData.map(d => d.campaign_name).filter(name => name && name.trim() !== '')));
        console.log('[Dashboard] WARNING: No data after campaign filter. Available campaigns:', campaignNames);
      }
    }
    
    // 広告セットフィルタ
    if (selectedAdSet) {
      // 広告セットが選択されている場合、その広告セットのデータのみを表示
      const beforeAdSetFilter = filtered.length;
      filtered = filtered.filter(d => d.ad_set_name === selectedAdSet);
      console.log('[Dashboard] After ad set filter:', { before: beforeAdSetFilter, after: filtered.length, selectedAdSet });
    } else if (selectedCampaign) {
      // 広告セットが「全体」の場合、キャンペーンレベルのデータを表示
      // キャンペーンレベルのデータ: ad_set_nameとad_nameがNULLまたは空
      const beforeCampaignLevelFilter = filtered.length;
      filtered = filtered.filter(d => 
        (!d.ad_set_name || d.ad_set_name.trim() === '') && 
        (!d.ad_name || d.ad_name.trim() === '')
      );
      console.log('[Dashboard] After campaign level filter:', { before: beforeCampaignLevelFilter, after: filtered.length, selectedCampaign });
      if (filtered.length === 0 && beforeCampaignLevelFilter > 0) {
        console.log('[Dashboard] WARNING: No campaign level data found. Sample data:', filtered.slice(0, 3).map(d => ({ 
          campaign_name: d.campaign_name, 
          ad_set_name: d.ad_set_name || '(empty)', 
          ad_name: d.ad_name || '(empty)',
          meta_account_id: d.meta_account_id
        })));
      }
    }
    
    // 広告フィルタ
    if (selectedAd) {
      // 広告が選択されている場合、その広告のデータのみを表示
      filtered = filtered.filter(d => d.ad_name === selectedAd);
    }
    
    // 重複排除: 同じcampaign_name, date, meta_account_idの組み合わせで最新の1件のみを使用
    const deduplicatedMap = new Map<string, CampaignData>();
    filtered.forEach(d => {
      // meta_account_idが存在する場合はそれも含める、なければcampaign_nameとdateのみ
      const key = d.meta_account_id 
        ? `${d.campaign_name}_${d.date}_${d.meta_account_id}_${d.ad_set_name || ''}_${d.ad_name || ''}`
        : `${d.campaign_name}_${d.date}_${d.ad_set_name || ''}_${d.ad_name || ''}`;
      
      const existing = deduplicatedMap.get(key);
      if (!existing) {
        deduplicatedMap.set(key, d);
      } else {
        // 既存のレコードがある場合、IDが新しい方を優先（または単に最初のものを保持）
        // IDが存在する場合は新しい方を優先、なければ最初のものを保持
        if (d.id && existing.id && d.id > existing.id) {
          deduplicatedMap.set(key, d);
        }
        // それ以外は既存のものを保持（変更しない）
      }
    });
    
    const deduplicated = Array.from(deduplicatedMap.values());
    
    // 重複チェック: 同じキーのデータが複数あるか確認
    const duplicateKeys = new Map<string, CampaignData[]>();
    filtered.forEach(d => {
      const key = d.meta_account_id 
        ? `${d.campaign_name}_${d.date}_${d.meta_account_id}_${d.ad_set_name || ''}_${d.ad_name || ''}`
        : `${d.campaign_name}_${d.date}_${d.ad_set_name || ''}_${d.ad_name || ''}`;
      if (!duplicateKeys.has(key)) {
        duplicateKeys.set(key, []);
      }
      duplicateKeys.get(key)!.push(d);
    });
    
    const duplicates = Array.from(duplicateKeys.entries()).filter(([_, records]) => records.length > 1);
    if (duplicates.length > 0) {
      console.warn('[Dashboard] ⚠️ filteredDataで重複検出:', duplicates.length, '件');
      duplicates.slice(0, 3).forEach(([key, records]) => {
        console.warn(`[Dashboard] 重複キー: ${key}`, records.map(r => ({
          id: r.id,
          impressions: r.impressions,
          reach: r.reach,
          cost: r.cost,
          date: r.date
        })));
      });
    }
    
    console.log('[Dashboard] filteredData:', {
      before: filtered.length,
      after: deduplicated.length,
      selectedCampaign,
      selectedAdSet,
      selectedAd,
      duplicatesFound: duplicates.length,
      sample: deduplicated.slice(0, 5).map(d => ({
        campaign: d.campaign_name,
        date: d.date,
        adset: d.ad_set_name || '(empty)',
        ad: d.ad_name || '(empty)',
        impressions: d.impressions,
        reach: d.reach,
        clicks: d.clicks,
        cost: d.cost,
        meta_account_id: d.meta_account_id
      }))
    });
    
    return deduplicated;
  }, [dateFilteredData, selectedCampaign, selectedAdSet, selectedAd]);

  // Aggregate for KPI Cards - 常にfilteredDataから計算（AnomalyDetectorと整合性を保つため）
  const kpiData = useMemo(() => {
    // filteredDataから直接計算（API summaryは使用しない）
    const current = filteredData;
    
    // デバッグ用: windowオブジェクトにデータを公開（コンソールで確認用）
    if (typeof window !== 'undefined') {
      (window as any).apiData = current;
      (window as any).filteredData = current;
    }
    
    // 基本指標を計算
    const totalCost = current.reduce((acc, curr) => acc + (curr.cost || 0), 0);
    const totalImpressions = current.reduce((acc, curr) => acc + (curr.impressions || 0), 0);
    // クリック数はlink_clicksを使用（Meta広告マネージャの「リンクのクリック」に相当）
    // link_clicksが存在する場合はそれを使用、なければclicksを使用
    const totalClicks = current.reduce((acc, curr) => {
      const linkClicks = curr.link_clicks || 0;
      const clicks = curr.clicks || 0;
      return acc + (linkClicks > 0 ? linkClicks : clicks);
    }, 0);
    const totalConversions = current.reduce((acc, curr) => acc + (curr.conversions || 0), 0);
    const totalValue = current.reduce((acc, curr) => acc + (curr.conversion_value || 0), 0);
    
    // 追加指標を計算
    // リーチ数は summaryData から取得（フロントエンドで計算済み）
    // summaryDataが有効な場合は必ず使用
    const filteredDataSum = current.reduce((acc, curr) => acc + (curr.reach || 0), 0);
    const totalReach = summaryData?.totals?.reach !== undefined && summaryData?.totals?.reach !== null
      ? summaryData.totals.reach 
      : filteredDataSum;
    
    // ユニークリーチ数は summaryData から取得
    // period_unique_reachが0の場合は、日次のreachの合計は使用しない（ユニークリーチではないため）
    const totalUniqueReach = summaryData?.totals?.unique_reach !== undefined && summaryData?.totals?.unique_reach !== null
      ? summaryData.totals.unique_reach
      : 0;
    // 注意: period_unique_reachが0の場合は、0のまま表示（日次のreachの合計はユニークリーチではない）

    // デバッグログは削除（パフォーマンス向上のため）
    const totalEngagements = current.reduce((acc, curr) => acc + (curr.engagements || 0), 0);
    const totalLinkClicks = current.reduce((acc, curr) => acc + (curr.link_clicks || 0), 0);
    const totalLandingPageViews = current.reduce((acc, curr) => acc + (curr.landing_page_views || 0), 0);
    
    // 計算指標（Meta広告マネージャの定義に合わせる）
    // ROAS = conversion_value / cost（比率、パーセンテージではない）
    const avgRoas = totalCost > 0 ? (totalValue / totalCost) : 0;
    // CPA = cost / conversions
    const avgCpa = totalConversions > 0 ? (totalCost / totalConversions) : 0;
    // CTR = (clicks / impressions) * 100（clicksはlink_clicks）
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    // CPC = cost / clicks（clicksはlink_clicks）
    const cpc = totalClicks > 0 ? (totalCost / totalClicks) : 0;
    // CPM = (cost / impressions) * 1000
    const cpm = totalImpressions > 0 ? (totalCost / totalImpressions * 1000) : 0;
    // CVR = (conversions / clicks) * 100（clicksはlink_clicks）
    const cvr = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0;
    // Frequency = impressions / reach
    const frequency = totalReach > 0 ? (totalImpressions / totalReach) : 0;
    // Engagement Rate = (engagements / impressions) * 100
    const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions * 100) : 0;
    
    // デバッグ用ログは削除（パフォーマンス向上のため）

    return {
      totalCost,
      totalImpressions,
      totalClicks,
      totalConversions,
      totalValue, // 総コンバージョン価値
      totalReach,
      totalUniqueReach,
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
  }, [filteredData, dateRange, selectedCampaign, summaryData?.totals?.reach]); // summaryDataの特定の値のみを依存配列に追加（refは含めない）

  // Group by Date for Trend Chart - use calculated trendsData
  const trendData = useMemo(() => {
    if (trendsData && trendsData.data && trendsData.data.length > 0) {
      return trendsData.data.map((t: any) => ({
        date: t.date.split('T')[0], // Ensure date format is consistent
        cost: t.cost,
        clicks: t.clicks,
        conversions: t.conversions,
        conversion_value: t.conversion_value || 0
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

  // Group by Campaign/AdSet/Ad for Table (広告レベルのデータも表示するため、個別にグループ化)
  const campaignStats = useMemo(() => {
    console.log('[Dashboard] ===== campaignStats calculation =====');
    console.log('[Dashboard] filteredData count:', filteredData.length);
    console.log('[Dashboard] Filters:', {
      selectedCampaign,
      selectedAdSet,
      selectedAd,
      selectedMetaAccountId
    });
    
    // キャンペーンレベルのデータのみを抽出
    let campaignLevelData = filteredData.filter(d => {
      const isCampaignLevel = (!d.ad_set_name || d.ad_set_name.trim() === '') && 
                              (!d.ad_name || d.ad_name.trim() === '');
      return isCampaignLevel;
    });
    
    // アセットが選択されている場合、そのアセットのデータのみを使用（データ0のキャンペーンに全体の合計が反映されないようにする）
    if (selectedMetaAccountId && selectedMetaAccountId !== 'all') {
      const selectedAccountIdWithPrefix = selectedMetaAccountId.startsWith('act_') 
        ? selectedMetaAccountId 
        : `act_${selectedMetaAccountId}`;
      const beforeAssetFilter = campaignLevelData.length;
      campaignLevelData = campaignLevelData.filter(d => {
        const accountId = d.meta_account_id || (d as any).meta_account_id;
        return accountId === selectedAccountIdWithPrefix || accountId === selectedMetaAccountId;
      });
      console.log('[Dashboard] Filtered campaignLevelData by selectedMetaAccountId:', {
        before: beforeAssetFilter,
        after: campaignLevelData.length,
        selectedMetaAccountId
      });
    }
    
    console.log('[Dashboard] Campaign level data count:', campaignLevelData.length);
    console.log('[Dashboard] Campaign level data sample:', campaignLevelData.slice(0, 5).map(d => ({
      campaign_name: d.campaign_name,
      date: d.date,
      impressions: d.impressions,
      clicks: d.clicks,
      cost: d.cost,
      ad_set_name: d.ad_set_name || '(empty)',
      ad_name: d.ad_name || '(empty)'
    })));
    
    // 重複チェック: 同じcampaign_name, date, meta_account_idの組み合わせを確認
    const duplicateCheck = new Map<string, number>();
    campaignLevelData.forEach(d => {
      const key = d.meta_account_id 
        ? `${d.campaign_name}_${d.date}_${d.meta_account_id}`
        : `${d.campaign_name}_${d.date}`;
      duplicateCheck.set(key, (duplicateCheck.get(key) || 0) + 1);
    });
    
    const duplicates = Array.from(duplicateCheck.entries()).filter(([_, count]) => count > 1);
    if (duplicates.length > 0) {
      console.warn('[Dashboard] ⚠️ 重複データ検出:', duplicates.slice(0, 5));
      duplicates.slice(0, 5).forEach(([key, count]) => {
        const matching = campaignLevelData.filter(d => {
          const k = d.meta_account_id 
            ? `${d.campaign_name}_${d.date}_${d.meta_account_id}`
            : `${d.campaign_name}_${d.date}`;
          return k === key;
        });
        console.warn(`[Dashboard] 重複キー: ${key}, 件数: ${count}`, matching.map(m => ({
          id: m.id,
          impressions: m.impressions,
          reach: m.reach,
          cost: m.cost
        })));
      });
    }
    
    // 日付ごとの重複排除: 同じcampaign_name, date, meta_account_idの組み合わせで最新の1件のみを使用
    const seenDateKeys = new Map<string, CampaignData>();
    campaignLevelData.forEach(d => {
      // キャンペーン名が空の場合はスキップ
      if (!d.campaign_name || d.campaign_name.trim() === '') {
        console.warn('[Dashboard] ⚠️ Campaign name is empty in campaignLevelData, skipping:', d);
        return;
      }
      
      const dateKey = d.meta_account_id 
        ? `${d.campaign_name.trim()}_${d.date}_${d.meta_account_id}`
        : `${d.campaign_name.trim()}_${d.date}`;
      
      // 既存のレコードがない場合、または既存のレコードより新しい場合に更新
      const existing = seenDateKeys.get(dateKey);
      if (!existing || (d.id && existing.id && d.id > existing.id)) {
        seenDateKeys.set(dateKey, d);
      }
    });
    
    const deduplicatedData = Array.from(seenDateKeys.values());
    console.log('[Dashboard] Deduplicated campaign level data count:', deduplicatedData.length);
    
    // デバッグ: 各キャンペーンのデータ数を確認
    const campaignDataCount = new Map<string, number>();
    deduplicatedData.forEach(d => {
      const campaignName = d.campaign_name ? d.campaign_name.trim() : '(empty)';
      campaignDataCount.set(campaignName, (campaignDataCount.get(campaignName) || 0) + 1);
    });
    console.log('[Dashboard] Campaign data count by campaign:', Array.from(campaignDataCount.entries()));
    
    // デバッグ: 各キャンペーンのデータサンプルを確認
    campaignDataCount.forEach((count, campaignName) => {
      const samples = deduplicatedData.filter(d => (d.campaign_name || '').trim() === campaignName).slice(0, 3);
      console.log(`[Dashboard] Campaign "${campaignName}" has ${count} records, samples:`, samples.map(s => ({
        date: s.date,
        impressions: s.impressions,
        clicks: s.clicks,
        cost: s.cost,
        conversions: s.conversions,
        conversion_value: s.conversion_value
      })));
    });
    
    // キャンペーン名でグループ化して合算
    const stats: { [key: string]: CampaignData } = {};
    
    // キャンペーンごとの日付データを追跡
    const campaignDateMap = new Map<string, string[]>();
    
    deduplicatedData.forEach(d => {
      // キャンペーン名が空の場合はスキップ
      if (!d.campaign_name || d.campaign_name.trim() === '') {
        console.warn('[Dashboard] ⚠️ Campaign name is empty, skipping:', d);
        return;
      }
      
      const key = d.campaign_name.trim();
      
      if (!stats[key]) {
        // キャンペーンの基本情報のみをコピーし、数値フィールドは0で初期化
        // データ0のキャンペーンでも、他キャンペーンのデータが混入しないように、明示的に0で初期化
        stats[key] = { 
          id: d.id,
          date: d.date,
          campaign_name: d.campaign_name,
          meta_account_id: d.meta_account_id,
          impressions: 0, 
          clicks: 0, 
          cost: 0, 
          conversions: 0, 
          conversion_value: 0,
          reach: 0,
          period_unique_reach: 0,
          engagements: 0,
          link_clicks: 0,
          landing_page_views: 0,
          ad_set_name: '',
          ad_name: '',
          ctr: 0,
          cpc: 0,
          cpa: 0,
          cpm: 0,
          cvr: 0,
          roas: 0
        };
        campaignDateMap.set(key, []);
      }
      
      // 日付を記録
      const dates = campaignDateMap.get(key) || [];
      if (!dates.includes(d.date)) {
        dates.push(d.date);
        campaignDateMap.set(key, dates);
      }
      
      // 日付ごとに合算（同じキャンペーンの異なる日付のデータを合算）
      // データ0のキャンペーンでも、他キャンペーンのデータが混入しないように、このキャンペーンのデータのみを合算
      // デバッグ: データ0のキャンペーンの場合、ログを出力
      const isZeroData = (d.impressions || 0) === 0 && (d.clicks || 0) === 0 && (d.cost || 0) === 0 && 
                         (d.conversions || 0) === 0 && (d.conversion_value || 0) === 0;
      if (isZeroData) {
        console.log(`[Dashboard] Processing zero-data record for campaign "${key}":`, {
          date: d.date,
          impressions: d.impressions,
          clicks: d.clicks,
          cost: d.cost,
          conversions: d.conversions,
          conversion_value: d.conversion_value
        });
      }
      
      // 合算前の値を記録（デバッグ用）
      const beforeImpressions = stats[key].impressions;
      const beforeCost = stats[key].cost;
      
      stats[key].impressions += (d.impressions || 0);
      stats[key].clicks += (d.clicks || 0);
      stats[key].cost += (d.cost || 0);
      stats[key].conversions += (d.conversions || 0);
      stats[key].conversion_value += (d.conversion_value || 0);
      stats[key].reach += d.reach || 0;  // 日次のreachを合計
      stats[key].engagements += (d.engagements || 0);
      stats[key].link_clicks += (d.link_clicks || 0);
      stats[key].landing_page_views += (d.landing_page_views || 0);
      
      // デバッグ: データ0のキャンペーンの場合、合算後の値を確認
      if (isZeroData && (stats[key].impressions !== beforeImpressions || stats[key].cost !== beforeCost)) {
        console.warn(`[Dashboard] ⚠️ Zero-data campaign "${key}" has non-zero values after aggregation:`, {
          before: { impressions: beforeImpressions, cost: beforeCost },
          after: { impressions: stats[key].impressions, cost: stats[key].cost },
          added: { impressions: d.impressions, cost: d.cost }
        });
      }
      
      // 期間全体のユニークリーチ数を取得（period_unique_reachが正しく取得できている場合のみ使用）
      // period_unique_reachは期間全体のユニークリーチ数なので、同じキャンペーンの複数日付データでは同じ値のはず
      if (d.period_unique_reach && d.period_unique_reach > 0) {
        // まだ設定されていない場合のみ設定（最初に見つかった値を使用）
        if (!stats[key].period_unique_reach || stats[key].period_unique_reach === 0) {
          stats[key].period_unique_reach = d.period_unique_reach;
        }
        // 値が異なる場合は、最新の日付の値を使用（日付が新しい場合のみ更新）
        else if (d.period_unique_reach !== stats[key].period_unique_reach) {
          // 日付を比較して、新しい日付の値を使用
          const currentDate = new Date(d.date);
          const existingDate = new Date(stats[key].date);
          if (currentDate > existingDate) {
            stats[key].period_unique_reach = d.period_unique_reach;
            stats[key].date = d.date; // 日付も更新
          }
        }
      }
    });
    
    // デバッグ: 各キャンペーンの集計結果をログ出力
    console.log('[Dashboard] ===== Campaign stats before final processing =====');
    Object.entries(stats).forEach(([campaignName, stat]) => {
      console.log(`[Dashboard] Campaign: ${campaignName}`, {
        impressions: stat.impressions,
        clicks: stat.clicks,
        cost: stat.cost,
        conversions: stat.conversions,
        conversion_value: stat.conversion_value,
        reach: stat.reach,
        period_unique_reach: stat.period_unique_reach,
        dataCount: campaignDateMap.get(campaignName)?.length || 0
      });
    });

    const statsArray = Object.values(stats).map(s => {
      // 期間全体のユニークリーチ数を優先的に使用（0より大きい場合のみ）
      // period_unique_reachが0の場合は、日次のreachの合計（s.reach）を使用
      const reach = (s.period_unique_reach !== undefined && s.period_unique_reach !== null && s.period_unique_reach > 0)
        ? s.period_unique_reach
        : (s.reach || 0); // フォールバック: 日次リーチの合計
      
      return {
        ...s,
        reach: reach
      };
    });
    
    console.log('[Dashboard] campaignStats count:', statsArray.length);
    console.log('[Dashboard] ===== キャンペーン別集計結果 =====');
    statsArray.forEach(s => {
      const dates = campaignDateMap.get(s.campaign_name) || [];
      // 16項目すべてを計算
      const ctr = s.impressions > 0 ? (s.clicks / s.impressions * 100) : 0;
      const cpc = s.clicks > 0 ? s.cost / s.clicks : 0;
      const cpa = s.conversions > 0 ? s.cost / s.conversions : 0;
      const cpm = s.impressions > 0 ? (s.cost / s.impressions * 1000) : 0;
      const cvr = s.clicks > 0 ? (s.conversions / s.clicks * 100) : 0;
      const roas = s.cost > 0 ? (s.conversion_value / s.cost * 100) : 0;
      const frequency = s.reach > 0 ? (s.impressions / s.reach) : 0;
      const engagement_rate = s.impressions > 0 ? ((s.engagements || 0) / s.impressions * 100) : 0;
      
      console.log(`[Dashboard] キャンペーン: ${s.campaign_name} - 16項目の全期間データ`, {
        dates: dates.sort(),
        dateCount: dates.length,
        // 基本指標
        '1. インプレッション': s.impressions,
        '2. リーチ': s.reach,
        '2-1. period_unique_reach': s.period_unique_reach || 0,
        '3. フリークエンシー': frequency.toFixed(2),
        '4. クリック数': s.clicks,
        '5. 費用': s.cost,
        '6. コンバージョン数': s.conversions,
        '7. コンバージョン価値': s.conversion_value,
        '8. エンゲージメント数': s.engagements || 0,
        '9. LPビュー数': s.landing_page_views || 0,
        // 計算指標
        '10. CTR (クリック率)': `${ctr.toFixed(2)}%`,
        '11. CPC (クリック単価)': `¥${cpc.toFixed(2)}`,
        '12. CPM (インプレッション単価)': `¥${cpm.toFixed(2)}`,
        '13. CVR (コンバージョン率)': `${cvr.toFixed(2)}%`,
        '14. CPA (獲得単価)': `¥${cpa.toFixed(2)}`,
        '15. ROAS (費用対効果)': `${roas.toFixed(2)}%`,
        '16. エンゲージメント率': `${engagement_rate.toFixed(2)}%`
      });
      
      // 各日付のデータも表示
      const dateData = deduplicatedData.filter(d => d.campaign_name === s.campaign_name);
      console.log(`[Dashboard] キャンペーン "${s.campaign_name}" の日付別データ:`, dateData.map(d => ({
        date: d.date,
        impressions: d.impressions || 0,
        reach: d.reach || 0,
        period_unique_reach: d.period_unique_reach || 0,
        cost: d.cost || 0,
        clicks: d.clicks || 0,
        conversions: d.conversions || 0,
        meta_account_id: d.meta_account_id
      })));
    });
    console.log('[Dashboard] ===== 集計結果終了 =====');
    console.log('[Dashboard] ===== End campaignStats calculation =====');

    return statsArray.map(s => {
      // DBから取得したリーチ数を使用（campaignReachMapへの依存を削除）
      // summaryDataから直接リーチ数を取得するため、campaignReachMapは不要
      const reach = s.reach || 0;
      
      return {
        ...s,
        ctr: s.impressions > 0 ? (s.clicks / s.impressions * 100) : 0,
        cpc: s.clicks > 0 ? s.cost / s.clicks : 0,
        cpa: s.conversions > 0 ? s.cost / s.conversions : 0,
        cpm: s.impressions > 0 ? (s.cost / s.impressions * 1000) : 0,
        cvr: s.clicks > 0 ? (s.conversions / s.clicks * 100) : 0,
        roas: s.cost > 0 ? (s.conversion_value / s.cost * 100) : 0,
        // Optional fields (will be 0 if not in data)
        reach: reach,
        frequency: reach > 0 ? (s.impressions / reach) : 0,
        engagements: s.engagements || 0,
        engagementRate: s.impressions > 0 ? ((s.engagements || 0) / s.impressions * 100) : 0,
        link_clicks: s.link_clicks || 0,
        landing_page_views: s.landing_page_views || 0
      };
    });
  }, [filteredData, selectedCampaign, selectedAdSet, selectedAd, selectedMetaAccountId]);

  // campaignStatsが空の場合、summaryDataもクリア
  useEffect(() => {
    if (campaignStats.length === 0 && summaryData !== null) {
      console.log('[Dashboard] campaignStats is empty, clearing summaryData');
      setSummaryData(null);
      summaryDataCampaignRef.current = null;
    }
  }, [campaignStats, summaryData]);

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

  // 選択された期間を保持（7日、30日、全期間）
  const [selectedPeriod, setSelectedPeriod] = useState<number | 'all' | null>(() => {
    const saved = localStorage.getItem('dashboard_selectedPeriod');
    if (saved) {
      try {
        const parsed = saved === 'all' ? 'all' : parseInt(saved, 10);
        if (parsed === 'all' || parsed === 7 || parsed === 30) {
          return parsed;
        }
      } catch (e) {
        // 無視
      }
    }
    return null;
  });

  const setQuickFilter = (days: number | 'all') => {
    setIsInitialLoad(false); // ユーザーが手動で変更した場合は自動更新を無効化
    
    // 選択された期間を保存
    setSelectedPeriod(days);
    try {
      localStorage.setItem('dashboard_selectedPeriod', days === 'all' ? 'all' : days.toString());
    } catch (err) {
      console.error('[setQuickFilter] localStorage保存エラー:', err);
    }
    
    let newRange: { start: string; end: string };

    if (days === 'all') {
      // 全期間
      const allData = [...(data || []), ...(propData || [])];
      if (allData.length > 0) {
        // dateが存在し、有効な日付であるデータのみをフィルタリング
        const validDates = allData
          .map(d => d.date)
          .filter(date => date && typeof date === 'string' && date.length >= 10)
          .map(date => new Date(date).getTime())
          .filter(time => !isNaN(time));
        
        if (validDates.length > 0) {
          const minDate = new Date(Math.min(...validDates));
          const maxDate = new Date(Math.max(...validDates));
        
        newRange = {
          start: minDate.toISOString().split('T')[0],
          end: maxDate.toISOString().split('T')[0],
        };
        } else {
          // 有効な日付がない場合はデフォルト値を使用
          const today = new Date();
          const endDate = new Date(today);
          endDate.setDate(today.getDate() - 1);
          newRange = {
            start: new Date(2020, 0, 1).toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0],
          };
        }
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
  // selectedPeriodを優先的に使用（キャンペーン変更時も選択状態を維持）
  const getActiveQuickFilter = useMemo(() => {
    // selectedPeriodが設定されている場合は、それを返す
    if (selectedPeriod !== null) {
      return selectedPeriod;
    }
    
    // selectedPeriodが設定されていない場合のみ、dateRangeから判定
    if (data.length === 0) return null;
    
    // dateが存在し、有効な日付であるデータのみをフィルタリング
    const validDates = data
      .map(d => d.date)
      .filter(date => date && typeof date === 'string' && date.length >= 10)
      .map(date => new Date(date).getTime())
      .filter(time => !isNaN(time));
    
    if (validDates.length === 0) return null;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    // 全期間チェック（データの最小日から最大日まで）
    const minDate = new Date(Math.min(...validDates));
    const maxDate = new Date(Math.max(...validDates));
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
  }, [dateRange, data, selectedPeriod]);

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
            allData={filteredData} 
            onClose={() => setSelectedCampaignName(null)} 
        />
      )}

      {/* Asset Selection - Top Row (Prominent Design) */}
      {/* アセット選択セクションは常に表示（エラー時もエラーメッセージを表示） */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 p-5 rounded-xl border-2 border-indigo-200 dark:border-indigo-700 shadow-lg no-print mb-6">
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
              {metaAccountsLoading ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">読み込み中...</div>
              ) : metaAccountsError ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  {metaAccountsError}
                  <button
                    onClick={() => {
                      const loadMetaAccounts = async () => {
                        setMetaAccountsLoading(true);
                        setMetaAccountsError(null);
                        try {
                          const result = await Api.getMetaAccounts();
                          setMetaAccounts(result.accounts || []);
                          setMetaAccountsError(null);
                          // localStorageにキャッシュを保存
                          try {
                            localStorage.setItem('dashboard_metaAccounts', JSON.stringify(result.accounts || []));
                            localStorage.setItem('dashboard_metaAccounts_time', Date.now().toString());
                          } catch (e) {
                            console.error('[Dashboard] Failed to cache meta accounts:', e);
                          }
                        } catch (error: any) {
                          setMetaAccountsError(error?.message || 'アセット情報の取得に失敗しました');
                          setMetaAccounts([]);
                        } finally {
                          setMetaAccountsLoading(false);
                        }
                      };
                      loadMetaAccounts();
                    }}
                    className="ml-2 underline"
                  >
                    再試行
                  </button>
                </div>
              ) : (
                <>
                  <select
                    value={selectedMetaAccountId || ''}
                    onChange={async (e) => {
                      const newAccountId = e.target.value || null;
                      // アセットIDが正しく設定されているか確認（表示用の文字列が含まれていないか）
                      const cleanAccountId = newAccountId ? newAccountId.split(' ')[0] : null;
                      console.log('[Dashboard] Asset selection changed:', {
                        old: selectedMetaAccountId,
                        new: newAccountId,
                        clean: cleanAccountId
                      });
                      
                      // クリーンなアセットIDを設定
                      setSelectedMetaAccountId(cleanAccountId);
                      
                      try {
                        localStorage.setItem('dashboard_selectedMetaAccountId', cleanAccountId || '');
                      } catch (err) {
                        console.error('[Dashboard] Failed to save asset selection to localStorage:', err);
                      }
                      
                      // useEffectが自動的に実行されるはずだが、念のため明示的にデータを再読み込み
                      // ただし、setSelectedMetaAccountIdが非同期で更新されるため、
                      // useEffectの依存配列にselectedMetaAccountIdが含まれているので自動的に再読み込みされる
                      console.log('[Dashboard] Asset selection updated, useEffect should trigger data reload');
                    }}
                    className="max-w-md pl-4 pr-12 py-3 border-2 border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg text-base font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
                  >
                    <option value="">全アセットを表示</option>
                    {metaAccounts.map((account) => {
                      const displayName = account.name || account.account_id || '不明なアセット';
                      const campaignCount = account.campaign_count ?? 0;
                      const dataCount = account.data_count ?? 0;
                      console.log('[Dashboard] Rendering account option:', { 
                        account_id: account.account_id, 
                        name: account.name, 
                        displayName,
                        campaign_count: account.campaign_count,
                        data_count: account.data_count,
                        campaignCount,
                        dataCount
                      });
                      return (
                      <option key={account.account_id} value={account.account_id}>
                          {displayName} (キャンペーン: {campaignCount}件 / データ: {dataCount}件)
                      </option>
                      );
                    })}
                  </select>
                  <MousePointer size={20} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                </>
              )}
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

      {/* Advanced Filter Bar - Campaign and Date Selection */}
      <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm no-print space-y-3 transition-colors">
        
        {/* Campaign Selection Tabs */}
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap flex items-center shrink-0">
                    <Filter size={14} className="mr-1" />
                    キャンペーン
                </label>
                <div className="relative flex-1 min-w-0">
                    <div className="block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent dark:scrollbar-thumb-gray-600 dark:scrollbar-track-transparent hover:scrollbar-track-gray-100 dark:hover:scrollbar-track-gray-800 [&::-webkit-scrollbar-thumb]:bg-transparent [&::-webkit-scrollbar-thumb]:hover:bg-gray-300">
                            <div className="flex items-center gap-2 min-w-fit">
                                {/* 全体タブ */}
                <button 
                                    onClick={() => {
                                        handleCampaignChange(null);
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
                                            handleCampaignChange(campaign);
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
        
        {/* Ad Set Selection - キャンペーンが選択されている場合のみ表示 */}
        {selectedCampaign && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap flex items-center shrink-0">
                <Filter size={14} className="mr-1" />
                広告セット
              </label>
              <div className="relative flex-1 min-w-0">
                <div className="block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent dark:scrollbar-thumb-gray-600 dark:scrollbar-track-transparent hover:scrollbar-track-gray-100 dark:hover:scrollbar-track-gray-800 [&::-webkit-scrollbar-thumb]:bg-transparent [&::-webkit-scrollbar-thumb]:hover:bg-gray-300">
                    <div className="flex items-center gap-2 min-w-fit">
                      {/* 全体タブ */}
                      <button 
                        onClick={() => {
                          setSelectedAdSet(null);
                          setSelectedAd(null); // 広告セットをクリアしたら広告もクリア
                          try {
                            localStorage.setItem('dashboard_selectedAdSet', '');
                            localStorage.setItem('dashboard_selectedAd', '');
                          } catch (err) {
                            // 無視
                          }
                        }}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                          selectedAdSet === null
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500'
                            : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        全体
                      </button>
                      {/* 広告セットタブ */}
                      {availableAdSets.length > 0 ? (
                        availableAdSets.map(adSet => (
                          <button
                            key={adSet}
                            onClick={() => {
                              console.log('[Dashboard] Ad set selected:', adSet);
                              setSelectedAdSet(adSet);
                              setSelectedAd(null); // 広告セットを変更したら広告をクリア
                              try {
                                localStorage.setItem('dashboard_selectedAdSet', adSet);
                                localStorage.setItem('dashboard_selectedAd', '');
                              } catch (err) {
                                // 無視
                              }
                              console.log('[Dashboard] selectedAdSet after update:', adSet);
                            }}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                              selectedAdSet === adSet
                                ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500'
                                : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {adSet}
                          </button>
                        ))
                      ) : (
                        <span className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                          広告セットデータがありません
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Ad Selection - キャンペーンが選択されている場合、常に表示 */}
        {selectedCampaign && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap flex items-center shrink-0">
                <Filter size={14} className="mr-1" />
                広告
              </label>
              <div className="relative flex-1 min-w-0">
                <div className="block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent dark:scrollbar-thumb-gray-600 dark:scrollbar-track-transparent hover:scrollbar-track-gray-100 dark:hover:scrollbar-track-gray-800 [&::-webkit-scrollbar-thumb]:bg-transparent [&::-webkit-scrollbar-thumb]:hover:bg-gray-300">
                    <div className="flex items-center gap-2 min-w-fit">
                      {/* 全体タブ */}
                      <button 
                        onClick={() => {
                          setSelectedAd(null);
                          try {
                            localStorage.setItem('dashboard_selectedAd', '');
                          } catch (err) {
                            // 無視
                          }
                        }}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                          selectedAd === null
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500'
                            : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        全体
                      </button>
                      {/* 広告タブ */}
                      {availableAds.length > 0 ? (
                        availableAds.map(ad => (
                          <button
                            key={ad}
                            onClick={() => {
                              setSelectedAd(ad);
                              try {
                                localStorage.setItem('dashboard_selectedAd', ad);
                              } catch (err) {
                                // 無視
                              }
                            }}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                              selectedAd === ad
                                ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500'
                                : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {ad}
                          </button>
                        ))
                      ) : (
                        <span className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                          広告データがありません
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
                            
                            // 手動で日付を変更した場合は、選択された期間をクリア
                            setSelectedPeriod(null);
                            try {
                                localStorage.removeItem('dashboard_selectedPeriod');
                            } catch (err) {
                                // 無視
                            }
                            
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
                            
                            // 手動で日付を変更した場合は、選択された期間をクリア
                            setSelectedPeriod(null);
                            try {
                                localStorage.removeItem('dashboard_selectedPeriod');
                            } catch (err) {
                                // 無視
                            }
                            
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
                {kpiData.avgRoas.toFixed(2)}
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
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 break-words">リーチ・エンゲージメント指標</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">リーチ数（全体）</div>
                  <div className="text-lg font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                    {kpiData.totalReach.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">リーチ数（ユニーク）</div>
                  <div className="text-lg font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                    {kpiData.totalUniqueReach.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">ユニーク</div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800 min-w-0 overflow-hidden">
                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium truncate">フリークエンシー</div>
                  <div className="text-lg font-bold text-purple-700 dark:text-purple-300 break-words leading-tight">
                    {kpiData.frequency.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">平均</div>
                </div>
            <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-3 border border-pink-200 dark:border-pink-800 min-w-0 overflow-hidden">
              <div className="text-xs text-pink-600 dark:text-pink-400 mb-1 font-medium truncate">エンゲージメント数</div>
              <div className="text-lg font-bold text-pink-700 dark:text-pink-300 break-words leading-tight">
                {kpiData.totalEngagements.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
            </div>
                <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-3 border border-pink-200 dark:border-pink-800 min-w-0 overflow-hidden">
                  <div className="text-xs text-pink-600 dark:text-pink-400 mb-1 font-medium truncate">エンゲージメント率</div>
                  <div className="text-lg font-bold text-pink-700 dark:text-pink-300 break-words leading-tight">
                    {kpiData.engagementRate.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">平均</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800 min-w-0 overflow-hidden">
                  <div className="text-xs text-green-600 dark:text-green-400 mb-1 font-medium truncate">LPビュー数</div>
                  <div className="text-lg font-bold text-green-700 dark:text-green-300 break-words leading-tight">
                    {kpiData.totalLandingPageViews.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">合計</div>
                </div>
            </div>
          </div>
      </div>

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
                  className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                >
                  広告セット名
                </th>
                <th 
                  className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                >
                  広告名
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
                    handleCampaignChange(campaign.campaign_name);
                    // モーダルを開いて詳細分析結果を表示
                    setSelectedCampaignName(campaign.campaign_name);
                  }}
                >
                  <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {campaign.campaign_name}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {campaign.ad_set_name || '-'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {campaign.ad_name || '-'}
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
