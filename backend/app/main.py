import os
import re
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from jwt import InvalidTokenError, PyJWKClient
from jwt.exceptions import PyJWKClientError
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

# ==========================================
# 1. DATABASE SETUP (Supabase)
# ==========================================

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
DEFAULT_COLLECTION_COLOR = "#0F4C5C"
DEFAULT_COLLECTION_NAME = "Default"
HEX_COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")
COLLECTION_NAME_MAX_LENGTH = 60
MAX_COLLECTION_COLOR_LUMINANCE = 0.84
TARGET_COLLECTION_COLOR_LUMINANCE = 0.72
CARD_QUESTION_MAX_LENGTH = 480
CARD_ANSWER_MAX_LENGTH = 960
AI_TOPIC_MAX_LENGTH = 300
AI_COLLECTION_NAME_MAX_LENGTH = COLLECTION_NAME_MAX_LENGTH
AI_GENERATED_CARD_MIN_COUNT = 3
AI_GENERATED_CARD_MAX_COUNT = 15
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")


class CollectionDB(Base):
    __tablename__ = "collections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    name = Column(String)
    class_name = Column(String, nullable=True)
    color = Column(String, nullable=True)
    is_default = Column(Boolean, default=False, nullable=False)


class CardDB(Base):
    __tablename__ = "flashcards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    question = Column(String)
    answer = Column(String)
    collection_id = Column(Integer, nullable=True, index=True)
    review_count = Column(Integer, default=0, nullable=False)
    correct_count = Column(Integer, default=0, nullable=False)
    ease_factor = Column(Float, default=2.5, nullable=False)
    interval_days = Column(Integer, default=0, nullable=False)
    due_at = Column(DateTime(timezone=True), nullable=True, index=True)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    streak_current = Column(Integer, default=0, nullable=False)
    streak_best = Column(Integer, default=0, nullable=False)


def ensure_schema() -> None:
    """
    Backfill missing columns/indexes for existing databases.
    create_all() creates new tables but does not alter existing ones.
    """
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    with engine.begin() as connection:
        if "flashcards" in table_names:
            flashcard_columns = {column["name"] for column in inspector.get_columns("flashcards")}
            if "user_id" not in flashcard_columns:
                connection.execute(text("ALTER TABLE flashcards ADD COLUMN user_id VARCHAR"))
            if "collection_id" not in flashcard_columns:
                connection.execute(text("ALTER TABLE flashcards ADD COLUMN collection_id INTEGER"))
            if "review_count" not in flashcard_columns:
                connection.execute(text("ALTER TABLE flashcards ADD COLUMN review_count INTEGER"))
            if "correct_count" not in flashcard_columns:
                connection.execute(text("ALTER TABLE flashcards ADD COLUMN correct_count INTEGER"))
            if "ease_factor" not in flashcard_columns:
                connection.execute(text("ALTER TABLE flashcards ADD COLUMN ease_factor FLOAT"))
            if "interval_days" not in flashcard_columns:
                connection.execute(text("ALTER TABLE flashcards ADD COLUMN interval_days INTEGER"))
            if "due_at" not in flashcard_columns:
                connection.execute(text("ALTER TABLE flashcards ADD COLUMN due_at TIMESTAMP"))
            if "last_reviewed_at" not in flashcard_columns:
                connection.execute(text("ALTER TABLE flashcards ADD COLUMN last_reviewed_at TIMESTAMP"))
            if "streak_current" not in flashcard_columns:
                connection.execute(text("ALTER TABLE flashcards ADD COLUMN streak_current INTEGER"))
            if "streak_best" not in flashcard_columns:
                connection.execute(text("ALTER TABLE flashcards ADD COLUMN streak_best INTEGER"))

            connection.execute(
                text(
                    """
                    UPDATE flashcards
                    SET
                        review_count = COALESCE(review_count, 0),
                        correct_count = COALESCE(correct_count, 0),
                        ease_factor = COALESCE(ease_factor, 2.5),
                        interval_days = COALESCE(interval_days, 0),
                        due_at = COALESCE(due_at, CURRENT_TIMESTAMP),
                        streak_current = COALESCE(streak_current, 0),
                        streak_best = COALESCE(streak_best, 0)
                    """
                )
            )

            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_flashcards_user_id ON flashcards (user_id)"))
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_flashcards_collection_id ON flashcards (collection_id)")
            )
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_flashcards_due_at ON flashcards (due_at)"))

        if "collections" in table_names:
            collection_columns = {column["name"] for column in inspector.get_columns("collections")}
            if "color" not in collection_columns:
                connection.execute(text("ALTER TABLE collections ADD COLUMN color VARCHAR"))
            if "is_default" not in collection_columns:
                connection.execute(text("ALTER TABLE collections ADD COLUMN is_default BOOLEAN DEFAULT FALSE"))
            connection.execute(text("UPDATE collections SET is_default = COALESCE(is_default, FALSE)"))


Base.metadata.create_all(bind=engine)
ensure_schema()


# ==========================================
# 2. SUPABASE AUTH SETUP (The Gatekeeper)
# ==========================================

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_JWT_ISSUER = os.getenv("SUPABASE_JWT_ISSUER", f"{SUPABASE_URL}/auth/v1" if SUPABASE_URL else "")
SUPABASE_JWKS_CLIENT = (
    PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json") if SUPABASE_URL else None
)


def decode_supabase_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
        algorithm = header.get("alg")
        if not algorithm:
            raise HTTPException(status_code=401, detail="Invalid token header")

        decode_kwargs = {
            "algorithms": [algorithm],
            "options": {"verify_aud": False},
        }
        if SUPABASE_JWT_ISSUER:
            decode_kwargs["issuer"] = SUPABASE_JWT_ISSUER

        if algorithm.startswith("HS"):
            if not SUPABASE_JWT_SECRET:
                raise HTTPException(
                    status_code=500,
                    detail="Server auth misconfigured: missing SUPABASE_JWT_SECRET",
                )
            return jwt.decode(token, SUPABASE_JWT_SECRET, **decode_kwargs)

        if SUPABASE_JWKS_CLIENT is None:
            raise HTTPException(
                status_code=500,
                detail="Server auth misconfigured: missing SUPABASE_URL",
            )

        signing_key = SUPABASE_JWKS_CLIENT.get_signing_key_from_jwt(token)
        return jwt.decode(token, signing_key.key, **decode_kwargs)
    except HTTPException:
        raise
    except (InvalidTokenError, PyJWKClientError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(authorization: str = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization token provided")

    try:
        parts = authorization.split(" ", 1)
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise ValueError("Malformed authorization header")

        decoded_token = decode_supabase_token(parts[1])
        user_id = decoded_token.get("sub")
        if not user_id:
            raise ValueError("Token is missing subject")
        return user_id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ==========================================
# 3. APP SETUP
# ==========================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class CardSchema(BaseModel):
    question: str
    answer: str
    collection_id: Optional[int] = None


class CollectionSchema(BaseModel):
    name: str
    class_name: Optional[str] = None
    color: Optional[str] = None


class CardReviewSchema(BaseModel):
    rating: str


class CardProgressResetSchema(BaseModel):
    collection_id: Optional[int] = None


class AIGenerateCardsSchema(BaseModel):
    topic: str
    count: int = 10
    collection_name: Optional[str] = None


def normalize_collection_color(color: Optional[str]) -> str:
    if not color:
        return DEFAULT_COLLECTION_COLOR

    candidate = color.strip()
    if not HEX_COLOR_PATTERN.match(candidate):
        raise HTTPException(status_code=400, detail="Collection color must be a hex value like #0F4C5C")
    safe_color = candidate.upper()
    if get_relative_luminance(safe_color) <= MAX_COLLECTION_COLOR_LUMINANCE:
        return safe_color

    red, green, blue = parse_hex_color(safe_color)
    for _ in range(32):
        red = round(red * 0.94)
        green = round(green * 0.94)
        blue = round(blue * 0.94)
        safe_color = format_hex_color(red, green, blue)
        if get_relative_luminance(safe_color) <= TARGET_COLLECTION_COLOR_LUMINANCE:
            break
    return safe_color


def parse_hex_color(color: str) -> tuple[int, int, int]:
    return (
        int(color[1:3], 16),
        int(color[3:5], 16),
        int(color[5:7], 16),
    )


def format_hex_color(red: int, green: int, blue: int) -> str:
    return f"#{red:02X}{green:02X}{blue:02X}"


def get_relative_luminance(color: str) -> float:
    red, green, blue = parse_hex_color(color)

    def to_linear(channel: int) -> float:
        normalized = channel / 255
        if normalized <= 0.04045:
            return normalized / 12.92
        return ((normalized + 0.055) / 1.055) ** 2.4

    linear_red = to_linear(red)
    linear_green = to_linear(green)
    linear_blue = to_linear(blue)
    return (0.2126 * linear_red) + (0.7152 * linear_green) + (0.0722 * linear_blue)


def compact_text(value: str) -> str:
    return " ".join(value.strip().split())


def normalize_collection_name(value: str) -> str:
    normalized = compact_text(value)
    if not normalized:
        raise HTTPException(status_code=400, detail="Collection name is required")
    if len(normalized) > COLLECTION_NAME_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Collection name must be {COLLECTION_NAME_MAX_LENGTH} characters or fewer",
        )
    return normalized


def build_collection_name_fallback(value: str) -> str:
    normalized = compact_text(value)
    if not normalized:
        return "Study Set"
    if len(normalized) <= COLLECTION_NAME_MAX_LENGTH:
        return normalized
    return normalized[:COLLECTION_NAME_MAX_LENGTH].rstrip()


def get_owned_collection(collection_id: int, user_id: str, db: Session) -> CollectionDB:
    collection = (
        db.query(CollectionDB)
        .filter(CollectionDB.id == collection_id, CollectionDB.user_id == user_id)
        .first()
    )
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found or access denied")
    return collection


def is_default_collection(collection: Optional[CollectionDB]) -> bool:
    return bool(collection and getattr(collection, "is_default", False))


def serialize_collection(collection: CollectionDB) -> dict:
    return {
        "id": collection.id,
        "name": collection.name,
        "class_name": collection.class_name,
        "color": collection.color,
        "is_default": is_default_collection(collection),
    }


def ensure_default_collection(user_id: str, db: Session) -> tuple[CollectionDB, bool]:
    changed = False
    default_collection = (
        db.query(CollectionDB)
        .filter(CollectionDB.user_id == user_id, CollectionDB.is_default.is_(True))
        .order_by(CollectionDB.id.asc())
        .first()
    )

    if not default_collection:
        default_collection = (
            db.query(CollectionDB)
            .filter(
                CollectionDB.user_id == user_id,
                CollectionDB.name == DEFAULT_COLLECTION_NAME,
                CollectionDB.class_name.is_(None),
            )
            .order_by(CollectionDB.id.asc())
            .first()
        )
        if default_collection:
            default_collection.is_default = True
            changed = True

    if not default_collection:
        default_collection = CollectionDB(
            user_id=user_id,
            name=DEFAULT_COLLECTION_NAME,
            class_name=None,
            color=DEFAULT_COLLECTION_COLOR,
            is_default=True,
        )
        db.add(default_collection)
        db.flush()
        changed = True

    if default_collection.name != DEFAULT_COLLECTION_NAME:
        default_collection.name = DEFAULT_COLLECTION_NAME
        changed = True
    if default_collection.class_name is not None:
        default_collection.class_name = None
        changed = True

    normalized_color = normalize_collection_color(default_collection.color)
    if default_collection.color != normalized_color:
        default_collection.color = normalized_color
        changed = True
    if not default_collection.is_default:
        default_collection.is_default = True
        changed = True

    return default_collection, changed


def migrate_uncategorized_cards_to_default_collection(user_id: str, default_collection_id: int, db: Session) -> bool:
    updated_rows = (
        db.query(CardDB)
        .filter(CardDB.user_id == user_id, CardDB.collection_id.is_(None))
        .update({CardDB.collection_id: default_collection_id}, synchronize_session=False)
    )
    return updated_rows > 0


def prepare_user_collections(user_id: str, db: Session, *, migrate_cards: bool = False) -> CollectionDB:
    default_collection, changed = ensure_default_collection(user_id, db)
    if migrate_cards:
        changed = migrate_uncategorized_cards_to_default_collection(user_id, default_collection.id, db) or changed
    if changed:
        db.commit()
        db.refresh(default_collection)
    return default_collection


def get_sorted_user_collections(user_id: str, db: Session) -> list[CollectionDB]:
    collections = db.query(CollectionDB).filter(CollectionDB.user_id == user_id).all()
    return sorted(
        collections,
        key=lambda collection: (
            0 if is_default_collection(collection) else 1,
            (collection.name or "").casefold(),
            (collection.class_name or "").casefold(),
            collection.id,
        ),
    )


def normalize_card_text(value: str, field_name: str, max_length: int) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="Question and answer are required")
    if len(normalized) > max_length:
        raise HTTPException(status_code=400, detail=f"{field_name} must be {max_length} characters or fewer")
    return normalized


def get_owned_card(card_id: int, user_id: str, db: Session) -> CardDB:
    card = db.query(CardDB).filter(CardDB.id == card_id, CardDB.user_id == user_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found or access denied")
    return card


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_non_negative_int(value, fallback: int = 0) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return fallback


def as_float(value, fallback: float = 2.5) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def serialize_card(card: CardDB) -> dict:
    return {
        "id": card.id,
        "user_id": card.user_id,
        "question": card.question,
        "answer": card.answer,
        "collection_id": card.collection_id,
        "review_count": as_non_negative_int(card.review_count),
        "correct_count": as_non_negative_int(card.correct_count),
        "ease_factor": round(as_float(card.ease_factor), 2),
        "interval_days": as_non_negative_int(card.interval_days),
        "due_at": card.due_at.isoformat() if card.due_at else None,
        "last_reviewed_at": card.last_reviewed_at.isoformat() if card.last_reviewed_at else None,
        "streak_current": as_non_negative_int(card.streak_current),
        "streak_best": as_non_negative_int(card.streak_best),
    }


def apply_card_review(card: CardDB, rating: str) -> dict:
    normalized_rating = rating.strip().lower()
    if normalized_rating not in {"again", "hard", "good", "easy"}:
        raise HTTPException(status_code=400, detail="Rating must be one of: again, hard, good, easy")

    now = utc_now()
    review_count = as_non_negative_int(card.review_count) + 1
    correct_count = as_non_negative_int(card.correct_count)
    ease_factor = max(1.3, as_float(card.ease_factor))
    interval_days = as_non_negative_int(card.interval_days)
    streak_current = as_non_negative_int(card.streak_current)
    streak_best = as_non_negative_int(card.streak_best)

    if normalized_rating == "again":
        interval_days = 0
        ease_factor = max(1.3, ease_factor - 0.2)
        streak_current = 0
        due_at = now + timedelta(minutes=10)
    elif normalized_rating == "hard":
        interval_days = 1 if interval_days <= 1 else max(1, round(interval_days * 1.2))
        ease_factor = max(1.3, ease_factor - 0.15)
        streak_current += 1
        correct_count += 1
        due_at = now + timedelta(days=interval_days)
    elif normalized_rating == "good":
        growth_base = interval_days if interval_days > 0 else 1
        interval_days = max(1, round(growth_base * ease_factor))
        ease_factor = min(3.0, ease_factor + 0.05)
        streak_current += 1
        correct_count += 1
        due_at = now + timedelta(days=interval_days)
    else:
        growth_base = interval_days if interval_days > 0 else 2
        interval_days = max(2, round(growth_base * (ease_factor + 0.3)))
        ease_factor = min(3.2, ease_factor + 0.1)
        streak_current += 1
        correct_count += 1
        due_at = now + timedelta(days=interval_days)

    card.review_count = review_count
    card.correct_count = correct_count
    card.ease_factor = round(ease_factor, 2)
    card.interval_days = interval_days
    card.last_reviewed_at = now
    card.due_at = due_at
    card.streak_current = streak_current
    card.streak_best = max(streak_best, streak_current)

    return {
        "rating": normalized_rating,
        "next_due_at": due_at.isoformat(),
        "interval_days": interval_days,
    }


def normalize_topic(value: str) -> str:
    normalized = " ".join(value.strip().split())
    if not normalized:
        raise HTTPException(status_code=400, detail="Topic is required")
    if len(normalized) > AI_TOPIC_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Topic must be {AI_TOPIC_MAX_LENGTH} characters or fewer",
        )
    return normalized


def normalize_generated_card_count(value: int) -> int:
    if value < AI_GENERATED_CARD_MIN_COUNT or value > AI_GENERATED_CARD_MAX_COUNT:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Card count must be between {AI_GENERATED_CARD_MIN_COUNT} "
                f"and {AI_GENERATED_CARD_MAX_COUNT}"
            ),
        )
    return value


def normalize_optional_collection_name(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = compact_text(value)
    if not normalized:
        return None
    if len(normalized) > AI_COLLECTION_NAME_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Collection name must be {AI_COLLECTION_NAME_MAX_LENGTH} characters or fewer",
        )
    return normalized


def extract_json_object_from_text(text: str) -> dict:
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", candidate)
        candidate = re.sub(r"\s*```$", "", candidate)

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        start_index = candidate.find("{")
        end_index = candidate.rfind("}")
        if start_index < 0 or end_index <= start_index:
            raise HTTPException(status_code=502, detail="AI returned malformed JSON")
        try:
            parsed = json.loads(candidate[start_index : end_index + 1])
        except json.JSONDecodeError as error:
            raise HTTPException(status_code=502, detail="AI returned malformed JSON") from error

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="AI response must be a JSON object")
    return parsed


def extract_text_from_gemini_response(payload: dict) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        raise HTTPException(status_code=502, detail="AI did not return any candidates")

    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    text_chunks = [part.get("text", "") for part in parts if isinstance(part, dict) and part.get("text")]
    response_text = "\n".join(text_chunks).strip()
    if not response_text:
        raise HTTPException(status_code=502, detail="AI response was empty")
    return response_text


def normalize_generated_cards_payload(payload: dict, fallback_collection_name: str, requested_count: int) -> dict:
    raw_collection_name = payload.get("collection_name")
    collection_name = normalize_optional_collection_name(raw_collection_name) or build_collection_name_fallback(
        fallback_collection_name
    )

    raw_cards = payload.get("cards")
    if not isinstance(raw_cards, list):
        raise HTTPException(status_code=502, detail="AI response must include a cards array")

    normalized_cards = []
    seen_questions = set()
    for raw_card in raw_cards:
        if not isinstance(raw_card, dict):
            continue

        try:
            question = normalize_card_text(str(raw_card.get("question", "")), "Question", CARD_QUESTION_MAX_LENGTH)
            answer = normalize_card_text(str(raw_card.get("answer", "")), "Answer", CARD_ANSWER_MAX_LENGTH)
        except HTTPException:
            continue

        question_key = question.casefold()
        if question_key in seen_questions:
            continue
        seen_questions.add(question_key)

        normalized_cards.append({"question": question, "answer": answer})

        if len(normalized_cards) >= requested_count:
            break

    if len(normalized_cards) < AI_GENERATED_CARD_MIN_COUNT:
        raise HTTPException(status_code=502, detail="AI did not generate enough valid cards")

    return {
        "collection_name": collection_name,
        "cards": normalized_cards,
    }


def build_gemini_flashcard_prompt(topic: str, count: int, collection_name: Optional[str]) -> str:
    collection_instruction = (
        f'Use "{collection_name}" as the collection_name value.'
        if collection_name
        else "Set collection_name to a short, human-friendly deck title based on the topic."
    )

    return f"""
Create exactly {count} high-quality study flashcards for the topic: "{topic}".

Requirements:
- Focus on foundational facts, definitions, comparisons, and cause-effect relationships.
- Keep each question clear and answerable without extra context.
- Keep answers concise, typically one sentence or short phrase.
- Do not include numbering, markdown, or commentary.
- Avoid duplicate or near-duplicate cards.
- Ensure all cards are accurate and useful for studying.
- {collection_instruction}

Return strict JSON with this shape only:
{{
  "collection_name": "string",
  "cards": [
    {{
      "question": "string",
      "answer": "string"
    }}
  ]
}}
""".strip()


def generate_cards_with_gemini(topic: str, count: int, collection_name: Optional[str]) -> dict:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Gemini is not configured on the server")

    prompt = build_gemini_flashcard_prompt(topic, count, collection_name)
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

    request_payload = {
        "systemInstruction": {
            "parts": [
                {
                    "text": (
                        "You generate concise, accurate educational flashcards and always return "
                        "valid JSON when asked."
                    )
                }
            ]
        },
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.5,
            "responseMimeType": "application/json",
        },
    }

    try:
        response = httpx.post(
            endpoint,
            params={"key": GEMINI_API_KEY},
            json=request_payload,
            timeout=45.0,
        )
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="Could not reach Gemini") from error

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Gemini request failed ({response.status_code})")

    payload = response.json()
    response_text = extract_text_from_gemini_response(payload)
    parsed_json = extract_json_object_from_text(response_text)
    fallback_collection_name = collection_name or topic
    return normalize_generated_cards_payload(parsed_json, fallback_collection_name, count)


# ==========================================
# 4. API ENDPOINTS (Protected)
# ==========================================

@app.get("/")
def read_root():
    return {"message": "Flashcard API is running with Auth and Collections!"}


@app.get("/collections")
def get_collections(user_id: str = Depends(get_current_user), db: Session = Depends(get_db)):
    prepare_user_collections(user_id, db, migrate_cards=True)
    return [serialize_collection(collection) for collection in get_sorted_user_collections(user_id, db)]


@app.post("/collections")
def create_collection(
    collection: CollectionSchema,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prepare_user_collections(user_id, db, migrate_cards=True)
    name = normalize_collection_name(collection.name)
    class_name = collection.class_name.strip() if collection.class_name else None
    color = normalize_collection_color(collection.color)

    if name == DEFAULT_COLLECTION_NAME and class_name is None:
        raise HTTPException(status_code=409, detail="The default collection already exists")

    duplicate = (
        db.query(CollectionDB)
        .filter(
            CollectionDB.user_id == user_id,
            CollectionDB.name == name,
            CollectionDB.class_name == class_name,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="A matching collection already exists")

    new_collection = CollectionDB(user_id=user_id, name=name, class_name=class_name, color=color)
    db.add(new_collection)
    db.commit()
    db.refresh(new_collection)

    return {"message": "Collection added", **serialize_collection(new_collection)}


@app.put("/collections/{collection_id}")
def update_collection(
    collection_id: int,
    collection: CollectionSchema,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prepare_user_collections(user_id, db, migrate_cards=True)
    owned_collection = get_owned_collection(collection_id, user_id, db)
    if is_default_collection(owned_collection):
        raise HTTPException(status_code=400, detail="The default collection cannot be renamed or edited")

    name = normalize_collection_name(collection.name)
    class_name = collection.class_name.strip() if collection.class_name else None
    color = normalize_collection_color(collection.color)

    duplicate = (
        db.query(CollectionDB)
        .filter(
            CollectionDB.user_id == user_id,
            CollectionDB.id != collection_id,
            CollectionDB.name == name,
            CollectionDB.class_name == class_name,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="A matching collection already exists")

    owned_collection.name = name
    owned_collection.class_name = class_name
    owned_collection.color = color
    db.commit()
    db.refresh(owned_collection)

    return {"message": "Collection updated", **serialize_collection(owned_collection)}


@app.delete("/collections/{collection_id}")
def delete_collection(
    collection_id: int,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    default_collection = prepare_user_collections(user_id, db, migrate_cards=True)
    collection = get_owned_collection(collection_id, user_id, db)
    if is_default_collection(collection):
        raise HTTPException(status_code=400, detail="The default collection cannot be deleted")

    db.query(CardDB).filter(
        CardDB.user_id == user_id,
        CardDB.collection_id == collection.id,
    ).update({CardDB.collection_id: default_collection.id}, synchronize_session=False)

    db.delete(collection)
    db.commit()
    return {"message": f'Collection deleted. Cards moved to "{DEFAULT_COLLECTION_NAME}".'}


@app.get("/collections/{collection_id}/cards")
def get_cards_for_collection(
    collection_id: int,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prepare_user_collections(user_id, db, migrate_cards=True)
    get_owned_collection(collection_id, user_id, db)

    cards = (
        db.query(CardDB)
        .filter(CardDB.user_id == user_id, CardDB.collection_id == collection_id)
        .order_by(CardDB.id.asc())
        .all()
    )
    return [serialize_card(card) for card in cards]


@app.get("/cards")
def get_cards(
    collection_id: Optional[int] = Query(default=None),
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prepare_user_collections(user_id, db, migrate_cards=True)
    cards_query = db.query(CardDB).filter(CardDB.user_id == user_id)

    if collection_id is not None:
        get_owned_collection(collection_id, user_id, db)
        cards_query = cards_query.filter(CardDB.collection_id == collection_id)

    cards = cards_query.order_by(CardDB.id.asc()).all()
    return [serialize_card(card) for card in cards]


@app.post("/cards")
def create_card(
    card: CardSchema,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = normalize_card_text(card.question, "Question", CARD_QUESTION_MAX_LENGTH)
    answer = normalize_card_text(card.answer, "Answer", CARD_ANSWER_MAX_LENGTH)
    default_collection, default_changed = ensure_default_collection(user_id, db)

    target_collection_id = card.collection_id
    if target_collection_id is not None:
        get_owned_collection(target_collection_id, user_id, db)
    else:
        target_collection_id = default_collection.id

    new_card = CardDB(
        question=question,
        answer=answer,
        user_id=user_id,
        collection_id=target_collection_id,
        review_count=0,
        correct_count=0,
        ease_factor=2.5,
        interval_days=0,
        due_at=utc_now(),
        last_reviewed_at=None,
        streak_current=0,
        streak_best=0,
    )
    db.add(new_card)
    if default_changed:
        db.flush()
    db.commit()
    db.refresh(new_card)
    return {"message": "Card added", "id": new_card.id}


@app.delete("/cards/{card_id}")
def delete_card(card_id: int, user_id: str = Depends(get_current_user), db: Session = Depends(get_db)):
    card = get_owned_card(card_id, user_id, db)

    db.delete(card)
    db.commit()
    return {"message": "Deleted"}


@app.put("/cards/{card_id}")
def update_card(
    card_id: int,
    card_data: CardSchema,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prepare_user_collections(user_id, db, migrate_cards=True)
    db_card = get_owned_card(card_id, user_id, db)

    question = normalize_card_text(card_data.question, "Question", CARD_QUESTION_MAX_LENGTH)
    answer = normalize_card_text(card_data.answer, "Answer", CARD_ANSWER_MAX_LENGTH)
    default_collection, default_changed = ensure_default_collection(user_id, db)

    target_collection_id = card_data.collection_id
    if target_collection_id is not None:
        get_owned_collection(target_collection_id, user_id, db)
    else:
        target_collection_id = default_collection.id

    db_card.question = question
    db_card.answer = answer
    db_card.collection_id = target_collection_id
    if default_changed:
        db.flush()
    db.commit()
    return {"message": "Updated"}


@app.post("/cards/{card_id}/review")
def review_card(
    card_id: int,
    review: CardReviewSchema,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_card = get_owned_card(card_id, user_id, db)
    result = apply_card_review(db_card, review.rating)
    db.commit()
    db.refresh(db_card)
    return {
        "message": "Review recorded",
        "result": result,
        "card": serialize_card(db_card),
    }


@app.post("/cards/reset-progress")
def reset_card_progress(
    payload: CardProgressResetSchema,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prepare_user_collections(user_id, db, migrate_cards=True)
    reset_query = db.query(CardDB).filter(CardDB.user_id == user_id)

    if payload.collection_id is not None:
        get_owned_collection(payload.collection_id, user_id, db)
        reset_query = reset_query.filter(CardDB.collection_id == payload.collection_id)

    cards_to_reset = reset_query.count()
    if cards_to_reset == 0:
        return {"message": "No cards to reset", "cards_reset": 0}

    reset_query.update(
        {
            CardDB.review_count: 0,
            CardDB.correct_count: 0,
            CardDB.ease_factor: 2.5,
            CardDB.interval_days: 0,
            CardDB.due_at: utc_now(),
            CardDB.last_reviewed_at: None,
            CardDB.streak_current: 0,
            CardDB.streak_best: 0,
        },
        synchronize_session=False,
    )
    db.commit()

    return {"message": "Card progress reset", "cards_reset": cards_to_reset}


@app.post("/ai/generate-cards")
def generate_cards(
    request: AIGenerateCardsSchema,
    user_id: str = Depends(get_current_user),
):
    del user_id

    topic = normalize_topic(request.topic)
    count = normalize_generated_card_count(request.count)
    collection_name = normalize_optional_collection_name(request.collection_name)
    generated = generate_cards_with_gemini(topic, count, collection_name)

    return {
        "topic": topic,
        "count": len(generated["cards"]),
        "collection_name": generated["collection_name"],
        "cards": generated["cards"],
    }
