from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI
from mem0 import Memory
from pydantic import BaseModel


def build_config() -> dict[str, Any]:
    embedder_provider = os.getenv("MEM0_EMBEDDER_PROVIDER", "openai")
    embedding_model = os.getenv("MEM0_DEFAULT_EMBEDDER_MODEL", "text-embedding-3-small")
    embedding_dims = int(os.getenv("MEM0_EMBEDDING_DIMS", "1536"))

    config: dict[str, Any] = {
        "embedder": {
            "provider": embedder_provider,
            "config": {"model": embedding_model},
        },
    }

    llm_api_key = os.getenv("MEM0_LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
    if llm_api_key:
        config["llm"] = {
            "provider": "openai",
            "config": {
                "api_key": llm_api_key,
                "model": os.getenv("MEM0_DEFAULT_LLM_MODEL", "gpt-4.1-mini"),
            },
        }

    postgres_host = os.getenv("POSTGRES_HOST")
    if postgres_host:
        config["vector_store"] = {
            "provider": "pgvector",
            "config": {
                "host": postgres_host,
                "port": int(os.getenv("POSTGRES_PORT", "5432")),
                "user": os.getenv("POSTGRES_USER", "iut_ict_fest"),
                "password": os.getenv("POSTGRES_PASSWORD", "iut_ict_fest"),
                "dbname": os.getenv("POSTGRES_DB", "iut_ict_fest"),
                "collection_name": os.getenv("POSTGRES_COLLECTION_NAME", "mem0_memories"),
                "embedding_model_dims": embedding_dims,
            },
        }

    return config


app = FastAPI(title="agrisense-mem0", version="0.1.0")
memory: Memory | None = None


def mem() -> Memory:
    global memory
    if memory is None:
        memory = Memory.from_config(build_config())
    return memory


@app.on_event("startup")
def warm_memory() -> None:
    mem()


class AddRequest(BaseModel):
    messages: list[dict[str, str]]
    user_id: str
    agent_id: str | None = None
    run_id: str | None = None
    metadata: dict[str, Any] | None = None
    infer: bool = True


class SearchRequest(BaseModel):
    query: str
    user_id: str
    agent_id: str | None = None
    run_id: str | None = None
    limit: int = 10
    filters: dict[str, Any] | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/memories")
def add_memories(request: AddRequest) -> Any:
    metadata = {
        **(request.metadata or {}),
        **({"agent_id": request.agent_id} if request.agent_id else {}),
        **({"run_id": request.run_id} if request.run_id else {}),
    }
    return mem().add(
        request.messages,
        user_id=request.user_id,
        metadata=metadata,
        infer=request.infer,
    )


@app.post("/memories/search")
@app.post("/search")
def search_memories(request: SearchRequest) -> Any:
    filters = {
        **(request.filters or {}),
        "user_id": request.user_id,
        **({"agent_id": request.agent_id} if request.agent_id else {}),
        **({"run_id": request.run_id} if request.run_id else {}),
    }
    return mem().search(request.query, filters=filters, limit=request.limit)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
