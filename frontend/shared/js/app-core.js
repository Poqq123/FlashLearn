(() => {
    const LEGACY_NEXT_MAP = Object.freeze({
        "index.html": "../study/index.html",
        "/index.html": "../study/index.html",
        "quiz.html": "../quiz/quiz.html",
        "/quiz.html": "../quiz/quiz.html",
        "profile.html": "../profile/profile.html",
        "/profile.html": "../profile/profile.html",
        "login.html": "../login/login.html",
        "/login.html": "../login/login.html",
    });

    const AVATAR_PRESETS = Object.freeze({
        google: Object.freeze({ emoji: "G", background: "linear-gradient(160deg, #dbe8ff, #bdd9f1)" }),
        fox: Object.freeze({ emoji: "🦊", background: "linear-gradient(160deg, #ffd7ad, #f1a35f)" }),
        owl: Object.freeze({ emoji: "🦉", background: "linear-gradient(160deg, #e5d6ff, #bca8f1)" }),
        panda: Object.freeze({ emoji: "🐼", background: "linear-gradient(160deg, #e4eef5, #bdd0de)" }),
        whale: Object.freeze({ emoji: "🐋", background: "linear-gradient(160deg, #c7ebff, #8fc3e7)" }),
        cat: Object.freeze({ emoji: "🐱", background: "linear-gradient(160deg, #ffe2cf, #f4b28c)" }),
    });

    const CONFIG = Object.freeze({
        API_URL: "https://flashcardapp-pwic.onrender.com",
        DEFAULT_COLLECTION_COLOR: "#0F4C5C",
        SUPABASE_URL: "https://sfxtsemiitbruxmdurva.supabase.co",
        SUPABASE_ANON_KEY:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmeHRzZW1paXRicnV4bWR1cnZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMjE3NjcsImV4cCI6MjA4NTg5Nzc2N30.M4ErTSvcEIezdt72o-DBYFONe5l9UWWoQYGy2-HkaeA",
        AVATAR_PRESET_KEY: "flashlearnAvatarPreset",
        AVATAR_PRESETS,
    });

    function setStoredToken(session) {
        if (session?.access_token) {
            localStorage.setItem("userToken", session.access_token);
            return;
        }
        localStorage.removeItem("userToken");
    }

    function hasValidToken() {
        const token = localStorage.getItem("userToken");
        return Boolean(token && token.startsWith("ey"));
    }

    function getHeaders(options = {}) {
        const includeJsonContentType = options.includeJsonContentType !== false;
        const token = localStorage.getItem("userToken");
        const headers = {
            Authorization: `Bearer ${token}`,
        };

        if (includeJsonContentType) {
            headers["Content-Type"] = "application/json";
        }
        return headers;
    }

    function getDisplayName(user) {
        const metadata = user?.user_metadata || {};
        return (
            metadata.full_name ||
            metadata.name ||
            [metadata.given_name, metadata.family_name].filter(Boolean).join(" ") ||
            user?.email ||
            "Learner"
        );
    }

    function getInitials(displayName) {
        const parts = (displayName || "").trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return "FL";
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    function getHashParamValue(hashContent, key) {
        const regex = new RegExp(`${key}=([^&#]+)`, "g");
        const matches = Array.from(hashContent.matchAll(regex));
        if (matches.length === 0) return null;
        return decodeURIComponent(matches[matches.length - 1][1]);
    }

    function readTokensFromHash() {
        const hash = window.location.hash.startsWith("#")
            ? window.location.hash.slice(1)
            : window.location.hash;
        if (!hash) return null;

        const accessToken = getHashParamValue(hash, "access_token");
        const refreshToken = getHashParamValue(hash, "refresh_token");
        if (!accessToken || !refreshToken) return null;

        return { accessToken, refreshToken };
    }

    function clearLocationHash() {
        const cleanUrl = `${window.location.pathname}${window.location.search}`;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    function normalizeLegacyNextPath(rawNext) {
        if (!rawNext) return rawNext;
        return LEGACY_NEXT_MAP[rawNext] || rawNext;
    }

    function resolveSafeNextPath(rawNext, defaultNextPath) {
        const defaultResolved = new URL(defaultNextPath, window.location.href);
        const defaultPath = `${defaultResolved.pathname}${defaultResolved.search}${defaultResolved.hash}`;
        const normalizedNext = normalizeLegacyNextPath(rawNext);
        if (!normalizedNext) return defaultPath;

        try {
            const resolved = new URL(normalizedNext, window.location.href);
            if (resolved.origin !== window.location.origin) return defaultPath;

            const nextPath = `${resolved.pathname}${resolved.search}${resolved.hash}`;
            if (!nextPath || nextPath === "/" || nextPath.endsWith("/login.html") || nextPath.endsWith("login.html")) {
                return defaultPath;
            }
            return nextPath;
        } catch (_error) {
            return defaultPath;
        }
    }

    function setWelcomeAfterAuthFlag(enabled) {
        if (enabled) {
            sessionStorage.setItem("showWelcomeAfterAuth", "1");
            return;
        }
        sessionStorage.removeItem("showWelcomeAfterAuth");
    }

    function consumeWelcomeAfterAuthFlag() {
        const shouldShowWelcome = sessionStorage.getItem("showWelcomeAfterAuth") === "1";
        sessionStorage.removeItem("showWelcomeAfterAuth");
        return shouldShowWelcome;
    }

    function buildOAuthAuthorizeUrl(provider, nextPath) {
        const loginReturnUrl = new URL(nextPath, window.location.origin);
        loginReturnUrl.hash = "";

        const authorizeUrl = new URL(`${CONFIG.SUPABASE_URL}/auth/v1/authorize`);
        authorizeUrl.searchParams.set("provider", provider);
        authorizeUrl.searchParams.set("redirect_to", loginReturnUrl.toString());
        return authorizeUrl.toString();
    }

    function buildGoogleAuthorizeUrl(nextPath) {
        return buildOAuthAuthorizeUrl("google", nextPath);
    }

    async function signInWithOAuth(supabase, provider, options = {}) {
        const redirectTo = options.redirectTo || `${window.location.origin}${window.location.pathname}`;
        if (options.showWelcomeAfterAuth) {
            setWelcomeAfterAuthFlag(true);
        }
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo },
        });
        return { error };
    }

    async function signInWithGoogle(supabase, options = {}) {
        return signInWithOAuth(supabase, "google", options);
    }

    async function signOutSession(supabase, options = {}) {
        const { error } = await supabase.auth.signOut();
        setStoredToken(null);
        if (options.syncAvatar) {
            syncHeaderAvatar(null);
        }
        if (options.clearWelcomeAfterAuth) {
            setWelcomeAfterAuthFlag(false);
        }
        if (options.clearPendingWelcomeUserName) {
            window.pendingWelcomeUserName = null;
        }
        if (options.reloadPage) {
            window.location.reload();
        }
        return { error };
    }

    async function bootstrapSession(supabase, options = {}) {
        if (options.hydrateHashTokens) {
            const callbackTokens = readTokensFromHash();
            if (callbackTokens) {
                try {
                    await supabase.auth.setSession({
                        access_token: callbackTokens.accessToken,
                        refresh_token: callbackTokens.refreshToken,
                    });
                } catch (callbackError) {
                    if (typeof options.onHydrationError === "function") {
                        options.onHydrationError(callbackError, callbackTokens);
                    } else {
                        console.error("Failed to hydrate auth callback:", callbackError);
                    }
                } finally {
                    clearLocationHash();
                }
            }
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) {
            setStoredToken(null);
            if (options.syncAvatar) {
                syncHeaderAvatar(null);
            }
            if (typeof options.onSessionError === "function") {
                options.onSessionError(error);
            }
            return { session: null, error };
        }

        setStoredToken(data.session);
        if (options.syncAvatar) {
            syncHeaderAvatar(data.session?.user || null);
        }

        if (options.captureWelcomeUserName) {
            const shouldShowWelcome = consumeWelcomeAfterAuthFlag();
            if (shouldShowWelcome && data.session?.user) {
                window.pendingWelcomeUserName = getDisplayName(data.session.user);
            }
        }

        if (typeof options.onSessionReady === "function") {
            options.onSessionReady(data.session || null);
        }

        return { session: data.session || null, error: null };
    }

    function bindAuthStateListener(supabase, options = {}) {
        return supabase.auth.onAuthStateChange((event, session) => {
            setStoredToken(session);
            if (options.syncAvatar) {
                syncHeaderAvatar(session?.user || null);
            }
            if (typeof options.onChange === "function") {
                options.onChange(event, session || null);
            }
        });
    }

    function syncHeaderAvatar(user, avatarElementId = "header-profile-avatar") {
        const avatarBadge = document.getElementById(avatarElementId);
        if (!avatarBadge) return;

        avatarBadge.classList.remove("has-photo", "avatar-custom");
        avatarBadge.style.background = "";
        avatarBadge.style.backgroundImage = "";

        const selectedPreset = localStorage.getItem(CONFIG.AVATAR_PRESET_KEY) || "google";
        if (selectedPreset !== "google" && CONFIG.AVATAR_PRESETS[selectedPreset]) {
            const preset = CONFIG.AVATAR_PRESETS[selectedPreset];
            avatarBadge.classList.add("avatar-custom");
            avatarBadge.textContent = preset.emoji;
            avatarBadge.style.background = preset.background;
            return;
        }

        const displayName = getDisplayName(user);
        const metadata = user?.user_metadata || {};
        const avatarUrl = metadata.avatar_url || metadata.picture || "";

        if (avatarUrl) {
            const safeUrl = avatarUrl.replace(/"/g, "%22");
            avatarBadge.classList.add("has-photo");
            avatarBadge.textContent = "";
            avatarBadge.style.backgroundImage = `url("${safeUrl}")`;
            return;
        }

        avatarBadge.textContent = getInitials(displayName);
    }

    window.FlashLearnCore = Object.freeze({
        bindAuthStateListener,
        bootstrapSession,
        buildOAuthAuthorizeUrl,
        buildGoogleAuthorizeUrl,
        CONFIG,
        clearLocationHash,
        consumeWelcomeAfterAuthFlag,
        getDisplayName,
        getHeaders,
        getInitials,
        hasValidToken,
        normalizeLegacyNextPath,
        readTokensFromHash,
        resolveSafeNextPath,
        setWelcomeAfterAuthFlag,
        setStoredToken,
        signInWithOAuth,
        signInWithGoogle,
        signOutSession,
        syncHeaderAvatar,
    });
})();
