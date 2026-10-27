"""Application settings, read from environment variables and backend/.env."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env")


def _path(env_name: str, default: Path) -> Path:
    value = os.getenv(env_name)
    if not value:
        return default
    p = Path(value)
    return p if p.is_absolute() else (BACKEND_DIR / p).resolve()


APP_NAME = "SmartGrid Semantic API"
APP_VERSION = "1.0.0"

# Original OWL file (never modified by the API).
ONTOLOGY_PATH = _path("ONTOLOGY_PATH", PROJECT_DIR / "SmartGrid (3).owl")
# New OWL file (RDF/XML) where every change (add, edit, delete, SPARQL UPDATE) is saved.
WORKING_GRAPH_PATH = _path("WORKING_GRAPH_PATH", PROJECT_DIR / "SmartGrid_new.owl")


CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]

SPARQL_MAX_ROWS = int(os.getenv("SPARQL_MAX_ROWS", "2000"))

# Accounts (sign in / sign up): users file and the key that signs the session tokens.
USERS_PATH = _path("USERS_PATH", BACKEND_DIR / "data" / "users.json")
AUTH_SECRET_PATH = BACKEND_DIR / "data" / "secret.key"
AUTH_TOKEN_DAYS = int(os.getenv("AUTH_TOKEN_DAYS", "7"))
