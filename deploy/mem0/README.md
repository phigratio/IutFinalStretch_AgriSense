# Mem0 Service

This image extends the upstream Mem0 API server with the Postgres and graph
dependencies needed by the compose stack.

Runtime persistence is mounted by `docker-compose.yml`:

- `mem0-history:/app/history` keeps Mem0's SQLite history/audit database.
- `postgres-data:/var/lib/postgresql/data` keeps the shared Postgres + pgvector
  database used by the backend RAG schema and Mem0 vector storage.
- `mem0-neo4j-data:/data` keeps Mem0 graph memory data.
