// study.js
const core = window.FlashLearnCore;
if (!core) {
    throw new Error("FlashLearnCore failed to load.");
}

const { CONFIG, getHeaders, hasValidToken } = core;
const API_URL = CONFIG.API_URL;
const DEFAULT_COLLECTION_COLOR = CONFIG.DEFAULT_COLLECTION_COLOR;
const BACKGROUND_MODE_STORAGE_KEY = "flashlearn.background.mode";
const COLLECTION_NAME_MAX_LENGTH = 60;
const MAX_COLLECTION_COLOR_LUMINANCE = 0.84;
const TARGET_COLLECTION_COLOR_LUMINANCE = 0.72;
const CARD_LENGTH_LIMITS = Object.freeze({
    question: 480,
    answer: 960,
});

let flashcards = [];
let allFlashcards = [];
let collections = [];
let currentIndex = 0;
let activeCollection = "all";
let editingCardId = null;
let editingCollectionId = null;
let pendingConfirmAction = null;
let pendingWelcomeContinue = null;
let aiGeneratedCards = [];
let aiGeneratedCollectionName = "";
let aiGenerationInFlight = false;
let aiSaveInFlight = false;

const cardQuestion = document.getElementById("card-question");
const cardAnswer = document.getElementById("card-answer");
const cardInner = document.getElementById("card-inner");
const cardIndexDisplay = document.getElementById("card-index");
const flashcardElement = document.getElementById("flashcard");
const cardFrontFace = document.querySelector(".card-front");
const cardBackFace = document.querySelector(".card-back");
const collectionSelect = document.getElementById("collection-select");
const collectionTree = document.getElementById("collection-tree");
const activeCollectionText = document.getElementById("active-collection");
const collectionColorSwatch = document.getElementById("collection-color-swatch");
const editCollectionButton = document.getElementById("edit-collection-btn");
const deleteCollectionButton = document.getElementById("delete-collection-btn");
const exportCollectionButton = document.getElementById("export-collection-btn");
const importCollectionButton = document.getElementById("import-collection-btn");
const importCollectionFileInput = document.getElementById("import-collection-file");
const backgroundToggleButton = document.getElementById("background-toggle-btn");

const addCardModal = document.getElementById("add-card-modal");
const addCardForm = document.getElementById("add-card-form");
const addCardQuestionInput = document.getElementById("modal-question");
const addCardAnswerInput = document.getElementById("modal-answer");
const addCardCollectionName = document.getElementById("add-card-collection-name");
const addCardError = document.getElementById("add-card-error");

const collectionModal = document.getElementById("collection-modal");
const collectionModalTitle = document.getElementById("collection-modal-title");
const collectionModalSubtitle = document.getElementById("collection-modal-subtitle");
const collectionSubmitButton = document.getElementById("collection-submit-btn");
const collectionForm = document.getElementById("collection-form");
const collectionNameInput = document.getElementById("collection-name-input");
const collectionClassInput = document.getElementById("collection-class-input");
const collectionColorInput = document.getElementById("collection-color-input");
const collectionColorValue = document.getElementById("collection-color-value");
const collectionError = document.getElementById("collection-error");

const editCardModal = document.getElementById("edit-card-modal");
const editCardForm = document.getElementById("edit-card-form");
const editQuestionInput = document.getElementById("edit-question");
const editAnswerInput = document.getElementById("edit-answer");
const editCardError = document.getElementById("edit-card-error");

const aiGenerateButton = document.getElementById("ai-generate-btn");
const aiGenerateModal = document.getElementById("ai-generate-modal");
const aiGenerateForm = document.getElementById("ai-generate-form");
const aiTopicInput = document.getElementById("ai-topic-input");
const aiCountInput = document.getElementById("ai-count-input");
const aiCollectionNameInput = document.getElementById("ai-collection-name-input");
const aiGenerateError = document.getElementById("ai-generate-error");
const aiGenerateSubmitButton = document.getElementById("ai-generate-submit-btn");
const aiClearButton = document.getElementById("ai-clear-btn");
const aiPreviewSection = document.getElementById("ai-preview-section");
const aiPreviewSummary = document.getElementById("ai-preview-summary");
const aiPreviewList = document.getElementById("ai-preview-list");
const aiSaveButton = document.getElementById("ai-save-btn");

const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmActionButton = document.getElementById("confirm-action-btn");

const welcomeModal = document.getElementById("welcome-modal");
const welcomeUserName = document.getElementById("welcome-user-name");
const welcomeContinueBtn = document.getElementById("welcome-continue-btn");
const noticeModal = document.getElementById("notice-modal");
const noticeTitle = document.getElementById("notice-title");
const noticeMessage = document.getElementById("notice-message");
const noticeOkBtn = document.getElementById("notice-ok-btn");
const noticeLoginBtn = document.getElementById("notice-login-btn");

const modalOverlays = Array.from(document.querySelectorAll(".modal-overlay"));

document.addEventListener("DOMContentLoaded", initializeApp);

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

function getSelectedCollectionId() {
    if (activeCollection === "all") return null;
    const parsed = Number(activeCollection);
    return Number.isInteger(parsed) ? parsed : null;
}

function getCollectionDisplayName(collection) {
    if (!collection) return "All Collections";
    if (collection.class_name) return `${collection.name} (${collection.class_name})`;
    return collection.name;
}

function parseHexColor(color) {
    const candidate = String(color || "").trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(candidate)) return null;
    return [
        Number.parseInt(candidate.slice(1, 3), 16),
        Number.parseInt(candidate.slice(3, 5), 16),
        Number.parseInt(candidate.slice(5, 7), 16),
    ];
}

function formatHexColor(r, g, b) {
    return `#${[r, g, b].map((value) => (
        Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")
    )).join("")}`.toUpperCase();
}

function getRelativeLuminance(color) {
    const rgb = parseHexColor(color);
    if (!rgb) return 0;

    const toLinear = (channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    };

    const [r, g, b] = rgb.map(toLinear);
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

function remapLightCollectionColor(color) {
    let rgb = parseHexColor(color);
    if (!rgb) return DEFAULT_COLLECTION_COLOR;

    let luminance = getRelativeLuminance(formatHexColor(...rgb));
    if (luminance <= MAX_COLLECTION_COLOR_LUMINANCE) {
        return formatHexColor(...rgb);
    }

    let safetyCounter = 0;
    while (luminance > TARGET_COLLECTION_COLOR_LUMINANCE && safetyCounter < 32) {
        rgb = rgb.map((channel) => Math.round(channel * 0.94));
        luminance = getRelativeLuminance(formatHexColor(...rgb));
        safetyCounter += 1;
    }

    return formatHexColor(...rgb);
}

function sanitizeCollectionColor(color) {
    const candidate = (color || "").trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(candidate)) return DEFAULT_COLLECTION_COLOR;
    return remapLightCollectionColor(candidate.toUpperCase());
}

function toRgba(hexColor, alpha) {
    const color = sanitizeCollectionColor(hexColor).slice(1);
    const r = parseInt(color.slice(0, 2), 16);
    const g = parseInt(color.slice(2, 4), 16);
    const b = parseInt(color.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shiftHexColor(hexColor, ratio) {
    const color = sanitizeCollectionColor(hexColor).slice(1);
    const transform = (value) => {
        const normalized = parseInt(value, 16);
        const shifted = ratio >= 0
            ? normalized + (255 - normalized) * ratio
            : normalized * (1 + ratio);
        return Math.max(0, Math.min(255, Math.round(shifted)));
    };

    const r = transform(color.slice(0, 2));
    const g = transform(color.slice(2, 4));
    const b = transform(color.slice(4, 6));
    const toHex = (value) => value.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function applyCollectionTheme(color) {
    const base = sanitizeCollectionColor(color);
    const deep = shiftHexColor(base, -0.18);
    const bright = shiftHexColor(base, 0.15);
    const ink = getRelativeLuminance(base) > 0.52 ? "#211C15" : "#F8FBFF";
    document.documentElement.style.setProperty("--collection-color", base);
    document.documentElement.style.setProperty("--collection-color-deep", deep);
    document.documentElement.style.setProperty("--collection-color-bright", bright);
    document.documentElement.style.setProperty("--collection-soft", toRgba(base, 0.16));
    document.documentElement.style.setProperty("--collection-ink", ink);
}

function normalizeCollectionPayload(collection) {
    return {
        ...collection,
        color: sanitizeCollectionColor(collection?.color),
    };
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

function getActiveCollection() {
    if (activeCollection === "all") return null;
    return collections.find((collection) => String(collection.id) === String(activeCollection)) || null;
}

function getFilteredCards() {
    return activeCollection === "all"
        ? [...allFlashcards]
        : allFlashcards.filter((card) => String(card.collection_id) === String(activeCollection));
}

function truncateCardQuestion(question) {
    const normalized = String(question || "Untitled card").replace(/\s+/g, " ").trim();
    if (normalized.length <= 50) return normalized;
    return `${normalized.slice(0, 47)}...`;
}

function normalizeInlineText(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
}

function validateCollectionName(value, { required = true } = {}) {
    const normalizedName = normalizeInlineText(value);

    if (!normalizedName) {
        return required
            ? { error: "Collection name cannot be empty." }
            : { name: "", error: "" };
    }

    if (normalizedName.length > COLLECTION_NAME_MAX_LENGTH) {
        return { error: `Collection name must be ${COLLECTION_NAME_MAX_LENGTH} characters or fewer.` };
    }

    return {
        name: normalizedName,
        error: "",
    };
}

function buildCollectionRetryName(baseName, suffix = "") {
    const normalizedBase = normalizeInlineText(baseName);
    if (!suffix) return normalizedBase;

    const maxBaseLength = Math.max(0, COLLECTION_NAME_MAX_LENGTH - suffix.length);
    const trimmedBase = normalizedBase.slice(0, maxBaseLength).trimEnd();
    return `${trimmedBase}${suffix}`;
}

function validateCardContent(question, answer) {
    const normalizedQuestion = String(question || "").trim();
    const normalizedAnswer = String(answer || "").trim();

    if (!normalizedQuestion || !normalizedAnswer) {
        return { error: "Please fill in both the Question and the Answer fields." };
    }
    if (normalizedQuestion.length > CARD_LENGTH_LIMITS.question) {
        return { error: `Question must be ${CARD_LENGTH_LIMITS.question} characters or fewer.` };
    }
    if (normalizedAnswer.length > CARD_LENGTH_LIMITS.answer) {
        return { error: `Answer must be ${CARD_LENGTH_LIMITS.answer} characters or fewer.` };
    }

    return {
        question: normalizedQuestion,
        answer: normalizedAnswer,
        error: "",
    };
}

function getTextDensityScore(text) {
    const normalized = String(text || "").trim();
    const lineBreaks = (normalized.match(/\n/g) || []).length;
    return normalized.length + (lineBreaks * 28);
}

function fitTextToFace(textElement, faceElement, options) {
    if (!textElement || !faceElement || !options) return;

    const maxPx = options.maxPx || 26;
    const minPx = options.minPx || 12;
    const stepPx = options.stepPx || 1;
    const lineHeight = options.lineHeight || "1.4";

    textElement.style.fontSize = `${maxPx}px`;
    textElement.style.lineHeight = lineHeight;
    void faceElement.offsetHeight;

    let currentPx = maxPx;
    while (
        currentPx > minPx &&
        (faceElement.scrollHeight > faceElement.clientHeight || faceElement.scrollWidth > faceElement.clientWidth)
    ) {
        currentPx -= stepPx;
        textElement.style.fontSize = `${currentPx}px`;
        void faceElement.offsetHeight;
    }
}

function renderFlashcardCopy(questionText, answerText) {
    if (cardQuestion) cardQuestion.textContent = questionText;
    if (cardAnswer) cardAnswer.textContent = answerText;

    if (cardFrontFace) {
        cardFrontFace.classList.toggle("is-dense", getTextDensityScore(questionText) > 240);
    }
    if (cardBackFace) {
        cardBackFace.classList.toggle("is-dense", getTextDensityScore(answerText) > 480);
    }

    fitTextToFace(cardQuestion, cardFrontFace, {
        maxPx: 26,
        minPx: 11,
        lineHeight: "1.4",
    });
    fitTextToFace(cardAnswer, cardBackFace, {
        maxPx: 26,
        minPx: 8,
        lineHeight: "1.3",
    });
}

function applyActiveCollectionFilter({ preferredCardId = null, resetIndex = false } = {}) {
    flashcards = getFilteredCards();

    if (resetIndex) {
        currentIndex = 0;
    }

    if (preferredCardId !== null) {
        const preferredIndex = flashcards.findIndex((card) => String(card.id) === String(preferredCardId));
        currentIndex = preferredIndex >= 0 ? preferredIndex : 0;
    }

    if (currentIndex >= flashcards.length) {
        currentIndex = Math.max(0, flashcards.length - 1);
    }
    if (currentIndex < 0 || !Number.isInteger(currentIndex)) {
        currentIndex = 0;
    }

    updateActiveCollectionLabel();
    updateCardDisplay();
}

function setActiveCollection(nextCollection, options = {}) {
    activeCollection = String(nextCollection || "all");
    if (collectionSelect) {
        collectionSelect.value = activeCollection;
    }
    applyActiveCollectionFilter(options);
}

function scrollActiveCollectionIntoView() {
    if (!collectionTree) return;
    const activeItem = collectionTree.querySelector(".collection-card-btn.is-active, .collection-folder-btn.is-active");
    if (!activeItem || typeof activeItem.scrollIntoView !== "function") return;
    activeItem.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function renderCollectionTree() {
    if (!collectionTree) return;

    const activeCardId = flashcards[currentIndex]?.id ?? null;
    collectionTree.innerHTML = "";

    const allFolderItem = document.createElement("li");
    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = `collection-folder-btn ${activeCollection === "all" ? "is-active" : ""}`;
    allButton.addEventListener("click", () => {
        setActiveCollection("all", { resetIndex: true });
    });

    const allDot = document.createElement("span");
    allDot.className = "folder-dot";
    allDot.style.background = DEFAULT_COLLECTION_COLOR;

    const allName = document.createElement("span");
    allName.className = "folder-name";
    allName.textContent = "All Collections";

    const allCount = document.createElement("span");
    allCount.className = "folder-count";
    allCount.textContent = String(allFlashcards.length);

    allButton.appendChild(allDot);
    allButton.appendChild(allName);
    allButton.appendChild(allCount);
    allFolderItem.appendChild(allButton);
    collectionTree.appendChild(allFolderItem);

    if (!collections.length) {
        const empty = document.createElement("li");
        empty.className = "collection-tree-empty";
        empty.textContent = hasValidToken()
            ? "No folders yet. Create your first collection."
            : "Login to load your collections.";
        collectionTree.appendChild(empty);
        return;
    }

    for (const collection of collections) {
        const folderCards = allFlashcards.filter((card) => String(card.collection_id) === String(collection.id));
        const isActiveFolder = String(collection.id) === String(activeCollection);
        const isOpen = activeCollection === "all" || isActiveFolder;

        const folderItem = document.createElement("li");

        const folderButton = document.createElement("button");
        folderButton.type = "button";
        folderButton.className = `collection-folder-btn ${isActiveFolder ? "is-active" : ""}`;
        folderButton.addEventListener("click", () => {
            setActiveCollection(String(collection.id), { resetIndex: true });
        });

        const folderDot = document.createElement("span");
        folderDot.className = "folder-dot";
        folderDot.style.background = sanitizeCollectionColor(collection.color);

        const folderName = document.createElement("span");
        folderName.className = "folder-name";
        folderName.textContent = getCollectionDisplayName(collection);

        const folderCount = document.createElement("span");
        folderCount.className = "folder-count";
        folderCount.textContent = String(folderCards.length);

        folderButton.appendChild(folderDot);
        folderButton.appendChild(folderName);
        folderButton.appendChild(folderCount);
        folderItem.appendChild(folderButton);

        const cardList = document.createElement("ul");
        cardList.className = `collection-card-list ${isOpen ? "is-open" : ""}`;

        if (!folderCards.length) {
            const emptyCardRow = document.createElement("li");
            emptyCardRow.className = "collection-card-empty";
            emptyCardRow.textContent = "No cards in this folder.";
            cardList.appendChild(emptyCardRow);
        } else {
            for (const card of folderCards) {
                const cardItem = document.createElement("li");
                const cardButton = document.createElement("button");
                cardButton.type = "button";
                cardButton.className = `collection-card-btn ${isActiveFolder && String(card.id) === String(activeCardId) ? "is-active" : ""}`;
                cardButton.textContent = truncateCardQuestion(card.question);
                cardButton.title = card.question || "Untitled card";
                cardButton.addEventListener("click", () => {
                    setActiveCollection(String(collection.id), {
                        preferredCardId: card.id,
                        resetIndex: false
                    });
                });

                cardItem.appendChild(cardButton);
                cardList.appendChild(cardItem);
            }
        }

        folderItem.appendChild(cardList);
        collectionTree.appendChild(folderItem);
    }

    scrollActiveCollectionIntoView();
}

function setModalError(element, message = "") {
    if (element) element.textContent = message;
}

function openModal(overlay) {
    if (!overlay) return;
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
}

function closeModal(overlay) {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");

    const hasOpenModal = modalOverlays.some((modal) => modal.classList.contains("is-open"));
    if (!hasOpenModal) {
        document.body.classList.remove("modal-open");
    }
}

function closeModalById(modalId) {
    const overlay = document.getElementById(modalId);
    if (!overlay) return;

    if (modalId === "add-card-modal") {
        setModalError(addCardError);
    }

    if (modalId === "collection-modal") {
        editingCollectionId = null;
        setModalError(collectionError);
        if (collectionModalTitle) {
            collectionModalTitle.textContent = "Create Collection";
        }
        if (collectionModalSubtitle) {
            collectionModalSubtitle.textContent = "Group cards by class, chapter, or exam topic.";
        }
        if (collectionSubmitButton) {
            collectionSubmitButton.textContent = "Create Collection";
        }
    }

    if (modalId === "edit-card-modal") {
        editingCardId = null;
        setModalError(editCardError);
    }

    if (modalId === "ai-generate-modal") {
        resetAiGeneratorState();
    }

    if (modalId === "confirm-modal") {
        pendingConfirmAction = null;
        if (confirmActionButton) {
            confirmActionButton.classList.remove("modal-danger-btn");
            confirmActionButton.textContent = "Confirm";
            confirmActionButton.disabled = false;
        }
    }

    if (modalId === "welcome-modal") {
        const callback = pendingWelcomeContinue;
        pendingWelcomeContinue = null;
        closeModal(overlay);
        if (typeof callback === "function") callback();
        return;
    }

    closeModal(overlay);
}

function setupModalInfrastructure() {
    modalOverlays.forEach((overlay) => {
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                closeModalById(overlay.id);
            }
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        const openOverlays = modalOverlays.filter((overlay) => overlay.classList.contains("is-open"));
        if (!openOverlays.length) return;
        closeModalById(openOverlays[openOverlays.length - 1].id);
    });

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
        button.addEventListener("click", () => {
            const modalId = button.getAttribute("data-close-modal");
            if (modalId) closeModalById(modalId);
        });
    });
}

function updateActiveCollectionLabel() {
    if (!activeCollectionText) return;
    if (activeCollection === "all") {
        activeCollectionText.textContent = "Showing: All Collections";
        applyCollectionTheme(DEFAULT_COLLECTION_COLOR);
        if (collectionSelect) {
            collectionSelect.style.color = shiftHexColor(DEFAULT_COLLECTION_COLOR, -0.35);
            collectionSelect.style.background = `linear-gradient(145deg, ${toRgba(DEFAULT_COLLECTION_COLOR, 0.14)}, rgba(255, 255, 255, 0.95))`;
        }
        if (collectionColorSwatch) {
            collectionColorSwatch.style.background = DEFAULT_COLLECTION_COLOR;
            collectionColorSwatch.title = `All Collections color preview (${DEFAULT_COLLECTION_COLOR})`;
        }
        updateCollectionActionButtons(null);
        return;
    }

    const selected = getActiveCollection();
    activeCollectionText.textContent = `Showing: ${getCollectionDisplayName(selected)}`;
    const previewColor = selected?.color || DEFAULT_COLLECTION_COLOR;
    applyCollectionTheme(previewColor);
    if (collectionSelect) {
        collectionSelect.style.color = shiftHexColor(previewColor, -0.35);
        collectionSelect.style.background = `linear-gradient(145deg, ${toRgba(previewColor, 0.2)}, rgba(255, 255, 255, 0.95))`;
    }
    if (collectionColorSwatch) {
        collectionColorSwatch.style.background = previewColor;
        collectionColorSwatch.title = `Selected collection color (${previewColor})`;
    }
    updateCollectionActionButtons(selected);
}

function updateCollectionActionButtons(selectedCollection) {
    const canUseCollections = hasValidToken();
    const hasSelection = Boolean(selectedCollection);
    const editDeleteDisabled = !canUseCollections || !hasSelection;

    if (editCollectionButton) editCollectionButton.disabled = editDeleteDisabled;
    if (deleteCollectionButton) deleteCollectionButton.disabled = editDeleteDisabled;
    if (exportCollectionButton) exportCollectionButton.disabled = editDeleteDisabled;
    if (importCollectionButton) importCollectionButton.disabled = !canUseCollections;
}

function renderCollectionOptions() {
    if (collectionSelect) {
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

        const optionExists = Array.from(collectionSelect.options).some((option) => option.value === String(activeCollection));
        if (!optionExists) {
            activeCollection = "all";
        }

        collectionSelect.value = activeCollection;
    }

    updateActiveCollectionLabel();
    renderCollectionTree();
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

function writeBackgroundModePreference(mode) {
    try {
        window.localStorage.setItem(BACKGROUND_MODE_STORAGE_KEY, mode);
    } catch (error) {
        console.warn("Unable to save background mode preference:", error);
    }
}

function applyBackgroundMode(mode) {
    const isDynamic = mode === "dynamic";
    document.body.classList.toggle("dynamic-bg", isDynamic);

    if (!backgroundToggleButton) return;
    backgroundToggleButton.classList.toggle("dynamic", isDynamic);
    backgroundToggleButton.dataset.mode = isDynamic ? "dynamic" : "static";
    backgroundToggleButton.title = isDynamic ? "Dynamic background on" : "Static background on";
    backgroundToggleButton.setAttribute("aria-pressed", String(isDynamic));
    backgroundToggleButton.setAttribute(
        "aria-label",
        isDynamic ? "Switch to static background" : "Switch to dynamic background"
    );
}

function setupBackgroundModeToggle() {
    const preferredMode = readBackgroundModePreference();
    applyBackgroundMode(preferredMode);

    window.addEventListener("storage", (event) => {
        if (event.key && event.key !== BACKGROUND_MODE_STORAGE_KEY) return;
        const nextMode = event.newValue === "dynamic" || event.newValue === "static"
            ? event.newValue
            : readBackgroundModePreference();
        applyBackgroundMode(nextMode);
    });

    if (!backgroundToggleButton) return;
    backgroundToggleButton.addEventListener("click", () => {
        const isDynamic = document.body.classList.contains("dynamic-bg");
        const nextMode = isDynamic ? "static" : "dynamic";
        applyBackgroundMode(nextMode);
        writeBackgroundModePreference(nextMode);
    });
}

async function initializeApp() {
    await waitForAuthBootstrap();
    setupBackgroundModeToggle();
    setupModalInfrastructure();
    setupAddCardModal();
    setupCollectionModal();
    setupEditCardModal();
    setupAiGeneratorModal();
    setupConfirmModal();
    setupWelcomeModal();
    setupNoticeModal();
    setupImportExportControls();
    setupKeyboardShortcuts();
    window.addEventListener("resize", () => {
        renderFlashcardCopy(cardQuestion?.textContent || "", cardAnswer?.textContent || "");
    });
    renderCollectionOptions();
    await fetchCollections();
    await fetchFlashcards();
}

function setupAddCardModal() {
    if (!addCardForm) return;
    addCardForm.addEventListener("submit", handleAddCardFormSubmit);
}

function setupCollectionModal() {
    if (!collectionForm) return;
    collectionForm.addEventListener("submit", handleCollectionFormSubmit);
    if (collectionColorInput) {
        collectionColorInput.addEventListener("input", () => {
            const safeColor = sanitizeCollectionColor(collectionColorInput.value);
            collectionColorInput.value = safeColor.toLowerCase();
            if (collectionColorValue) {
                collectionColorValue.textContent = safeColor;
            }
        });
    }
}

function setupEditCardModal() {
    if (!editCardForm) return;
    editCardForm.addEventListener("submit", handleEditCardFormSubmit);
}

function setupAiGeneratorModal() {
    if (aiGenerateButton) {
        aiGenerateButton.addEventListener("click", openAiGeneratorModal);
    }

    if (aiGenerateForm) {
        aiGenerateForm.addEventListener("submit", handleAiGenerateFormSubmit);
    }

    if (aiClearButton) {
        aiClearButton.addEventListener("click", () => {
            resetAiGeneratorState({ keepTopic: false });
            if (aiTopicInput) aiTopicInput.focus();
        });
    }

    if (aiSaveButton) {
        aiSaveButton.addEventListener("click", handleSaveGeneratedCards);
    }
}

function setupConfirmModal() {
    if (!confirmActionButton) return;

    confirmActionButton.addEventListener("click", async () => {
        const action = pendingConfirmAction;
        pendingConfirmAction = null;

        closeModalById("confirm-modal");
        if (typeof action === "function") {
            await action();
        }
    });
}

function setupWelcomeModal() {
    if (welcomeContinueBtn) {
        welcomeContinueBtn.addEventListener("click", () => {
            closeModalById("welcome-modal");
        });
    }

    window.showWelcomeModal = (displayName, onContinue) => {
        if (!welcomeModal || !welcomeUserName) {
            if (typeof onContinue === "function") onContinue();
            return;
        }

        welcomeUserName.textContent = displayName || "Learner";
        pendingWelcomeContinue = typeof onContinue === "function" ? onContinue : null;
        openModal(welcomeModal);
    };

    if (window.pendingWelcomeUserName) {
        window.showWelcomeModal(window.pendingWelcomeUserName);
        window.pendingWelcomeUserName = null;
    }
}

function setupNoticeModal() {
    if (noticeOkBtn) {
        noticeOkBtn.addEventListener("click", () => {
            closeModalById("notice-modal");
        });
    }

    if (noticeLoginBtn) {
        noticeLoginBtn.addEventListener("click", () => {
            const loginUrl = new URL("../login/login.html", window.location.href);
            const nextPath = `${window.location.pathname}${window.location.search || ""}${window.location.hash || ""}`;
            loginUrl.searchParams.set("next", nextPath);
            window.location.href = loginUrl.toString();
        });
    }
}

function setupImportExportControls() {
    if (exportCollectionButton) {
        exportCollectionButton.addEventListener("click", exportCollectionAsJson);
    }

    if (importCollectionButton) {
        importCollectionButton.addEventListener("click", () => {
            if (!hasValidToken()) {
                showNoticeModal("Sign In Required", "You must be logged in to import collections.");
                return;
            }
            if (!importCollectionFileInput) return;
            importCollectionFileInput.value = "";
            importCollectionFileInput.click();
        });
    }

    if (importCollectionFileInput) {
        importCollectionFileInput.addEventListener("change", handleCollectionImportFile);
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (event) => {
        const openOverlays = modalOverlays.some((overlay) => overlay.classList.contains("is-open"));
        if (openOverlays) return;

        const activeElementTag = document.activeElement?.tagName?.toLowerCase();
        const isTyping = activeElementTag === "input"
            || activeElementTag === "textarea"
            || document.activeElement?.isContentEditable;
        if (isTyping) return;

        if (event.key === " " || event.code === "Space") {
            event.preventDefault();
            flipCard();
            return;
        }

        if (event.key === "ArrowRight") {
            event.preventDefault();
            nextCard();
            return;
        }

        if (event.key === "ArrowLeft") {
            event.preventDefault();
            prevCard();
        }
    });
}

function resetAiPreview() {
    aiGeneratedCards = [];
    aiGeneratedCollectionName = "";
    if (aiPreviewSection) aiPreviewSection.hidden = true;
    if (aiPreviewList) aiPreviewList.innerHTML = "";
    if (aiPreviewSummary) aiPreviewSummary.textContent = "0 cards ready";
    if (aiSaveButton) {
        aiSaveButton.disabled = false;
        aiSaveButton.textContent = "Save Set";
    }
}

function updateAiActionButtons() {
    if (aiGenerateSubmitButton) {
        aiGenerateSubmitButton.disabled = aiGenerationInFlight || aiSaveInFlight;
        aiGenerateSubmitButton.textContent = aiGenerationInFlight ? "Generating..." : "Generate Draft";
    }
    if (aiClearButton) {
        aiClearButton.disabled = aiGenerationInFlight || aiSaveInFlight;
    }
    if (aiSaveButton) {
        aiSaveButton.disabled = aiGenerationInFlight || aiSaveInFlight || aiGeneratedCards.length === 0;
        aiSaveButton.textContent = aiSaveInFlight ? "Saving..." : "Save Set";
    }
}

function resetAiGeneratorState(options = {}) {
    const keepTopic = Boolean(options.keepTopic);
    aiGenerationInFlight = false;
    aiSaveInFlight = false;
    resetAiPreview();
    setModalError(aiGenerateError);
    if (!keepTopic) {
        if (aiTopicInput) aiTopicInput.value = "";
        if (aiCountInput) aiCountInput.value = "10";
        if (aiCollectionNameInput) aiCollectionNameInput.value = "";
    }
    updateAiActionButtons();
}

function renderAiPreview(cards, collectionName) {
    if (!aiPreviewSection || !aiPreviewList || !aiPreviewSummary) return;

    aiPreviewList.innerHTML = "";
    cards.forEach((card, index) => {
        const article = document.createElement("article");
        article.className = "ai-preview-card";

        const questionLabel = document.createElement("p");
        questionLabel.className = "ai-preview-card-label";
        questionLabel.textContent = `Card ${index + 1} · Question`;

        const questionText = document.createElement("p");
        questionText.className = "ai-preview-card-text";
        questionText.textContent = card.question;

        const answerLabel = document.createElement("p");
        answerLabel.className = "ai-preview-card-label";
        answerLabel.textContent = "Answer";

        const answerText = document.createElement("p");
        answerText.className = "ai-preview-card-text";
        answerText.textContent = card.answer;

        article.appendChild(questionLabel);
        article.appendChild(questionText);
        article.appendChild(answerLabel);
        article.appendChild(answerText);
        aiPreviewList.appendChild(article);
    });

    aiPreviewSummary.textContent = `${cards.length} cards ready · target collection: ${collectionName}`;
    aiPreviewSection.hidden = false;
}

function openAiGeneratorModal() {
    if (!aiGenerateModal || !aiTopicInput) return;

    if (!hasValidToken()) {
        showNoticeModal(
            "Sign In Required",
            "You must be logged in to generate cards with AI.",
            { showLoginButton: true }
        );
        return;
    }

    resetAiGeneratorState();
    const selectedCollection = getActiveCollection();
    if (aiCollectionNameInput) {
        aiCollectionNameInput.value = "";
        aiCollectionNameInput.placeholder = selectedCollection
            ? `Blank saves to ${getCollectionDisplayName(selectedCollection)}`
            : "Blank uses the topic as the collection name";
    }
    openModal(aiGenerateModal);
    aiTopicInput.focus();
}

function validateAiGenerationInput() {
    const topic = String(aiTopicInput?.value || "").trim();
    const count = Number.parseInt(aiCountInput?.value || "", 10);
    const collectionNameValidation = validateCollectionName(aiCollectionNameInput?.value || "", { required: false });

    if (!topic) {
        return { error: "Please enter a topic to generate a study set." };
    }
    if (topic.length > 300) {
        return { error: "Topic must be 300 characters or fewer." };
    }
    if (!Number.isInteger(count) || count < 3 || count > 15) {
        return { error: "Choose between 3 and 15 cards." };
    }
    if (collectionNameValidation.error) {
        return { error: collectionNameValidation.error };
    }

    return {
        topic,
        count,
        collectionName: collectionNameValidation.name || "",
        error: "",
    };
}

async function handleAiGenerateFormSubmit(event) {
    event.preventDefault();
    if (aiGenerationInFlight || aiSaveInFlight) return;

    const validation = validateAiGenerationInput();
    if (validation.error) {
        setModalError(aiGenerateError, validation.error);
        return;
    }

    try {
        aiGenerationInFlight = true;
        setModalError(aiGenerateError);
        resetAiPreview();
        updateAiActionButtons();

        const response = await fetch(`${API_URL}/ai/generate-cards`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                topic: validation.topic,
                count: validation.count,
                collection_name: validation.collectionName || null,
            })
        });

        if (response.status === 401) {
            setModalError(aiGenerateError, "Session expired. Please login again.");
            return;
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.detail || `AI generation failed (HTTP ${response.status}).`);
        }

        const rawCards = Array.isArray(payload.cards) ? payload.cards : [];
        const normalizedCards = rawCards.map((card) => {
            const validationResult = validateCardContent(card?.question, card?.answer);
            if (validationResult.error) {
                throw new Error(validationResult.error);
            }
            return {
                question: validationResult.question,
                answer: validationResult.answer,
            };
        });

        if (!normalizedCards.length) {
            throw new Error("The AI returned no usable cards.");
        }

        aiGeneratedCards = normalizedCards;
        aiGeneratedCollectionName = String(payload.collection_name || validation.collectionName || validation.topic).trim();
        const selectedCollection = getActiveCollection();
        if (aiCollectionNameInput && !validation.collectionName && !selectedCollection) {
            aiCollectionNameInput.value = aiGeneratedCollectionName;
        }

        renderAiPreview(
            aiGeneratedCards,
            selectedCollection ? getCollectionDisplayName(selectedCollection) : aiGeneratedCollectionName
        );
    } catch (error) {
        console.error("AI generation failed:", error);
        setModalError(aiGenerateError, error?.message || "Could not generate cards right now.");
    } finally {
        aiGenerationInFlight = false;
        updateAiActionButtons();
    }
}

function showNoticeModal(title, message, options = {}) {
    if (!noticeModal || !noticeTitle || !noticeMessage) {
        console.warn("Notice modal is unavailable:", title, message);
        return;
    }
    noticeTitle.textContent = title || "Notice";
    noticeMessage.textContent = message || "";
    if (noticeLoginBtn) {
        noticeLoginBtn.hidden = !options.showLoginButton;
    }
    openModal(noticeModal);
}

window.showNoticeModal = showNoticeModal;

function makeSafeExportFileName(name) {
    const base = String(name || "collection")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    return `${base || "collection"}-flashlearn.json`;
}

function exportCollectionAsJson() {
    if (!hasValidToken()) {
        showNoticeModal("Sign In Required", "You must be logged in to export collections.");
        return;
    }

    const selectedCollection = getActiveCollection();
    if (!selectedCollection) {
        showNoticeModal("Select a Collection", "Choose a collection folder first, then export.");
        return;
    }

    const cards = allFlashcards
        .filter((card) => String(card.collection_id) === String(selectedCollection.id))
        .map((card) => ({
            question: String(card.question || "").trim(),
            answer: String(card.answer || "").trim(),
        }));

    const exportPayload = {
        format: "flashlearn.collection.export",
        version: 1,
        exported_at: new Date().toISOString(),
        collection: {
            name: selectedCollection.name,
            class_name: selectedCollection.class_name || null,
            color: sanitizeCollectionColor(selectedCollection.color),
        },
        cards,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = makeSafeExportFileName(selectedCollection.name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
}

function parseImportedCollectionPayload(rawText) {
    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch (error) {
        throw new Error("Invalid JSON file. Please select a valid collection export.");
    }

    if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid file structure.");
    }

    const sourceCollection = parsed.collection;
    const sourceCards = parsed.cards;
    const sourceNameValidation = validateCollectionName(sourceCollection?.name || "");
    if (sourceNameValidation.error) {
        throw new Error(
            sourceCollection?.name ? sourceNameValidation.error : "Collection name is missing in the import file."
        );
    }
    const sourceName = sourceNameValidation.name;

    const sourceClassName = typeof sourceCollection?.class_name === "string"
        ? sourceCollection.class_name.trim()
        : "";

    const sourceColor = typeof sourceCollection?.color === "string"
        ? sourceCollection.color.trim()
        : DEFAULT_COLLECTION_COLOR;
    const color = /^#[0-9A-Fa-f]{6}$/.test(sourceColor)
        ? sanitizeCollectionColor(sourceColor)
        : DEFAULT_COLLECTION_COLOR;

    if (!Array.isArray(sourceCards)) {
        throw new Error("Cards are missing or malformed in the import file.");
    }

    const cards = [];
    sourceCards.forEach((card, index) => {
        const question = String(card?.question || "").trim();
        const answer = String(card?.answer || "").trim();

        if (!question && !answer) {
            return;
        }

        const validation = validateCardContent(question, answer);
        if (validation.error) {
            throw new Error(`Card ${index + 1}: ${validation.error}`);
        }

        cards.push({
            question: validation.question,
            answer: validation.answer,
        });
    });

    if (sourceCards.length > 0 && cards.length === 0) {
        throw new Error("No valid cards were found in this file.");
    }

    return {
        collection: {
            name: sourceName,
            class_name: sourceClassName || null,
            color,
        },
        cards,
    };
}

async function createImportedCollectionWithRetry(collectionData) {
    const baseName = validateCollectionName(collectionData.name).name;
    const className = collectionData.class_name || null;
    const color = sanitizeCollectionColor(collectionData.color);

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const suffix = attempt === 0 ? "" : attempt === 1 ? " (Imported)" : ` (Imported ${attempt})`;
        const candidateName = buildCollectionRetryName(baseName, suffix);

        const response = await fetch(`${API_URL}/collections`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                name: candidateName,
                class_name: className,
                color,
            })
        });

        const payload = await response.json().catch(() => ({}));

        if (response.status === 401) {
            throw new Error("Session expired. Please login again.");
        }
        if (response.status === 409) {
            continue;
        }
        if (!response.ok) {
            throw new Error(payload.detail || `Collection import failed (HTTP ${response.status}).`);
        }

        return normalizeCollectionPayload(payload);
    }

    throw new Error("Could not create the imported collection because of repeated name conflicts.");
}

function findCollectionByName(name) {
    const normalizedName = String(name || "").trim().toLowerCase();
    if (!normalizedName) return null;

    return collections.find((collection) => {
        const collectionName = String(collection?.name || "").trim().toLowerCase();
        const className = String(collection?.class_name || "").trim();
        return collectionName === normalizedName && !className;
    }) || null;
}

async function createAiCollectionWithRetry(collectionData) {
    const nameValidation = validateCollectionName(collectionData?.name || "");
    if (nameValidation.error) throw new Error(nameValidation.error);
    const baseName = nameValidation.name;

    const color = sanitizeCollectionColor(collectionData?.color || DEFAULT_COLLECTION_COLOR);
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const suffix = attempt === 0 ? "" : attempt === 1 ? " (AI)" : ` (AI ${attempt})`;
        const candidateName = buildCollectionRetryName(baseName, suffix);

        const response = await fetch(`${API_URL}/collections`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                name: candidateName,
                class_name: null,
                color,
            })
        });

        const payload = await response.json().catch(() => ({}));

        if (response.status === 401) {
            throw new Error("Session expired. Please login again.");
        }
        if (response.status === 409) {
            continue;
        }
        if (!response.ok) {
            throw new Error(payload.detail || `Collection creation failed (HTTP ${response.status}).`);
        }

        return normalizeCollectionPayload(payload);
    }

    throw new Error("Could not create a collection for this AI set.");
}

async function importCollectionPayload(importPayload) {
    const newCollection = await createImportedCollectionWithRetry(importPayload.collection);
    let importedCount = 0;

    for (const card of importPayload.cards) {
        const response = await fetch(`${API_URL}/cards`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                question: card.question,
                answer: card.answer,
                collection_id: newCollection.id,
            })
        });

        if (response.status === 401) {
            throw new Error("Session expired. Please login again.");
        }
        if (!response.ok) {
            console.error("Skipping failed imported card:", response.status);
            continue;
        }
        importedCount += 1;
    }

    activeCollection = String(newCollection.id);
    await fetchCollections();
    await fetchFlashcards();

    showNoticeModal(
        "Import Complete",
        `Imported ${importedCount} of ${importPayload.cards.length} card(s) into ${getCollectionDisplayName(newCollection)}.`
    );
}

async function handleCollectionImportFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    try {
        if (!hasValidToken()) {
            throw new Error("You must be logged in to import collections.");
        }

        const rawText = await file.text();
        const importPayload = parseImportedCollectionPayload(rawText);
        await importCollectionPayload(importPayload);
    } catch (error) {
        console.error("Import failed:", error);
        showNoticeModal("Import Failed", error?.message || "Could not import this file right now.");
    } finally {
        if (importCollectionFileInput) {
            importCollectionFileInput.value = "";
        }
    }
}

async function resolveAiTargetCollection() {
    const selectedCollection = getActiveCollection();
    const requestedName = String(aiCollectionNameInput?.value || "").trim();

    if (!requestedName && selectedCollection) {
        return selectedCollection;
    }

    const targetName = requestedName || aiGeneratedCollectionName || String(aiTopicInput?.value || "").trim();
    if (!targetName) {
        throw new Error("Please enter a collection name before saving.");
    }

    const existingCollection = findCollectionByName(targetName);
    if (existingCollection) {
        return existingCollection;
    }

    return createAiCollectionWithRetry({
        name: targetName,
        color: selectedCollection?.color || DEFAULT_COLLECTION_COLOR,
    });
}

async function handleSaveGeneratedCards() {
    if (aiGenerationInFlight || aiSaveInFlight || aiGeneratedCards.length === 0) return;
    if (!hasValidToken()) {
        showNoticeModal(
            "Sign In Required",
            "You must be logged in to save AI-generated cards.",
            { showLoginButton: true }
        );
        return;
    }

    try {
        aiSaveInFlight = true;
        setModalError(aiGenerateError);
        updateAiActionButtons();

        const generatedCount = aiGeneratedCards.length;
        const targetCollection = await resolveAiTargetCollection();
        const results = await Promise.allSettled(
            aiGeneratedCards.map((card) =>
                fetch(`${API_URL}/cards`, {
                    method: "POST",
                    headers: getHeaders(),
                    body: JSON.stringify({
                        question: card.question,
                        answer: card.answer,
                        collection_id: targetCollection?.id ?? null,
                    })
                })
            )
        );

        let savedCount = 0;
        for (const result of results) {
            if (result.status !== "fulfilled") continue;
            const response = result.value;
            if (response.status === 401) {
                throw new Error("Session expired. Please login again.");
            }
            if (response.ok) {
                savedCount += 1;
            }
        }

        if (savedCount === 0) {
            throw new Error("No cards were saved.");
        }

        activeCollection = targetCollection?.id ? String(targetCollection.id) : "all";
        await fetchCollections();
        await fetchFlashcards();
        closeModalById("ai-generate-modal");
        showNoticeModal(
            "AI Set Saved",
            `Saved ${savedCount} of ${generatedCount} card(s) to ${getCollectionDisplayName(targetCollection)}.`
        );
    } catch (error) {
        console.error("Saving AI cards failed:", error);
        setModalError(aiGenerateError, error?.message || "Could not save this AI set right now.");
    } finally {
        aiSaveInFlight = false;
        updateAiActionButtons();
    }
}

async function fetchCollections() {
    if (!hasValidToken()) {
        collections = [];
        activeCollection = "all";
        renderCollectionOptions();
        return;
    }

    try {
        const response = await fetch(`${API_URL}/collections`, {
            method: "GET",
            headers: getHeaders()
        });

        if (response.status === 401) {
            collections = [];
            activeCollection = "all";
            renderCollectionOptions();
            return;
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const payload = await response.json();
        collections = Array.isArray(payload) ? payload.map(normalizeCollectionPayload) : [];

        if (
            activeCollection !== "all" &&
            !collections.some((collection) => String(collection.id) === String(activeCollection))
        ) {
            activeCollection = "all";
        }

        renderCollectionOptions();
    } catch (error) {
        console.error("Failed to load collections:", error);
        collections = [];
        activeCollection = "all";
        renderCollectionOptions();
    }
}

function createCollection() {
    openCollectionModal("create");
}

function openEditCollectionModal() {
    const selectedCollection = getActiveCollection();
    if (!selectedCollection) {
        showNoticeModal("Select a Collection", "Please select a collection to edit.");
        return;
    }
    openCollectionModal("edit", selectedCollection);
}

function openCollectionModal(mode = "create", selectedCollection = null) {
    if (!collectionModal || !collectionNameInput || !collectionClassInput || !collectionColorInput) return;
    if (!hasValidToken()) {
        showNoticeModal(
            "Sign In Required",
            "You must be logged in to add a collection.",
            { showLoginButton: true }
        );
        return;
    }

    const isEditMode = mode === "edit" && selectedCollection;
    editingCollectionId = isEditMode ? selectedCollection.id : null;

    collectionNameInput.value = isEditMode ? (selectedCollection.name || "") : "";
    collectionClassInput.value = isEditMode ? (selectedCollection.class_name || "") : "";
    collectionColorInput.value = sanitizeCollectionColor(
        isEditMode ? selectedCollection.color : DEFAULT_COLLECTION_COLOR
    ).toLowerCase();
    if (collectionColorValue) {
        collectionColorValue.textContent = sanitizeCollectionColor(collectionColorInput.value);
    }
    if (collectionModalTitle) {
        collectionModalTitle.textContent = isEditMode ? "Edit Collection" : "Create Collection";
    }
    if (collectionModalSubtitle) {
        collectionModalSubtitle.textContent = isEditMode
            ? "Rename or recolor this collection."
            : "Group cards by class, chapter, or exam topic.";
    }
    if (collectionSubmitButton) {
        collectionSubmitButton.textContent = isEditMode ? "Save Collection" : "Create Collection";
    }
    setModalError(collectionError);
    openModal(collectionModal);
    collectionNameInput.focus();
}

async function handleCollectionFormSubmit(event) {
    event.preventDefault();
    if (!collectionNameInput || !collectionClassInput || !collectionColorInput) return;

    const nameValidation = validateCollectionName(collectionNameInput.value);
    const name = nameValidation.name || "";
    const className = collectionClassInput.value.trim();
    const color = sanitizeCollectionColor(collectionColorInput.value);

    if (nameValidation.error) {
        setModalError(collectionError, nameValidation.error);
        return;
    }

    try {
        const isEditMode = editingCollectionId !== null;
        const endpoint = isEditMode
            ? `${API_URL}/collections/${editingCollectionId}`
            : `${API_URL}/collections`;
        const response = await fetch(endpoint, {
            method: isEditMode ? "PUT" : "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                name: name,
                class_name: className || null,
                color: color
            })
        });

        const payload = await response.json().catch(() => ({}));

        if (response.status === 401) {
            setModalError(collectionError, "Session expired. Please login again.");
            return;
        }

        if (response.status === 409) {
            setModalError(collectionError, payload.detail || "That collection already exists.");
            return;
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        activeCollection = String(payload.id || editingCollectionId);
        closeModalById("collection-modal");
        await fetchCollections();
        await fetchFlashcards();
    } catch (error) {
        console.error("Failed to create collection:", error);
        setModalError(collectionError, "Could not create collection right now.");
    }
}

async function deleteCollection() {
    const selectedCollection = getActiveCollection();
    if (!selectedCollection) {
        showNoticeModal("Select a Collection", "Please select a collection to delete.");
        return;
    }

    if (!hasValidToken()) {
        showNoticeModal("Sign In Required", "You must be logged in to delete a collection.");
        return;
    }

    showConfirmModal({
        title: "Delete this collection?",
        message: `Cards will remain but become uncategorized. Collection: ${getCollectionDisplayName(selectedCollection)}.`,
        confirmText: "Delete Collection",
        danger: true,
        onConfirm: async () => {
            try {
                const response = await fetch(`${API_URL}/collections/${selectedCollection.id}`, {
                    method: "DELETE",
                    headers: getHeaders()
                });

                if (response.status === 401) {
                    showNoticeModal("Session Expired", "Please login again.");
                    return;
                }

                if (!response.ok) {
                    throw new Error(`Server error: ${response.status}`);
                }

                activeCollection = "all";
                await fetchCollections();
                await fetchFlashcards();
            } catch (error) {
                console.error("Delete collection failed:", error);
                showNoticeModal("Delete Failed", "Could not delete this collection right now.");
            }
        }
    });
}

function onCollectionChange() {
    setActiveCollection(collectionSelect?.value || "all", { resetIndex: true });
}

async function fetchFlashcards() {
    if (!hasValidToken()) {
        renderFlashcardCopy("Please Login to see your cards.", "Click the Login button above.");
        allFlashcards = [];
        flashcards = [];
        currentIndex = 0;
        updateActiveCollectionLabel();
        updateCardDisplay();
        return;
    }

    try {
        const previousCardId = flashcards[currentIndex]?.id ?? null;
        const response = await fetch(`${API_URL}/cards`, {
            method: "GET",
            headers: getHeaders()
        });

        if (response.status === 401) {
            renderFlashcardCopy("Session expired.", "Please logout and login again.");
            allFlashcards = [];
            flashcards = [];
            currentIndex = 0;
            cardIndexDisplay.textContent = "0 / 0";
            updateActiveCollectionLabel();
            renderCollectionTree();
            return;
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const payload = await response.json();
        allFlashcards = Array.isArray(payload) ? payload.map(normalizeCardPayload) : [];
        applyActiveCollectionFilter({ preferredCardId: previousCardId, resetIndex: false });
    } catch (error) {
        console.error("Fetch error:", error);
        allFlashcards = [];
        flashcards = [];
        currentIndex = 0;
        renderFlashcardCopy("Error loading cards.", "Check console for details.");
        cardIndexDisplay.textContent = "0 / 0";
        updateActiveCollectionLabel();
        renderCollectionTree();
    }
}

function openAddCardModal() {
    if (!addCardModal || !addCardQuestionInput || !addCardAnswerInput) return;

    if (!hasValidToken()) {
        showNoticeModal(
            "Sign In Required",
            "You must be logged in to add a card.",
            { showLoginButton: true }
        );
        return;
    }

    const selectedCollection = collections.find(
        (collection) => String(collection.id) === String(activeCollection)
    );
    if (addCardCollectionName) {
        addCardCollectionName.textContent = getCollectionDisplayName(selectedCollection);
    }

    addCardQuestionInput.value = "";
    addCardAnswerInput.value = "";
    setModalError(addCardError);
    openModal(addCardModal);
    addCardQuestionInput.focus();
}

function closeAddCardModal() {
    closeModalById("add-card-modal");
}

async function handleAddCardFormSubmit(event) {
    event.preventDefault();
    if (!addCardQuestionInput || !addCardAnswerInput) return;

    const validation = validateCardContent(addCardQuestionInput.value, addCardAnswerInput.value);
    if (validation.error) {
        setModalError(addCardError, validation.error);
        return;
    }

    const saved = await saveFlashcard(validation.question, validation.answer, addCardError);
    if (saved) {
        closeModalById("add-card-modal");
    }
}

async function saveFlashcard(question, answer, errorElement = null) {
    if (!hasValidToken()) {
        if (errorElement) {
            setModalError(errorElement, "You must be logged in to add a card.");
        } else {
            showNoticeModal(
                "Sign In Required",
                "You must be logged in to add a card.",
                { showLoginButton: true }
            );
        }
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/cards`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                question: question,
                answer: answer,
                collection_id: getSelectedCollectionId()
            })
        });

        if (response.status === 401) {
            setModalError(errorElement, "Session expired. Please login again.");
            return false;
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.detail || `Server error: ${response.status}`);
        }

        const createdCard = payload;
        await fetchFlashcards();
        setTimeout(() => {
            const createdIndex = flashcards.findIndex((card) => String(card.id) === String(createdCard.id));
            currentIndex = createdIndex >= 0 ? createdIndex : Math.max(0, flashcards.length - 1);
            updateCardDisplay();
            playCardAnimation("pop");
        }, 100);
        return true;
    } catch (error) {
        console.error("Error adding card:", error);
        if (errorElement) {
            setModalError(errorElement, error?.message || "Failed to save card. Please try again.");
        } else {
            showNoticeModal("Save Failed", error?.message || "Failed to save card. Please try again.");
        }
        return false;
    }
}

function addFlashcard() {
    openAddCardModal();
}

function showConfirmModal({ title, message, confirmText, danger, onConfirm }) {
    if (!confirmModal || !confirmTitle || !confirmMessage || !confirmActionButton) {
        showNoticeModal("Action Unavailable", "Confirmation dialog is unavailable. Please refresh and try again.");
        return;
    }

    confirmTitle.textContent = title || "Please Confirm";
    confirmMessage.textContent = message || "Are you sure you want to continue?";
    confirmActionButton.textContent = confirmText || "Confirm";
    confirmActionButton.classList.toggle("modal-danger-btn", Boolean(danger));
    confirmActionButton.disabled = false;
    pendingConfirmAction = onConfirm;
    openModal(confirmModal);
}

async function deleteFlashcard() {
    if (flashcards.length === 0) return;
    if (!hasValidToken()) {
        showNoticeModal("Sign In Required", "You must be logged in to delete cards.");
        return;
    }

    const currentCard = flashcards[currentIndex];
    showConfirmModal({
        title: "Delete this flashcard?",
        message: "This action will permanently remove the current card.",
        confirmText: "Delete Card",
        danger: true,
        onConfirm: async () => {
            try {
                const response = await fetch(`${API_URL}/cards/${currentCard.id}`, {
                    method: "DELETE",
                    headers: getHeaders()
                });

                if (response.status === 401) {
                    showNoticeModal("Session Expired", "Please login again.");
                    return;
                }

                if (!response.ok) {
                    throw new Error(`Server error: ${response.status}`);
                }

                playCardAnimation("pop-out");
                await wait(350);
                await fetchFlashcards();

                if (currentIndex >= flashcards.length) {
                    currentIndex = Math.max(0, flashcards.length - 1);
                }
                updateCardDisplay();
            } catch (error) {
                console.error("Delete failed:", error);
                showNoticeModal("Delete Failed", "Failed to delete card.");
            }
        }
    });
}

function editFlashcard() {
    if (flashcards.length === 0) return;
    if (!hasValidToken()) {
        showNoticeModal("Sign In Required", "You must be logged in to edit cards.");
        return;
    }

    const card = flashcards[currentIndex];
    if (!editCardModal || !editQuestionInput || !editAnswerInput) return;

    editingCardId = card.id;
    editQuestionInput.value = card.question || "";
    editAnswerInput.value = card.answer || "";
    setModalError(editCardError);
    openModal(editCardModal);
    editQuestionInput.focus();
}

async function handleEditCardFormSubmit(event) {
    event.preventDefault();
    if (!editQuestionInput || !editAnswerInput || editingCardId === null) return;

    const validation = validateCardContent(editQuestionInput.value, editAnswerInput.value);
    if (validation.error) {
        setModalError(editCardError, validation.error);
        return;
    }

    const targetCard = flashcards.find((card) => card.id === editingCardId);
    const collectionId = targetCard ? (targetCard.collection_id ?? null) : null;

    try {
        const response = await fetch(`${API_URL}/cards/${editingCardId}`, {
            method: "PUT",
            headers: getHeaders(),
            body: JSON.stringify({
                question: validation.question,
                answer: validation.answer,
                collection_id: collectionId
            })
        });

        if (response.status === 401) {
            setModalError(editCardError, "Session expired. Please login again.");
            return;
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.detail || `Server error: ${response.status}`);
        }

        closeModalById("edit-card-modal");
        await fetchFlashcards();
    } catch (error) {
        console.error("Edit failed:", error);
        setModalError(editCardError, error?.message || "Failed to update card. Please try again.");
    }
}

function playCardAnimation(animationClass) {
    if (!flashcardElement) return;
    flashcardElement.classList.remove("slide-left", "slide-right", "pop", "pop-out");
    void flashcardElement.offsetWidth;
    flashcardElement.classList.add(animationClass);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

flashcardElement?.addEventListener("animationend", () => {
    flashcardElement.classList.remove("slide-left", "slide-right", "pop", "pop-out");
});

function updateCardDisplay() {
    if (!hasValidToken()) {
        renderFlashcardCopy("Please Login to see your cards.", "Click the Login button above.");
        cardIndexDisplay.textContent = "0 / 0";
        renderCollectionTree();
        return;
    }

    if (flashcards.length === 0) {
        renderFlashcardCopy(
            activeCollection === "all" ? "No cards yet." : "No cards in this collection yet.",
            "..."
        );
        cardIndexDisplay.textContent = "0 / 0";
        renderCollectionTree();
        return;
    }

    cardInner.classList.remove("flipped");
    renderFlashcardCopy(flashcards[currentIndex].question, flashcards[currentIndex].answer);
    cardIndexDisplay.textContent = `${currentIndex + 1} / ${flashcards.length}`;
    renderCollectionTree();
}

function flipCard() {
    cardInner.classList.toggle("flipped");
}

function nextCard() {
    if (flashcards.length) {
        currentIndex = (currentIndex + 1) % flashcards.length;
        updateCardDisplay();
        playCardAnimation("slide-left");
    }
}

function prevCard() {
    if (flashcards.length) {
        currentIndex = (currentIndex - 1 + flashcards.length) % flashcards.length;
        updateCardDisplay();
        playCardAnimation("slide-right");
    }
}
