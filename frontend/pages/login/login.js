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
if (!loginError) {
    console.warn('No #login-error element found in DOM.');
}

const rawNext = new URLSearchParams(window.location.search).get("next");
const nextPath = resolveSafeNextPath(rawNext, DEFAULT_NEXT_PATH);

function redirectToNext() {
    window.location.replace(nextPath);
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
