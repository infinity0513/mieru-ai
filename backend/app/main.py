from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from .config import settings
from .database import engine, Base
from .routers import auth
from .routers import users
from .routers import uploads
from .routers import campaigns
from .routers import analysis
from .routers import notifications
# from .routers import teams  # Temporarily disabled
from .middleware.security import RateLimitMiddleware, SecurityHeadersMiddleware
# Import all models to ensure they are registered with Base
from . import models  # This will import all models via models/__init__.py
import traceback

# Create database tables (if they don't exist)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Meta Ad Analyzer AI API",
    description="SaaS-style dashboard for analyzing Meta advertising data",
    version="1.0.0"
)

# Global exception handler to ensure CORS headers are always included
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler that ensures CORS headers are included even on errors"""
    import traceback
    traceback.print_exc()
    
    # Get origin from request
    origin = request.headers.get("origin")
    
    # Check if origin is allowed
    allowed_origins = settings.cors_origins_list
    if origin in allowed_origins:
        headers = {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    else:
        headers = {}
    
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)},
        headers=headers
    )

# Security middleware (must be added before CORS)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, calls=settings.rate_limit_calls, period=60)

# CORS middleware (must be added last to ensure CORS headers are not overwritten)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])
app.include_router(campaigns.router, prefix="/api/campaigns", tags=["campaigns"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
# app.include_router(teams.router, prefix="/api/teams", tags=["teams"])  # Temporarily disabled

@app.get("/")
async def root():
    return {"message": "Meta Ad Analyzer AI API"}
