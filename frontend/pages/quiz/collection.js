const core = window.FlashLearnCore;
if (!core) {
    throw new Error("FlashLearnCore failed to load.");
}

const { CONFIG, getHeaders, hasValidToken } = core;
const API_URL = CONFIG.API_URL;

let collectionId = null;
let activeCollection = null;
let cards = [];
let pendingDeleteAction = null;

const titleElement = document.getElementById("collection-title");
const subtitleElement = document.getElementById("collection-subtitle");
const cardCountElement = document.getElementById("collection-card-count");
const classNameElement = document.getElementById("collection-class-name");
const masteryValueElement = document.getElementById("collection-mastery-value");
const masteryFillElement = document.getElementById("collection-mastery-fill");
const statusElement = document.getElementById("collection-status");
const cardsListElement = document.getElementById("cards-list");
const cardsEmptyElement = document.getElementById("cards-empty");

const startStudyButton = document.getElementById("start-study-btn");
const manageSetButton = document.getElementById("manage-set-btn");
const deleteSetButton = document.getElementById("delete-set-btn");

const confirmModal = document.getElementById("confirm-modal");
const confirmCancelButton = document.getElementById("confirm-cancel");
const confirmAcceptButton = document.getElementById("confirm-accept");

document.addEventListener("DOMContentLoaded", initializeCollectionPage);

function toNonNegativeInteger(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
}

function getCardMasteryScore(card) {
    const reviews = toNonNegativeInteger(card?.review_count, 0);
    if (reviews <= 0) return 0;
    const correct = Math.min(reviews, toNonNegativeInteger(card?.correct_count, 0));
    return correct / reviews;
}

function getMasteryPercent(items) {
    if (!items.length) return 0;
    const scoreSum = items.reduce((sum, card) => sum + getCardMasteryScore(card), 0);
    return Math.round((scoreSum / items.length) * 100);
}

function normalizeCardPayload(card) {
    return {
        ...card,
        review_count: toNonNegativeInteger(card?.review_count, 0),
        correct_count: toNonNegativeInteger(card?.correct_count, 0),
        ease_factor: Math.max(1.3, toNumber(card?.ease_factor, 2.5)),
        interval_days: toNonNegativeInteger(card?.interval_days, 0),
        due_at: typeof card?.due_at === "string" && card.due_at.trim() ? card.due_at : null,
        last_reviewed_at: typeof card?.last_reviewed_at === "string" && card.last_reviewed_at.trim()
            ? card.last_reviewed_at
            : null,
        streak_current: toNonNegativeInteger(card?.streak_current, 0),
        streak_best: toNonNegativeInteger(card?.streak_best, 0),
    };
}

function setStatus(message = "", tone = "info") {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.classList.remove("is-error", "is-success");
    if (tone === "error") statusElement.classList.add("is-error");
    if (tone === "success") statusElement.classList.add("is-success");
}

function parseCollectionId() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("collection");
    const parsed = Number.parseInt(value || "", 10);
    return Number.isInteger(parsed) ? String(parsed) : null;
}

function renderCardsList() {
    if (!cardsListElement || !cardsEmptyElement) return;
    cardsListElement.innerHTML = "";

    if (!cards.length) {
        cardsEmptyElement.textContent = "No cards in this set yet.";
        cardsEmptyElement.classList.remove("is-hidden");
        return;
    }

    cardsEmptyElement.classList.add("is-hidden");
    for (const card of cards) {
        const row = document.createElement("article");
        row.className = "card-row";
        row.innerHTML = `
            <div class="card-col">
                <p class="card-label">Term</p>
                <p class="card-value">${escapeHtml(card.question || "Untitled")}</p>
            </div>
            <div class="card-col">
                <p class="card-label">Definition</p>
                <p class="card-value">${escapeHtml(card.answer || "-")}</p>
            </div>
        `;
        cardsListElement.appendChild(row);
    }
}

function renderCollectionHeader() {
    if (!activeCollection) return;

    const title = activeCollection.name || "Untitled Collection";
    const className = activeCollection.class_name || null;
    const masteryPercent = getMasteryPercent(cards);

    if (titleElement) titleElement.textContent = title;
    if (subtitleElement) {
        if (activeCollection.is_default) {
            subtitleElement.textContent = "Your default study set for quick-add and reassigned cards.";
        } else {
            subtitleElement.textContent = className
                ? `Key terms and definitions for ${className}`
                : "Key terms and definitions for this collection";
        }
    }
    if (cardCountElement) {
        const countLabel = cards.length === 1 ? "1 card" : `${cards.length} cards`;
        cardCountElement.textContent = countLabel;
    }
    if (classNameElement) {
        classNameElement.textContent = className ? `Class: ${className}` : "Class: Not specified";
    }
    if (masteryValueElement) masteryValueElement.textContent = `${masteryPercent}%`;
    if (masteryFillElement) masteryFillElement.style.width = `${masteryPercent}%`;
    if (deleteSetButton) {
        deleteSetButton.disabled = Boolean(activeCollection.is_default);
        deleteSetButton.title = activeCollection.is_default
            ? "The default collection cannot be deleted."
            : "";
    }
}

function openConfirmModal() {
    if (!confirmModal) return;
    confirmModal.classList.add("is-open");
    confirmModal.setAttribute("aria-hidden", "false");
}

function closeConfirmModal() {
    if (!confirmModal) return;
    confirmModal.classList.remove("is-open");
    confirmModal.setAttribute("aria-hidden", "true");
}

function setupModalEvents() {
    if (confirmCancelButton) {
        confirmCancelButton.addEventListener("click", () => {
            pendingDeleteAction = null;
            closeConfirmModal();
        });
    }

    if (confirmAcceptButton) {
        confirmAcceptButton.addEventListener("click", async () => {
            const action = pendingDeleteAction;
            pendingDeleteAction = null;
            closeConfirmModal();
            if (typeof action === "function") {
                await action();
            }
        });
    }

    if (confirmModal) {
        confirmModal.addEventListener("click", (event) => {
            if (event.target === confirmModal) {
                pendingDeleteAction = null;
                closeConfirmModal();
            }
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && confirmModal?.classList.contains("is-open")) {
            pendingDeleteAction = null;
            closeConfirmModal();
        }
    });
}

function setupActions() {
    if (startStudyButton) {
        startStudyButton.addEventListener("click", () => {
            if (!collectionId) return;
            const target = new URL("./study-session.html", window.location.href);
            target.searchParams.set("collection", collectionId);
            window.location.href = target.toString();
        });
    }

    if (manageSetButton) {
        manageSetButton.addEventListener("click", () => {
            window.location.href = "../study/index.html";
        });
    }

    if (deleteSetButton) {
        deleteSetButton.addEventListener("click", () => {
            if (!hasValidToken()) {
                setStatus("Please log in to delete this collection.", "error");
                return;
            }
            if (!activeCollection) {
                setStatus("Collection is not loaded yet.", "error");
                return;
            }
            if (activeCollection.is_default) {
                setStatus("The default collection cannot be deleted.", "error");
                return;
            }

            pendingDeleteAction = async () => {
                try {
                    const response = await fetch(`${API_URL}/collections/${activeCollection.id}`, {
                        method: "DELETE",
                        headers: getHeaders(),
                    });

                    if (response.status === 401) {
                        setStatus("Session expired. Please log in again.", "error");
                        return;
                    }
                    if (!response.ok) {
                        throw new Error(`Delete failed (HTTP ${response.status}).`);
                    }

                    setStatus("Collection deleted. Cards moved to Default.", "success");
                    setTimeout(() => {
                        window.location.href = "./quiz.html";
                    }, 300);
                } catch (error) {
                    console.error("Delete collection failed:", error);
                    setStatus("Could not delete this collection right now.", "error");
                }
            };
            openConfirmModal();
        });
    }
}

async function fetchCollectionAndCards() {
    if (!hasValidToken()) {
        setStatus("Please log in to view this collection.", "error");
        if (titleElement) titleElement.textContent = "Sign in required";
        if (subtitleElement) subtitleElement.textContent = "You must be logged in to access this set.";
        cards = [];
        renderCardsList();
        return;
    }

    try {
        const [collectionsResponse, cardsResponse] = await Promise.all([
            fetch(`${API_URL}/collections`, { method: "GET", headers: getHeaders() }),
            fetch(`${API_URL}/cards`, { method: "GET", headers: getHeaders() }),
        ]);

        if (collectionsResponse.status === 401 || cardsResponse.status === 401) {
            setStatus("Session expired. Please log in again.", "error");
            return;
        }

        if (!collectionsResponse.ok || !cardsResponse.ok) {
            throw new Error("Could not load collection details.");
        }

        const collectionsPayload = await collectionsResponse.json();
        const cardsPayload = await cardsResponse.json();
        const collectionItems = Array.isArray(collectionsPayload) ? collectionsPayload : [];
        const cardItems = Array.isArray(cardsPayload) ? cardsPayload.map(normalizeCardPayload) : [];

        activeCollection = collectionItems.find((collection) => String(collection.id) === String(collectionId)) || null;
        if (!activeCollection) {
            if (titleElement) titleElement.textContent = "Collection not found";
            if (subtitleElement) subtitleElement.textContent = "This collection may have been removed.";
            cards = [];
            renderCardsList();
            setStatus("Collection was not found.", "error");
            return;
        }

        cards = cardItems.filter((card) => String(card.collection_id) === String(activeCollection.id));
        renderCollectionHeader();
        renderCardsList();
        setStatus("");
    } catch (error) {
        console.error("Failed to load collection page:", error);
        setStatus("Could not load this collection right now.", "error");
    }
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function initializeCollectionPage() {
    collectionId = parseCollectionId();
    setupModalEvents();
    setupActions();

    window.addEventListener("flashlearn:auth-error", (event) => {
        const message = event?.detail?.message || "Authentication failed. Please try again.";
        setStatus(message, "error");
    });

    if (!collectionId) {
        if (titleElement) titleElement.textContent = "Invalid collection";
        if (subtitleElement) subtitleElement.textContent = "No collection ID was provided.";
        setStatus("Open this page from a collection card.", "error");
        return;
    }

    const authReady = window.authReady;
    if (authReady && typeof authReady.then === "function") {
        try {
            await authReady;
        } catch (error) {
            console.error("Auth bootstrap failed:", error);
        }
    }

    await fetchCollectionAndCards();
}
