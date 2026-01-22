import React, { useState, useEffect } from 'react';
import { User, TeamMember, UserRole } from '../types';
import { Button } from './ui/Button';
import { User as UserIcon, Building, Mail, CreditCard, Users, Plus, MoreHorizontal, Shield, Trash2, Check, X } from 'lucide-react';
import { Api } from '../services/api';
import { useToast } from './ui/Toast';

interface SettingsProps {
  user: User;
}

export const Settings: React.FC<SettingsProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'account' | 'team'>('account');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('VIEWER');
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [metaAccountId, setMetaAccountId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaSettingsLoading, setMetaSettingsLoading] = useState(false);
  const { addToast } = useToast();

  // Load Meta settings
  useEffect(() => {
    const loadMetaSettings = async () => {
      try {
        const settings = await Api.getMetaSettings();
        setMetaAccountId(settings.meta_account_id || '');
      } catch (error) {
        console.error('Failed to load Meta settings:', error);
      }
    };
    loadMetaSettings();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    console.log('[Settings] OAuth callback handler triggered');
    console.log('[Settings] Current URL:', window.location.href);
    console.log('[Settings] Protocol:', window.location.protocol);
    console.log('[Settings] Hostname:', window.location.hostname);
    
    // localhostの場合、https://をhttp://に強制的に変換（ブラウザのHSTS設定を回避）
    if (window.location.protocol === 'https:' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      const httpUrl = window.location.href.replace('https://', 'http://');
      console.log('[Settings] Converting HTTPS to HTTP for localhost:', httpUrl);
      window.location.replace(httpUrl);
      return;
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const oauthStatus = urlParams.get('meta_oauth');
    
    console.log('[Settings] OAuth status from URL:', oauthStatus);
    
    if (oauthStatus === 'success') {
      const accountId = urlParams.get('account_id');
      const accountCount = urlParams.get('account_count');
      console.log('[Settings] OAuth success - accountId:', accountId, 'accountCount:', accountCount);
      
      if (accountId) {
        setMetaAccountId(accountId);
        addToast('Metaアカウントの連携が完了しました。データ同期を開始します...', 'success');
        // URLパラメータをクリア（http://localhostを強制）
        const baseUrl = window.location.protocol === 'https:' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          ? window.location.href.replace('https://', 'http://').split('?')[0]
          : window.location.origin;
        window.history.replaceState({}, '', '/settings');
        console.log('[Settings] URL parameters cleared, reloading Meta settings...');
        // 設定を再読み込み
        Api.getMetaSettings().then(settings => {
          console.log('[Settings] Meta settings reloaded:', settings);
          setMetaAccountId(settings.meta_account_id || '');
        }).catch(error => {
          console.error('[Settings] Failed to reload Meta settings:', error);
        });
        
        // OAuth認証後の自動同期はバックグラウンドで実行されるため、
        // ポーリングで同期完了を検知する
        let pollCount = 0;
        const maxPolls = 120; // 最大10分間（5秒間隔 × 120回）
        const pollInterval = 5000; // 5秒間隔
        
        const pollSyncStatus = async () => {
          pollCount++;
          console.log(`[Settings] Polling sync status (attempt ${pollCount}/${maxPolls})...`);
          
          try {
            // 最新のデータ件数を確認（同期が完了していればデータが増えているはず）
            const accounts = await Api.getMetaAccounts();
            const hasData = accounts.accounts?.some(acc => acc.data_count > 0);
            
            if (hasData && pollCount > 3) { // 3回目以降でデータがあれば完了とみなす
              console.log('[Settings] Sync appears to be completed, dispatching dataSyncComplete event');
              window.dispatchEvent(new CustomEvent('dataSyncComplete'));
              addToast('データ同期が完了しました', 'success');
              return;
            }
            
            if (pollCount < maxPolls) {
              setTimeout(pollSyncStatus, pollInterval);
            } else {
              console.log('[Settings] Polling timeout reached, dispatching dataSyncComplete event anyway');
              // タイムアウトしてもイベントを発火（データが取得できている可能性がある）
              window.dispatchEvent(new CustomEvent('dataSyncComplete'));
              addToast('データ同期が完了した可能性があります。ページをリロードしてください。', 'info');
            }
          } catch (error) {
            console.error('[Settings] Error polling sync status:', error);
            if (pollCount < maxPolls) {
              setTimeout(pollSyncStatus, pollInterval);
            }
          }
        };
        
        // 初回ポーリングを開始（10秒後から開始）
        setTimeout(pollSyncStatus, 10000);
      } else {
        console.warn('[Settings] OAuth success but no accountId in URL');
      }
    } else if (oauthStatus === 'error') {
      const errorMessage = urlParams.get('message') || 'Meta OAuth認証に失敗しました';
      console.error('[Settings] OAuth error:', errorMessage);
      addToast(errorMessage, 'error');
      // URLパラメータをクリア
      window.history.replaceState({}, '', '/settings');
    } else if (oauthStatus === 'callback') {
      console.log('[Settings] OAuth callback received - backend will handle');
      // コールバックはバックエンドで処理されるため、ここでは何もしない
      // バックエンドからリダイレクトされる
    } else {
      console.log('[Settings] No OAuth status in URL - normal page load');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // addToastは安定した参照なので依存配列から除外

  // Load teams and members
  useEffect(() => {
    const loadTeams = async () => {
      if (activeTab !== 'team') return;
      
      setMembersLoading(true);
      try {
        const teamsResponse = await Api.getMyTeams();
        const teams = teamsResponse.data || [];
        
        if (teams.length > 0) {
          // Use the first team (or could let user select)
          const team = teams[0];
          setCurrentTeamId(team.id);
          
          // Load team members
          const membersResponse = await Api.getTeamMembers(team.id);
          const backendMembers = membersResponse.data || [];
          
          // Convert backend format to frontend format
          const convertedMembers: TeamMember[] = backendMembers.map((m: any) => ({
            id: m.id,
            name: m.name || m.email.split('@')[0],
            email: m.email,
            role: mapBackendRoleToFrontend(m.role),
            status: 'ACTIVE' as const, // Backend doesn't have status, assume active
            joinedAt: m.joined_at ? new Date(m.joined_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
          }));
          
          setMembers(convertedMembers);
        } else {
          setCurrentTeamId(null);
          setMembers([]);
        }
      } catch (error: any) {
        console.error('Failed to load teams:', error);
        if (error.message?.includes('403') || error.message?.includes('FREE plan')) {
          addToast('チーム機能はPROプラン以上で利用可能です', 'warning');
        } else {
          addToast('チーム情報の取得に失敗しました', 'error');
        }
        setMembers([]);
      } finally {
        setMembersLoading(false);
      }
    };
    
    loadTeams();
  }, [activeTab, user, addToast]);

  // Helper function to map backend role to frontend role
  const mapBackendRoleToFrontend = (backendRole: string): UserRole => {
    if (backendRole === 'owner' || backendRole === 'admin') return 'ADMIN';
    if (backendRole === 'member') return 'VIEWER';
    return 'VIEWER';
  };

  // Helper function to map frontend role to backend role
  const mapFrontendRoleToBackend = (frontendRole: UserRole): string => {
    if (frontendRole === 'ADMIN') return 'admin';
    if (frontendRole === 'EDITOR') return 'member';
    return 'member';
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentTeamId) {
      addToast('チームが選択されていません', 'error');
      return;
    }
    
    setLoading(true);
    try {
      const backendRole = mapFrontendRoleToBackend(inviteRole);
      await Api.inviteTeamMember(currentTeamId, inviteEmail, backendRole);
      
      addToast('招待を送信しました', 'success');
      setInviteEmail('');
      setIsInviteModalOpen(false);
      
      // Reload members
      const membersResponse = await Api.getTeamMembers(currentTeamId);
      const backendMembers = membersResponse.data || [];
      const convertedMembers: TeamMember[] = backendMembers.map((m: any) => ({
        id: m.id,
        name: m.name || m.email.split('@')[0],
        email: m.email,
        role: mapBackendRoleToFrontend(m.role),
        status: 'ACTIVE' as const,
        joinedAt: m.joined_at ? new Date(m.joined_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      }));
      setMembers(convertedMembers);
    } catch (error: any) {
      console.error('Failed to invite member:', error);
      const errorMessage = error.message || 'メンバーの招待に失敗しました';
      addToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!currentTeamId) {
      addToast('チームが選択されていません', 'error');
      return;
    }
    
    if (!confirm('本当にこのメンバーを削除しますか？')) {
      return;
    }
    
    try {
      await Api.removeTeamMember(currentTeamId, memberId);
      addToast('メンバーを削除しました', 'success');
      
      // Reload members
      const membersResponse = await Api.getTeamMembers(currentTeamId);
      const backendMembers = membersResponse.data || [];
      const convertedMembers: TeamMember[] = backendMembers.map((m: any) => ({
        id: m.id,
        name: m.name || m.email.split('@')[0],
        email: m.email,
        role: mapBackendRoleToFrontend(m.role),
        status: 'ACTIVE' as const,
        joinedAt: m.joined_at ? new Date(m.joined_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      }));
      setMembers(convertedMembers);
    } catch (error: any) {
      console.error('Failed to remove member:', error);
      const errorMessage = error.message || 'メンバーの削除に失敗しました';
      addToast(errorMessage, 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">設定</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('account')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'account'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            アカウント設定
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'team'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            チーム管理
          </button>
        </nav>
      </div>

      {/* Account Tab Content */}
      {activeTab === 'account' && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-xl divide-y divide-gray-200 dark:divide-gray-700 transition-colors">
          <div className="p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">プロフィール情報</h3>
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">氏名</label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                    <UserIcon size={16} />
                  </span>
                  <input
                    type="text"
                    defaultValue={user.name}
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">メールアドレス</label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                    <Mail size={16} />
                  </span>
                  <input
                    type="email"
                    defaultValue={user.email}
                    disabled
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 sm:text-sm cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">組織名</label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                    <Building size={16} />
                  </span>
                  <input
                    type="text"
                    defaultValue={user.organization}
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
                <Button>変更を保存</Button>
            </div>
          </div>
          
          <div className="p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">契約プラン</h3>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg text-indigo-600 dark:text-indigo-400 mr-4">
                        <CreditCard size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">現在のプラン: <span className="font-bold">{user.plan}</span></p>
                        <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1">次回更新日: 2024年12月01日</p>
                    </div>
                </div>
                <Button variant="outline" size="sm">プラン変更</Button>
            </div>
          </div>

          <div className="p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">Meta広告アカウント連携</h3>
            <div className="space-y-4">
              {/* OAuth認証ボタン */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                      簡単に連携する（推奨）
                    </h4>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Metaでログインするだけで、アカウントIDとアクセストークンを自動取得できます
                    </p>
                  </div>
                  <Button
                    onClick={async () => {
                      try {
                        await Api.startMetaOAuth();
                      } catch (error: any) {
                        addToast(error.message || 'OAuth認証の開始に失敗しました', 'error');
                      }
                    }}
                    variant="primary"
                    disabled={metaSettingsLoading}
                  >
                    Metaでログインして連携
                  </Button>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">または</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Meta広告アカウントID
                </label>
                <input
                  type="text"
                  value={metaAccountId}
                  onChange={(e) => setMetaAccountId(e.target.value)}
                  placeholder="act_123456789"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Meta広告マネージャーで確認できるアカウントID（act_で始まる形式）
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Metaアクセストークン
                </label>
                <input
                  type="password"
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  placeholder="アクセストークンを入力（更新時のみ）"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  長期トークン（60日有効）を推奨。更新しない場合は空欄のままにしてください。
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={async () => {
                    setMetaSettingsLoading(true);
                    try {
                      await Api.updateMetaSettings(metaAccountId, metaAccessToken);
                      addToast('Metaアカウント設定を更新しました', 'success');
                      setMetaAccessToken(''); // セキュリティのため、保存後はクリア
                    } catch (error: any) {
                      addToast(error.message || '設定の更新に失敗しました', 'error');
                    } finally {
                      setMetaSettingsLoading(false);
                    }
                  }}
                  disabled={metaSettingsLoading}
                >
                  {metaSettingsLoading ? '保存中...' : 'Meta設定を保存'}
                </Button>
              </div>

              {/* 手動データ同期ボタン */}
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                      データを手動で同期
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Meta APIから最新のデータを取得してデータベースを更新します（数分かかる場合があります）
                    </p>
                  </div>
                  <Button
                    onClick={async () => {
                      setMetaSettingsLoading(true);
                      try {
                        const result = await Api.syncAllMetaData();
                        addToast(`データ同期が完了しました: ${result.synced_accounts}/${result.total_accounts}アカウント`, 'success');
                        
                        // 同期後はローカルキャッシュを破棄して最新データを再取得させる
                        try {
                          localStorage.removeItem('campaignData');
                          localStorage.removeItem('campaignData_time');
                          localStorage.removeItem('dashboard_metaAccounts');
                          localStorage.removeItem('dashboard_metaAccounts_time');
                        } catch (cacheError) {
                          console.error('[Settings] Failed to clear cache after sync:', cacheError);
                        }

                        // データ同期完了イベントを発火
                        window.dispatchEvent(new CustomEvent('dataSyncComplete'));
                        console.log('[Settings] dataSyncComplete event dispatched');
                      } catch (error: any) {
                        addToast(error.message || 'データ同期に失敗しました', 'error');
                      } finally {
                        setMetaSettingsLoading(false);
                      }
                    }}
                    disabled={metaSettingsLoading}
                    variant="outline"
                  >
                    {metaSettingsLoading ? '同期中...' : 'データを同期'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Tab Content */}
      {activeTab === 'team' && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-xl overflow-hidden transition-colors">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700/50">
            <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">チームメンバー</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">プロジェクトにアクセスできるメンバーを管理します。</p>
            </div>
            {currentTeamId && (
              <Button onClick={() => setIsInviteModalOpen(true)} icon={<Plus size={16} />}>メンバーを招待</Button>
            )}
          </div>
          
          {membersLoading ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">読み込み中...</div>
          ) : !currentTeamId ? (
            <div className="p-6 text-center">
              <p className="text-gray-500 dark:text-gray-400 mb-4">チームがありません</p>
              {user.plan === 'FREE' && (
                <p className="text-sm text-gray-400 dark:text-gray-500">チーム機能はPROプラン以上で利用可能です</p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {members.length === 0 ? (
                <li className="p-6 text-center text-gray-500 dark:text-gray-400">メンバーがいません</li>
              ) : (
                members.map((member) => (
                  <li key={member.id} className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center">
                            {member.name}
                            {member.email === user.email && <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">自分</span>}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{member.email}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            member.status === 'ACTIVE' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                            {member.status === 'ACTIVE' ? '有効' : '招待中'}
                        </span>
                        
                        <div className="flex items-center space-x-2">
                            <span className="flex items-center text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-md">
                                <Shield size={14} className="mr-1.5" />
                                {member.role === 'ADMIN' ? '管理者' : (member.role === 'EDITOR' ? '編集者' : '閲覧者')}
                            </span>
                            
                            {member.email !== user.email && (
                                <button 
                                    onClick={() => removeMember(member.id)}
                                    className="p-2 text-gray-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50 dark:hover:bg-red-900/30"
                                >
                                    <Trash2 size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {/* Invite Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 dark:bg-gray-900 opacity-75 dark:opacity-80" onClick={() => setIsInviteModalOpen(false)}></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6 animate-fade-in-up">
              <div className="absolute top-0 right-0 pt-4 pr-4">
                <button
                  type="button"
                  className="bg-white dark:bg-gray-800 rounded-md text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none"
                  onClick={() => setIsInviteModalOpen(false)}
                >
                  <span className="sr-only">Close</span>
                  <X size={24} />
                </button>
              </div>
              
              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 sm:mx-0 sm:h-10 sm:w-10">
                  <Users className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                    チームメンバーを招待
                  </h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      招待メールを送信します。権限を選択してください。
                    </p>
                    
                    <form onSubmit={handleInvite} className="mt-4 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">メールアドレス</label>
                            <input
                                type="email"
                                required
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="colleague@example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">権限ロール</label>
                            <select
                                value={inviteRole}
                                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            >
                                <option value="ADMIN">管理者 (フルアクセス)</option>
                                <option value="EDITOR">編集者 (分析・編集)</option>
                                <option value="VIEWER">閲覧者 (閲覧のみ)</option>
                            </select>
                        </div>
                        
                        <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                            <Button type="submit" isLoading={loading} className="w-full sm:w-auto sm:ml-3">
                                招待を送信
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => setIsInviteModalOpen(false)} className="w-full sm:w-auto mt-3 sm:mt-0">
                                キャンセル
                            </Button>
                        </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};