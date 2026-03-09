const core = window.FlashLearnCore;
if (!core) {
    throw new Error("FlashLearnCore failed to load.");
}

const { CONFIG, getHeaders, hasValidToken } = core;
const API_URL = CONFIG.API_URL;
const BACKGROUND_MODE_STORAGE_KEY = "flashlearn.background.mode";
const REVIEW_RATINGS = ["again", "easy"];

let collections = [];
let allCards = [];
let filteredCards = [];
let activeCollection = "all";
let currentIndex = 0;
let collectionSearchTerm = "";

const collectionSelect = document.getElementById("quiz-collection-select");
const collectionSearchInput = document.getElementById("quiz-search-input");
const refreshButton = document.getElementById("refresh-cards-btn");
const activeScopeText = document.getElementById("quiz-active-scope");
const collectionGrid = document.getElementById("quiz-collection-grid");
const collectionEmptyElement = document.getElementById("quiz-collection-empty");
const quizPanel = document.getElementById("quiz-panel");
const panelTitleElement = document.getElementById("quiz-panel-title");

const setCountElement = document.getElementById("quiz-set-count");
const totalCardsElement = document.getElementById("quiz-total");
const avgMasteryElement = document.getElementById("quiz-avg-mastery");
const reviewedTodayElement = document.getElementById("quiz-reviewed-today");

const questionElement = document.getElementById("quiz-question");
const answerWrapElement = document.getElementById("quiz-answer-wrap");
const answerElement = document.getElementById("quiz-answer");
const answerForm = document.getElementById("quiz-answer-form");
const answerInput = document.getElementById("quiz-answer-input");
const revealButton = document.getElementById("reveal-answer-btn");
const cardIndexElement = document.getElementById("quiz-card-index");
const prevButton = document.getElementById("quiz-prev-btn");
const nextButton = document.getElementById("quiz-next-btn");
const statusElement = document.getElementById("quiz-status");
const resetConfirmModal = document.getElementById("reset-confirm-modal");
const resetConfirmMessage = document.getElementById("reset-confirm-message");
const resetConfirmCancelButton = document.getElementById("reset-confirm-cancel");
const resetConfirmAcceptButton = document.getElementById("reset-confirm-accept");

document.addEventListener("DOMContentLoaded", initializeQuizPage);

async function waitForAuthBootstrap() {
    const authReady = window.authReady;
    if (authReady && typeof authReady.then === "function") {
        try {
            await authReady;
        } catch (error) {
            console.error("Auth bootstrap failed:", error);
        }
    }
}

function readBackgroundModePreference() {
    try {
        const storedMode = window.localStorage.getItem(BACKGROUND_MODE_STORAGE_KEY);
        if (storedMode === "dynamic" || storedMode === "static") {
            return storedMode;
        }
    } catch (error) {
        console.warn("Unable to read background mode preference:", error);
    }
    return "static";
}

function applyBackgroundMode(mode) {
    document.body.classList.toggle("dynamic-bg", mode === "dynamic");
}

function setupBackgroundModePreference() {
    applyBackgroundMode(readBackgroundModePreference());

    window.addEventListener("storage", (event) => {
        if (event.key && event.key !== BACKGROUND_MODE_STORAGE_KEY) return;
        const nextMode = event.newValue === "dynamic" || event.newValue === "static"
            ? event.newValue
            : readBackgroundModePreference();
        applyBackgroundMode(nextMode);
    });
}

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

function toDateOrNull(value) {
    if (!value) return null;
    const normalizedValue = typeof value === "string" && !/(z|[+-]\d{2}:\d{2})$/i.test(value)
        ? `${value}Z`
        : value;
    const parsed = new Date(normalizedValue);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function isSameLocalDay(dateA, dateB) {
    return dateA.getFullYear() === dateB.getFullYear()
        && dateA.getMonth() === dateB.getMonth()
        && dateA.getDate() === dateB.getDate();
}

function hasBeenReviewedRecently(date) {
    if (!date) return false;
    const diffMs = Date.now() - date.getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return false;
    return diffMs <= 1000 * 60 * 60 * 24 * 7;
}

function getCardMasteryScore(card) {
    const reviews = toNonNegativeInteger(card?.review_count, 0);
    if (reviews <= 0) return 0;
    const correct = Math.min(reviews, toNonNegativeInteger(card?.correct_count, 0));
    return correct / reviews;
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

function getCollectionDisplayName(collection) {
    if (!collection) return "All Collections";
    if (collection.class_name) return `${collection.name} (${collection.class_name})`;
    return collection.name;
}

function getCardsForCollection(collectionId) {
    return allCards.filter((card) => String(card.collection_id) === String(collectionId));
}

function getScopedCards() {
    if (activeCollection === "all") {
        return [...allCards];
    }
    return getCardsForCollection(activeCollection);
}

function getVisibleCards() {
    return getScopedCards();
}

function getMasteryPercent(cards) {
    if (!cards.length) return 0;
    const scoreSum = cards.reduce((sum, card) => sum + getCardMasteryScore(card), 0);
    return Math.round((scoreSum / cards.length) * 100);
}

function getReviewedTodayCount(cards) {
    const now = new Date();
    return cards.filter((card) => {
        const reviewedAt = toDateOrNull(card.last_reviewed_at);
        return reviewedAt ? isSameLocalDay(reviewedAt, now) : false;
    }).length;
}

function getCollectionSubtitle(collection, cards) {
    if (collection?.class_name) {
        return `Class: ${collection.class_name}`;
    }
    if (cards.length === 0) {
        return "No cards in this set yet";
    }
    if (cards.length === 1) {
        return "1 prompt ready for review";
    }
    return `${cards.length} prompts ready for review`;
}

function getCollectionReviewLabel(cards) {
    const latestReviewedAt = cards.reduce((latest, card) => {
        const reviewedAt = toDateOrNull(card.last_reviewed_at);
        if (!reviewedAt) return latest;
        if (!latest || reviewedAt > latest) return reviewedAt;
        return latest;
    }, null);

    if (!latestReviewedAt) return "Not studied yet";
    if (hasBeenReviewedRecently(latestReviewedAt)) return "Studied recently";
    return "Needs review";
}

function setStatus(message, tone = "info") {
    if (!statusElement) return;
    statusElement.textContent = message || "";
    statusElement.classList.remove("is-error", "is-success");
    if (tone === "error") statusElement.classList.add("is-error");
    if (tone === "success") statusElement.classList.add("is-success");
}

function renderCollectionOptions() {
    if (!collectionSelect) return;
    collectionSelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All Collections";
    collectionSelect.appendChild(allOption);

    for (const collection of collections) {
        const option = document.createElement("option");
        option.value = String(collection.id);
        option.textContent = getCollectionDisplayName(collection);
        collectionSelect.appendChild(option);
    }

    const exists = Array.from(collectionSelect.options).some((option) => option.value === String(activeCollection));
    if (!exists) activeCollection = "all";
    collectionSelect.value = activeCollection;
}

function updateDashboard() {
    if (setCountElement) setCountElement.textContent = String(collections.length);
    if (totalCardsElement) totalCardsElement.textContent = String(allCards.length);
    if (avgMasteryElement) avgMasteryElement.textContent = `${getMasteryPercent(allCards)}%`;
    if (reviewedTodayElement) reviewedTodayElement.textContent = String(getReviewedTodayCount(allCards));
}

function updateModeUI() {
    const selectedCollection = activeCollection === "all"
        ? null
        : collections.find((collection) => String(collection.id) === String(activeCollection)) || null;
    const scopedCards = getScopedCards();
    const masteryPercent = getMasteryPercent(scopedCards);
    const scopeName = getCollectionDisplayName(selectedCollection);

    if (panelTitleElement) {
        panelTitleElement.textContent = scopeName;
    }

    if (activeScopeText) {
        activeScopeText.textContent = `Selected quiz scope: ${scopeName} • ${scopedCards.length} cards • ${masteryPercent}% mastery`;
    }

    if (collectionSelect) {
        collectionSelect.value = activeCollection;
    }
}

function updateInteractionState() {
    const canInteract = hasValidToken() && filteredCards.length > 0;
    if (answerInput) answerInput.disabled = !canInteract;
    if (revealButton) revealButton.disabled = !canInteract;
    if (prevButton) prevButton.disabled = !canInteract || filteredCards.length <= 1;
    if (nextButton) nextButton.disabled = !canInteract || filteredCards.length <= 1;

    if (answerForm) {
        const submitButton = answerForm.querySelector("button[type='submit']");
        if (submitButton) submitButton.disabled = !canInteract;
    }
}

function resetAnswerView() {
    if (answerWrapElement) answerWrapElement.classList.add("is-hidden");
    if (revealButton) revealButton.textContent = "Show Correct Answer";
    if (answerInput) answerInput.value = "";
}

function renderCard() {
    if (!hasValidToken()) {
        if (questionElement) questionElement.textContent = "Please log in to start Quiz Mode.";
        if (answerElement) answerElement.textContent = "Correct answer will appear here.";
        if (cardIndexElement) cardIndexElement.textContent = "0 / 0";
        resetAnswerView();
        updateInteractionState();
        return;
    }

    if (!filteredCards.length) {
        if (questionElement) {
            questionElement.textContent = activeCollection === "all"
                ? "No cards available yet."
                : "No cards in this collection yet.";
        }
        if (answerElement) {
            answerElement.textContent = "Add cards from the main page and return here.";
        }
        if (cardIndexElement) cardIndexElement.textContent = "0 / 0";
        resetAnswerView();
        updateInteractionState();
        return;
    }

    const card = filteredCards[currentIndex];
    if (questionElement) questionElement.textContent = card.question || "Untitled card";
    if (answerElement) answerElement.textContent = card.answer || "No answer";
    if (cardIndexElement) cardIndexElement.textContent = `${currentIndex + 1} / ${filteredCards.length}`;
    resetAnswerView();
    updateInteractionState();
}

function createCollectionCard(collection) {
    const collectionCards = getCardsForCollection(collection.id);
    const cardCount = collectionCards.length;
    const masteryPercent = getMasteryPercent(collectionCards);
    const reviewLabel = getCollectionReviewLabel(collectionCards);

    const cardButton = document.createElement("button");
    cardButton.type = "button";
    cardButton.className = "quiz-collection-card";
    if (String(activeCollection) === String(collection.id)) {
        cardButton.classList.add("is-active");
    }
    cardButton.setAttribute("aria-label", `Start quiz for ${getCollectionDisplayName(collection)}`);

    cardButton.innerHTML = `
        <div class="collection-card-top">
            <h3 class="collection-card-title">${escapeHtml(collection.name || "Untitled Collection")}</h3>
            <p class="collection-card-subtitle">${escapeHtml(getCollectionSubtitle(collection, collectionCards))}</p>
        </div>
        <div class="collection-card-meta">
            <span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H20v13.5A2.5 2.5 0 0 0 17.5 15H5zM5 6.5V20h12.5A2.5 2.5 0 0 1 20 22H7.5A2.5 2.5 0 0 1 5 19.5z" />
                </svg>
                ${cardCount} ${cardCount === 1 ? "card" : "cards"}
            </span>
            <span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0z" />
                </svg>
                ${escapeHtml(reviewLabel)}
            </span>
        </div>
        <div class="collection-card-progress">
            <div class="collection-progress-head">
                <span>Mastery</span>
                <span>${masteryPercent}%</span>
            </div>
            <div class="collection-progress-track" aria-hidden="true">
                <div class="collection-progress-fill" style="width: ${masteryPercent}%"></div>
            </div>
        </div>
        <span class="collection-card-action">Open Set &#8594;</span>
    `;

    cardButton.addEventListener("click", () => {
        const detailUrl = new URL("./collection.html", window.location.href);
        detailUrl.searchParams.set("collection", String(collection.id));
        window.location.href = detailUrl.toString();
    });

    return cardButton;
}

function showCollectionEmptyState(message) {
    if (!collectionEmptyElement) return;
    collectionEmptyElement.textContent = message;
    collectionEmptyElement.classList.remove("is-hidden");
}

function hideCollectionEmptyState() {
    if (!collectionEmptyElement) return;
    collectionEmptyElement.textContent = "";
    collectionEmptyElement.classList.add("is-hidden");
}

function renderCollectionGrid() {
    if (!collectionGrid) return;
    collectionGrid.innerHTML = "";

    if (!hasValidToken()) {
        showCollectionEmptyState("Log in to browse your quiz sets.");
        return;
    }

    if (!collections.length) {
        showCollectionEmptyState("No collections yet. Create one from the flashcards page to start.");
        return;
    }

    const visibleCollections = collections.filter((collection) => {
        if (!collectionSearchTerm) return true;
        const haystack = [
            collection.name || "",
            collection.class_name || "",
        ].join(" ").toLowerCase();
        return haystack.includes(collectionSearchTerm);
    });

    if (!visibleCollections.length) {
        showCollectionEmptyState(`No collections match "${collectionSearchInput?.value?.trim() || ""}".`);
        return;
    }

    hideCollectionEmptyState();
    for (const collection of visibleCollections) {
        collectionGrid.appendChild(createCollectionCard(collection));
    }
}

function applyFilters({ preferredCardId = null, resetIndex = false } = {}) {
    filteredCards = getVisibleCards();

    if (resetIndex) currentIndex = 0;

    if (preferredCardId !== null) {
        const preferredIndex = filteredCards.findIndex((card) => String(card.id) === String(preferredCardId));
        currentIndex = preferredIndex >= 0 ? preferredIndex : 0;
    }

    if (currentIndex >= filteredCards.length) {
        currentIndex = Math.max(0, filteredCards.length - 1);
    }
    if (currentIndex < 0 || !Number.isInteger(currentIndex)) {
        currentIndex = 0;
    }

    updateModeUI();
    updateDashboard();
    renderCollectionGrid();
    renderCard();
}

function activateCollection(collectionId, { resetIndex = true, scrollToQuiz = false } = {}) {
    activeCollection = collectionId || "all";
    if (collectionSelect) {
        collectionSelect.value = activeCollection;
    }
    applyFilters({ resetIndex });
    setStatus("");

    if (scrollToQuiz && quizPanel && typeof quizPanel.scrollIntoView === "function") {
        quizPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    answerInput?.focus();
}

function normalizeAnswerText(value) {
    const normalizedWhitespace = String(value || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");

    if (!normalizedWhitespace) return "";

    return normalizedWhitespace
        .split(" ")
        .map((token) => {
            // Preserve symbol-only answers like !@#$%^&*() while still ignoring wrapper punctuation.
            if (!/[a-z0-9]/i.test(token)) return token;

            const strippedToken = token
                .replace(/^[("'`“”‘’\[{<.,!?;:]+/, "")
                .replace(/[)"'`“”‘’\]}>.,!?;:]+$/, "");

            return strippedToken || token;
        })
        .filter(Boolean)
        .join(" ");
}

function answersMatch(userAnswer, expectedAnswer) {
    const normalizedUser = normalizeAnswerText(userAnswer);
    if (!normalizedUser) return false;

    const variants = String(expectedAnswer || "")
        .split("|")
        .map((variant) => normalizeAnswerText(variant))
        .filter(Boolean);

    if (!variants.length) return false;
    return variants.includes(normalizedUser);
}

function toggleAnswerVisibility() {
    if (!answerWrapElement || revealButton?.disabled) return;
    const isHidden = answerWrapElement.classList.contains("is-hidden");
    answerWrapElement.classList.toggle("is-hidden", !isHidden);
    if (revealButton) {
        revealButton.textContent = isHidden ? "Hide Correct Answer" : "Show Correct Answer";
    }
}

function nextCard() {
    if (!filteredCards.length) return;
    currentIndex = (currentIndex + 1) % filteredCards.length;
    renderCard();
    setStatus("");
    answerInput?.focus();
}

function prevCard() {
    if (!filteredCards.length) return;
    currentIndex = (currentIndex - 1 + filteredCards.length) % filteredCards.length;
    renderCard();
    setStatus("");
    answerInput?.focus();
}

async function fetchCollections() {
    if (!hasValidToken()) {
        collections = [];
        activeCollection = "all";
        renderCollectionOptions();
        applyFilters({ resetIndex: true });
        return;
    }

    try {
        const response = await fetch(`${API_URL}/collections`, {
            method: "GET",
            headers: getHeaders(),
        });

        if (response.status === 401) {
            collections = [];
            activeCollection = "all";
            renderCollectionOptions();
            applyFilters({ resetIndex: true });
            return;
        }

        if (!response.ok) {
            throw new Error(`Collection request failed (HTTP ${response.status}).`);
        }

        const payload = await response.json();
        collections = Array.isArray(payload) ? payload : [];
        renderCollectionOptions();
    } catch (error) {
        console.error("Failed to load collections:", error);
        setStatus("Could not load collections.", "error");
        collections = [];
        activeCollection = "all";
        renderCollectionOptions();
    }
}

async function fetchCards() {
    if (!hasValidToken()) {
        allCards = [];
        applyFilters({ resetIndex: true });
        return;
    }

    try {
        const previousCardId = filteredCards[currentIndex]?.id ?? null;
        const response = await fetch(`${API_URL}/cards`, {
            method: "GET",
            headers: getHeaders(),
        });

        if (response.status === 401) {
            allCards = [];
            applyFilters({ resetIndex: true });
            setStatus("Session expired. Please log in again.", "error");
            return;
        }

        if (!response.ok) {
            throw new Error(`Card request failed (HTTP ${response.status}).`);
        }

        const payload = await response.json();
        allCards = Array.isArray(payload) ? payload.map(normalizeCardPayload) : [];
        applyFilters({ preferredCardId: previousCardId, resetIndex: false });
    } catch (error) {
        console.error("Failed to load cards:", error);
        setStatus("Could not load cards.", "error");
        allCards = [];
        applyFilters({ resetIndex: true });
    }
}

async function refreshData() {
    await fetchCollections();
    await fetchCards();
}

function isConfirmModalOpen() {
    return Boolean(resetConfirmModal?.classList.contains("is-open"));
}

function openConfirmModal() {
    if (!resetConfirmModal) return;
    resetConfirmModal.classList.add("is-open");
    resetConfirmModal.setAttribute("aria-hidden", "false");
}

function closeConfirmModal() {
    if (!resetConfirmModal) return;
    resetConfirmModal.classList.remove("is-open");
    resetConfirmModal.setAttribute("aria-hidden", "true");
}

function showResetConfirm(scopeLabel) {
    if (!resetConfirmModal || !resetConfirmMessage || !resetConfirmCancelButton || !resetConfirmAcceptButton) {
        setStatus("Confirmation dialog is unavailable. Please refresh and try again.", "error");
        return Promise.resolve(false);
    }

    resetConfirmMessage.textContent =
        `This will reset accuracy, mastery, reviewed-today, and streak data for ${scopeLabel}.`;
    openConfirmModal();

    return new Promise((resolve) => {
        const finish = (confirmed) => {
            closeConfirmModal();
            resetConfirmCancelButton.removeEventListener("click", onCancel);
            resetConfirmAcceptButton.removeEventListener("click", onAccept);
            resetConfirmModal.removeEventListener("click", onOverlayClick);
            document.removeEventListener("keydown", onEscape);
            resolve(confirmed);
        };

        const onCancel = () => finish(false);
        const onAccept = () => finish(true);
        const onOverlayClick = (event) => {
            if (event.target === resetConfirmModal) finish(false);
        };
        const onEscape = (event) => {
            if (event.key === "Escape") finish(false);
        };

        resetConfirmCancelButton.addEventListener("click", onCancel);
        resetConfirmAcceptButton.addEventListener("click", onAccept);
        resetConfirmModal.addEventListener("click", onOverlayClick);
        document.addEventListener("keydown", onEscape);
    });
}

async function resetProgressStats() {
    if (!hasValidToken()) {
        setStatus("Please log in to reset quiz stats.", "error");
        return;
    }

    const selectedCollection = activeCollection === "all"
        ? null
        : collections.find((collection) => String(collection.id) === String(activeCollection)) || null;
    const scopeLabel = selectedCollection ? getCollectionDisplayName(selectedCollection) : "all collections";
    const selectedCollectionId = activeCollection === "all" ? null : Number.parseInt(activeCollection, 10);

    if (activeCollection !== "all" && !Number.isInteger(selectedCollectionId)) {
        setStatus("Invalid collection scope. Please reselect the collection.", "error");
        return;
    }

    const confirmed = await showResetConfirm(scopeLabel);
    if (!confirmed) return;

    if (refreshButton) refreshButton.disabled = true;
    try {
        const response = await fetch(`${API_URL}/cards/reset-progress`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                collection_id: selectedCollectionId,
            }),
        });

        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
            throw new Error("Session expired. Please log in again.");
        }
        if (!response.ok) {
            throw new Error(payload.detail || `Could not reset stats (HTTP ${response.status}).`);
        }

        await fetchCards();
        setStatus(`Reset progress for ${payload.cards_reset || 0} card(s).`, "success");
    } catch (error) {
        console.error("Reset progress failed:", error);
        setStatus(error?.message || "Could not reset progress right now.", "error");
    } finally {
        if (refreshButton) refreshButton.disabled = false;
    }
}

async function submitReview(cardId, rating) {
    if (!REVIEW_RATINGS.includes(rating)) {
        throw new Error("Unsupported rating value.");
    }

    const response = await fetch(`${API_URL}/cards/${cardId}/review`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ rating }),
    });

    const payload = await response.json().catch(() => ({}));

    if (response.status === 401) {
        throw new Error("Session expired. Please log in again.");
    }

    if (!response.ok) {
        throw new Error(payload.detail || `Review failed (HTTP ${response.status}).`);
    }

    const updatedCard = normalizeCardPayload(payload?.card || {});
    allCards = allCards.map((card) => (
        String(card.id) === String(cardId) ? updatedCard : card
    ));
    return updatedCard;
}

async function handleAnswerSubmit(event) {
    event.preventDefault();
    if (!hasValidToken()) {
        setStatus("Please log in to take the quiz.", "error");
        return;
    }
    if (!filteredCards.length) return;

    const userAnswer = String(answerInput?.value || "").trim();
    if (!userAnswer) {
        setStatus("Type an answer before checking.", "error");
        return;
    }

    const currentCard = filteredCards[currentIndex];
    const expectedAnswer = currentCard.answer || "";
    const isCorrect = answersMatch(userAnswer, expectedAnswer);

    try {
        if (isCorrect) {
            const nextCardId = filteredCards.length > 1
                ? filteredCards[(currentIndex + 1) % filteredCards.length].id
                : null;

            await submitReview(currentCard.id, "easy");

            applyFilters({ preferredCardId: nextCardId, resetIndex: false });
            setStatus("Correct. Accuracy, reviewed today, and mastery were updated.", "success");
            answerInput?.focus();
            return;
        }

        await submitReview(currentCard.id, "again");
        updateDashboard();
        renderCollectionGrid();

        if (answerWrapElement) answerWrapElement.classList.remove("is-hidden");
        if (revealButton) revealButton.textContent = "Hide Correct Answer";
        setStatus("Incorrect. This was counted as a miss and accuracy was updated.", "error");
        answerInput?.focus();
    } catch (error) {
        console.error("Quiz submission failed:", error);
        setStatus(error?.message || "Could not process this answer.", "error");
    }
}

function setupEvents() {
    if (collectionSelect) {
        collectionSelect.addEventListener("change", () => {
            activateCollection(collectionSelect.value || "all", { resetIndex: true });
        });
    }

    if (collectionSearchInput) {
        collectionSearchInput.addEventListener("input", () => {
            collectionSearchTerm = String(collectionSearchInput.value || "").trim().toLowerCase();
            renderCollectionGrid();
        });
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", resetProgressStats);
    }

    if (answerForm) {
        answerForm.addEventListener("submit", handleAnswerSubmit);
    }

    if (revealButton) {
        revealButton.addEventListener("click", toggleAnswerVisibility);
    }

    if (nextButton) nextButton.addEventListener("click", nextCard);
    if (prevButton) prevButton.addEventListener("click", prevCard);

    window.addEventListener("flashlearn:auth-error", (event) => {
        const message = event?.detail?.message || "Authentication failed. Please try again.";
        setStatus(message, "error");
    });

    document.addEventListener("keydown", (event) => {
        if (isConfirmModalOpen()) return;

        const activeTag = document.activeElement?.tagName?.toLowerCase();
        const isTyping = activeTag === "input"
            || activeTag === "textarea"
            || activeTag === "select"
            || document.activeElement?.isContentEditable;

        if (event.key === "ArrowRight") {
            if (isTyping) return;
            event.preventDefault();
            nextCard();
            return;
        }

        if (event.key === "ArrowLeft") {
            if (isTyping) return;
            event.preventDefault();
            prevCard();
            return;
        }

        if (event.key === " " || event.code === "Space") {
            if (isTyping) return;
            event.preventDefault();
            toggleAnswerVisibility();
        }
    });
}

function applyQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const collection = params.get("collection");

    if (collection) activeCollection = collection;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function initializeQuizPage() {
    await waitForAuthBootstrap();
    setupBackgroundModePreference();
    applyQueryParams();
    setupEvents();
    updateModeUI();
    updateDashboard();
    renderCollectionGrid();
    renderCard();
    await refreshData();
    answerInput?.focus();
}
