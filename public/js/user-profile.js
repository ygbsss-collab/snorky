(function (global) {
  "use strict";

  const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const PROFILE_ENSURE_PENDING_KEY = "snorky_profile_ensure_pending_v1";
  const profileCache = new Map();
  const pendingProfileFetches = new Map();

  function getSupabase() {
    if (typeof window.getSnorkySupabase === "function") {
      return window.getSnorkySupabase();
    }
    return null;
  }

  function cleanString(value) {
    if (value === undefined || value === null) return null;
    const cleaned = String(value).trim();
    return cleaned || null;
  }

  function normalizeUserProfile(source) {
    const root = source || {};
    const user = root.user || root;
    const providerUserId = cleanString(
      user.providerUserId ?? user.provider_user_id ?? user.id ?? root.providerUserId ?? root.provider_user_id
    );
    const customNickname = cleanString(user.customNickname ?? user.custom_nickname);
    const customAvatarUrl = cleanString(user.customAvatarUrl ?? user.custom_avatar_url);
    const profileImageUrl = cleanString(user.profileImageUrl ?? user.profile_image_url);
    const avatarType = cleanString(user.avatarType ?? user.avatar_type) || "default";

    return {
      provider: cleanString(root.provider ?? user.provider) || "kakao",
      providerUserId,
      customNickname,
      nickname: cleanString(user.nickname),
      customAvatarUrl,
      profileImageUrl,
      avatarType,
      aidaLevel: cleanString(user.aidaLevel ?? user.aida_level) || "없음",
      certificationStatus: cleanString(user.certificationStatus ?? user.certification_status),
      qualificationStatus: cleanString(user.qualificationStatus ?? user.qualification_status),
      verificationStatus: cleanString(user.verificationStatus ?? user.verification_status),
      certificationVerified: user.certificationVerified === true,
      aidaVerified: user.aidaVerified === true,
      banned: user.banned === true,
      suspendedUntil: cleanString(user.suspendedUntil ?? user.suspended_until),
      gender: cleanString(user.gender) || "비공개",
      bio: cleanString(user.bio),
      ageGroup: cleanString(user.ageGroup ?? user.age_group),
      activityRegion: cleanString(user.activityRegion ?? user.activity_region),
      activityDepth: cleanString(user.activityDepth ?? user.activity_depth),
      certifications: Array.isArray(user.certifications) ? user.certifications : (user.certifications || null),
    };
  }

  function getDisplayName(profile, fallback) {
    const normalized = normalizeUserProfile(profile);
    const fallbackProfile = fallback && typeof fallback === "object" ? normalizeUserProfile(fallback) : null;
    const fallbackName = fallbackProfile
      ? (fallbackProfile.customNickname || fallbackProfile.nickname)
      : cleanString(fallback);
    return normalized.customNickname ||
      normalized.nickname ||
      fallbackName ||
      (normalized.providerUserId ? `버디_${normalized.providerUserId.slice(-4)}` : "다이버");
  }

  function getAvatarUrl(profile, fallback) {
    const normalized = normalizeUserProfile(profile);
    if (normalized.avatarType === "none") return null;
    let fallbackUrl = null;
    if (fallback && typeof fallback === "object") {
      const fallbackProfile = normalizeUserProfile(fallback);
      if (fallbackProfile.avatarType !== "none") {
        fallbackUrl = fallbackProfile.customAvatarUrl || fallbackProfile.profileImageUrl;
      }
    } else {
      fallbackUrl = cleanString(fallback);
    }
    return normalized.customAvatarUrl || normalized.profileImageUrl || fallbackUrl || null;
  }

  function getProfileCacheKey(provider, providerUserId) {
    return `${provider || "any"}:${String(providerUserId)}`;
  }

  function mergeWithCurrentSession(profile, providerUserId) {
    const session = window.SNORKYAuthSession?.get?.();
    if (!session?.user?.id || String(session.user.id) !== String(providerUserId)) return profile;
    const sessionProfile = normalizeUserProfile(session);
    if (!profile) return sessionProfile;
    const storedProfile = normalizeUserProfile(profile);
    return {
      ...sessionProfile,
      ...storedProfile,
      provider: session.provider || storedProfile.provider || "kakao",
      providerUserId: String(providerUserId),
      nickname: storedProfile.nickname || sessionProfile.nickname,
      profileImageUrl: storedProfile.profileImageUrl || sessionProfile.profileImageUrl,
    };
  }

  function syncCurrentSession(profile) {
    if (!profile?.providerUserId) return;
    const session = window.SNORKYAuthSession?.get?.();
    if (!session?.user?.id || String(session.user.id) !== profile.providerUserId) return;
    window.SNORKYAuthSession?.updateProfile?.({
      customNickname: profile.customNickname,
      customAvatarUrl: profile.customAvatarUrl,
      avatarType: profile.avatarType,
      aidaLevel: profile.aidaLevel,
      certificationStatus: profile.certificationStatus,
      banned: profile.banned,
      suspendedUntil: profile.suspendedUntil,
      gender: profile.gender,
      bio: profile.bio,
      ageGroup: profile.ageGroup,
      activityRegion: profile.activityRegion,
      activityDepth: profile.activityDepth,
    });
  }

  function validateNickname(value) {
    const rawNickname = value === undefined || value === null ? "" : String(value);
    const nickname = rawNickname.trim();

    // 빈 값은 카카오 원본 닉네임 fallback을 위해 허용하되, 공백만 입력한 값은 차단한다.
    if (!nickname) {
      if (rawNickname.length > 0) {
        throw new Error("닉네임은 공백만 입력할 수 없습니다.");
      }
      return "";
    }
    if (nickname.length < 2 || nickname.length > 8) {
      throw new Error("닉네임은 2~8자로 입력해 주세요.");
    }
    if (!/^[가-힣A-Za-z0-9_]+$/.test(nickname)) {
      throw new Error("닉네임은 한글, 영문, 숫자, _만 사용할 수 있습니다.");
    }
    return nickname;
  }

  async function findDuplicateNickname(sb, nickname, providerUserId) {
    if (!nickname) return null;
    const nicknamePattern = nickname.replace(/[\\%_]/g, "\\$&");
    const { data, error } = await sb
      .from("user_profiles")
      .select("provider_user_id")
      .ilike("custom_nickname", nicknamePattern)
      .neq("provider_user_id", String(providerUserId))
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`닉네임 중복 확인 실패: ${error.message}`);
    }
    return data || null;
  }

  async function checkNicknameAvailability(customNickname) {
    const session = window.SNORKYAuthSession?.get();
    if (!session?.user) {
      throw new Error("로그인 세션이 필요합니다.");
    }
    const sb = getSupabase();
    if (!sb) {
      throw new Error("Supabase 클라이언트를 초기화하지 못했습니다.");
    }

    const nickname = validateNickname(customNickname);
    if (!nickname) return true;
    const duplicateProfile = await findDuplicateNickname(sb, nickname, session.user.id);
    return !duplicateProfile;
  }

  async function ensureProfileDefaults(provider, providerUserId, sourceUser) {
    const sb = getSupabase();
    if (!sb || !providerUserId) return null;
    const normalizedProvider = provider || "kakao";
    const normalizedUserId = String(providerUserId);
    const sessionUser = sourceUser || window.SNORKYAuthSession?.get?.()?.user || {};
    const loginNickname = String(sessionUser.nickname || "").trim() || null;
    const loginAvatarUrl = String(sessionUser.profileImageUrl || "").trim() || null;
    const { data: existing, error: selectError } = await sb.from("user_profiles")
      .select("custom_nickname, custom_avatar_url, avatar_type")
      .eq("provider", normalizedProvider).eq("provider_user_id", normalizedUserId).maybeSingle();
    if (selectError) throw selectError;
    if (!existing) {
      const { error } = await sb.from("user_profiles").upsert({
        provider: normalizedProvider,
        provider_user_id: normalizedUserId,
        custom_nickname: loginNickname,
        custom_avatar_url: loginAvatarUrl,
        avatar_type: "default",
        updated_at: new Date().toISOString()
      }, { onConflict: "provider,provider_user_id" });
      if (error) throw error;
      return null;
    }
    const updates = {};
    if (!String(existing.custom_nickname || "").trim() && loginNickname) updates.custom_nickname = loginNickname;
    if (existing.avatar_type !== "none" && !String(existing.custom_avatar_url || "").trim() && loginAvatarUrl) {
      updates.custom_avatar_url = loginAvatarUrl;
      if (!existing.avatar_type) updates.avatar_type = "default";
    }
    if (Object.keys(updates).length) {
      updates.updated_at = new Date().toISOString();
      const { error } = await sb.from("user_profiles").update(updates)
        .eq("provider", normalizedProvider).eq("provider_user_id", normalizedUserId);
      if (error) throw error;
    }
    return { ...existing, ...updates };
  }

  async function getUserProfile(userId, options = {}) {
    const normalizedUserId = cleanString(userId);
    if (!normalizedUserId) return null;
    const provider = cleanString(options.provider);
    const cacheKey = getProfileCacheKey(provider, normalizedUserId);
    if (options.forceRefresh) profileCache.delete(cacheKey);
    if (profileCache.has(cacheKey)) return profileCache.get(cacheKey);
    if (pendingProfileFetches.has(cacheKey)) return pendingProfileFetches.get(cacheKey);

    const fetchPromise = (async () => {
      const sb = options.supabase || getSupabase();
      if (!sb) {
        return mergeWithCurrentSession(null, normalizedUserId) ||
          normalizeUserProfile({ provider, providerUserId: normalizedUserId });
      }
      let query = sb
        .from("user_profiles")
        .select("provider, provider_user_id, custom_nickname, custom_avatar_url, avatar_type, aida_level, certification_status, banned, suspended_until, gender, bio, age_group, activity_region, activity_depth")
        .eq("provider_user_id", normalizedUserId);
      if (provider) query = query.eq("provider", provider);
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;

      const normalized = mergeWithCurrentSession(
        data ? normalizeUserProfile(data) : null,
        normalizedUserId
      ) || normalizeUserProfile({ provider, providerUserId: normalizedUserId });
      profileCache.set(cacheKey, normalized);
      if (options.syncSession !== false) syncCurrentSession(normalized);
      return normalized;
    })().finally(() => pendingProfileFetches.delete(cacheKey));

    pendingProfileFetches.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  async function ensureUserProfile(session) {
    const activeSession = session || window.SNORKYAuthSession?.get?.();
    if (!activeSession?.user?.id) return null;
    if (!getSupabase()) throw new Error("Supabase client is not ready.");
    await ensureProfileDefaults(activeSession.provider || "kakao", activeSession.user.id, activeSession.user);
    profileCache.delete(getProfileCacheKey(activeSession.provider || "kakao", activeSession.user.id));
    return getUserProfile(activeSession.user.id, {
      provider: activeSession.provider || "kakao",
      forceRefresh: true,
      syncSession: true,
    });
  }

  function getCachedUserProfile(userId, provider) {
    const normalizedUserId = cleanString(userId);
    if (!normalizedUserId) return null;
    return profileCache.get(getProfileCacheKey(provider, normalizedUserId)) || null;
  }

  function setCachedUserProfile(userId, profile, provider = "kakao") {
    const normalizedUserId = cleanString(userId);
    if (!normalizedUserId || !profile) return null;
    const normalized = mergeWithCurrentSession(normalizeUserProfile({
      provider,
      user: { ...profile, providerUserId: normalizedUserId },
    }), normalizedUserId);
    profileCache.set(getProfileCacheKey(provider, normalizedUserId), normalized);
    return normalized;
  }

  function invalidateUserProfile(userId, provider = "kakao") {
    if (userId === undefined || userId === null) {
      profileCache.clear();
      return;
    }
    profileCache.delete(getProfileCacheKey(provider, userId));
  }

  async function fetchRemoteProfile(provider, providerUserId) {
    if (!providerUserId) return null;
    try {
      const session = window.SNORKYAuthSession?.get?.();
      if (session?.user?.id && String(session.user.id) === String(providerUserId)) {
        return await ensureUserProfile(session);
      }
      return await getUserProfile(providerUserId, {
        provider: provider || "kakao",
        forceRefresh: true,
      });
    } catch (err) {
      console.warn("[SNORKY Profile] 프로필 조회 실패:", err);
      return null;
    }
  }

  async function uploadAvatarImage(sb, file, providerUserId) {
    if (!file) return null;
    if (file.size > MAX_AVATAR_SIZE) {
      throw new Error("이미지 크기는 최대 5MB까지 업로드 가능합니다.");
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new Error("JPG, PNG, WebP 형식의 이미지만 업로드 가능합니다.");
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `kakao_${providerUserId}_${Date.now()}.${ext}`;
    const filePath = `user_avatars/${fileName}`;

    const { error: uploadError } = await sb.storage
      .from("avatars")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`이미지 업로드 실패: ${uploadError.message}`);
    }

    const { data } = sb.storage.from("avatars").getPublicUrl(filePath);
    if (!data?.publicUrl) {
      throw new Error("이미지 공용 URL 생성에 실패했습니다.");
    }
    return data.publicUrl;
  }

  async function saveProfile({ customNickname, avatarFile, avatarType, customAvatarUrl, aidaLevel, gender, bio, ageGroup, activityRegion, activityDepth }) {
    const session = window.SNORKYAuthSession?.get();
    if (!session || !session.user) {
      throw new Error("로그인 세션이 필요합니다.");
    }

    const sb = getSupabase();
    if (!sb) {
      throw new Error("Supabase 클라이언트를 초기화하지 못했습니다.");
    }

    const providerUserId = String(session.user.id);
    let finalNickname = null;
    if (customNickname !== undefined && customNickname !== null) {
      const trimmed = validateNickname(customNickname);
      finalNickname = trimmed || null;
    } else {
      finalNickname = session.user.customNickname || null;
    }

    let finalAvatarUrl = session.user.customAvatarUrl || null;
    let finalAvatarType = avatarType || session.user.avatarType || "default";

    if (avatarFile) {
      finalAvatarUrl = await uploadAvatarImage(sb, avatarFile, providerUserId);
      finalAvatarType = "custom";
    } else if (avatarType === "none") {
      finalAvatarUrl = null;
      finalAvatarType = "none";
    } else if (avatarType === "default") {
      finalAvatarUrl = null;
      finalAvatarType = "default";
    } else if (customAvatarUrl) {
      finalAvatarUrl = customAvatarUrl;
      finalAvatarType = "custom";
    }

    const finalAidaLevel = (aidaLevel !== undefined && aidaLevel !== null) ? (String(aidaLevel).trim() || "없음") : (session.user.aidaLevel || "없음");
    const finalGender = (gender !== undefined && gender !== null) ? String(gender).trim() : (session.user.gender || "비공개");
    if (!["남성", "여성", "비공개"].includes(finalGender)) {
      throw new Error("성별 선택값을 확인해 주세요.");
    }

    const validAgeGroups = ["20대", "30대", "40대", "50대", "60대", "70대"];
    const finalAgeGroup = (ageGroup !== undefined && ageGroup !== null && validAgeGroups.includes(String(ageGroup).trim()))
      ? String(ageGroup).trim()
      : null;

    const finalActivityRegion = (activityRegion !== undefined && activityRegion !== null && String(activityRegion).trim() && String(activityRegion).trim() !== "미설정")
      ? String(activityRegion).trim()
      : null;

    const finalActivityDepth = (activityDepth !== undefined && activityDepth !== null && String(activityDepth).trim() && String(activityDepth).trim() !== "미설정")
      ? String(activityDepth).trim()
      : null;

    const finalBio = (bio !== undefined && bio !== null)
      ? (String(bio).trim() || null)
      : (session.user.bio ? String(session.user.bio).trim() : null);
    if (finalBio && finalBio.length > 100) {
      throw new Error("자기소개는 최대 100자까지 가능합니다.");
    }

    // 카카오 원본 닉네임 fallback은 검사하지 않고, 사용자가 저장하는 custom_nickname만 중복 확인한다.
    if (finalNickname) {
      const duplicateProfile = await findDuplicateNickname(sb, finalNickname, providerUserId);
      if (duplicateProfile) {
        throw new Error("이미 사용 중인 닉네임입니다.");
      }
    }

    const payload = {
      provider: session.provider || "kakao",
      provider_user_id: providerUserId,
      custom_nickname: finalNickname,
      custom_avatar_url: finalAvatarUrl,
      avatar_type: finalAvatarType,
      aida_level: finalAidaLevel,
      gender: finalGender,
      age_group: finalAgeGroup,
      activity_region: finalActivityRegion,
      activity_depth: finalActivityDepth,
      bio: finalBio,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await sb
      .from("user_profiles")
      .upsert(payload, { onConflict: "provider,provider_user_id" });

    if (upsertError) {
      if (upsertError.code === "23505") {
        throw new Error("이미 사용 중인 닉네임입니다.");
      }
      throw new Error(`프로필 저장 실패: ${upsertError.message}`);
    }

    // 로컬 세션 동기화
    window.SNORKYAuthSession?.updateProfile({
      customNickname: finalNickname,
      customAvatarUrl: finalAvatarUrl,
      avatarType: finalAvatarType,
      aidaLevel: finalAidaLevel,
      gender: finalGender,
      ageGroup: finalAgeGroup,
      activityRegion: finalActivityRegion,
      activityDepth: finalActivityDepth,
      bio: finalBio,
    });

    // DB 최신값 1회 재조회하여 세션 및 캐시 완벽 동기화
    await fetchRemoteProfile(session.provider || "kakao", providerUserId);

    // 공개 프로필 캐시 무효화
    try {
      window.SNORKYBuddyProfileCard?.invalidateCache?.(providerUserId);
    } catch (_) {}

    return window.SNORKYAuthSession?.getEffectiveProfile(window.SNORKYAuthSession.get());
  }

  async function deleteAccount() {
    const session = window.SNORKYAuthSession?.get();
    if (!session || !session.user) {
      throw new Error("로그인 세션이 존재하지 않습니다.");
    }

    const providerUserId = String(session.user.id);
    const provider = session.provider || "kakao";

    // 1. 카카오 연결 해제 (OAuth Unlink)
    try {
      const config = window.SNORKY_SUPABASE_CONFIG || { url: "https://vqpkckonpsnzhuwuybav.supabase.co", publishableKey: "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT" };
      const edgeFunctionUrl = `${config.url.replace(/\/$/, "")}/functions/v1/delete-account`;
      const key = config.publishableKey;

      const res = await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": key,
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify({
          providerUserId,
        }),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 400) {
        throw new Error(resData.message || "카카오 연결 해제 처리에 실패했습니다.");
      }
    } catch (err) {
      console.error("[SNORKY Profile] 카카오 연결 해제 실패:", err.message);
      throw new Error(err.message || "카카오 연결 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }

    // 2. Supabase DB 사용자 프로필 데이터 삭제
    const sb = getSupabase();
    if (sb) {
      try {
        await sb
          .from("user_profiles")
          .delete()
          .eq("provider", provider)
          .eq("provider_user_id", providerUserId);
      } catch (err) {
        console.warn("[SNORKY Profile] DB 프로필 삭제 경고:", err);
      }

      // 3. Storage 아바타 파일 삭제 시도
      try {
        const { data: files } = await sb.storage.from("avatars").list("user_avatars", {
          search: `kakao_${providerUserId}_`,
        });
        if (Array.isArray(files) && files.length > 0) {
          const filePaths = files.map(f => `user_avatars/${f.name}`);
          await sb.storage.from("avatars").remove(filePaths);
        }
      } catch (_) {}
    }

    // 4. 로컬 사용자 데이터 및 즐겨찾기 삭제
    try {
      localStorage.removeItem("snorky_favorites");
      localStorage.removeItem("snorky_my_points");
      localStorage.removeItem("snorky_diving_schedules");
    } catch (_) {}

    // 5. 로그인 세션 삭제
    try {
      if (window.SNORKYAuthSession?.clear) {
        window.SNORKYAuthSession.clear();
      } else {
        localStorage.removeItem("snorky_auth_session_v1");
      }
      window.dispatchEvent(new CustomEvent("snorky:auth-changed"));
      window.dispatchEvent(new CustomEvent("snorky:favorites-updated"));
    } catch (_) {}

    return true;
  }

  global.SNORKYUserProfile = Object.freeze({
    ensureUserProfile,
    ensureProfileDefaults,
    getUserProfile,
    getCachedUserProfile,
    setCachedUserProfile,
    invalidateUserProfile,
    normalizeUserProfile,
    getDisplayName,
    getAvatarUrl,
    fetchRemoteProfile,
    validateNickname,
    checkNicknameAvailability,
    saveProfile,
    deleteAccount,
    MAX_AVATAR_SIZE,
    ALLOWED_MIME_TYPES,
  });

  async function resumePendingProfileEnsure() {
    let isPending = false;
    try { isPending = localStorage.getItem(PROFILE_ENSURE_PENDING_KEY) === "1"; } catch (_) {}
    if (!isPending) return;
    const session = window.SNORKYAuthSession?.get?.();
    if (!session?.user?.id || !getSupabase()) return;
    try {
      await ensureUserProfile(session);
      localStorage.removeItem(PROFILE_ENSURE_PENDING_KEY);
    } catch (error) {
      console.warn("[SNORKY Profile] deferred profile ensure failed:", error?.message || error);
    }
  }

  Promise.resolve().then(resumePendingProfileEnsure);
  global.addEventListener("snorky:supabase-ready", resumePendingProfileEnsure);
})(window);
