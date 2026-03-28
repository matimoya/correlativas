import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

DATA_DIR = Path(__file__).parent / "data"
MATERIAS_PATH = DATA_DIR / "materias.json"
SAVE_PATH = DATA_DIR / "progress.json"


class ScheduleBlock(BaseModel):
    day: str
    start: str
    end: str
    classroom: str = ""


class EnrolledSubject(BaseModel):
    code: str
    schedule: list[ScheduleBlock] = []


class ProgressPayload(BaseModel):
    approved: dict[str, int | None]
    electives: dict[str, str] = {}
    plan: dict[str, list[str]] = {}
    enrolled: list[EnrolledSubject] = []


@app.get("/api/materias")
def get_materias():
    with open(MATERIAS_PATH, encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/progress")
def get_progress():
    if SAVE_PATH.exists():
        with open(SAVE_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"approved": {}, "electives": {}, "plan": {}, "enrolled": []}


@app.post("/api/progress")
def save_progress(payload: ProgressPayload):
    data = {
        "approved": payload.approved,
        "electives": payload.electives,
        "plan": payload.plan,
        "enrolled": [e.model_dump() for e in payload.enrolled],
    }
    with open(SAVE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return {"status": "ok"}


DIST_DIR = Path(__file__).parent / "dist"
app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="static")
