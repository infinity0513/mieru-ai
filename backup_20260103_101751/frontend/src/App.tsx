// Test deployment - Netlify auto-deploy verification
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, ViewState, CampaignData } from './types';
import { Auth } from './components/Auth';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Upload } from './components/Upload';
import { DailyData } from './components/DailyData';
import { Analysis } from './components/Analysis';
import { Simulation } from './components/Simulation';
import { AdGenerator } from './components/AdGenerator';
import { CompetitorResearch } from './components/CompetitorResearch';
import { PersonaBuilder } from './components/PersonaBuilder';
import { KeywordSuggestion } from './components/KeywordSuggestion';
import { CreativeDiagnostic } from './components/CreativeDiagnostic';
import { PolicyChecker } from './components/PolicyChecker';
import { ABTestSimulator } from './components/ABTestSimulator';
import { BudgetOptimizer } from './components/BudgetOptimizer';
import { LPAnalyzer } from './components/LPAnalyzer';
import { SmartReportGenerator } from './components/SmartReportGenerator';
import { FunnelAnalysis } from './components/FunnelAnalysis';
import { RoiSimulator } from './components/RoiSimulator';
import { JourneyMap } from './components/JourneyMap';
import { Settings } from './components/Settings';
import { AnomalyDetector } from './components/AnomalyDetector';
import { EmailVerification } from './components/EmailVerification';
import { Api, TokenExpiredError } from './services/api';
import { ToastProvider, useToast } from './components/ui/Toast';
import { TourGuide, TourStep } from './components/TourGuide';

const TOUR_STEPS: TourStep[] = [
  {
    title: "ようこそ！Ad Analyzer AIへ",
    content: "Meta広告運用のためのオールインワンAIツールです。このツアーでは主要な機能の使い方を簡単にご紹介します。",
    position: "center"
  },
  {
    targetId: "nav-upload",
    title: "まずはデータをアップロード",
    content: "広告マネージャからエクスポートしたCSVまたはExcelファイルをここでアップロードしてください。",
    position: "right"
  },
  {
    targetId: "nav-dashboard",
    title: "ダッシュボードで現状把握",
    content: "KPIの推移やキャンペーンごとの詳細パフォーマンスを一目で確認できます。",
    position: "right"
  },
  {
    targetId: "nav-analysis",
    title: "AIによる深層分析",
    content: "データに基づいた改善提案や具体的なアクションプランをAIが数秒で作成します。",
    position: "right"
  },
  {
    targetId: "ai-chat-trigger",
    title: "AIチャットアシスタント",
    content: "「CPAを下げるには？」「今週の成果は？」など、チャットで質問すればAIがデータを分析して答えてくれます。",
    position: "top"
  }
];

const AppContent: React.FC = () => {
  // 環境判定（開発環境かどうか）
  const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
  
  // キャッシュキー（定数として定義）
  const USER_CACHE_KEY = 'ad_analyzer_user_cache';
  const USER_CACHE_TIME_KEY = 'ad_analyzer_user_cache_time';
  const VIEW_STATE_KEY = 'ad_analyzer_current_view';
  
  // キャッシュからユーザー情報を読み込む（安全に実装）
  const loadCachedUser = useCallback((): User | null => {
    try {
      const cached = localStorage.getItem(USER_CACHE_KEY);
      if (!cached) {
        return null;
      }
      
      const userData = JSON.parse(cached);
      
      // キャッシュの有効期限をチェック（24時間）
      const cacheTime = localStorage.getItem(USER_CACHE_TIME_KEY);
      if (cacheTime) {
        const cacheTimestamp = parseInt(cacheTime, 10);
        if (isNaN(cacheTimestamp)) {
          return null;
        }
        
        const now = Date.now();
        const cacheAge = now - cacheTimestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24時間
        
        if (cacheAge < maxAge) {
          return userData;
        } else {
          // キャッシュが古い場合は削除
          localStorage.removeItem(USER_CACHE_KEY);
          localStorage.removeItem(USER_CACHE_TIME_KEY);
        }
      }
    } catch (error) {
      console.error('[App] Error loading cached user:', error);
      // エラーが発生した場合はキャッシュをクリア
      try {
        localStorage.removeItem(USER_CACHE_KEY);
        localStorage.removeItem(USER_CACHE_TIME_KEY);
      } catch (e) {
        // 無視
      }
    }
    return null;
  }, []);
  
  // ユーザー情報をキャッシュに保存
  const saveUserToCache = useCallback((userData: User) => {
    try {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
      localStorage.setItem(USER_CACHE_TIME_KEY, Date.now().toString());
    } catch (error) {
      console.error('[App] Error saving user to cache:', error);
    }
  }, []);
  
  // キャッシュからビュー状態を読み込む
  const loadCachedView = useCallback((): ViewState => {
    try {
      const cached = localStorage.getItem(VIEW_STATE_KEY);
      if (cached) {
        const validViews: ViewState[] = [
          'DASHBOARD', 'DATA_UPLOAD', 'DAILY_DATA', 'ANALYSIS', 'ANOMALY_DETECTOR', 
          'SIMULATION', 'AD_GENERATOR', 'KEYWORD_SUGGESTION', 'PERSONA_BUILDER', 
          'COMPETITOR_RESEARCH', 'CREATIVE_DIAGNOSTIC', 'POLICY_CHECKER', 
          'AB_TEST_SIMULATOR', 'BUDGET_OPTIMIZER', 'LP_ANALYZER', 
          'REPORT_GENERATOR', 'FUNNEL_ANALYSIS', 'ROI_SIMULATOR', 
          'JOURNEY_MAP', 'SETTINGS'
        ];
        if (validViews.includes(cached as ViewState)) {
          return cached as ViewState;
        }
      }
    } catch (error) {
      console.error('[App] Error loading cached view:', error);
    }
    return 'DASHBOARD';
  }, []);
  
  // ビュー状態をキャッシュに保存
  const saveViewToCache = useCallback((view: ViewState) => {
    try {
      localStorage.setItem(VIEW_STATE_KEY, view);
    } catch (error) {
      console.error('[App] Error saving view to cache:', error);
    }
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');
  const [data, setData] = useState<CampaignData[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [hasUploadedData, setHasUploadedData] = useState(false);
  
  // Tour State
  const [isTourOpen, setIsTourOpen] = useState(false);
  
  // Toast
  const { addToast } = useToast();
  
  // ビュー状態をキャッシュから復元（マウント時のみ、ログイン済みの場合のみ）
  useEffect(() => {
    if (!user) return; // ログインしていない場合はスキップ（パフォーマンス最適化）
    
    const cachedView = loadCachedView();
    if (cachedView !== 'DASHBOARD') {
      setCurrentView(cachedView);
    }
  }, [user, loadCachedView]);
  
  // ビュー状態が変更されたときにキャッシュに保存
  useEffect(() => {
    if (user) {
      saveViewToCache(currentView);
    }
  }, [currentView, user, saveViewToCache]);

  // Check for existing token on mount (auto-login)
  useEffect(() => {
    let isMounted = true; // コンポーネントがマウントされているかチェック
    
    const checkAuth = async () => {
      // パフォーマンス最適化: トークンチェックを先に行い、ない場合は早期リターン
      let token: string | null = null;
      try {
        token = localStorage.getItem('access_token');
      } catch (error) {
        console.error('[App] Error accessing localStorage:', error);
        return;
      }
      
      if (!token) {
        // トークンがない場合、キャッシュもクリア（非同期処理を避ける）
        try {
          localStorage.removeItem(USER_CACHE_KEY);
          localStorage.removeItem(USER_CACHE_TIME_KEY);
        } catch (error) {
          // エラーは無視（localStorageが使用できない場合）
        }
        return;
      }
      
      // トークンがある場合のみ、キャッシュからユーザー情報を読み込む
      const cachedUser = loadCachedUser();
      if (cachedUser && isMounted) {
        setUser(cachedUser);
      }
      
      // その後、APIで検証して最新の情報を取得（非同期処理は最小限に）
      try {
        const userData = await Api.getCurrentUser();
        if (isMounted) {
          setUser(userData);
          saveUserToCache(userData); // キャッシュを更新
        }
      } catch (error) {
        if (!isMounted) return; // コンポーネントがアンマウントされている場合は何もしない
        
        // Token invalid, clear it
        if (error instanceof TokenExpiredError) {
          // トークン期限切れの場合は通知を表示
          addToast('認証トークンの有効期限が切れました。再度ログインしてください。', 'warning');
        }
        // キャッシュもクリア
        try {
          localStorage.removeItem('access_token');
          localStorage.removeItem(USER_CACHE_KEY);
          localStorage.removeItem(USER_CACHE_TIME_KEY);
        } catch (e) {
          // エラーは無視
        }
        setUser(null);
      }
    };
    
    // 非同期処理を開始
    checkAuth();
    
    // クリーンアップ関数
    return () => {
      isMounted = false;
    };
  }, [addToast, loadCachedUser, saveUserToCache]);

  // handleLogoutとaddToastの参照を保持（useEffectの依存配列の問題を回避）
  // 注意: handleLogoutは後で定義されるため、初期値はnull
  const handleLogoutRef = useRef<(() => void) | null>(null);
  const addToastRef = useRef(addToast);
  
  // 初回データロード判定用
  const hasLoadedInitialDataRef = useRef(false);

  // loadInitialDataを先に定義（useEffectで使用するため）
  const loadInitialData = useCallback(async () => {
    console.log('[App] loadInitialData called');
    
    try {
      // 1. まずlocalStorageから取得（高速表示）
      const cachedData = localStorage.getItem('campaignData');
      const cacheTime = localStorage.getItem('campaignData_time');
      const CACHE_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24時間キャッシュ有効
      const isCacheValid = cacheTime && (Date.now() - parseInt(cacheTime)) < CACHE_VALIDITY_MS;
      
      if (cachedData && cachedData !== '[]' && isCacheValid) {  // 空配列チェック追加
        try {
          const parsedData = JSON.parse(cachedData);
          if (parsedData && parsedData.length > 0) {  // データ存在チェック
            console.log('[App] Loaded from cache:', parsedData.length, 'records');
            setData(parsedData); // 即座に表示
            setHasUploadedData(parsedData.length > 0);
            // キャッシュが有効な場合はAPI呼び出しをスキップ
            return;
          }
        } catch (e) {
          console.error('[App] Failed to parse cached data:', e);
          localStorage.removeItem('campaignData'); // 壊れたキャッシュを削除
        }
      }
      
      // 2. キャッシュがない、または期限切れの場合のみAPIから最新データを取得
      setDataLoading(true);
      console.log('[App] Fetching latest campaign data from API...');
      const fetchedData = await Api.fetchCampaignData();
      console.log('[App] Fetched data count:', fetchedData.length);
      
      // 日付範囲を確認
      if (fetchedData.length > 0) {
        const uniqueDates = Array.from(new Set(fetchedData.map(d => d.date))).sort();
        const minDate = uniqueDates[0];
        const maxDate = uniqueDates[uniqueDates.length - 1];
        const daysCount = uniqueDates.length;
        console.log('[App] ===== データベースに保存されているデータの日付範囲 =====');
        console.log('[App] 最小日付:', minDate);
        console.log('[App] 最大日付:', maxDate);
        console.log('[App] ユニークな日付数:', daysCount, '日分');
        console.log('[App] ============================================================');
      }
      
      // 3. localStorageに保存（データが空でないことを確認）
      if (fetchedData && fetchedData.length > 0) {
        try {
          localStorage.setItem('campaignData', JSON.stringify(fetchedData));
          localStorage.setItem('campaignData_time', Date.now().toString());
          console.log('[App] Data saved to cache:', fetchedData.length, 'records');
        } catch (e) {
          console.error('[App] Error saving to cache:', e);
        }
      }
      
      setData(fetchedData);
      setHasUploadedData(fetchedData.length > 0);
      if (fetchedData.length > 0) {
        console.log('[App] Data loaded successfully:', fetchedData.length, 'records');
      } else {
        console.log('[App] No data found');
      }
    } catch (e) {
      console.error("[App] Failed to fetch data", e);
      
      // トークン期限切れの場合は自動ログアウト
      if (e instanceof TokenExpiredError) {
        addToast('認証トークンの有効期限が切れました。再度ログインしてください。', 'warning');
        if (handleLogoutRef.current) {
          handleLogoutRef.current();
        }
        return;
      }
      
      // エラー時もキャッシュがあれば使う
      const cachedData = localStorage.getItem('campaignData');
      if (cachedData && cachedData !== '[]') {
        try {
          const parsedData = JSON.parse(cachedData);
          if (parsedData && parsedData.length > 0) {
            console.log('[App] Using cached data due to error:', parsedData.length, 'records');
            setData(parsedData);
            setHasUploadedData(parsedData.length > 0);
          }
        } catch (parseError) {
          console.error('[App] Failed to parse cached data on error:', parseError);
          setData([]);
          setHasUploadedData(false);
        }
      } else {
        setData([]);
        setHasUploadedData(false);
      }
    } finally {
      setDataLoading(false);
    }
  }, [addToast]);

  // Initial Data Fetch on Login - ログイン時は常にデータを再読み込み
  useEffect(() => {
    if (user && !hasLoadedInitialDataRef.current) {
      console.log('[App] User logged in, loading initial data for:', user.email);
      hasLoadedInitialDataRef.current = true;
      loadInitialData();
    } else if (!user) {
      console.log('[App] No user, clearing data');
      setData([]);
      setHasUploadedData(false);
      hasLoadedInitialDataRef.current = false; // ログアウト時にリセット
    }
  }, [user, loadInitialData]);

  // データ取得完了イベントをリッスン（Meta API同期後など）
  useEffect(() => {
    const handleDataSyncComplete = () => {
      console.log('[App] Data sync complete event received, reloading data...');
      loadInitialData();
    };

    window.addEventListener('dataSyncComplete', handleDataSyncComplete);
    
    return () => {
      window.removeEventListener('dataSyncComplete', handleDataSyncComplete);
    };
  }, [loadInitialData]);

  // Check for tour completion on login
  useEffect(() => {
    if (user) {
      const tourCompleted = localStorage.getItem('ad_analyzer_tour_completed');
      if (!tourCompleted) {
        // Slight delay to ensure UI renders
        setTimeout(() => setIsTourOpen(true), 1000);
      }
    }
  }, [user]);

  // トークン期限切れの自動チェック（30秒ごと）
  // 注意: この機能はログイン後にのみ動作します
  useEffect(() => {
    if (!user) {
      return; // ログインしていない場合はチェック不要
    }

    // トークンが存在するか確認
    let token: string | null = null;
    try {
      token = localStorage.getItem('access_token');
    } catch (error) {
      console.error('[App] Error accessing localStorage:', error);
      return;
    }
    
    if (!token) {
      return; // トークンがない場合はチェック不要
    }

    const checkTokenExpiration = () => {
      try {
        // 再度トークンの存在を確認
        const currentToken = localStorage.getItem('access_token');
        if (!currentToken) {
          return; // トークンが削除された場合は何もしない
        }

        const isExpired = Api.isTokenExpired();
        
        // nullの場合はトークンなしまたはエラーなので、何もしない
        if (isExpired === null) {
          return;
        }
        
        if (isExpired === true) {
          // トークンが期限切れの場合、自動ログアウト
          if (isDevelopment) {
            console.log('[App] Token expired, auto-logout');
          }
          
          // 参照から関数を呼び出す
          try {
            addToastRef.current('認証トークンの有効期限が切れました。再度ログインしてください。', 'warning');
          } catch (toastError) {
            console.error('[App] Error showing toast:', toastError);
          }
          
          try {
            if (handleLogoutRef.current) {
            handleLogoutRef.current();
            }
          } catch (logoutError) {
            console.error('[App] Error during logout:', logoutError);
          }
        }
      } catch (error) {
        // エラーが発生した場合はログを出力するだけで、アプリをクラッシュさせない
        console.error('[App] Error checking token expiration:', error);
      }
    };

    // 初回チェックはレンダリングが完了してから実行（3秒後）
    const initialCheckTimeout = setTimeout(() => {
      try {
        checkTokenExpiration();
      } catch (error) {
        console.error('[App] Error in initial token expiration check:', error);
      }
    }, 3000);

    // 30秒ごとにチェック
    const interval = setInterval(() => {
      try {
        checkTokenExpiration();
      } catch (error) {
        console.error('[App] Error in interval token expiration check:', error);
      }
    }, 30000);

    return () => {
      clearTimeout(initialCheckTimeout);
      clearInterval(interval);
    };
  }, [user]); // userのみを依存配列に含める

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    saveUserToCache(loggedInUser); // ログイン時にキャッシュに保存
  };

  const handleLogout = useCallback(() => {
    if (isDevelopment) {
      console.log('[App] Starting logout process...');
    }
    
    // 1. Clear authentication token and all related data
    Api.clearToken();
    
    // 2. Clear all localStorage items related to authentication
    const authKeys = ['access_token', 'token', 'auth_token', 'bearer_token', 'refresh_token'];
    authKeys.forEach(key => {
      if (localStorage.getItem(key)) {
        if (isDevelopment) {
          console.log(`[App] Removing auth key from localStorage: ${key}`);
        }
        localStorage.removeItem(key);
      }
    });
    
    // 3. Clear user cache
    try {
      localStorage.removeItem('ad_analyzer_user_cache');
      localStorage.removeItem('ad_analyzer_user_cache_time');
    } catch (e) {
      console.error('[App] Error clearing user cache:', e);
    }
    
    // 4. Clear sessionStorage (if any)
    authKeys.forEach(key => {
      if (sessionStorage.getItem(key)) {
        if (isDevelopment) {
          console.log(`[App] Removing auth key from sessionStorage: ${key}`);
        }
        sessionStorage.removeItem(key);
      }
    });
    
    // 5. Clear all application state
    if (isDevelopment) {
      console.log('[App] Clearing application state...');
    }
    setUser(null);
    setCurrentView('DASHBOARD');
    setHasUploadedData(false);
    setData([]);
    setDataLoading(false);
    setIsTourOpen(false);
    
    // 6. Verify token is cleared
    const remainingToken = localStorage.getItem('access_token');
    if (remainingToken) {
      console.warn('[App] Token still exists after logout, forcing removal');
      localStorage.removeItem('access_token');
      // Try one more time with different methods
      try {
        localStorage.removeItem('access_token');
        delete (localStorage as any).access_token;
      } catch (e) {
        console.error('[App] Error clearing token:', e);
      }
    }
    
    // 7. Force garbage collection hint (if available)
    if (window.gc) {
      window.gc();
    }
    
    if (isDevelopment) {
      console.log('[App] Logout process completed');
    }
  }, [isDevelopment]);
  
  // handleLogoutの参照を更新
  useEffect(() => {
    handleLogoutRef.current = handleLogout;
  }, [handleLogout]);

  const handleUploadComplete = (uploadedData: CampaignData[]) => {
    setData(uploadedData);
    setHasUploadedData(true);
    setCurrentView('DASHBOARD');
  };

  const startTour = () => {
    setIsTourOpen(true);
    // Switch to dashboard to ensure elements exist
    setCurrentView('DASHBOARD');
  };

  const completeTour = () => {
    setIsTourOpen(false);
    localStorage.setItem('ad_analyzer_tour_completed', 'true');
  };

  // Check for email verification token in URL
  const urlParams = new URLSearchParams(window.location.search);
  const verifyToken = urlParams.get('token');
  const isVerifyEmailPage = window.location.pathname === '/verify-email' || (window.location.pathname === '/' && verifyToken);
  
  // Show email verification page if token is in URL
  if (isVerifyEmailPage && verifyToken) {
    return (
      <EmailVerification 
        token={verifyToken} 
        onVerified={() => {
          window.location.href = '/';
        }}
      />
    );
  }

  // ログイン画面が表示されている時は、不要なコンポーネントをレンダリングしない（パフォーマンス最適化）
  if (!user) {
    return (
      <div className="min-h-screen">
        <Auth onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <>
      <Layout 
        user={user} 
        currentView={currentView} 
        onChangeView={setCurrentView}
        onLogout={handleLogout}
        data={data}
        onStartTour={startTour}
      >
        {currentView === 'DASHBOARD' && (
          <>
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ダッシュボード</h1>
              {!hasUploadedData && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                  デモデータ表示中
                </span>
              )}
              {hasUploadedData && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200">
                  アップロードデータ表示中
                </span>
              )}
            </div>
            {dataLoading ? (
              <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 rounded-full"></div></div>
            ) : (
              <Dashboard data={data} />
            )}
          </>
        )}

        {currentView === 'DATA_UPLOAD' && (
          <Upload onUploadComplete={handleUploadComplete} />
        )}

        {currentView === 'DAILY_DATA' && (
          <DailyData data={data} />
        )}

        {currentView === 'ANALYSIS' && (
          <Analysis data={data} />
        )}

        {currentView === 'ANOMALY_DETECTOR' && (
          <AnomalyDetector data={data} />
        )}

        {currentView === 'JOURNEY_MAP' && (
          <JourneyMap />
        )}

        {currentView === 'FUNNEL_ANALYSIS' && (
          <FunnelAnalysis data={data} />
        )}

        {currentView === 'ROI_SIMULATOR' && (
          <RoiSimulator data={data} />
        )}

        {currentView === 'REPORT_GENERATOR' && (
          <SmartReportGenerator data={data} />
        )}

        {currentView === 'SIMULATION' && (
          <Simulation data={data} />
        )}

        {currentView === 'BUDGET_OPTIMIZER' && (
          <BudgetOptimizer data={data} />
        )}

        {currentView === 'AB_TEST_SIMULATOR' && (
          <ABTestSimulator />
        )}

        {currentView === 'AD_GENERATOR' && (
          <AdGenerator />
        )}

        {currentView === 'CREATIVE_DIAGNOSTIC' && (
          <CreativeDiagnostic />
        )}

        {currentView === 'LP_ANALYZER' && (
          <LPAnalyzer />
        )}

        {currentView === 'POLICY_CHECKER' && (
          <PolicyChecker />
        )}

        {currentView === 'PERSONA_BUILDER' && (
          <PersonaBuilder />
        )}

        {currentView === 'KEYWORD_SUGGESTION' && (
          <KeywordSuggestion />
        )}

        {currentView === 'COMPETITOR_RESEARCH' && (
          <CompetitorResearch />
        )}

        {currentView === 'SETTINGS' && (
          <Settings user={user} />
        )}
      </Layout>
      
      <TourGuide 
        steps={TOUR_STEPS} 
        isOpen={isTourOpen} 
        onClose={completeTour} 
        onComplete={completeTour} 
      />
    </>
  );
};

const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};

export default App;