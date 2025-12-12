"""
NTHU OAuth Proxy Server
FastAPI server to run on the static IP VM

This script:
1. Receives OAuth callback from NTHU CCXP
2. Exchanges authorization code for user data
3. Forwards the data securely to Cloud Run API
4. Redirects user back to the portal with session token

Environment Variables Required:
- OAUTH_CLIENT_ID: NTHU OAuth client ID
- OAUTH_CLIENT_SECRET: NTHU OAuth client secret
- OAUTH_TOKEN_URL: NTHU token endpoint
- OAUTH_RESOURCE_URL: NTHU resource endpoint
- CLOUD_RUN_API_URL: Cloud Run API URL (e.g., https://your-app.run.app)
- AUTH_HANDSHAKE_API_KEY: Shared secret for Cloud Run authentication
- FRONTEND_URL: Frontend URL for redirects (e.g., https://your-domain.com)
"""

import os
import time
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="NTHU OAuth Proxy")

# Environment configuration
OAUTH_CLIENT_ID = os.getenv("OAUTH_CLIENT_ID")
OAUTH_CLIENT_SECRET = os.getenv("OAUTH_CLIENT_SECRET")
OAUTH_TOKEN_URL = os.getenv("OAUTH_TOKEN_URL", "https://oauth.ccxp.nthu.edu.tw/v1.1/token.php")
OAUTH_RESOURCE_URL = os.getenv("OAUTH_RESOURCE_URL", "https://oauth.ccxp.nthu.edu.tw/v1.1/resource.php")
CLOUD_RUN_API_URL = os.getenv("CLOUD_RUN_API_URL")
AUTH_HANDSHAKE_API_KEY = os.getenv("AUTH_HANDSHAKE_API_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Validate required environment variables
required_vars = [
    "OAUTH_CLIENT_ID",
    "OAUTH_CLIENT_SECRET",
    "CLOUD_RUN_API_URL",
    "AUTH_HANDSHAKE_API_KEY",
]

for var in required_vars:
    if not os.getenv(var):
        raise ValueError(f"Missing required environment variable: {var}")


class NTHUOAuthPayload(BaseModel):
    student_id: str
    name: str
    inschool: bool
    uuid: str


class AuthHandshakeRequest(BaseModel):
    api_key: str
    provider: str
    payload: NTHUOAuthPayload
    timestamp: int


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "NTHU OAuth Proxy",
        "version": "1.0.0"
    }


@app.get("/callback")
async def oauth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    """
    OAuth callback endpoint
    Receives authorization code from NTHU OAuth
    """
    
    # Handle OAuth errors
    if error:
        error_url = f"{FRONTEND_URL}/login?error={error}"
        return RedirectResponse(url=error_url)
    
    if not code:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=missing_code")
    
    try:
        # Step 1: Exchange authorization code for access token
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                OAUTH_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": OAUTH_CLIENT_ID,
                    "client_secret": OAUTH_CLIENT_SECRET,
                },
                timeout=10.0,
            )
            
            if token_response.status_code != 200:
                raise HTTPException(
                    status_code=token_response.status_code,
                    detail=f"Failed to exchange code for token: {token_response.text}"
                )
            
            token_data = token_response.json()
            access_token = token_data.get("access_token")
            
            if not access_token:
                raise HTTPException(
                    status_code=500,
                    detail="No access token in response"
                )
            
            # Step 2: Fetch user data from NTHU resource endpoint
            resource_response = await client.get(
                OAUTH_RESOURCE_URL,
                params={"access_token": access_token},
                timeout=10.0,
            )
            
            if resource_response.status_code != 200:
                raise HTTPException(
                    status_code=resource_response.status_code,
                    detail=f"Failed to fetch user data: {resource_response.text}"
                )
            
            user_data = resource_response.json()
            
            # Step 3: Prepare payload for Cloud Run
            # Map NTHU fields to our schema
            # NTHU returns: Userid, name, inschool, uuid
            nthu_payload = NTHUOAuthPayload(
                student_id=user_data.get("Userid", ""),
                name=user_data.get("name", ""),
                inschool=user_data.get("inschool", "false").lower() == "true",
                uuid=user_data.get("uuid", ""),
            )
            
            # Step 4: Forward to Cloud Run auth handshake endpoint
            handshake_request = AuthHandshakeRequest(
                api_key=AUTH_HANDSHAKE_API_KEY,
                provider="nthu",
                payload=nthu_payload,
                timestamp=int(time.time() * 1000),  # Current timestamp in milliseconds
            )
            
            handshake_url = f"{CLOUD_RUN_API_URL}/api/internal/auth-handshake"
            
            handshake_response = await client.post(
                handshake_url,
                json=handshake_request.model_dump(),
                timeout=15.0,
            )
            
            if handshake_response.status_code != 200:
                raise HTTPException(
                    status_code=handshake_response.status_code,
                    detail=f"Cloud Run handshake failed: {handshake_response.text}"
                )
            
            handshake_data = handshake_response.json()
            
            if not handshake_data.get("success"):
                raise HTTPException(
                    status_code=500,
                    detail="Handshake unsuccessful"
                )
            
            # Step 5: Redirect user to frontend with token
            session_token = handshake_data.get("token")
            
            # Redirect to a callback page that will set the session cookie
            callback_url = f"{FRONTEND_URL}/api/auth/nthu-complete?token={session_token}"
            if state:
                callback_url += f"&state={state}"
            
            return RedirectResponse(url=callback_url)
            
    except httpx.HTTPError as e:
        print(f"HTTP Error during OAuth flow: {e}")
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=http_error")
    except Exception as e:
        print(f"Error during OAuth flow: {e}")
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=internal_error")


if __name__ == "__main__":
    import uvicorn
    
    # Run with: python proxy.py
    # Or with uvicorn: uvicorn proxy:app --host 0.0.0.0 --port 8000
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        log_level="info",
    )
