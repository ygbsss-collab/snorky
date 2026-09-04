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
    if (isPostExpired(post)) {
      return {
        text: "신청 불가",
        className: "buddy-post-status-expired",
        code: "EXPIRED",
        isExpired: true,
        canApply: false
      };
    }
    if (post?.status === "CLOSED") {
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

  function render({ post, author, formattedDate, attributes, statusText, statusClass }) {
    const statusInfo = getPostStatusInfo(post);
    const finalStatusText = statusText !== undefined ? statusText : statusInfo.text;
    const finalStatusClass = statusClass !== undefined ? statusClass : statusInfo.className;
    const displayName = author?.displayName || "다이버";
    const aidaLevel = author?.aidaLevel && author.aidaLevel !== "없음" ? author.aidaLevel : "레벨 없음";
    const gender = post?.host_gender || author?.gender || "비공개";
    const attributeMarkup = renderAttributes(attributes);
    const avatarTrigger = global.SNORKYBuddyProfileCard.renderTrigger({
      userId: post?.user_id,
      profile: {
        displayName,
        avatarUrl: author?.avatarUrl || "",
        gender,
        aidaLevel,
        bio: author?.bio || ""
      },
      className: "buddy-host-avatar",
      resolved: true
    });

    return `
      <article class="buddy-post-card" ${attributeMarkup}>
        <img class="buddy-post-thumb" src="${getThumbUrl(post)}" alt="${escapeHtml(post?.activity_type)}">
        <div class="buddy-post-info">
          <div class="buddy-post-top-row">
            <div class="buddy-post-tag-group">
              <span class="buddy-badge-activity ${getBadgeClass(post?.activity_type)}">${escapeHtml(post?.activity_type)}</span>
              <span class="buddy-post-location">${escapeHtml(post?.region)}</span>
            </div>
            <span class="buddy-post-status-text ${finalStatusClass}">${escapeHtml(finalStatusText)}</span>
          </div>
          <h4 class="buddy-post-heading">${escapeHtml(post?.point_name)}</h4>
          <div class="buddy-post-meta-row">
            <span>${escapeHtml(formattedDate || "-")}</span>
            <span class="buddy-meta-sep">·</span>
            <span>${escapeHtml(post?.entry_time || "시간미정")}</span>
            <span class="buddy-meta-sep">·</span>
            <span>${escapeHtml(post?.current_count || 1)}/${escapeHtml(post?.capacity || 2)}명</span>
            <span class="buddy-meta-sep">·</span>
            <span>${escapeHtml(post?.difficulty || "무관")}</span>
          </div>
          <div class="buddy-post-bottom-row">
            <div class="buddy-host-wrap">
              ${avatarTrigger}
              <span>${escapeHtml(displayName)}</span>
              <span class="buddy-host-divider">·</span>
              <span class="buddy-host-gender">${escapeHtml(gender)}</span>
              <span class="buddy-host-divider">·</span>
              <span class="buddy-host-aida">${escapeHtml(aidaLevel)}</span>
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
    getPostStatusInfo
  });
})(window);
