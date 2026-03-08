import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const core = window.FlashLearnCore;
if (!core) {
    throw new Error("FlashLearnCore failed to load.");
}

const {
    CONFIG,
    bindAuthStateListener,
    bootstrapSession,
    signInWithOAuth,
    resolveSafeNextPath,
    setStoredToken,
    setWelcomeAfterAuthFlag,
} = core;
const DEFAULT_NEXT_PATH = "../study/index.html";

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const providerButtons = Array.from(document.querySelectorAll("[data-provider]"));
const loginNote = document.getElementById("login-note");
const loginError = document.getElementById("login-error");
const artFrame = document.querySelector(".art-frame");
const characterEyes = Array.from(document.querySelectorAll(".eye"));
const characters = Array.from(document.querySelectorAll(".character"));
const thoughtBubble = document.getElementById("provider-thought-bubble");
const thoughtBubbleText = document.getElementById("provider-thought-text");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

let gazeFrameId = 0;
let pointerX = null;
let pointerY = null;

if (!loginError) {
    console.warn('No #login-error element found in DOM.');
}

const rawNext = new URLSearchParams(window.location.search).get("next");
const nextPath = resolveSafeNextPath(rawNext, DEFAULT_NEXT_PATH);

function redirectToNext() {
    window.location.replace(nextPath);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function resetCharacterGaze() {
    characters.forEach((character) => {
        character.style.setProperty("--shift-x", "0px");
        character.style.setProperty("--shift-y", "0px");
        character.style.setProperty("--tilt", "0deg");
    });

    characterEyes.forEach((eye) => {
        const pupil = eye.querySelector(".pupil");
        if (pupil) {
            pupil.style.transform = "translate3d(-50%, -50%, 0)";
        }
    });
}

function updateCharacterGaze() {
    gazeFrameId = 0;

    if (!artFrame || reducedMotionQuery.matches || pointerX === null || pointerY === null) {
        resetCharacterGaze();
        return;
    }

    const sceneRect = artFrame.getBoundingClientRect();
    const sceneCenterX = sceneRect.left + (sceneRect.width / 2);
    const sceneCenterY = sceneRect.top + (sceneRect.height / 2);
    const normalizedX = clamp((pointerX - sceneCenterX) / (sceneRect.width / 2), -1, 1);
    const normalizedY = clamp((pointerY - sceneCenterY) / (sceneRect.height / 2), -1, 1);

    characters.forEach((character, index) => {
        const depth = 5 + index * 1.5;
        character.style.setProperty("--shift-x", `${normalizedX * depth}px`);
        character.style.setProperty("--shift-y", `${normalizedY * depth}px`);
        character.style.setProperty("--tilt", `${normalizedX * (1.2 + index * 0.2)}deg`);
    });

    characterEyes.forEach((eye) => {
        const pupil = eye.querySelector(".pupil");
        if (!pupil) {
            return;
        }

        const eyeRect = eye.getBoundingClientRect();
        const eyeCenterX = eyeRect.left + (eyeRect.width / 2);
        const eyeCenterY = eyeRect.top + (eyeRect.height / 2);
        const deltaX = pointerX - eyeCenterX;
        const deltaY = pointerY - eyeCenterY;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const maxOffset = eyeRect.width * 0.22;
        const travel = Math.min(distance, maxOffset);
        const offsetX = (deltaX / distance) * travel;
        const offsetY = (deltaY / distance) * travel;

        pupil.style.transform = `translate3d(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px), 0)`;
    });
}

function scheduleCharacterGazeUpdate() {
    if (gazeFrameId) {
        return;
    }

    gazeFrameId = window.requestAnimationFrame(updateCharacterGaze);
}

function wireCharacterTracking() {
    if (!artFrame || !characterEyes.length) {
        return;
    }

    resetCharacterGaze();

    window.addEventListener("pointermove", (event) => {
        if (event.pointerType === "touch" || reducedMotionQuery.matches) {
            return;
        }

        pointerX = event.clientX;
        pointerY = event.clientY;
        scheduleCharacterGazeUpdate();
    }, { passive: true });

    window.addEventListener("pointerleave", () => {
        pointerX = null;
        pointerY = null;
        resetCharacterGaze();
    });

    window.addEventListener("blur", () => {
        pointerX = null;
        pointerY = null;
        resetCharacterGaze();
    });

    reducedMotionQuery.addEventListener("change", () => {
        pointerX = null;
        pointerY = null;
        resetCharacterGaze();
    });
}

async function startOAuth(provider, button) {
    if (loginError) loginError.textContent = "";
    setWelcomeAfterAuthFlag(true);

    if (window.location.protocol === "file:") {
        const protocolMessage = "OAuth sign-in requires http://localhost or https://, not file://.";
        if (loginError) loginError.textContent = protocolMessage;
        return;
    }

    try {
        const redirectUrl = new URL(window.location.pathname, window.location.origin);
        redirectUrl.searchParams.set("next", nextPath);

        const { error } = await signInWithOAuth(supabase, provider, {
            redirectTo: redirectUrl.toString(),
            showWelcomeAfterAuth: true,
        });
        if (error) {
            throw error;
        }
    } catch (error) {
        console.error('OAuth sign-in error:', error);
        const message = error?.message || (typeof error === 'string' ? error : "Login failed. Please try again.");
        const needsRedirectConfig = message.toLowerCase().includes("redirect") ||
            message.toLowerCase().includes("invalid") ||
            message.toLowerCase().includes("not allowed");
        const display = needsRedirectConfig
            ? `${message} Check Supabase Auth redirect URLs for this site origin.`
            : message;
        if (loginError) loginError.textContent = display;
        if (button) {
            button.disabled = false;
        }
    }
}

async function bootstrapLoginPage() {
    let callbackHydrationError = null;
    const { session } = await bootstrapSession(supabase, {
        hydrateHashTokens: true,
        onHydrationError: (error, callbackTokens) => {
            callbackHydrationError = error;
            if (callbackTokens?.accessToken) {
                localStorage.setItem("userToken", callbackTokens.accessToken);
                setWelcomeAfterAuthFlag(true);
            }
        },
    });

    if (callbackHydrationError) {
        const message = callbackHydrationError?.message || "Could not complete sign in from callback.";
        if (loginNote) {
            loginNote.textContent = `Continuing with token fallback (${message}).`;
        }
        redirectToNext();
        return;
    }

    if (session?.user) {
        redirectToNext();
        return;
    }

    setStoredToken(null);
}

function wireProviderButtons() {
    providerButtons.forEach((button) => {
        button.addEventListener("click", async () => {
            const provider = button.dataset.provider;
            if (!provider) {
                return;
            }

            button.disabled = true;
            await startOAuth(provider, button);
        });
    });
}

function showProviderThoughtBubble(message) {
    if (!thoughtBubble || !thoughtBubbleText || !message) {
        return;
    }

    thoughtBubbleText.textContent = message;
    thoughtBubble.classList.add("is-visible");
}

function hideProviderThoughtBubble() {
    if (!thoughtBubble) {
        return;
    }

    thoughtBubble.classList.remove("is-visible");
    if (thoughtBubbleText) {
        thoughtBubbleText.textContent = "";
    }
}

function wireProviderThoughtBubble() {
    if (!thoughtBubble || !providerButtons.length) {
        return;
    }

    providerButtons.forEach((button) => {
        const message = button.dataset.thought;
        if (!message) {
            return;
        }

        button.addEventListener("pointerenter", () => {
            showProviderThoughtBubble(message);
        });

        button.addEventListener("focus", () => {
            showProviderThoughtBubble(message);
        });

        button.addEventListener("pointerleave", hideProviderThoughtBubble);
        button.addEventListener("blur", hideProviderThoughtBubble);
    });
}

bindAuthStateListener(supabase, {
    onChange: (_event, session) => {
        if (session?.user) {
            redirectToNext();
        }
    },
});

bootstrapLoginPage().catch(() => {
    setStoredToken(null);
});

if (window.location.protocol === "file:" && loginNote) {
    loginNote.textContent = "Tip: run this page from localhost to use OAuth.";
}
wireProviderButtons();
wireProviderThoughtBubble();
wireCharacterTracking();
