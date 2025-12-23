from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import timedelta
import os
from ..database import get_db
from ..models.user import User
from ..models.password_reset import PasswordResetToken
from ..models.email_verification import EmailVerificationToken
from ..models.login_verification import LoginVerificationCode
from ..schemas.user import (
    UserCreate, UserLogin, UserResponse, Token, LoginResponse,
    PasswordResetRequest, PasswordResetConfirm, PasswordResetResponse,
    EmailVerificationRequest, EmailVerificationResponse,
    LoginVerificationRequest, LoginVerificationCodeRequest, LoginVerificationResponse
)
from ..utils.security import verify_password, get_password_hash, create_access_token
from ..services.email_service import EmailService
from ..config import settings

router = APIRouter()
email_service = EmailService()

@router.post("/register", response_model=UserResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    # Check if user exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="このメールアドレスは既に登録されています")
    
    # Create new user (email not verified yet)
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        name=user_data.name,
        password_hash=hashed_password,
        email_verified="false"  # Not verified yet
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Generate email verification token
    verification_token = EmailVerificationToken.generate_token()
    expires_at = EmailVerificationToken.get_expiration_time(hours=72)  # 3 days
    
    # Save token to database
    email_verification = EmailVerificationToken(
        user_id=new_user.id,
        token=verification_token,
        expires_at=expires_at,
        used="false"
    )
    db.add(email_verification)
    db.commit()
    
    # Send email verification email
    try:
        if email_service.is_configured():
            frontend_url = settings.FRONTEND_URL or os.getenv("FRONTEND_URL", "http://localhost:3000")
            verification_url = f"{frontend_url}/verify-email?token={verification_token}"
            
            email_sent = email_service.send_email_verification_email(
                to_email=new_user.email,
                user_name=new_user.name or "ユーザー",
                verification_token=verification_token,
                verification_url=verification_url
            )
            if not email_sent:
                print(f"[Auth] Failed to send email verification email to {new_user.email}")
        else:
            print(f"[Auth] Email service not configured, skipping email verification email")
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[Auth] Exception in send_email_verification_email: {str(e)}")
        print(f"[Auth] Error details: {error_details}")
        # Don't fail registration if email fails
    
    return new_user

@router.post("/login", response_model=LoginVerificationResponse)
def login(credentials: UserLogin, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Legacy login endpoint - redirects to 2FA flow"""
    return login_with_verification(LoginVerificationRequest(email=credentials.email, password=credentials.password), background_tasks, db)

@router.post("/login/request-code", response_model=LoginVerificationResponse)
def login_with_verification(
    request: LoginVerificationRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Login with 2FA - Step 1: Request verification code"""
    print(f"[Auth] login_with_verification called for: {request.email}")
    
    try:
        print(f"[Auth] Querying user from database...")
        user = db.query(User).filter(User.email == request.email).first()
        print(f"[Auth] User found: {user is not None}")
        
        if not user or not verify_password(request.password, user.password_hash):
            print(f"[Auth] Invalid credentials")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="メールアドレスまたはパスワードが正しくありません"
            )
    
        # Check if email is verified
        print(f"[Auth] Checking email verification status: {user.email_verified}")
        email_lower = request.email.lower().strip()
        
        # Auto-verify email if in skip list
        if user.email_verified != "true":
            if email_lower in settings.skip_email_verification_emails_list:
                print(f"[Auth] Email {email_lower} is in skip email verification list, auto-verifying")
                user.email_verified = "true"
                db.commit()
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="メールアドレスの確認が完了していません。登録時に送信されたメールの確認リンクをクリックしてください。"
                )
        
        # Check if email is in skip 2FA list
        email_lower = request.email.lower().strip()
        if email_lower in settings.skip_2fa_emails_list:
            print(f"[Auth] Email {email_lower} is in skip 2FA list, bypassing 2FA")
            # Direct login without 2FA
            access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = create_access_token(
                data={"sub": str(user.id)}, expires_delta=access_token_expires
            )
            
            from ..schemas.user import UserResponse
            user_response = UserResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                plan=user.plan or "FREE",
                created_at=user.created_at
            )
            
            return {
                "message": "ログインに成功しました",
                "requires_code": False,
                "session_id": None,
                "access_token": access_token,
                "token_type": "bearer",
                "user": user_response
            }
        
        # Generate verification code
        print(f"[Auth] Generating verification code...")
        verification_code = LoginVerificationCode.generate_code()
        expires_at = LoginVerificationCode.get_expiration_time(minutes=10)  # 10 minutes
        print(f"[Auth] Verification code generated: {verification_code}")
        
        # Save code to database
        print(f"[Auth] Saving verification code to database...")
        login_verification = LoginVerificationCode(
            user_id=user.id,
            code=verification_code,
            expires_at=expires_at,
            used="false"
        )
        db.add(login_verification)
        db.commit()
        print(f"[Auth] Verification code saved to database")
        
        # Generate session ID (simple UUID for now)
        import uuid
        session_id = str(uuid.uuid4())
        print(f"[Auth] Session ID generated: {session_id}")
        
        # Send verification code email in background (don't wait for it)
        def send_email_background():
            try:
                print(f"[Auth] Background task: Starting email send...")
                if email_service.is_configured():
                    email_sent = email_service.send_login_verification_email(
                        to_email=user.email,
                        user_name=user.name or "ユーザー",
                        verification_code=verification_code
                    )
                    if not email_sent:
                        print(f"[Auth] Failed to send login verification email to {user.email}")
                    else:
                        print(f"[Auth] Login verification email sent successfully")
                else:
                    print(f"[Auth] Email service not configured, skipping login verification email")
            except Exception as e:
                import traceback
                error_details = traceback.format_exc()
                print(f"[Auth] Exception in send_login_verification_email: {str(e)}")
                print(f"[Auth] Error details: {error_details}")
        
        # Add email sending to background tasks
        print(f"[Auth] Adding email task to background...")
        background_tasks.add_task(send_email_background)
        print(f"[Auth] Email task added to background")
        
        result = {
            "message": "認証コードをメールアドレスに送信しました。",
            "requires_code": True,
            "session_id": session_id
        }
        print(f"[Auth] Returning response: {result}")
        return result
    except HTTPException as he:
        print(f"[Auth] HTTPException raised: {he.status_code} - {he.detail}")
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[Auth] Unexpected error in login_with_verification: {str(e)}")
        print(f"[Auth] Error type: {type(e).__name__}")
        print(f"[Auth] Error details: {error_details}")
        # エラーの詳細をログに出力してから、一般的なエラーメッセージを返す
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ログイン処理中にエラーが発生しました: {str(e)}"
        )

@router.post("/login/verify-code", response_model=LoginResponse)
def verify_login_code(request: LoginVerificationCodeRequest, db: Session = Depends(get_db)):
    """Login with 2FA - Step 2: Verify code and complete login"""
    # Find user
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ユーザーが見つかりません。"
        )
    
    # Find valid verification code
    verification_code = db.query(LoginVerificationCode).filter(
        LoginVerificationCode.user_id == user.id,
        LoginVerificationCode.code == request.code,
        LoginVerificationCode.used == "false"
    ).order_by(LoginVerificationCode.created_at.desc()).first()
    
    if not verification_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="無効または期限切れの認証コードです。"
        )
    
    # Check if code is valid
    if not verification_code.is_valid():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="無効または期限切れの認証コードです。"
        )
    
    # Mark code as used
    verification_code.used = "true"
    db.commit()
    
    # Generate access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.post("/forgot-password", response_model=PasswordResetResponse)
def forgot_password(request: PasswordResetRequest, db: Session = Depends(get_db)):
    """Request password reset - send email with reset link"""
    user = db.query(User).filter(User.email == request.email).first()
    
    # Always return success message (security best practice - don't reveal if email exists)
    if not user:
        return {"message": "パスワードリセットのメールを送信しました。メールアドレスが登録されている場合、リセットリンクをお送りします。"}
    
    # Check if email service is configured
    if not email_service.is_configured():
        raise HTTPException(
            status_code=500,
            detail="メール送信機能が設定されていません。管理者にお問い合わせください。"
        )
    
    # Generate reset token
    reset_token = PasswordResetToken.generate_token()
    expires_at = PasswordResetToken.get_expiration_time(hours=24)
    
    # Save token to database
    password_reset = PasswordResetToken(
        user_id=user.id,
        token=reset_token,
        expires_at=expires_at,
        used="false"
    )
    db.add(password_reset)
    db.commit()
    
    # Generate reset URL (frontend URL + token)
    frontend_url = settings.FRONTEND_URL or os.getenv("FRONTEND_URL", "http://localhost:3000")
    reset_url = f"{frontend_url}/reset-password?token={reset_token}"
    
    # Send email
    try:
        email_sent = email_service.send_password_reset_email(
            to_email=user.email,
            reset_token=reset_token,
            reset_url=reset_url
        )
        
        if not email_sent:
            # If email fails, still return success (security best practice)
            # But log the error
            print(f"[Auth] Failed to send password reset email to {user.email}")
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[Auth] Exception in send_password_reset_email: {str(e)}")
        print(f"[Auth] Error details: {error_details}")
        # Still return success for security (don't reveal if email exists)
    
    return {"message": "パスワードリセットのメールを送信しました。メールアドレスが登録されている場合、リセットリンクをお送りします。"}

@router.post("/reset-password", response_model=PasswordResetResponse)
def reset_password(request: PasswordResetConfirm, db: Session = Depends(get_db)):
    """Reset password using token"""
    # Find token
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == request.token
    ).first()
    
    if not reset_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="無効または期限切れのトークンです。"
        )
    
    # Check if token is valid
    if not reset_token.is_valid():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="無効または期限切れのトークンです。"
        )
    
    # Get user
    user = db.query(User).filter(User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ユーザーが見つかりません。"
        )
    
    # Validate new password
    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="パスワードは8文字以上である必要があります。"
        )
    
    # Update password
    user.password_hash = get_password_hash(request.new_password)
    
    # Mark token as used
    reset_token.used = "true"
    
    db.commit()
    
    return {"message": "パスワードが正常にリセットされました。"}

@router.post("/verify-email", response_model=EmailVerificationResponse)
def verify_email(request: EmailVerificationRequest, db: Session = Depends(get_db)):
    """Verify email address using token"""
    # Find token
    verification_token = db.query(EmailVerificationToken).filter(
        EmailVerificationToken.token == request.token
    ).first()
    
    if not verification_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="無効または期限切れのトークンです。"
        )
    
    # Check if token is valid
    if not verification_token.is_valid():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="無効または期限切れのトークンです。"
        )
    
    # Get user
    user = db.query(User).filter(User.id == verification_token.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ユーザーが見つかりません。"
        )
    
    # Check if already verified
    if user.email_verified == "true":
        return {
            "message": "このメールアドレスは既に確認済みです。",
            "verified": True
        }
    
    # Check if token was already used to prevent duplicate emails
    was_already_used = verification_token.used == "true"
    
    # Verify email
    user.email_verified = "true"
    
    # Mark token as used
    verification_token.used = "true"
    
    db.commit()
    
    # Send welcome email after verification (only if token was not already used)
    if not was_already_used:
        try:
            if email_service.is_configured():
                email_sent = email_service.send_welcome_email(
                    to_email=user.email,
                    user_name=user.name or "ユーザー"
                )
                if not email_sent:
                    print(f"[Auth] Failed to send welcome email to {user.email}")
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"[Auth] Exception in send_welcome_email: {str(e)}")
            print(f"[Auth] Error details: {error_details}")
            # Don't fail verification if welcome email fails
    
    return {
        "message": "メールアドレスの確認が完了しました。アカウントが有効化されました。",
        "verified": True
    }

@router.post("/admin/reset-password-no-email", response_model=PasswordResetResponse)
def admin_reset_password_no_email(
    email: str,
    new_password: str,
    db: Session = Depends(get_db)
):
    """
    Temporary admin endpoint to reset password without email (for development/testing)
    Only works for emails in SKIP_EMAIL_VERIFICATION_EMAILS list
    """
    # Check if email is in skip list
    email_lower = email.lower().strip()
    if email_lower not in settings.skip_email_verification_emails_list:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="このエンドポイントは開発・テスト用です。"
        )
    
    # Find user
    user = db.query(User).filter(User.email == email_lower).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ユーザーが見つかりません。"
        )
    
    # Validate new password
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="パスワードは8文字以上である必要があります。"
        )
    
    # Update password and auto-verify email
    user.password_hash = get_password_hash(new_password)
    user.email_verified = "true"
    
    db.commit()
    
    return {"message": "パスワードが正常にリセットされました。メール確認も完了しました。"}
