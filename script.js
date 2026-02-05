// script.js
// PASTE YOUR CODESPACE URL HERE (No trailing slash)
const API_URL = "https://super-duper-engine-x55qjqj94gj6cp5vw-8000.app.github.dev"; 

let flashcards = [];
let currentIndex = 0;

const questionInput = document.getElementById('question');
const answerInput = document.getElementById('answer');
const cardQuestion = document.getElementById('card-question');
const cardAnswer = document.getElementById('card-answer');
const cardInner = document.getElementById('card-inner');
const cardIndexDisplay = document.getElementById('card-index');

// Load cards on startup
document.addEventListener('DOMContentLoaded', fetchFlashcards);

async function fetchFlashcards() {
    try {
        const res = await fetch(`${API_URL}/cards`);
        flashcards = await res.json();
        currentIndex = 0;
        updateCardDisplay();
    } catch (e) {
        console.error("Connection Error:", e);
        cardQuestion.textContent = "Check console for connection error.";
    }
}

async function addFlashcard() {
    const question = questionInput.value.trim();
    const answer = answerInput.value.trim();
    if (!question || !answer) return alert("Fill in both fields");

    await fetch(`${API_URL}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer })
    });
    
    questionInput.value = '';
    answerInput.value = '';
    await fetchFlashcards();
}

async function deleteFlashcard() {
    if (flashcards.length === 0) return;
    const id = flashcards[currentIndex].id; // SQL ID
    await fetch(`${API_URL}/cards/${id}`, { method: "DELETE" });
    await fetchFlashcards();
}

async function editFlashcard() {
    if (flashcards.length === 0) return;
    const card = flashcards[currentIndex];
    const newQ = prompt("New Question:", card.question);
    const newA = prompt("New Answer:", card.answer);
    
    if (newQ && newA) {
        await fetch(`${API_URL}/cards/${card.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: newQ, answer: newA })
        });
        await fetchFlashcards();
    }
}

// UI Logic
function updateCardDisplay() {
    if (flashcards.length === 0) {
        cardQuestion.textContent = "No cards yet.";
        cardAnswer.textContent = "...";
        cardIndexDisplay.textContent = "0 / 0";
        return;
    }
    cardInner.classList.remove('flipped');
    cardQuestion.textContent = flashcards[currentIndex].question;
    cardAnswer.textContent = flashcards[currentIndex].answer;
    cardIndexDisplay.textContent = `${currentIndex + 1} / ${flashcards.length}`;
}

function flipCard() { cardInner.classList.toggle('flipped'); }
function nextCard() { 
    if(flashcards.length) {
        currentIndex = (currentIndex + 1) % flashcards.length; 
        updateCardDisplay(); 
    }
}
function prevCard() { 
    if(flashcards.length) {
        currentIndex = (currentIndex - 1 + flashcards.length) % flashcards.length; 
        updateCardDisplay(); 
    }
}