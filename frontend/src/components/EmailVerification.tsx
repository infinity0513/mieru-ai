import React, { useState, useEffect } from 'react';
import { Api } from '../services/api';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface EmailVerificationProps {
  token: string;
  onVerified?: () => void;
}

export const EmailVerification: React.FC<EmailVerificationProps> = ({ token, onVerified }) => {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState<string>('メールアドレスを確認中...');
  const [hasVerified, setHasVerified] = useState(false);

  useEffect(() => {
    // 重複実行を防ぐ
    if (hasVerified || !token) {
      return;
    }

    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const verifyEmail = async () => {
      try {
        console.log('[EmailVerification] Starting verification with token:', token.substring(0, 10) + '...');
        setHasVerified(true);
        
        // タイムアウトを設定（30秒）
        timeoutId = setTimeout(() => {
          if (isMounted) {
            console.error('[EmailVerification] Verification timeout');
            setStatus('error');
            setMessage('メールアドレスの確認がタイムアウトしました。もう一度お試しください。');
          }
        }, 30000);
        
        const result = await Api.verifyEmail(token);
        console.log('[EmailVerification] Verification result:', result);
        console.log('[EmailVerification] Result verified:', result?.verified);
        console.log('[EmailVerification] Result message:', result?.message);
        
        // タイムアウトをクリア
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        // コンポーネントがアンマウントされていない場合のみ状態を更新
        if (!isMounted) {
          console.log('[EmailVerification] Component unmounted, skipping state update');
          return;
        }
        
        // 成功時のみ状態を更新（verifiedがtrue、またはundefinedの場合は成功とみなす）
        const isSuccess = result && (result.verified === true || result.verified === undefined);
        console.log('[EmailVerification] Is success:', isSuccess);
        
        if (isSuccess) {
          console.log('[EmailVerification] Setting status to success');
          setStatus('success');
          setMessage(result.message || 'メールアドレスの確認が完了しました。');
          
          // 3秒後にログイン画面にリダイレクト
          setTimeout(() => {
            if (!isMounted) {
              console.log('[EmailVerification] Component unmounted during redirect');
              return;
            }
            console.log('[EmailVerification] Redirecting to login');
            if (onVerified) {
              onVerified();
            } else {
              window.location.href = '/';
            }
          }, 3000);
        } else {
          console.log('[EmailVerification] Setting status to error');
          setStatus('error');
          setMessage(result?.message || 'メールアドレスの確認に失敗しました。');
        }
      } catch (error: any) {
        console.error('[EmailVerification] Verification error:', error);
        
        // タイムアウトをクリア
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        // コンポーネントがアンマウントされていない場合のみ状態を更新
        if (!isMounted) return;
        
        // エラーメッセージを詳細に確認
        const errorMessage = error?.message || 'メールアドレスの確認に失敗しました。';
        
        // 既に認証済みの場合のエラーメッセージをチェック
        if (errorMessage.includes('既に確認済み') || errorMessage.includes('already verified')) {
          setStatus('success');
          setMessage('このメールアドレスは既に確認済みです。');
          setTimeout(() => {
            if (!isMounted) return;
            if (onVerified) {
              onVerified();
            } else {
              window.location.href = '/';
            }
          }, 2000);
        } else {
          setStatus('error');
          setMessage(errorMessage);
        }
      }
    };

    verifyEmail();
    
    return () => {
      console.log('[EmailVerification] Cleanup - unmounting');
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // onVerifiedとhasVerifiedを依存配列から削除して重複実行を防ぐ

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <div className="text-center">
          {status === 'verifying' && (
            <>
              <div className="flex justify-center mb-4">
                <Loader2 className="h-16 w-16 text-indigo-600 dark:text-indigo-400 animate-spin" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                メールアドレスを確認中
              </h2>
              <p className="text-gray-600 dark:text-gray-300">{message}</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-16 w-16 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                確認完了
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">{message}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                ログイン画面にリダイレクトします...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="flex justify-center mb-4">
                <XCircle className="h-16 w-16 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                確認失敗
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">{message}</p>
              <a
                href="/"
                className="inline-block mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                ログイン画面に戻る
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

