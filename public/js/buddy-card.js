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

  function render({ post, author, formattedDate, attributes, statusText, statusClass }) {
    const isClosed = post?.status === "CLOSED";
    const finalStatusText = statusText || (isClosed ? "마감" : "모집중");
    const finalStatusClass = statusClass !== undefined
      ? statusClass
      : (isClosed ? "buddy-post-status-closed" : "");
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

  global.SNORKYBuddyCard = Object.freeze({ render, getThumbUrl });
})(window);
