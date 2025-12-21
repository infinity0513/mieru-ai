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
        # Handle trailing slash redirects with HTTPS
        if request.url.path.endswith("/") == False and request.url.path.count("/") > 1:
            # Check if there's a route with trailing slash
            # FastAPI will handle this, but we need to ensure HTTPS in redirect
            pass
        
        response = await call_next(request)
        
        # If response is a redirect (307), ensure it uses HTTPS
        if isinstance(response, RedirectResponse) and response.status_code in [301, 302, 307, 308]:
            redirect_url = str(response.headers.get("location", ""))
            if redirect_url.startswith("http://"):
                # Replace http:// with https://
                redirect_url = redirect_url.replace("http://", "https://", 1)
                response.headers["location"] = redirect_url
        
        # Add security headers (but don't overwrite CORS headers)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response
