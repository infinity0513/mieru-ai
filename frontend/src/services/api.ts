
import { User, CampaignData, AIAnalysisResult, ChatMessage, AdCopyParams, GeneratedAdCopy, CompetitorAnalysisResult, TargetPersona, KeywordSuggestionResult, CreativeAnalysisResult, PolicyCheckResult, ABTestInput, ABTestResult, BudgetPacingResult, LPAnalysisResult, ReportConfig, FunnelAnalysisResult, ProfitInput, ProfitAnalysisResult, JourneyStage, CreativeBrief } from '../types';
import { MOCK_CAMPAIGNS, MOCK_ANALYSIS_RESULT } from '../constants';
import OpenAI from 'openai';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Initialize OpenAI API Client (lazy initialization)
// process.env.API_KEY is automatically injected
let openai: OpenAI | null = null;
const getAI = () => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("AI API key is not configured");
  }
  
  // Validate API key format (OpenAI keys start with sk- and are longer than 20 chars)
  if (apiKey.length < 20 || !apiKey.startsWith('sk-')) {
    throw new Error("OpenAI APIキーの形式が正しくありません。APIキーを確認してください。");
  }
  
  if (!openai) {
    openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true // Required for browser usage
    });
  }
  return openai;
};

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// 環境判定（開発環境かどうか）
const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

// ログイン試行回数をカウント
let loginAttemptCount = 0;
// 短時間のログイン失敗回数を追跡（429エラー判定用）
let recentLoginFailures: number[] = [];

// トークン期限切れエラークラス
export class TokenExpiredError extends Error {
  constructor(message: string = '認証トークンの有効期限が切れました。再度ログインしてください。') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

// 詳細なログ出力機能（開発環境のみ）- 完全無効化（パフォーマンス最適化）
const debugLogin = (_phase: string, _data: any = {}) => {
  // パフォーマンス最適化のため、ログ出力を完全に無効化
  return;
};

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    // Don't cache token in instance - always read from localStorage
  }

  /**
   * 401エラー（認証エラー）を統一処理
   * トークンをクリアし、TokenExpiredErrorを投げる
   */
  private handle401Error(response: Response): never {
    debugLogin('認証エラー（401）検出', {
      action: 'handle401Error',
      status: response.status,
      statusText: response.statusText,
      tokenExists: !!this.getToken()
    });
    
    // トークンをクリア
    this.clearToken();
    
    // トークン期限切れエラーを投げる
    throw new TokenExpiredError('認証トークンの有効期限が切れました。再度ログインしてください。');
  }

  /**
   * JWTトークンから有効期限（exp）を取得
   * @returns 有効期限のタイムスタンプ（秒）、またはnull（トークンが無効な場合）
   */
  getTokenExpiration(): number | null {
    try {
      const token = this.getToken();
      if (!token) {
        return null;
      }

      // JWTは3つの部分に分かれている: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      // payloadをBase64デコード（エラーハンドリングを強化）
      let payload: any;
      try {
        // Base64デコード（URLセーフなBase64にも対応）
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = atob(base64);
        payload = JSON.parse(decoded);
      } catch (decodeError) {
        console.warn('[ApiClient] Failed to decode token payload:', decodeError);
        return null;
      }
      
      // exp（有効期限）を返す（秒単位のUnixタイムスタンプ）
      if (typeof payload.exp === 'number') {
        return payload.exp;
      }
      return null;
    } catch (error) {
      console.error('[ApiClient] Failed to parse token expiration:', error);
      return null;
    }
  }

  /**
   * トークンが期限切れかどうかをチェック
   * @returns true: 期限切れ、false: 有効、null: トークンなし
   */
  isTokenExpired(): boolean | null {
    try {
      const exp = this.getTokenExpiration();
      if (exp === null) {
        return null; // トークンなし
      }

      // 現在時刻（秒単位）と比較
      const now = Math.floor(Date.now() / 1000);
      return exp < now;
    } catch (error) {
      console.error('[ApiClient] Error checking token expiration:', error);
      // エラーが発生した場合は、安全のためnullを返す（期限切れと判断しない）
      return null;
    }
  }

  setToken(token: string) {
    // Always write directly to localStorage - single source of truth
    // Save to both 'access_token' and 'token' for compatibility
    try {
      localStorage.setItem('access_token', token);
      localStorage.setItem('token', token); // Also save as 'token' for compatibility
      console.log('[Api] Token saved to localStorage (both access_token and token keys)');
      console.log('[Api] Token length:', token.length);
      console.log('[Api] Token preview:', token.substring(0, 20) + '...');
    } catch (e: any) {
      console.error('[Api] Failed to save token to localStorage:', e);
      throw new Error('認証トークンの設定に失敗しました');
    }
  }

  clearToken() {
    // Clear token from localStorage - single source of truth
    // Remove both 'access_token' and 'token' keys
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('token'); // Also remove 'token' key
      console.log('[Api] Token cleared from localStorage (both keys)');
    } catch (e) {
      // Ignore errors
      console.error('[Api] Error clearing token:', e);
    }
  }

  private getToken(): string | null {
    // Always read from localStorage - single source of truth
    // Try 'access_token' first, then fallback to 'token' for compatibility
    const token = localStorage.getItem('access_token') || localStorage.getItem('token');
    if (token) {
      console.log('[Api] Token retrieved from localStorage, length:', token.length);
    } else {
      console.log('[Api] No token found in localStorage');
    }
    return token;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    // Always get the latest token from localStorage - single source of truth
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // 共通のfetchオプションを取得（CORS対応）
  private getFetchOptions(additionalOptions: RequestInit = {}): RequestInit {
    return {
      credentials: 'include',  // CORS credentials をサポート
      ...additionalOptions,
      headers: {
        ...this.getHeaders(),
        ...additionalOptions.headers,
      },
    };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseURL}/auth/forgot-password/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'パスワードリセットのリクエストに失敗しました' }));
      throw new Error(error.detail || 'パスワードリセットのリクエストに失敗しました');
    }

    return await response.json();
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseURL}/auth/reset-password/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, new_password: newPassword }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'パスワードのリセットに失敗しました' }));
      throw new Error(error.detail || 'パスワードのリセットに失敗しました');
    }

    return await response.json();
  }

  async requestLoginCode(email: string, password: string): Promise<{ 
    message: string; 
    requires_code: boolean; 
    session_id?: string;
    access_token?: string;  // 2FAスキップ時のみ
    token_type?: string;  // 2FAスキップ時のみ
    user?: User;  // 2FAスキップ時のみ
  }> {
    console.log('[Api] requestLoginCode called for:', email);
    console.log('[Api] requestLoginCode baseURL:', this.baseURL);
    console.log('[Api] requestLoginCode URL:', `${this.baseURL}/auth/login/request-code`);
    
    // タイムアウト処理を追加
    let controller: AbortController | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      console.log('[Api] requestLoginCode: Creating AbortController...');
      controller = new AbortController();
      timeoutId = setTimeout(() => {
        console.error('[Api] requestLoginCode: Request timeout');
        if (controller) {
          controller.abort();
        }
      }, 30000); // 30秒でタイムアウト
      
      console.log('[Api] requestLoginCode: Starting fetch...');
      console.log('[Api] requestLoginCode: Request body:', { email, password: '***' });
      
      const response = await fetch(`${this.baseURL}/auth/login/request-code/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[Api] requestLoginCode response status:', response.status);
      console.log('[Api] requestLoginCode response ok:', response.ok);

      if (!response.ok) {
        console.log('[Api] requestLoginCode: Response not OK, parsing error...');
        let errorData;
        try {
          const text = await response.text();
          console.log('[Api] requestLoginCode error response text:', text);
          errorData = JSON.parse(text);
        } catch (parseError) {
          console.error('[Api] requestLoginCode: Failed to parse error response:', parseError);
          errorData = { detail: '認証コードの送信に失敗しました' };
        }
        console.error('[Api] requestLoginCode error:', errorData);
        throw new Error(errorData.detail || '認証コードの送信に失敗しました');
      }

      console.log('[Api] requestLoginCode: Parsing response JSON...');
      const data = await response.json();
      console.log('[Api] requestLoginCode response data:', data);
      console.log('[Api] requestLoginCode access_token exists:', !!data.access_token);
      console.log('[Api] requestLoginCode requires_code:', data.requires_code);
      
      // If 2FA is skipped and token is provided, save it here as well (for safety)
      if (data.access_token && data.requires_code === false) {
        console.log('[Api] requestLoginCode: 2FA skipped, saving token...');
        this.setToken(data.access_token);
        console.log('[Api] requestLoginCode: Token saved');
        // Verify token was saved
        const savedToken = localStorage.getItem('token') || localStorage.getItem('access_token');
        console.log('[Api] requestLoginCode: Token verification - saved:', !!savedToken, 'length:', savedToken?.length || 0);
      }
      
      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('[Api] requestLoginCode exception:', error);
      console.error('[Api] requestLoginCode exception name:', error.name);
      console.error('[Api] requestLoginCode exception message:', error.message);
      
      // タイムアウトエラーの場合
      if (error.name === 'AbortError') {
        throw new Error('リクエストがタイムアウトしました。サーバーが応答していない可能性があります。');
      }
      
      // ネットワークエラーの場合
      if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('Failed to fetch'))) {
        throw new Error('サーバーに接続できませんでした。バックエンドサーバー（http://localhost:8000）が起動しているか確認してください。');
      }
      
      throw error;
    }
  }

  async verifyLoginCode(email: string, code: string): Promise<User> {
    console.log('[Api] verifyLoginCode called for:', email);
    console.log('[Api] verifyLoginCode baseURL:', this.baseURL);
    console.log('[Api] verifyLoginCode URL:', `${this.baseURL}/auth/login/verify-code`);
    
    try {
      const response = await fetch(`${this.baseURL}/auth/login/verify-code/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, code }),
      });

      console.log('[Api] verifyLoginCode response status:', response.status);
      console.log('[Api] verifyLoginCode response ok:', response.ok);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '認証コードの確認に失敗しました' }));
        console.error('[Api] verifyLoginCode error:', error);
        throw new Error(error.detail || '認証コードの確認に失敗しました');
      }

      const data = await response.json();
      console.log('[Api] verifyLoginCode response data:', data);
      console.log('[Api] verifyLoginCode access_token exists:', !!data.access_token);
      
      // Save token to localStorage
      if (data.access_token) {
        console.log('[Api] Saving token from verifyLoginCode...');
        this.setToken(data.access_token);
        console.log('[Api] Token saved after verifyLoginCode');
        // Verify token was saved
        const savedToken = localStorage.getItem('token') || localStorage.getItem('access_token');
        console.log('[Api] Token verification - saved:', !!savedToken, 'length:', savedToken?.length || 0);
      } else {
        console.error('[Api] verifyLoginCode: No access_token in response!');
      }
      
      // If user data is included in response, use it directly
      if (data.user) {
        const userData = data.user;
        const user: User = {
          id: String(userData.id),
          name: userData.name || '',
          email: userData.email || email,
          plan: userData.plan || 'FREE',
          organization: userData.organization || '',
        };
        console.log('[Api] verifyLoginCode returning user:', user);
        return user;
      }
      
      // Fallback: return user with email (should not happen)
      console.warn('[Api] verifyLoginCode: No user data in response, using fallback');
      return {
        id: '',
        name: '',
        email: email,
        plan: 'FREE',
        organization: '',
      };
    } catch (error: any) {
      console.error('[Api] verifyLoginCode exception:', error);
      // ネットワークエラーの場合
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('サーバーに接続できませんでした。バックエンドサーバー（http://localhost:8000）が起動しているか確認してください。');
      }
      throw error;
    }
  }

  async verifyEmail(token: string): Promise<{ message: string; verified: boolean }> {
    console.log('[Api] verifyEmail called with token:', token.substring(0, 10) + '...');
    
    try {
      const response = await fetch(`${this.baseURL}/auth/verify-email/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      console.log('[Api] verifyEmail response status:', response.status);

      // レスポンスの内容を先に取得
      let data;
      try {
        data = await response.json();
        console.log('[Api] verifyEmail response data:', data);
        console.log('[Api] verifyEmail response data type:', typeof data);
        console.log('[Api] verifyEmail response data keys:', Object.keys(data || {}));
        console.log('[Api] verifyEmail response data.verified:', data?.verified);
        console.log('[Api] verifyEmail response data.message:', data?.message);
      } catch (jsonError) {
        console.error('[Api] verifyEmail JSON parse error:', jsonError);
        const text = await response.text();
        console.error('[Api] verifyEmail response text:', text);
        throw new Error('サーバーからの応答を解析できませんでした。');
      }

      if (!response.ok) {
        // エラーレスポンスでも、既に認証済みの場合は成功として扱う
        if (data.detail && (data.detail.includes('既に確認済み') || data.detail.includes('already verified'))) {
          return {
            message: data.detail || 'このメールアドレスは既に確認済みです。',
            verified: true
          };
        }
        throw new Error(data.detail || 'メールアドレスの確認に失敗しました');
      }

      return data;
    } catch (error: any) {
      console.error('[Api] verifyEmail error:', error);
      // ネットワークエラーの場合
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('サーバーに接続できませんでした。ネットワーク接続を確認してください。');
      }
      throw error;
    }
  }

  /**
   * 共通のリクエストメソッド
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // エンドポイントが既にhttpで始まる場合はそのまま使用
    if (endpoint.startsWith('http')) {
      const response = await fetch(endpoint, {
        ...this.getFetchOptions(options),
        ...options,
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.handle401Error(response);
        }
        const error = await response.json().catch(() => ({ detail: 'リクエストに失敗しました' }));
        throw new Error(error.detail || 'リクエストに失敗しました');
      }

      return await response.json();
    }

    // baseURLに既に/apiが含まれているので、エンドポイントが/api/で始まる場合は/api/を削除
    let normalizedEndpoint = endpoint;
    if (normalizedEndpoint.startsWith('/api/')) {
      normalizedEndpoint = normalizedEndpoint.substring(4); // '/api/'を削除
    } else if (!normalizedEndpoint.startsWith('/')) {
      normalizedEndpoint = '/' + normalizedEndpoint; // 先頭に/がない場合は追加
    }

    // クエリパラメータを分離
    const [path, queryString] = normalizedEndpoint.split('?');
    
    // パスに末尾スラッシュを追加（既にスラッシュがある場合は追加しない）
    const pathWithSlash = path.endsWith('/') ? path : path + '/';
    
    // クエリパラメータがある場合は結合
    const finalEndpoint = queryString ? `${pathWithSlash}?${queryString}` : pathWithSlash;

    const url = `${this.baseURL}${finalEndpoint}`;
    const response = await fetch(url, {
      ...this.getFetchOptions(options),
      ...options,
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.handle401Error(response);
      }
      const error = await response.json().catch(() => ({ detail: 'リクエストに失敗しました' }));
      throw new Error(error.detail || 'リクエストに失敗しました');
    }

    return await response.json();
  }

  async getMe(): Promise<User> {
    const response = await this.request<User>('/users/me', {
      method: 'GET',
    });
    return response;
  }

  async updateMetaSettings(metaAccountId: string, metaAccessToken: string): Promise<{ message: string; meta_account_id: string | null }> {
    const response = await this.request<{ message: string; meta_account_id: string | null }>('/users/me/meta-settings', {
      method: 'PUT',
      body: JSON.stringify({
        meta_account_id: metaAccountId,
        meta_access_token: metaAccessToken
      }),
    });
    return response;
  }

  async startMetaOAuth(): Promise<void> {
    // OAuth認証を開始 - バックエンドからOAuth認証URLを取得してリダイレクト
    const response = await this.request<{ oauth_url: string }>('/meta/oauth/authorize-url', {
      method: 'GET',
    });
    
    if (response.oauth_url) {
      window.location.href = response.oauth_url;
    } else {
      throw new Error('OAuth認証URLを取得できませんでした');
    }
  }

  async getMetaSettings(): Promise<{ meta_account_id: string | null }> {
    const response = await this.request<{ meta_account_id: string | null }>('/users/me/meta-settings', {
      method: 'GET',
    });
    return response;
  }

  async getMetaAccounts(): Promise<{ accounts: Array<{ account_id: string; name: string; data_count: number; latest_date: string | null }>; total: number }> {
    const response = await this.request<{ accounts: Array<{ account_id: string; name: string; data_count: number; latest_date: string | null }>; total: number }>('/meta/accounts', {
      method: 'GET',
    });
    return response;
  }

  async register(email: string, password: string, name?: string): Promise<User> {
    const response = await fetch(`${this.baseURL}/auth/register/`, {
      method: 'POST',
      credentials: 'include',  // CORS credentials をサポート
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '登録に失敗しました');
    }
    
    const userData = await response.json();
    // Convert backend UserResponse to frontend User type
    return {
      id: String(userData.id),
      name: userData.name || '',
      email: userData.email,
      plan: userData.plan || 'FREE',
      organization: ''
    };
  }

  async login(email: string, password: string): Promise<User> {
    debugLogin('ログイン処理開始', {
      action: 'login',
      baseURL: this.baseURL,
      loginUrl: `${this.baseURL}/auth/login`,
      email: email.substring(0, 3) + '***' // セキュリティのためメールアドレスを一部マスク
    });
    
    // Force clear any existing token before login - ensure clean state
    this.clearToken();
    
    const loginUrl = `${this.baseURL}/auth/login/`;
    
    debugLogin('APIリクエスト送信', { action: 'beforeRequest' });
    
    let response: Response;
    try {
      // タイムアウト付きリクエスト（30秒に延長 - バックエンドの処理時間を考慮）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      try {
        response = await fetch(loginUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('ログイン処理がタイムアウトしました。バックエンドサーバー（http://localhost:8000）が起動しているか確認してください。');
        }
        // ネットワークエラーの場合、より詳細なメッセージを提供
        if (fetchError.message && (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError'))) {
          throw new Error('バックエンドサーバーに接続できません。サーバーが起動しているか確認してください（http://localhost:8000）。');
        }
        throw fetchError;
      }
      
      // 429エラー（レート制限）の場合は特別なメッセージを表示（レスポンスボディを読み取る前に処理）
      if (response.status === 429) {
        let errorMessage = '短時間に複数回のログインを確認しました。１分ほどお時間をあけてから再度ログインをお試しください。';
        try {
          // レスポンスボディからメッセージを取得を試みる
          const errorDetail = await response.json();
          if (errorDetail?.detail) {
            errorMessage = errorDetail.detail;
          }
        } catch (e) {
          // JSON解析に失敗した場合はデフォルトメッセージを使用
          console.warn('[ApiClient] Failed to parse 429 error response:', e);
        }
        debugLogin('ログイン失敗（レート制限）', {
          action: 'loginFailed',
          status: response.status,
          statusText: response.statusText,
          errorMessage,
          errorType: 'RATE_LIMIT_ERROR'
        });
        this.clearToken();
        // 429エラーのメッセージを明示的に投げる
        const rateLimitError = new Error(errorMessage);
        rateLimitError.name = 'RateLimitError';
        throw rateLimitError;
      }
      
      if (!response.ok) {
        let errorMessage = 'ログインに失敗しました';
        let errorDetail: any = null;
        try {
          errorDetail = await response.json();
          errorMessage = errorDetail.detail || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        
        debugLogin('ログイン失敗', {
          action: 'loginFailed',
          status: response.status,
          statusText: response.statusText,
          errorMessage,
          errorDetail,
          errorType: 'HTTP_ERROR'
        });
        
        this.clearToken();
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      if (!data.access_token) {
        this.clearToken();
        throw new Error('ログインに失敗しました。トークンの取得に失敗しました。');
      }
      
      // Set token
      this.setToken(data.access_token);
      
      // ログイン成功時は失敗カウントをリセット
      recentLoginFailures = [];
      
      // If user data is included in response, use it directly
      if (data.user) {
        const userData = data.user;
        const user = {
          id: String(userData.id),
          name: userData.name || '',
          email: userData.email,
          plan: userData.plan || 'FREE',
          organization: ''
        };
        
        debugLogin('ログイン成功', { action: 'loginSuccess' });
        return user;
      }
      
      // Fallback: fetch user data if not included in response
      const user = await this.getCurrentUser();
      debugLogin('ログイン成功', { action: 'loginSuccess' });
      return user;
    } catch (error: any) {
      debugLogin('ログインエラー', {
        action: 'loginError',
        errorMessage: error.message
      });
      
      this.clearToken();
      
      // 429エラー（レート制限）のメッセージが既に設定されている場合はそのまま投げる（最優先）
      if (error.message && (
          error.message.includes('短時間に複数回のログインを確認しました') || 
          error.message.includes('１分ほどお時間をあけて') ||
          error.name === 'RateLimitError'
        )) {
        debugLogin('429エラーメッセージを保持', {
          action: 'preserveRateLimitMessage',
          errorMessage: error.message,
          errorName: error.name
        });
        throw error;
      }
      
      // Handle network errors（429エラー以外のネットワークエラーのみ）
      // ただし、429エラーの可能性がある場合は429エラーメッセージを返す
      if (error.message && (
          error.message.includes('Failed to fetch') || 
          error.message.includes('NetworkError') || 
          error.name === 'TypeError'
        )) {
        // 429エラーの可能性をチェック（エラーメッセージやステータスコードから判断）
        const isRateLimitError = error.message?.includes('429') || 
                                 error.message?.includes('Too Many Requests') ||
                                 (error as any).status === 429 ||
                                 (error as any).response?.status === 429;
        
        // 短時間に複数回のログイン失敗をチェック（429エラーの可能性）
        const now = Date.now();
        recentLoginFailures = recentLoginFailures.filter(timestamp => now - timestamp < 60000); // 1分以内の失敗のみ
        recentLoginFailures.push(now);
        
        // 1分以内に3回以上失敗した場合は429エラーと判断
        if (recentLoginFailures.length >= 3 || isRateLimitError) {
          throw new Error('短時間に複数回のログインを確認しました。１分ほどお時間をあけてから再度ログインをお試しください。');
        }
        
        throw new Error('ログインエラー。１分ほどあけてから再度お試しください。');
      }
      
      // ログイン成功時は失敗カウントをリセット
      // （このコードは成功時には到達しないが、念のため）
      
      // その他のエラーはそのまま投げる
      if (error.message) {
        throw error;
      }
      throw new Error('ログインに失敗しました。');
    }
  }

  async getCurrentUser(): Promise<User> {
    debugLogin('ユーザー情報取得開始', {
      action: 'getCurrentUser',
      baseURL: this.baseURL,
      url: `${this.baseURL}/users/me`
    });
    
    // Always get the latest token from localStorage - single source of truth
    const token = this.getToken();
    if (!token) {
      debugLogin('トークンなしエラー（getCurrentUser）', {
        action: 'noTokenForGetCurrentUser'
      });
      this.clearToken();
      throw new Error('認証トークンが見つかりません');
    }
    
    debugLogin('APIリクエスト送信前（getCurrentUser）', {
      action: 'beforeGetCurrentUserRequest',
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 20) + '...'
    });
    
    let response: Response;
    try {
      const startTime = performance.now();
      response = await fetch(`${this.baseURL}/users/me/`, {
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders(),
      });
      const endTime = performance.now();
      
      debugLogin('APIリクエスト完了（getCurrentUser）', {
        action: 'afterGetCurrentUserRequest',
        status: response.status,
        statusText: response.statusText,
        responseTime: `${(endTime - startTime).toFixed(2)}ms`,
        ok: response.ok
      });
      
      if (!response.ok) {
        // 401エラーは統一処理
        if (response.status === 401) {
          this.handle401Error(response);
        }
        
        let errorDetail: any = null;
        try {
          errorDetail = await response.json();
        } catch (e) {
          // Ignore JSON parse errors
        }
        
        debugLogin('ユーザー情報取得失敗', {
          action: 'getCurrentUserFailed',
          status: response.status,
          statusText: response.statusText,
          errorDetail
        });
        
        throw new Error('ユーザー情報の取得に失敗しました');
      }
      
      const userData = await response.json();
      
      debugLogin('ユーザー情報取得成功', {
        action: 'getCurrentUserSuccess',
        userId: String(userData.id),
        userEmail: userData.email,
        userPlan: userData.plan
      });
      
      // Convert backend UserResponse to frontend User type
      return {
        id: String(userData.id),
        name: userData.name || '',
        email: userData.email,
        plan: userData.plan || 'FREE',
        organization: ''
      };
    } catch (error: any) {
      debugLogin('ユーザー情報取得エラー', {
        action: 'getCurrentUserError',
        errorType: error.constructor.name,
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack
      });
      throw error;
    }
  }

  async getCampaignDateRange(): Promise<{min_date: string | null, max_date: string | null, total_count: number}> {
    const token = this.getToken();
    if (!token) {
      throw new TokenExpiredError('認証が必要です');
    }
    
    try {
      const response = await fetch(`${this.baseURL}/campaigns/date-range/`, {
        credentials: 'include',
        headers: this.getHeaders(),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          this.handle401Error(response);
        }
        throw new Error(`Failed to get date range: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw error;
      }
      console.error('[ApiClient] Error getting date range:', error);
      throw error;
    }
  }

  async fetchCampaignData(metaAccountId?: string, startDate?: string, endDate?: string): Promise<CampaignData[]> {
    const token = this.getToken();
    if (!token) {
      console.warn("[ApiClient] No token available for fetchCampaignData");
      return [];
    }
    
    try {
      const allCampaigns: CampaignData[] = [];
      const limit = 1000; // バックエンドのlimit上限
      let offset = 0;
      let total = 0;
      let hasMore = true;
      
      console.log('[ApiClient] ===== Fetching all campaigns (with pagination) =====');
      console.log('[ApiClient] Parameters:', { metaAccountId, startDate, endDate });
      
      // ページネーションで全てのデータを取得
      while (hasMore) {
        const params = new URLSearchParams();
        if (metaAccountId) params.append('meta_account_id', metaAccountId);
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        params.append('limit', String(limit));
        params.append('offset', String(offset));
        
        const url = `${this.baseURL}/campaigns/?${params}`;
        console.log(`[ApiClient] Fetching page: offset=${offset}, limit=${limit}`);
        
        const response = await fetch(url, {
          credentials: 'include',  // CORS credentials をサポート
          headers: this.getHeaders(),
        });
        
        console.log('[ApiClient] Response status:', response.status, response.statusText);
        
        if (!response.ok) {
          // 401エラーは統一処理
          if (response.status === 401) {
            this.handle401Error(response);
          } else {
            const errorText = await response.text();
            console.error(`[ApiClient] Failed to fetch campaigns: ${response.status} ${response.statusText}`, errorText);
          }
          // If no campaigns found or error, return what we have so far
          break;
        }
        
        const result = await response.json();
        
        // 初回リクエストでtotalを取得
        if (offset === 0) {
          total = result.total || 0;
          console.log('[ApiClient] Total campaigns available:', total);
          if (total === 0) {
            console.warn('[ApiClient] Total is 0, but will continue to check if there is data');
          }
        }
        
        const campaigns = result.data || [];
        
        if (!Array.isArray(campaigns)) {
          console.warn("[ApiClient] Invalid campaigns response format:", result);
          break;
        }
        
        console.log(`[ApiClient] Fetched ${campaigns.length} campaigns (offset: ${offset}, total: ${total})`);
        
        // データが0件の場合は終了
        if (campaigns.length === 0) {
          console.log('[ApiClient] No more data: campaigns.length is 0');
          hasMore = false;
          break;
        }
        
        // Convert backend CampaignResponse to frontend CampaignData
        const convertedCampaigns = campaigns.map((c: any) => ({
          id: String(c.id),
          date: c.date,
          campaign_name: c.campaign_name,
          ad_set_name: c.ad_set_name || '',  // 広告セット名を追加
          ad_name: c.ad_name || '',  // 広告名を追加
          impressions: c.impressions,
          clicks: c.clicks,
          cost: Number(c.cost),
          conversions: c.conversions,
          conversion_value: Number(c.conversion_value),
          ctr: Number(c.ctr || 0),
          cpc: Number(c.cpc || 0),
          cpa: Number(c.cpa || 0),
          roas: Number(c.roas || 0),
          cpm: Number(c.cpm || 0),
          cvr: Number(c.cvr || 0),
          // Additional engagement metrics
          reach: Number(c.reach || 0),
          engagements: Number(c.engagements || 0),
          link_clicks: Number(c.link_clicks || 0),
          landing_page_views: Number(c.landing_page_views || 0)
        }));
        
        allCampaigns.push(...convertedCampaigns);
        
        // 次のページがあるかチェック
        // campaigns.length < limit の場合、これ以上データがない
        // allCampaigns.length >= total の場合、全て取得済み
        if (campaigns.length < limit) {
          console.log(`[ApiClient] No more data: fetched ${campaigns.length} campaigns (less than limit ${limit})`);
          hasMore = false;
        } else if (total > 0 && allCampaigns.length >= total) {
          console.log(`[ApiClient] All data fetched: ${allCampaigns.length} >= ${total}`);
          hasMore = false;
        } else {
          offset += limit;
          console.log(`[ApiClient] Continuing to next page: offset=${offset}, current count=${allCampaigns.length}, total=${total}`);
        }
      }
      
      console.log('[ApiClient] ===== All campaigns fetched =====');
      console.log('[ApiClient] Total campaigns fetched:', allCampaigns.length);
      console.log('[ApiClient] Expected total:', total);
      if (total > 0 && allCampaigns.length < total) {
        console.warn(`[ApiClient] WARNING: Fetched ${allCampaigns.length} campaigns but expected ${total}. Some data may be missing.`);
      }
      
      if (allCampaigns.length > 0) {
        console.log('[ApiClient] First campaign sample:', {
          campaign_name: allCampaigns[0].campaign_name,
          meta_account_id: (allCampaigns[0] as any).meta_account_id,
          date: allCampaigns[0].date
        });
      }
      
      return allCampaigns;
    } catch (error: any) {
      console.error("Failed to fetch campaigns:", error);
      
      // ネットワークエラーの場合は詳細をログ出力
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError') || error.name === 'TypeError') {
        console.error("[ApiClient] Network error when fetching campaigns. Token exists:", !!token);
        console.error("[ApiClient] Base URL:", this.baseURL);
        console.error("[ApiClient] Full URL:", `${this.baseURL}/campaigns`);
      }
      
      // Return empty array on error
      return [];
    }
  }

  async getCampaignSummary(startDate?: string, endDate?: string, metaAccountId?: string) {
    const token = this.getToken();
    if (!token) {
      console.warn("[ApiClient] No token available for getCampaignSummary");
      throw new Error('認証トークンがありません');
    }
    
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (metaAccountId) params.append('meta_account_id', metaAccountId);
      
      const response = await fetch(
        `${this.baseURL}/campaigns/summary?${params}`,
        { 
          credentials: 'include',  // CORS credentials をサポート
          headers: this.getHeaders() 
        }
      );
      
      if (!response.ok) {
        // 401エラーは統一処理
        if (response.status === 401) {
          this.handle401Error(response);
        }
        throw new Error(`サマリーの取得に失敗しました: ${response.status} ${response.statusText}`);
      }
      return response.json();
    } catch (error: any) {
      console.error("[ApiClient] Failed to fetch summary:", error);
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError') || error.name === 'TypeError') {
        console.error("[ApiClient] Network error when fetching summary. Token exists:", !!token);
      }
      throw error;
    }
  }

  async getCampaignTrends(startDate?: string, endDate?: string, groupBy = 'day', metaAccountId?: string) {
    const token = this.getToken();
    if (!token) {
      console.warn("[ApiClient] No token available for getCampaignTrends");
      throw new Error('認証トークンがありません');
    }
    
    try {
      const params = new URLSearchParams({ group_by: groupBy });
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (metaAccountId) params.append('meta_account_id', metaAccountId);
      
      const response = await fetch(
        `${this.baseURL}/campaigns/trends?${params}`,
        { 
          credentials: 'include',  // CORS credentials をサポート
          headers: this.getHeaders() 
        }
      );
      
      if (!response.ok) {
        // 401エラーは統一処理
        if (response.status === 401) {
          this.handle401Error(response);
        }
        throw new Error(`トレンドデータの取得に失敗しました: ${response.status} ${response.statusText}`);
      }
      return response.json();
    } catch (error: any) {
      console.error("[ApiClient] Failed to fetch trends:", error);
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError') || error.name === 'TypeError') {
        console.error("[ApiClient] Network error when fetching trends. Token exists:", !!token);
      }
      throw error;
    }
  }

  async getCampaignsByCampaign(startDate?: string, endDate?: string, limit = 10) {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const response = await fetch(
      `${this.baseURL}/campaigns/by-campaign?${params}`,
      { 
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders() 
      }
    );
    
    if (!response.ok) throw new Error('キャンペーンデータの取得に失敗しました');
    return response.json();
  }

  async getTopPerformers(metric = 'roas', limit = 5) {
    const params = new URLSearchParams({ metric, limit: limit.toString() });
    
    const response = await fetch(
      `${this.baseURL}/campaigns/top-performers?${params}`,
      { 
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders() 
      }
    );
    
    if (!response.ok) throw new Error('トップパフォーマーの取得に失敗しました');
    return response.json();
  }

  async getBottomPerformers(metric = 'roas', limit = 5) {
    const params = new URLSearchParams({ metric, limit: limit.toString() });
    
    const response = await fetch(
      `${this.baseURL}/campaigns/bottom-performers?${params}`,
      { 
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders() 
      }
    );
    
    if (!response.ok) throw new Error('低パフォーマーの取得に失敗しました');
    return response.json();
  }

  async uploadFile(file: File): Promise<{ success: boolean; rows: number; id: string; file_name: string; start_date: string; end_date: string; status: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const token = this.getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Note: Don't set Content-Type for FormData - browser will set it automatically with boundary
    const response = await fetch(`${this.baseURL}/uploads/`, {
      method: 'POST',
      credentials: 'include',  // CORS credentials をサポート
      headers: headers,
      body: formData,
    });

    if (!response.ok) {
      // 401エラーは統一処理
      if (response.status === 401) {
        this.handle401Error(response);
      }
      
      let errorMessage = 'アップロードに失敗しました。';
      try {
        const error = await response.json();
        errorMessage = error.detail || error.message || errorMessage;
      } catch (e) {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    return {
      success: true,
      rows: result.row_count,
      id: result.id,
      file_name: result.file_name,
      start_date: result.start_date,
      end_date: result.end_date,
      status: result.status
    };
  }

  async getUploads() {
    const response = await fetch(`${this.baseURL}/uploads/`, {
      credentials: 'include',  // CORS credentials をサポート
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      // 401エラーは統一処理
      if (response.status === 401) {
        this.handle401Error(response);
      }
      throw new Error('アップロード履歴の取得に失敗しました');
    }
    return response.json();
  }

  async createAnalysis(startDate?: string, endDate?: string, campaignName?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (campaignName) params.append('campaign_name', campaignName);
    
    const response = await fetch(
      `${this.baseURL}/analysis?${params}`,
      {
        method: 'POST',
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders(),
      }
    );
    
    if (!response.ok) {
      let errorMessage = 'Analysis creation failed';
      try {
        const error = await response.json();
        errorMessage = error.detail || error.message || errorMessage;
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }
    
    return response.json();
  }

  async getAnalyses() {
    const response = await fetch(`${this.baseURL}/analysis/`, {
      credentials: 'include',  // CORS credentials をサポート
      headers: this.getHeaders(),
    });
    
    if (!response.ok) throw new Error('分析履歴の取得に失敗しました');
    return response.json();
  }

  async getAnalysis(analysisId: string) {
    const response = await fetch(
      `${this.baseURL}/analysis/${analysisId}`,
      { 
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders() 
      }
    );
    
    if (!response.ok) throw new Error('分析の取得に失敗しました');
    return response.json();
  }

  async deleteAnalysis(analysisId: string) {
    const response = await fetch(
      `${this.baseURL}/analysis/${analysisId}`,
      {
        method: 'DELETE',
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders(),
      }
    );
    
    if (!response.ok) throw new Error('分析の削除に失敗しました');
    return response.json();
  }

  async pollAnalysisStatus(analysisId: string, maxAttempts = 60): Promise<any> {
    // Poll every 5 seconds for up to 5 minutes
    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetch(
        `${this.baseURL}/analysis/status/${analysisId}`,
        {
          credentials: 'include',
          headers: this.getHeaders(),
        }
      );
      
      if (!response.ok) {
        throw new Error(`分析ステータスの取得に失敗しました: ${response.status}`);
      }
      
      const status = await response.json();
      
      if (status.status === 'completed') {
        return status;
      } else if (status.status === 'error') {
        throw new Error(status.error_message || '分析中にエラーが発生しました');
      }
      
      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error('分析がタイムアウトしました。しばらくしてから再度お試しください。');
  }

  async downloadPDFReport(analysisId: string) {
    const response = await fetch(
      `${this.baseURL}/reports/pdf/${analysisId}`,
      { 
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders() 
      }
    );
    
    if (!response.ok) throw new Error('PDFの生成に失敗しました');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meta_ad_report_${analysisId}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  async downloadExcelReport(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const response = await fetch(
      `${this.baseURL}/reports/excel?${params}`,
      { 
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders() 
      }
    );
    
    if (!response.ok) throw new Error('Excelの生成に失敗しました');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = startDate && endDate ? `${startDate}_${endDate}` : new Date().toISOString().split('T')[0];
    a.download = `meta_ad_report_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  async downloadCSVReport(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const response = await fetch(
      `${this.baseURL}/reports/csv?${params}`,
      { 
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders() 
      }
    );
    
    if (!response.ok) throw new Error('CSVの生成に失敗しました');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = startDate && endDate ? `${startDate}_${endDate}` : new Date().toISOString().split('T')[0];
    a.download = `campaigns_report_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  // Teams
  async createTeam(name: string) {
    const response = await fetch(`${this.baseURL}/teams`, {
      method: 'POST',
      credentials: 'include',  // CORS credentials をサポート
      headers: this.getHeaders(),
      body: JSON.stringify({ name }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'チームの作成に失敗しました');
    }
    
    return response.json();
  }

  async getMyTeams() {
    const response = await fetch(`${this.baseURL}/teams`, {
      credentials: 'include',  // CORS credentials をサポート
      headers: this.getHeaders(),
    });
    
    if (!response.ok) throw new Error('チームの取得に失敗しました');
    return response.json();
  }

  async inviteTeamMember(teamId: string, email: string, role: string = 'member') {
    const response = await fetch(`${this.baseURL}/teams/${teamId}/invite`, {
      method: 'POST',
      credentials: 'include',  // CORS credentials をサポート
      headers: this.getHeaders(),
      body: JSON.stringify({ email, role }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'メンバーの招待に失敗しました');
    }
    
    return response.json();
  }

  async getTeamMembers(teamId: string) {
    const response = await fetch(`${this.baseURL}/teams/${teamId}/members`, {
      credentials: 'include',  // CORS credentials をサポート
      headers: this.getHeaders(),
    });
    
    if (!response.ok) throw new Error('チームメンバーの取得に失敗しました');
    return response.json();
  }

  async removeTeamMember(teamId: string, memberId: string) {
    const response = await fetch(`${this.baseURL}/teams/${teamId}/members/${memberId}`, {
      method: 'DELETE',
      credentials: 'include',  // CORS credentials をサポート
      headers: this.getHeaders(),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'メンバーの削除に失敗しました');
    }
    
    return response.json();
  }

  // Notifications
  async getNotifications(unreadOnly: boolean = false, limit: number = 20) {
    const params = new URLSearchParams({ 
      unread_only: unreadOnly.toString(),
      limit: limit.toString()
    });
    
    const response = await fetch(
      `${this.baseURL}/notifications/?${params}`,
      { 
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders() 
      }
    );
    
    if (!response.ok) throw new Error('通知の取得に失敗しました');
    return response.json();
  }

  async markNotificationRead(notificationId: string) {
    const response = await fetch(
      `${this.baseURL}/notifications/${notificationId}/read/`,
      {
        method: 'POST',
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders(),
      }
    );
    
    if (!response.ok) throw new Error('既読にする処理に失敗しました');
    return response.json();
  }

  async markAllNotificationsRead() {
    const response = await fetch(
      `${this.baseURL}/notifications/read-all/`,
      {
        method: 'POST',
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders(),
      }
    );
    
    if (!response.ok) throw new Error('すべて既読にする処理に失敗しました');
    return response.json();
  }

  async getUnreadNotificationCount() {
    const response = await fetch(
      `${this.baseURL}/notifications/unread-count/`,
      { 
        credentials: 'include',  // CORS credentials をサポート
        headers: this.getHeaders() 
      }
    );
    
    if (!response.ok) throw new Error('未読数の取得に失敗しました');
    return response.json();
  }

  async runAIAnalysis(campaigns: CampaignData[]): Promise<AIAnalysisResult> {
    // 1. Data Aggregation & Preparation
    if (!campaigns || campaigns.length === 0) {
      throw new Error("分析対象のデータがありません。");
    }

    const totalCost = campaigns.reduce((sum, c) => sum + c.cost, 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + c.impressions, 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0);
    const totalValue = campaigns.reduce((sum, c) => sum + c.conversion_value, 0);

    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgCpc = totalClicks > 0 ? totalCost / totalClicks : 0;
    const avgCpa = totalConversions > 0 ? totalCost / totalConversions : 0;
    const avgRoas = totalCost > 0 ? (totalValue / totalCost) * 100 : 0;
    const avgCvr = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    // Group by Campaign Name for Top/Bottom analysis
    const campaignStats: Record<string, any> = {};
    campaigns.forEach(c => {
      if (!campaignStats[c.campaign_name]) {
        campaignStats[c.campaign_name] = { 
          name: c.campaign_name, cost: 0, conversions: 0, value: 0 
        };
      }
      campaignStats[c.campaign_name].cost += c.cost;
      campaignStats[c.campaign_name].conversions += c.conversions;
      campaignStats[c.campaign_name].value += c.conversion_value;
    });

    const campaignList = Object.values(campaignStats).map((c: any) => ({
      ...c,
      roas: c.cost > 0 ? (c.value / c.cost) * 100 : 0,
      cpa: c.conversions > 0 ? c.cost / c.conversions : 0
    }));

    // Identify Top & Bottom Performers (by ROAS, minimum spend threshold)
    const activeCampaigns = campaignList.filter(c => c.cost > 1000); // Filter out very small spend
    activeCampaigns.sort((a, b) => b.roas - a.roas);
    const topCampaigns = activeCampaigns.slice(0, 3);
    const bottomCampaigns = activeCampaigns.slice(-3).reverse();

    // 2. Construct Prompt
    const prompt = `
あなたは世界トップクラスのMeta広告運用コンサルタントです。
以下の広告運用データを分析し、JSON形式で改善提案レポートを作成してください。

【分析期間データサマリー】
- 総費用: ¥${totalCost.toLocaleString()}
- 総CV数: ${totalConversions}
- 平均ROAS: ${avgRoas.toFixed(0)}%
- 平均CPA: ¥${avgCpa.toFixed(0)}
- 平均CTR: ${avgCtr.toFixed(2)}%
- 平均CVR: ${avgCvr.toFixed(2)}%

【高パフォーマンスキャンペーン (Top 3)】
${topCampaigns.map(c => `- ${c.name}: ROAS ${c.roas.toFixed(0)}%, CPA ¥${c.cpa.toFixed(0)}`).join('\n')}

【低パフォーマンスキャンペーン (Bottom 3)】
${bottomCampaigns.map(c => `- ${c.name}: ROAS ${c.roas.toFixed(0)}%, CPA ¥${c.cpa.toFixed(0)}`).join('\n')}

【依頼内容】
上記のデータを元に、以下の項目を含む詳細な分析を行ってください。
1. 総合評価 (1-5) とその理由
2. 具体的な課題（重要度付き）
3. 改善提案（難易度、優先度、期待効果付き）
4. アクションプラン（ステップバイステップ）

レスポンスは必ず指定されたJSONスキーマに従ってください。
`;

    // 3. Call OpenAI API
    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are an expert Meta advertising analyst. Always respond in valid JSON format.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000
      });

      const resultText = response.choices[0]?.message?.content;
      if (!resultText) {
         throw new Error("AIからの応答が空でした。");
      }

      const parsedResult = JSON.parse(resultText);
      
      return {
        id: `an_${Date.now()}`,
        date: new Date().toISOString(),
        ...parsedResult
      } as AIAnalysisResult;

    } catch (error) {
      console.error("AI Analysis Failed:", error);
      throw error; 
    }
  }

  async chatWithData(message: string, history: ChatMessage[], campaigns: CampaignData[]): Promise<string> {
    // 1. Prepare Data Context (16項目すべてを含む詳細なサマリー)
    if (!campaigns || campaigns.length === 0) {
      return "データがロードされていません。「データ管理」からデータをアップロードしてください。";
    }

    // 日付範囲を取得
    const dates = campaigns.map(c => new Date(c.date)).sort((a, b) => a.getTime() - b.getTime());
    const startDate = dates.length > 0 ? dates[0].toISOString().split('T')[0] : '';
    const endDate = dates.length > 0 ? dates[dates.length - 1].toISOString().split('T')[0] : '';

    // 基本指標を計算（16項目すべて）
    const totalCost = campaigns.reduce((sum, c) => sum + (c.cost || 0), 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);
    const totalValue = campaigns.reduce((sum, c) => sum + (c.conversion_value || 0), 0);
    const totalReach = campaigns.reduce((sum, c) => sum + (c.reach || 0), 0);
    const totalEngagements = campaigns.reduce((sum, c) => sum + (c.engagements || 0), 0);
    const totalLinkClicks = campaigns.reduce((sum, c) => sum + (c.link_clicks || 0), 0);
    const totalLandingPageViews = campaigns.reduce((sum, c) => sum + (c.landing_page_views || 0), 0);

    // 計算指標
    const avgRoas = totalCost > 0 ? (totalValue / totalCost * 100) : 0;
    const avgCpa = totalConversions > 0 ? (totalCost / totalConversions) : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    const cpc = totalClicks > 0 ? (totalCost / totalClicks) : 0;
    const cpm = totalImpressions > 0 ? (totalCost / totalImpressions * 1000) : 0;
    const cvr = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0;
    const frequency = totalReach > 0 ? (totalImpressions / totalReach) : 0;
    const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions * 100) : 0;

    // Group by Campaign Name
    const campaignStats: Record<string, any> = {};
    campaigns.forEach(c => {
      if (!campaignStats[c.campaign_name]) {
        campaignStats[c.campaign_name] = { 
          name: c.campaign_name,
          cost: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          value: 0,
          reach: 0,
          engagements: 0,
          link_clicks: 0,
          landing_page_views: 0
        };
      }
      campaignStats[c.campaign_name].cost += (c.cost || 0);
      campaignStats[c.campaign_name].impressions += (c.impressions || 0);
      campaignStats[c.campaign_name].clicks += (c.clicks || 0);
      campaignStats[c.campaign_name].conversions += (c.conversions || 0);
      campaignStats[c.campaign_name].value += (c.conversion_value || 0);
      campaignStats[c.campaign_name].reach += (c.reach || 0);
      campaignStats[c.campaign_name].engagements += (c.engagements || 0);
      campaignStats[c.campaign_name].link_clicks += (c.link_clicks || 0);
      campaignStats[c.campaign_name].landing_page_views += (c.landing_page_views || 0);
    });

    const campaignSummary = Object.values(campaignStats).map((c: any) => {
        const roas = c.cost > 0 ? (c.value / c.cost) * 100 : 0;
        const cpa = c.conversions > 0 ? c.cost / c.conversions : 0;
        const ctr_camp = c.impressions > 0 ? (c.clicks / c.impressions * 100) : 0;
        const cvr_camp = c.clicks > 0 ? (c.conversions / c.clicks * 100) : 0;
        return `${c.name}: 費用=¥${c.cost.toLocaleString()}, インプレッション=${c.impressions.toLocaleString()}, クリック=${c.clicks.toLocaleString()}, CV=${c.conversions}, コンバージョン価値=¥${c.value.toLocaleString()}, ROAS=${roas.toFixed(1)}%, CTR=${ctr_camp.toFixed(2)}%, CVR=${cvr_camp.toFixed(2)}%, CPA=¥${cpa.toFixed(0)}, リーチ=${c.reach.toLocaleString()}, エンゲージメント=${c.engagements.toLocaleString()}, リンククリック=${c.link_clicks.toLocaleString()}, LPビュー=${c.landing_page_views.toLocaleString()}`;
    }).join('\n');

    // 異常検知: 日別データをグループ化して異常を検出
    const dailyDataMap = new Map<string, {
      date: string;
      cost: number;
      impressions: number;
      clicks: number;
      conversions: number;
      conversion_value: number;
      cpa: number;
      roas: number;
    }>();

    campaigns.forEach(c => {
      const existing = dailyDataMap.get(c.date);
      if (existing) {
        existing.cost += (c.cost || 0);
        existing.impressions += (c.impressions || 0);
        existing.clicks += (c.clicks || 0);
        existing.conversions += (c.conversions || 0);
        existing.conversion_value += (c.conversion_value || 0);
      } else {
        dailyDataMap.set(c.date, {
          date: c.date,
          cost: c.cost || 0,
          impressions: c.impressions || 0,
          clicks: c.clicks || 0,
          conversions: c.conversions || 0,
          conversion_value: c.conversion_value || 0,
          cpa: 0,
          roas: 0
        });
      }
    });

    // 日別データを計算
    const dailyData = Array.from(dailyDataMap.values())
      .map(d => ({
        ...d,
        cpa: d.conversions > 0 ? d.cost / d.conversions : 0,
        roas: d.cost > 0 ? (d.conversion_value / d.cost * 100) : 0
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 異常検知ロジック（AnomalyDetectorと同じ）
    const incidents: Array<{
      date: string;
      type: string;
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
      metricValue: number;
      metricLabel: string;
      comparison: string;
    }> = [];

    if (dailyData.length >= 4) {
      const minWindowSize = 3;
      const maxWindowSize = 7;
      const windowSize = Math.min(
        maxWindowSize,
        Math.max(minWindowSize, Math.floor(dailyData.length / 2))
      );

      for (let i = windowSize; i < dailyData.length; i++) {
        const current = dailyData[i];
        const pastWindow = dailyData.slice(i - windowSize, i);

        const avgCpa = pastWindow.reduce((sum, d) => sum + (d.cpa || 0), 0) / windowSize;
        const avgRoas = pastWindow.reduce((sum, d) => sum + (d.roas || 0), 0) / windowSize;

        if (current.conversions < 2) continue;
        if (avgCpa <= 0 || avgRoas <= 0) continue;

        // CPA Spike
        if (current.cpa > avgCpa * 1.5) {
          const percentIncrease = Math.round((current.cpa - avgCpa) / avgCpa * 100);
          incidents.push({
            date: current.date,
            type: 'CPA急騰',
            severity: current.cpa > avgCpa * 2 ? 'HIGH' : 'MEDIUM',
            metricValue: current.cpa,
            metricLabel: 'CPA',
            comparison: `+${percentIncrease}% vs ${windowSize}日平均`
          });
        }

        // ROAS Drop
        if (current.roas < avgRoas * 0.7) {
          const percentDecrease = Math.round((avgRoas - current.roas) / avgRoas * 100);
          incidents.push({
            date: current.date,
            type: 'ROAS急落',
            severity: current.roas < avgRoas * 0.5 ? 'HIGH' : 'MEDIUM',
            metricValue: current.roas,
            metricLabel: 'ROAS',
            comparison: `-${percentDecrease}% vs ${windowSize}日平均`
          });
        }
      }
    }

    // 異常検知結果をフォーマット
    const anomalyReport = incidents.length > 0
      ? incidents.map(inc => 
          `- ${inc.date}: ${inc.type} (${inc.severity === 'HIGH' ? '高' : '中'}リスク) - ${inc.metricLabel}=${inc.metricValue.toFixed(inc.metricLabel === 'CPA' ? 0 : 2)}${inc.metricLabel === 'CPA' ? '円' : '%'}, ${inc.comparison}`
        ).join('\n')
      : '検出された異常はありません。';

    const systemInstruction = `
あなたはMeta広告運用の専門アシスタントAIです。
以下の広告運用データをコンテキストとして持っています。

【重要な指示】
- ユーザーの質問が広告データに関する内容の場合、提供されたデータに基づいて具体的かつ簡潔に回答してください。
- ユーザーの質問がシステムの使い方、機能説明、操作方法に関する内容の場合、「データにありません」と答えるのではなく、一般的な知識に基づいて親切に説明してください。
- システムの機能や使い方に関する質問には、以下の情報を参考に回答してください。

【このシステムの主要機能】
1. データ管理: CSV/Excelファイルをアップロードして広告データを管理
2. ダッシュボード: 16項目のKPIを表示、キャンペーン別の詳細パフォーマンス分析
3. AI分析レポート: データに基づいた改善提案、アクションプラン、主要課題の分析
4. 日別データ: 日別のデータテーブル表示、スプレッドシート連携
5. AI異常検知モニター: CPA急騰やROAS急落などの異常を自動検出
6. ファネル分析・ボトルネック診断: インプレッション→クリック→コンバージョンの流れを分析
7. 利益シミュレーター・損益分岐点分析: 利益率、損益分岐点ROAS/CPAを計算
8. スマートレポート生成: AIが自動でメール形式のレポートを生成
9. 予算最適化シミュレーター: 予算配分の最適化をシミュレーション
10. 予算管理・着地予想 (Pacing): 予算消化ペースの管理と予測
11. A/Bテストシミュレーター: A/Bテストの結果をシミュレーション
12. 広告コピー生成: AIが広告コピーを自動生成
13. クリエイティブ診断: 広告バナー画像の視覚的分析
14. LP分析・整合性: 広告とランディングページの整合性チェック
15. ポリシーチェック: Meta広告ポリシー違反の事前チェック
16. ターゲットペルソナ生成: 商品情報から最適なターゲットペルソナを生成
17. キーワード提案: SEOキーワードとハッシュタグの提案
18. 競合リサーチ: 競合分析と対策提案

【データに関する質問の場合】
データに含まれていない情報は「データにありません」と答えてください。

【データ期間】
開始日: ${startDate}
終了日: ${endDate}

【全体サマリー（基本指標）】
1. 総広告費: ¥${totalCost.toLocaleString()}
2. インプレッション数: ${totalImpressions.toLocaleString()}
3. クリック数: ${totalClicks.toLocaleString()}
4. コンバージョン数: ${totalConversions.toLocaleString()}
5. 総コンバージョン価値: ¥${totalValue.toLocaleString()}

【計算指標（パフォーマンス指標）】
6. ROAS: ${avgRoas.toFixed(2)}%
7. CTR: ${ctr.toFixed(2)}%
8. CVR: ${cvr.toFixed(2)}%
9. CPC: ¥${cpc.toFixed(2)}
10. CPA: ¥${avgCpa.toFixed(2)}
11. CPM: ¥${cpm.toFixed(2)}

【リーチ・エンゲージメント指標】
12. リーチ数: ${totalReach.toLocaleString()}
13. フリークエンシー: ${frequency.toFixed(2)}
14. エンゲージメント率: ${engagementRate.toFixed(2)}%
15. リンククリック数: ${totalLinkClicks.toLocaleString()}
16. LPビュー数: ${totalLandingPageViews.toLocaleString()}

【キャンペーン別データ】
${campaignSummary}

【AI異常検知モニター - 検出されたインシデント（${startDate}～${endDate}）】
${anomalyReport}
`;

    // 2. Prepare Contents (History + New Message)
    // Map internal ChatMessage type to API expected format
    const contents = history.map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
    }));

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // 3. Call API
    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      // Convert history to OpenAI format
      const messages = [
        { role: 'system' as const, content: systemInstruction },
        ...history.map(h => ({
          role: h.role === 'user' ? 'user' as const : 'assistant' as const,
          content: h.text
        })),
        { role: 'user' as const, content: message }
      ];
      
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000
      });
      
      return response.choices[0]?.message?.content || "申し訳ありません、回答を生成できませんでした。";
    } catch (error) {
      console.error("Chat API Error:", error);
      return "エラーが発生しました。もう一度お試しください。";
    }
  }

  async generateAdCopies(params: AdCopyParams): Promise<GeneratedAdCopy[]> {
    const prompt = `
あなたは熟練のダイレクトレスポンス・コピーライターです。
Meta広告（Facebook/Instagram）で使用する広告コピー（テキストと見出し）を3つ作成してください。

【商品・サービス情報】
- 商品名: ${params.productName}
- ターゲット: ${params.targetAudience}
- 訴求ポイント: ${params.sellingPoints}
- トーン&マナー: ${params.tone}

【要件】
- 読者の興味を惹きつけ、アクション（クリック）を促す内容にすること。
- プラットフォームの特性（スマホで流し見される）を考慮し、短くインパクトのある文章にすること。
- 「見出し(Headline)」は短く強力に。
- 「本文(Primary Text)」は共感、ベネフィット、CTA（Call To Action）を含めること。
- 各案について、なぜそのコピーが効果的かの「解説」も付けること。

レスポンスは以下のJSON形式で返してください。必ず配列形式で返してください。
`;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are an expert copywriter. Always respond in valid JSON format. You must return a JSON object with a "copies" key containing an array of ad copies.' },
          { role: 'user', content: prompt + '\n\nレスポンスは必ず以下のJSON形式で返してください（json_object形式のため、オブジェクトでラップしてください）:\n{"copies": [{"headline": "...", "primaryText": "...", "explanation": "..."}, {"headline": "...", "primaryText": "...", "explanation": "..."}, {"headline": "...", "primaryText": "...", "explanation": "..."}]}\n\n必ず3つのコピー案を含めてください。' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 2000
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("生成に失敗しました。");
      
      // Debug: Log response (only in development)
      if (import.meta.env.DEV) {
        console.log('[AdGenerator] API Response:', text);
      }
      
      const parsed = JSON.parse(text);
      
      // 配列が直接返ってきた場合
      if (Array.isArray(parsed)) {
        return parsed as GeneratedAdCopy[];
      }
      
      // オブジェクトでラップされている場合
      if (parsed.copies && Array.isArray(parsed.copies)) {
        return parsed.copies as GeneratedAdCopy[];
      }
      
      if (parsed.adCopies && Array.isArray(parsed.adCopies)) {
        return parsed.adCopies as GeneratedAdCopy[];
      }
      
      // その他の形式の場合、エラーを投げる
      console.error('[AdGenerator] Unexpected response format:', parsed);
      throw new Error("予期しないレスポンス形式です。");

    } catch (error: any) {
      console.error("Ad Copy Generation Failed:", error);
      const errorMessage = error?.message || '生成中にエラーが発生しました。';
      throw new Error(errorMessage);
    }
  }

  async analyzeCompetitor(name: string, industry: string, url?: string): Promise<CompetitorAnalysisResult> {
    const prompt = `
あなたはマーケティング戦略の専門家です。
以下の競合企業について分析を行い、SWOT分析、ターゲット層、広告戦略、対抗策をまとめてください。

【分析対象】
- 企業・ブランド名: ${name}
- 業種: ${industry}
${url ? `- 参考URL: ${url}` : ''}

【要件】
- 一般的な知識に基づいて推定・分析してください。
- 特にデジタルマーケティングや広告戦略の観点を含めてください。
- JSON形式で出力してください。

レスポンスは指定されたJSONスキーマに従ってください。
`;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a marketing strategy expert. Always respond in valid JSON format.' },
          { role: 'user', content: prompt + '\n\nレスポンスは以下のJSON形式で返してください:\n{"competitorName": "...", "swot": {"strengths": [...], "weaknesses": [...], "opportunities": [...], "threats": [...]}, "targetAudience": "...", "adStrategy": "...", "counterStrategy": "..."}' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("生成に失敗しました。");

      return JSON.parse(text) as CompetitorAnalysisResult;
    } catch (error) {
      console.error("Competitor Analysis Failed:", error);
      throw error;
    }
  }

  async generatePersonas(productName: string, productDescription: string): Promise<TargetPersona[]> {
    const prompt = `
あなたはデジタルマーケティングの専門家です。
以下の商品・サービス情報に基づき、Meta広告（Facebook/Instagram）でターゲットとすべき具体的な「ペルソナ」を3パターン作成してください。
それぞれ全く異なる属性やニーズを持つ人物像にしてください。

【商品・サービス】
- 名称: ${productName}
- 概要: ${productDescription}

【要件】
- JSON形式で配列として出力すること。
- 「metaTargeting」には、広告セットの設定で実際に使える興味・関心タグ（例: "デジタルマーケティング", "ヨガ", "起業"など）を具体的に5つ以上挙げてください。
- 「painPoints」はその人が抱えている悩み、「motivations」はその人が商品を購入する動機です。
- すべてのフィールド（label、demographics、psychographics、metaTargeting）は必ず日本語で記述してください。

レスポンスは必ず日本語で返してください。すべての説明、ペルソナ名、属性、悩み、興味、ターゲティングキーワードは日本語で記述してください。
`;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: 'あなたはデジタルマーケティングの専門家です。常に有効なJSON形式で日本語で応答してください。すべてのペルソナ情報（名前、属性、悩み、興味、ターゲティングキーワード）は必ず日本語で記述してください。' 
          },
          { 
            role: 'user', 
            content: prompt + '\n\nレスポンスは必ず以下のJSON形式で日本語で返してください（json_object形式のため、オブジェクトでラップしてください）:\n{\n  "personas": [\n    {\n      "label": "ペルソナ名（日本語）",\n      "demographics": {\n        "age": "年齢（日本語）",\n        "gender": "性別（日本語）",\n        "occupation": "職業（日本語）",\n        "income": "収入イメージ（日本語）"\n      },\n      "psychographics": {\n        "painPoints": ["悩み1（日本語）", "悩み2（日本語）", ...],\n        "motivations": ["動機1（日本語）", "動機2（日本語）", ...],\n        "interests": ["興味1（日本語）", "興味2（日本語）", ...]\n      },\n      "metaTargeting": ["キーワード1（日本語）", "キーワード2（日本語）", ...]\n    },\n    ...\n  ]\n}\n\n重要: すべてのフィールド（label、demographics内のすべて、psychographics内のすべて、metaTargeting）は必ず日本語で記述してください。' 
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2500
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("生成に失敗しました。");

      // Debug: Log response (only in development)
      if (import.meta.env.DEV) {
        console.log('[PersonaBuilder] API Response:', text);
      }

      const parsed = JSON.parse(text);
      
      // レスポンス形式の検証と配列の抽出
      let personas: TargetPersona[] = [];
      if (Array.isArray(parsed)) {
        personas = parsed;
      } else if (parsed.personas && Array.isArray(parsed.personas)) {
        personas = parsed.personas;
      } else if (parsed.data && Array.isArray(parsed.data)) {
        personas = parsed.data;
      } else {
        console.error('[PersonaBuilder] Invalid response format:', parsed);
        throw new Error("レスポンス形式が不正です。");
      }

      return personas as TargetPersona[];
    } catch (error) {
      console.error("Persona Generation Failed:", error);
      throw error;
    }
  }

  async suggestKeywords(productName: string, description: string): Promise<KeywordSuggestionResult> {
    const prompt = `
あなたはSEOおよびソーシャルメディアマーケティングの専門家です。
以下の商品・サービスについて、効果的な「SEOキーワード」「Instagramハッシュタグ」「除外キーワード」を提案してください。

【商品・サービス】
- 名称: ${productName}
- 概要: ${description}

【要件】
- SEOキーワード: 「ビッグワード（検索ボリューム大）」と「ロングテール（具体的・購買意欲高）」に分けて提案。
- ハッシュタグ: 「人気（投稿数多）」と「ニッチ（特定の層に届く）」に分けて提案。日本語のハッシュタグを中心にしてください。
- 除外キーワード: リスティング広告やMeta広告で、無駄なクリックを防ぐために除外すべきキーワード（例: 「無料」「格安」「とは」など、コンバージョンにつながりにくい語句）。

レスポンスは指定されたJSONスキーマに従ってください。
`;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are an SEO and social media marketing expert. Always respond in valid JSON format.' },
          { role: 'user', content: prompt + '\n\nレスポンスは以下のJSON形式で返してください:\n{"seoKeywords": {"highVolume": [...], "longTail": [...]}, "hashtags": {"popular": [...], "niche": [...]}, "negativeKeywords": [...]}' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("生成に失敗しました。");

      return JSON.parse(text) as KeywordSuggestionResult;
    } catch (error) {
      console.error("Keyword Suggestion Failed:", error);
      throw error;
    }
  }

  async analyzeCreative(file: File): Promise<CreativeAnalysisResult> {
    // 1. Convert file to Base64
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
         // remove data:image/png;base64, prefix
         const result = reader.result as string;
         const base64String = result.includes(',') ? result.split(',')[1] : result;
         resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const prompt = `
あなたはプロフェッショナルな広告クリエイティブディレクターです。
提供された広告バナー画像を視覚的に分析し、デザインの有効性を診断してください。

【評価項目】
1. 視覚的インパクト (Visual Impact): タイムラインで目を引くか？
2. テキストの読みやすさ (Text Readability): フォントサイズ、コントラスト、情報量は適切か？
3. CTAの明確さ (CTA Clarity): 次のアクション（ボタン等）がわかりやすいか？
4. 総合評価 (Overall Score): 10点満点での総合スコア

【出力要件】
- 各項目を10点満点で採点してください。
- 具体的な「強み (Strengths)」と「改善点 (Improvements)」を3つ以上挙げてください。
- 最後にプロフェッショナルな視点での「総評 (Critique)」を記述してください。

レスポンスは必ず以下のJSON形式で返してください（json_object形式のため、オブジェクトで返してください）:
{
  "scores": {
    "visualImpact": 8,
    "textReadability": 7,
    "ctaClarity": 9,
    "overall": 8
  },
  "strengths": ["強み1", "強み2", "強み3"],
  "improvements": ["改善点1", "改善点2", "改善点3"],
  "critique": "総評テキスト"
}
`;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a professional advertising creative director. Always respond in valid JSON format. You must return a JSON object with the exact structure: {"scores": {"visualImpact": number, "textReadability": number, "ctaClarity": number, "overall": number}, "strengths": string[], "improvements": string[], "critique": string}'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${file.type};base64,${base64Data}`
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("分析に失敗しました。");

      // Debug: Log response (only in development)
      if (import.meta.env.DEV) {
        console.log('[CreativeDiagnostic] API Response:', text);
      }

      const parsed = JSON.parse(text);
      
      // レスポンス形式の検証
      if (!parsed.scores || typeof parsed.scores !== 'object') {
        console.error('[CreativeDiagnostic] Invalid response format - missing scores:', parsed);
        throw new Error("レスポンス形式が不正です。scoresが含まれていません。");
      }
      
      if (!parsed.scores.overall && parsed.scores.overall !== 0) {
        console.error('[CreativeDiagnostic] Invalid response format - missing overall score:', parsed);
        throw new Error("レスポンス形式が不正です。overallスコアが含まれていません。");
      }
      
      // デフォルト値で補完
      const result: CreativeAnalysisResult = {
        scores: {
          visualImpact: parsed.scores?.visualImpact ?? 0,
          textReadability: parsed.scores?.textReadability ?? 0,
          ctaClarity: parsed.scores?.ctaClarity ?? 0,
          overall: parsed.scores?.overall ?? 0
        },
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
        critique: parsed.critique || '分析結果が取得できませんでした。'
      };
      
      return result;
    } catch (error) {
      console.error("Creative Analysis Failed:", error);
      throw error;
    }
  }

  async checkAdPolicy(text: string): Promise<PolicyCheckResult> {
    const prompt = `
あなたはMeta（Facebook/Instagram）広告ポリシーの専門家です。
提供された広告テキストを分析し、ポリシー違反の可能性をチェックしてください。

【チェック項目】
- 個人属性に関する言及（人種、年齢、信念、医療状態などへの直接的な言及。例：「糖尿病ですか？」はNG）
- 誇大広告（非現実的な結果、「ビフォー・アフター」、過度な約束）
- アダルトコンテンツ・性的示唆
- 扇動的なコンテンツ・ショッキングな表現
- 不適切な言葉遣い・文法・句読点の乱用
- マルチレベルマーケティング（MLM）スキーム

広告テキスト: "${text}"

レスポンスは必ず日本語で返してください。すべての説明、コメント、提案は日本語で記述してください。
    `;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: 'あなたはMeta（Facebook/Instagram）広告ポリシーの専門家です。常に有効なJSON形式で日本語で応答してください。すべての説明、コメント、提案は日本語で記述してください。' 
          },
          { 
            role: 'user', 
            content: prompt + '\n\nレスポンスは必ず以下のJSON形式で日本語で返してください:\n{\n  "status": "SAFE|WARNING|DANGER",\n  "safetyScore": 0-100,\n  "violations": [\n    {\n      "segment": "問題のあるテキスト部分（日本語）",\n      "category": "ポリシーカテゴリ名（日本語）",\n      "reason": "違反理由（日本語）",\n      "suggestion": "より安全な書き換え案（日本語）",\n      "severity": "HIGH|MEDIUM|LOW"\n    }\n  ],\n  "overallComment": "分析の要約（日本語）"\n}\n\n重要: overallComment、violations内のすべてのフィールド（segment、category、reason、suggestion）は必ず日本語で記述してください。' 
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000
      });

      const resultText = response.choices[0]?.message?.content;
      if (!resultText) throw new Error("解析に失敗しました。");

      // Debug: Log response (only in development)
      if (import.meta.env.DEV) {
        console.log('[PolicyChecker] API Response:', resultText);
      }

      const parsed = JSON.parse(resultText);
      
      // レスポンス形式の検証とデフォルト値の補完
      const result: PolicyCheckResult = {
        status: parsed.status || 'SAFE',
        safetyScore: parsed.safetyScore ?? 100,
        violations: Array.isArray(parsed.violations) ? parsed.violations : [],
        overallComment: parsed.overallComment || '分析結果が取得できませんでした。'
      };

      return result;

    } catch (error) {
      console.error("Policy Check Failed:", error);
      throw error;
    }
  }

  async runABTestAnalysis(variantA: ABTestInput, variantB: ABTestInput): Promise<ABTestResult> {
    const prompt = `
      あなたはデータサイエンスとデジタルマーケティングの専門家です。
      以下のMeta広告のA/Bテスト結果（A: コントロール、B: テスト）を分析してください。

      【パターンA (コントロール)】
      - Impressions: ${variantA.impressions}
      - Clicks: ${variantA.clicks}
      - Conversions: ${variantA.conversions}
      - Cost: ${variantA.cost}
      - Value: ${variantA.conversionValue}

      【パターンB (テスト)】
      - Impressions: ${variantB.impressions}
      - Clicks: ${variantB.clicks}
      - Conversions: ${variantB.conversions}
      - Cost: ${variantB.cost}
      - Value: ${variantB.conversionValue}

      【依頼内容】
      1. CTR, CVR, CPA, ROASなどの主要指標を計算してください。
      2. 統計的な観点から「有意差」があるかどうかを判断し、勝者を決定してください。（サンプルサイズが少ない場合は「判定不能(DRAW)」としてください）。
      3. 「confidenceScore」には、確信度（例: "95%有意", "有意差なし", "データ不足"など）を記述してください。
      4. 最も改善が見られた指標があれば「improvement」に記載してください。
      5. マーケター向けに、この結果を踏まえた「分析コメント」と「具体的な推奨アクション」を日本語で作成してください。

      レスポンスは指定されたJSONスキーマに従ってください。
    `;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a data science and digital marketing expert. Always respond in valid JSON format.' },
          { role: 'user', content: prompt + '\n\nレスポンスは以下のJSON形式で返してください:\n{"winner": "A|B|DRAW", "confidenceScore": "...", "metricsA": {"ctr": ..., "cvr": ..., "cpa": ..., "roas": ...}, "metricsB": {"ctr": ..., "cvr": ..., "cpa": ..., "roas": ...}, "improvement": {"metric": "...", "value": "..."}, "analysis": "...", "recommendation": "..."}' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
        max_tokens: 2000
      });

      const resultText = response.choices[0]?.message?.content;
      if (!resultText) throw new Error("解析に失敗しました。");

      return JSON.parse(resultText) as ABTestResult;

    } catch (error) {
      console.error("AB Test Analysis Failed:", error);
      throw error;
    }
  }

  async analyzeBudgetPacing(campaignName: string, currentSpend: number, targetBudget: number, daysElapsed: number, daysRemaining: number): Promise<BudgetPacingResult> {
    // 1. Calculate Pacing Metrics
    const dailyAvg = daysElapsed > 0 ? currentSpend / daysElapsed : 0;
    const forecastedSpend = currentSpend + (dailyAvg * daysRemaining);
    const pacingPercentage = targetBudget > 0 ? (forecastedSpend / targetBudget) * 100 : 0;
    const recommendedDailyBudget = daysRemaining > 0 ? Math.max(0, (targetBudget - currentSpend) / daysRemaining) : 0;

    let status: 'ON_TRACK' | 'OVERSPEND' | 'UNDERSPEND' = 'ON_TRACK';
    if (pacingPercentage > 105) status = 'OVERSPEND';
    if (pacingPercentage < 95) status = 'UNDERSPEND';

    // 2. Ask Gemini for Strategy
    const prompt = `
      あなたはプロの広告運用コンサルタントです。
      以下の予算消化状況に基づいて、今後の運用戦略と具体的なアドバイスを提示してください。

      【キャンペーン情報】
      - キャンペーン名: ${campaignName}
      - 目標月次予算: ¥${targetBudget.toLocaleString()}
      - 現在の消化額: ¥${currentSpend.toLocaleString()} (${daysElapsed}日経過)
      - 残り日数: ${daysRemaining}日
      - 現在の着地予想: ¥${forecastedSpend.toLocaleString()} (対目標 ${pacingPercentage.toFixed(1)}%)
      - ステータス: ${status === 'OVERSPEND' ? '超過ペース (Overspending)' : status === 'UNDERSPEND' ? '消化不足ペース (Underspending)' : '順調 (On Track)'}

      【依頼内容】
      1. 「advice」: 現在の状況に対する短いコメント（1行程度）。
      2. 「strategy」: 残り期間で予算を適切に着地させ、かつパフォーマンスを最大化するための具体的な戦略（箇条書きで3点ほど）。
      
      レスポンスは指定されたJSONスキーマに従ってください。
    `;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a professional advertising operations consultant. Always respond in valid JSON format.' },
          { role: 'user', content: prompt + '\n\nレスポンスは以下のJSON形式で返してください:\n{"advice": "...", "strategy": "..."}' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1000
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("戦略生成に失敗しました。");
      const aiResult = JSON.parse(text);

      return {
        campaignName,
        currentSpend,
        targetBudget,
        forecastedSpend,
        pacingPercentage,
        daysRemaining,
        recommendedDailyBudget,
        status,
        advice: aiResult.advice,
        strategy: aiResult.strategy
      };

    } catch (error) {
      console.error("Budget Analysis Failed:", error);
      // Fallback if AI fails
      return {
        campaignName,
        currentSpend,
        targetBudget,
        forecastedSpend,
        pacingPercentage,
        daysRemaining,
        recommendedDailyBudget,
        status,
        advice: "AI分析に失敗しました。",
        strategy: "手動で日予算を調整してください。"
      };
    }
  }

  async analyzeLP(adText: string, lpText: string): Promise<LPAnalysisResult> {
    const prompt = `
      あなたはCRO（コンバージョン率最適化）の専門家です。
      広告コピーとランディングページ（LP）のコンテンツを比較し、「メッセージの一貫性（Message Match）」を診断してください。
      一貫性が低いと、ユーザーはLPに到達した直後に離脱してしまいます。

      【広告コピー】
      ${adText}

      【LPコンテンツ (主なテキスト)】
      ${lpText.substring(0, 5000)} // Truncate to avoid token limits

      【依頼内容】
      1. 「score」: 0〜100点での一貫性スコア。
      2. 「consistencyRating」: 総合評価 (EXCELLENT, GOOD, AVERAGE, POOR)。
      3. 「matchingPoints」: 広告とLPでしっかり合致している訴求・キーワード（3つ程度）。
      4. 「mismatchingPoints」: 広告で期待させたのにLPで見当たらない、または表現がズレている点（3つ程度）。
      5. 「suggestions」: 一貫性を高め、CVRを向上させるための具体的なLP修正案（3つ程度）。
      6. 「critique」: 全体的な総評コメント。

      レスポンスは指定されたJSONスキーマに従ってください。
    `;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a CRO (Conversion Rate Optimization) expert. Always respond in valid JSON format.' },
          { role: 'user', content: prompt + '\n\nレスポンスは以下のJSON形式で返してください:\n{"score": 0-100, "consistencyRating": "EXCELLENT|GOOD|AVERAGE|POOR", "matchingPoints": [...], "mismatchingPoints": [...], "suggestions": [...], "critique": "..."}' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("解析に失敗しました。");

      return JSON.parse(text) as LPAnalysisResult;

    } catch (error) {
      console.error("LP Analysis Failed:", error);
      throw error;
    }
  }

  async generateSmartReport(data: CampaignData[], config: ReportConfig, selectedYear: number | null = null): Promise<string> {
    // dataは既にSmartReportGeneratorでフィルタリングされているので、そのまま使用
    if (data.length === 0) {
      throw new Error("データがありません。");
    }
    
    // 期間の表示用に、実際のデータ範囲を取得
    const parseDate = (dateStr: string): Date => {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      }
      return new Date(dateStr);
    };
    
    const allDates = data.map(d => d.date).sort();
    const actualStartDate = parseDate(allDates[0]);
    const actualEndDate = parseDate(allDates[allDates.length - 1]);
    
    // Use actual current date for period display calculations
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let startDate: Date;
    let endDate: Date;
    
    if (config.periodType === 'all') {
      // 年別選択の場合
      if (selectedYear !== null) {
        // 選択された年の1月1日から12月31日まで
        startDate = new Date(selectedYear, 0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
      } else {
        // 全期間選択の場合 - 実際のデータ範囲を使用
        startDate = actualStartDate;
        startDate.setHours(0, 0, 0, 0);
        endDate = actualEndDate;
        endDate.setHours(23, 59, 59, 999);
      }
    } else if (config.periodType === 'last7days') {
      // ダッシュボードと同じ: 昨日を含めて過去7日間
      // 開始日 = 昨日 - (7 - 1) = 昨日 - 6日
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1); // 昨日
      yesterday.setHours(23, 59, 59, 999); // 昨日の23:59:59
      
      endDate = new Date(yesterday);
      endDate.setHours(23, 59, 59, 999);
      startDate = new Date(yesterday);
      startDate.setDate(yesterday.getDate() - (7 - 1));
      startDate.setHours(0, 0, 0, 0);
    } else if (config.periodType === 'last30days') {
      // ダッシュボードと同じ: 昨日を含めて過去30日間
      // 開始日 = 昨日 - (30 - 1) = 昨日 - 29日
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1); // 昨日
      yesterday.setHours(23, 59, 59, 999); // 昨日の23:59:59
      
      endDate = new Date(yesterday);
      endDate.setHours(23, 59, 59, 999);
      startDate = new Date(yesterday);
      startDate.setDate(yesterday.getDate() - (30 - 1));
      startDate.setHours(0, 0, 0, 0);
    } else if (config.periodType === 'thisMonth') {
      // 今月の1日から今日まで
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
    } else if (config.periodType === 'lastMonth') {
      // 先月の1日から月末まで
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999); // End of last month
    } else {
      // デフォルト: 実際のデータ範囲
      startDate = actualStartDate;
      endDate = actualEndDate;
    }
    
    // データは既にフィルタリングされているので、そのまま使用
    const filteredData = data;

    // 期間表示用の日付（last7daysとlast30daysの場合は計算した日付範囲をそのまま使用）
    // ダッシュボードと同じ計算方法を使用しているため、計算した日付範囲をそのまま使用
    // データが存在しない日付範囲でも、計算した範囲を表示することでダッシュボードと一致させる
    if (config.periodType === 'last7days' || config.periodType === 'last30days') {
      // 計算した日付範囲をそのまま使用（ダッシュボードと同じ）
      // startDateとendDateは既に正しく計算されているので、そのまま使用
      // ただし、表示用には時刻を0に設定（日付のみ）
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);
    }

    // 2. Aggregate Stats - ダッシュボードの16項目全てを計算
    // 数値変換を明示的に行い、undefined/nullを0に変換
    const totalCost = filteredData.reduce((sum, c) => sum + (Number(c.cost) || 0), 0);
    const totalImpressions = filteredData.reduce((sum, c) => sum + (Number(c.impressions) || 0), 0);
    const totalClicks = filteredData.reduce((sum, c) => sum + (Number(c.clicks) || 0), 0);
    const totalConversions = filteredData.reduce((sum, c) => sum + (Number(c.conversions) || 0), 0);
    const totalValue = filteredData.reduce((sum, c) => sum + (Number(c.conversion_value) || 0), 0);
    const totalReach = filteredData.reduce((sum, c) => sum + (Number(c.reach) || 0), 0);
    const totalEngagements = filteredData.reduce((sum, c) => sum + (Number(c.engagements) || 0), 0);
    const totalLinkClicks = filteredData.reduce((sum, c) => sum + (Number(c.link_clicks) || 0), 0);
    const totalLandingPageViews = filteredData.reduce((sum, c) => sum + (Number(c.landing_page_views) || 0), 0);
    
    // 計算指標（16項目すべてを計算）
    const avgRoas = totalCost > 0 ? (totalValue / totalCost) * 100 : 0;
    const avgCpa = totalConversions > 0 ? totalCost / totalConversions : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    const cpc = totalClicks > 0 ? (totalCost / totalClicks) : 0;
    const cpm = totalImpressions > 0 ? (totalCost / totalImpressions * 1000) : 0;
    const cvr = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0;
    const frequency = totalReach > 0 ? (totalImpressions / totalReach) : 0;
    const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions * 100) : 0;

    const topCampaign = [...filteredData].sort((a, b) => b.conversion_value - a.conversion_value)[0];

    // Yearly aggregation for 'all' period type (全期間選択時のみ、かつ複数年のデータがある場合)
    let yearlyStats = null;
    if (config.periodType === 'all' && selectedYear === null) {
      const years = new Set(filteredData.map(d => new Date(d.date).getFullYear()));
      // 複数年のデータがある場合のみ年別集計を表示
      if (years.size > 1) {
        const yearlyData: Record<number, { cost: number; conversions: number; value: number }> = {};
        
        filteredData.forEach(d => {
          const year = new Date(d.date).getFullYear();
          if (!yearlyData[year]) {
            yearlyData[year] = { cost: 0, conversions: 0, value: 0 };
          }
          yearlyData[year].cost += d.cost;
          yearlyData[year].conversions += d.conversions;
          yearlyData[year].value += d.conversion_value;
        });
        
        yearlyStats = Object.entries(yearlyData)
          .map(([year, stats]) => ({
            year: parseInt(year),
            cost: stats.cost,
            conversions: stats.conversions,
            value: stats.value,
            roas: stats.cost > 0 ? (stats.value / stats.cost) * 100 : 0,
            cpa: stats.conversions > 0 ? stats.cost / stats.conversions : 0
          }))
          .sort((a, b) => a.year - b.year);
      }
    }

    // 3. Prompt OpenAI
    const isExecutiveSummary = config.format === 'executive_summary';
    const language = isExecutiveSummary ? 'English' : 'Japanese';
    const formatName = config.format === 'client_email' 
      ? 'クライアント向け報告メール (Client Report Email)' 
      : config.format === 'internal_slack' 
      ? '社内Slack用速報 (Internal Slack Update)' 
      : '役員向けエグゼクティブサマリー (Executive Summary)';
    
    // 期間の表示用文字列を生成
    const formatDateForDisplay = (date: Date): string => {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${year}年${month}月${day}日`;
    };
    
    const startDateStr = formatDateForDisplay(startDate);
    const endDateStr = formatDateForDisplay(endDate);
    
    // 期間の説明を生成
    let periodDescription = `${startDateStr}〜${endDateStr}`;
    if (config.periodType === 'all' && selectedYear !== null) {
      periodDescription = `${selectedYear}年1月1日〜${selectedYear}年12月31日`;
    } else if (config.periodType === 'thisMonth') {
      const thisMonth = now.getMonth() + 1;
      const thisYear = now.getFullYear();
      periodDescription = `${thisYear}年${thisMonth}月1日〜${endDateStr}`;
    } else if (config.periodType === 'lastMonth') {
      const lastMonth = now.getMonth(); // 0-11
      const lastMonthYear = lastMonth === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const lastMonthNum = lastMonth === 0 ? 12 : lastMonth;
      periodDescription = `${lastMonthYear}年${lastMonthNum}月1日〜${lastMonthYear}年${lastMonthNum}月${new Date(lastMonthYear, lastMonthNum, 0).getDate()}日`;
    }

    const prompt = `
      あなたはプロの広告運用担当者です。
      以下の運用データに基づいて、${formatName}を作成してください。

      【期間データ】
      - 期間: ${periodDescription}
      
      【基本指標（5項目）】
      1. 総広告費: ¥${totalCost.toLocaleString()}
      2. インプレッション数: ${totalImpressions.toLocaleString()}
      3. クリック数: ${totalClicks.toLocaleString()}
      4. コンバージョン数: ${totalConversions.toLocaleString()}
      5. 総コンバージョン価値: ¥${totalValue.toLocaleString()}
      
      【パフォーマンス指標（6項目）】
      6. ROAS: ${avgRoas.toFixed(2)}%
      7. CTR: ${ctr.toFixed(2)}%
      8. CVR: ${cvr.toFixed(2)}%
      9. CPC: ¥${cpc.toFixed(2)}
      10. CPA: ¥${avgCpa.toFixed(2)}
      11. CPM: ¥${cpm.toFixed(2)}
      
      【リーチ・エンゲージメント指標（5項目）】
      12. リーチ数: ${totalReach.toLocaleString()}
      13. フリークエンシー: ${frequency.toFixed(2)}
      14. エンゲージメント率: ${engagementRate.toFixed(2)}%
      15. リンククリック数: ${totalLinkClicks.toLocaleString()}
      16. LPビュー数: ${totalLandingPageViews.toLocaleString()}
      
      ※ 参考情報（エンゲージメント数）: ${totalEngagements.toLocaleString()}
      
      【その他】
      - トップキャンペーン: ${topCampaign ? topCampaign.campaign_name : 'N/A'}
      ${yearlyStats ? `\n【年別集計】\n${yearlyStats.map(ys => `- ${ys.year}年: 費用¥${ys.cost.toLocaleString()}, CV${ys.conversions}件, ROAS${ys.roas.toFixed(0)}%, CPA¥${ys.cpa.toFixed(0)}`).join('\n')}` : ''}

      【設定・要望】
      - フォーマット: ${formatName}
      ${isExecutiveSummary ? '- 役員向けサマリーなので、ROI（投資対効果）を重視し、簡潔で要点を押さえた内容にしてください。' : ''}
      - トーン: ${config.tone}
      - **重要**: 上記の16項目（基本指標5項目: 1-5、パフォーマンス指標6項目: 6-11、リーチ・エンゲージメント指標5項目: 12-16）をすべて必ずレポートに記載してください。値が0の場合でも、項目名と値（0）を記載してください。どのキャンペーンを選択しても、この16項目は必ずすべて記載してください。
      - 全指標を分析してください（ROAS、CPA、CV件数・売上規模など）
      ${config.periodType === 'all' && selectedYear !== null ? `- このレポートは${selectedYear}年の年間レポートです。件名には「${selectedYear}年広告運用報告」または「${selectedYear}年度広告運用報告」のような形式を使用してください。` : ''}
      ${config.periodType === 'thisMonth' ? `- このレポートは今月（${now.getFullYear()}年${now.getMonth() + 1}月）の月次レポートです。件名には「${now.getFullYear()}年${now.getMonth() + 1}月度広告運用報告」のような形式を使用してください。` : ''}
      ${config.periodType === 'lastMonth' ? `- このレポートは先月の月次レポートです。件名には「先月の年月」月度広告運用報告」のような形式を使用してください。` : ''}
      
      【出力要件】
      ${isExecutiveSummary 
        ? '- 役員向けなので、簡潔で要点を押さえた内容にしてください（1-2ページ程度）\n      - 概要、主要指標、ハイライト、課題、次の期間のアクションプランを含めてください。'
        : '- 挨拶、数値報告、良かった点、課題点、来週/来月のアクションプランを含めてください。'}
      - マークダウン形式ではなく、そのままコピー＆ペーストできるプレーンテキスト形式で出力してください（見出し等の装飾は記号で分かりやすく）。
      - 必ず日本語で出力してください。
      - 期間の記載は正確に「${periodDescription}」として記載してください。
    `;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const systemMessage = 'You are a professional advertising operations manager. Create clear, professional reports in Japanese. Always respond in Japanese, never in English.';
      
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      return response.choices[0]?.message?.content || "レポート生成に失敗しました。";
    } catch (error) {
      console.error("Report Generation Failed:", error);
      throw error;
    }
  }

  async analyzeFunnel(campaignName: string, metrics: { impressions: number, clicks: number, conversions: number, ctr: number, cvr: number }, benchmarks: { ctr: number, cvr: number }): Promise<FunnelAnalysisResult> {
    // Determine bottleneck roughly
    let bottleneck: 'CTR' | 'CVR' | 'NONE' = 'NONE';
    const ctrDiff = metrics.ctr - benchmarks.ctr;
    const cvrDiff = metrics.cvr - benchmarks.cvr;

    if (ctrDiff < -0.2 && cvrDiff < -0.2) {
      // Both bad, pick worse relative to benchmark
      bottleneck = (metrics.ctr / benchmarks.ctr) < (metrics.cvr / benchmarks.cvr) ? 'CTR' : 'CVR';
    } else if (ctrDiff < -0.2) {
      bottleneck = 'CTR';
    } else if (cvrDiff < -0.2) {
      bottleneck = 'CVR';
    }

    const prompt = `
      あなたはデジタルマーケティングのファネル分析の専門家です。
      ある広告キャンペーンのファネル状況を診断し、ボトルネックの特定と対策を提案してください。

      【対象キャンペーン】
      - 名前: ${campaignName}
      - Impressions: ${metrics.impressions.toLocaleString()}
      - Clicks: ${metrics.clicks.toLocaleString()} (CTR: ${metrics.ctr.toFixed(2)}%) -> 業界基準: ${benchmarks.ctr}%
      - Conversions: ${metrics.conversions.toLocaleString()} (CVR: ${metrics.cvr.toFixed(2)}%) -> 業界基準: ${benchmarks.cvr}%
      
      【判定されたボトルネック】
      ${bottleneck === 'CTR' ? 'CTR（クリック率）が低い。クリエイティブやターゲット設定に問題がある可能性。' : bottleneck === 'CVR' ? 'CVR（転換率）が低い。LPの品質やオファー内容に問題がある可能性。' : '大きな問題なし。さらなる拡大を目指すフェーズ。'}

      【依頼内容】
      1. 「diagnosis」: なぜこのボトルネックが発生しているのか、考えられる要因を専門的な視点で解説してください（200文字以内）。
      2. 「recommendations」: ボトルネックを解消し、数字を改善するための具体的な施策を3つ提案してください。

      レスポンスは指定されたJSONスキーマに従ってください。
    `;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a digital marketing funnel analysis expert. Always respond in valid JSON format.' },
          { role: 'user', content: prompt + '\n\nレスポンスは以下のJSON形式で返してください:\n{"diagnosis": "...", "recommendations": ["...", "...", "..."]}' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1500
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("診断に失敗しました。");
      
      let aiResult;
      try {
        aiResult = JSON.parse(text);
      } catch (parseError) {
        console.error("JSON Parse Error:", parseError, "Response text:", text);
        throw new Error("AIからの応答の解析に失敗しました。もう一度お試しください。");
      }

      // Validate response structure
      if (!aiResult.diagnosis || !aiResult.recommendations || !Array.isArray(aiResult.recommendations)) {
        console.error("Invalid response structure:", aiResult);
        throw new Error("AIからの応答形式が正しくありません。もう一度お試しください。");
      }

      return {
        campaignName,
        metrics,
        benchmarks,
        bottleneck,
        diagnosis: aiResult.diagnosis,
        recommendations: aiResult.recommendations
      };

    } catch (error: any) {
      console.error("Funnel Analysis Failed:", error);
      
      // Provide more user-friendly error messages
      if (error.message && error.message.includes("API key")) {
        throw new Error("AI APIキーが設定されていません。設定を確認してください。");
      }
      if (error.message && (error.message.includes("quota") || error.message.includes("rate limit"))) {
        throw new Error("AI APIの利用制限に達しました。しばらく待ってから再度お試しください。");
      }
      if (error.message && (error.message.includes("Connection") || error.message.includes("network") || error.message.includes("fetch"))) {
        throw new Error("OpenAI APIへの接続に失敗しました。ネットワーク接続とAPIキーを確認してください。");
      }
      if (error.status === 401 || error.message?.includes("401")) {
        throw new Error("OpenAI APIキーが無効です。APIキーを確認してください。");
      }
      if (error.status === 429 || error.message?.includes("429")) {
        throw new Error("リクエストが多すぎます。しばらく待ってから再度お試しください。");
      }
      
      // Re-throw with original message if it's already user-friendly
      const errorMsg = error?.message || error?.toString() || "不明なエラーが発生しました";
      throw new Error(`ファネル分析エラー: ${errorMsg}`);
    }
  }

  async analyzeProfitability(input: ProfitInput): Promise<ProfitAnalysisResult> {
    // 1. Basic Calculations
    const revenuePerUnit = input.productPrice;
    const totalVariableCost = input.costOfGoods + input.otherExpenses;
    const grossMarginPerUnit = revenuePerUnit - totalVariableCost;
    
    // Safety check for negative margin
    if (grossMarginPerUnit <= 0) {
       throw new Error("原価・経費が販売価格を上回っています。利益が出ない構造です。");
    }

    const marginPercent = (grossMarginPerUnit / revenuePerUnit);
    const breakEvenRoas = (1 / marginPercent) * 100;
    const breakEvenCpa = grossMarginPerUnit;

    const currentProfitPerUnit = grossMarginPerUnit - input.currentCpa;
    const totalMonthlyProfit = currentProfitPerUnit * input.monthlyConversions;

    // 2. AI Advice
    const prompt = `
      あなたは経営コンサルタント兼マーケティング戦略家です。
      以下の商品・サービスのユニットエコノミクス（1単位あたりの収益構造）を診断し、利益最大化のためのアドバイスをしてください。

      【経済指標】
      - 商品単価: ¥${input.productPrice.toLocaleString()}
      - 変動費合計(原価+経費): ¥${totalVariableCost.toLocaleString()} (原価率 ${(totalVariableCost/input.productPrice*100).toFixed(1)}%)
      - 粗利益(広告費控除前): ¥${grossMarginPerUnit.toLocaleString()}
      - 現在のCPA(獲得単価): ¥${input.currentCpa.toLocaleString()}
      - 1件あたり最終利益: ¥${currentProfitPerUnit.toLocaleString()}
      - 損益分岐点ROAS: ${breakEvenRoas.toFixed(0)}% (現在のROAS目安: ${input.currentCpa > 0 ? (input.productPrice/input.currentCpa*100).toFixed(0) : 0}%)

      【依頼内容】
      1. 「advice」: 現状の収益構造に対する評価と、利益率改善のための具体的なアドバイス（価格戦略、LTV向上、コスト削減など）。
      2. 「scalingPotential」: この構造のまま広告費を拡大（スケール）すべきか、それとも先に構造改革が必要かについての判断。

      レスポンスは指定されたJSONスキーマに従ってください。
    `;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a business consultant and marketing strategist. Always respond in valid JSON format.' },
          { role: 'user', content: prompt + '\n\nレスポンスは以下のJSON形式で返してください:\n{"advice": "...", "scalingPotential": "..."}' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("分析に失敗しました。");
      const aiResult = JSON.parse(text);

      return {
        breakEvenRoas,
        breakEvenCpa,
        profitPerUnit: currentProfitPerUnit,
        totalMonthlyProfit,
        profitMargin: marginPercent * 100,
        advice: aiResult.advice,
        scalingPotential: aiResult.scalingPotential
      };

    } catch (error) {
      console.error("Profit Analysis Failed:", error);
      throw error;
    }
  }


  async generateJourneyMap(persona: string, product: string): Promise<JourneyStage[]> {
    const prompt = `
      あなたはマーケティング戦略の専門家です。
      商品「${product}」のターゲット「${persona}」におけるカスタマージャーニーマップを作成してください。
      以下の5つのフェーズごとに、ユーザーの心理状態、効果的な広告アングル、推奨クリエイティブ形式、注視すべきKPIを定義してください。

      Phases:
      1. Awareness (認知): まだ商品を知らない状態
      2. Interest (興味): 商品を知り、自分に関係あるかもと感じている
      3. Consideration (検討): 他社と比較したり、購入を迷っている
      4. Conversion (購入): 購入を決断する瞬間
      5. Retention (継続/ファン化): 購入後の体験、リピート

      レスポンスは指定されたJSONスキーマに従ってください。
    `;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a marketing strategy expert. Always respond in valid JSON format with an array of journey stages.' },
          { role: 'user', content: prompt + '\n\nレスポンスは以下のJSON形式の配列で返してください:\n[{"stageName": "Awareness|Interest|Consideration|Conversion|Retention", "userMindset": "...", "adAngle": "...", "creativeFormat": "...", "keyMetrics": [...]}, ...]' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("生成に失敗しました。");
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : (parsed.stages || parsed.data || []) as JourneyStage[];

    } catch (error) {
      console.error("Journey Map Generation Failed:", error);
      throw error;
    }
  }

  async generateCreativeBrief(stage: JourneyStage, product: string, persona: string): Promise<CreativeBrief> {
    const prompt = `
      あなたは一流のアートディレクター兼コピーライターです。
      商品「${product}」、ターゲット「${persona}」、フェーズ「${stage.stageName}」向けの広告クリエイティブ指示書（Creative Brief）を作成してください。
      
      【コンテキスト】
      - ユーザー心理: ${stage.userMindset}
      - 広告アングル: ${stage.adAngle}
      - 推奨フォーマット: ${stage.creativeFormat}

      【出力内容】
      デザイナーや動画編集者に渡すための具体的でインスピレーションを与える内容にしてください。
      
      レスポンスは指定されたJSONスキーマに従ってください。
    `;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a top art director and copywriter. Always respond in valid JSON format.' },
          { role: 'user', content: prompt + '\n\nレスポンスは以下のJSON形式で返してください:\n{"target": "...", "objective": "...", "coreMessage": "...", "visualDirection": "...", "toneOfVoice": "...", "copyIdeas": ["...", "...", "..."]}' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 1500
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("生成に失敗しました。");
      return JSON.parse(text) as CreativeBrief;

    } catch (error) {
      console.error("Creative Brief Generation Failed:", error);
      throw error;
    }
  }

  async analyzeAnomalyRootCause(anomalyType: string, date: string, metrics: any): Promise<string> {
    const prompt = `
      あなたは広告パフォーマンス分析の専門家です。
      ${date}に検出された「${anomalyType}」という異常値について、以下の指標データから根本原因（Root Cause）を推測し、対策を提案してください。

      【指標データ】
      - Impressions: ${metrics.impressions}
      - Clicks: ${metrics.clicks}
      - CTR: ${metrics.ctr.toFixed(2)}%
      - CPC: ¥${metrics.cpc.toFixed(0)}
      - Conversions: ${metrics.conversions}
      - CVR: ${metrics.cvr.toFixed(2)}%
      - Cost: ¥${metrics.cost.toLocaleString()}
      - ROAS: ${metrics.roas.toFixed(0)}%

      【依頼内容】
      なぜこの数値異常が起きたのか、ロジカルな仮説を立ててください。
      （例：CPMが高騰しているため競合の入札強化が疑われる、CTRは高いがCVRが急落しているためLPの不具合の可能性がある、など）
      最後に具体的なアクションプランを提示してください。

      回答はMarkdown形式で、見出しや箇条書きを使って読みやすく構成してください。
    `;

    try {
      const aiInstance = getAI();
      if (!aiInstance) {
        throw new Error("AI API key is not configured");
      }
      const response = await aiInstance.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are an advertising performance analysis expert. Respond in Markdown format with clear headings and bullet points.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      return response.choices[0]?.message?.content || "原因を特定できませんでした。";
    } catch (error) {
      console.error("Anomaly Analysis Failed:", error);
      throw error;
    }
  }

}

// Create ApiClient instance
const apiClient = new ApiClient(API_BASE_URL);

// Export Api object
export const Api = apiClient;
