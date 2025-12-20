from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import uuid

class UserBase(BaseModel):
    email: EmailStr
    name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(UserBase):
    id: uuid.UUID
    plan: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

class PasswordResetResponse(BaseModel):
    message: str

class EmailVerificationRequest(BaseModel):
    token: str

class EmailVerificationResponse(BaseModel):
    message: str
    verified: bool

class LoginVerificationRequest(BaseModel):
    email: EmailStr
    password: str

class LoginVerificationCodeRequest(BaseModel):
    email: EmailStr
    code: str

class LoginVerificationResponse(BaseModel):
    message: str
    requires_code: bool
    session_id: Optional[str] = None
    access_token: Optional[str] = None  # 2FAスキップ時のみ
    token_type: Optional[str] = None  # 2FAスキップ時のみ
    user: Optional[UserResponse] = None  # 2FAスキップ時のみ
