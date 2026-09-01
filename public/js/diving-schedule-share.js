(function () {
  "use strict";

  function getSbClient() {
    return window.getSnorkySupabase ? window.getSnorkySupabase() : window.snorkySupabase;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[char]);
  }

  function formatSelectedDateTitle(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
    return `${Number(parts[0])}년 ${Number(parts[1])}월 ${Number(parts[2])}일 ${dayNames[d.getDay()]}`;
  }

  // DOM Elements
  const shareLoading = document.getElementById("shareLoading");
  const shareError = document.getElementById("shareError");
  const shareErrorMessage = document.getElementById("shareErrorMessage");
  const shareDetail = document.getElementById("shareDetail");

  const shareTypeTag = document.getElementById("shareTypeTag");
  const sharePointName = document.getElementById("sharePointName");
  const shareDateText = document.getElementById("shareDateText");
  const shareTimeRow = document.getElementById("shareTimeRow");
  const shareTimeText = document.getElementById("shareTimeText");
  const shareMemoRow = document.getElementById("shareMemoRow");
  const shareMemoText = document.getElementById("shareMemoText");
  const shareConditionBody = document.getElementById("shareConditionBody");
  let _hasLoaded = false;

  // 1. Loading State: loading show, error hide, content hide
  function renderLoading() {
    if (shareLoading) shareLoading.hidden = false;
    if (shareError) shareError.hidden = true;
    if (shareDetail) shareDetail.hidden = true;
  }

  // 2. Error State: loading hide, error show, content hide
  function renderError(msg = "유효하지 않거나 만료된 공유 링크입니다.") {
    if (shareLoading) shareLoading.hidden = true;
    if (shareError) shareError.hidden = false;
    if (shareDetail) shareDetail.hidden = true;
    if (shareErrorMessage) {
      shareErrorMessage.textContent = msg;
    }
  }

  // 3. Success State: loading hide, error hide, content show
  async function renderSuccess(schedule) {
    if (shareLoading) shareLoading.hidden = true;
    if (shareError) shareError.hidden = true;
    if (shareDetail) shareDetail.hidden = false;

    const isCustom = schedule.point_type === "custom";
    shareTypeTag.textContent = isCustom ? "나만의 스팟" : "SNORKY 포인트";
    shareTypeTag.className = isCustom ? "share-type-tag custom" : "share-type-tag";

    sharePointName.textContent = schedule.point_name;
    shareDateText.textContent = formatSelectedDateTitle(schedule.schedule_date);

    if (schedule.planned_time) {
      shareTimeRow.hidden = false;
      shareTimeText.textContent = schedule.planned_time;
    } else {
      shareTimeRow.hidden = true;
    }

    if (schedule.memo) {
      shareMemoRow.hidden = false;
      shareMemoText.textContent = schedule.memo;
    } else {
      shareMemoRow.hidden = true;
    }

    // 포인트 상세보기 버튼 바인딩
    if (!isCustom && schedule.point_id) {
      viewPointDetailBtn.hidden = false;
      viewPointDetailBtn.onclick = () => {
        location.href = `./index.html?point=${encodeURIComponent(schedule.point_id)}`;
      };
    } else {
      viewPointDetailBtn.hidden = true;
    }

    // 바다 컨디션 요약 (캐시 조회만 수행, 신규 외부 API 0회)
    await renderConditionSummary(schedule);
  }

  async function loadSharedSchedule() {
    if (_hasLoaded) return;
    renderLoading();

    const params = new URLSearchParams(window.location.search);
    const token = params.get("t") || params.get("token");

    if (!token) {
      _hasLoaded = true;
      renderError("공유 토큰이 유효하지 않습니다.");
      return;
    }

    const sb = getSbClient();
    if (!sb) {
      // Supabase 클라이언트가 아직 준비되지 않은 경우 대기
      return;
    }

    _hasLoaded = true;
    try {
      // 보안 조회: share_token 일치하는 1건만 조회 (user_id 등 민감 정보 제외)
      const { data, error } = await sb
        .from("user_diving_schedules")
        .select("id, schedule_date, point_type, point_id, custom_spot_id, point_name, planned_time, memo, share_token, created_at")
        .eq("share_token", token)
        .maybeSingle();

      if (error || !data) {
        renderError("존재하지 않거나 삭제된 다이빙 스케줄입니다.");
        return;
      }

      await renderSuccess(data);
    } catch (err) {
      console.error("[SNORKY Share Load Exception]", err);
      renderError("스케줄 정보를 불러오는 중 오류가 발생했습니다.");
    }
  }

  async function renderConditionSummary(schedule) {
    if (schedule.point_type === "custom") {
      shareConditionBody.innerHTML = '<p class="share-condition-hint">나만의 스팟 컨디션은 등록자 기기에서 확인할 수 있습니다.</p>';
      return;
    }

    const sb = getSbClient();
    if (!sb || !schedule.point_id) {
      shareConditionBody.innerHTML = '<p class="share-condition-hint">컨디션 정보가 아직 준비되지 않았습니다.</p>';
      return;
    }

    try {
      let numericPointId = null;
      if (/^\d+$/.test(String(schedule.point_id))) {
        numericPointId = Number(schedule.point_id);
      } else {
        const { data: pData } = await sb
          .from("points")
          .select("id")
          .eq("legacy_id", schedule.point_id)
          .maybeSingle();
        if (pData?.id) {
          numericPointId = pData.id;
        }
      }

      if (!numericPointId) {
        shareConditionBody.innerHTML = '<p class="share-condition-hint">컨디션 정보가 아직 준비되지 않았습니다.</p>';
        return;
      }

      // 기존 평가 결과 테이블에서 해당 포인트 및 날짜의 저장된 결과 조회
      const { data, error } = await sb
        .from("point_evaluation_results")
        .select("condition_score, condition_status, recommendation, metrics, period_start, forecast_time, target_date")
        .eq("point_id", numericPointId)
        .eq("target_date", schedule.schedule_date)
        .order("period_start", { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        // 입수 예정시간과 가장 가까운 슬롯 선택 (없으면 주간/대표 슬롯)
        let evalRow = data[0];
        if (schedule.planned_time && data.length > 1) {
          const planHour = Number(schedule.planned_time.split(":")[0]);
          let minDiff = 999;
          data.forEach(r => {
            const timeStr = r.period_start || r.forecast_time;
            if (timeStr) {
              const d = new Date(timeStr);
              const kstHour = (d.getUTCHours() + 9) % 24;
              const diff = Math.abs(kstHour - planHour);
              if (diff < minDiff) {
                minDiff = diff;
                evalRow = r;
              }
            }
          });
        } else if (data.length > 1) {
          // 09:00~15:00 주간 슬롯 선호
          const daySlot = data.find(r => {
            const timeStr = r.period_start || r.forecast_time;
            if (!timeStr) return false;
            const kstHour = (new Date(timeStr).getUTCHours() + 9) % 24;
            return kstHour >= 9 && kstHour <= 15;
          });
          if (daySlot) evalRow = daySlot;
        }

        const score = evalRow.condition_score !== null && evalRow.condition_score !== undefined
          ? Math.round(evalRow.condition_score)
          : (evalRow.condition_status || "--");
        const status = evalRow.condition_status || "보통";
        const recom = evalRow.recommendation || "컨디션 확인 필요";
        const seaTemp = evalRow.metrics?.sea_temperature ?? evalRow.metrics?.temperature ?? null;
        const waveH = evalRow.metrics?.wave_height ?? null;
        const temp = seaTemp !== null && seaTemp !== undefined ? `${seaTemp}°C` : "--";
        const wave = waveH !== null && waveH !== undefined ? `${waveH}m` : "--";

        shareConditionBody.innerHTML = `
          <div class="share-condition-summary">
            <div class="share-condition-score-wrap">
              <span class="share-condition-status-label">${escapeHtml(status)}</span>
              <span class="share-condition-score">${score}<small style="font-size:14px;font-weight:700;">점</small></span>
            </div>
            <div class="share-condition-recom">${escapeHtml(recom)}</div>
          </div>
          <div class="share-condition-metrics">
            <div class="share-metric-box">수온 <strong>${escapeHtml(temp)}</strong></div>
            <div class="share-metric-box">유의파고 <strong>${escapeHtml(wave)}</strong></div>
          </div>
        `;
      } else {
        shareConditionBody.innerHTML = '<p class="share-condition-hint">컨디션 정보가 아직 준비되지 않았습니다.</p>';
      }
    } catch (_) {
      shareConditionBody.innerHTML = '<p class="share-condition-hint">컨디션 정보가 아직 준비되지 않았습니다.</p>';
    }
  }

  // Init
  window.addEventListener("snorky:supabase-ready", loadSharedSchedule);
  if (window.getSnorkySupabase || window.snorkySupabase) {
    loadSharedSchedule();
  }
})();
