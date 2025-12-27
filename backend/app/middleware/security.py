from fastapi import Request
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware
from time import time
from collections import defaultdict

class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, calls: int = 60, period: int = 60):
        super().__init__(app)
        self.calls = calls
        self.period = period
        self.cache = defaultdict(list)
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks, docs, and OPTIONS requests (CORS preflight)
        if request.url.path in ["/health", "/docs", "/openapi.json", "/redoc"] or request.method == "OPTIONS":
            return await call_next(request)
        
        # ログインエンドポイントのみレート制限を適用
        is_login_endpoint = request.url.path == "/api/auth/login" and request.method == "POST"
        
        if not is_login_endpoint:
            # ログイン以外のエンドポイントはレート制限を適用しない
            return await call_next(request)
        
        # Get client IP
        client_ip = request.client.host
        
        # Clean old entries
        now = time()
        self.cache[client_ip] = [
            timestamp for timestamp in self.cache[client_ip]
            if now - timestamp < self.period
        ]
        
        # Check rate limit (ログインエンドポイントのみ)
        if len(self.cache[client_ip]) >= self.calls:
            return JSONResponse(
                status_code=429,
                content={"detail": "短時間に複数回のログインを確認しました。１分ほどお時間をあけてから再度ログインをお試しください。"}
            )
        
        # Add current request
        self.cache[client_ip].append(now)
        
        response = await call_next(request)
        return response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # If response is a redirect (307), ensure it uses HTTPS
        # This handles cases where FastAPI or Starlette redirects to trailing slash
        if hasattr(response, 'status_code') and response.status_code in [301, 302, 307, 308]:
            location = response.headers.get("location", "")
            if location and location.startswith("http://"):
                # Replace http:// with https://
                location = location.replace("http://", "https://", 1)
                response.headers["location"] = location
        
        # Add security headers (but don't overwrite CORS headers)
        # Only add headers if they don't already exist (to preserve CORS headers)
        if "X-Content-Type-Options" not in response.headers:
            response.headers["X-Content-Type-Options"] = "nosniff"
        if "X-Frame-Options" not in response.headers:
            response.headers["X-Frame-Options"] = "DENY"
        if "X-XSS-Protection" not in response.headers:
            response.headers["X-XSS-Protection"] = "1; mode=block"
        if "Strict-Transport-Security" not in response.headers:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response
