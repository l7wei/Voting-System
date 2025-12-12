"""
Lightweight FastAPI proxy for NTHU OAuth callback.

Runs on the static-IP VM and forwards verified user payloads to the Cloud Run
endpoint `/api/internal/auth-handshake`, secured by a shared secret.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse

load_dotenv()

app = FastAPI(title="NTHUSA Auth Proxy", version="1.0.0")

TRUTHY_VALUES = {"y", "yes", "true", "1", "t"}


class OAuthError(HTTPException):
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(status_code=status_code, detail=detail)


def env(name: str, required: bool = True) -> Optional[str]:
    value = os.getenv(name)
    if required and not value:
        raise OAuthError(f"Missing required env: {name}", status_code=500)
    return value


async def exchange_code_for_token(code: str) -> str:
    token_url = env("NTHU_TOKEN_URL")
    data = {
        "grant_type": "authorization_code",
        "client_id": env("NTHU_CLIENT_ID"),
        "client_secret": env("NTHU_CLIENT_SECRET"),
        "code": code,
        "redirect_uri": env("NTHU_REDIRECT_URI", required=False),
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(token_url, data=data)
        if resp.status_code != 200:
            raise OAuthError(
                f"Token exchange failed: {resp.status_code} {resp.text}",
                status_code=resp.status_code,
            )
        body = resp.json()
        access_token = body.get("access_token")
        if not access_token:
            raise OAuthError("Missing access_token in token response")
        return access_token


async def fetch_userinfo(access_token: str) -> Dict[str, Any]:
    resource_url = env("NTHU_RESOURCE_URL")
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            resource_url, headers={"Authorization": f"Bearer {access_token}"}
        )
        if resp.status_code != 200:
            raise OAuthError(
                f"Resource fetch failed: {resp.status_code} {resp.text}",
                status_code=resp.status_code,
            )
        return resp.json()


async def forward_to_portal(userinfo: Dict[str, Any]) -> Dict[str, Any]:
    cloud_run_url = env("CLOUD_RUN_CALLBACK")
    shared_secret = env("AUTH_PROXY_SHARED_SECRET")

    def to_bool(value: Any) -> bool:
        return str(value).strip().lower() in TRUTHY_VALUES

    payload = {
        "student_id": userinfo.get("userid") or userinfo.get("student_id"),
        "name": userinfo.get("name") or userinfo.get("username"),
        "email": userinfo.get("email") or userinfo.get("mail"),
        "inschool": to_bool(userinfo.get("inschool")),
        "auth_provider": "nthu",
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            cloud_run_url,
            headers={"x-internal-api-key": shared_secret},
            json=payload,
        )
        if resp.status_code >= 300:
            raise OAuthError(
                f"Portal handshake failed: {resp.status_code} {resp.text}",
                status_code=resp.status_code,
            )
        return resp.json()


@app.get("/callback")
async def callback(code: str, state: Optional[str] = None):
    """
    OAuth callback entrypoint registered with NTHU.
    """
    try:
        access_token = await exchange_code_for_token(code)
        userinfo = await fetch_userinfo(access_token)
        portal_response = await forward_to_portal(userinfo)

        redirect_url = os.getenv("APP_SUCCESS_REDIRECT")
        if redirect_url:
            return RedirectResponse(url=redirect_url, status_code=302)

        return JSONResponse(
            content={"ok": True, "portal_response": portal_response, "state": state}
        )
    except OAuthError as exc:
        raise exc
    except Exception as exc:  # pragma: no cover - safeguard
        raise OAuthError(f"Unexpected error: {exc}", status_code=500)
