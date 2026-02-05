# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# --- DATABASE SETUP ---
# PASTE YOUR SUPABASE URI HERE!
SQLALCHEMY_DATABASE_URL = "postgresql://postgres.sfxtsemiitbruxmdurva:3vnfynax2026@aws-0-us-west-2.pooler.supabase.com:6543/postgres"

# Connect to the cloud database
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Define the Table Structure
class CardDB(Base):
    __tablename__ = "flashcards"
    id = Column(Integer, primary_key=True, index=True)
    question = Column(String)
    answer = Column(String)

# Create the table in the cloud if it doesn't exist
Base.metadata.create_all(bind=engine)

# --- APP SETUP ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows your frontend to talk to this server
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- API ENDPOINTS ---
class CardSchema(BaseModel):
    question: str
    answer: str

@app.get("/cards")
def get_cards():
    db = SessionLocal()
    cards = db.query(CardDB).all()
    db.close()
    return cards

@app.post("/cards")
def create_card(card: CardSchema):
    db = SessionLocal()
    new_card = CardDB(question=card.question, answer=card.answer)
    db.add(new_card)
    db.commit()
    db.refresh(new_card)
    db.close()
    return {"message": "Card added", "id": new_card.id}

@app.delete("/cards/{card_id}")
def delete_card(card_id: int):
    db = SessionLocal()
    card = db.query(CardDB).filter(CardDB.id == card_id).first()
    if not card:
        db.close()
        raise HTTPException(status_code=404, detail="Card not found")
    db.delete(card)
    db.commit()
    db.close()
    return {"message": "Deleted"}

@app.put("/cards/{card_id}")
def update_card(card_id: int, card: CardSchema):
    db = SessionLocal()
    db_card = db.query(CardDB).filter(CardDB.id == card_id).first()
    if not db_card:
        db.close()
        raise HTTPException(status_code=404, detail="Card not found")
    
    db_card.question = card.question
    db_card.answer = card.answer
    db.commit()
    db.close()
    return {"message": "Updated"}