/**
 * ============================================================================
 * SUPABASE.JS - Authentication and Data Sync
 * ============================================================================
 *
 * Handles:
 * - Email/password auth with Supabase
 * - Session restore on refresh
 * - Per-user data load/save for entries and stories
 */

let supabaseClientInstance = null;
let syncTimer = null;
let syncInFlight = false;
let syncQueuedDuringFlight = false;
let loadedUserId = null;
let pendingProfileAvatarUrl = '';
let isLoggingOut = false;
let initialUserDataHydrated = false;
let isEnteringApp = false;

const REMOTE_SYNC_DEBOUNCE_MS = 1200;

function isElectronRuntime() {
    const ua = navigator.userAgent || '';
    return !!(window.electronAPI || ua.includes('Electron'));
}

function withTimeout(promise, timeoutMs, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        })
    ]);
}

function getAuthRedirectUrl() {
    const cfg = window.WAYMARK_CONFIG || {};
    if (cfg.AUTH_REDIRECT_URL) {
        return cfg.AUTH_REDIRECT_URL;
    }
    return window.location.origin + window.location.pathname;
}

function getDisplayNameForUser(user) {
    if (!user) {
        return 'add profile details';
    }
    const metadata = user.user_metadata || {};
    const displayName = (metadata.display_name || '').trim();
    if (displayName) {
        return displayName;
    }
    return 'add profile details';
}

function getAvatarUrlForUser(user) {
    if (!user || !user.user_metadata) {
        return '';
    }
    const avatarUrl = (user.user_metadata.avatar_url || '').trim();
    return avatarUrl;
}

function setProfileStatus(message, isError = false) {
    const statusEl = document.getElementById('profileStatus');
    if (!statusEl) {
        return;
    }
    statusEl.textContent = message || '';
    statusEl.style.color = isError ? '#8b1f3d' : '#2f5f3a';
}

function setAuthStatus(message, isError = false) {
    const authStatusEl = document.getElementById('authStatus');
    if (!authStatusEl) {
        return;
    }
    authStatusEl.textContent = message || '';
    authStatusEl.style.color = isError ? '#8b1f3d' : '#3b5f2a';
}

function isSupabaseConfigured() {
    const cfg = window.WAYMARK_CONFIG || {};
    return !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
}

function getSupabaseClient() {
    if (supabaseClientInstance) {
        return supabaseClientInstance;
    }
    if (!isSupabaseConfigured()) {
        return null;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        console.error('[Waymark] Supabase library not loaded. Check that Supabase JS is included in HTML.');
        return null;
    }

    const cfg = window.WAYMARK_CONFIG;
    const electronRuntime = isElectronRuntime();
    try {
        supabaseClientInstance = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                // Electron is effectively single-window here; disabling multi-tab lock
                // avoids auth-token lock contention that can stall signOut/getSession.
                multiTab: !electronRuntime
            }
        });
        console.log('[Waymark] Supabase client initialized');
    } catch (error) {
        console.error('[Waymark] Failed to initialize Supabase client:', error);
        return null;
    }
    return supabaseClientInstance;
}

function updateAuthUi() {
    const logoutBtn = document.getElementById('logoutBtn');
    const profileSummaryBtn = document.getElementById('profileSummaryBtn');
    const profileDisplayNameEl = document.getElementById('profileDisplayName');
    const profileAvatarEl = document.getElementById('profileAvatar');
    const profileAvatarFallbackEl = document.getElementById('profileAvatarFallback');

    if (logoutBtn) {
        logoutBtn.style.display = authenticatedUser ? 'inline-block' : 'none';
    }
    if (profileSummaryBtn) {
        profileSummaryBtn.style.display = 'inline-flex';
        profileSummaryBtn.setAttribute('aria-disabled', authenticatedUser ? 'false' : 'true');
    }

    const userInfoEl = document.getElementById('userInfo');
    if (userInfoEl) {
        userInfoEl.innerText = '';
    }

    if (profileDisplayNameEl) {
           profileDisplayNameEl.innerText = getDisplayNameForUser(authenticatedUser);
    }

    const avatarUrl = getAvatarUrlForUser(authenticatedUser);
    if (profileAvatarEl && profileAvatarFallbackEl) {
        if (avatarUrl) {
            profileAvatarEl.src = avatarUrl;
            profileAvatarEl.style.display = 'inline-flex';
            profileAvatarFallbackEl.style.display = 'none';
        } else {
            profileAvatarEl.removeAttribute('src');
            profileAvatarEl.style.display = 'none';
            profileAvatarFallbackEl.style.display = 'inline-flex';
        }
    }
}

function openProfileModal() {
    if (!authenticatedUser) {
        alert('Sign in to add profile details.');
        return;
    }
    const displayNameInput = document.getElementById('profileDisplayNameInput');
    const emailInput = document.getElementById('profileEmailInput');
    const currentPasswordInput = document.getElementById('profileCurrentPasswordInput');
    const newPasswordInput = document.getElementById('profileNewPasswordInput');
    const profileModal = document.getElementById('profileModal');

    if (!displayNameInput || !emailInput || !profileModal) {
        return;
    }

    displayNameInput.value = (authenticatedUser.user_metadata?.display_name || '').trim();
    pendingProfileAvatarUrl = getAvatarUrlForUser(authenticatedUser) || '';
    renderProfileImagePreview(pendingProfileAvatarUrl);
    emailInput.value = authenticatedUser.email || '';
    const profileImageInput = document.getElementById('profileImageInput');
    if (profileImageInput) {
        profileImageInput.value = '';
    }
    if (currentPasswordInput) {
        currentPasswordInput.value = '';
    }
    if (newPasswordInput) {
        newPasswordInput.value = '';
    }
    setProfileStatus('');
    profileModal.style.display = 'flex';
}

function renderProfileImagePreview(imageUrl) {
    const previewImg = document.getElementById('profileImagePreviewImg');
    const previewFallback = document.getElementById('profileImagePreviewFallback');
    if (!previewImg || !previewFallback) {
        return;
    }

    if (imageUrl) {
        previewImg.src = imageUrl;
        previewImg.style.display = 'block';
        previewFallback.style.display = 'none';
    } else {
        previewImg.removeAttribute('src');
        previewImg.style.display = 'none';
        previewFallback.style.display = 'inline-flex';
    }
}

function compressImageFile(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var img = new Image();
            img.onload = function () {
                var scale = Math.min(maxSide / img.width, maxSide / img.height, 1);
                var w = Math.max(1, Math.round(img.width * scale));
                var h = Math.max(1, Math.round(img.height * scale));
                var canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function initializeProfileImageControls() {
    var inputEl = document.getElementById('profileImageInput');
    var removeBtn = document.getElementById('removeProfileImageBtn');

    if (inputEl) {
        inputEl.addEventListener('change', function (event) {
            var file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
            if (!file) {
                return;
            }

            var validTypes = ['image/png', 'image/jpeg', 'image/webp'];
            if (!validTypes.includes(file.type)) {
                setProfileStatus('Please choose PNG, JPG, or WEBP.', true);
                inputEl.value = '';
                return;
            }

            var maxSizeBytes = 5 * 1024 * 1024;
            if (file.size > maxSizeBytes) {
                setProfileStatus('Profile picture must be under 5MB.', true);
                inputEl.value = '';
                return;
            }

            setProfileStatus('Processing image...');
            compressImageFile(file, 128, 0.82).then(function (dataUrl) {
                pendingProfileAvatarUrl = dataUrl;
                renderProfileImagePreview(pendingProfileAvatarUrl);
                setProfileStatus('Profile picture ready to save.');
            }).catch(function () {
                setProfileStatus('Could not read that image file.', true);
            });
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            pendingProfileAvatarUrl = '';
            renderProfileImagePreview('');
            if (inputEl) {
                inputEl.value = '';
            }
            setProfileStatus('Photo will be removed when you save.');
        });
    }
}

function closeProfileModal() {
    const profileModal = document.getElementById('profileModal');
    if (!profileModal) {
        return;
    }
    profileModal.style.display = 'none';
}

async function saveProfileChanges() {
    if (!authenticatedUser) {
        setProfileStatus('You need to be signed in to edit profile.', true);
        return;
    }

    const client = getSupabaseClient();
    if (!client) {
        setProfileStatus('Supabase client is not available.', true);
        return;
    }

    const displayNameInput = document.getElementById('profileDisplayNameInput');
    const emailInput = document.getElementById('profileEmailInput');
    const currentPasswordInput = document.getElementById('profileCurrentPasswordInput');
    const newPasswordInput = document.getElementById('profileNewPasswordInput');

    const newDisplayName = displayNameInput ? displayNameInput.value.trim() : '';
    const newEmail = emailInput ? emailInput.value.trim() : '';
    const currentPassword = currentPasswordInput ? currentPasswordInput.value : '';
    const newPassword = newPasswordInput ? newPasswordInput.value : '';

    const currentEmail = (authenticatedUser.email || '').trim();
    const currentAvatarUrl = getAvatarUrlForUser(authenticatedUser) || '';
    const normalizedPendingAvatar = pendingProfileAvatarUrl || '';
    const isEmailChange = !!newEmail && newEmail.toLowerCase() !== currentEmail.toLowerCase();
    const isPasswordChange = !!newPassword;
    const isDisplayNameChange = newDisplayName !== ((authenticatedUser.user_metadata?.display_name || '').trim());
    const isAvatarChange = normalizedPendingAvatar !== currentAvatarUrl;

    if (!isEmailChange && !isPasswordChange && !isDisplayNameChange && !isAvatarChange) {
        setProfileStatus('No profile changes to save.');
        return;
    }

    if ((isEmailChange || isPasswordChange) && !currentPassword) {
        setProfileStatus('Enter your current password to change email or password.', true);
        return;
    }

    if (isPasswordChange && newPassword.length < 6) {
        setProfileStatus('New password must be at least 6 characters.', true);
        return;
    }

    setProfileStatus('Saving profile...');

    if (isEmailChange || isPasswordChange) {
        const { error: reauthError } = await client.auth.signInWithPassword({
            email: currentEmail,
            password: currentPassword
        });
        if (reauthError) {
            setProfileStatus('Current password is incorrect.', true);
            return;
        }
    }

    if (isDisplayNameChange || isAvatarChange) {
        const mergedMetadata = Object.assign({}, authenticatedUser.user_metadata || {}, {
            display_name: newDisplayName,
            avatar_url: normalizedPendingAvatar || null
        });
        const { data, error } = await client.auth.updateUser({
            data: mergedMetadata
        });
        if (error) {
            setProfileStatus(error.message || 'Could not update profile.', true);
            return;
        }
        if (data && data.user) {
            authenticatedUser = data.user;
        }
        // Always re-fetch to ensure we have the latest metadata
        const { data: freshData } = await client.auth.getUser();
        if (freshData && freshData.user) {
            authenticatedUser = freshData.user;
        }
    }

    if (isEmailChange) {
        const { data, error } = await client.auth.updateUser({
            email: newEmail
        }, {
            emailRedirectTo: getAuthRedirectUrl()
        });
        if (error) {
            setProfileStatus(error.message || 'Could not update email address.', true);
            return;
        }
        if (data && data.user) {
            authenticatedUser = data.user;
        }
    }

    if (isPasswordChange) {
        const { data, error } = await client.auth.updateUser({
            password: newPassword
        });
        if (error) {
            setProfileStatus(error.message || 'Could not update password.', true);
            return;
        }
        if (data && data.user) {
            authenticatedUser = data.user;
        }
    }

    updateAuthUi();
    pendingProfileAvatarUrl = getAvatarUrlForUser(authenticatedUser) || '';
    if (isEmailChange) {
        setProfileStatus('Saved. Confirm your new email using the link sent to your inbox.');
    } else {
        setProfileStatus('Profile updated.');
        closeProfileModal();
    }
}

function clearLocalDataState() {
    if (appGraphicsLayer) {
        appGraphicsLayer.removeAll();
    }

    stories.forEach((story) => {
        try {
            if (mapInstance && story.graphicsLayer) {
                mapInstance.remove(story.graphicsLayer);
            }
        } catch (error) {
            // Ignore layer remove failures during reset
        }
    });

    pointStore.clear();
    journalEntries.length = 0;
    stories.length = 0;

    nextEntryId = 1;
    nextStoryId = 1;
    currentEditingEntryId = null;
    currentEditingStoryId = null;
    currentStoryEditEntries = [];

    updateSidebarList();
    closeDetailPanel();
}

function showLoginScreen() {
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('userInfo').innerText = 'Not Logged In';
}

async function waitForMapRuntime(timeoutMs = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        // Wait until the map load event has fired and GeoJSON sources are ready
        if (mapLoaded && mapInstance && typeof mapInstance.getSource === 'function') {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.error('[Waymark] Map runtime did not initialize within timeout');
    return false;
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildPointGeometry(lat, lon) {
    // Mapbox GL uses [lon, lat] for coordinates
    // We just store lat/lon here; rendering is done by updateMapEntryMarkers()
    return { lat, lon };
}

async function loadSupabaseDataForCurrentUser() {
    const client = getSupabaseClient();
    if (!client || !authenticatedUser) {
        return false;
    }
    // Prevent concurrent loads — a load is already in flight.
    if (isHydratingRemoteData) {
        console.log('[Waymark] Data load already in progress, skipping duplicate call.');
        return false;
    }

    console.log('[Waymark] loadSupabaseDataForCurrentUser: starting load for', authenticatedUser.id);

    isHydratingRemoteData = true;

    let entryRows, entryError;
    try {
        const entryResult = await withTimeout(
            client
                .from('entries')
                .select('*')
                .eq('user_id', authenticatedUser.id)
                .order('created_at_ms', { ascending: true }),
            10000,
            'entries fetch'
        );
        entryRows = entryResult.data;
        entryError = entryResult.error;
    } catch (fetchErr) {
        console.error('[Waymark] Entry fetch threw exception:', fetchErr);
        setAuthStatus('Loading entries took too long. Please retry.', true);
        isHydratingRemoteData = false;
        return false;
    }

    if (entryError) {
        console.error('[Waymark] Entry fetch error:', entryError);
        setAuthStatus('Could not load your saved entries from Supabase.', true);
        isHydratingRemoteData = false;
        return false;
    }

    let storyRows, storyError;
    try {
        const storyResult = await withTimeout(
            client
                .from('stories')
                .select('*')
                .eq('user_id', authenticatedUser.id)
                .order('story_id', { ascending: true }),
            10000,
            'stories fetch'
        );
        storyRows = storyResult.data;
        storyError = storyResult.error;
    } catch (fetchErr) {
        console.error('[Waymark] Story fetch threw exception:', fetchErr);
        setAuthStatus('Loading stories took too long. Please retry.', true);
        isHydratingRemoteData = false;
        return false;
    }

    if (storyError) {
        console.error('[Waymark] Story fetch error:', storyError);
        setAuthStatus('Could not load your saved stories from Supabase.', true);
        isHydratingRemoteData = false;
        return false;
    }

    // Only replace in-memory state after successful remote fetches.
    clearLocalDataState();

    let maxEntryId = 0;
    (entryRows || []).forEach((row) => {
        const lat = toNumber(row.lat);
        const lon = toNumber(row.lon);
        const pointKey = row.point_key || buildPointKey(lat, lon);

        if (!pointStore.has(pointKey)) {
            pointStore.set(pointKey, {
                pointKey,
                lat,
                lon,
                mapPoint: buildPointGeometry(lat, lon),
                entries: [],
                graphic: null
            });
        }

        const pointRecord = pointStore.get(pointKey);
        const entryId = toNumber(row.entry_id, nextEntryId);
        maxEntryId = Math.max(maxEntryId, entryId);

        const textHtml = row.text_html || '';
        const textPlain = row.text_plain || htmlToText(textHtml);
        const createdAt = toNumber(row.created_at_ms, Date.now());

        const entryObject = {
            id: entryId,
            title: row.title || 'Untitled Entry',
            textHtml,
            textPlain,
            createdAt,
            image: row.image || null
        };

        pointRecord.entries.push(entryObject);

        journalEntries.push({
            id: entryId,
            title: entryObject.title,
            text: textPlain,
            lat,
            lon,
            image: entryObject.image,
            createdAt
        });
    });

    nextEntryId = Math.max(maxEntryId + 1, 1);

    // Update map with loaded entry markers using Maptiler GeoJSON
    if (typeof updateMapEntryMarkers === 'function') {
        updateMapEntryMarkers();
    }

    let maxStoryId = 0;
    (storyRows || []).forEach((row) => {
        const storyId = toNumber(row.story_id, nextStoryId);
        maxStoryId = Math.max(maxStoryId, storyId);

        let rawEntryIds = row.entry_ids;
        if (typeof rawEntryIds === 'string') {
            try {
                rawEntryIds = JSON.parse(rawEntryIds);
            } catch (error) {
                rawEntryIds = [];
            }
        }
        const storyEntryIds = Array.isArray(rawEntryIds)
            ? rawEntryIds.map((item) => toNumber(item)).filter((item) => Number.isFinite(item))
            : [];

        stories.push({
            id: storyId,
            title: row.title || 'Untitled Story',
            description: row.description || '',
            entryIds: storyEntryIds,
            visible: row.visible !== false,
            isPublic: row.is_public || false,
            totalMiles: toNumber(row.total_miles, 0),
            lineColor: row.line_color || '#a43855',
            centerLat: row.center_lat || null,
            centerLon: row.center_lon || null
        });
    });

    nextStoryId = Math.max(maxStoryId + 1, 1);

    // Update map with loaded story lines using Maptiler GeoJSON
    if (typeof updateMapStoryLines === 'function') {
        updateMapStoryLines();
    }

    updateSidebarList();
    isHydratingRemoteData = false;
    return true;
}

function serializeEntriesForSync(userId) {
    const payload = [];

    pointStore.forEach((pointRecord) => {
        pointRecord.entries.forEach((entry) => {
            payload.push({
                user_id: userId,
                entry_id: entry.id,
                point_key: pointRecord.pointKey,
                lat: pointRecord.lat,
                lon: pointRecord.lon,
                title: entry.title,
                text_html: entry.textHtml,
                text_plain: entry.textPlain,
                image: entry.image,
                created_at_ms: entry.createdAt
            });
        });
    });

    return payload;
}

function serializeStoriesForSync(userId) {
    return stories.map((story) => ({
        user_id: userId,
        story_id: story.id,
        title: story.title,
        description: story.description || '',
        entry_ids: story.entryIds,
        visible: story.visible,
        is_public: story.isPublic || false,
        total_miles: story.totalMiles,
        line_color: story.lineColor || '#a43855',
        center_lat: story.centerLat || null,
        center_lon: story.centerLon || null
    }));
}

async function pushLocalDataToSupabase() {
    if (syncInFlight) {
        syncQueuedDuringFlight = true;
        return;
    }

    const client = getSupabaseClient();
    if (!client || !authenticatedUser || isGuestMode || isHydratingRemoteData) {
        return;
    }

    // Safety guard: never run destructive sync until we've loaded the user's
    // canonical server state for this session.
    if (!initialUserDataHydrated) {
        return;
    }

    syncInFlight = true;
    syncQueuedDuringFlight = false;

    try {
        const entryPayload = serializeEntriesForSync(authenticatedUser.id);
        const storyPayload = serializeStoriesForSync(authenticatedUser.id);

        const { error: deleteEntriesError } = await client
            .from('entries')
            .delete()
            .eq('user_id', authenticatedUser.id);

        if (deleteEntriesError) {
            throw deleteEntriesError;
        }

        if (entryPayload.length > 0) {
            const { error: insertEntriesError } = await client
                .from('entries')
                .insert(entryPayload);
            if (insertEntriesError) {
                throw insertEntriesError;
            }
        }

        const { error: deleteStoriesError } = await client
            .from('stories')
            .delete()
            .eq('user_id', authenticatedUser.id);

        if (deleteStoriesError) {
            throw deleteStoriesError;
        }

        if (storyPayload.length > 0) {
            const { error: insertStoriesError } = await client
                .from('stories')
                .insert(storyPayload);
            if (insertStoriesError) {
                throw insertStoriesError;
            }
        }

        setAuthStatus('Saved to Supabase.');
    } catch (error) {
        console.error(error);
        setAuthStatus('Sync failed. Your local changes are still in this session.', true);
    } finally {
        syncInFlight = false;
        if (syncQueuedDuringFlight) {
            queueSupabaseSync();
        }
    }
}

function queueSupabaseSync() {
    if (!authenticatedUser || isGuestMode || isHydratingRemoteData) {
        return;
    }
    if (!initialUserDataHydrated) {
        return;
    }
    if (syncTimer) {
        clearTimeout(syncTimer);
    }
    syncTimer = setTimeout(() => {
        pushLocalDataToSupabase();
    }, REMOTE_SYNC_DEBOUNCE_MS);
}

async function enterAuthenticatedApp(user) {
    if (!user) {
        return;
    }
    // Prevent re-entrant calls while a load is already happening.
    if (isEnteringApp) {
        console.log('[Waymark] enterAuthenticatedApp already in progress, skipping.');
        return;
    }
    isEnteringApp = true;
    try {
        // Use the session user directly — it's already validated by onAuthStateChange/getSession
        authenticatedUser = user;
        isGuestMode = false;
        enterApp(`User: ${authenticatedUser.email}`, false);
        updateAuthUi();

        const shouldLoadRemoteData = loadedUserId !== user.id ||
            (journalEntries.length === 0 && pointStore.size === 0 && stories.length === 0);

        if (shouldLoadRemoteData) {
            initialUserDataHydrated = false;
            const didLoadRemoteData = await loadSupabaseDataForCurrentUser();
            loadedUserId = didLoadRemoteData ? user.id : null;
            initialUserDataHydrated = !!didLoadRemoteData;
        } else if (loadedUserId === user.id) {
            initialUserDataHydrated = true;
        }
    } finally {
        isEnteringApp = false;
    }
}

async function handleLoginAction(email, password) {
    const client = getSupabaseClient();
    if (!client) {
        setAuthStatus('Add Supabase URL and anon key in js/config.js first.', true);
        return;
    }

    setAuthStatus('Connecting...');

    try {
        const loginResult = await client.auth.signInWithPassword({ email, password });

        if (loginResult.error) {
            setAuthStatus(loginResult.error.message || 'Incorrect email or password.', true);
            return;
        }

        await enterAuthenticatedApp(loginResult.data.user);
        setAuthStatus('Signed in.');
    } catch (error) {
        console.error('[Waymark] Login error:', error);
        const errorMsg = error?.message || 'Connection failed. Please check your internet connection and try again.';
        setAuthStatus(errorMsg, true);
    }
}

async function handleSignupAction(email, password) {
    const client = getSupabaseClient();
    if (!client) {
        setAuthStatus('Add Supabase URL and anon key in js/config.js first.', true);
        return;
    }

    setAuthStatus('Creating account...');

    try {
        // First check if an account already exists for this email by attempting a sign-in.
        // Supabase with email confirmation enabled won't return an error on duplicate signUp —
        // it silently sends a confirmation email, making it impossible to detect without this check.
        const checkResult = await client.auth.signInWithPassword({ email, password: '##WAYMARK_CHECK##' });
        const checkMsg = checkResult.error?.message || '';
        const emailExists = checkMsg.toLowerCase().includes('invalid') === false &&
            !checkMsg.toLowerCase().includes('credentials') &&
            !checkMsg.toLowerCase().includes('password') &&
            checkMsg !== '';

        // "Invalid login credentials" means the email has an account (wrong password used here intentionally).
        // Any other error pattern or no error means something unexpected.
        const accountExists = checkMsg.toLowerCase().includes('invalid login credentials') ||
            checkMsg.toLowerCase().includes('invalid credentials') ||
            checkMsg.toLowerCase().includes('email not confirmed');

        if (accountExists) {
            setAuthStatus('An account with this email already exists. Please use Log In instead.', true);
            return;
        }

        const signupResult = await client.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: getAuthRedirectUrl()
            }
        });

        if (signupResult.error) {
            setAuthStatus(signupResult.error.message || 'Could not create account.', true);
            return;
        }

        if (!signupResult.data.session) {
            setAuthStatus('Account created! Check your email to confirm before signing in.');
            return;
        }

        await enterAuthenticatedApp(signupResult.data.user);
        setAuthStatus('Account created and signed in.');
    } catch (error) {
        console.error('[Waymark] Signup error:', error);
        const errorMsg = error?.message || 'Connection failed. Please check your internet connection and try again.';
        setAuthStatus(errorMsg, true);
    }
}

async function handleLogoutAction() {
    if (isLoggingOut) {
        return;
    }
    isLoggingOut = true;
    try {
        const client = getSupabaseClient();
        if (client) {
            await withTimeout(client.auth.signOut(), 6000, 'signOut');
        }
    } catch (error) {
        console.error('[Waymark] Logout error:', error);
    } finally {
        authenticatedUser = null;
        loadedUserId = null;
        initialUserDataHydrated = false;
        isEnteringApp = false;
        isHydratingRemoteData = false;
        closeProfileModal();
        clearLocalDataState();
        updateAuthUi();
        showLoginScreen();
        setAuthStatus('Signed out.');

        setTimeout(() => {
            isLoggingOut = false;
        }, 1500);
    }
}

function initializeSupabaseAuth() {
    // Check if Supabase library is loaded
    if (!window.supabase) {
        console.error('[Waymark] Supabase library not loaded. Check CDN connectivity.');
        setAuthStatus('Unable to load authentication. Check your internet connection.', true);
        return;
    }

    if (!isSupabaseConfigured()) {
        setAuthStatus('Supabase is not configured yet. Guest mode is available.');
        return;
    }

    const client = getSupabaseClient();
    if (!client) {
        setAuthStatus('Could not initialize Supabase client.', true);
        return;
    }

    function applySignedOutState() {
        authenticatedUser = null;
        loadedUserId = null;
        initialUserDataHydrated = false;
        updateAuthUi();
        showLoginScreen();
    }

    // On page load, onAuthStateChange fires SIGNED_IN from localStorage before getSession()
    // resolves. Starting a data fetch there races with getSession()'s internal token-refresh
    // lock and causes the fetch to hang. We use this flag to skip SIGNED_IN on initial load
    // and let getSession() be the sole bootstrap trigger.
    let initialLoadComplete = false;

    client.auth.onAuthStateChange(async (event, session) => {
        console.log('[Waymark] Auth state changed:', event, session ? 'logged in' : 'logged out');

        // During manual logout, ignore follow-up auth events to prevent bounce-back.
        if (isLoggingOut) {
            console.log('[Waymark] Ignoring auth event during logout:', event);
            return;
        }

        if (event === 'SIGNED_OUT') {
            applySignedOutState();
            return;
        }

        // Token refresh: just update the stored user object.
        if (session && session.user && (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
            console.log('[Waymark] Token/user update for:', session.user.email);
            authenticatedUser = session.user;
            updateAuthUi();
            return;
        }

        // SIGNED_IN on initial page load is handled by getSession() below.
        // Only act on SIGNED_IN here for real login actions (after initial load).
        if (session && session.user && event === 'SIGNED_IN') {
            if (!initialLoadComplete) {
                console.log('[Waymark] SIGNED_IN on initial load — deferring to getSession()');
                return;
            }
            console.log('[Waymark] SIGNED_IN (post-load) for:', session.user.email);
            await enterAuthenticatedApp(session.user);
            return;
        }

        console.log('[Waymark] Ignoring auth event:', event);
    });

    // Sole bootstrap trigger on page load. Resolves only after token refresh is complete,
    // so any data fetch started here won't race with the internal lock.
    client.auth.getSession()
        .then(async (result = {}) => {
            initialLoadComplete = true;
            const { data } = result;
            if (data && data.session && data.session.user) {
                console.log('[Waymark] getSession: restoring session for', data.session.user.email);
                await enterAuthenticatedApp(data.session.user);
                return;
            }
            console.log('[Waymark] getSession: no session found');
            applySignedOutState();
        })
        .catch(err => {
            initialLoadComplete = true;
            console.error('[Waymark] Error checking stored session:', err);
            applySignedOutState();
        });
}

initializeProfileImageControls();
initializeSupabaseAuth();

// ==========================================
// GALLERY / SHARE SUPABASE HELPERS
// ==========================================

async function fetchPublicStories(offset, limit) {
    offset = offset || 0;
    limit = limit || 12;
    const client = getSupabaseClient();
    if (!client) return { stories: [], profiles: {} };
    const { data, error } = await client
        .from('stories')
        .select('story_id, user_id, title, description, center_lat, center_lon')
        .eq('is_public', true)
        .order('story_id', { ascending: false })
        .range(offset, offset + limit - 1);
    if (error) { console.warn('fetchPublicStories error', error); return { stories: [], profiles: {} }; }
    const profiles = await fetchProfilesForUserIds((data || []).map(r => r.user_id));
    return { stories: data || [], profiles };
}

async function fetchSharedStories() {
    const client = getSupabaseClient();
    if (!client || !authenticatedUser) return { stories: [], profiles: {} };
    const { data: shares, error: sharesErr } = await client
        .from('story_shares')
        .select('story_id, owner_id')
        .eq('shared_with_user_id', authenticatedUser.id);
    if (sharesErr || !shares || !shares.length) return { stories: [], profiles: {} };

    const sharedPairs = new Set(shares.map(s => `${s.owner_id}:${s.story_id}`));
    const storyIds = shares.map(s => s.story_id);
    const { data, error } = await client
        .from('stories')
        .select('story_id, user_id, title, description, center_lat, center_lon')
        .in('story_id', storyIds);
    if (error) { console.warn('fetchSharedStories error', error); return { stories: [], profiles: {} }; }

    // story_id is not globally unique across users; keep only exact owner+story matches.
    const filteredStories = (data || []).filter(r => sharedPairs.has(`${r.user_id}:${r.story_id}`));
    const profiles = await fetchProfilesForUserIds(filteredStories.map(r => r.user_id));
    return { stories: filteredStories, profiles };
}

async function fetchProfilesForUserIds(userIds) {
    if (!userIds || !userIds.length) return {};
    const unique = [...new Set(userIds)];
    const client = getSupabaseClient();
    if (!client) return {};
    const { data, error } = await client
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', unique);
    if (error || !data) return {};
    const map = {};
    data.forEach(p => { map[p.user_id] = p; });
    return map;
}

async function shareStory(storyId, emails) {
    const client = getSupabaseClient();
    if (!client || !authenticatedUser || !emails.length) return { error: 'Not logged in or no emails' };
    const statusEl = document.getElementById('shareStatus');
    if (statusEl) statusEl.textContent = 'Looking up recipients...';

    const rows = [];
    for (const email of emails) {
        // Look up user ID by email via the DB helper function
        const { data: uidData } = await client.rpc('get_user_id_by_email', { email_to_find: email });
        rows.push({
            story_id: storyId,
            owner_id: authenticatedUser.id,
            shared_with_email: email,
            shared_with_user_id: uidData || null
        });
    }
    const { error } = await client.from('story_shares').upsert(rows, { onConflict: 'owner_id,story_id,shared_with_email' });
    if (error) {
        if (statusEl) statusEl.textContent = 'Error: ' + error.message;
        return { error };
    }
    // Call the Edge Function to send email notifications
    try {
        const story = stories.find(s => s.id === storyId);
        const { data: profile } = await client.from('profiles').select('display_name').eq('user_id', authenticatedUser.id).single();
        await client.functions.invoke('share-story', {
            body: {
                storyTitle: story ? story.title : '',
                ownerName: (profile && profile.display_name) || authenticatedUser.email,
                ownerEmail: authenticatedUser.email,
                recipientEmails: emails
            }
        });
    } catch(e) {
        console.warn('Edge function error (non-fatal):', e);
    }
    if (statusEl) statusEl.textContent = `Invite sent to ${emails.join(', ')}!`;
    return { success: true };
}

async function fetchStoryPreviewEntries(storyId, ownerId) {
    const client = getSupabaseClient();
    if (!client) return [];
    let { data, error } = await client.rpc('get_story_preview_entries', {
        p_story_id: storyId,
        p_owner_id: ownerId
    });

    // Backward compatibility: if the DB function hasn't been upgraded yet,
    // retry the older one-argument signature.
    if (error && /function\s+public\.get_story_preview_entries\(p_story_id\s*=>\s*integer,\s*p_owner_id\s*=>\s*uuid\)|does not exist/i.test(error.message || '')) {
        const legacy = await client.rpc('get_story_preview_entries', { p_story_id: storyId });
        data = legacy.data;
        error = legacy.error;
    }

    if (error) {
        console.warn('fetchStoryPreviewEntries error', error);
        return [];
    }
    return data || [];
}
