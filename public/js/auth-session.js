(function (global) {
  "use strict";

  const STORAGE_KEY = "snorky_auth_session_v1";

  function normalizeUser(user) {
    if (!user || user.id === undefined || user.id === null) return null;
    return {
      id: String(user.id),
      nickname: String(user.nickname || "카카오 사용자"),
      profileImageUrl: user.profileImageUrl ? String(user.profileImageUrl) : null,
      customNickname: user.customNickname !== undefined && user.customNickname !== null && String(user.customNickname).trim() ? String(user.customNickname).trim() : null,
      customAvatarUrl: user.customAvatarUrl ? String(user.customAvatarUrl) : null,
      avatarType: user.avatarType ? String(user.avatarType) : "default", // 'default' | 'custom' | 'none'
      aidaLevel: user.aidaLevel ? String(user.aidaLevel) : "없음",
      gender: ["남성", "여성", "비공개"].includes(String(user.gender || "")) ? String(user.gender) : "비공개",
      bio: user.bio !== undefined && user.bio !== null && String(user.bio).trim() ? String(user.bio).trim() : null,
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
    const customNick = session.user.customNickname ? String(session.user.customNickname).trim() : "";
    const nickname = customNick || session.user.nickname || "카카오 사용자";

    const avatarType = session.user.avatarType || "default";
    let avatarUrl = null;
    if (avatarType === "none") {
      avatarUrl = null; // 기본 심볼/아이콘 강제 사용
    } else if (avatarType === "custom" && session.user.customAvatarUrl) {
      avatarUrl = session.user.customAvatarUrl;
    } else {
      avatarUrl = session.user.profileImageUrl || null;
    }

    return {
      nickname,
      avatarUrl,
      avatarType,
      isCustomNickname: Boolean(customNick),
      isCustomAvatar: avatarType === "custom" && Boolean(session.user.customAvatarUrl),
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
    save(session);
    try {
      window.dispatchEvent(new CustomEvent("snorky:profile-updated", { detail: session }));
    } catch (_) {}
    return session;
  }

  function isLoggedIn() {
    const session = get();
    return Boolean(session && session.version === 1 && normalizeUser(session.user));
  }

  function showLoginPrompt(message = "즐겨찾기는 로그인 후 이용할 수 있어요.") {
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
          background: linear-gradient(135deg, #1570ef, #0e54b6);
          color: #ffffff;
          font-weight: 800;
          box-shadow: 0 4px 12px rgba(21, 112, 239, 0.25);
        }
        .snorky-login-prompt-confirm:hover {
          filter: brightness(1.05);
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
          <a id="snorkyLoginPromptConfirm" class="snorky-login-prompt-btn snorky-login-prompt-confirm" href="./login.html">로그인하기</a>
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
    isLoggedIn,
    showLoginPrompt,
    getEffectiveProfile,
    updateProfile,
  });
})(window);
