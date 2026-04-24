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

const REMOTE_SYNC_DEBOUNCE_MS = 1200;

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
        return null;
    }

    const cfg = window.WAYMARK_CONFIG;
    supabaseClientInstance = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
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
        const resolvedName = getDisplayNameForUser(authenticatedUser);
        console.log('[Waymark] updateAuthUi → user_metadata:', authenticatedUser && authenticatedUser.user_metadata, '→ resolved:', resolvedName);
        profileDisplayNameEl.innerText = resolvedName;
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
        if (appView && appGraphicsLayer && GraphicCtor && GraphicsLayerCtor && PointCtor) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildPointGeometry(lat, lon) {
    if (!PointCtor) {
        return null;
    }
    return new PointCtor({
        latitude: lat,
        longitude: lon,
        spatialReference: { wkid: 4326 }
    });
}

async function loadSupabaseDataForCurrentUser() {
    const client = getSupabaseClient();
    if (!client || !authenticatedUser) {
        return;
    }

    const mapReady = await waitForMapRuntime();
    if (!mapReady) {
        setAuthStatus('Map took too long to initialize. Refresh and try again.', true);
        return;
    }

    isHydratingRemoteData = true;

    const { data: entryRows, error: entryError } = await client
        .from('entries')
        .select('*')
        .eq('user_id', authenticatedUser.id)
        .order('created_at_ms', { ascending: true });

    if (entryError) {
        console.error(entryError);
        setAuthStatus('Could not load your saved entries from Supabase.', true);
        isHydratingRemoteData = false;
        return;
    }

    const { data: storyRows, error: storyError } = await client
        .from('stories')
        .select('*')
        .eq('user_id', authenticatedUser.id)
        .order('story_id', { ascending: true });

    if (storyError) {
        console.error(storyError);
        setAuthStatus('Could not load your saved stories from Supabase.', true);
        isHydratingRemoteData = false;
        return;
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

    pointStore.forEach((pointRecord) => {
        if (pointRecord.entries.length > 0) {
            updatePointGraphic(pointRecord);
        }
    });

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

        const graphicsLayer = new GraphicsLayerCtor();
        if (mapInstance) {
            mapInstance.add(graphicsLayer);
        }

        stories.push({
            id: storyId,
            title: row.title || 'Untitled Story',
            entryIds: storyEntryIds,
            visible: row.visible !== false,
            totalMiles: toNumber(row.total_miles, 0),
            graphicsLayer,
            lineColor: row.line_color || '#a43855'
        });
    });

    nextStoryId = Math.max(maxStoryId + 1, 1);

    stories.forEach((story) => {
        updateStoryMapGraphics(story);
        story.graphicsLayer.visible = story.visible;
    });

    updateSidebarList();
    isHydratingRemoteData = false;
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
        entry_ids: story.entryIds,
        visible: story.visible,
        total_miles: story.totalMiles,
        line_color: story.lineColor || '#a43855'
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

    // Prefer server-fresh metadata over the potentially stale JWT payload
    authenticatedUser = user;
    const client = getSupabaseClient();
    if (client) {
        const { data: freshData } = await client.auth.getUser();
        if (freshData && freshData.user) {
            authenticatedUser = freshData.user;
        }
    }

    isGuestMode = false;
    enterApp(`User: ${authenticatedUser.email}`, false);
    updateAuthUi();

    if (loadedUserId !== user.id) {
        loadedUserId = user.id;
        await loadSupabaseDataForCurrentUser();
    }
}

async function handleLoginAction(email, password) {
    const client = getSupabaseClient();
    if (!client) {
        setAuthStatus('Add Supabase URL and anon key in js/config.js first.', true);
        return;
    }

    setAuthStatus('Connecting...');

    const loginResult = await client.auth.signInWithPassword({ email, password });

    if (loginResult.error) {
        const signupResult = await client.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: getAuthRedirectUrl()
            }
        });
        if (signupResult.error) {
            setAuthStatus(signupResult.error.message || 'Authentication failed.', true);
            return;
        }

        if (!signupResult.data.session) {
            setAuthStatus('Account created. Check your email to confirm before signing in.');
            return;
        }

        await enterAuthenticatedApp(signupResult.data.user);
        setAuthStatus('Account created and signed in.');
        return;
    }

    await enterAuthenticatedApp(loginResult.data.user);
    setAuthStatus('Signed in.');
}

async function handleLogoutAction() {
    const client = getSupabaseClient();
    if (client) {
        await client.auth.signOut();
    }

    authenticatedUser = null;
    loadedUserId = null;
    closeProfileModal();
    clearLocalDataState();
    updateAuthUi();
    showLoginScreen();
    setAuthStatus('Signed out.');
}

function initializeSupabaseAuth() {
    if (!isSupabaseConfigured()) {
        setAuthStatus('Supabase is not configured yet. Guest mode is available.');
        return;
    }

    const client = getSupabaseClient();
    if (!client) {
        setAuthStatus('Could not initialize Supabase client.', true);
        return;
    }

    client.auth.onAuthStateChange(async (event, session) => {
        if (!session || !session.user) {
            authenticatedUser = null;
            loadedUserId = null;
            updateAuthUi();
            return;
        }

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
            await enterAuthenticatedApp(session.user);
        }
    });

    client.auth.getSession().then(async ({ data }) => {
        if (data && data.session && data.session.user) {
            await enterAuthenticatedApp(data.session.user);
            setAuthStatus('Session restored.');
        }
    });
}

initializeProfileImageControls();
initializeSupabaseAuth();
