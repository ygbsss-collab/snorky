(function (global) {
  "use strict";

  const STORAGE_KEY = "snorky_auth_session_v1";
  const GUEST_SELECTION_KEY = "snorky_guest_selected_v1";
  const RESTRICTED_INQUIRY_KEY = "snorky_restricted_open_inquiry";

  function normalizeUser(user) {
    if (!user || user.id === undefined || user.id === null) return null;
    return {
      id: String(user.id),
      nickname: user.nickname !== undefined && user.nickname !== null && String(user.nickname).trim() ? String(user.nickname).trim() : null,
      profileImageUrl: user.profileImageUrl ? String(user.profileImageUrl) : null,
      customNickname: user.customNickname !== undefined && user.customNickname !== null && String(user.customNickname).trim() ? String(user.customNickname).trim() : null,
      customAvatarUrl: user.customAvatarUrl ? String(user.customAvatarUrl) : null,
      avatarType: user.avatarType ? String(user.avatarType) : "default", // 'default' | 'custom' | 'none'
      aidaLevel: user.aidaLevel ? String(user.aidaLevel) : "없음",
      gender: ["남성", "여성", "비공개"].includes(String(user.gender || "")) ? String(user.gender) : "비공개",
      bio: user.bio !== undefined && user.bio !== null && String(user.bio).trim() ? String(user.bio).trim() : null,
      ageGroup: user.ageGroup !== undefined && user.ageGroup !== null && String(user.ageGroup).trim() ? String(user.ageGroup).trim() : null,
      activityRegion: user.activityRegion !== undefined && user.activityRegion !== null && String(user.activityRegion).trim() ? String(user.activityRegion).trim() : null,
      activityDepth: user.activityDepth !== undefined && user.activityDepth !== null && String(user.activityDepth).trim() ? String(user.activityDepth).trim() : null,
      certifications: Array.isArray(user.certifications) ? user.certifications : (user.certifications || null),
      certificationStatus: user.certificationStatus ? String(user.certificationStatus) : null,
      qualificationStatus: user.qualificationStatus ? String(user.qualificationStatus) : null,
      verificationStatus: user.verificationStatus ? String(user.verificationStatus) : null,
      certificationVerified: user.certificationVerified === true,
      aidaVerified: user.aidaVerified === true,
      banned: user.banned === true,
      suspendedUntil: user.suspendedUntil ? String(user.suspendedUntil) : null,
      sanctionType: user.sanctionType ? String(user.sanctionType) : null,
    };
  }

  function create(provider, user) {
    const normalizedUser = normalizeUser(user);
    if (!normalizedUser) throw new Error("유효한 사용자 정보가 필요합니다.");
    return {
      version: 1,
      provider: String(provider),
      user: normalizedUser,
      authenticatedAt: new Date().toISOString(),
    };
  }

  function save(session) {
    if (!session || session.version !== 1 || !normalizeUser(session.user)) {
      throw new Error("유효한 로그인 세션이 필요합니다.");
    }
    // 토큰 영구 저장 방지: 혹시 남아있는 토큰 필드 정리
    if ("kakaoAccessToken" in session) {
      delete session.kakaoAccessToken;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  }

  function get() {
    try {
      const session = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!session || session.version !== 1 || !normalizeUser(session.user)) return null;
      // 기존 세션에 저장되어 있던 토큰이 발견되면 자동 제거
      if ("kakaoAccessToken" in session) {
        delete session.kakaoAccessToken;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      }
      return session;
    } catch (_) {
      return null;
    }
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(GUEST_SELECTION_KEY);
  }

  function hasGuestSelection() {
    return localStorage.getItem(GUEST_SELECTION_KEY) === "true";
  }

  function selectGuest() {
    localStorage.setItem(GUEST_SELECTION_KEY, "true");
  }

  function getCurrentUserId() {
    const session = get();
    return session?.user?.id !== undefined && session?.user?.id !== null ? String(session.user.id) : null;
  }

  function getEffectiveProfile(session) {
    if (!session || !session.user) {
      return {
        nickname: "로그인",
        avatarUrl: null,
        avatarType: "default",
        isCustomNickname: false,
        isCustomAvatar: false,
      };
    }
    const commonProfile = global.SNORKYUserProfile;
    const normalized = commonProfile?.normalizeUserProfile
      ? commonProfile.normalizeUserProfile(session)
      : session.user;
    const customNick = normalized.customNickname ? String(normalized.customNickname).trim() : "";
    const userId = normalized.providerUserId || normalized.id || session.user.id;
    const nickname = commonProfile?.getDisplayName
      ? commonProfile.getDisplayName(normalized)
      : (customNick || normalized.nickname || (userId ? `버디_${String(userId).slice(-4)}` : "다이버"));

    const avatarType = normalized.avatarType || "default";
    const avatarUrl = commonProfile?.getAvatarUrl
      ? commonProfile.getAvatarUrl(normalized)
      : (avatarType === "none" ? null : (normalized.customAvatarUrl || normalized.profileImageUrl || null));

    return {
      nickname,
      avatarUrl,
      avatarType,
      isCustomNickname: Boolean(customNick),
      isCustomAvatar: avatarType !== "none" && Boolean(normalized.customAvatarUrl),
    };
  }

  function updateProfile(profileUpdates) {
    const session = get();
    if (!session) return null;
    if (profileUpdates.customNickname !== undefined) {
      session.user.customNickname = profileUpdates.customNickname ? String(profileUpdates.customNickname).trim() : null;
    }
    if (profileUpdates.customAvatarUrl !== undefined) {
      session.user.customAvatarUrl = profileUpdates.customAvatarUrl || null;
    }
    if (profileUpdates.avatarType !== undefined) {
      session.user.avatarType = String(profileUpdates.avatarType);
    }
    if (profileUpdates.aidaLevel !== undefined) {
      session.user.aidaLevel = String(profileUpdates.aidaLevel);
    }
    if (profileUpdates.gender !== undefined) {
      session.user.gender = ["남성", "여성", "비공개"].includes(String(profileUpdates.gender))
        ? String(profileUpdates.gender)
        : "비공개";
    }
    if (profileUpdates.bio !== undefined) {
      session.user.bio = profileUpdates.bio ? String(profileUpdates.bio).trim() : null;
    }
    if (profileUpdates.ageGroup !== undefined) {
      session.user.ageGroup = profileUpdates.ageGroup ? String(profileUpdates.ageGroup).trim() : null;
    }
    if (profileUpdates.activityRegion !== undefined) {
      session.user.activityRegion = profileUpdates.activityRegion ? String(profileUpdates.activityRegion).trim() : null;
    }
    if (profileUpdates.activityDepth !== undefined) {
      session.user.activityDepth = profileUpdates.activityDepth ? String(profileUpdates.activityDepth).trim() : null;
    }
    if (profileUpdates.certifications !== undefined) {
      session.user.certifications = profileUpdates.certifications;
    }
    if (profileUpdates.certificationStatus !== undefined) {
      session.user.certificationStatus = profileUpdates.certificationStatus;
    }
    if (profileUpdates.banned !== undefined) {
      session.user.banned = profileUpdates.banned === true;
    }
    if (profileUpdates.suspendedUntil !== undefined) {
      session.user.suspendedUntil = profileUpdates.suspendedUntil || null;
    }
    if (profileUpdates.sanctionType !== undefined) {
      session.user.sanctionType = profileUpdates.sanctionType || null;
    }
    save(session);
    try {
      window.dispatchEvent(new CustomEvent("snorky:profile-updated", {
        detail: {
          session,
          userId: String(session.user.id),
          user: session.user
        }
      }));
    } catch (_) {}
    return session;
  }

  function isLoggedIn() {
    const session = get();
    return Boolean(session && session.version === 1 && normalizeUser(session.user));
  }

  function getAccessState(session = get()) {
    const user = session?.user || null;
    const suspendedUntil = user?.suspendedUntil ? new Date(user.suspendedUntil) : null;
    const isSuspended = Boolean(suspendedUntil && !Number.isNaN(suspendedUntil.getTime()) && suspendedUntil.getTime() > Date.now());
    return {
      banned: user?.banned === true,
      suspendedUntil: isSuspended ? suspendedUntil.toISOString() : null,
      sanctionType: user?.sanctionType || null,
      isSuspended
    };
  }

  function showBannedOverlay(state = getAccessState()) {
    document.getElementById("snorkyBannedAccountOverlay")?.remove();
    const sanctionLabels = {
      SUSPEND_3_DAYS: "3일 정지",
      SUSPEND_7_DAYS: "7일 정지",
      SUSPEND_30_DAYS: "30일 정지"
    };
    const sanctionLabel = state.banned ? "영구 정지" : (sanctionLabels[state.sanctionType] || "기간 정지");
    const endLabel = state.banned
      ? "영구 정지"
      : new Date(state.suspendedUntil).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const overlay = document.createElement("div");
    overlay.id = "snorkyBannedAccountOverlay";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div style="width:min(360px,calc(100vw - 40px));padding:24px 20px;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.3);text-align:center;box-sizing:border-box;">
        <h2 style="margin:0 0 14px;font-size:19px;color:#172b3a;">운영 방침 위반으로 서비스 이용이 제한되었습니다</h2>
        <dl style="margin:0 0 16px;padding:14px;border-radius:12px;background:#f6f9fb;text-align:left;font-size:13.5px;line-height:1.6;">
          <div style="display:flex;justify-content:space-between;gap:16px;"><dt style="color:#64748b;">현재 제재</dt><dd style="margin:0;font-weight:800;color:#172b3a;">${sanctionLabel}</dd></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><dt style="color:#64748b;">제재 종료일</dt><dd style="margin:0;font-weight:700;color:#172b3a;text-align:right;">${endLabel}</dd></div>
        </dl>
        <p style="margin:0 0 18px;color:#64748b;font-size:13.5px;line-height:1.55;">운영 방침 위반으로 인해 제재 기간 동안 SNORKY 서비스 이용이 제한됩니다.</p>
        <div style="display:flex;gap:8px;">
          <button type="button" data-snorky-access-allowed data-restricted-account-inquiry style="flex:1;height:42px;border:0;border-radius:10px;background:#172b3a;color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;">문의하기</button>
          <button type="button" data-snorky-access-allowed data-restricted-account-close style="flex:1;height:42px;border:0;border-radius:10px;background:#e9eff2;color:#334155;font:inherit;font-size:14px;font-weight:700;cursor:pointer;">닫기</button>
        </div>
      </div>`;
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", zIndex: "100000", display: "grid", placeItems: "center",
      padding: "20px", background: "rgba(8,35,50,.72)", boxSizing: "border-box"
    });
    overlay.querySelector("[data-restricted-account-inquiry]")?.addEventListener("click", () => {
      if (global.SNORKYInquiry?.open) {
        overlay.remove();
        global.SNORKYInquiry.open();
        return;
      }
      try { sessionStorage.setItem(RESTRICTED_INQUIRY_KEY, "1"); } catch (_) {}
      location.href = "./index.html";
    });
    overlay.querySelector("[data-restricted-account-close]")?.addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  }

  async function refreshAccessState() {
    const session = get();
    if (!session?.user?.id) return getAccessState(session);
    let sb = null;
    try { sb = typeof global.getSnorkySupabase === "function" ? global.getSnorkySupabase() : global.snorkySupabase; } catch (_) {}
    if (sb) {
      const result = await sb
        .from("user_profiles")
        .select("certification_status, banned, suspended_until")
        .eq("provider", session.provider || "kakao")
        .eq("provider_user_id", String(session.user.id))
        .maybeSingle();
      if (!result.error && result.data) {
        const suspendedUntil = result.data.suspended_until ? new Date(result.data.suspended_until) : null;
        const isSuspended = Boolean(suspendedUntil && !Number.isNaN(suspendedUntil.getTime()) && suspendedUntil.getTime() > Date.now());
        let sanctionType = null;
        if (result.data.banned === true || isSuspended) {
          const actionResult = await sb.rpc("get_current_user_moderation_action", {
            p_user_id: String(session.user.id)
          });
          if (!actionResult.error && ["SUSPEND_3_DAYS", "SUSPEND_7_DAYS", "SUSPEND_30_DAYS", "PERMANENT_BAN"].includes(actionResult.data)) {
            sanctionType = actionResult.data;
          } else if (result.data.banned === true) {
            sanctionType = "PERMANENT_BAN";
          }
        }
        updateProfile({
          certificationStatus: result.data.certification_status || null,
          banned: result.data.banned === true,
          suspendedUntil: result.data.suspended_until || null,
          sanctionType
        });
      }
    }
    const state = getAccessState();
    if ((state.banned || state.isSuspended) && document.body && !isAccountDeletePage()) showBannedOverlay(state);
    return state;
  }

  function isAccountDeletePage() {
    return /(?:^|\/)account-delete\.html$/i.test(location.pathname);
  }

  async function requireServiceAccess() {
    const state = await refreshAccessState();
    return !(state.banned || state.isSuspended);
  }

  async function requirePostingAccess() {
    const state = await refreshAccessState();
    if (state.banned) throw new Error("영구 정지된 계정은 앱 기능을 사용할 수 없습니다.");
    if (state.isSuspended) {
      const until = new Date(state.suspendedUntil).toLocaleString("ko-KR");
      throw new Error(`${until}까지 게시 및 참여 기능이 정지되었습니다.`);
    }
    return true;
  }

  function showLoginPrompt(message = "즐겨찾기는 로그인 후 이용할 수 있어요.", redirectUrl = "") {
    const existing = document.getElementById("snorkyLoginPromptModal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "snorkyLoginPromptModal";
    overlay.className = "snorky-login-prompt-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "snorkyLoginPromptTitle");

    overlay.innerHTML = `
      <style>
        .snorky-login-prompt-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          background: rgba(10, 25, 41, 0.55);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          padding: 20px;
          animation: snorkyPromptFadeIn .2s ease-out;
        }
        @keyframes snorkyPromptFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .snorky-login-prompt-card {
          width: 100%;
          max-width: 320px;
          border-radius: 20px;
          background: #ffffff;
          padding: 24px 20px 18px;
          box-shadow: 0 16px 36px rgba(10, 30, 50, 0.22);
          text-align: center;
          box-sizing: border-box;
          animation: snorkyPromptCardZoom .2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes snorkyPromptCardZoom {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .snorky-login-prompt-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 12px;
          border-radius: 50%;
          background: #eff6ff;
          color: #1570ef;
          display: grid;
          place-items: center;
        }
        .snorky-login-prompt-icon svg {
          width: 26px;
          height: 26px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .snorky-login-prompt-title {
          margin: 0 0 8px;
          font-size: 17px;
          font-weight: 800;
          color: #101828;
          letter-spacing: -0.02em;
        }
        .snorky-login-prompt-desc {
          margin: 0 0 20px;
          font-size: 13.5px;
          font-weight: 500;
          color: #475467;
          line-height: 1.45;
          word-break: keep-all;
        }
        .snorky-login-prompt-actions {
          display: flex;
          gap: 9px;
        }
        .snorky-login-prompt-btn {
          flex: 1;
          height: 44px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all .18s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          box-sizing: border-box;
        }
        .snorky-login-prompt-cancel {
          border: 1px solid #d0d5dd;
          background: #f8fafc;
          color: #344054;
        }
        .snorky-login-prompt-cancel:hover {
          background: #f1f5f9;
        }
        .snorky-login-prompt-confirm {
          border: 0;
          background: #fee500;
          color: #191919;
          font-weight: 800;
          box-shadow: 0 4px 12px rgba(254, 229, 0, 0.35);
          gap: 6px;
        }
        .snorky-login-prompt-confirm:hover {
          filter: brightness(0.97);
        }
      </style>
      <div class="snorky-login-prompt-card">
        <div class="snorky-login-prompt-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5"></circle>
            <path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6"></path>
          </svg>
        </div>
        <h3 id="snorkyLoginPromptTitle" class="snorky-login-prompt-title">로그인이 필요합니다</h3>
        <p class="snorky-login-prompt-desc">${message || "즐겨찾기는 로그인 후 이용할 수 있어요."}</p>
        <div class="snorky-login-prompt-actions">
          <button id="snorkyLoginPromptCancel" class="snorky-login-prompt-btn snorky-login-prompt-cancel" type="button">취소</button>
          <a id="snorkyLoginPromptConfirm" class="snorky-login-prompt-btn snorky-login-prompt-confirm" href="${redirectUrl ? `./login.html?redirect=${encodeURIComponent(redirectUrl)}` : `./login.html`}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#191919" aria-hidden="true" style="flex-shrink:0;"><path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054-.188.702-.682 2.545-.78 2.94-.122.49.18.483.377.352.155-.103 2.466-1.675 3.47-2.36.544.08 1.102.13 1.663.13 4.97 0 9-3.186 9-7.116S16.97 3 12 3z"/></svg>
            <span>카카오 로그인</span>
          </a>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector("#snorkyLoginPromptCancel")?.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  global.SNORKYAuthSession = Object.freeze({
    create,
    save,
    get,
    clear,
    hasGuestSelection,
    selectGuest,
    getCurrentUserId,
    isLoggedIn,
    showLoginPrompt,
    getEffectiveProfile,
    updateProfile,
    getAccessState,
    refreshAccessState,
    requireServiceAccess,
    requirePostingAccess,
  });

  const replayAllowed = new WeakSet();
  const isAllowedAction = (element) => Boolean(element?.closest?.("[data-snorky-access-allowed], #homeInquiry, #homeInquiryTrigger, a[href*='account-delete.html'], #homeFooterLogoutBtn, #logoutBtn"));

  document.addEventListener("click", (event) => {
    if (isAccountDeletePage() || !isLoggedIn()) return;
    const action = event.target?.closest?.("a, button, [role='button'], [data-action], [onclick], [tabindex]");
    if (!action || isAllowedAction(action)) return;
    if (replayAllowed.has(action)) { replayAllowed.delete(action); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    requireServiceAccess().then((allowed) => {
      if (!allowed || !action.isConnected) return;
      replayAllowed.add(action);
      if (action.form) replayAllowed.add(action.form);
      action.click();
    }).catch(() => {});
  }, true);

  document.addEventListener("submit", (event) => {
    if (isAccountDeletePage() || !isLoggedIn()) return;
    const form = event.target;
    if (isAllowedAction(form)) return;
    if (replayAllowed.has(form)) { replayAllowed.delete(form); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    requireServiceAccess().then((allowed) => {
      if (!allowed || !form.isConnected) return;
      replayAllowed.add(form);
      form.requestSubmit();
    }).catch(() => {});
  }, true);

  const refreshOnLoad = async () => {
    if (isAccountDeletePage()) return;
    const state = await refreshAccessState();
    let openRestrictedInquiry = false;
    try {
      openRestrictedInquiry = sessionStorage.getItem(RESTRICTED_INQUIRY_KEY) === "1";
      if (openRestrictedInquiry) sessionStorage.removeItem(RESTRICTED_INQUIRY_KEY);
    } catch (_) {}
    if (openRestrictedInquiry && (state.banned || state.isSuspended) && global.SNORKYInquiry?.open) {
      document.getElementById("snorkyBannedAccountOverlay")?.remove();
      global.SNORKYInquiry.open();
    }
  };
  if (document.readyState === "complete") refreshOnLoad();
  else global.addEventListener("load", refreshOnLoad, { once: true });
})(window);
