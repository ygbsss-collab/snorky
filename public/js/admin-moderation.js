(function (global) {
  "use strict";

  const CERT_STATUSES = ["PENDING", "APPROVED", "REJECTED", "REVOKED"];
  const CERT_STATUS_LABELS = { PENDING: "검토대기", APPROVED: "승인", REJECTED: "거절", REVOKED: "승인취소" };
  const REPORT_STATUSES = ["PENDING", "REVIEWED", "ACTIONED", "DISMISSED"];
  const REPORT_STATUS_LABELS = {
    PENDING: "접수",
    REVIEWED: "처리완료",
    ACTIONED: "처리완료",
    DISMISSED: "기각"
  };
  const ACTION_LABELS = {
    WARNING: "경고",
    SUSPEND_3_DAYS: "3일 정지",
    SUSPEND_7_DAYS: "7일 정지",
    SUSPEND_30_DAYS: "30일 정지",
    PERMANENT_BAN: "영구 정지"
  };
  let certificationRows = [];
  let reportRows = [];
  let selectedCertificationId = null;
  let selectedReportId = null;
  let dashboardLoaded = false;

  const el = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const formatDate = (value) => value
    ? new Date(value).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "-";
  const statusBadge = (status) => `<span class="admin-management-status is-${escapeHtml(String(status || "").toLowerCase())}">${escapeHtml(status || "-")}</span>`;
  const certificationStatusBadge = (status) => `<span class="admin-management-status is-${escapeHtml(String(status || "").toLowerCase())}">${escapeHtml(CERT_STATUS_LABELS[status] || status || "-")}</span>`;
  const reportStatusBadge = (status) => {
    const raw = String(status || "");
    const label = REPORT_STATUS_LABELS[raw] || raw || "-";
    return `<span class="admin-management-status is-${escapeHtml(raw.toLowerCase())}">${escapeHtml(label)}</span>`;
  };
  const setMessage = (id, message, isError = false) => {
    const node = el(id);
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("is-error", Boolean(isError));
  };

  const isAdminReady = (method) => Boolean(global.supabase?.createClient) && typeof global.SNORKYAdmin?.[method] === "function";

  function loadCurrentManagementTab() {
    const name = document.querySelector("[data-admin-tab].is-active")?.dataset.adminTab;
    if (name === "users") loadUserRows();
    if (name === "certification") loadCertificationRows();
    if (name === "reports") loadReportRows();
  }

  function selectTab(name) {
    document.querySelectorAll("[data-admin-panel]").forEach((panel) => { panel.hidden = panel.dataset.adminPanel !== name; });
    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
      const active = button.dataset.adminTab === name;
      button.classList.toggle("is-active", active);
      if (button.classList.contains("sidebar-nav-item")) {
        if (active) {
          button.classList.add("bg-primary-container", "text-on-primary-container", "font-semibold");
          button.classList.remove("text-inverse-on-surface/75");
        } else {
          button.classList.remove("bg-primary-container", "text-on-primary-container", "font-semibold");
          button.classList.add("text-inverse-on-surface/75");
        }
      }
    });

    const drawer = document.getElementById("sidebar-drawer");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (drawer && !drawer.classList.contains("-translate-x-full") && window.innerWidth < 1024) {
      drawer.classList.add("-translate-x-full");
      backdrop?.classList.add("hidden");
    }

    if (name === "users") loadUserRows();
    if (name === "certification") openCertificationManager();
    if (name === "reports") openReportManager();
    if (name === "dashboard" && !dashboardLoaded) loadDashboardData();
    if (name === "points") openServicePoints();
    if (name === "indoor") openServiceIndoor();
  }
  async function loadDashboardData() {
    dashboardLoaded = true;
    await Promise.allSettled([loadUserRows(), loadCertificationRows(), loadReportRows()]);
  }
  function updateDashboardKpis() {
    const set = (id, value) => { if (el(id)) el(id).textContent = value == null ? "-" : String(value); };
    set("adminKpiTotalUsers", userRows.length || "-");
    set("adminKpiActiveUsers", userRows.length ? userRows.filter((row) => String(row.status || "ACTIVE").toUpperCase() === "ACTIVE").length : "-");
    set("adminKpiPendingCertifications", certificationRows.length ? certificationRows.filter((row) => row.status === "PENDING").length : "-");
    set("adminKpiPendingReports", reportRows.length ? reportRows.filter((row) => row.status === "PENDING").length : "-");
    set("adminKpiSuspendedUsers", userRows.length ? userRows.filter((row) => String(row.status || "").toUpperCase().includes("SUSPEND")).length : "-");
    set("adminKpiBannedUsers", userRows.length ? userRows.filter((row) => String(row.status || "").toUpperCase().includes("PERMANENT") || String(row.status || "").toUpperCase().includes("BAN")).length : "-");
    const pendingCertifications = certificationRows.filter((row) => row.status === "PENDING").length;
    const pendingReports = reportRows.filter((row) => row.status === "PENDING").length;
    set("adminUrgentCount", pendingCertifications + pendingReports || 0);
    const alerts = el("adminUrgentAlerts");
    if (alerts) alerts.innerHTML = pendingCertifications || pendingReports
      ? `${pendingReports ? `<div class="admin-alert-item"><span>미처리 신고를 검토해 주세요.</span><strong>${pendingReports}건</strong></div>` : ""}${pendingCertifications ? `<div class="admin-alert-item"><span>대기 중인 자격 인증이 있습니다.</span><strong>${pendingCertifications}건</strong></div>` : ""}`
      : "<p>현재 긴급하게 처리할 운영 항목이 없습니다.</p>";
  }

  function closeAll() {
    selectedCertificationId = null;
    selectedReportId = null;
    ["userManagerDetail", "certificationManagerDetail", "reportManagerDetail"].forEach((id) => el(id)?.setAttribute("hidden", ""));
  }

  let userRows = [];
  function ensureUserManagerUi() {
    const toolbar = el("adminControls");
    if (toolbar && !el("adminUserManager")) { const button = document.createElement("button"); button.id = "adminUserManager"; button.className = "admin-points"; button.type = "button"; button.textContent = "사용자 관리"; toolbar.insertBefore(button, el("adminExit")); }
    if (!el("userManagerModal")) { el("adminUsersHost")?.insertAdjacentHTML("beforeend", '<section id="userManagerModal" class="admin-console-module"><div class="point-manager-tools"><input id="userManagerSearch" placeholder="닉네임 / 이메일 / user_id 검색" aria-label="사용자 검색"><button id="userManagerSearchButton" type="button" class="admin-management-secondary">검색</button></div><div id="userManagerMessage" class="admin-management-message"></div><div id="userManagerList"><div class="admin-management-empty">불러오는 중...</div></div><div id="userManagerDetail" class="admin-management-detail" hidden></div></section>'); }
    const tools = el("userManagerSearch")?.parentElement;
    if (tools && !el("userManagerStatusFilter")) {
      const filter = document.createElement("select");
      filter.id = "userManagerStatusFilter";
      filter.setAttribute("aria-label", "사용자 상태 필터");
      filter.innerHTML = '<option value="ALL">전체 상태</option><option value="ACTIVE">활성</option><option value="SUSPEND">정지</option><option value="BAN">영구정지</option>';
      tools.appendChild(filter);
    }
  }
  function ensureReviewManagerUi() {
    if (!el("certificationManagerModal")) el("adminCertificationHost")?.insertAdjacentHTML("beforeend", '<section id="certificationManagerModal" class="admin-console-module"><div class="admin-management-toolbar"><select id="certificationStatusFilter"><option value="ALL">전체 상태</option><option value="PENDING">검토대기</option><option value="APPROVED">승인</option><option value="REJECTED">거절</option><option value="REVOKED">승인취소</option></select></div><div id="certificationManagerMessage" class="admin-management-message"></div><div id="certificationManagerList"><div class="admin-management-empty">불러오는 중...</div></div><div id="certificationManagerDetail" class="admin-management-detail" hidden></div></section>');
    if (!el("reportManagerModal")) el("adminReportsHost")?.insertAdjacentHTML("beforeend", '<section id="reportManagerModal" class="admin-console-module"><div class="admin-management-toolbar"><select id="reportStatusFilter"><option value="ALL">전체 상태</option><option value="PENDING">접수</option><option value="COMPLETED">처리완료</option><option value="DISMISSED">기각</option></select></div><div id="reportManagerMessage" class="admin-management-message"></div><div id="reportManagerList"><div class="admin-management-empty">불러오는 중...</div></div><div id="reportManagerDetail" class="admin-management-detail" hidden></div></section>');
  }
  async function openUserManager() { await loadUserRows(); }
  async function loadUserRows() {
    const list = el("userManagerList"); if (!list) return;
    list.innerHTML = '<div class="admin-management-empty">사용자 목록을 불러오는 중...</div>';
    setMessage("userManagerMessage", "");
    if (!isAdminReady("loadUsersAdmin")) return;
    try { userRows = await global.SNORKYAdmin.loadUsersAdmin(el("userManagerSearch")?.value.trim() || ""); renderUserRows(); updateDashboardKpis(); }
    catch (error) { list.innerHTML = '<div class="admin-management-empty is-error">사용자 목록을 불러오지 못했습니다.</div>'; setMessage("userManagerMessage", error?.message || "조회 오류", true); }
  }
  function renderUserRows() {
    const list = el("userManagerList"); if (!list) return;
    const filter = el("userManagerStatusFilter")?.value || "ALL";
    const rows = userRows.filter((row) => filter === "ALL" || String(row.status || "ACTIVE").toUpperCase().includes(filter));
    if (!rows.length) { list.innerHTML = '<div class="admin-management-empty">조건에 맞는 사용자가 없습니다.</div>'; return; }
    list.innerHTML = `<div class="admin-management-table-wrap"><table class="admin-management-table"><thead><tr><th>닉네임</th><th>이메일</th><th>USER ID</th><th>상태</th><th>상태 만료</th><th>가입일</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr data-user-row-id="${escapeHtml(row.user_id)}"><td><strong>${escapeHtml(row.nickname || "-")}</strong></td><td>${escapeHtml(row.email || "-")}</td><td>${escapeHtml(row.user_id)}</td><td>${statusBadge(row.status || "ACTIVE")}</td><td>${escapeHtml(formatDate(row.suspended_until))}</td><td>${escapeHtml(formatDate(row.created_at))}</td><td><button type="button" class="admin-management-secondary" data-user-id="${escapeHtml(row.user_id)}">상세</button></td></tr>`).join("")}</tbody></table></div><div class="admin-mobile-list">${rows.map((row) => `<article class="admin-mobile-card"><div class="admin-mobile-card-head"><strong>${escapeHtml(row.nickname || "-")}</strong>${statusBadge(row.status || "ACTIVE")}</div><p>${escapeHtml(row.email || row.user_id)}</p><p>가입 ${escapeHtml(formatDate(row.created_at))}</p><button type="button" data-user-id="${escapeHtml(row.user_id)}">상세 및 제재</button></article>`).join("")}</div>`;
    list.querySelectorAll("[data-user-id]").forEach((button) => button.addEventListener("click", () => showUserDetail(button.dataset.userId)));
  }
  function showUserDetail(userId) {
    const row = userRows.find((item) => String(item.user_id) === String(userId)); const detail = el("userManagerDetail"); if (!row || !detail) return;
    detail.hidden = false;
    detail.innerHTML = `<h3>사용자 직접 제재</h3><dl class="admin-management-detail-grid"><div><dt>닉네임</dt><dd>${escapeHtml(row.nickname || "-")}</dd></div><div><dt>이메일</dt><dd>${escapeHtml(row.email || "-")}</dd></div><div class="wide"><dt>user_id</dt><dd>${escapeHtml(row.user_id)}</dd></div><div><dt>현재 상태</dt><dd>${statusBadge(row.status || "ACTIVE")}</dd></div></dl><label class="admin-management-field">제재 종류<select id="userActionType"><option value="WARNING">경고</option><option value="SUSPEND_3_DAYS">3일 정지</option><option value="SUSPEND_7_DAYS">7일 정지</option><option value="SUSPEND_30_DAYS">30일 정지</option><option value="PERMANENT_BAN">영구 정지</option><option value="CLEAR">제재 해제</option></select></label><label class="admin-management-field">처리 사유<textarea id="userActionReason" maxlength="1000"></textarea></label><button type="button" class="admin-management-danger" data-apply-user-action>제재 적용</button>`;
    detail.querySelector("[data-apply-user-action]").addEventListener("click", async () => { const actionType = el("userActionType")?.value; if (!global.confirm(`${actionType} 처리를 적용하시겠습니까?`)) return; try { await global.SNORKYAdmin.moderateUserAdmin(row.user_id, actionType, el("userActionReason")?.value.trim()); setMessage("userManagerMessage", "사용자 처리가 완료되었습니다."); await loadUserRows(); showUserDetail(row.user_id); } catch (error) { setMessage("userManagerMessage", error?.message || "처리 오류", true); } });
  }

  async function openCertificationManager() {
    selectedCertificationId = null;
    el("certificationManagerDetail")?.setAttribute("hidden", "");
    await loadCertificationRows();
  }

  async function loadCertificationRows() {
    const list = el("certificationManagerList");
    if (!list) return;
    list.innerHTML = '<div class="admin-management-empty">자격 인증 요청을 불러오는 중...</div>';
    setMessage("certificationManagerMessage", "");
    if (!isAdminReady("loadCertificationRequestsAdmin")) return;
    try {
      certificationRows = await global.SNORKYAdmin.loadCertificationRequestsAdmin();
      renderCertificationRows(); updateDashboardKpis();
    } catch (error) {
      list.innerHTML = '<div class="admin-management-empty is-error">자격 인증 요청을 불러오지 못했습니다.</div>';
      setMessage("certificationManagerMessage", error?.message || "조회 오류", true);
    }
  }

  function renderCertificationRows() {
    const list = el("certificationManagerList");
    if (!list) return;
    const filter = el("certificationStatusFilter")?.value || "ALL";
    const rows = certificationRows.filter((row) => filter === "ALL" || row.status === filter);
    if (!rows.length) {
      list.innerHTML = '<div class="admin-management-empty">조건에 맞는 자격 인증 요청이 없습니다.</div>';
      return;
    }
    list.innerHTML = `
      <div class="admin-management-table-wrap">
        <table class="admin-management-table">
          <thead><tr><th>닉네임</th><th>기관</th><th>레벨</th><th>자격번호</th><th>요청일</th><th>상태</th></tr></thead>
          <tbody>${rows.map((row) => `
            <tr data-certification-request-id="${escapeHtml(row.id)}" tabindex="0">
              <td>${escapeHtml(row.nickname || row.user_id)}</td>
              <td>${escapeHtml(row.organization)}</td>
              <td>${escapeHtml(row.level)}</td>
              <td>${escapeHtml(row.certification_number)}</td>
              <td>${escapeHtml(formatDate(row.requested_at))}</td>
              <td>${certificationStatusBadge(row.status)}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="admin-mobile-list">${rows.map((row) => `<article class="admin-mobile-card" data-certification-request-id="${escapeHtml(row.id)}" tabindex="0"><div class="admin-mobile-card-head"><strong>${escapeHtml(row.nickname || row.user_id)}</strong>${certificationStatusBadge(row.status)}</div><p>${escapeHtml(row.organization)} · ${escapeHtml(row.level)}</p><p>${escapeHtml(row.certification_number)} · ${escapeHtml(formatDate(row.requested_at))}</p><button type="button">신청 상세</button></article>`).join("")}</div>`;
    list.querySelectorAll("[data-certification-request-id]").forEach((row) => {
      const open = () => showCertificationDetail(Number(row.dataset.certificationRequestId));
      row.addEventListener("click", open);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    });
  }

  async function showCertificationDetail(requestId) {
    const row = certificationRows.find((item) => Number(item.id) === Number(requestId));
    const detail = el("certificationManagerDetail");
    if (!row || !detail) return;
    selectedCertificationId = Number(row.id);
    detail.hidden = false;
    detail.innerHTML = `
      <h3>자격 인증 상세</h3>
      <dl class="admin-management-detail-grid">
        <div><dt>닉네임</dt><dd>${escapeHtml(row.nickname || row.user_id)}</dd></div>
        <div><dt>사용자 ID</dt><dd>${escapeHtml(row.user_id)}</dd></div>
        <div><dt>기관</dt><dd>${escapeHtml(row.organization)}</dd></div>
        <div><dt>레벨</dt><dd>${escapeHtml(row.level)}</dd></div>
        <div><dt>자격번호</dt><dd>${escapeHtml(row.certification_number)}</dd></div>
        <div><dt>요청일</dt><dd>${escapeHtml(formatDate(row.requested_at))}</dd></div>
        <div><dt>상태</dt><dd>${certificationStatusBadge(row.status)}</dd></div>
        <div><dt>검토일</dt><dd>${escapeHtml(formatDate(row.reviewed_at))}</dd></div>
      </dl>
      ${row.photo_path
        ? '<div class="admin-certification-photo"><p id="certificationPhotoStatus">자격증 사진을 불러오는 중...</p><img id="certificationPhotoPreview" alt="자격증 검수 사진" hidden></div>'
        : `<p class="admin-management-notice">${row.photo_deleted_at ? "처리 후 자격증 사진이 삭제되었습니다." : "검수할 자격증 사진이 없습니다."}</p>`}
      <label class="admin-management-field">처리 사유<textarea id="certificationRejectionReason" maxlength="500" placeholder="거절 또는 승인취소 사유를 입력하세요.">${escapeHtml(row.rejection_reason || "")}</textarea></label>
      <div class="admin-management-actions">
        <button type="button" class="admin-management-primary" data-certification-approve ${row.status !== "PENDING" ? "disabled" : ""}>승인</button>
        <button type="button" class="admin-management-danger" data-certification-reject ${row.status !== "PENDING" ? "disabled" : ""}>거절</button>
        ${row.status === "APPROVED" ? '<button type="button" class="admin-management-danger" data-certification-revoke>승인취소</button>' : ""}
        ${row.status !== "PENDING" && row.photo_path ? '<button type="button" class="admin-management-secondary" data-certification-delete-photo>사진 삭제 재시도</button>' : ""}
      </div>`;
    detail.querySelector("[data-certification-approve]")?.addEventListener("click", () => reviewCertification("APPROVED"));
    detail.querySelector("[data-certification-reject]")?.addEventListener("click", () => reviewCertification("REJECTED"));
    detail.querySelector("[data-certification-revoke]")?.addEventListener("click", revokeCertification);
    detail.querySelector("[data-certification-delete-photo]")?.addEventListener("click", () => deleteCertificationPhoto(row));
    if (row.photo_path) {
      try {
        const signedUrl = await global.SNORKYAdmin.getCertificationPhotoUrlAdmin(row.photo_path);
        if (selectedCertificationId !== Number(row.id)) return;
        const image = el("certificationPhotoPreview");
        if (image) { image.src = signedUrl; image.hidden = false; }
        el("certificationPhotoStatus")?.setAttribute("hidden", "");
      } catch (error) {
        const status = el("certificationPhotoStatus");
        if (status) status.textContent = error?.message || "자격증 사진을 불러오지 못했습니다.";
      }
    }
  }

  async function revokeCertification() {
    if (!selectedCertificationId) return;
    const reason = el("certificationRejectionReason")?.value.trim() || "";
    if (!global.confirm("승인 상태와 인증마크를 해제하시겠습니까?")) return;
    try {
      await global.SNORKYAdmin.revokeCertificationApprovalAdmin(selectedCertificationId, reason);
      setMessage("certificationManagerMessage", "자격 인증 승인을 취소했습니다.");
      await loadCertificationRows();
      showCertificationDetail(selectedCertificationId);
    } catch (error) {
      setMessage("certificationManagerMessage", error?.message || "승인을 취소하지 못했습니다.", true);
    }
  }

  async function deleteCertificationPhoto(row) {
    try {
      await global.SNORKYAdmin.deleteCertificationPhotoAdmin(row.id, row.photo_path);
      setMessage("certificationManagerMessage", "자격증 사진을 삭제했습니다.");
      await loadCertificationRows();
      showCertificationDetail(row.id);
    } catch (error) {
      setMessage("certificationManagerMessage", error?.message || "자격증 사진을 삭제하지 못했습니다.", true);
    }
  }

  async function reviewCertification(status) {
    if (!selectedCertificationId || !CERT_STATUSES.includes(status) || status === "PENDING") return;
    const reason = el("certificationRejectionReason")?.value.trim() || "";
    if (status === "REJECTED" && !reason) {
      setMessage("certificationManagerMessage", "반려 사유를 입력해 주세요.", true);
      return;
    }
    try {
      const result = await global.SNORKYAdmin.reviewCertificationRequestAdmin(selectedCertificationId, status, reason);
      setMessage(
        "certificationManagerMessage",
        result?.photoDeleteError
          ? `${status === "APPROVED" ? "승인" : "거절"} 처리는 완료됐지만 사진 삭제에 실패했습니다. 삭제를 재시도해 주세요.`
          : (status === "APPROVED" ? "자격 인증을 승인했습니다." : "자격 인증을 거절했습니다."),
        Boolean(result?.photoDeleteError)
      );
      await loadCertificationRows();
      showCertificationDetail(selectedCertificationId);
    } catch (error) {
      setMessage("certificationManagerMessage", error?.message || "처리하지 못했습니다.", true);
    }
  }

  async function openReportManager() {
    selectedReportId = null;
    el("reportManagerDetail")?.setAttribute("hidden", "");
    await loadReportRows();
  }

  async function loadReportRows() {
    const list = el("reportManagerList");
    if (!list) return;
    list.innerHTML = '<div class="admin-management-empty">신고 목록을 불러오는 중...</div>';
    setMessage("reportManagerMessage", "");
    if (!isAdminReady("loadUserReportsAdmin")) return;
    try {
      reportRows = await global.SNORKYAdmin.loadUserReportsAdmin();
      renderReportRows(); updateDashboardKpis();
    } catch (error) {
      list.innerHTML = '<div class="admin-management-empty is-error">신고 목록을 불러오지 못했습니다.</div>';
      setMessage("reportManagerMessage", error?.message || "조회 오류", true);
    }
  }

  function renderReportRows() {
    const list = el("reportManagerList");
    if (!list) return;
    const filter = el("reportStatusFilter")?.value || "ALL";
    const rows = reportRows.filter((row) => filter === "ALL"
      || (filter === "COMPLETED" ? ["REVIEWED", "ACTIONED"].includes(row.status) : row.status === filter));
    if (!rows.length) {
      list.innerHTML = '<div class="admin-management-empty">조건에 맞는 신고가 없습니다.</div>';
      return;
    }
    list.innerHTML = `
      <div class="admin-management-table-wrap">
        <table class="admin-management-table">
          <thead><tr><th>대상</th><th>사유</th><th>신고자</th><th>post_id</th><th>신고일</th><th>상태</th><th>제재내용</th><th>제재취소</th></tr></thead>
          <tbody>${rows.map((row) => `
            <tr data-user-report-id="${escapeHtml(row.id)}" tabindex="0">
              <td>${escapeHtml(row.target_profile?.custom_nickname || row.target_nickname || row.target_user_id)}</td>
              <td>${escapeHtml(row.reason)}</td>
              <td>${escapeHtml(row.reporter_profile?.custom_nickname || row.reporter_nickname || row.reporter_user_id || "-")}</td>
              <td>${escapeHtml(row.buddy_post_id || "-")}</td>
              <td>${escapeHtml(formatDate(row.reported_at))}</td>
              <td>${reportStatusBadge(row.status)}</td>
              <td>${escapeHtml(ACTION_LABELS[row.action_type] || "-")}</td>
              <td>${reportSanctionCancelControl(row)}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="admin-mobile-list">${rows.map((row) => `<article class="admin-mobile-card" data-user-report-id="${escapeHtml(row.id)}" tabindex="0"><div class="admin-mobile-card-head"><strong>${escapeHtml(row.target_profile?.custom_nickname || row.target_nickname || row.target_user_id)}</strong>${reportStatusBadge(row.status)}</div><p>${escapeHtml(row.reason)}</p><p>${escapeHtml(formatDate(row.reported_at))}</p><p>제재내용 · ${escapeHtml(ACTION_LABELS[row.action_type] || "-")}</p><p>제재취소 · ${reportSanctionCancelControl(row)}</p><button type="button">신고 상세</button></article>`).join("")}</div>`;
    list.querySelectorAll("[data-user-report-id]").forEach((row) => {
      const open = () => showReportDetail(Number(row.dataset.userReportId));
      row.addEventListener("click", open);
      row.addEventListener("keydown", (event) => { if (!event.target.closest("[data-cancel-report-sanction]") && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open(); } });
    });
    list.querySelectorAll("[data-cancel-report-sanction]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      cancelReportSanction(Number(button.dataset.cancelReportSanction));
    }));
  }

  function reportSanctionCancelControl(row) {
    const cancellable = ["SUSPEND_3_DAYS", "SUSPEND_7_DAYS", "SUSPEND_30_DAYS", "PERMANENT_BAN"].includes(row.action_type)
      && !["PENDING", "DISMISSED"].includes(row.status);
    if (!cancellable) return "-";
    if (row.sanction_cancelled) return "취소됨";
    return `<button type="button" class="admin-management-secondary" data-cancel-report-sanction="${escapeHtml(row.id)}">취소</button>`;
  }

  async function cancelReportSanction(reportId) {
    if (!reportId || !global.confirm("이 신고 건에 적용된 제재를 취소하시겠습니까? 다른 신고의 활성 제재는 유지됩니다.")) return;
    try {
      await global.SNORKYAdmin.cancelUserReportSanctionAdmin(reportId);
      await loadReportRows();
      setMessage("reportManagerMessage", "신고 건의 제재를 취소했습니다.");
    } catch (error) {
      setMessage("reportManagerMessage", error?.message || "제재를 취소하지 못했습니다.", true);
    }
  }

  async function cancelReportedBuddyPost(reportId, buddyPostId) {
    if (!reportId || !buddyPostId || !global.confirm("신고된 버디공고를 취소하시겠습니까? 관련 참가 신청도 취소됩니다.")) return;
    const reason = el("reportActionReason")?.value.trim() || "게시글 신고에 따른 관리자 취소";
    try {
      await global.SNORKYAdmin.cancelBuddyPostFromReportAdmin(reportId, buddyPostId, reason);
      setMessage("reportManagerMessage", "신고된 버디공고를 취소했습니다.");
      await loadReportRows();
      showReportDetail(reportId);
    } catch (error) {
      setMessage("reportManagerMessage", error?.message || "게시글 취소에 실패했습니다.", true);
    }
  }

  async function showReportDetail(reportId) {
    const row = reportRows.find((item) => Number(item.id) === Number(reportId));
    const detail = el("reportManagerDetail");
    if (!row || !detail) return;
    selectedReportId = Number(row.id);
    const profile = row.target_profile || {};
    const relatedPost = row.related_post;
    const relatedReports = reportRows.filter((item) => String(item.target_user_id) === String(row.target_user_id));
    const imagePaths = Array.isArray(row.image_paths) ? row.image_paths.slice(0, 3).filter(Boolean) : [];
    detail.hidden = false;
    detail.innerHTML = `
      <h3>신고 상세</h3>
      <dl class="admin-management-detail-grid">
        <div><dt>대상 프로필</dt><dd>${escapeHtml(profile.custom_nickname || row.target_nickname || row.target_user_id)} · ${escapeHtml(profile.gender || "비공개")} · ${escapeHtml(profile.age_group || "연령 미입력")} · ${escapeHtml(profile.aida_level || "자격 미입력")}${profile.certification_status === "APPROVED" ? " ✓" : ""}</dd></div>
        <div><dt>대상 ID</dt><dd>${escapeHtml(row.target_user_id)}</dd></div>
        <div><dt>누적 신고수</dt><dd>${escapeHtml(row.cumulative_report_count)}건</dd></div>
        <div><dt>현재 제재</dt><dd>${profile.banned ? "영구 정지" : (profile.suspended_until && new Date(profile.suspended_until) > new Date() ? `${escapeHtml(formatDate(profile.suspended_until))}까지 정지` : "없음")}</dd></div>
        <div><dt>신고자</dt><dd>${escapeHtml(row.reporter_profile?.custom_nickname || row.reporter_nickname || row.reporter_user_id || "-")}</dd></div>
        <div><dt>신고일</dt><dd>${escapeHtml(formatDate(row.reported_at))}</dd></div>
        <div><dt>사유</dt><dd>${escapeHtml(row.reason)}</dd></div>
        <div><dt>상태</dt><dd>${reportStatusBadge(row.status)}</dd></div>
        <div class="wide"><dt>신고내용</dt><dd class="admin-management-pre">${escapeHtml(row.details || "상세 내용 없음")}</dd></div>
        <div class="wide"><dt>관련 공고</dt><dd>${relatedPost ? `${escapeHtml(relatedPost.activity_type)} · ${escapeHtml(relatedPost.point_name)} · #${escapeHtml(relatedPost.id)} · ${escapeHtml(relatedPost.status)}` : (row.buddy_post_id ? `#${escapeHtml(row.buddy_post_id)} (삭제되었거나 조회할 수 없음)` : "없음")}</dd></div>
        <div class="wide"><dt>피신고자 이력</dt><dd>${relatedReports.slice(0, 5).map((item) => `${escapeHtml(formatDate(item.reported_at))} · ${escapeHtml(item.reason)} · ${REPORT_STATUS_LABELS[item.status] || escapeHtml(item.status)}`).join("<br>") || "이력 없음"}</dd></div>
        <div class="wide">
          <dt>증빙 이미지</dt>
          <dd>
            ${imagePaths.length ? `<div data-report-evidence-gallery style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:6px;"><span>이미지를 불러오는 중...</span></div>` : `<span style="color:#8898a6;">첨부된 증빙 사진이 없습니다.</span>`}
          </dd>
        </div>
      </dl>
      <div class="admin-management-control-grid">
        <label class="admin-management-field">처리 상태
          <select id="reportProcessingStatus">
            <option value="PENDING"${row.status === "PENDING" ? " selected" : ""}>접수</option>
            <option value="${row.status === "ACTIONED" ? "ACTIONED" : "REVIEWED"}"${["REVIEWED", "ACTIONED"].includes(row.status) ? " selected" : ""}>처리완료</option>
            <option value="DISMISSED"${row.status === "DISMISSED" ? " selected" : ""}>기각</option>
          </select>
        </label>
        <button type="button" class="admin-management-secondary" data-save-report-status>상태 저장</button>
      </div>
      <div class="admin-management-sanction">
        <h4>제재 프리셋</h4>
        <div class="admin-sanction-presets">${Object.entries(ACTION_LABELS).map(([value, label]) => `<button type="button" data-sanction-preset="${value}">${label}</button>`).join("")}</div>
        <label class="admin-management-field">처리 메모<textarea id="reportActionReason" maxlength="1000" placeholder="제재 사유 또는 관리자 메모"></textarea></label>
      </div>`;
    if (row.buddy_post_id) {
      const cancelPostButton = document.createElement("button");
      cancelPostButton.type = "button";
      cancelPostButton.className = "admin-management-danger";
      cancelPostButton.textContent = relatedPost?.status === "CANCELED" ? "게시글 취소 완료" : "게시글 취소";
      cancelPostButton.disabled = relatedPost?.status === "CANCELED";
      cancelPostButton.dataset.cancelReportedPost = "true";
      detail.querySelector(".admin-management-control-grid")?.appendChild(cancelPostButton);
      cancelPostButton.addEventListener("click", () => cancelReportedBuddyPost(row.id, row.buddy_post_id));
    }
    if (imagePaths.length) {
      const gallery = detail.querySelector("[data-report-evidence-gallery]");
      try {
        const urls = await Promise.all(imagePaths.map((path) => global.SNORKYAdmin.getReportEvidenceUrlAdmin(path)));
        if (gallery) {
          gallery.innerHTML = urls.filter(Boolean).map((url) => `
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none;" title="클릭하여 크게 보기">
              <img src="${escapeHtml(url)}" alt="신고 증빙 이미지" style="width:120px;height:90px;object-fit:cover;border-radius:8px;border:1px solid #dbe5e8;cursor:pointer;transition:transform 0.15s ease;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
            </a>
          `).join("") || "<span>증빙 이미지를 불러오지 못했습니다.</span>";
        }
      } catch (error) {
        if (gallery) gallery.innerHTML = `<span>${escapeHtml(error?.message || "증빙 이미지를 불러오지 못했습니다.")}</span>`;
      }
    }
    detail.querySelector("[data-save-report-status]")?.addEventListener("click", saveReportStatus);
    detail.querySelectorAll("[data-sanction-preset]").forEach((button) => button.addEventListener("click", () => applyReportAction(button.dataset.sanctionPreset)));
  }

  async function saveReportStatus() {
    if (!selectedReportId) return;
    const status = el("reportProcessingStatus")?.value;
    if (!REPORT_STATUSES.includes(status)) return;
    try {
      await global.SNORKYAdmin.moderateUserReportAdmin(selectedReportId, status, null, null);
      setMessage("reportManagerMessage", "신고 처리 상태를 저장했습니다.");
      await loadReportRows();
      showReportDetail(selectedReportId);
    } catch (error) {
      setMessage("reportManagerMessage", error?.message || "상태를 저장하지 못했습니다.", true);
    }
  }

  async function applyReportAction(actionType) {
    if (!selectedReportId) return;
    const reason = el("reportActionReason")?.value.trim() || "";
    if (!ACTION_LABELS[actionType]) {
      setMessage("reportManagerMessage", "제재 종류를 선택해 주세요.", true);
      return;
    }
    if (!global.confirm(`${ACTION_LABELS[actionType]} 제재를 적용하시겠습니까? 기존 이력은 보존됩니다.`)) return;
    try {
      await global.SNORKYAdmin.moderateUserReportAdmin(selectedReportId, "ACTIONED", actionType, reason);
      setMessage("reportManagerMessage", `${ACTION_LABELS[actionType]} 제재를 저장했습니다.`);
      await loadReportRows();
      showReportDetail(selectedReportId);
    } catch (error) {
      setMessage("reportManagerMessage", error?.message || "제재를 저장하지 못했습니다.", true);
    }
  }

  let serviceRegions = [], servicePoints = [], serviceCenters = [];
  let serviceRegionId = null, selectedPointId = null, selectedCenterId = null;
  function showAdminToast(message, isError = false) {
    if (!message) return;
    let container = document.getElementById("adminToastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "adminToastContainer";
      container.className = "fixed top-5 right-5 z-[99999] flex flex-col gap-2.5 pointer-events-none max-w-sm w-full";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3.5 rounded-xl shadow-2xl border text-sm font-semibold transition-all duration-300 transform -translate-y-2 opacity-0 ${
      isError
        ? 'bg-red-600 text-white border-red-500 shadow-red-900/30'
        : 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/30'
    }`;
    const icon = isError ? "error" : "check_circle";
    toast.innerHTML = `
      <span class="material-symbols-outlined text-[22px] flex-shrink-0 text-white">${icon}</span>
      <span class="flex-1 text-xs leading-snug font-body-md text-white">${escapeHtml(message)}</span>
      <button type="button" class="text-xs text-white/80 hover:text-white flex-shrink-0 px-1 py-0.5 rounded">✕</button>
    `;
    toast.querySelector("button").onclick = () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-8px)";
      setTimeout(() => toast.remove(), 250);
    };
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-8px)";
        setTimeout(() => toast.remove(), 250);
      }
    }, 3800);
  }

  const serviceMessage = (text, error = false) => {
    setMessage("adminServicePointsMessage", text, error);
    setMessage("adminServiceIndoorMessage", text, error);
    if (text) {
      showAdminToast(text, error);
    }
  };

  /* ==========================================================================
     Tab 2: 지역 / 다이빙 포인트 관리 (Stitch Screen 2 UI - Master-Detail Split)
     ========================================================================== */
  async function openServicePoints() {
    const body = el("adminServicePointsBody");
    if (!body) return;
    body.innerHTML = '<div class="p-6 text-center text-secondary text-sm">지역과 포인트를 불러오는 중...</div>';
    try {
      serviceRegions = await global.SNORKYAdmin.loadRegionsAdmin();
      servicePoints = await global.SNORKYAdmin.loadPointsAdmin();
      if (!serviceRegionId || !serviceRegions.some(r => String(r.id) === String(serviceRegionId))) {
        serviceRegionId = serviceRegions[0]?.id || null;
      }
      renderServicePoints();
      const currentPoints = servicePoints.filter(p => String(p.region_id) === String(serviceRegionId));
      if (currentPoints.length > 0) {
        showServicePointForm(currentPoints[0].id);
      } else {
        showServicePointForm(null);
      }
    } catch (error) {
      body.innerHTML = '<div class="p-6 text-center text-error text-sm">목록을 불러오지 못했습니다.</div>';
      serviceMessage(error?.message || "조회 오류", true);
    }
  }

  function renderServicePoints() {
    const body = el("adminServicePointsBody");
    if (!body) return;
    const region = serviceRegions.find(item => String(item.id) === String(serviceRegionId));
    const points = servicePoints.filter(item => String(item.region_id) === String(serviceRegionId));

    // 상단 지역 선택 드롭다운 갱신
    const regionSelect = el("adminServiceRegionSelect");
    if (regionSelect) {
      regionSelect.innerHTML = serviceRegions.map(item => {
        const count = servicePoints.filter(p => String(p.region_id) === String(item.id)).length;
        return `<option value="${escapeHtml(item.id)}"${String(item.id) === String(serviceRegionId) ? " selected" : ""}>${escapeHtml(item.name)} (${count}개 포인트)</option>`;
      }).join("");
      regionSelect.onchange = (e) => {
        serviceRegionId = e.target.value;
        selectedPointId = null;
        renderServicePoints();
        const rPoints = servicePoints.filter(p => String(p.region_id) === String(serviceRegionId));
        if (rPoints.length > 0) showServicePointForm(rPoints[0].id);
        else showServicePointForm(null);
      };
    }

    // 상단 버튼 바인딩
    const pointsSection = document.querySelector('[data-admin-panel="points"]');
    if (pointsSection) {
      const addRegBtn = pointsSection.querySelector("[data-service-add-region]");
      if (addRegBtn) addRegBtn.onclick = addServiceRegion;
      const renameRegBtn = pointsSection.querySelector("[data-service-rename-region]");
      if (renameRegBtn) renameRegBtn.onclick = renameServiceRegion;
      const delRegBtn = pointsSection.querySelector("[data-service-delete-region]");
      if (delRegBtn) delRegBtn.onclick = deleteServiceRegion;
      const addPtBtn = pointsSection.querySelector("[data-service-add-point]");
      if (addPtBtn) addPtBtn.onclick = () => showServicePointForm(null);
    }

    // 좌측 상단 헤더
    const titleEl = el("pointsRegionTitle");
    if (titleEl) titleEl.textContent = `${region?.name || "지역"} 포인트 목록`;
    const badgeEl = el("pointsCountBadge");
    if (badgeEl) badgeEl.textContent = String(points.length);

    // 좌측 마스터 테이블 렌더링 (Stitch Screen 2 Table Layout)
    if (!points.length) {
      body.innerHTML = '<div class="p-8 text-center text-secondary text-sm">등록된 포인트가 없습니다. 상단 [포인트 신규 등록]을 눌러 추가하세요.</div>';
    } else {
      body.innerHTML = `
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-surface-container-low border-b border-surface-container-high">
              <th class="px-4 py-2.5 font-mono text-xs text-secondary uppercase font-semibold">포인트명</th>
              <th class="px-3 py-2.5 font-mono text-xs text-secondary uppercase font-semibold text-right">좌표 (WGS84)</th>
              <th class="px-3 py-2.5 font-mono text-xs text-secondary uppercase font-semibold text-center w-24">작업</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-container-low" id="pointsTableBody">
            ${points.map(pt => {
              const isSelected = String(pt.id) === String(selectedPointId);
              const latStr = pt.lat != null ? Number(pt.lat).toFixed(4) : "-";
              const lngStr = pt.lng != null ? Number(pt.lng).toFixed(4) : "-";
              return `
                <tr class="${isSelected ? 'bg-surface-container/70 border-l-4 border-primary' : 'hover:bg-surface-container-low/70'} cursor-pointer transition-colors group" data-point-row="${escapeHtml(pt.id)}">
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      ${isSelected ? '<span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>' : ''}
                      <div>
                        <div class="font-headline text-sm font-semibold ${isSelected ? 'text-primary' : 'text-on-surface group-hover:text-primary'}">${escapeHtml(pt.name)}</div>
                        <div class="font-body-md text-xs text-secondary flex items-center gap-1 mt-0.5">
                          <span class="material-symbols-outlined text-[13px]">waves</span>
                          <span class="truncate max-w-[140px]">${escapeHtml(pt.point_feature || "특징 미등록")}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-3 py-3 text-right">
                    <span class="font-mono text-xs text-on-surface-variant block font-medium">${latStr}</span>
                    <span class="font-mono text-[11px] text-secondary block">${lngStr}</span>
                  </td>
                  <td class="px-3 py-3 text-center">
                    <div class="inline-flex items-center gap-1">
                      <button type="button" class="px-2 py-1 rounded ${isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container hover:bg-surface-container-high text-on-surface'} font-mono text-[11px] font-semibold transition-colors" data-service-select-point="${escapeHtml(pt.id)}">
                        ${isSelected ? '선택됨' : '선택'}
                      </button>
                      <button type="button" class="p-1 rounded text-secondary hover:text-error hover:bg-error-container/30 transition-colors" title="삭제" data-service-delete-point="${escapeHtml(pt.id)}">
                        <span class="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;

      body.querySelectorAll("[data-point-row]").forEach(tr => {
        tr.addEventListener("click", (e) => {
          if (e.target.closest("[data-service-delete-point]")) return;
          showServicePointForm(tr.dataset.pointRow);
        });
      });
      body.querySelectorAll("[data-service-delete-point]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteServicePoint(btn.dataset.serviceDeletePoint);
        });
      });
    }

    // 검색창 바인딩
    const searchInput = el("pointSearchInput");
    if (searchInput) {
      searchInput.oninput = (e) => {
        const query = e.target.value.toLowerCase().trim();
        body.querySelectorAll("#pointsTableBody tr").forEach(tr => {
          const text = tr.innerText.toLowerCase();
          tr.style.display = text.includes(query) ? "" : "none";
        });
      };
    }
  }

  async function addServiceRegion() {
    const name = global.prompt("새로 추가할 지역명을 입력하세요.");
    if (!name?.trim()) return;
    try {
      const row = await global.SNORKYAdmin.saveRegionAdmin({ name: name.trim() });
      serviceRegions.push(row);
      serviceRegionId = row.id;
      renderServicePoints();
      showServicePointForm(null);
      serviceMessage(`'${name.trim()}' 지역이 추가되었습니다.`);
    } catch (error) {
      serviceMessage(error?.message || "지역을 추가하지 못했습니다.", true);
    }
  }

  async function renameServiceRegion() {
    const row = serviceRegions.find(item => String(item.id) === String(serviceRegionId));
    if (!row) return;
    const name = global.prompt("새 지역명을 입력하세요.", row.name || "");
    if (!name?.trim() || name.trim() === row.name) return;
    try {
      const saved = await global.SNORKYAdmin.saveRegionAdmin({ id: row.id, name: name.trim() });
      Object.assign(row, saved);
      renderServicePoints();
      serviceMessage("지역명을 변경했습니다.");
    } catch (error) {
      serviceMessage(error?.message || "지역명을 변경하지 못했습니다.", true);
    }
  }

  async function deleteServiceRegion() {
    const row = serviceRegions.find(item => String(item.id) === String(serviceRegionId));
    if (!row || !global.confirm(`'${row.name}' 지역과 해당 지역의 모든 포인트를 삭제할까요?`)) return;
    try {
      await global.SNORKYAdmin.deleteRegionAdmin(row.id);
      serviceRegions = serviceRegions.filter(item => item.id !== row.id);
      servicePoints = servicePoints.filter(item => item.region_id !== row.id);
      serviceRegionId = serviceRegions[0]?.id || null;
      renderServicePoints();
      const nextPts = servicePoints.filter(p => String(p.region_id) === String(serviceRegionId));
      showServicePointForm(nextPts[0]?.id || null);
      serviceMessage("지역을 삭제했습니다.");
    } catch (error) {
      serviceMessage(error?.message || "지역을 삭제하지 못했습니다.", true);
    }
  }

  function showServicePointForm(pointId) {
    selectedPointId = pointId;
    const point = servicePoints.find(item => String(item.id) === String(pointId)) || {};
    const host = el("adminServicePointForm");
    if (!host) return;

    const env = (point && point.environment && typeof point.environment === 'object') ? point.environment : {
      terrain: "unknown",
      exposure: "medium",
      breakwaterShelter: "medium",
      eastWindSensitivity: "medium",
      onshoreWindSensitivity: "medium",
      swellSensitivity: "medium",
      exposureDirection: "unknown"
    };
    const optSel = (val, target) => String(val || "") === String(target) ? 'selected' : '';
    let getSpGearDraft = () => [];

    // 좌측 목록 활성 하이라이트 동기화
    const body = el("adminServicePointsBody");
    if (body) {
      body.querySelectorAll("[data-point-row]").forEach(tr => {
        const isSelected = String(tr.dataset.pointRow) === String(pointId);
        tr.className = `${isSelected ? 'bg-surface-container/70 border-l-4 border-primary' : 'hover:bg-surface-container-low/70'} cursor-pointer transition-colors group`;
        const selBtn = tr.querySelector("[data-service-select-point]");
        if (selBtn) {
          selBtn.className = `px-2 py-1 rounded ${isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container hover:bg-surface-container-high text-on-surface'} font-mono text-[11px] font-semibold transition-colors`;
          selBtn.textContent = isSelected ? '선택됨' : '선택';
        }
      });
    }

    const isNew = !pointId;
    host.innerHTML = `
      <div class="flex flex-col gap-6">
        <!-- Form Header Bar -->
        <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-surface-container-high">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shadow-sm">
              <span class="material-symbols-outlined text-[22px]">edit_location_alt</span>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="font-headline text-lg font-bold text-on-surface">${isNew ? "포인트 신규 등록" : "포인트 상세 및 수정"}</h2>
                <span class="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-mono text-[11px] font-bold">
                  ${isNew ? "신규" : escapeHtml(point.name || "ID: " + point.id)}
                </span>
              </div>
              <p class="text-xs text-secondary mt-0.5">전국 스노클링 및 다이빙 포인트의 GPS 좌표, 시설, 사진을 중앙 동기화합니다.</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary font-mono text-[11px] font-bold">
              <span class="w-2 h-2 rounded-full bg-primary animate-ping"></span>
              서비스 연동
            </span>
          </div>
        </div>

        <!-- Card 1: 기본 정보 및 설명 -->
        <div class="bg-surface-container-lowest p-5 rounded-xl border border-surface-container-high flex flex-col gap-4">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[20px]">info</span>
            <h3 class="font-headline text-sm font-semibold text-on-surface">기본 정보 및 스노클링 가이드</h3>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              포인트명 <span class="text-error font-normal">*</span>
              <input id="spName" value="${escapeHtml(point.name || "")}" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="예: 강문해변">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              유튜브 URL
              <input id="spYoutubeUrl" value="${escapeHtml(point.youtube_url || "")}" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="https://www.youtube.com/watch?v=...">
            </label>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              유튜브 영상 제목
              <input id="spYoutubeTitle" value="${escapeHtml(point.youtube_title || "")}" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="영상 제목 입력">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              찾아가는 길 (접근성)
              <input id="spAccessGuide" value="${escapeHtml(point.access_guide || "")}" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="도보 및 차량 진입 경로">
            </label>
          </div>
          <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
            포인트 특징 요약
            <textarea id="spFeature" rows="2" class="w-full p-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all resize-y" placeholder="수중 지형, 바위 군락, 파도 상태 등">${escapeHtml(point.point_feature || "")}</textarea>
          </label>
          <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
            스노클링 및 다이빙 상세 가이드
            <textarea id="spSnorkeling" rows="2" class="w-full p-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all resize-y" placeholder="수심(m), 어종, 조류, 입수 시기 등 세부 가이드">${escapeHtml(point.snorkeling_info || "")}</textarea>
          </label>
        </div>

        <!-- Card 2: GIS 위치 좌표계 매핑 (Stitch Screen 2 카카오맵 핀 & 검색) -->
        <div class="bg-surface-container-lowest p-5 rounded-xl border border-surface-container-high flex flex-col gap-5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[20px]">explore</span>
              <h3 class="font-headline text-sm font-semibold text-on-surface">GIS 위치 좌표계 매핑</h3>
            </div>
            <span class="font-mono text-[10px] text-secondary bg-surface-container px-2 py-0.5 rounded font-bold">EPSG:4326 (WGS84)</span>
          </div>

          <!-- 메인 포인트 위치 -->
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full bg-error"></span>
                <strong class="text-xs text-on-surface">포인트 메인 위치</strong>
                <span class="text-[11px] text-secondary">(지도 클릭 또는 장소 검색으로 핀 이동)</span>
              </div>
              <span class="font-mono text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px]">satellite_alt</span>
                <span>지도 우측 상단 '스카이뷰' 위성 전환 지원</span>
              </span>
            </div>
            <div class="flex gap-2">
              <div class="relative flex-1">
                <span class="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-secondary">search</span>
                <input id="spMapSearch" placeholder="장소, 지번, 도로명 검색..." class="w-full h-10 pl-9 pr-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary transition-all">
              </div>
              <button type="button" id="spMapSearchBtn" class="px-4 h-10 bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs rounded-lg transition-colors">검색</button>
            </div>
            <div id="spMapContainer" class="relative w-full h-80 rounded-xl overflow-hidden border border-outline-variant/30 bg-surface-container-highest">
              <div class="w-full h-full flex items-center justify-center text-xs text-secondary">카카오맵 로딩 중...</div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="flex flex-col gap-1 font-mono text-[11px] text-secondary font-semibold">
                위도 (LAT)
                <input id="spLat" type="number" step="any" value="${escapeHtml(String(point.lat ?? ""))}" readonly class="w-full h-9 px-3 bg-surface-container-low/70 border border-outline-variant/30 rounded-lg font-mono text-xs text-on-surface cursor-not-allowed">
              </label>
              <label class="flex flex-col gap-1 font-mono text-[11px] text-secondary font-semibold">
                경도 (LNG)
                <input id="spLng" type="number" step="any" value="${escapeHtml(String(point.lng ?? ""))}" readonly class="w-full h-9 px-3 bg-surface-container-low/70 border border-outline-variant/30 rounded-lg font-mono text-xs text-on-surface cursor-not-allowed">
              </label>
            </div>
          </div>

          <!-- 권장 주차 위치 -->
          <div class="flex flex-col gap-2 pt-2 border-t border-surface-container-high">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full bg-primary"></span>
                <strong class="text-xs text-on-surface">권장 주차 위치 (선택)</strong>
                <span class="text-[11px] text-secondary">(네비게이션 연동 안내용)</span>
              </div>
              <span class="font-mono text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px]">satellite_alt</span>
                <span>스카이뷰(위성) 지원</span>
              </span>
            </div>
            <div class="flex gap-2">
              <div class="relative flex-1">
                <span class="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-secondary">local_parking</span>
                <input id="spParkingMapSearch" placeholder="주차 장소 키워드 검색..." class="w-full h-10 pl-9 pr-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary transition-all">
              </div>
              <button type="button" id="spParkingMapSearchBtn" class="px-4 h-10 bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs rounded-lg transition-colors">검색</button>
            </div>
            <div id="spParkingMapContainer" class="relative w-full h-64 rounded-xl overflow-hidden border border-outline-variant/30 bg-surface-container-highest">
              <div class="w-full h-full flex items-center justify-center text-xs text-secondary">카카오 주차맵 로딩 중...</div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="flex flex-col gap-1 font-mono text-[11px] text-secondary font-semibold">
                주차 위도 (LAT)
                <input id="spParkingLat" type="number" step="any" value="${escapeHtml(String(point.parking_lat ?? ""))}" readonly class="w-full h-9 px-3 bg-surface-container-low/70 border border-outline-variant/30 rounded-lg font-mono text-xs text-on-surface cursor-not-allowed">
              </label>
              <label class="flex flex-col gap-1 font-mono text-[11px] text-secondary font-semibold">
                주차 경도 (LNG)
                <input id="spParkingLng" type="number" step="any" value="${escapeHtml(String(point.parking_lng ?? ""))}" readonly class="w-full h-9 px-3 bg-surface-container-low/70 border border-outline-variant/30 rounded-lg font-mono text-xs text-on-surface cursor-not-allowed">
              </label>
            </div>
          </div>
        </div>

        <!-- Card 3: 편의시설 및 인프라 상세 -->
        <div class="bg-surface-container-lowest p-5 rounded-xl border border-surface-container-high flex flex-col gap-4">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[20px]">deck</span>
            <h3 class="font-headline text-sm font-semibold text-on-surface">편의시설 및 인프라 상세</h3>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              주차 정보 (텍스트)
              <input id="spParking" value="${escapeHtml(point.parking || "")}" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="예: 공영주차장 무료">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              화장실
              <input id="spToilet" value="${escapeHtml(point.toilet || "")}" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="예: 상시 개방 남녀구분">
            </label>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              샤워 시설
              <input id="spShower" value="${escapeHtml(point.shower || "")}" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="예: 간이샤워장 유료">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              캠핑 / 차박
              <input id="spCamping" value="${escapeHtml(point.camping || "")}" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="예: 불가 / 지정구역 가능">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              취사 가능 여부
              <input id="spCooking" value="${escapeHtml(point.cooking || "")}" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="예: 화기 사용 금지">
            </label>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              편의시설 태그 (쉼표 구분)
              <textarea id="spFacilities" rows="2" class="w-full p-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all resize-y" placeholder="화장실, 주차장, 편의점, 매점">${escapeHtml(Array.isArray(point.facilities) ? point.facilities.join(", ") : (point.facilities || ""))}</textarea>
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              유의사항 태그 (쉼표 구분)
              <textarea id="spNotes" rows="2" class="w-full p-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all resize-y" placeholder="이안류 주의, 테트라포드 접근 금지">${escapeHtml(Array.isArray(point.notes) ? point.notes.join(", ") : (point.notes || ""))}</textarea>
            </label>
          </div>
        </div>

        <!-- Card 4: 포인트 해양 환경 설정 (기상 지수 및 안전 알고리즘 연동) -->
        <div class="bg-surface-container-lowest p-5 rounded-xl border border-surface-container-high flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[20px]">waves</span>
              <h3 class="font-headline text-sm font-semibold text-on-surface">포인트 해양 환경 설정</h3>
            </div>
            <span class="font-mono text-[10px] text-secondary bg-surface-container px-2 py-0.5 rounded font-bold">기상 지수 및 안전 알고리즘 연동</span>
          </div>
          <p class="text-xs text-secondary -mt-1">해당 포인트의 지형, 파도 노출, 방파제 차폐, 바람/너울 민감도를 설정하여 스노클링 안전 지수를 정밀 산출합니다.</p>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              지형 특성
              <select id="spEnvTerrain" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all">
                <option value="unknown" ${optSel(env.terrain, "unknown")}>미설정/기타</option>
                <option value="sand" ${optSel(env.terrain, "sand")}>모래 (백사장)</option>
                <option value="rock" ${optSel(env.terrain, "rock")}>암반 (갯바위)</option>
                <option value="harbor" ${optSel(env.terrain, "harbor")}>방파제 (항만)</option>
                <option value="mixed" ${optSel(env.terrain, "mixed")}>혼합 지형</option>
              </select>
            </label>

            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              외해 노출도
              <select id="spEnvExposure" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all">
                <option value="low" ${optSel(env.exposure, "low")}>낮음 (안전한 내만)</option>
                <option value="medium" ${optSel(env.exposure, "medium")}>중간 (일반 연안)</option>
                <option value="high" ${optSel(env.exposure, "high")}>높음 (외해 직면/먼바다)</option>
              </select>
            </label>

            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              방파제 / 지형 차폐
              <select id="spEnvShelter" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all">
                <option value="low" ${optSel(env.breakwaterShelter, "low")}>낮음 (차폐 없음)</option>
                <option value="medium" ${optSel(env.breakwaterShelter, "medium")}>중간 (부분 차폐)</option>
                <option value="high" ${optSel(env.breakwaterShelter, "high")}>높음 (방파제 완벽 보호)</option>
              </select>
            </label>

            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              유입풍 민감도
              <select id="spEnvEastWind" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all">
                <option value="low" ${optSel(env.eastWindSensitivity || env.onshoreWindSensitivity, "low")}>낮음 (바람 영향 적음)</option>
                <option value="medium" ${optSel(env.eastWindSensitivity || env.onshoreWindSensitivity, "medium")}>중간 (보통)</option>
                <option value="high" ${optSel(env.eastWindSensitivity || env.onshoreWindSensitivity, "high")}>높음 (바람에 취약)</option>
              </select>
            </label>

            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              너울 민감도
              <select id="spEnvSwell" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all">
                <option value="low" ${optSel(env.swellSensitivity, "low")}>낮음 (너울 영향 적음)</option>
                <option value="medium" ${optSel(env.swellSensitivity, "medium")}>중간 (보통)</option>
                <option value="high" ${optSel(env.swellSensitivity, "high")}>높음 (너울성 파도 위험)</option>
              </select>
            </label>

            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              바다 노출 방향
              <select id="spEnvDirection" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all">
                <option value="unknown" ${optSel(env.exposureDirection, "unknown")}>미설정</option>
                <option value="N" ${optSel(env.exposureDirection, "N")}>북 (N)</option>
                <option value="NE" ${optSel(env.exposureDirection, "NE")}>북동 (NE)</option>
                <option value="E" ${optSel(env.exposureDirection, "E")}>동 (E)</option>
                <option value="SE" ${optSel(env.exposureDirection, "SE")}>남동 (SE)</option>
                <option value="S" ${optSel(env.exposureDirection, "S")}>남 (S)</option>
                <option value="SW" ${optSel(env.exposureDirection, "SW")}>남서 (SW)</option>
                <option value="W" ${optSel(env.exposureDirection, "W")}>서 (W)</option>
                <option value="NW" ${optSel(env.exposureDirection, "NW")}>북서 (NW)</option>
              </select>
            </label>
          </div>
        </div>

        <!-- Card 5: 포인트 필요용품 (준비물) 설정 -->
        <div class="bg-surface-container-lowest p-5 rounded-xl border border-surface-container-high flex flex-col gap-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[20px]">backpack</span>
              <h3 class="font-headline text-sm font-semibold text-on-surface">포인트 필요용품 (준비물) 설정</h3>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" id="spAddGearCustomBtn" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs transition-colors">
                <span class="material-symbols-outlined text-[16px]">add</span>
                <span>직접 추가</span>
              </button>
              ${!isNew ? `
                <button type="button" id="spSaveGearOnlyBtn" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-xs transition-colors">
                  <span class="material-symbols-outlined text-[16px]">save</span>
                  <span>준비물 저장</span>
                </button>
              ` : ""}
            </div>
          </div>
          <p class="text-xs text-secondary -mt-1">해당 포인트에 방문하는 스노클러/다이버에게 추천할 필수 장비 및 안전용품을 설정합니다.</p>

          <!-- 빠른 프리셋 추가 바 -->
          <div class="p-3 bg-surface-container-low/60 rounded-lg border border-outline-variant/30 flex flex-col gap-2">
            <span class="text-[11px] font-semibold text-on-surface-variant font-mono">기본 준비물 빠른 추가:</span>
            <div class="flex flex-wrap gap-1.5" id="spGearPresets">
              <button type="button" data-gear-preset="🤿,스노클,숨을 편하게 쉴 수 있는 스노클" class="px-2.5 py-1 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition-colors flex items-center gap-1">🤿 스노클</button>
              <button type="button" data-gear-preset="🥽,마스크,시야 확보용 물안경 또는 다이빙 마스크" class="px-2.5 py-1 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition-colors flex items-center gap-1">🥽 마스크</button>
              <button type="button" data-gear-preset="👟,아쿠아슈즈,바위나 성게 등으로부터 발을 보호하는 신발" class="px-2.5 py-1 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition-colors flex items-center gap-1">👟 아쿠아슈즈</button>
              <button type="button" data-gear-preset="🧴,선크림,해양 생태계 보호 리프 세이프 선크림" class="px-2.5 py-1 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition-colors flex items-center gap-1">🧴 선크림</button>
              <button type="button" data-gear-preset="🦺,구명조끼,안전을 위한 부력 보조 조끼" class="px-2.5 py-1 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition-colors flex items-center gap-1">🦺 구명조끼</button>
              <button type="button" data-gear-preset="⛱️,그늘막,자외선 차단 및 휴식 공간" class="px-2.5 py-1 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition-colors flex items-center gap-1">⛱️ 그늘막</button>
              <button type="button" data-gear-preset="🏊,핀 (오리발),추진력 및 조류 대처용 핀" class="px-2.5 py-1 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition-colors flex items-center gap-1">🏊 핀 (오리발)</button>
            </div>
          </div>

          <!-- 등록된 준비물 목록 -->
          <div id="spGearList" class="flex flex-col gap-2.5">
            <div class="py-6 text-center text-xs text-secondary">필요용품을 불러오는 중...</div>
          </div>
          <div id="spGearMessage" class="text-xs text-secondary min-h-[16px]"></div>
        </div>

        <!-- Card 6: 사진 및 현장 갤러리 관리 -->
        ${!isNew ? `
          <div class="bg-surface-container-lowest p-5 rounded-xl border border-surface-container-high flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-primary text-[20px]">photo_library</span>
                <h3 class="font-headline text-sm font-semibold text-on-surface">사진 및 현장 갤러리 관리</h3>
              </div>
              <label class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs cursor-pointer transition-colors">
                <span class="material-symbols-outlined text-[16px]">add_photo_alternate</span>
                <span>사진 추가</span>
                <input id="spPhotoInput" type="file" accept="image/*" multiple class="hidden">
              </label>
            </div>
            <div id="spPhotoGrid" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <span class="text-xs text-secondary py-4 col-span-full text-center">사진을 불러오는 중...</span>
            </div>
          </div>
        ` : ""}

        <!-- Sticky Bottom Action Bar -->
        <div class="sticky bottom-4 z-20 bg-surface-container-lowest/95 backdrop-blur-md p-4 rounded-xl border border-surface-container-high shadow-lg flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            ${!isNew ? `
              <button type="button" class="px-3 py-2 rounded-lg bg-error-container/40 hover:bg-error-container text-error font-headline text-xs font-semibold flex items-center gap-1.5 transition-colors" data-service-delete-this-point>
                <span class="material-symbols-outlined text-[16px]">delete_forever</span>
                <span>포인트 삭제</span>
              </button>
            ` : ""}
            <button type="button" class="px-3 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-md text-xs transition-colors" data-service-cancel-point>
              초기화 / 닫기
            </button>
          </div>
          <div class="flex items-center gap-3">
            <span id="spSaveFeedbackText" class="text-xs font-semibold text-primary transition-all"></span>
            <button type="button" class="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-headline text-xs font-semibold shadow transition-all" data-service-save-point>
              <span class="material-symbols-outlined text-[18px]">save</span>
              <span id="spSaveBtnLabel">${isNew ? "신규 등록" : "저장하기"}</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // 1. 카카오맵 초기화
    function initSpMap() {
      if (!window.kakao?.maps) return;
      const initLat = Number(el("spLat").value) || 36.5;
      const initLng = Number(el("spLng").value) || 127.5;
      const container = document.getElementById("spMapContainer");
      if (!container) return;
      container.innerHTML = "";
      const map = new kakao.maps.Map(container, { center: new kakao.maps.LatLng(initLat, initLng), level: 7 });
      map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
      map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      const marker = new kakao.maps.Marker({ position: new kakao.maps.LatLng(initLat, initLng), draggable: true, map: point.lat ? map : null });
      if (point.lat) marker.setMap(map);
      const updateLatLng = (latlng) => {
        el("spLat").value = latlng.getLat().toFixed(7);
        el("spLng").value = latlng.getLng().toFixed(7);
        marker.setPosition(latlng);
        marker.setMap(map);
      };
      kakao.maps.event.addListener(map, "click", (e) => updateLatLng(e.latLng));
      kakao.maps.event.addListener(marker, "dragend", () => updateLatLng(marker.getPosition()));

      // 장소 검색
      if (kakao.maps.services) {
        const ps = new kakao.maps.services.Places();
        const doSearch = (query) => {
          if (!query) return;
          ps.keywordSearch(query, (data, status) => {
            if (status === kakao.maps.services.Status.OK && data.length) {
              const latlng = new kakao.maps.LatLng(data[0].y, data[0].x);
              map.setCenter(latlng);
              map.setLevel(4);
              updateLatLng(latlng);
            } else {
              alert("검색 결과가 없습니다.");
            }
          });
        };
        const searchBtn = el("spMapSearchBtn");
        if (searchBtn) searchBtn.onclick = () => doSearch(el("spMapSearch").value.trim());
        const searchInput = el("spMapSearch");
        if (searchInput) searchInput.onkeydown = (e) => { if (e.key === "Enter") doSearch(searchInput.value.trim()); };
      }

      // 주차 지도
      const pInitLat = Number(el("spParkingLat").value) || initLat;
      const pInitLng = Number(el("spParkingLng").value) || initLng;
      const pContainer = document.getElementById("spParkingMapContainer");
      if (!pContainer) return;
      pContainer.innerHTML = "";
      const pMap = new kakao.maps.Map(pContainer, { center: new kakao.maps.LatLng(pInitLat, pInitLng), level: 7 });
      pMap.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
      pMap.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      const pMarker = new kakao.maps.Marker({ position: new kakao.maps.LatLng(pInitLat, pInitLng), draggable: true });
      if (point.parking_lat) pMarker.setMap(pMap);
      const updateParkingLatLng = (latlng) => {
        el("spParkingLat").value = latlng.getLat().toFixed(7);
        el("spParkingLng").value = latlng.getLng().toFixed(7);
        pMarker.setPosition(latlng);
        pMarker.setMap(pMap);
      };
      kakao.maps.event.addListener(pMap, "click", (e) => updateParkingLatLng(e.latLng));
      kakao.maps.event.addListener(pMarker, "dragend", () => updateParkingLatLng(pMarker.getPosition()));

      if (kakao.maps.services) {
        const pPs = new kakao.maps.services.Places();
        const doSearchParking = (query) => {
          if (!query) return;
          pPs.keywordSearch(query, (data, status) => {
            if (status === kakao.maps.services.Status.OK && data.length) {
              const latlng = new kakao.maps.LatLng(data[0].y, data[0].x);
              pMap.setCenter(latlng);
              pMap.setLevel(4);
              updateParkingLatLng(latlng);
            } else {
              alert("검색 결과가 없습니다.");
            }
          });
        };
        const pSearchBtn = el("spParkingMapSearchBtn");
        if (pSearchBtn) pSearchBtn.onclick = () => doSearchParking(el("spParkingMapSearch").value.trim());
        const pSearchInput = el("spParkingMapSearch");
        if (pSearchInput) pSearchInput.onkeydown = (e) => { if (e.key === "Enter") doSearchParking(pSearchInput.value.trim()); };
      }
    }

    if (window.kakao?.maps) {
      kakao.maps.load(initSpMap);
    } else {
      let tries = 0;
      const t = setInterval(() => {
        tries++;
        if (window.kakao?.maps) {
          clearInterval(t);
          kakao.maps.load(initSpMap);
        } else if (tries > 20) {
          clearInterval(t);
        }
      }, 300);
    }

    // 2. 취소 / 삭제 / 저장 버튼 바인딩
    host.querySelector("[data-service-cancel-point]").onclick = () => {
      if (pointId) showServicePointForm(pointId);
      else showServicePointForm(null);
    };

    const delThisBtn = host.querySelector("[data-service-delete-this-point]");
    if (delThisBtn) {
      delThisBtn.onclick = () => deleteServicePoint(pointId);
    }

    host.querySelector("[data-service-save-point]").onclick = async () => {
      const name = el("spName").value.trim();
      if (!name) {
        serviceMessage("포인트명을 입력해 주세요.", true);
        el("spName").focus();
        return;
      }
      const saveBtn = host.querySelector("[data-service-save-point]");
      const saveLabel = host.querySelector("#spSaveBtnLabel");
      const prevLabel = saveLabel ? saveLabel.textContent : (isNew ? "신규 등록" : "저장하기");
      if (saveBtn) saveBtn.disabled = true;
      if (saveLabel) saveLabel.textContent = "저장 중...";
      try {
        const envEastWind = el("spEnvEastWind")?.value || "medium";
        const envPayload = {
          terrain: el("spEnvTerrain")?.value || "unknown",
          exposure: el("spEnvExposure")?.value || "medium",
          breakwaterShelter: el("spEnvShelter")?.value || "medium",
          eastWindSensitivity: envEastWind,
          onshoreWindSensitivity: envEastWind,
          swellSensitivity: el("spEnvSwell")?.value || "medium",
          exposureDirection: el("spEnvDirection")?.value || "unknown"
        };
        const payload = {
          id: pointId,
          region_id: serviceRegionId,
          name: name,
          lat: el("spLat").value,
          lng: el("spLng").value,
          parking_lat: el("spParkingLat").value || null,
          parking_lng: el("spParkingLng").value || null,
          point_feature: el("spFeature").value.trim(),
          snorkeling_info: el("spSnorkeling").value.trim(),
          parking: el("spParking").value.trim(),
          toilet: el("spToilet").value.trim(),
          shower: el("spShower").value.trim(),
          camping: el("spCamping").value.trim(),
          cooking: el("spCooking").value.trim(),
          access_guide: el("spAccessGuide").value.trim(),
          facilities: el("spFacilities").value,
          notes: el("spNotes").value,
          youtube_url: el("spYoutubeUrl").value.trim() || null,
          youtube_title: el("spYoutubeTitle").value.trim() || null,
          environment: envPayload
        };
        const saved = await global.SNORKYAdmin.savePointAdmin(payload);
        const targetId = saved?.id || pointId;
        if (targetId && global.SNORKYAdmin?.savePointGearAdmin && typeof getSpGearDraft === "function") {
          try {
            const currentDraft = getSpGearDraft();
            if (currentDraft && currentDraft.length > 0) {
              await global.SNORKYAdmin.savePointGearAdmin(targetId, currentDraft);
            }
          } catch (gearErr) {
            console.warn("[SNORKY Admin] 포인트 저장 후 필요용품 동기화 오류", gearErr);
          }
        }
        servicePoints = await global.SNORKYAdmin.loadPointsAdmin();
        renderServicePoints();
        showServicePointForm(targetId);
        const completionMsg = isNew ? `'${name}' 포인트 신규 등록이 완료되었습니다!` : `'${name}' 포인트 정보가 저장 완료되었습니다!`;
        serviceMessage(completionMsg);
      } catch (error) {
        if (saveBtn) saveBtn.disabled = false;
        if (saveLabel) saveLabel.textContent = prevLabel;
        serviceMessage(error?.message || "포인트를 저장하지 못했습니다.", true);
      }
    };

    // 3. 필요용품 (준비물) 관리 렌더링 및 이벤트
    let spGearDraft = [];
    getSpGearDraft = () => spGearDraft;
    const gearListEl = host.querySelector("#spGearList");
    const gearMsgEl = host.querySelector("#spGearMessage");
    const setGearMsg = (txt, isErr = false) => {
      if (gearMsgEl) {
        gearMsgEl.textContent = txt;
        gearMsgEl.className = `text-xs ${isErr ? 'text-error' : 'text-primary'} font-medium transition-colors`;
      }
    };

    function renderSpGearList() {
      if (!gearListEl) return;
      if (!spGearDraft.length) {
        gearListEl.innerHTML = '<div class="py-6 text-center text-xs text-secondary bg-surface-container-low/40 rounded-lg border border-dashed border-outline-variant/30">등록된 필요용품이 없습니다. 상단 빠른 추가 또는 직접 추가를 눌러보세요.</div>';
        return;
      }
      gearListEl.innerHTML = spGearDraft.map((item, idx) => `
        <div class="p-3 bg-surface-container-low rounded-lg border border-outline-variant/30 flex flex-col gap-2 group" data-gear-idx="${idx}">
          <div class="flex items-center gap-2">
            <input type="text" class="w-12 h-9 px-1 text-center bg-surface-container-lowest border border-outline-variant/40 rounded-md text-sm text-on-surface" data-gear-prop="icon" value="${escapeHtml(item.icon || "🎒")}" title="아이콘/이모지">
            <input type="text" class="flex-1 h-9 px-3 bg-surface-container-lowest border border-outline-variant/40 rounded-md text-xs text-on-surface font-medium" data-gear-prop="item_name" value="${escapeHtml(item.item_name || "")}" placeholder="품목명 (예: 스노클, 아쿠아슈즈)">
            <label class="inline-flex items-center gap-1.5 text-xs text-on-surface-variant font-mono cursor-pointer select-none px-2 py-1 bg-surface-container-lowest rounded-md border border-outline-variant/30">
              <input type="checkbox" class="w-3.5 h-3.5 rounded border-outline-variant text-primary focus:ring-0" data-gear-prop="is_active" ${item.is_active !== false ? 'checked' : ''}>
              <span>활성</span>
            </label>
            <button type="button" class="w-9 h-9 rounded-md hover:bg-error-container/40 text-error flex items-center justify-center transition-colors" data-gear-del="${idx}" title="삭제">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
          <div class="flex flex-col sm:flex-row items-center gap-2">
            <input type="text" class="flex-1 w-full h-8 px-3 bg-surface-container-lowest border border-outline-variant/40 rounded-md text-xs text-on-surface" data-gear-prop="description" value="${escapeHtml(item.description || "")}" placeholder="설명 / 추천 이유 (예: 성게와 암반이 많아 발 보호 필수)">
            <input type="text" class="sm:w-2/5 w-full h-8 px-3 bg-surface-container-lowest border border-outline-variant/40 rounded-md text-xs text-on-surface font-mono" data-gear-prop="affiliate_url" value="${escapeHtml(item.affiliate_url || "")}" placeholder="추천 구매 URL (선택, http/https)">
          </div>
        </div>
      `).join("");

      gearListEl.querySelectorAll("[data-gear-prop]").forEach(input => {
        input.oninput = () => {
          const row = input.closest("[data-gear-idx]");
          if (!row) return;
          const idx = Number(row.dataset.gearIdx);
          const prop = input.dataset.gearProp;
          spGearDraft[idx][prop] = prop === "is_active" ? input.checked : input.value;
        };
      });

      gearListEl.querySelectorAll("[data-gear-del]").forEach(btn => {
        btn.onclick = () => {
          const idx = Number(btn.dataset.gearDel);
          spGearDraft.splice(idx, 1);
          renderSpGearList();
        };
      });
    }

    const presetBox = host.querySelector("#spGearPresets");
    if (presetBox) {
      presetBox.querySelectorAll("[data-gear-preset]").forEach(btn => {
        btn.onclick = () => {
          const [icon, name, desc] = btn.dataset.gearPreset.split(",");
          const dup = spGearDraft.some(g => String(g.item_name || "").trim() === name.trim());
          if (dup) {
            setGearMsg(`'${name}' 품목이 이미 추가되어 있습니다.`, true);
            return;
          }
          spGearDraft.push({
            icon: icon || "🎒",
            item_name: name || "",
            description: desc || "",
            is_active: true,
            affiliate_url: ""
          });
          renderSpGearList();
          setGearMsg(`'${name}' 준비물을 추가했습니다.`);
        };
      });
    }

    const addCustomBtn = host.querySelector("#spAddGearCustomBtn");
    if (addCustomBtn) {
      addCustomBtn.onclick = () => {
        spGearDraft.push({
          icon: "🎒",
          item_name: "",
          description: "",
          is_active: true,
          affiliate_url: ""
        });
        renderSpGearList();
        setGearMsg("새 준비물 항목을 추가했습니다. 품목명을 입력하세요.");
      };
    }

    const saveGearOnlyBtn = host.querySelector("#spSaveGearOnlyBtn");
    if (saveGearOnlyBtn) {
      saveGearOnlyBtn.onclick = async () => {
        if (!pointId) return;
        try {
          setGearMsg("준비물 저장 중...");
          const savedGear = await global.SNORKYAdmin.savePointGearAdmin(pointId, spGearDraft);
          spGearDraft = savedGear;
          renderSpGearList();
          setGearMsg("필요용품 설정이 성공적으로 저장되었습니다!");
          setTimeout(() => setGearMsg(""), 3000);
        } catch (err) {
          setGearMsg(err?.message || "준비물 저장에 실패했습니다.", true);
        }
      };
    }

    if (pointId && global.SNORKYAdmin?.loadPointGearAdmin) {
      global.SNORKYAdmin.loadPointGearAdmin(pointId).then(items => {
        spGearDraft = (items || []).map(it => ({ ...it }));
        renderSpGearList();
      }).catch(err => {
        console.warn("[Admin] 필요용품 로드 실패", err);
        if (gearListEl) gearListEl.innerHTML = '<div class="py-4 text-center text-xs text-error">필요용품을 불러오지 못했습니다.</div>';
      });
    } else {
      renderSpGearList();
    }

    // 4. 사진 관리 렌더링
    if (!isNew) {
      const pid = String(pointId);
      function renderSpPhotoGrid() {
        const ptItem = servicePoints.find(item => String(item.id) === pid) || {};
        const imgs = ptItem.images || [];
        const grid = document.getElementById("spPhotoGrid");
        if (!grid) return;
        if (!imgs.length) {
          grid.innerHTML = '<div class="col-span-full py-4 text-center text-xs text-secondary">등록된 현장 사진이 없습니다. [사진 추가]를 눌러 업로드하세요.</div>';
          return;
        }
        grid.innerHTML = imgs.map(img => {
          const sb2 = window.getSnorkySupabase?.();
          const raw = img.storage_path || "";
          const url = (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("./") || raw.startsWith("/"))
            ? raw
            : (sb2?.storage.from("point-images").getPublicUrl(raw).data?.publicUrl || raw);
          return `
            <div class="relative group rounded-xl overflow-hidden bg-surface-container aspect-video shadow-xs border ${img.is_primary ? 'border-primary ring-2 ring-primary/40' : 'border-surface-container-high'}">
              <img src="${escapeHtml(url)}" class="w-full h-full object-cover">
              ${img.is_primary ? '<div class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-primary text-on-primary font-mono text-[10px] font-bold shadow">대표</div>' : ''}
              <div class="absolute inset-0 bg-inverse-surface/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                ${!img.is_primary ? `<button type="button" class="px-2 py-1 rounded bg-surface-container-lowest text-on-surface font-mono text-[10px] font-semibold hover:bg-surface-container" data-sp-primary="${escapeHtml(img.id)}">대표설정</button>` : ''}
                <button type="button" class="p-1 rounded-full bg-error text-on-error hover:bg-on-error-container" title="사진 삭제" data-sp-delete="${escapeHtml(img.id)}">
                  <span class="material-symbols-outlined text-[14px]">delete</span>
                </button>
              </div>
            </div>
          `;
        }).join("");

        grid.querySelectorAll("[data-sp-primary]").forEach(btn => {
          btn.onclick = async () => {
            try {
              await global.SNORKYAdmin.primaryPointPhotoAdmin(pid, btn.dataset.spPrimary);
              servicePoints = await global.SNORKYAdmin.loadPointsAdmin();
              renderSpPhotoGrid();
              serviceMessage("대표 사진을 변경했습니다.");
            } catch (e) {
              serviceMessage(e?.message || "대표 지정 실패", true);
            }
          };
        });

        grid.querySelectorAll("[data-sp-delete]").forEach(btn => {
          btn.onclick = async () => {
            if (!global.confirm("이 사진을 삭제할까요?")) return;
            try {
              await global.SNORKYAdmin.deletePointPhotoAdmin(pid, btn.dataset.spDelete);
              servicePoints = await global.SNORKYAdmin.loadPointsAdmin();
              renderSpPhotoGrid();
              serviceMessage("사진을 삭제했습니다.");
            } catch (e) {
              serviceMessage(e?.message || "삭제 실패", true);
            }
          };
        });
      }

      renderSpPhotoGrid();

      document.getElementById("spPhotoInput")?.addEventListener("change", async (event) => {
        const files = [...event.target.files];
        if (!files.length) return;
        try {
          serviceMessage("사진을 업로드하는 중입니다...");
          await global.SNORKYAdmin.uploadPointPhotoAdmin(pid, files);
          servicePoints = await global.SNORKYAdmin.loadPointsAdmin();
          renderSpPhotoGrid();
          serviceMessage("사진을 성공적으로 업로드했습니다.");
        } catch (e) {
          serviceMessage(e?.message || "업로드 실패", true);
        }
        event.target.value = "";
      });
    }
  }

  async function deleteServicePoint(id) {
    if (!global.confirm("이 포인트를 삭제할까요? 관련 정보가 모두 삭제됩니다.")) return;
    try {
      await global.SNORKYAdmin.deletePointAdmin(id);
      servicePoints = servicePoints.filter(item => String(item.id) !== String(id));
      renderServicePoints();
      const remainPts = servicePoints.filter(p => String(p.region_id) === String(serviceRegionId));
      showServicePointForm(remainPts[0]?.id || null);
      serviceMessage("포인트를 삭제했습니다.");
    } catch (error) {
      serviceMessage(error?.message || "포인트를 삭제하지 못했습니다.", true);
    }
  }

  /* ==========================================================================
     Tab 3: 실내 다이빙센터 관리 (Stitch Screen 4 UI - Master-Detail Split)
     ========================================================================== */
  async function openServiceIndoor() {
    const body = el("adminServiceIndoorBody");
    if (!body) return;
    body.innerHTML = '<div class="p-6 text-center text-secondary text-sm">실내 다이빙센터 목록을 불러오는 중...</div>';
    try {
      serviceCenters = await global.SNORKYAdmin.loadIndoorCentersAdmin();
      renderServiceIndoor();
      if (serviceCenters.length > 0) {
        showServiceIndoorForm(serviceCenters[0].id);
      } else {
        showServiceIndoorForm(null);
      }
    } catch (error) {
      body.innerHTML = '<div class="p-6 text-center text-error text-sm">목록을 불러오지 못했습니다.</div>';
      serviceMessage(error?.message || "조회 오류", true);
    }
  }

  function renderServiceIndoor() {
    const body = el("adminServiceIndoorBody");
    if (!body) return;

    // 상단 뱃지 갱신
    const badge = el("indoorCountBadge");
    if (badge) badge.textContent = `${serviceCenters.length}개`;

    // 상단 신규 센터 등록 버튼
    const indoorSection = document.querySelector('[data-admin-panel="indoor"]');
    if (indoorSection) {
      const addBtn = indoorSection.querySelector("[data-service-add-indoor]");
      if (addBtn) addBtn.onclick = () => showServiceIndoorForm(null);
    }

    // 좌측 센터 카드 스트림 렌더링 (Stitch Screen 4 Card Stream Layout)
    if (!serviceCenters.length) {
      body.innerHTML = '<div class="p-8 text-center text-secondary text-sm">등록된 실내 다이빙센터가 없습니다.</div>';
    } else {
      body.innerHTML = serviceCenters.map(center => {
        const isSelected = String(center.id) === String(selectedCenterId);
        const isDeep = center.max_depth && Number(center.max_depth) >= 20;
        const statusChip = center.status === "closed" ? '<span class="px-2 py-0.5 rounded-full font-mono text-[10px] bg-error-container/40 text-error font-bold">휴장</span>'
          : center.status === "check_needed" ? '<span class="px-2 py-0.5 rounded-full font-mono text-[10px] bg-surface-container-high text-secondary font-bold">확인필요</span>'
          : '<span class="px-2 py-0.5 rounded-full font-mono text-[10px] bg-surface-container text-primary font-bold">운영중</span>';
        const visibilityChip = center.is_active === true
          ? '<span class="px-2 py-0.5 rounded-full font-mono text-[10px] bg-primary/10 text-primary font-bold">공개</span>'
          : '<span class="px-2 py-0.5 rounded-full font-mono text-[10px] bg-surface-container-high text-secondary font-bold">비공개</span>';

        return `
          <div class="p-3.5 ${isSelected ? 'bg-surface-container/70 border-l-4 border-primary' : 'hover:bg-surface-container-low'} flex items-center justify-between cursor-pointer transition-colors" data-center-card="${escapeHtml(center.id)}">
            <div class="flex items-start gap-3 pl-1 min-w-0">
              <div class="w-10 h-10 rounded-lg ${isDeep ? 'bg-primary-container/20 text-primary' : 'bg-surface-container text-secondary'} flex items-center justify-center flex-shrink-0 mt-0.5">
                <span class="material-symbols-outlined text-[20px]">${isDeep ? 'scuba_diving' : 'pool'}</span>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-headline text-sm font-semibold text-on-surface truncate">${escapeHtml(center.name)}</span>
                  <span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-surface-container-high text-secondary uppercase font-bold">${escapeHtml(center.region || "-")}</span>
                  ${isDeep ? `<span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-primary/10 text-primary font-bold">${center.max_depth}m DEEP</span>` : ''}
                </div>
                <div class="flex items-center gap-3 mt-1 text-secondary font-mono text-xs">
                  <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">height</span> ${center.max_depth || "-"}m</span>
                  <span class="truncate max-w-[120px]">${escapeHtml(center.sub_region || center.address || "-")}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              ${visibilityChip}
              ${statusChip}
              <span class="material-symbols-outlined text-secondary/40 text-[18px]">chevron_right</span>
            </div>
          </div>
        `;
      }).join("");

      body.querySelectorAll("[data-center-card]").forEach(card => {
        card.addEventListener("click", () => {
          showServiceIndoorForm(card.dataset.centerCard);
        });
      });
    }

    // 센터 검색창 바인딩
    const searchInput = el("indoorCenterSearchInput");
    if (searchInput) {
      searchInput.oninput = (e) => {
        const query = e.target.value.toLowerCase().trim();
        body.querySelectorAll("[data-center-card]").forEach(card => {
          const text = card.innerText.toLowerCase();
          card.style.display = text.includes(query) ? "" : "none";
        });
      };
    }
  }

  function geocodeServiceIndoorAddress(address) {
    return new Promise((resolve, reject) => {
      const query = String(address || "").trim();
      if (!query) { reject(new Error("주소를 입력해 주세요.")); return; }
      const run = () => {
        if (!window.kakao?.maps?.services?.Geocoder) { reject(new Error("Kakao 주소 검색을 사용할 수 없습니다.")); return; }
        const geocoder = new kakao.maps.services.Geocoder();
        geocoder.addressSearch(query, (result, status) => {
          if (status === kakao.maps.services.Status.OK && result?.length) {
            const lat = Number(result[0].y), lng = Number(result[0].x);
            if (Number.isFinite(lat) && Number.isFinite(lng)) { resolve({ lat, lng }); return; }
          }
          reject(new Error("주소를 좌표로 변환하지 못했습니다. 주소를 확인해 주세요."));
        });
      };
      if (window.kakao?.maps?.services?.Geocoder) run();
      else if (window.kakao?.maps?.load) window.kakao.maps.load(run);
      else reject(new Error("Kakao 지도 서비스를 불러오지 못했습니다."));
    });
  }

  function showServiceIndoorForm(centerId) {
    selectedCenterId = centerId;
    const center = serviceCenters.find(item => String(item.id) === String(centerId)) || {};
    const host = el("adminServiceIndoorForm");
    if (!host) return;

    // 좌측 카드 목록 활성 상태 동기화
    const body = el("adminServiceIndoorBody");
    if (body) {
      body.querySelectorAll("[data-center-card]").forEach(card => {
        const isSelected = String(card.dataset.centerCard) === String(centerId);
        card.className = `p-3.5 ${isSelected ? 'bg-surface-container/70 border-l-4 border-primary' : 'hover:bg-surface-container-low'} flex items-center justify-between cursor-pointer transition-colors`;
      });
    }

    const isNew = !centerId;
    const statusMap = { "운영중": "active", "확인필요": "check_needed", "휴장": "closed" };
    const statusVal = statusMap[center.status] || center.status || "active";

    host.innerHTML = `
      <div class="flex flex-col gap-6">
        <!-- Editor Header Bar -->
        <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-surface-container-high">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shadow-sm">
              <span class="material-symbols-outlined text-[22px]">pool</span>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="font-headline text-lg font-bold text-on-surface">${isNew ? "실내센터 신규 등록" : escapeHtml(center.name)}</h2>
                <span class="font-mono text-[11px] px-2 py-0.5 rounded-full bg-surface-container-highest text-primary font-bold">
                  ${isNew ? "신규" : `ID: ${escapeHtml(center.id)}`}
                </span>
              </div>
              <p class="text-xs text-secondary mt-0.5">전국 실내 다이빙풀 규격, 수심, 예약 및 시설 정보를 관리합니다.</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 font-mono text-xs text-on-surface font-semibold cursor-pointer transition-colors shadow-sm">
              <input id="siIsActive" type="checkbox" class="w-4 h-4 rounded border-outline-variant text-primary focus:ring-0"${center.is_active === true ? " checked" : ""}>
              <span>사용자 화면에 공개</span>
            </label>
            ${center.homepage ? `
              <a href="${escapeHtml(center.homepage)}" target="_blank" rel="noopener" class="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-mono text-xs flex items-center gap-1 transition-colors">
                <span class="material-symbols-outlined text-[15px]">open_in_new</span>
                <span>공식 웹페이지</span>
              </a>
            ` : ""}
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary font-mono text-[11px] font-bold">
              <span class="w-2 h-2 rounded-full bg-primary animate-ping"></span>
              LIVE DATA
            </span>
          </div>
        </div>

        <!-- Section 1: 센터 기본 정보 -->
        <div class="bg-surface-container-lowest p-5 rounded-xl border border-surface-container-high flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[20px]">badge</span>
              <h3 class="font-headline text-sm font-bold text-on-surface">01. 센터 기본 정보</h3>
            </div>
            <span class="font-mono text-[11px] text-secondary font-medium">필수 정보 항목</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold md:col-span-2">
              센터 공식 명칭 <span class="text-error font-normal">*</span>
              <input id="siName" value="${escapeHtml(center.name || "")}" class="w-full h-10 px-3.5 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="예: 딥스테이션, 남부대학교 시립국제수영장">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              광역 지역 (시/도)
              <input id="siRegion" value="${escapeHtml(center.region || "")}" class="w-full h-10 px-3.5 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="예: 경기, 서울, 강원">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              세부 지역 (구/군)
              <input id="siSubRegion" value="${escapeHtml(center.sub_region || "")}" class="w-full h-10 px-3.5 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="예: 용인시 처인구">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold md:col-span-2">
              도로명 주소
              <input id="siAddress" value="${escapeHtml(center.address || "")}" class="w-full h-10 px-3.5 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="지번 또는 도로명 주소">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              위도 (Latitude) <span class="font-normal text-secondary font-mono text-[10px]">WGS84</span>
              <input id="siLat" type="number" step="any" value="${escapeHtml(String(center.lat ?? ""))}" class="w-full h-10 px-3.5 bg-surface-container-low border border-outline-variant/40 rounded-lg font-mono text-xs text-on-surface focus:outline-none focus:border-primary transition-all">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              경도 (Longitude) <span class="font-normal text-secondary font-mono text-[10px]">WGS84</span>
              <input id="siLng" type="number" step="any" value="${escapeHtml(String(center.lng ?? ""))}" class="w-full h-10 px-3.5 bg-surface-container-low border border-outline-variant/40 rounded-lg font-mono text-xs text-on-surface focus:outline-none focus:border-primary transition-all">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              대표 전화번호
              <input id="siPhone" value="${escapeHtml(center.phone || "")}" class="w-full h-10 px-3.5 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="예: 031-000-0000">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              공식 웹사이트 URL
              <input id="siHomepage" value="${escapeHtml(center.homepage || "")}" class="w-full h-10 px-3.5 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-mono text-xs focus:outline-none focus:border-primary transition-all" placeholder="https://...">
            </label>
          </div>
        </div>

        <!-- Section 2: 다이빙 시설 스펙 (Bento Cards & Specs) -->
        <div class="bg-surface-container-lowest p-5 rounded-xl border border-surface-container-high flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[20px]">water_voc</span>
              <h3 class="font-headline text-sm font-bold text-on-surface">02. 다이빙 풀 스펙 및 시설 요건</h3>
            </div>
            <span class="font-mono text-[10px] text-primary uppercase bg-surface-container px-2 py-0.5 rounded font-bold">POOL SPECIFICATION</span>
          </div>

          <!-- Bento Spec Preview Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="p-3 bg-surface-container-low rounded-lg space-y-1">
              <span class="font-mono text-[11px] text-secondary">최대 수심</span>
              <div class="flex items-baseline gap-1">
                <span class="font-headline text-xl font-bold text-primary">${center.max_depth || "-"}</span>
                <span class="font-mono text-[10px] text-secondary">meters (M)</span>
              </div>
            </div>
            <div class="p-3 bg-surface-container-low rounded-lg space-y-1">
              <span class="font-mono text-[11px] text-secondary">프리다이빙</span>
              <div class="flex items-baseline gap-1">
                <span class="font-headline text-lg font-bold text-on-surface">${center.has_freediving ? "가능" : "불가"}</span>
              </div>
            </div>
            <div class="p-3 bg-surface-container-low rounded-lg space-y-1">
              <span class="font-mono text-[11px] text-secondary">스쿠버다이빙</span>
              <div class="flex items-baseline gap-1">
                <span class="font-headline text-lg font-bold text-on-surface">${center.has_scuba ? "가능" : "불가"}</span>
              </div>
            </div>
            <div class="p-3 bg-surface-container-low rounded-lg space-y-1">
              <span class="font-mono text-[11px] text-secondary">주차 지원</span>
              <div class="flex items-baseline gap-1">
                <span class="font-headline text-lg font-bold text-primary-container">${center.has_parking ? "보유" : "불가"}</span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              최대 수심 (m)
              <input id="siMaxDepth" type="number" step="0.1" value="${escapeHtml(String(center.max_depth ?? ""))}" class="w-full h-10 px-3.5 bg-surface-container-low border border-outline-variant/40 rounded-lg font-mono text-xs text-on-surface focus:outline-none focus:border-primary transition-all">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              프리다이빙 입장
              <select id="siHasFreediving" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary transition-all">
                <option value="true"${center.has_freediving ? " selected" : ""}>가능 (있음)</option>
                <option value="false"${center.has_freediving ? "" : " selected"}>불가 (없음)</option>
              </select>
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              스쿠버다이빙 입장
              <select id="siHasScuba" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary transition-all">
                <option value="true"${center.has_scuba ? " selected" : ""}>가능 (있음)</option>
                <option value="false"${center.has_scuba ? "" : " selected"}>불가 (없음)</option>
              </select>
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              주차 시설 여부
              <select id="siHasParking" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary transition-all">
                <option value="true"${center.has_parking ? " selected" : ""}>있음 (주차 가능)</option>
                <option value="false"${center.has_parking ? "" : " selected"}>없음 (주차 불가)</option>
              </select>
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold md:col-span-2 lg:col-span-4">
              주차 상세 안내
              <textarea id="siParkingInfo" rows="2" class="w-full p-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all resize-y" placeholder="무료/유료 여부, 등록 방법, 주차 대수 등">${escapeHtml(center.parking_info || "")}</textarea>
            </label>
          </div>
        </div>

        <!-- Section 3: 운영 정보 및 가이드 -->
        <div class="bg-surface-container-lowest p-5 rounded-xl border border-surface-container-high flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[20px]">calendar_clock</span>
              <h3 class="font-headline text-sm font-bold text-on-surface">03. 운영 일정 및 예약 안내</h3>
            </div>
            <span class="font-mono text-[10px] text-secondary bg-surface-container px-2 py-0.5 rounded font-bold">HOURS & PRICING</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              현재 시설 운영 상태
              <select id="siStatus" class="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary transition-all">
                <option value="active"${statusVal === "active" ? " selected" : ""}>🟢 정상 운영중</option>
                <option value="check_needed"${statusVal === "check_needed" ? " selected" : ""}>🟡 점검/확인필요</option>
                <option value="closed"${statusVal === "closed" ? " selected" : ""}>🔴 임시 휴장</option>
              </select>
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold">
              정기 휴무일
              <input id="siHoliday" value="${escapeHtml(center.holiday || "")}" class="w-full h-10 px-3.5 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all" placeholder="예: 매주 월요일, 공휴일 휴관">
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold md:col-span-2">
              상세 운영 시간
              <textarea id="siBusinessHours" rows="3" class="w-full p-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-mono text-xs focus:outline-none focus:border-primary transition-all resize-y" placeholder="[평일] 09:00 ~ 22:00&#10;[주말] 09:00 ~ 19:00">${escapeHtml(center.business_hours || "")}</textarea>
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold md:col-span-2">
              특징 요약 및 시설 태그
              <textarea id="siFeatureShort" rows="2" class="w-full p-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all resize-y" placeholder="국내 최고 수심, 온수풀, 다이빙대 등 주요 특징">${escapeHtml(center.feature_short || "")}</textarea>
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold md:col-span-2">
              보유 부대시설
              <textarea id="siFacilities" rows="2" class="w-full p-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all resize-y" placeholder="샤워실, 라커룸, 슈트 건조실, 장비 세척장">${escapeHtml(center.facilities || "")}</textarea>
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold md:col-span-2">
              요금 및 렌탈료 안내
              <textarea id="siPriceFull" rows="3" class="w-full p-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all resize-y" placeholder="- 입장료: 3시간 기준 33,000원&#10;- 탱크 대여: 15,000원">${escapeHtml(center.price_full || "")}</textarea>
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold md:col-span-2">
              예약 안내 및 필수 규정
              <textarea id="siReservationInfo" rows="3" class="w-full p-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all resize-y" placeholder="- 100% 사전 예약제&#10;- 버디 동반 필수 (단독 입장 불가)">${escapeHtml(center.reservation_info || "")}</textarea>
            </label>
            <label class="flex flex-col gap-1 font-mono text-xs text-on-surface-variant font-semibold md:col-span-2">
              오시는 길 / 지도 안내
              <textarea id="siMapGuide" rows="2" class="w-full p-3 bg-surface-container-low border border-outline-variant/40 rounded-lg text-on-surface font-body-md text-xs focus:outline-none focus:border-primary transition-all resize-y" placeholder="대중교통 및 고속도로 진입 안내">${escapeHtml(center.map_guide || "")}</textarea>
            </label>
          </div>
        </div>

        <!-- Section 4: 센터 사진 및 미디어 갤러리 -->
        ${!isNew ? `
          <div class="bg-surface-container-lowest p-5 rounded-xl border border-surface-container-high flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-primary text-[20px]">photo_library</span>
                <h3 class="font-headline text-sm font-bold text-on-surface">04. 센터 사진 및 미디어 갤러리</h3>
              </div>
              <label class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs cursor-pointer transition-colors">
                <span class="material-symbols-outlined text-[16px]">add_photo_alternate</span>
                <span>사진 추가</span>
                <input id="siPhotoInput" type="file" accept="image/*" multiple class="hidden">
              </label>
            </div>
            <div id="siPhotoGrid" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <span class="text-xs text-secondary py-4 col-span-full text-center">사진을 불러오는 중...</span>
            </div>
          </div>
        ` : ""}

        <!-- Sticky Bottom Action Bar -->
        <div class="sticky bottom-4 z-20 bg-surface-container-lowest/95 backdrop-blur-md p-4 rounded-xl border border-surface-container-high shadow-lg flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button type="button" class="px-3 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-md text-xs transition-colors" data-service-cancel-indoor>
              초기화 / 닫기
            </button>
          </div>
          <div class="flex items-center gap-3">
            <span id="siSaveFeedbackText" class="text-xs font-semibold text-primary transition-all"></span>
            <button type="button" class="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-headline text-xs font-semibold shadow transition-all" data-service-save-indoor>
              <span class="material-symbols-outlined text-[18px]">save</span>
              <span id="siSaveBtnLabel">${isNew ? "센터 등록" : "저장하기"}</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // 취소 및 저장 바인딩
    host.querySelector("[data-service-cancel-indoor]").onclick = () => {
      if (centerId) showServiceIndoorForm(centerId);
      else showServiceIndoorForm(null);
    };

    host.querySelector("[data-service-save-indoor]").onclick = async () => {
      const name = el("siName").value.trim();
      if (!name) {
        serviceMessage("센터 공식 명칭을 입력해 주세요.", true);
        el("siName").focus();
        return;
      }
      const saveBtn = host.querySelector("[data-service-save-indoor]");
      const saveLabel = host.querySelector("#siSaveBtnLabel");
      const prevLabel = saveLabel ? saveLabel.textContent : (isNew ? "센터 등록" : "저장하기");
      if (saveBtn) saveBtn.disabled = true;
      if (saveLabel) saveLabel.textContent = "저장 중...";
      try {
        const latV = el("siLat").value;
        const lngV = el("siLng").value;
        const address = el("siAddress").value.trim();
        let lat = latV ? Number(latV) : null;
        let lng = lngV ? Number(lngV) : null;
        const addressChanged = address !== String(center.address || "").trim();
        const needsGeocoding = isNew || addressChanged || !Number.isFinite(lat) || !Number.isFinite(lng);
        if (needsGeocoding) {
          const coordinates = await geocodeServiceIndoorAddress(address);
          lat = coordinates.lat;
          lng = coordinates.lng;
        }
        const mdV = el("siMaxDepth").value;
        const payload = {
          id: centerId,
          name: name,
          region: el("siRegion").value.trim(),
          sub_region: el("siSubRegion").value.trim(),
          address,
          lat,
          lng,
          is_active: el("siIsActive")?.checked === true,
          phone: el("siPhone").value.trim(),
          homepage: el("siHomepage").value.trim(),
          max_depth: mdV ? Number(mdV) : null,
          has_freediving: el("siHasFreediving").value === "true",
          has_scuba: el("siHasScuba").value === "true",
          has_parking: el("siHasParking").value === "true",
          parking_info: el("siParkingInfo").value.trim(),
          status: el("siStatus").value,
          business_hours: el("siBusinessHours").value.trim(),
          holiday: el("siHoliday").value.trim(),
          facilities: el("siFacilities").value.trim(),
          feature_short: el("siFeatureShort").value.trim(),
          price_full: el("siPriceFull").value.trim(),
          reservation_info: el("siReservationInfo").value.trim(),
          map_guide: el("siMapGuide").value.trim()
        };
        const saved = await global.SNORKYAdmin.saveIndoorCenterAdmin(payload);
        serviceCenters = await global.SNORKYAdmin.loadIndoorCentersAdmin();
        const targetId = saved?.id || centerId;
        renderServiceIndoor();
        showServiceIndoorForm(targetId);
        const completionMsg = isNew ? `'${name}' 센터 신규 등록이 완료되었습니다!` : `'${name}' 센터 정보가 저장 완료되었습니다!`;
        serviceMessage(completionMsg);
      } catch (error) {
        if (saveBtn) saveBtn.disabled = false;
        if (saveLabel) saveLabel.textContent = prevLabel;
        serviceMessage(error?.message || "센터 저장에 실패했습니다.", true);
      }
    };

    // 사진 갤러리 관리
    if (!isNew) {
      const cid = String(centerId);
      function renderSiPhotoGrid() {
        const cItem = serviceCenters.find(item => String(item.id) === cid) || {};
        const imgs = cItem.images || [];
        const grid = document.getElementById("siPhotoGrid");
        if (!grid) return;
        if (!imgs.length) {
          grid.innerHTML = '<div class="col-span-full py-4 text-center text-xs text-secondary">등록된 센터 사진이 없습니다. [사진 추가]를 눌러 업로드하세요.</div>';
          return;
        }
        grid.innerHTML = imgs.map(img => {
          const sb2 = window.getSnorkySupabase?.();
          const raw = img.storage_path || "";
          const url = (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("./") || raw.startsWith("/"))
            ? raw
            : (sb2?.storage.from("point-images").getPublicUrl(raw).data?.publicUrl || raw);
          return `
            <div class="relative group rounded-xl overflow-hidden bg-surface-container aspect-video shadow-xs border ${img.is_primary ? 'border-primary ring-2 ring-primary/40' : 'border-surface-container-high'}">
              <img src="${escapeHtml(url)}" class="w-full h-full object-cover">
              ${img.is_primary ? '<div class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-primary text-on-primary font-mono text-[10px] font-bold shadow">대표 사진</div>' : ''}
              <div class="absolute inset-0 bg-inverse-surface/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                ${!img.is_primary ? `<button type="button" class="px-2 py-1 rounded bg-surface-container-lowest text-on-surface font-mono text-[10px] font-semibold hover:bg-surface-container" data-si-primary="${escapeHtml(img.id)}">대표지정</button>` : ''}
                <button type="button" class="p-1 rounded-full bg-error text-on-error hover:bg-on-error-container" title="사진 삭제" data-si-delete="${escapeHtml(img.id)}">
                  <span class="material-symbols-outlined text-[14px]">delete</span>
                </button>
              </div>
            </div>
          `;
        }).join("");

        grid.querySelectorAll("[data-si-primary]").forEach(btn => {
          btn.onclick = async () => {
            try {
              await global.SNORKYAdmin.primaryCenterPhotoAdmin(cid, btn.dataset.siPrimary);
              serviceCenters = await global.SNORKYAdmin.loadIndoorCentersAdmin();
              renderSiPhotoGrid();
              serviceMessage("대표 사진을 변경했습니다.");
            } catch (e) {
              serviceMessage(e?.message || "대표 지정 실패", true);
            }
          };
        });

        grid.querySelectorAll("[data-si-delete]").forEach(btn => {
          btn.onclick = async () => {
            if (!global.confirm("이 사진을 삭제할까요?")) return;
            try {
              await global.SNORKYAdmin.deleteCenterPhotoAdmin(cid, btn.dataset.siDelete);
              serviceCenters = await global.SNORKYAdmin.loadIndoorCentersAdmin();
              renderSiPhotoGrid();
              serviceMessage("사진을 삭제했습니다.");
            } catch (e) {
              serviceMessage(e?.message || "삭제 실패", true);
            }
          };
        });
      }

      renderSiPhotoGrid();

      document.getElementById("siPhotoInput")?.addEventListener("change", async (event) => {
        const files = [...event.target.files];
        if (!files.length) return;
        try {
          serviceMessage("사진을 업로드하는 중입니다...");
          await global.SNORKYAdmin.uploadCenterPhotosAdmin(cid, files);
          serviceCenters = await global.SNORKYAdmin.loadIndoorCentersAdmin();
          renderSiPhotoGrid();
          serviceMessage("사진을 성공적으로 업로드했습니다.");
        } catch (e) {
          serviceMessage(e?.message || "업로드 실패", true);
        }
        event.target.value = "";
      });
    }
  }

  function bind() {
    ensureReviewManagerUi();
    ensureUserManagerUi();
    document.querySelectorAll("[data-admin-tab]").forEach((button) => button.addEventListener("click", () => selectTab(button.dataset.adminTab)));
    document.querySelector('[data-service-action="points"]')?.addEventListener("click", openServicePoints);
    document.querySelector('[data-service-action="indoor"]')?.addEventListener("click", openServiceIndoor);
    document.querySelectorAll('[data-service-action]').forEach((card) => card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); card.click(); } }));
    el("adminServicePointsModal")?.addEventListener("click", (event) => { if (event.target === el("adminServicePointsModal")) closeServicePoints(); });
    el("adminServiceIndoorModal")?.addEventListener("click", (event) => { if (event.target === el("adminServiceIndoorModal")) closeServiceIndoor(); });
    document.querySelector('[data-close-service-points]')?.addEventListener("click", closeServicePoints);
    document.querySelector('[data-close-service-indoor]')?.addEventListener("click", closeServiceIndoor);
    el("userManagerSearch")?.addEventListener("keydown", (event) => { if (event.key === "Enter") loadUserRows(); });
    el("userManagerSearchButton")?.addEventListener("click", loadUserRows);
    el("userManagerStatusFilter")?.addEventListener("change", renderUserRows);
    el("certificationStatusFilter")?.addEventListener("change", renderCertificationRows);
    el("reportStatusFilter")?.addEventListener("change", renderReportRows);
    global.addEventListener("snorky:supabase-ready", loadCurrentManagementTab);
  }

  bind();
  global.SNORKYAdminModeration = Object.freeze({ closeAll, openUserManager, openServicePoints, openServiceIndoor });
})(window);
