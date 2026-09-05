(function (global) {
  "use strict";

  const CERT_STATUSES = ["PENDING", "APPROVED", "REJECTED"];
  const REPORT_STATUSES = ["PENDING", "REVIEWED", "ACTIONED", "DISMISSED"];
  const REPORT_STATUS_LABELS = {
    PENDING: "접수대기",
    REVIEWED: "검토완료",
    ACTIONED: "조치완료",
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

  function openModal(id) {
    el(id)?.classList.add("open");
  }

  function closeModal(id) {
    el(id)?.classList.remove("open");
  }

  function closeAll() {
    closeModal("certificationManagerModal");
    closeModal("reportManagerModal");
  }

  async function openCertificationManager() {
    openModal("certificationManagerModal");
    selectedCertificationId = null;
    el("certificationManagerDetail")?.setAttribute("hidden", "");
    await loadCertificationRows();
  }

  async function loadCertificationRows() {
    const list = el("certificationManagerList");
    if (!list) return;
    list.innerHTML = '<div class="admin-management-empty">자격 인증 요청을 불러오는 중...</div>';
    setMessage("certificationManagerMessage", "");
    try {
      certificationRows = await global.SNORKYAdmin.loadCertificationRequestsAdmin();
      renderCertificationRows();
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
              <td>${statusBadge(row.status)}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>`;
    list.querySelectorAll("[data-certification-request-id]").forEach((row) => {
      const open = () => showCertificationDetail(Number(row.dataset.certificationRequestId));
      row.addEventListener("click", open);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    });
  }

  function showCertificationDetail(requestId) {
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
        <div><dt>상태</dt><dd>${statusBadge(row.status)}</dd></div>
        <div><dt>검토일</dt><dd>${escapeHtml(formatDate(row.reviewed_at))}</dd></div>
      </dl>
      <p class="admin-management-notice">자격증 사진은 인증 요청 메일에서 확인해 주세요. 이 화면에는 사진을 저장하거나 표시하지 않습니다.</p>
      <label class="admin-management-field">반려 사유<textarea id="certificationRejectionReason" maxlength="500" placeholder="반려 시 사유를 입력하세요.">${escapeHtml(row.rejection_reason || "")}</textarea></label>
      <div class="admin-management-actions">
        <button type="button" class="admin-management-primary" data-certification-approve ${row.status !== "PENDING" ? "disabled" : ""}>승인</button>
        <button type="button" class="admin-management-danger" data-certification-reject ${row.status !== "PENDING" ? "disabled" : ""}>반려</button>
      </div>`;
    detail.querySelector("[data-certification-approve]")?.addEventListener("click", () => reviewCertification("APPROVED"));
    detail.querySelector("[data-certification-reject]")?.addEventListener("click", () => reviewCertification("REJECTED"));
  }

  async function reviewCertification(status) {
    if (!selectedCertificationId || !CERT_STATUSES.includes(status) || status === "PENDING") return;
    const reason = el("certificationRejectionReason")?.value.trim() || "";
    if (status === "REJECTED" && !reason) {
      setMessage("certificationManagerMessage", "반려 사유를 입력해 주세요.", true);
      return;
    }
    try {
      await global.SNORKYAdmin.reviewCertificationRequestAdmin(selectedCertificationId, status, reason);
      setMessage("certificationManagerMessage", status === "APPROVED" ? "자격 인증을 승인했습니다." : "자격 인증을 반려했습니다.");
      await loadCertificationRows();
      showCertificationDetail(selectedCertificationId);
    } catch (error) {
      setMessage("certificationManagerMessage", error?.message || "처리하지 못했습니다.", true);
    }
  }

  async function openReportManager() {
    openModal("reportManagerModal");
    selectedReportId = null;
    el("reportManagerDetail")?.setAttribute("hidden", "");
    await loadReportRows();
  }

  async function loadReportRows() {
    const list = el("reportManagerList");
    if (!list) return;
    list.innerHTML = '<div class="admin-management-empty">신고 목록을 불러오는 중...</div>';
    setMessage("reportManagerMessage", "");
    try {
      reportRows = await global.SNORKYAdmin.loadUserReportsAdmin();
      renderReportRows();
    } catch (error) {
      list.innerHTML = '<div class="admin-management-empty is-error">신고 목록을 불러오지 못했습니다.</div>';
      setMessage("reportManagerMessage", error?.message || "조회 오류", true);
    }
  }

  function renderReportRows() {
    const list = el("reportManagerList");
    if (!list) return;
    const filter = el("reportStatusFilter")?.value || "ALL";
    const rows = reportRows.filter((row) => filter === "ALL" || row.status === filter);
    if (!rows.length) {
      list.innerHTML = '<div class="admin-management-empty">조건에 맞는 신고가 없습니다.</div>';
      return;
    }
    list.innerHTML = `
      <div class="admin-management-table-wrap">
        <table class="admin-management-table">
          <thead><tr><th>대상</th><th>사유</th><th>신고자</th><th>post_id</th><th>신고일</th><th>상태</th></tr></thead>
          <tbody>${rows.map((row) => `
            <tr data-user-report-id="${escapeHtml(row.id)}" tabindex="0">
              <td>${escapeHtml(row.target_profile?.custom_nickname || row.target_nickname || row.target_user_id)}</td>
              <td>${escapeHtml(row.reason)}</td>
              <td>${escapeHtml(row.reporter_profile?.custom_nickname || row.reporter_nickname || row.reporter_user_id || "-")}</td>
              <td>${escapeHtml(row.buddy_post_id || "-")}</td>
              <td>${escapeHtml(formatDate(row.reported_at))}</td>
              <td>${reportStatusBadge(row.status)}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>`;
    list.querySelectorAll("[data-user-report-id]").forEach((row) => {
      const open = () => showReportDetail(Number(row.dataset.userReportId));
      row.addEventListener("click", open);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    });
  }

  function showReportDetail(reportId) {
    const row = reportRows.find((item) => Number(item.id) === Number(reportId));
    const detail = el("reportManagerDetail");
    if (!row || !detail) return;
    selectedReportId = Number(row.id);
    const profile = row.target_profile || {};
    const relatedPost = row.related_post;
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
      </dl>
      <div class="admin-management-control-grid">
        <label class="admin-management-field">처리 상태
          <select id="reportProcessingStatus">${REPORT_STATUSES.map((status) => `<option value="${status}"${row.status === status ? " selected" : ""}>${REPORT_STATUS_LABELS[status] || status}</option>`).join("")}</select>
        </label>
        <button type="button" class="admin-management-secondary" data-save-report-status>상태 저장</button>
      </div>
      <div class="admin-management-sanction">
        <h4>수동 제재</h4>
        <label class="admin-management-field">제재 종류
          <select id="reportActionType"><option value="">선택</option>${Object.entries(ACTION_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select>
        </label>
        <label class="admin-management-field">처리 메모<textarea id="reportActionReason" maxlength="1000" placeholder="제재 사유 또는 관리자 메모"></textarea></label>
        <button type="button" class="admin-management-danger" data-apply-report-action>선택한 제재 적용</button>
      </div>`;
    detail.querySelector("[data-save-report-status]")?.addEventListener("click", saveReportStatus);
    detail.querySelector("[data-apply-report-action]")?.addEventListener("click", applyReportAction);
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

  async function applyReportAction() {
    if (!selectedReportId) return;
    const actionType = el("reportActionType")?.value;
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

  function bind() {
    el("adminCertificationManager")?.addEventListener("click", openCertificationManager);
    el("adminReportManager")?.addEventListener("click", openReportManager);
    el("certificationStatusFilter")?.addEventListener("change", renderCertificationRows);
    el("reportStatusFilter")?.addEventListener("change", renderReportRows);
    document.querySelectorAll("[data-close-certification-manager]").forEach((button) => button.addEventListener("click", () => closeModal("certificationManagerModal")));
    document.querySelectorAll("[data-close-report-manager]").forEach((button) => button.addEventListener("click", () => closeModal("reportManagerModal")));
    el("certificationManagerModal")?.addEventListener("click", (event) => { if (event.target === el("certificationManagerModal")) closeModal("certificationManagerModal"); });
    el("reportManagerModal")?.addEventListener("click", (event) => { if (event.target === el("reportManagerModal")) closeModal("reportManagerModal"); });
  }

  bind();
  global.SNORKYAdminModeration = Object.freeze({ closeAll });
})(window);
