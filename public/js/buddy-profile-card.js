(function (global) {
  "use strict";

  const DEFAULT_AVATAR = "./public/images/snorky-symbol.png";
  const profileCache = new Map();

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getSupabase() {
    if (typeof global.getSnorkySupabase === "function") return global.getSnorkySupabase();
    return global.snorkySupabase || null;
  }

  function getSessionUser() {
    return global.SNORKYAuthSession?.get?.()?.user || null;
  }

  async function fetchProfiles(userIds) {
    const ids = Array.from(new Set((userIds || []).map(String).filter(Boolean)));
    const missingIds = ids.filter((id) => !profileCache.has(id));
    const sb = getSupabase();
    if (!sb || !missingIds.length) return;

    const { data, error } = await sb
      .from("user_profiles")
      .select("provider_user_id, custom_nickname, custom_avatar_url, avatar_type, aida_level, gender, bio")
      .in("provider_user_id", missingIds);

    if (error) throw error;
    (data || []).forEach((profile) => profileCache.set(String(profile.provider_user_id), profile));
    missingIds.forEach((id) => {
      if (!profileCache.has(id)) profileCache.set(id, null);
    });
  }

  function resolveProfile(userId, fallback = {}) {
    const id = String(userId || "");
    const stored = profileCache.get(id) || null;
    const sessionUser = getSessionUser();
    const isCurrentUser = Boolean(id && sessionUser?.id && id === String(sessionUser.id));

    let avatarUrl = stored?.avatar_type !== "none" ? stored?.custom_avatar_url || "" : "";
    if (!avatarUrl && isCurrentUser && sessionUser?.avatarType !== "none") {
      avatarUrl = sessionUser.customAvatarUrl || sessionUser.profileImageUrl || "";
    }

    return {
      displayName: stored?.custom_nickname ||
        (isCurrentUser ? sessionUser?.customNickname || sessionUser?.nickname : "") ||
        fallback.displayName ||
        (id ? `버디_${id.slice(-4)}` : "다이버"),
      avatarUrl: avatarUrl || fallback.avatarUrl || "",
      gender: stored?.gender || (isCurrentUser ? sessionUser?.gender : "") || fallback.gender || "비공개",
      aidaLevel: stored?.aida_level || (isCurrentUser ? sessionUser?.aidaLevel : "") || fallback.aidaLevel || "없음",
      bio: stored?.bio || (isCurrentUser ? sessionUser?.bio : "") || fallback.bio || ""
    };
  }

  function setTriggerProfile(trigger, userId, profile, resolved) {
    if (!trigger) return;
    const data = profile || {};
    trigger.dataset.buddyProfileUserId = String(userId || "");
    trigger.dataset.buddyProfileName = data.displayName || "다이버";
    trigger.dataset.buddyProfileAvatar = data.avatarUrl || "";
    trigger.dataset.buddyProfileGender = data.gender || "비공개";
    trigger.dataset.buddyProfileAida = data.aidaLevel || "없음";
    trigger.dataset.buddyProfileBio = data.bio || "";
    trigger.dataset.buddyProfileResolved = resolved ? "true" : "false";
    trigger.setAttribute("aria-label", `${data.displayName || "다이버"} 프로필 카드 열기`);
  }

  function renderTrigger({ userId, profile, className = "", resolved = true }) {
    const data = profile || {};
    const displayName = data.displayName || "다이버";
    const avatarUrl = data.avatarUrl || DEFAULT_AVATAR;
    const safeClassName = String(className).replace(/[^a-z0-9 _-]/gi, "");
    return `<button type="button" class="buddy-profile-photo-trigger ${safeClassName}"` +
      ` data-buddy-profile-user-id="${escapeHtml(userId || "")}"` +
      ` data-buddy-profile-name="${escapeHtml(displayName)}"` +
      ` data-buddy-profile-avatar="${escapeHtml(data.avatarUrl || "")}"` +
      ` data-buddy-profile-gender="${escapeHtml(data.gender || "비공개")}"` +
      ` data-buddy-profile-aida="${escapeHtml(data.aidaLevel || "없음")}"` +
      ` data-buddy-profile-bio="${escapeHtml(data.bio || "")}"` +
      ` data-buddy-profile-resolved="${resolved ? "true" : "false"}"` +
      ` aria-label="${escapeHtml(displayName)} 프로필 카드 열기">` +
      `<img class="buddy-profile-photo-image" src="${escapeHtml(avatarUrl)}" alt="" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'">` +
      `</button>`;
  }

  function ensureModal() {
    let modal = document.getElementById("buddyProfileCardModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "buddyProfileCardModal";
    modal.className = "buddy-modal-overlay buddy-profile-modal-overlay";
    modal.style.display = "none";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "buddyProfileCardHeading");
    modal.innerHTML = `
      <div class="buddy-modal-card buddy-profile-card">
        <header class="buddy-modal-head">
          <h3 id="buddyProfileCardHeading" class="buddy-modal-title">프로필 카드</h3>
          <button type="button" class="buddy-modal-close" data-buddy-profile-close aria-label="닫기">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </header>
        <div class="buddy-modal-body buddy-profile-view">
          <img class="buddy-profile-avatar" data-buddy-profile-card-avatar src="${DEFAULT_AVATAR}" alt="프로필 사진">
          <strong class="buddy-profile-nickname" data-buddy-profile-card-name>다이버</strong>
          <div class="buddy-profile-info-grid">
            <div class="buddy-profile-info-item"><span>성별</span><strong data-buddy-profile-card-gender>비공개</strong></div>
            <div class="buddy-profile-info-item"><span>프리다이빙 레벨</span><strong data-buddy-profile-card-aida>레벨 없음</strong></div>
          </div>
          <div class="buddy-profile-bio-wrap">
            <span class="buddy-detail-label">자기소개</span>
            <p class="buddy-profile-bio" data-buddy-profile-card-bio>등록된 자기소개가 없습니다.</p>
          </div>
        </div>
      </div>`;

    modal.querySelector("[data-buddy-profile-close]")?.addEventListener("click", close);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
    document.body.appendChild(modal);
    return modal;
  }

  function open(profile) {
    const data = profile || {};
    const modal = ensureModal();
    const displayName = data.displayName || "다이버";
    const avatar = modal.querySelector("[data-buddy-profile-card-avatar]");
    if (avatar) {
      avatar.src = data.avatarUrl || DEFAULT_AVATAR;
      avatar.alt = `${displayName} 프로필 사진`;
      avatar.onerror = () => {
        avatar.onerror = null;
        avatar.src = DEFAULT_AVATAR;
      };
    }
    const nickname = modal.querySelector("[data-buddy-profile-card-name]");
    const gender = modal.querySelector("[data-buddy-profile-card-gender]");
    const aida = modal.querySelector("[data-buddy-profile-card-aida]");
    const bio = modal.querySelector("[data-buddy-profile-card-bio]");
    if (nickname) nickname.textContent = displayName;
    if (gender) gender.textContent = data.gender || "비공개";
    if (aida) aida.textContent = data.aidaLevel && data.aidaLevel !== "없음" ? data.aidaLevel : "레벨 없음";
    if (bio) bio.textContent = data.bio || "등록된 자기소개가 없습니다.";
    modal.style.display = "flex";
  }

  async function openByUserId(userId, fallback) {
    try {
      await fetchProfiles([userId]);
    } catch (error) {
      console.warn("[BuddyProfileCard] 프로필 조회 실패:", error?.message || error);
    }
    open(resolveProfile(userId, fallback));
  }

  function close() {
    const modal = document.getElementById("buddyProfileCardModal");
    if (modal) modal.style.display = "none";
  }

  async function renderConfirmedParticipants(container, post, hostProfile) {
    if (!container || !post) return [];
    const postId = String(post.id || "");
    container.dataset.buddyParticipantPostId = postId;
    container.innerHTML = "";

    let approvedApplications = [];
    const sb = getSupabase();
    if (sb && post.id) {
      try {
        const { data, error } = await sb
          .from("buddy_applications")
          .select("id, applicant_user_id, applicant_gender, applicant_aida_level, introduction, created_at")
          .eq("buddy_post_id", post.id)
          .eq("status", "APPROVED")
          .order("created_at", { ascending: true });
        if (error) throw error;
        approvedApplications = data || [];
        await fetchProfiles(approvedApplications.map((application) => application.applicant_user_id));
      } catch (error) {
        console.warn("[BuddyProfileCard] 확정 참가자 조회 실패:", error?.message || error);
      }
    }

    if (container.dataset.buddyParticipantPostId !== postId) return [];

    // TEST 모드: 테스트 기간에는 동일 user_id 중복 신청이나 주최자 본인의 승인 application도 모두 별도 참가자 프로필로 표시
    // 운영 전환 시: const TEST_MODE_ALLOW_DUPLICATE_USERS = false; 로 변경하여 1인 1프로필 제한 적용
    const TEST_MODE_ALLOW_DUPLICATE_USERS = true;
    const hostId = String(post.user_id || "");
    const participants = [];
    const seenUserIds = new Set();
    if (!TEST_MODE_ALLOW_DUPLICATE_USERS && hostId) {
      seenUserIds.add(hostId);
    }

    approvedApplications.forEach((application) => {
      const userId = String(application.applicant_user_id || "");
      if (!userId) return;
      if (!TEST_MODE_ALLOW_DUPLICATE_USERS) {
        if (seenUserIds.has(userId)) return;
        seenUserIds.add(userId);
      }
      participants.push({
        applicationId: application.id,
        userId,
        profile: resolveProfile(userId, {
          gender: application.applicant_gender || "비공개",
          aidaLevel: application.applicant_aida_level || "없음",
          bio: application.introduction || ""
        })
      });
    });

    // 승인된 참가자가 없으면 빈 영역 유지
    if (!participants.length) {
      container.innerHTML = "";
      return [];
    }

    // 요구사항 7: 최대 5개까지 표시, 초과 시 +N 배지 표시
    const maxVisible = 5;
    const visibleParticipants = participants.slice(0, maxVisible);
    const hiddenCount = participants.length - maxVisible;

    let html = visibleParticipants.map((participant) => renderTrigger({
      userId: participant.userId,
      profile: participant.profile,
      className: "buddy-confirmed-avatar",
      resolved: true
    })).join("");

    if (hiddenCount > 0) {
      html += `<span class="buddy-confirmed-more" aria-label="추가 ${hiddenCount}명">+${hiddenCount}</span>`;
    }

    container.innerHTML = html;
    return participants;
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-buddy-profile-user-id]");
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    const fallback = {
      displayName: trigger.dataset.buddyProfileName || "다이버",
      avatarUrl: trigger.dataset.buddyProfileAvatar || "",
      gender: trigger.dataset.buddyProfileGender || "비공개",
      aidaLevel: trigger.dataset.buddyProfileAida || "없음",
      bio: trigger.dataset.buddyProfileBio || ""
    };
    if (trigger.dataset.buddyProfileResolved === "true") open(fallback);
    else openByUserId(trigger.dataset.buddyProfileUserId || "", fallback);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  global.SNORKYBuddyProfileCard = Object.freeze({
    open,
    openByUserId,
    close,
    renderTrigger,
    setTriggerProfile,
    renderConfirmedParticipants
  });
})(window);
