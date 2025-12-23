import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Api } from '../services/api';
import { Button } from './ui/Button';
import { LayoutDashboard, User as UserIcon, Eye, EyeOff, ArrowLeft } from 'lucide-react';

interface AuthProps {
  onLogin: (user: User) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetToken, setResetToken] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showVerificationCode, setShowVerificationCode] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  const validateEmail = (email: string): string | null => {
    if (!email) {
      return "メールアドレスを入力してください";
    }
    // 基本的なメールアドレス形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      if (email.includes('@') && !email.includes('@', email.indexOf('@') + 1)) {
        // @はあるが、ドメイン部分が不完全
        return "「@」に続く文字列を入力してください";
      }
      return "有効なメールアドレスを入力してください";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // メールアドレスのバリデーション
      const emailError = validateEmail(email);
      if (emailError) {
        setError(emailError);
        setLoading(false);
        return;
      }

      if (isLogin) {
        // Login with 2FA (or skip 2FA for specific emails)
        try {
          console.log('[Auth] Starting login with 2FA for:', email);
          // Step 1: Request verification code (or direct login if 2FA skipped)
          const result = await Api.requestLoginCode(email, password);
          console.log('[Auth] Login code request result:', result);
          
          if (result && result.requires_code === false && result.access_token && result.user) {
            // 2FA skipped - direct login
            console.log('[Auth] 2FA skipped, direct login');
            // Save token
            if (result.access_token) {
              Api.setToken(result.access_token);
            }
            // Convert UserResponse to User type
            const user: User = {
              id: String(result.user.id),
              email: result.user.email,
              name: result.user.name || '',
              plan: (result.user.plan || 'FREE') as 'FREE' | 'STANDARD' | 'PRO',
              organization: '',  // UserResponseには含まれていないため空文字列
            };
            // Login user
            onLogin(user);
            setLoading(false);
          } else if (result && result.requires_code) {
            // Show verification code input
            console.log('[Auth] Showing verification code input');
            setPendingEmail(email);
            setShowVerificationCode(true);
            setSuccessMessage("認証コードをメールアドレスに送信しました。6桁のコードを入力してください。");
            setError(null);
            setLoading(false);
          } else {
            console.log('[Auth] Fallback to direct login');
            // Fallback to direct login (should not happen with 2FA enabled)
          const user = await Api.login(email, password);
          onLogin(user);
          }
        } catch (loginError: any) {
          console.error('[Auth] Login error:', loginError);
          // エラーメッセージをそのまま表示
          setError(loginError.message || 'ログインに失敗しました');
          setLoading(false);
        }
        return;
      } else {
        // Register
        if (!name) {
            setError("お名前を入力してください");
            setLoading(false);
            return;
        }
        if (!password) {
            setError("パスワードを入力してください");
            setLoading(false);
            return;
        }
        await Api.register(email, password, name);
        // 登録成功後、メール認証が必要であることを表示
        setSuccessMessage("登録が完了しました。メールアドレスに確認メールを送信しました。メール内のリンクをクリックしてアカウントを有効化してください。");
        // ログイン画面に戻す
        setIsLogin(true);
        setEmail('');
        setPassword('');
        setName('');
      }
    } catch (err: any) {
      setError(err.message || '認証に失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  // Handle verification code submission
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!verificationCode || verificationCode.length !== 6) {
        setError('6桁の認証コードを入力してください');
        setLoading(false);
        return;
      }

      console.log('[Auth] Verifying code for:', pendingEmail);
      const user = await Api.verifyLoginCode(pendingEmail, verificationCode);
      console.log('[Auth] Verification successful, user:', user);
      onLogin(user);
      setLoading(false);
    } catch (err: any) {
      console.error('[Auth] Verification error:', err);
      setError(err.message || '認証コードの確認に失敗しました');
      setLoading(false);
    }
  };

  // Check for reset token in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      setResetToken(token);
      setShowResetPassword(true);
    }
  }, []);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const emailError = validateEmail(email);
      if (emailError) {
        setError(emailError);
        setLoading(false);
        return;
      }

      await Api.forgotPassword(email);
      setSuccessMessage('パスワードリセットのメールを送信しました。メールアドレスが登録されている場合、リセットリンクをお送りします。');
      setEmail('');
    } catch (err: any) {
      setError(err.message || 'パスワードリセットのリクエストに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (!newPassword || newPassword.length < 8) {
        setError('パスワードは8文字以上である必要があります');
        setLoading(false);
        return;
      }

      if (newPassword !== confirmPassword) {
        setError('パスワードが一致しません');
        setLoading(false);
        return;
      }

      await Api.resetPassword(resetToken, newPassword);
      setSuccessMessage('パスワードが正常にリセットされました。ログイン画面に戻ってログインしてください。');
      setTimeout(() => {
        setShowResetPassword(false);
        setResetToken('');
        setNewPassword('');
        setConfirmPassword('');
        window.history.replaceState({}, '', window.location.pathname);
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'パスワードのリセットに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
      setIsLogin(!isLogin);
      setError(null);
      setSuccessMessage(null);
      // Reset form when switching modes
      if (!isLogin) {
          setEmail('');
          setPassword('');
      } else {
          setEmail('');
          setPassword('');
          setName('');
      }
  }

  // Verification code input screen
  if (showVerificationCode) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center text-indigo-600 dark:text-indigo-400">
            <LayoutDashboard size={48} />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            認証コードを入力
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            META Ad Analyzer<br />MIERU AI
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 transition-colors">
            <form className="space-y-6" onSubmit={handleVerifyCode}>
              <div>
                <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  6桁の認証コード
                </label>
                <div className="mt-1">
                  <input
                    id="verificationCode"
                    name="verificationCode"
                    type="text"
                    required
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={verificationCode}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                      setVerificationCode(value);
                    }}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm text-center text-2xl tracking-widest font-mono"
                    placeholder="000000"
                    autoComplete="off"
                  />
                </div>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {pendingEmail} に送信された6桁の認証コードを入力してください。
                </p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  認証コードは10分間有効です。
                </p>
              </div>

              {error && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 p-2 rounded">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 p-2 rounded">
                  {successMessage}
                </div>
              )}

              <div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  isLoading={loading}
                >
                  認証コードを確認
                </Button>
              </div>
            </form>

            <div className="mt-6">
              <button 
                onClick={() => {
                  setShowVerificationCode(false);
                  setVerificationCode('');
                  setPendingEmail('');
                  setSuccessMessage(null);
                  setError(null);
                }}
                className="w-full inline-flex justify-center items-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                ログイン画面に戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Password reset screen
  if (showResetPassword) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center text-indigo-600 dark:text-indigo-400">
            <LayoutDashboard size={48} />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            パスワードをリセット
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            META Ad Analyzer<br />MIERU AI
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 transition-colors">
            <form className="space-y-6" onSubmit={handleResetPassword}>
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  新しいパスワード
                </label>
                <div className="mt-1 relative">
                  <input
                    id="newPassword"
                    name="newPassword"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    placeholder="8文字以上"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    aria-label={showPassword ? "パスワードを非表示" : "パスワードを表示"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  パスワード（確認）
                </label>
                <div className="mt-1">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    placeholder="パスワードを再入力"
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 p-2 rounded">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 p-2 rounded">
                  {successMessage}
                </div>
              )}

              <div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  isLoading={loading}
                >
                  パスワードをリセット
                </Button>
              </div>
            </form>

            <div className="mt-6">
              <button 
                onClick={() => {
                  setShowResetPassword(false);
                  setResetToken('');
                  window.history.replaceState({}, '', window.location.pathname);
                }}
                className="w-full inline-flex justify-center items-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                ログイン画面に戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Forgot password screen
  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center text-indigo-600 dark:text-indigo-400">
            <LayoutDashboard size={48} />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            パスワードを忘れた場合
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            META Ad Analyzer<br />MIERU AI
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 transition-colors">
            <form className="space-y-6" onSubmit={handleForgotPassword}>
              <div>
                <label htmlFor="forgotEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  メールアドレス
                </label>
                <div className="mt-1">
                  <input
                    id="forgotEmail"
                    name="forgotEmail"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    placeholder="登録済みのメールアドレス"
                  />
                </div>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  登録済みのメールアドレスを入力してください。パスワードリセットリンクをお送りします。
                </p>
              </div>

              {error && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 p-2 rounded">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 p-2 rounded">
                  {successMessage}
                </div>
              )}

              <div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  isLoading={loading}
                >
                  リセットリンクを送信
                </Button>
              </div>
            </form>

            <div className="mt-6">
              <button 
                onClick={() => {
                  setShowForgotPassword(false);
                  setEmail('');
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="w-full inline-flex justify-center items-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                ログイン画面に戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Login/Register screen
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-indigo-600 dark:text-indigo-400">
          <LayoutDashboard size={48} />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          {isLogin ? 'アカウントにログイン' : '新規アカウント作成'}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          META Ad Analyzer<br />MIERU AI
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 transition-colors">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="animate-fade-in-down">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  お名前
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required={!isLogin}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="appearance-none block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    placeholder="山田 太郎"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                メールアドレス
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                パスワード
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label={showPassword ? "パスワードを非表示" : "パスワードを表示"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 p-2 rounded">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 p-2 rounded">
                {successMessage}
              </div>
            )}

            <div>
              <Button 
                type="submit" 
                className="w-full" 
                isLoading={loading}
              >
                {isLogin ? 'ログイン' : '無料で登録する'}
              </Button>
            </div>
          </form>

          {isLogin && (
            <div className="mt-4 text-center">
              <button
                onClick={() => {
                  setShowForgotPassword(true);
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300"
              >
                パスワードを忘れた場合
              </button>
            </div>
          )}

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
                  または
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3">
              <button 
                onClick={toggleMode}
                className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                {isLogin ? '新規登録はこちら' : 'ログインはこちら'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};