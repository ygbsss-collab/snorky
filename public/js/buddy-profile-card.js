(function (global) {
  "use strict";

  const DEFAULT_AVATAR = "./public/images/snorky-symbol.png";
  // TEST 모드 플래그: 본인 프로필에서도 프렌즈 등록/차단/신고 UI 허용 (TEST 종료 시 false로 변경)
  const TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS = true;
  const profileCache = new Map();
  const pendingProfileFetches = new Map();

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

  function invalidateCache(userId) {
    if (userId) {
      profileCache.delete(String(userId));
    } else {
      profileCache.clear();
    }
  }

  function setCachedProfile(userId, profile) {
    if (userId && profile) {
      profileCache.set(String(userId), profile);
    }
  }

  async function fetchProfiles(userIds, force = false) {
    const validIds = Array.from(new Set(
      (userIds || [])
        .map((id) => (id !== null && id !== undefined ? String(id).trim() : ""))
        .filter((id) => id && id !== "null" && id !== "undefined" && id !== "[object Object]")
    ));

    if (force) {
      validIds.forEach((id) => profileCache.delete(id));
    }

    const missingIds = validIds.filter((id) => !profileCache.has(id));
    const sb = getSupabase();
    if (!sb || !missingIds.length) return;

    try {
      const { data, error } = await sb
        .from("user_profiles")
        .select("provider_user_id, custom_nickname, custom_avatar_url, avatar_type, aida_level, gender, bio, age_group, activity_region, activity_depth")
        .in("provider_user_id", missingIds);

      if (error) {
        console.warn("[BuddyProfileCard] 프로필 조회 쿼리 오류:", error?.message || error);
        return;
      }
      (data || []).forEach((profile) => {
        if (profile && profile.provider_user_id) {
          profileCache.set(String(profile.provider_user_id), profile);
        }
      });
      missingIds.forEach((id) => {
        if (!profileCache.has(id)) profileCache.set(id, null);
      });
    } catch (err) {
      console.warn("[BuddyProfileCard] 프로필 조회 예외:", err?.message || err);
    }
  }

  function isApprovedStatus(status) {
    if (global.SNORKYCertification?.isApprovedStatus) {
      return global.SNORKYCertification.isApprovedStatus(status);
    }
    if (!status) return false;
    const s = String(status).trim().toLowerCase();
    return ["approved", "verified", "complete", "인증완료"].includes(s);
  }

  function checkIsVerified(target) {
    if (global.SNORKYCertification?.checkIsVerified) {
      return global.SNORKYCertification.checkIsVerified(target);
    }
    if (!target) return false;
    if (Array.isArray(target.certifications)) {
      return target.certifications.some((c) => isApprovedStatus(c?.status));
    }
    const status = target.certificationStatus || target.qualificationStatus || target.verificationStatus || target.certification_status || target.qualification_status;
    if (isApprovedStatus(status)) return true;
    if (target.certificationVerified === true || target.aidaVerified === true || target.isVerified === true || target.isCertified === true) {
      return true;
    }
    return false;
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

    const fallbackAida = cleanProfileAidaLevel(fallback.aidaLevel || fallback.aida_level);
    const sessionAida = isCurrentUser ? cleanProfileAidaLevel(sessionUser?.aidaLevel || sessionUser?.aida_level) : "";
    const storedAida = cleanProfileAidaLevel(stored?.aida_level);
    const cleanAida = storedAida || sessionAida || fallbackAida || "";
    const isVerified = checkIsVerified(stored) || (isCurrentUser && checkIsVerified(sessionUser)) || checkIsVerified(fallback);

    return {
      displayName: stored?.custom_nickname ||
        (isCurrentUser ? sessionUser?.customNickname || sessionUser?.nickname : "") ||
        fallback.displayName ||
        (id ? `버디_${id.slice(-4)}` : "다이버"),
      avatarUrl: avatarUrl || fallback.avatarUrl || "",
      gender: stored?.gender || (isCurrentUser ? sessionUser?.gender : "") || fallback.gender || "비공개",
      ageGroup: stored?.age_group || (isCurrentUser ? sessionUser?.ageGroup : "") || fallback.ageGroup || "",
      activityRegion: stored?.activity_region || (isCurrentUser ? sessionUser?.activityRegion : "") || fallback.activityRegion || "",
      activityDepth: stored?.activity_depth || (isCurrentUser ? sessionUser?.activityDepth : "") || fallback.activityDepth || "",
      aidaLevel: cleanAida,
      isVerified: Boolean(isVerified && cleanAida),
      bio: stored?.bio || (isCurrentUser ? sessionUser?.bio : "") || fallback.bio || ""
    };
  }

  function setTriggerProfile(trigger, userId, profile, resolved) {
    if (!trigger) return;
    const data = profile || {};
    const isVerified = Boolean(data.isVerified || checkIsVerified(data));
    const cleanAida = cleanProfileAidaLevel(data.aidaLevel || data.aida_level);

    trigger.dataset.buddyProfileUserId = String(userId || "");
    trigger.dataset.buddyProfileName = data.displayName || "다이버";
    trigger.dataset.buddyProfileAvatar = data.avatarUrl || "";
    trigger.dataset.buddyProfileGender = data.gender || "비공개";
    trigger.dataset.buddyProfileAgeGroup = data.ageGroup || "";
    trigger.dataset.buddyProfileActivityRegion = data.activityRegion || "";
    trigger.dataset.buddyProfileActivityDepth = data.activityDepth || "";
    trigger.dataset.buddyProfileAida = cleanAida;
    trigger.dataset.buddyProfileVerified = isVerified ? "true" : "false";
    trigger.dataset.buddyProfileBio = data.bio || "";
    trigger.dataset.buddyProfileResolved = resolved ? "true" : "false";
    trigger.setAttribute("aria-label", `${data.displayName || "다이버"} 프로필 카드 열기`);
  }

  function renderTrigger({ userId, profile, className = "", resolved = true }) {
    const data = profile || {};
    const displayName = data.displayName || "다이버";
    const avatarUrl = data.avatarUrl || DEFAULT_AVATAR;
    const isVerified = Boolean(data.isVerified || checkIsVerified(data));
    const cleanAida = cleanProfileAidaLevel(data.aidaLevel || data.aida_level);
    const safeClassName = String(className).replace(/[^a-z0-9 _-]/gi, "");

    return `<button type="button" class="buddy-profile-photo-trigger ${safeClassName}"` +
      ` data-buddy-profile-user-id="${escapeHtml(userId || "")}"` +
      ` data-buddy-profile-name="${escapeHtml(displayName)}"` +
      ` data-buddy-profile-avatar="${escapeHtml(data.avatarUrl || "")}"` +
      ` data-buddy-profile-gender="${escapeHtml(data.gender || "비공개")}"` +
      ` data-buddy-profile-age-group="${escapeHtml(data.ageGroup || "")}"` +
      ` data-buddy-profile-activity-region="${escapeHtml(data.activityRegion || "")}"` +
      ` data-buddy-profile-activity-depth="${escapeHtml(data.activityDepth || "")}"` +
      ` data-buddy-profile-aida="${escapeHtml(cleanAida)}"` +
      ` data-buddy-profile-verified="${isVerified ? "true" : "false"}"` +
      ` data-buddy-profile-bio="${escapeHtml(data.bio || "")}"` +
      ` data-buddy-profile-resolved="${resolved ? "true" : "false"}"` +
      ` aria-label="${escapeHtml(displayName)} 프로필 카드 열기">` +
      `<img class="buddy-profile-photo-image" src="${escapeHtml(avatarUrl)}" alt="" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'">` +
      `</button>`;
  }

  function extractStringVal(val) {
    if (!val) return "";
    if (typeof val === "string") return val.trim();
    if (typeof val === "number") return String(val);
    if (typeof val === "object") {
      const str = val.displayName || val.level || val.name || "";
      return typeof str === "string" ? str.trim() : "";
    }
    return "";
  }

  function cleanProfileAidaLevel(val) {
    const raw = extractStringVal(val);
    if (!raw) return "";
    const clean = raw.replace(/\s*✓$/, "").trim();
    if (!clean) return "";
    const lower = clean.toLowerCase();
    if (lower.includes("[object")) return "";
    if (["", "미설정", "없음", "-", "null", "undefined", "레벨 없음", "무관", "전체", "무관 (전체)"].includes(lower)) {
      return "";
    }
    if (clean.includes("이상")) {
      return "";
    }
    return clean;
  }

  function isValidVal(val) {
    if (!val) return false;
    const s = String(val).trim().toLowerCase();
    if (s.includes("[object")) return false;
    return !["", "미설정", "없음", "-", "null", "undefined", "레벨 없음", "무관"].includes(s);
  }

  function formatProfileMetaText(profile, options = {}) {
    const { includeNickname = false } = options;
    if (!profile) return "";
    const items = [];

    // 1. 닉네임 (옵션)
    if (includeNickname) {
      const rawName = extractStringVal(profile.displayName || profile.nickname || profile.custom_nickname) || "다이버";
      items.push(rawName);
    }

    // 2. 성별 (필수)
    const rawGender = extractStringVal(profile.gender || profile.host_gender);
    const gender = isValidVal(rawGender) ? rawGender : "비공개";
    items.push(gender);

    // 3. 나이대 (선택)
    const rawAge = extractStringVal(profile.ageGroup || profile.age_group);
    if (isValidVal(rawAge)) {
      items.push(rawAge);
    }

    // 4. 활동 레벨 / 인증 자격 (자격값 항상 표시, APPROVED일 때만 ✓ 추가, 미입력 시 숨김)
    const cleanAida = cleanProfileAidaLevel(profile.aidaLevel || profile.aida_level);
    const isVerified = Boolean(
      profile.isVerified ||
      profile.isVerified === "true" ||
      (global.SNORKYCertification ? global.SNORKYCertification.checkIsVerified(profile) : checkIsVerified(profile))
    );

    if (isValidVal(cleanAida)) {
      const aidaText = isVerified ? `${cleanAida} ✓` : cleanAida;
      items.push(aidaText);
    }

    return items.join(" · ");
  }

  function renderHostProfileRow(container, post, author) {
    if (!container) return null;
    const userId = post?.user_id || author?.userId || "";
    const baseProfile = resolveProfile(userId, author || {});
    const authorAida = cleanProfileAidaLevel(author?.aidaLevel || author?.aida_level);
    const profile = {
      ...baseProfile,
      ...(author || {}),
      aidaLevel: authorAida || baseProfile.aidaLevel,
      isVerified: Boolean(author?.isVerified || checkIsVerified(author) || baseProfile.isVerified)
    };

    const avatarTrigger = renderTrigger({
      userId: userId,
      profile: profile,
      className: "buddy-detail-host-avatar",
      resolved: true
    });

    const metaText = formatProfileMetaText(profile, { includeNickname: true });

    container.innerHTML = `
      ${avatarTrigger}
      <span class="buddy-detail-host-meta" data-buddy-profile-user-id="${escapeHtml(String(userId || ''))}" data-buddy-profile-name="${escapeHtml(profile.displayName || '')}" data-buddy-profile-avatar="${escapeHtml(profile.avatarUrl || '')}" data-buddy-profile-gender="${escapeHtml(profile.gender || '')}" data-buddy-profile-age-group="${escapeHtml(profile.ageGroup || '')}" data-buddy-profile-activity-region="${escapeHtml(profile.activityRegion || '')}" data-buddy-profile-activity-depth="${escapeHtml(profile.activityDepth || '')}" data-buddy-profile-aida="${escapeHtml(profile.aidaLevel || '')}" data-buddy-profile-verified="${profile.isVerified ? 'true' : 'false'}" data-buddy-profile-bio="${escapeHtml(profile.bio || '')}" role="button" tabindex="0" style="cursor:pointer;">${escapeHtml(metaText)}</span>
    `;
    return profile;
  }

  function removeModalDom(modal) {
    if (!modal) return;
    if (typeof modal.remove === "function") {
      modal.remove();
    } else if (modal.parentNode && typeof modal.parentNode.removeChild === "function") {
      modal.parentNode.removeChild(modal);
    }
  }

  function close() {
    const modal = document.getElementById("buddyProfileCardModal");
    if (modal) {
      removeModalDom(modal);
    }
  }

  function createModal() {
    const oldModal = document.getElementById("buddyProfileCardModal");
    if (oldModal) {
      removeModalDom(oldModal);
    }

    const modal = document.createElement("div");
    modal.id = "buddyProfileCardModal";
    modal.className = "buddy-profile-modal-overlay";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "buddyProfileCardHeading");
    modal.innerHTML = `
      <div class="buddy-profile-modal-card">
        <header class="buddy-profile-modal-head">
          <h3 id="buddyProfileCardHeading" class="buddy-profile-modal-title">프로필</h3>
          <button type="button" class="buddy-profile-modal-close" data-buddy-profile-close aria-label="닫기">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </header>
        <div class="buddy-profile-modal-body">
          <!-- 1. 상단: 프로필 요약 (프로필 사진, 닉네임, 성별 · 나이대, 인증 자격 + ✓) -->
          <div class="buddy-profile-summary-row">
             <img class="buddy-profile-summary-avatar" data-buddy-profile-card-avatar src="${DEFAULT_AVATAR}" alt="프로필 사진">
             <div class="buddy-profile-summary-info">
               <strong class="buddy-profile-summary-name" data-buddy-profile-card-name>다이버</strong>
               <div class="buddy-profile-summary-sub">
                 <span class="buddy-profile-summary-meta" data-buddy-profile-card-submeta></span>
                 <span class="buddy-profile-summary-cert" data-buddy-profile-card-cert></span>
               </div>
             </div>
          </div>

          <!-- 2. 활동정보 (활동지역, 활동 수심) - 활동레벨은 자격과 중복되므로 제외 -->
          <div class="buddy-profile-section" data-buddy-profile-activity-section style="display:none;width:100%;">
            <div class="buddy-profile-activity-grid" data-buddy-profile-activity-grid>
              <!-- 동적 생성 (활동지역, 활동수심) -->
            </div>
          </div>

          <!-- 3. 소개 (한줄소개) -->
          <div class="buddy-profile-section" data-buddy-profile-bio-section style="display:none;width:100%;">
            <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:6px;letter-spacing:-0.2px;">소개</div>
            <p class="buddy-profile-bio-box" data-buddy-profile-card-bio></p>
          </div>

          <!-- 4. 하단 버튼 (SNORKY 프렌즈 등록) -->
          <div class="buddy-profile-btn-sec" data-buddy-profile-btn-sec style="margin-top:2px;width:100%;">
            <button type="button" class="buddy-profile-friends-btn" data-buddy-profile-friends-btn>
              SNORKY 프렌즈 등록
            </button>
          </div>

          <!-- 5. 차단하기 / 신고하기 링크 -->
          <div class="buddy-profile-sub-actions" data-buddy-profile-sub-actions style="display:flex;justify-content:center;align-items:center;gap:12px;margin-top:10px;font-size:12.5px;color:#94a3b8;">
            <button type="button" class="buddy-profile-action-link" data-buddy-profile-block-btn style="background:none;border:0;padding:4px;color:#94a3b8;cursor:pointer;font-size:12.5px;font-family:inherit;">차단하기</button>
            <span style="color:#cbd5e1;user-select:none;">·</span>
            <button type="button" class="buddy-profile-action-link" data-buddy-profile-report-btn style="background:none;border:0;padding:4px;color:#94a3b8;cursor:pointer;font-size:12.5px;font-family:inherit;">신고하기</button>
          </div>
        </div>
      </div>`;

    // 닫기 버튼 1회 바인딩
    modal.querySelector("[data-buddy-profile-close]")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });

    // 바깥 배경 클릭 닫기
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });

    document.body.appendChild(modal);
    return modal;
  }

  function showReportModal(targetUser, postId = "") {
    const existing = document.getElementById("buddyReportModal");
    if (existing) removeModalDom(existing);

    const reportModal = document.createElement("div");
    reportModal.id = "buddyReportModal";
    reportModal.className = "buddy-profile-modal-overlay";
    reportModal.style.zIndex = "1500";
    reportModal.innerHTML = `
      <div class="buddy-profile-modal-card" style="max-width:380px;">
        <header class="buddy-profile-modal-head">
          <h3 class="buddy-profile-modal-title">사용자 신고</h3>
          <button type="button" class="buddy-profile-modal-close" data-report-close aria-label="닫기">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </header>
        <form class="buddy-report-form" style="padding:16px 18px;display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="font-size:13px;font-weight:700;color:#334155;display:block;margin-bottom:6px;">신고 사유 <span style="color:#ef4444;">*</span></label>
            <select name="report_reason" required style="width:100%;height:42px;border:1px solid #cbd5e1;border-radius:10px;padding:0 12px;font-size:14px;font-family:inherit;background:#fff;outline:none;">
              <option value="">신고 사유를 선택해 주세요</option>
              <option value="부적절한 내용">부적절한 내용</option>
              <option value="허위 정보">허위 정보</option>
              <option value="스팸/광고">스팸/광고</option>
              <option value="괴롭힘">괴롭힘</option>
              <option value="위험한 다이빙 모집">위험한 다이빙 모집</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div>
            <label style="font-size:13px;font-weight:700;color:#334155;display:block;margin-bottom:6px;">상세 내용 <span style="font-size:11.5px;color:#94a3b8;font-weight:400;">(선택)</span></label>
            <textarea name="report_details" rows="3" placeholder="신고 내용을 자세히 적어주시면 빠른 처리에 도움이 됩니다." style="width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:13.5px;font-family:inherit;box-sizing:border-box;resize:none;outline:none;line-height:1.5;"></textarea>
          </div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <button type="button" data-report-cancel style="flex:1;height:42px;border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">취소</button>
            <button type="submit" data-report-submit style="flex:1;height:42px;border:0;background:#ef4444;color:#fff;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">신고 접수</button>
          </div>
        </form>
      </div>
    `;

    const closeReport = () => removeModalDom(reportModal);
    reportModal.querySelector("[data-report-close]")?.addEventListener("click", closeReport);
    reportModal.querySelector("[data-report-cancel]")?.addEventListener("click", closeReport);
    reportModal.addEventListener("click", (e) => { if (e.target === reportModal) closeReport(); });

    const form = reportModal.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const reason = form.report_reason.value;
      const details = form.report_details.value;
      const submitBtn = reportModal.querySelector("[data-report-submit]");
      if (!reason) {
        alert("신고 사유를 선택해 주세요.");
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "접수 중...";

      const sessionUser = getSessionUser();
      try {
        if (!global.SNORKYFriends?.reportUser) throw new Error("신고 모듈을 불러오지 못했습니다.");
        await global.SNORKYFriends.reportUser({
          reporterId: sessionUser?.id || "",
          reporterNickname: sessionUser?.customNickname || sessionUser?.nickname || "",
          targetId: targetUser.userId,
          targetNickname: targetUser.displayName || "",
          reason,
          details,
          postId: postId || ""
        });
        alert("신고가 접수되었습니다.");
        closeReport();
      } catch (err) {
        alert(err?.message || "신고 접수 중 오류가 발생했습니다.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "신고 접수";
      }
    });

    document.body.appendChild(reportModal);
  }

  function open(profile, options = {}) {
    const data = profile || {};
    const modal = createModal();
    const displayName = data.displayName || "다이버";
    const targetUserId = String(data.userId || options.userId || "");
    const postId = options.postId || "";
    const sessionUser = getSessionUser();
    const myUserId = sessionUser?.id ? String(sessionUser.id) : "";
    const isSelf = Boolean(targetUserId && myUserId && targetUserId === myUserId);
    const allowActions = !isSelf || TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS;

    // 1. 상단: 프로필 사진
    const avatar = modal.querySelector("[data-buddy-profile-card-avatar]");
    if (avatar) {
      avatar.src = data.avatarUrl || DEFAULT_AVATAR;
      avatar.alt = `${displayName} 프로필 사진`;
      avatar.onerror = () => {
        avatar.onerror = null;
        avatar.src = DEFAULT_AVATAR;
      };
    }

    // 1. 상단: 닉네임 (필수)
    const nickname = modal.querySelector("[data-buddy-profile-card-name]");
    if (nickname) nickname.textContent = displayName;

    // 1. 상단: 성별 · 나이대
    const gender = (data.gender && data.gender !== "미설정" && data.gender !== "없음") ? data.gender : "비공개";
    const validAges = ["20대", "30대", "40대", "50대", "60대", "70대"];
    const rawAge = data.ageGroup || data.age_group || "";
    const ageGroup = (rawAge && validAges.includes(String(rawAge).trim())) ? String(rawAge).trim() : "";
    const submetaEl = modal.querySelector("[data-buddy-profile-card-submeta]");
    if (submetaEl) {
      submetaEl.textContent = ageGroup ? `${gender} · ${ageGroup}` : gender;
    }

    // 1. 상단: 프로필 자격 (user_profiles의 현재 프로필 자격값 항상 표시, APPROVED일 때만 ✓ 추가, 미입력 시 숨김)
    const isVerified = Boolean(data.isVerified || data.isVerified === "true" || checkIsVerified(data));
    const rawAida = cleanProfileAidaLevel(data.aidaLevel || data.aida_level);
    const certEl = modal.querySelector("[data-buddy-profile-card-cert]");
    if (certEl) {
      if (rawAida) {
        certEl.textContent = isVerified ? `${rawAida} ✓` : rawAida;
        certEl.style.display = "inline-flex";
        if (isVerified) {
          certEl.style.background = "#ecfdf5";
          certEl.style.color = "#059669";
          certEl.style.borderColor = "#a7f3d0";
        } else {
          certEl.style.background = "#f1f5f9";
          certEl.style.color = "#475569";
          certEl.style.borderColor = "#cbd5e1";
        }
      } else {
        certEl.textContent = "";
        certEl.style.display = "none";
      }
    }

    // 2. 활동 정보 (활동지역, 활동 수심) - 활동레벨은 자격과 중복되므로 제외 / 미입력 항목 숨김
    const excludedValues = ["", "미설정", "없음", "-", "null", "undefined"];
    const rawRegion = data.activityRegion || data.activity_region || "";
    const actRegion = (rawRegion && !excludedValues.includes(String(rawRegion).trim().toLowerCase())) ? String(rawRegion).trim() : "";
    const rawDepth = data.activityDepth || data.activity_depth || "";
    const actDepth = (rawDepth && !excludedValues.includes(String(rawDepth).trim().toLowerCase())) ? String(rawDepth).trim() : "";

    const activitySec = modal.querySelector("[data-buddy-profile-activity-section]");
    const activityGrid = modal.querySelector("[data-buddy-profile-activity-grid]");
    if (activitySec && activityGrid) {
      activityGrid.innerHTML = "";
      let count = 0;
      if (actRegion) {
        activityGrid.insertAdjacentHTML("beforeend", `
          <div class="buddy-profile-activity-item">
            <span class="buddy-profile-activity-label">활동지역</span>
            <strong class="buddy-profile-activity-val">${escapeHtml(actRegion)}</strong>
          </div>
        `);
        count++;
      }
      if (actDepth) {
        activityGrid.insertAdjacentHTML("beforeend", `
          <div class="buddy-profile-activity-item">
            <span class="buddy-profile-activity-label">활동 수심</span>
            <strong class="buddy-profile-activity-val">${escapeHtml(actDepth)}</strong>
          </div>
        `);
        count++;
      }
      if (count > 0) {
        activityGrid.style.gridTemplateColumns = count === 1 ? "1fr" : "1fr 1fr";
        activitySec.style.display = "block";
      } else {
        activitySec.style.display = "none";
      }
    }

    // 3. 소개 (한줄소개) - 미입력/미설정/없음/- 항목 자체 숨김
    const rawBio = data.bio || "";
    const bioText = (rawBio && !excludedValues.includes(String(rawBio).trim().toLowerCase())) ? String(rawBio).trim() : "";
    const bioSec = modal.querySelector("[data-buddy-profile-bio-section]");
    const bioEl = modal.querySelector("[data-buddy-profile-card-bio]");
    if (bioSec && bioEl) {
      if (bioText) {
        bioEl.textContent = bioText;
        bioSec.style.display = "block";
      } else {
        bioEl.textContent = "";
        bioSec.style.display = "none";
      }
    }

    // 4. 하단 버튼 및 서브 액션 (본인 여부에 따른 제어)
    const btnSec = modal.querySelector("[data-buddy-profile-btn-sec]");
    const subActions = modal.querySelector("[data-buddy-profile-sub-actions]");
    const friendsBtn = modal.querySelector("[data-buddy-profile-friends-btn]");
    const blockBtn = modal.querySelector("[data-buddy-profile-block-btn]");
    const reportBtn = modal.querySelector("[data-buddy-profile-report-btn]");

    if (!allowActions || !targetUserId) {
      // 본인 프로필 (운영 모드): 프렌즈 등록, 차단/신고 숨김
      if (btnSec) btnSec.style.display = "none";
      if (subActions) subActions.style.display = "none";
    } else {
      if (btnSec) btnSec.style.display = "block";
      if (subActions) subActions.style.display = "flex";

      // 비동기 프렌즈 / 차단 상태 확인
      if (global.SNORKYFriends && myUserId && targetUserId) {
        friendsBtn.disabled = true;
        friendsBtn.textContent = "확인 중...";

        Promise.all([
          global.SNORKYFriends.checkBlockStatus(myUserId, targetUserId),
          global.SNORKYFriends.checkFriendStatus(myUserId, targetUserId)
        ]).then(([blockStatus, friendStatus]) => {
          if (blockStatus.isBlocked) {
            friendsBtn.disabled = true;
            friendsBtn.textContent = blockStatus.blockedByMe ? "차단한 사용자" : "등록 불가 사용자";
            friendsBtn.style.background = "#f1f5f9";
            friendsBtn.style.color = "#94a3b8";
            friendsBtn.style.borderColor = "#e2e8f0";
            return;
          }

          if (friendStatus.isFriend) {
            friendsBtn.disabled = true;
            friendsBtn.textContent = "SNORKY 프렌즈";
            friendsBtn.style.background = "#f0fdf4";
            friendsBtn.style.color = "#16a34a";
            friendsBtn.style.borderColor = "#bbf7d0";
          } else {
            friendsBtn.disabled = false;
            friendsBtn.textContent = "SNORKY 프렌즈 등록";
            friendsBtn.style.background = "";
            friendsBtn.style.color = "";
            friendsBtn.style.borderColor = "";

            friendsBtn.onclick = async (e) => {
              e.preventDefault();
              e.stopPropagation();
              friendsBtn.disabled = true;
              friendsBtn.textContent = "등록 중...";
              try {
                await global.SNORKYFriends.addFriend(myUserId, targetUserId);
                friendsBtn.textContent = "SNORKY 프렌즈";
                friendsBtn.style.background = "#f0fdf4";
                friendsBtn.style.color = "#16a34a";
                friendsBtn.style.borderColor = "#bbf7d0";
                if (typeof global.showToast === "function") {
                  global.showToast("SNORKY 프렌즈로 등록되었습니다.");
                } else {
                  alert("SNORKY 프렌즈로 등록되었습니다.");
                }
              } catch (err) {
                friendsBtn.disabled = false;
                friendsBtn.textContent = "SNORKY 프렌즈 등록";
                alert(err?.message || "프렌즈 등록에 실패했습니다.");
              }
            };
          }
        }).catch((err) => {
          console.warn("[BuddyProfileCard] 상태 확인 오류:", err);
          friendsBtn.disabled = false;
          friendsBtn.textContent = "SNORKY 프렌즈 등록";
        });
      }

      // 차단하기 버튼
      if (blockBtn) {
        blockBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!confirm(`이 사용자를 차단하시겠습니까?\n차단 시 서로의 공고가 숨겨지며 프렌즈 관계도 삭제됩니다.`)) {
            return;
          }
          try {
            if (!global.SNORKYFriends?.blockUser) throw new Error("차단 모듈을 불러오지 못했습니다.");
            await global.SNORKYFriends.blockUser(myUserId, targetUserId);
            if (typeof global.showToast === "function") {
              global.showToast("사용자를 차단했습니다.");
            } else {
              alert("사용자를 차단했습니다.");
            }
            close();
          } catch (err) {
            alert(err?.message || "차단 처리 중 오류가 발생했습니다.");
          }
        };
      }

      // 신고하기 버튼
      if (reportBtn) {
        reportBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          showReportModal({ userId: targetUserId, displayName }, postId);
        };
      }
    }

    modal.style.display = "flex";
  }

  async function openByUserId(userId, fallback, forceRefresh = false, options = {}) {
    const rawId = userId !== null && userId !== undefined ? String(userId).trim() : "";
    const id = (rawId && rawId !== "null" && rawId !== "undefined" && rawId !== "[object Object]") ? rawId : "";
    if (id) {
      if (forceRefresh || !profileCache.has(id)) {
        if (!pendingProfileFetches.has(id)) {
          const fetchPromise = fetchProfiles([id], forceRefresh).finally(() => {
            pendingProfileFetches.delete(id);
          });
          pendingProfileFetches.set(id, fetchPromise);
        }
        try {
          await pendingProfileFetches.get(id);
        } catch (error) {
          console.warn("[BuddyProfileCard] 프로필 조회 실패:", error?.message || error);
        }
      }
    }
    const resolved = resolveProfile(id, fallback);
    resolved.userId = id;
    open(resolved, { userId: id, ...options });
  }


  async function renderConfirmedParticipants(container, post, hostProfile) {
    if (!container || !post) return [];
    const numPostId = Number(post.id);
    if (!numPostId || isNaN(numPostId)) return [];
    const postId = String(numPostId);
    container.dataset.buddyParticipantPostId = postId;
    container.innerHTML = "";

    let approvedApplications = [];
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb
          .from("buddy_applications")
          .select("id, applicant_user_id, applicant_gender, applicant_aida_level, introduction, created_at")
          .eq("buddy_post_id", numPostId)
          .eq("status", "APPROVED")
          .order("created_at", { ascending: true });
        if (error) throw error;
        approvedApplications = data || [];
        const applicantIds = approvedApplications
          .map((application) => (application.applicant_user_id ? String(application.applicant_user_id).trim() : ""))
          .filter((id) => id && id !== "null" && id !== "undefined" && id !== "[object Object]");
        if (applicantIds.length > 0) {
          await fetchProfiles(applicantIds);
        }
      } catch (error) {
        console.warn("[BuddyProfileCard] 확정 참가자 조회 실패:", error?.message || error);
      }
    }

    if (container.dataset.buddyParticipantPostId !== postId) return [];

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

    if (!participants.length) {
      container.innerHTML = "";
      return [];
    }

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
    const rawUserId = trigger.dataset.buddyProfileUserId;
    const userId = (rawUserId && rawUserId !== "null" && rawUserId !== "undefined" && rawUserId !== "[object Object]") ? String(rawUserId).trim() : "";
    const isVerified = trigger.dataset.buddyProfileVerified === "true";
    const fallback = {
      displayName: trigger.dataset.buddyProfileName || "다이버",
      avatarUrl: trigger.dataset.buddyProfileAvatar || "",
      gender: trigger.dataset.buddyProfileGender || "비공개",
      ageGroup: trigger.dataset.buddyProfileAgeGroup || "",
      activityRegion: trigger.dataset.buddyProfileActivityRegion || "",
      activityDepth: trigger.dataset.buddyProfileActivityDepth || "",
      aidaLevel: trigger.dataset.buddyProfileAida || "",
      isVerified: isVerified,
      bio: trigger.dataset.buddyProfileBio || ""
    };
    const postId = trigger.dataset.buddyPostId || trigger.closest("[data-post-id]")?.dataset.postId || "";
    if (userId) {
      openByUserId(userId, fallback, false, { postId });
    } else {
      open(fallback, { postId });
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  // 프로필 변경 시 캐시 무효화 이벤트 연동
  if (typeof global.addEventListener === "function") {
    global.addEventListener("snorky:profile-updated", (event) => {
      const userId = event.detail?.userId || event.detail?.session?.user?.id;
      if (userId) {
        invalidateCache(userId);
      } else {
        invalidateCache();
      }
    });
  }

  global.SNORKYBuddyProfileCard = Object.freeze({
    open,
    openByUserId,
    close,
    invalidateCache,
    setCachedProfile,
    clearCache: () => invalidateCache(),
    renderTrigger,
    setTriggerProfile,
    renderConfirmedParticipants,
    formatProfileMetaText,
    renderHostProfileRow,
    resolveProfile
  });
})(typeof window !== "undefined" ? window : globalThis);
