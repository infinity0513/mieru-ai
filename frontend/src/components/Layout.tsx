import React, { useState, useEffect, useRef, createContext, useContext, useMemo } from 'react';
import { LayoutDashboard, BarChart2, UploadCloud, Settings, LogOut, User as UserIcon, Menu, X, Bell, Check, Info, AlertTriangle, Moon, Sun, Calculator, PenTool, Search, UserPlus, Tag, Image as ImageIcon, Shield, Split, DollarSign, LayoutTemplate, FileText, Filter, Map as MapIcon, HelpCircle, Command, AlertOctagon, Table } from 'lucide-react';
import { User, ViewState, Notification, CampaignData } from '../types';
import { ChatAssistant } from './ChatAssistant';
import { CommandPalette, CommandAction } from './CommandPalette';
import { Api } from '../services/api';

interface LayoutProps {
  user: User;
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  onLogout: () => void;
  data: CampaignData[];
  onStartTour?: () => void;
  children: React.ReactNode;
}

// Create Theme Context
export const ThemeContext = createContext<{ isDark: boolean; toggleTheme: () => void }>({
  isDark: false,
  toggleTheme: () => {},
});

// Helper function to convert backend notification type to frontend type
const mapNotificationType = (backendType: string): 'INFO' | 'WARNING' | 'SUCCESS' => {
  if (backendType.includes('complete') || backendType.includes('success')) {
    return 'SUCCESS';
  }
  if (backendType.includes('alert') || backendType.includes('warning') || backendType.includes('error')) {
    return 'WARNING';
  }
  return 'INFO';
};

// Helper function to format relative time
const formatRelativeTime = (dateString: string): string => {
  try {
    // Ensure UTC timezone is preserved if not already specified
    let dateStr = dateString;
    // If the string doesn't have timezone info, assume it's UTC
    if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
      // Add 'Z' to indicate UTC if it's in ISO format without timezone
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        dateStr = dateStr + 'Z';
      }
    }
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return '日付不明';
    }
    
    // Use current time in UTC for comparison
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'たった今';
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 7) return `${diffDays}日前`;
    
    // Format date in local timezone for display
    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  } catch (error) {
    console.error('Error formatting relative time:', dateString, error);
    return '日付不明';
  }
};

export const Layout: React.FC<LayoutProps> = ({ 
  user, 
  currentView, 
  onChangeView, 
  onLogout, 
  data, 
  onStartTour,
  children 
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  // Command Palette State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Theme State
  const [isDark, setIsDark] = useState(false);

  // 環境判定（開発環境かどうか）
  const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

  // Handle logout with confirmation dialog cleanup
  const handleLogoutConfirm = () => {
    if (isDevelopment) {
      console.log('[Layout] Logout confirmed, starting logout process...');
    }
    // Close dialog first
    setShowLogoutConfirm(false);
    // Clear any pending state
    setMobileMenuOpen(false);
    setShowNotifications(false);
    // Execute logout immediately
    setTimeout(() => {
      onLogout();
    }, 0);
  };

  // Initialize Theme from LocalStorage or System Preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    if (newIsDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // Load notifications from API
  const loadNotifications = React.useCallback(async () => {
    if (!user) return;
    
    setNotificationsLoading(true);
    try {
      const response = await Api.getNotifications(false, 20);
      const backendNotifications: any[] = (response.data || []) as any[];
      
      console.log('Loaded notifications:', backendNotifications);
      console.log('Number of notifications:', backendNotifications.length);
      
      // Convert backend format to frontend format and remove duplicates by ID
      const notificationMap = new Map<string, Notification>();
      
      backendNotifications.forEach((n: any) => {
        try {
          if (!n || !n.id) {
            console.warn('Invalid notification data:', n);
            return;
          }
          
          if (!notificationMap.has(n.id)) {
            const convertedNotification: Notification = {
              id: String(n.id),
              title: n.title || '通知',
              message: n.message || '',
              type: mapNotificationType(n.type || 'info'),
              isRead: Boolean(n.is_read),
              date: formatRelativeTime(n.created_at || new Date().toISOString())
            };
            notificationMap.set(String(n.id), convertedNotification);
          }
        } catch (err) {
          console.error('Error converting notification:', n, err);
        }
      });
      
      // Convert map to array - notifications are already sorted by backend (newest first)
      const convertedNotifications = Array.from(notificationMap.values());
      
      console.log('Converted notifications:', convertedNotifications);
      console.log('Number of converted notifications:', convertedNotifications.length);
      setNotifications(convertedNotifications);
    } catch (error: any) {
      console.error('Failed to load notifications:', error);
      console.error('Error details:', error.message, error.stack);
      // Keep empty array on error, but log for debugging
      if (error.message?.includes('401') || error.message?.includes('Failed to fetch')) {
        console.warn('Notification API call failed - check authentication or network');
      }
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  }, [user]);
  
  // Load notifications on mount and when user changes
  // 通知はユーザーのアクション（分析実行、ファイルアップロード）が完了したときに作成されるため、
  // 頻繁に取得する必要はない。通知ドロップダウンを開いたときだけ取得する
  useEffect(() => {
    if (!user) return;
    
    // 初回のみ取得
    loadNotifications();
  }, [user]);
  
  // 通知ドロップダウンを開いたときだけ取得
  useEffect(() => {
    if (showNotifications && user) {
      loadNotifications();
    }
  }, [showNotifications, user]);

  // Calculate unread count from notifications
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = async (id: string) => {
    try {
      await Api.markNotificationRead(id);
      // Update local state
      setNotifications(notifications.map(n => 
        n.id === id ? { ...n, isRead: true } : n
      ));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await Api.markAllNotificationsRead();
      // Update local state
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut for Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems = [
    { id: 'DASHBOARD', label: 'ダッシュボード', icon: LayoutDashboard, elementId: 'nav-dashboard' },
    { id: 'DATA_UPLOAD', label: 'データ管理', icon: UploadCloud, elementId: 'nav-upload' },
    { id: 'DAILY_DATA', label: '日別データ', icon: Table, elementId: 'nav-daily-data' },
    { id: 'ANALYSIS', label: 'AI分析レポート', icon: BarChart2, elementId: 'nav-analysis' },
    { id: 'ANOMALY_DETECTOR', label: 'AI異常検知モニター', icon: AlertOctagon },
    { id: 'FUNNEL_ANALYSIS', label: 'ファネル分析', icon: Filter },
    { id: 'ROI_SIMULATOR', label: '利益シミュレーター', icon: DollarSign },
    { id: 'REPORT_GENERATOR', label: 'スマートレポート', icon: FileText },
    { id: 'SIMULATION', label: '予算配分シミュレーション', icon: Calculator },
    { id: 'BUDGET_OPTIMIZER', label: '予算管理・着地予測', icon: DollarSign },
    { id: 'AB_TEST_SIMULATOR', label: 'ABテスト判定', icon: Split },
    { id: 'JOURNEY_MAP', label: 'ジャーニーマップ', icon: MapIcon },
    { id: 'AD_GENERATOR', label: '広告コピー生成', icon: PenTool },
    { id: 'CREATIVE_DIAGNOSTIC', label: 'クリエイティブ診断', icon: ImageIcon },
    { id: 'LP_ANALYZER', label: 'LP分析・整合性', icon: LayoutTemplate },
    { id: 'POLICY_CHECKER', label: 'ポリシーチェック', icon: Shield },
    { id: 'PERSONA_BUILDER', label: 'ペルソナ生成', icon: UserPlus },
    { id: 'KEYWORD_SUGGESTION', label: 'キーワード提案', icon: Tag },
    { id: 'COMPETITOR_RESEARCH', label: '競合リサーチ', icon: Search },
    { id: 'SETTINGS', label: '設定', icon: Settings },
  ];

  // Define commands for the palette
  const commands: CommandAction[] = useMemo(() => {
    // Navigation Commands
    const navCommands = navItems.map(item => ({
      id: item.id,
      label: item.label,
      group: 'ナビゲーション',
      icon: <item.icon size={16} />,
      perform: () => onChangeView(item.id as ViewState)
    }));

    // Action Commands
    const actionCommands = [
      { 
        id: 'toggle-theme', 
        label: isDark ? 'ライトモードに切り替え' : 'ダークモードに切り替え', 
        group: 'アクション', 
        icon: isDark ? <Sun size={16} /> : <Moon size={16} />, 
        perform: toggleTheme 
      },
      { 
        id: 'start-tour', 
        label: 'ガイドツアーを開始', 
        group: 'アクション', 
        icon: <HelpCircle size={16} />, 
        perform: () => onStartTour && onStartTour() 
      },
      { 
        id: 'logout', 
        label: 'ログアウト', 
        group: 'アカウント', 
        icon: <LogOut size={16} />, 
        perform: onLogout 
      }
    ];

    return [...navCommands, ...actionCommands];
  }, [navItems, isDark, onChangeView, toggleTheme, onLogout, onStartTour]);

  const getPageTitle = () => {
    const item = navItems.find(i => i.id === currentView);
    return item ? item.label : 'MIERU AI';
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex transition-colors duration-200">
        
        {/* Command Palette */}
        <CommandPalette 
            isOpen={isCommandPaletteOpen} 
            onClose={() => setIsCommandPaletteOpen(false)} 
            commands={commands} 
        />

        {/* Sidebar Desktop */}
        <div className="hidden md:flex flex-col w-72 bg-gray-900 dark:bg-gray-950 text-white fixed h-full z-20 no-print border-r border-gray-800 dark:border-gray-800">
          <div className="flex flex-col px-6 pt-5 pb-2">
            <div className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500 mb-6">
              MIERU AI
            </div>
            
            {/* Command Palette Trigger in Sidebar */}
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="flex items-center w-full px-3 py-2 text-sm text-gray-400 bg-gray-800 dark:bg-gray-900 border border-gray-700 rounded-lg hover:text-white hover:border-gray-600 transition-colors group"
            >
              <Search size={14} className="mr-2 group-hover:text-indigo-400" />
              <span className="flex-1 text-left">検索...</span>
              <div className="flex items-center text-xs text-gray-500 bg-gray-700 dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-600">
                <span className="text-[10px] mr-0.5">⌘</span>K
              </div>
            </button>
          </div>

          <div className="flex-1 flex flex-col px-4 pb-4 overflow-y-auto">
            <nav className="mt-2 flex-1 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  id={item.elementId}
                  onClick={() => onChangeView(item.id as ViewState)}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg w-full transition-colors ${
                    currentView === item.id 
                      ? 'bg-indigo-600 text-white' 
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <item.icon className={`mr-3 flex-shrink-0 h-4 w-4 ${currentView === item.id ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex-shrink-0 flex border-t border-gray-800 p-4">
            <div className="flex items-center w-full">
              <div className="inline-block h-9 w-9 rounded-full bg-gray-600 flex items-center justify-center">
                 <UserIcon size={18} className="text-gray-300" />
              </div>
              <div className="ml-3 overflow-hidden">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs font-medium text-gray-400 truncate">{user.organization}</p>
              </div>
              <button 
                onClick={() => setShowLogoutConfirm(true)}
                className="ml-auto text-gray-400 hover:text-white"
                title="ログアウト"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col md:ml-72 transition-all duration-300">
          
          {/* Unified Header */}
          <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30 px-4 py-3 flex items-center justify-between shadow-sm transition-colors duration-200">
            <div className="flex items-center">
               {/* Mobile Logo */}
               <span className="md:hidden font-bold text-gray-900 dark:text-white mr-4">MIERU AI</span>
               
               {/* Desktop Breadcrumb/Title */}
               <h2 className="hidden md:block text-lg font-semibold text-gray-700 dark:text-gray-200">{getPageTitle()}</h2>
            </div>

            <div className="flex items-center space-x-1 md:space-x-3">
              
              {/* Mobile Search Trigger */}
              <button
                onClick={() => setIsCommandPaletteOpen(true)}
                className="md:hidden p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
              >
                <Search size={20} />
              </button>

              {/* Tour Trigger */}
              <button
                onClick={onStartTour}
                className="hidden md:block p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                title="ガイドツアーを開始"
              >
                <HelpCircle size={20} />
              </button>

              {/* Theme Toggle */}
              <button 
                onClick={toggleTheme}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                title={isDark ? "ライトモードに切り替え" : "ダークモードに切り替え"}
              >
                {isDark ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              {/* Notification Bell */}
              <div className="relative" ref={notificationRef}>
                  <button 
                      onClick={() => setShowNotifications(!showNotifications)} 
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative focus:outline-none"
                  >
                      <Bell size={20} />
                      {unreadCount > 0 && (
                          <span className="absolute top-1.5 right-1.5 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-800" />
                      )}
                  </button>

                  {/* Notification Dropdown */}
                  {showNotifications && (
                      <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden animate-fade-in-up z-50">
                          <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700/50">
                              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">通知</h3>
                              {unreadCount > 0 && (
                                  <button onClick={markAllAsRead} className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium">
                                      すべて既読にする
                                  </button>
                              )}
                          </div>
                          <div className="max-h-96 overflow-y-auto">
                              {notificationsLoading ? (
                                  <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">読み込み中...</div>
                              ) : notifications.length === 0 ? (
                                  <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">通知はありません</div>
                              ) : (
                                  <ul className="divide-y divide-gray-50 dark:divide-gray-700">
                                      {notifications.map((n) => (
                                          <li 
                                              key={n.id} 
                                              onClick={() => markAsRead(n.id)}
                                              className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${!n.isRead ? 'bg-indigo-50/30 dark:bg-indigo-900/20' : 'bg-white dark:bg-gray-800'}`}
                                          >
                                              <div className="flex items-start">
                                                  <div className={`flex-shrink-0 p-1.5 rounded-full mr-3 ${
                                                      n.type === 'SUCCESS' ? 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400' : 
                                                      n.type === 'WARNING' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400' : 
                                                      'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
                                                  }`}>
                                                      {n.type === 'SUCCESS' ? <Check size={14} /> : 
                                                       n.type === 'WARNING' ? <AlertTriangle size={14} /> : 
                                                       <Info size={14} />}
                                                  </div>
                                                  <div className="flex-1 min-w-0">
                                                      <p className={`text-sm font-medium ${!n.isRead ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                                                          {n.title}
                                                      </p>
                                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-words">{n.message}</p>
                                                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{n.date}</p>
                                                  </div>
                                                  {!n.isRead && (
                                                      <div className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0 mt-1.5"></div>
                                                  )}
                                              </div>
                                          </li>
                                      ))}
                                  </ul>
                              )}
                          </div>
                      </div>
                  )}
              </div>

              {/* Logout Button - Desktop */}
              <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="hidden md:flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                  title="ログアウト"
              >
                  <LogOut size={18} />
                  <span className="hidden lg:inline">ログアウト</span>
              </button>

              {/* Logout Button - Mobile/Tablet */}
              <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="md:hidden p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                  title="ログアウト"
              >
                  <LogOut size={20} />
              </button>

              {/* Mobile Menu Button */}
              <button 
                  className="md:hidden p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                  {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </header>

          {/* Mobile Menu Overlay */}
          {mobileMenuOpen && (
            <div className="md:hidden fixed inset-0 z-40 top-14">
               <div className="absolute inset-0 bg-gray-900 opacity-50" onClick={() => setMobileMenuOpen(false)}></div>
               <div className="absolute top-0 left-0 w-full h-full bg-gray-900 shadow-xl no-print overflow-y-auto">
                  <div className="px-4 py-4 space-y-2 min-h-full">
                  {navItems.map((item) => (
                      <button
                      key={item.id}
                      onClick={() => {
                          onChangeView(item.id as ViewState);
                          setMobileMenuOpen(false);
                      }}
                      className="block w-full text-left px-4 py-3 rounded-md text-base font-medium text-white hover:bg-gray-800"
                      >
                      <span className="flex items-center">
                          <item.icon className="mr-3 h-5 w-5" />
                          {item.label}
                      </span>
                      </button>
                  ))}
                  <div className="border-t border-gray-700 my-2 pt-2 pb-4">
                      <div className="flex items-center px-4 py-2">
                          <div className="flex-shrink-0">
                               <div className="h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center text-white">
                                  {user.name.charAt(0)}
                               </div>
                          </div>
                          <div className="ml-3">
                              <div className="text-base font-medium text-white">{user.name}</div>
                              <div className="text-sm font-medium text-gray-400">{user.email}</div>
                          </div>
                      </div>
                      <button 
                          onClick={() => {
                              setMobileMenuOpen(false);
                              setShowLogoutConfirm(true);
                          }}
                          className="block w-full text-left px-4 py-3 rounded-md text-base font-medium text-red-400 hover:bg-gray-800 mt-1"
                      >
                          <span className="flex items-center">
                              <LogOut className="mr-3 h-5 w-5" />
                              ログアウト
                          </span>
                      </button>
                  </div>
                  </div>
              </div>
            </div>
          )}

          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>

        {/* AI Chat Assistant - Floating Widget */}
        <ChatAssistant data={data} />

        {/* Logout Confirmation Dialog */}
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                ログアウトしますか？
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                ログアウトすると、再度ログインが必要になります。
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleLogoutConfirm}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors focus:outline-none"
                >
                  ログアウト
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ThemeContext.Provider>
  );
};