FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir \
  fastapi \
  uvicorn[standard] \
  "psycopg[binary,pool]" \
  "mem0ai[graph]" \
  rank-bm25 \
  langchain-neo4j \
  neo4j

COPY deploy/mem0/server.py ./server.py

EXPOSE 8000
CMD ["python", "server.py"]
