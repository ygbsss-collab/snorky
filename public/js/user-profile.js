(function (global) {
  "use strict";

  const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

  function getSupabase() {
    if (typeof window.getSnorkySupabase === "function") {
      return window.getSnorkySupabase();
    }
    return null;
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

  async function fetchRemoteProfile(provider, providerUserId) {
    const sb = getSupabase();
    if (!sb || !providerUserId) return null;
    try {
      const { data, error } = await sb
        .from("user_profiles")
        .select("custom_nickname, custom_avatar_url, avatar_type, aida_level, gender, bio")
        .eq("provider", provider || "kakao")
        .eq("provider_user_id", String(providerUserId))
        .maybeSingle();

      if (error) {
        console.warn("[SNORKY Profile] 프로필 조회 경고:", error.message);
        return null;
      }
      if (data) {
        window.SNORKYAuthSession?.updateProfile({
          customNickname: data.custom_nickname,
          customAvatarUrl: data.custom_avatar_url,
          avatarType: data.avatar_type,
          aidaLevel: data.aida_level || "없음",
          gender: data.gender || "비공개",
          bio: data.bio || null,
        });
      }
      return data;
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

  async function saveProfile({ customNickname, avatarFile, avatarType, customAvatarUrl, aidaLevel, gender, bio }) {
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
      bio: finalBio,
    });

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
    fetchRemoteProfile,
    validateNickname,
    checkNicknameAvailability,
    saveProfile,
    deleteAccount,
    MAX_AVATAR_SIZE,
    ALLOWED_MIME_TYPES,
  });
})(window);
