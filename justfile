dev:
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    uv run uvicorn server:app --port 9000 --reload &
    cd frontend && npm run dev &
    wait
