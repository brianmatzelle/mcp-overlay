"""
Authentication middleware for FastAPI using Auth0 JWT tokens

This module provides JWT verification and user management for the Manim MCP server.
"""
from typing import Optional
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx
import os
from functools import lru_cache

# Security scheme for Swagger docs
security = HTTPBearer()

# Auth0 configuration
AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")
AUTH0_API_AUDIENCE = os.getenv("AUTH0_API_AUDIENCE")
AUTH0_ISSUER = os.getenv("AUTH0_ISSUER", f"https://{AUTH0_DOMAIN}/")
AUTH0_ALGORITHMS = ["RS256"]


@lru_cache()
def get_jwks():
    """
    Fetch and cache Auth0's JSON Web Key Set (JWKS)
    
    The JWKS contains the public keys used to verify JWT signatures.
    We cache this to avoid fetching on every request.
    """
    if not AUTH0_DOMAIN:
        raise ValueError("AUTH0_DOMAIN environment variable not set")
    
    jwks_url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
    
    try:
        response = httpx.get(jwks_url, timeout=10.0)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch Auth0 JWKS: {str(e)}"
        )


def verify_token(token: str) -> dict:
    """
    Verify and decode a JWT token from Auth0
    
    Args:
        token: The JWT token string
        
    Returns:
        dict: The decoded token payload containing user information
        
    Raises:
        HTTPException: If token is invalid, expired, or verification fails
    """
    if not AUTH0_DOMAIN or not AUTH0_API_AUDIENCE:
        raise HTTPException(
            status_code=500,
            detail="Auth0 configuration not set"
        )
    
    try:
        # Get the JWKS
        jwks = get_jwks()
        
        # Decode and verify the token
        # This validates:
        # - Signature (using Auth0's public key)
        # - Expiration time
        # - Issuer (Auth0 tenant)
        # - Audience (our API identifier)
        payload = jwt.decode(
            token,
            jwks,
            algorithms=AUTH0_ALGORITHMS,
            audience=AUTH0_API_AUDIENCE,
            issuer=AUTH0_ISSUER
        )
        
        return payload
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token has expired"
        )
    except jwt.JWTClaimsError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token claims (audience or issuer)"
        )
    except JWTError as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid token: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Token verification failed: {str(e)}"
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> dict:
    """
    FastAPI dependency to get the current authenticated user
    
    Usage in route:
        @app.get("/protected")
        async def protected_route(user = Depends(get_current_user)):
            return {"user_id": user["sub"]}
    
    Args:
        credentials: HTTP Bearer token from Authorization header
        
    Returns:
        dict: User information from JWT payload:
            - sub: User ID (Auth0 user ID)
            - email: User email (if scope includes email)
            - permissions: List of user permissions (if using RBAC)
            
    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials
    user_payload = verify_token(token)
    
    # The 'sub' field is the Auth0 user ID (e.g., "auth0|123456")
    # You can use this to look up the user in your database
    return user_payload


async def get_current_user_with_db(
    user_payload: dict = Depends(get_current_user),
    # db: Session = Depends(get_db)  # Uncomment when database is set up
) -> dict:
    """
    Get current user with database record
    
    This extends get_current_user to also fetch/create the user in the database.
    Use this dependency when you need user information beyond the JWT.
    
    Args:
        user_payload: JWT payload from get_current_user
        db: Database session (add when database is set up)
        
    Returns:
        dict: Full user object including database fields:
            - id: Database user ID (UUID)
            - auth0_id: Auth0 user ID
            - email: User email
            - subscription_tier: free/pro/enterprise
            - max_tool_calls_per_month: Rate limit
            - tool_calls_this_month: Current usage
    """
    auth0_id = user_payload["sub"]
    email = user_payload.get("email")
    
    # TODO: Implement database lookup/creation
    # Example:
    # user = db.query(User).filter(User.auth0_id == auth0_id).first()
    # if not user:
    #     user = User(
    #         auth0_id=auth0_id,
    #         email=email,
    #         subscription_tier='free',
    #         max_tool_calls_per_month=100
    #     )
    #     db.add(user)
    #     db.commit()
    #     db.refresh(user)
    
    # For now, return mock data
    return {
        "auth0_id": auth0_id,
        "email": email,
        "subscription_tier": "free",
        "max_tool_calls_per_month": 100,
        "tool_calls_this_month": 0
    }


def check_rate_limit(user: dict) -> None:
    """
    Check if user has exceeded their rate limit
    
    Args:
        user: User object from get_current_user_with_db
        
    Raises:
        HTTPException: If user has exceeded their rate limit
    """
    if user["tool_calls_this_month"] >= user["max_tool_calls_per_month"]:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Your {user['subscription_tier']} plan allows "
                   f"{user['max_tool_calls_per_month']} tool calls per month. "
                   f"Upgrade your plan to continue."
        )


# Optional: Middleware to add user context to all requests
# from fastapi import Request
# from starlette.middleware.base import BaseHTTPMiddleware
# 
# class AuthMiddleware(BaseHTTPMiddleware):
#     async def dispatch(self, request: Request, call_next):
#         # Skip auth for health check
#         if request.url.path == "/health":
#             return await call_next(request)
#         
#         # Get token from header
#         auth_header = request.headers.get("Authorization")
#         if not auth_header or not auth_header.startswith("Bearer "):
#             raise HTTPException(status_code=401, detail="Missing authentication")
#         
#         token = auth_header.replace("Bearer ", "")
#         user = verify_token(token)
#         
#         # Add user to request state
#         request.state.user = user
#         
#         response = await call_next(request)
#         return response


# Example usage in server.py:
"""
from fastapi import Depends
from core.auth import get_current_user, get_current_user_with_db, check_rate_limit

# Protect MCP endpoint
@app.post("/mcp")
async def mcp_endpoint(
    request: Request,
    user = Depends(get_current_user_with_db)
):
    # Check rate limit
    check_rate_limit(user)
    
    # Increment tool call counter (TODO: implement in database)
    # user.tool_calls_this_month += 1
    # db.commit()
    
    # Process MCP request
    # ...
    pass

# Public health check (no auth required)
@app.get("/health")
async def health_check():
    return {"status": "healthy"}
"""

