"""SmartGrid Semantic — FastAPI + RDFLib backend.

Run from the backend/ folder:
    uvicorn app.main:app --reload --port 8000
"""
from fastapi import APIRouter, Body, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from . import auth, dashboard, entities, nlp, ontology, sparql_service
from .config import (
    APP_NAME,
    APP_VERSION,
    CORS_ORIGINS,
    ONTOLOGY_PATH,
    SPARQL_MAX_ROWS,
    WORKING_GRAPH_PATH,
)
from .store import store

app = FastAPI(title=APP_NAME, version=APP_VERSION)


@app.on_event("startup")
def _load_nlp() -> None:
    # Load spaCy and train the three intent classifiers once, so the first question is fast.
    nlp.warm_up()
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(entities.ValidationError)
async def _validation_handler(_, exc: entities.ValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.message, "errors": exc.errors})


@app.exception_handler(entities.NotFoundError)
async def _not_found_handler(_, exc: entities.NotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(auth.AuthError)
async def _auth_handler(_, exc: auth.AuthError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message, "errors": exc.errors})


# Public routes: health check and accounts. Every other route needs a signed-in user.
public = APIRouter(prefix="/api")
api = APIRouter(prefix="/api", dependencies=[Depends(auth.require_user)])


# ---------------------------------------------------------------- accounts


class SignupRequest(BaseModel):
    nom: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


@public.post("/auth/signup", status_code=201)
def signup(req: SignupRequest):
    return auth.signup(req.nom, req.email, req.password)


@public.post("/auth/login")
def login(req: LoginRequest):
    return auth.login(req.email, req.password)


@api.get("/auth/me")
def me(user: dict = Depends(auth.require_user)):
    return user


# ------------------------------------------------------------------ system


@public.get("/health")
def health():
    return {"status": "ok", "triples": len(store.graph), "loaded_at": store.loaded_at}


@api.get("/info")
def info():
    return {
        "app": APP_NAME,
        "version": APP_VERSION,
        "ontology_file": ONTOLOGY_PATH.name,
        "ontology_path": str(ONTOLOGY_PATH),
        "working_copy": str(WORKING_GRAPH_PATH),
        "working_copy_exists": WORKING_GRAPH_PATH.exists(),
        "loaded_from": store.loaded_from,
        "loaded_at": store.loaded_at,
        "sparql_max_rows": SPARQL_MAX_ROWS,
        "nlp": nlp.engine_info(),
        "ontology": ontology.summary(),
    }


@api.post("/system/reset")
def reset_graph():
    store.reset()
    return {"status": "ok", "triples": len(store.graph)}


@api.get("/activity")
def activity(limit: int = Query(20, ge=1, le=100)):
    return list(store.activity)[:limit]


@api.get("/dashboard/stats")
def dashboard_stats():
    return dashboard.stats()


# ---------------------------------------------------------------- entities


def _register_entity_routes(key: str) -> None:
    spec = entities.get_spec(key)

    @api.get(f"/{key}", name=f"list_{key}")
    def list_items(
        search: str | None = None,
        type: str | None = None,
        status: str | None = None,
        sort: str | None = None,
        order: str = Query("asc", pattern="^(asc|desc)$"),
        page: int = Query(1, ge=1),
        page_size: int = Query(10, ge=1, le=500),
    ):
        return entities.query_list(spec, search, type, status, sort, order, page, page_size)

    @api.get(f"/{key}/types", name=f"types_{key}")
    def list_types():
        return entities.type_options(spec)

    @api.get(f"/{key}/{{entity_id}}", name=f"get_{key}")
    def get_item(entity_id: str):
        return entities.get_one(spec, entity_id)

    @api.post(f"/{key}", status_code=201, name=f"create_{key}")
    def create_item(payload: dict = Body(...)):
        return entities.create(spec, payload)

    @api.put(f"/{key}/{{entity_id}}", name=f"update_{key}")
    def update_item(entity_id: str, payload: dict = Body(...)):
        return entities.update(spec, entity_id, payload)

    @api.delete(f"/{key}/{{entity_id}}", status_code=204, name=f"delete_{key}")
    def delete_item(entity_id: str):
        entities.delete(spec, entity_id)
        return Response(status_code=204)


for _key in entities.SPECS:
    _register_entity_routes(_key)


# ---------------------------------------------------------------- ontology


@api.get("/ontology/summary")
def ontology_summary():
    return ontology.summary()


@api.get("/ontology/classes")
def ontology_classes():
    return ontology.classes()


@api.get("/ontology/object-properties")
def ontology_object_properties():
    return ontology.object_properties()


@api.get("/ontology/data-properties")
def ontology_data_properties():
    return ontology.data_properties()


@api.get("/ontology/individuals")
def ontology_individuals(class_id: str | None = Query(None, alias="class")):
    return ontology.individuals(class_id)


@api.get("/ontology/individuals/{ind_id}")
def ontology_individual(ind_id: str):
    detail = ontology.individual_detail(ind_id)
    if detail is None:
        raise HTTPException(404, f"Individu introuvable : {ind_id}")
    return detail


@api.get("/ontology/export")
def ontology_export(format: str = Query("turtle", pattern="^(turtle|xml|json-ld|nt)$")):
    media = {
        "turtle": ("text/turtle", "ttl"),
        "xml": ("application/rdf+xml", "owl"),
        "json-ld": ("application/ld+json", "jsonld"),
        "nt": ("application/n-triples", "nt"),
    }[format]
    with store.lock:
        data = store.graph.serialize(format=format)
    return Response(
        content=data,
        media_type=media[0],
        headers={"Content-Disposition": f'attachment; filename="smartgrid.{media[1]}"'},
    )


@api.get("/grid")
def grid():
    return ontology.network()


# ------------------------------------------------------------------ sparql


class SparqlRequest(BaseModel):
    query: str
    allow_update: bool = False


@api.post("/sparql")
def run_sparql(req: SparqlRequest):
    try:
        return sparql_service.execute(req.query, allow_update=req.allow_update)
    except sparql_service.ConfirmationRequired:
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Cette requête modifie le graphe. Confirmation requise.",
                "code": "CONFIRMATION_REQUIRED",
                "query_type": "update",
            },
        )
    except sparql_service.SparqlError as exc:
        raise HTTPException(400, str(exc)) from None


@api.post("/sparql/analyze")
def analyze_sparql(req: SparqlRequest):
    try:
        qtype = sparql_service.analyze(req.query)
        return {"valid": True, "query_type": qtype, "is_mutation": qtype == "update", "error": None}
    except sparql_service.SparqlError as exc:
        return {"valid": False, "query_type": None, "is_mutation": False, "error": str(exc)}


# --------------------------------------------------------------------- nlp


class NlpRequest(BaseModel):
    question: str
    # one assistant per domain: sources (membre 1), batiments (membre 2), lignes (membre 3)
    domain: str = "sources"


@api.post("/nlp/ask")
def nlp_ask(req: NlpRequest):
    if not req.question.strip():
        raise HTTPException(400, "La question est vide.")
    if len(req.question) > 500:
        raise HTTPException(400, "La question est trop longue (500 caractères maximum).")
    if req.domain not in nlp.DOMAINES:
        raise HTTPException(400, f"Domaine inconnu : {req.domain} (sources, batiments ou lignes).")
    return nlp.ask(req.question, req.domain)


@api.get("/nlp/info")
def nlp_info():
    return nlp.engine_info()


app.include_router(public)
app.include_router(api)


@app.get("/")
def root():
    return {"app": APP_NAME, "docs": "/docs", "api": "/api"}
