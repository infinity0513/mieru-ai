import os
from typing import Optional
from ..config import settings

try:
    import resend
except ImportError:
    resend = None
    print("[EmailService] Warning: resend package is not installed. Email functionality will be disabled.")

class EmailService:
    """Email service using Resend"""
    
    def __init__(self):
        self.api_key = settings.RESEND_API_KEY or os.getenv("RESEND_API_KEY")
        self.from_email = settings.RESEND_FROM_EMAIL or os.getenv("RESEND_FROM_EMAIL")
        self.from_name = settings.RESEND_FROM_NAME or os.getenv("RESEND_FROM_NAME", "MIERU AI")
        
        if self.api_key and resend:
            resend.api_key = self.api_key
    
    def _get_from_address(self) -> str:
        """Get formatted from address with name"""
        if self.from_name:
            return f"{self.from_name} <{self.from_email}>"
        return self.from_email
    
    def is_configured(self) -> bool:
        """Check if email service is configured"""
        return bool(self.api_key and self.from_email and resend is not None)
    
    def send_password_reset_email(
        self,
        to_email: str,
        reset_token: str,
        reset_url: str
    ) -> bool:
        """
        Send password reset email
        
        Args:
            to_email: Recipient email address
            reset_token: Password reset token
            reset_url: Full URL for password reset (e.g., https://yourdomain.com/reset-password?token=...)
        
        Returns:
            bool: True if sent successfully, False otherwise
        """
        if not self.is_configured():
            print("[EmailService] Resend is not configured. Skipping email send.")
            return False
        
        if resend is None:
            print("[EmailService] resend package is not installed.")
            return False
        
        try:
            # Resend API requires dictionary format, not SendParams object
            # Format: "Name <email@domain.com>" for display name
            from_address = f"{self.from_name} <{self.from_email}>" if self.from_name else self.from_email
            params = {
                "from": from_address,
                "to": [to_email],
                "subject": "パスワードリセットのご案内 - MIERU AI",
                "html": f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .container {{
            background-color: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 30px;
        }}
        .header {{
            text-align: center;
            margin-bottom: 30px;
        }}
        .logo {{
            font-size: 24px;
            font-weight: bold;
            color: #4f46e5;
            margin-bottom: 10px;
        }}
        .content {{
            margin-bottom: 30px;
        }}
        .button {{
            display: inline-block;
            background-color: #4f46e5;
            color: #ffffff;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
        }}
        .button:hover {{
            background-color: #4338ca;
        }}
        .footer {{
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #6b7280;
            text-align: center;
        }}
        .warning {{
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">MIERU AI</div>
            <p style="color: #6b7280; margin: 0;">META Ad Analyzer</p>
        </div>
        
        <div class="content">
            <h2 style="color: #111827; margin-top: 0;">パスワードリセットのご案内</h2>
            
            <p>パスワードリセットのリクエストを受け付けました。</p>
            <p>以下のボタンをクリックして、新しいパスワードを設定してください。</p>
            
            <div style="text-align: center; margin: 20px 0;">
                <a href="{reset_url}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 16px;">パスワードをリセット</a>
            </div>
            
            <div class="warning">
                <strong>⚠️ 注意事項</strong><br>
                このリンクは24時間有効です。<br>
                もしこのリクエストを送信していない場合は、このメールを無視してください。
            </div>
            
            <p style="font-size: 14px; color: #6b7280;">
                ボタンがクリックできない場合は、以下のURLをコピーしてブラウザに貼り付けてください：<br>
                <a href="{reset_url}" style="color: #4f46e5; word-break: break-all;">{reset_url}</a>
            </p>
        </div>
        
        <div class="footer">
            <p>このメールは自動送信されています。返信はできません。</p>
            <p>© 2025 MIERU AI. All rights reserved.</p>
        </div>
            </div>
    </body>
</html>
                """
            }
            
            email = resend.Emails.send(params)
            
            # Resend returns a dict with 'id' key on success
            if email and isinstance(email, dict) and 'id' in email:
                print(f"[EmailService] Password reset email sent successfully to {to_email}, Email ID: {email['id']}")
                return True
            elif email and hasattr(email, 'id'):
                print(f"[EmailService] Password reset email sent successfully to {to_email}, Email ID: {email.id}")
                return True
            else:
                print(f"[EmailService] Failed to send email. Response: {email}")
                return False
                
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"[EmailService] Error sending password reset email: {str(e)}")
            print(f"[EmailService] Error details: {error_details}")
            return False
    
    def send_welcome_email(
        self,
        to_email: str,
        user_name: str
    ) -> bool:
        """
        Send welcome email to new user
        
        Args:
            to_email: Recipient email address
            user_name: User's name
        
        Returns:
            bool: True if sent successfully, False otherwise
        """
        if not self.is_configured():
            print("[EmailService] Resend is not configured. Skipping email send.")
            return False
        
        if resend is None:
            print("[EmailService] resend package is not installed.")
            return False
        
        try:
            # Resend API requires dictionary format
            from_address = f"{self.from_name} <{self.from_email}>" if self.from_name else self.from_email
            params = {
                "from": from_address,
                "to": [to_email],
                "subject": "ご登録ありがとうございます - MIERU AI",
                "html": f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .container {{
            background-color: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 30px;
        }}
        .header {{
            text-align: center;
            margin-bottom: 30px;
        }}
        .logo {{
            font-size: 24px;
            font-weight: bold;
            color: #4f46e5;
            margin-bottom: 10px;
        }}
        .content {{
            margin-bottom: 30px;
        }}
        .button {{
            display: inline-block;
            background-color: #4f46e5;
            color: #ffffff;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            font-size: 16px;
        }}
        .button:hover {{
            background-color: #4338ca;
        }}
        .footer {{
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #6b7280;
            text-align: center;
        }}
        .info-box {{
            background-color: #eff6ff;
            border-left: 4px solid #3b82f6;
            padding: 12px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">MIERU AI</div>
            <p style="color: #6b7280; margin: 0;">META Ad Analyzer</p>
        </div>
        
        <div class="content">
            <h2 style="color: #111827; margin-top: 0;">ご登録ありがとうございます</h2>
            
            <p>{user_name}様</p>
            
            <p>この度は、MIERU AI（META Ad Analyzer）にご登録いただき、誠にありがとうございます。</p>
            
            <p>MIERU AIでは、Meta広告のデータを分析し、AIによる改善提案やパフォーマンス最適化のサポートを提供いたします。</p>
            
            <div class="info-box">
                <strong>📊 主な機能</strong><br>
                • AI分析レポート<br>
                • パフォーマンス分析<br>
                • 予算最適化シミュレーター<br>
                • 広告コピー生成<br>
                • クリエイティブ診断<br>
                その他、広告運用に役立つ機能を多数ご用意しております。
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
                <a href="http://localhost:3000" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 16px;">ダッシュボードにアクセス</a>
            </div>
            
            <p style="font-size: 14px; color: #6b7280;">
                ご不明な点がございましたら、お気軽にお問い合わせください。
            </p>
        </div>
        
        <div class="footer">
            <p>このメールは自動送信されています。返信はできません。</p>
            <p>© 2025 MIERU AI. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
                """
            }
            
            email = resend.Emails.send(params)
            
            # Resend returns a dict with 'id' key on success
            if email and isinstance(email, dict) and 'id' in email:
                print(f"[EmailService] Welcome email sent successfully to {to_email}, Email ID: {email['id']}")
                return True
            elif email and hasattr(email, 'id'):
                print(f"[EmailService] Welcome email sent successfully to {to_email}, Email ID: {email.id}")
                return True
            else:
                print(f"[EmailService] Failed to send welcome email. Response: {email}")
                return False
                
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"[EmailService] Error sending welcome email: {str(e)}")
            print(f"[EmailService] Error details: {error_details}")
            return False
    
    def send_email_verification_email(
        self,
        to_email: str,
        user_name: str,
        verification_token: str,
        verification_url: str
    ) -> bool:
        """
        Send email verification email
        
        Args:
            to_email: Recipient email address
            user_name: User's name
            verification_token: Email verification token
            verification_url: Full URL for email verification
        
        Returns:
            bool: True if sent successfully, False otherwise
        """
        if not self.is_configured():
            print("[EmailService] Resend is not configured. Skipping email send.")
            return False
        
        if resend is None:
            print("[EmailService] resend package is not installed.")
            return False
        
        try:
            # Resend API requires dictionary format
            from_address = f"{self.from_name} <{self.from_email}>" if self.from_name else self.from_email
            params = {
                "from": from_address,
                "to": [to_email],
                "subject": "メールアドレスの確認 - MIERU AI",
                "html": f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .container {{
            background-color: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 30px;
        }}
        .header {{
            text-align: center;
            margin-bottom: 30px;
        }}
        .logo {{
            font-size: 24px;
            font-weight: bold;
            color: #4f46e5;
            margin-bottom: 10px;
        }}
        .content {{
            margin-bottom: 30px;
        }}
        .button {{
            display: inline-block;
            background-color: #4f46e5;
            color: #ffffff;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            font-size: 16px;
        }}
        .button:hover {{
            background-color: #4338ca;
        }}
        .footer {{
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #6b7280;
            text-align: center;
        }}
        .info-box {{
            background-color: #eff6ff;
            border-left: 4px solid #3b82f6;
            padding: 12px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
        }}
        .warning {{
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">MIERU AI</div>
            <p style="color: #6b7280; margin: 0;">META Ad Analyzer</p>
        </div>
        
        <div class="content">
            <h2 style="color: #111827; margin-top: 0;">メールアドレスの確認</h2>
            
            <p>{user_name}様</p>
            
            <p>この度は、MIERU AI（META Ad Analyzer）にご登録いただき、誠にありがとうございます。</p>
            
            <p>アカウントを有効化するため、以下のボタンをクリックしてメールアドレスを確認してください。</p>
            
            <div style="text-align: center; margin: 20px 0;">
                <a href="{verification_url}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 16px;">メールアドレスを確認</a>
            </div>
            
            <div class="warning">
                <strong>⚠️ 注意事項</strong><br>
                このリンクは72時間（3日間）有効です。<br>
                もしこのリクエストを送信していない場合は、このメールを無視してください。
            </div>
            
            <p style="font-size: 14px; color: #6b7280;">
                ボタンがクリックできない場合は、以下のURLをコピーしてブラウザに貼り付けてください：<br>
                <a href="{verification_url}" style="color: #4f46e5; word-break: break-all;">{verification_url}</a>
            </p>
            
            <div class="info-box">
                <strong>📧 メールアドレス確認後</strong><br>
                メールアドレスを確認すると、アカウントが有効化され、すべての機能をご利用いただけます。
            </div>
        </div>
        
        <div class="footer">
            <p>このメールは自動送信されています。返信はできません。</p>
            <p>© 2025 MIERU AI. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
                """
            }
            
            email = resend.Emails.send(params)
            
            # Resend returns a dict with 'id' key on success
            if email and isinstance(email, dict) and 'id' in email:
                print(f"[EmailService] Email verification email sent successfully to {to_email}, Email ID: {email['id']}")
                return True
            elif email and hasattr(email, 'id'):
                print(f"[EmailService] Email verification email sent successfully to {to_email}, Email ID: {email.id}")
                return True
            else:
                print(f"[EmailService] Failed to send email verification email. Response: {email}")
                return False
                
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"[EmailService] Error sending email verification email: {str(e)}")
            print(f"[EmailService] Error details: {error_details}")
            return False
    
    def send_login_verification_email(
        self,
        to_email: str,
        user_name: str,
        verification_code: str
    ) -> bool:
        """
        Send login verification code email
        
        Args:
            to_email: Recipient email address
            user_name: User's name
            verification_code: 6-digit verification code
        
        Returns:
            bool: True if sent successfully, False otherwise
        """
        if not self.is_configured():
            print("[EmailService] Resend is not configured. Skipping email send.")
            return False
        
        if resend is None:
            print("[EmailService] resend package is not installed.")
            return False
        
        try:
            # Resend API requires dictionary format
            from_address = f"{self.from_name} <{self.from_email}>" if self.from_name else self.from_email
            params = {
                "from": from_address,
                "to": [to_email],
                "subject": "ログイン認証コード - MIERU AI",
                "html": f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .container {{
            background-color: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 30px;
        }}
        .header {{
            text-align: center;
            margin-bottom: 30px;
        }}
        .logo {{
            font-size: 24px;
            font-weight: bold;
            color: #4f46e5;
            margin-bottom: 10px;
        }}
        .content {{
            margin-bottom: 30px;
        }}
        .code-box {{
            background-color: #f3f4f6;
            border: 2px solid #4f46e5;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 30px 0;
        }}
        .code {{
            font-size: 32px;
            font-weight: bold;
            color: #4f46e5;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
        }}
        .footer {{
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #6b7280;
            text-align: center;
        }}
        .warning {{
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
        }}
        .info-box {{
            background-color: #eff6ff;
            border-left: 4px solid #3b82f6;
            padding: 12px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">MIERU AI</div>
            <p style="color: #6b7280; margin: 0;">META Ad Analyzer</p>
        </div>
        
        <div class="content">
            <h2 style="color: #111827; margin-top: 0;">ログイン認証コード</h2>
            
            <p>{user_name}様</p>
            
            <p>MIERU AIへのログインリクエストを受け付けました。</p>
            
            <p>以下の認証コードを入力してログインを完了してください。</p>
            
            <div class="code-box">
                <div class="code">{verification_code}</div>
            </div>
            
            <div class="warning">
                <strong>⚠️ 注意事項</strong><br>
                この認証コードは10分間有効です。<br>
                もしこのログインリクエストを送信していない場合は、このメールを無視してください。
            </div>
            
            <div class="info-box">
                <strong>🔒 セキュリティについて</strong><br>
                この認証コードは一度だけ使用できます。使用後は無効になります。
            </div>
        </div>
        
        <div class="footer">
            <p>このメールは自動送信されています。返信はできません。</p>
            <p>© 2025 MIERU AI. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
                """
            }
            
            email = resend.Emails.send(params)
            
            # Resend returns a dict with 'id' key on success
            if email and isinstance(email, dict) and 'id' in email:
                print(f"[EmailService] Login verification email sent successfully to {to_email}, Email ID: {email['id']}")
                return True
            elif email and hasattr(email, 'id'):
                print(f"[EmailService] Login verification email sent successfully to {to_email}, Email ID: {email.id}")
                return True
            else:
                print(f"[EmailService] Failed to send login verification email. Response: {email}")
                return False
                
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"[EmailService] Error sending login verification email: {str(e)}")
            print(f"[EmailService] Error details: {error_details}")
            return False

