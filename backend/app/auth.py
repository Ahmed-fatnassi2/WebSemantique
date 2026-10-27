"""Accounts: sign up, sign in and signed session tokens (Python standard library only).

- Users are stored in backend/data/users.json (outside the ontology).
- Passwords are never stored: only a PBKDF2-SHA256 hash with a random salt.
- The token is "<payload>.<signature>": payload = user id + expiry (base64 JSON),
  signature = HMAC-SHA256 with a secret key kept in backend/data/secret.key.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from datetime import datetime, timezone

from fastapi import Header, HTTPException

from .config import AUTH_SECRET_PATH, AUTH_TOKEN_DAYS, USERS_PATH

PBKDF2_ITERATIONS = 200_000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_lock = threading.Lock()


class AuthError(Exception):
    def __init__(self, status: int, message: str, errors: dict[str, str] | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors or {}


# ------------------------------------------------------------------ storage


def _secret() -> bytes:
    env = os.getenv("AUTH_SECRET")
    if env:
        return env.encode()
    if not AUTH_SECRET_PATH.exists():
        AUTH_SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
        AUTH_SECRET_PATH.write_text(secrets.token_hex(32), encoding="utf-8")
    return AUTH_SECRET_PATH.read_text(encoding="utf-8").strip().encode()


def _load() -> list[dict]:
    if not USERS_PATH.exists():
        return []
    return json.loads(USERS_PATH.read_text(encoding="utf-8"))


def _save(users: list[dict]) -> None:
    USERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = USERS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(USERS_PATH)


def _public(user: dict) -> dict:
    return {"id": user["id"], "nom": user["nom"], "email": user["email"], "created_at": user["created_at"]}


# ---------------------------------------------------------------- passwords


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def _check_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
    except ValueError:
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


# ------------------------------------------------------------------- tokens


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def create_token(user_id: str) -> str:
    payload = _b64(json.dumps({"sub": user_id, "exp": int(time.time()) + AUTH_TOKEN_DAYS * 86400}).encode())
    signature = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def _read_token(token: str) -> str | None:
    try:
        payload, signature = token.split(".")
        expected = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(_unb64(payload))
    except (ValueError, json.JSONDecodeError):
        return None
    if data.get("exp", 0) < time.time():
        return None
    return data.get("sub")


# ------------------------------------------------------------------- public


def signup(nom: str, email: str, password: str) -> dict:
    nom, email = (nom or "").strip(), (email or "").strip().lower()
    errors: dict[str, str] = {}
    if not 2 <= len(nom) <= 60:
        errors["nom"] = "Le nom doit contenir entre 2 et 60 caractères."
    if not EMAIL_RE.match(email):
        errors["email"] = "Adresse e-mail invalide."
    if len(password or "") < 8:
        errors["password"] = "Le mot de passe doit contenir au moins 8 caractères."
    elif not (re.search(r"[A-Za-z]", password) and re.search(r"\d", password)):
        errors["password"] = "Le mot de passe doit contenir au moins une lettre et un chiffre."
    if errors:
        raise AuthError(422, "Certains champs sont invalides.", errors)
    with _lock:
        users = _load()
        if any(u["email"] == email for u in users):
            raise AuthError(409, "Un compte existe déjà avec cette adresse e-mail.", {"email": "Adresse déjà utilisée."})
        user = {
            "id": secrets.token_hex(8),
            "nom": nom,
            "email": email,
            "password": _hash_password(password),
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        users.append(user)
        _save(users)
    return {"token": create_token(user["id"]), "user": _public(user)}


def login(email: str, password: str) -> dict:
    email = (email or "").strip().lower()
    with _lock:
        user = next((u for u in _load() if u["email"] == email), None)
    # Same message whether the e-mail or the password is wrong
    if user is None or not _check_password(password or "", user["password"]):
        raise AuthError(401, "E-mail ou mot de passe incorrect.")
    return {"token": create_token(user["id"]), "user": _public(user)}


def user_from_token(token: str) -> dict | None:
    user_id = _read_token(token)
    if not user_id:
        return None
    with _lock:
        user = next((u for u in _load() if u["id"] == user_id), None)
    return _public(user) if user else None


def require_user(authorization: str | None = Header(default=None)) -> dict:
    """FastAPI dependency: every protected route needs "Authorization: Bearer <token>"."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Connexion requise.")
    user = user_from_token(authorization[7:].strip())
    if user is None:
        raise HTTPException(401, "Session expirée : reconnectez-vous.")
    return user
