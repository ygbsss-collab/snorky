(function (global) {
  "use strict";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getBadgeClass(activityType) {
    if (activityType === "실내다이빙") return "buddy-badge-indoor";
    if (activityType === "프리다이빙") return "buddy-badge-freediving";
    return "buddy-badge-snorkeling";
  }

  function getThumbUrl(post) {
    if (post?.activity_type === "실내다이빙") {
      return "./public/images/snorky-home-hero-v3.jpg";
    }
    return "./public/images/snorky-hero-freediving.jpg";
  }

  function renderAttributes(attributes) {
    return Object.entries(attributes || {})
      .filter(([name]) => /^(data-[a-z0-9-]+|role|tabindex)$/i.test(name))
      .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
      .join(" ");
  }

  function parseEventDateTime(eventDate, entryTime) {
    if (!eventDate) return null;
    const dateParts = String(eventDate).split("-").map(Number);
    if (dateParts.length !== 3 || dateParts.some(isNaN)) return null;

    let hours = 23, minutes = 59, seconds = 59;
    if (entryTime && typeof entryTime === "string") {
      const match = entryTime.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        hours = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
        seconds = 0;
      }
    }
    return new Date(dateParts[0], dateParts[1] - 1, dateParts[2], hours, minutes, seconds);
  }

  function isPostExpired(post) {
    const eventDt = parseEventDateTime(post?.event_date, post?.entry_time);
    if (!eventDt) return false;
    return Date.now() > eventDt.getTime();
  }

  function isPostWithinRetention(post, maxDays = 30) {
    const eventDt = parseEventDateTime(post?.event_date, post?.entry_time);
    if (!eventDt) return true;
    const now = Date.now();
    const eventTime = eventDt.getTime();
    if (now <= eventTime) return true;
    const retentionMs = maxDays * 24 * 60 * 60 * 1000;
    return (now - eventTime) <= retentionMs;
  }

  function getPostStatusInfo(post) {
    const currentCount = Math.max(1, Number(post?.current_count) || 1);
    const capacity = Math.max(1, Number(post?.capacity) || 2);
    if (isPostExpired(post)) {
      return {
        text: "신청 불가",
        className: "buddy-post-status-expired",
        code: "EXPIRED",
        isExpired: true,
        canApply: false
      };
    }
    if (post?.status === "CLOSED" || currentCount >= capacity) {
      return {
        text: "모집마감",
        className: "buddy-post-status-closed",
        code: "CLOSED",
        isExpired: false,
        canApply: false
      };
    }
    return {
      text: "모집중",
      className: "",
      code: "RECRUITING",
      isExpired: false,
      canApply: true
    };
  }

  function getPostDisplayState(post) {
    const currentCount = Math.max(1, Number(post?.current_count) || 1);
    const capacity = Math.max(1, Number(post?.capacity) || 2);
    return { currentCount, capacity, statusInfo: getPostStatusInfo(post) };
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

  function render({ post, author, formattedDate, attributes, statusText, statusClass, pendingCount = 0, showDelete = false, deleteAppId = null }) {
    const displayState = getPostDisplayState(post);
    const statusInfo = displayState.statusInfo;
    const finalStatusText = statusText !== undefined ? statusText : statusInfo.text;
    const finalStatusClass = statusClass !== undefined ? statusClass : statusInfo.className;
    const displayName = author?.displayName || "다이버";
    const isVerified = Boolean(author?.isVerified || checkIsVerified(author));
    const authorAidaLevel = author?.aidaLevel || author?.aida_level || "";
    let rawAida = authorAidaLevel && authorAidaLevel !== "없음" && authorAidaLevel !== "미설정" ? String(authorAidaLevel).replace(/\s*✓$/, "").trim() : "";
    if (rawAida.includes("이상") || rawAida === "전체" || rawAida === "무관" || rawAida === "무관 (전체)") {
      rawAida = "";
    }
    const gender = author?.gender || "비공개";
    const hostProfile = {
      displayName,
      avatarUrl: author?.avatarUrl || "",
      gender,
      ageGroup: author?.ageGroup || "",
      activityRegion: author?.activityRegion || "",
      activityDepth: author?.activityDepth || "",
      aidaLevel: rawAida,
      isVerified,
      bio: author?.bio || ""
    };

    const attributeMarkup = renderAttributes(attributes);
    const avatarTrigger = global.SNORKYBuddyProfileCard.renderTrigger({
      userId: post?.user_id,
      profile: hostProfile,
      className: "buddy-host-avatar",
      resolved: true
    });

    const displayRegion = global.SNORKYBuddyRegions?.formatPostRegion
      ? global.SNORKYBuddyRegions.formatPostRegion(post)
      : (post?.region || "");

    const hostMetaText = global.SNORKYBuddyProfileCard?.formatProfileMetaText
      ? global.SNORKYBuddyProfileCard.formatProfileMetaText(hostProfile, { includeNickname: true })
      : `${displayName} · ${gender}${rawAida ? ` · ${isVerified ? `${rawAida} ✓` : rawAida}` : ""}`;
    const normalizedPendingCount = Math.max(0, Number(pendingCount) || 0);
    const pendingBadge = normalizedPendingCount > 0
      ? `<span class="buddy-post-pending-badge">신청대기 ${normalizedPendingCount}</span>`
      : "";

    const deleteAttr = deleteAppId ? `data-app-id="${escapeHtml(deleteAppId)}"` : `data-post-id="${escapeHtml(post?.id)}"`;
    const deleteBtn = showDelete
      ? `<button type="button" class="buddy-card-trash-btn" data-action="delete" ${deleteAttr} aria-label="삭제"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>`
      : "";

    return `
      <article class="buddy-post-card" ${attributeMarkup}>
        <img class="buddy-post-thumb" src="${getThumbUrl(post)}" alt="${escapeHtml(post?.activity_type)}">
        <div class="buddy-post-info">
          <div class="buddy-post-top-row">
            <div class="buddy-post-tag-group">
              <span class="buddy-badge-activity ${getBadgeClass(post?.activity_type)}">${escapeHtml(post?.activity_type)}</span>
              <span class="buddy-post-location">${escapeHtml(displayRegion)}</span>
            </div>
            <div class="buddy-post-status-wrap" style="display:flex;align-items:center;gap:6px;">
              <span class="buddy-post-status-text ${finalStatusClass}">${escapeHtml(finalStatusText)}</span>
              ${deleteBtn}
            </div>
          </div>
          <div class="buddy-post-heading-row">
            <h4 class="buddy-post-heading">${escapeHtml(post?.point_name)}</h4>
            ${pendingBadge}
          </div>
          <div class="buddy-post-meta-row">
            <span>${escapeHtml(formattedDate || "-")}</span>
            <span class="buddy-meta-sep">·</span>
            <span>${escapeHtml(post?.entry_time || "시간미정")}</span>
            <span class="buddy-meta-sep">·</span>
            <span>${escapeHtml(displayState.currentCount)}/${escapeHtml(displayState.capacity)}명</span>
            <span class="buddy-meta-sep">·</span>
            ${post?.has_instructor === true ? '<span>강사 있음</span><span class="buddy-meta-sep">·</span>' : ''}
            <span>${escapeHtml(post?.difficulty || "무관")}</span>
          </div>
          <div class="buddy-post-bottom-row">
            <div class="buddy-host-wrap">
              ${avatarTrigger}
              <span class="buddy-host-meta-text">${escapeHtml(hostMetaText)}</span>
            </div>
            <button type="button" class="buddy-btn-apply" data-action="view-detail" data-post-id="${escapeHtml(post?.id)}">상세보기</button>
          </div>
        </div>
      </article>
    `;
  }

  global.SNORKYBuddyCard = Object.freeze({
    render,
    getThumbUrl,
    parseEventDateTime,
    isPostExpired,
    isPostWithinRetention,
    getPostStatusInfo,
    getPostDisplayState
  });
})(window);
