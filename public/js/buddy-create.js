(function () {
  "use strict";

  // 1. 세션 확인
  const session = window.SNORKYAuthSession?.get?.();
  const userId = session?.user?.id ? String(session.user.id) : null;

  const loginPrompt = document.getElementById("loginPrompt");
  const createFormWrap = document.getElementById("createFormWrap");
  const bottomBar = document.getElementById("bottomBar");

  if (!userId) {
    if (loginPrompt) loginPrompt.style.display = "block";
    if (createFormWrap) createFormWrap.style.display = "none";
    if (bottomBar) bottomBar.style.display = "none";
    return;
  }

  // 2. KST 오늘 날짜 구하기
  function getKstToday() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch (_) {
      const now = new Date();
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const kst = new Date(utc + (9 * 3600000));
      return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
    }
  }

  const todayStr = getKstToday();
  const urlParams = new URLSearchParams(window.location.search);
  const editPostId = urlParams.get("editId");

  // DOM 요소
  const eventDateInput = document.getElementById("eventDateInput");
  const entryTimeInput = document.getElementById("entryTimeInput");
  const regionSelect = document.getElementById("regionSelect");
  const tabSnorkyPoint = document.getElementById("tabSnorkyPoint");
  const tabCustomPoint = document.getElementById("tabCustomPoint");
  const snorkyPointArea = document.getElementById("snorkyPointArea");
  const customPointArea = document.getElementById("customPointArea");
  const snorkyPointSelect = document.getElementById("snorkyPointSelect");
  const customPointInput = document.getElementById("customPointInput");
  const capacityInput = document.getElementById("capacityInput");
  const capacityMinusBtn = document.getElementById("capacityMinusBtn");
  const capacityPlusBtn = document.getElementById("capacityPlusBtn");
  const capacityBadge = document.getElementById("capacityBadge");
  const hostAidaLevelSelect = document.getElementById("hostAidaLevelSelect");
  const hostAidaCustomInput = document.getElementById("hostAidaCustomInput");
  const descInput = document.getElementById("descInput");
  const notificationToggle = document.getElementById("notificationToggle");
  const addToCalendarToggle = document.getElementById("addToCalendarToggle");
  const contactMethodInput = document.getElementById("contactMethodInput");
  const openChatArea = document.getElementById("openChatArea");
  const openChatUrlInput = document.getElementById("openChatUrlInput");
  const laterNoticeArea = document.getElementById("laterNoticeArea");
  const submitBtn = document.getElementById("submitBtn");
  const toastEl = document.getElementById("toast");

  hostAidaLevelSelect?.addEventListener("change", () => {
    if (hostAidaCustomInput) {
      if (hostAidaLevelSelect.value === "기타") {
        hostAidaCustomInput.style.display = "block";
        hostAidaCustomInput.focus();
      } else {
        hostAidaCustomInput.style.display = "none";
        hostAidaCustomInput.value = "";
      }
    }
  });

  // 확인 모달 DOM 요소
  const confirmModal = document.getElementById("confirmModal");
  const btnCloseConfirmModal = document.getElementById("btnCloseConfirmModal");
  const btnCancelConfirm = document.getElementById("btnCancelConfirm");
  const agreeSafetyCheck = document.getElementById("agreeSafetyCheck");
  const btnSubmitFinal = document.getElementById("btnSubmitFinal");

  // 날짜 기본값 및 최소 날짜 설정 (신규 등록 시에만 오늘 날짜 기본값 설정)
  if (eventDateInput && !editPostId) {
    eventDateInput.min = todayStr;
    eventDateInput.value = todayStr;
  }

  // 3. 상태 변수
  let isSnorkyPointMode = true;
  let allRegions = [];
  let allPoints = [];
  let originalEditPostData = null;

  // 토스트 표시 함수
  function showToast(msg, duration = 2500) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => {
      toastEl.classList.remove("show");
    }, duration);
  }

  // 칩 버튼 그룹 바인딩 헬퍼
  function bindChipGroup(groupId, inputId) {
    const group = document.getElementById(groupId);
    const input = document.getElementById(inputId);
    if (!group || !input) return;

    group.querySelectorAll(".buddy-chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".buddy-chip-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        input.value = btn.getAttribute("data-val") || "";
      });
    });
  }

  // 칩 버튼 그룹 특정 값 활성화 헬퍼
  function setChipGroupValue(groupId, inputId, value) {
    const group = document.getElementById(groupId);
    const input = document.getElementById(inputId);
    if (!group || !value) return;
    group.querySelectorAll(".buddy-chip-btn").forEach((btn) => {
      const match = btn.getAttribute("data-val") === value;
      btn.classList.toggle("active", match);
    });
    if (input) input.value = value;
  }

  bindChipGroup("activityTypeGroup", "activityTypeInput");
  bindChipGroup("difficultyGroup", "difficultyInput");
  bindChipGroup("preferredGenderGroup", "preferredGenderInput");
  bindChipGroup("hostGenderGroup", "hostGenderInput");

  // 뒤로가기 버튼 바인딩 (직전 화면 복귀)
  const btnBack = document.getElementById("btnBack") || document.querySelector(".buddy-back");
  btnBack?.addEventListener("click", (e) => {
    e.preventDefault();
    if (window.history.length > 1 && document.referrer) {
      window.history.back();
    } else {
      window.location.href = "./buddy.html";
    }
  });

  // 연락 수단 칩 바인딩 및 토글
  const contactMethodGroup = document.getElementById("contactMethodGroup");
  contactMethodGroup?.querySelectorAll(".buddy-chip-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      contactMethodGroup.querySelectorAll(".buddy-chip-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const val = btn.getAttribute("data-val") || "open_chat";
      if (contactMethodInput) contactMethodInput.value = val;
      if (val === "open_chat") {
        if (openChatArea) openChatArea.style.display = "block";
        if (laterNoticeArea) laterNoticeArea.style.display = "none";
      } else {
        if (openChatArea) openChatArea.style.display = "none";
        if (laterNoticeArea) laterNoticeArea.style.display = "flex";
      }
    });
  });

  // 4. 포인트 선택 모드 전환 함수
  function setPointMode(isSnorky) {
    isSnorkyPointMode = !!isSnorky;
    if (isSnorkyPointMode) {
      tabSnorkyPoint?.classList.add("active");
      tabCustomPoint?.classList.remove("active");
      if (snorkyPointArea) snorkyPointArea.style.display = "block";
      if (customPointArea) customPointArea.style.display = "none";
    } else {
      tabCustomPoint?.classList.add("active");
      tabSnorkyPoint?.classList.remove("active");
      if (snorkyPointArea) snorkyPointArea.style.display = "none";
      if (customPointArea) customPointArea.style.display = "block";
    }
  }

  tabSnorkyPoint?.addEventListener("click", () => setPointMode(true));
  tabCustomPoint?.addEventListener("click", () => setPointMode(false));

  // 5. 인원 수 스텝퍼 (+, -)
  function updateCapacityBadge(val) {
    if (capacityBadge) {
      capacityBadge.textContent = `현재 1 / ${val}명`;
    }
  }

  capacityMinusBtn?.addEventListener("click", () => {
    let cur = parseInt(capacityInput.value, 10) || 2;
    if (cur > 2) {
      cur -= 1;
      capacityInput.value = cur;
      updateCapacityBadge(cur);
    }
  });

  capacityPlusBtn?.addEventListener("click", () => {
    let cur = parseInt(capacityInput.value, 10) || 2;
    if (cur < 20) {
      cur += 1;
      capacityInput.value = cur;
      updateCapacityBadge(cur);
    }
  });

  // 6. Supabase 클라이언트 및 데이터 로드
  function getSbClient() {
    return window.getSnorkySupabase ? window.getSnorkySupabase() : window.snorkySupabase;
  }

  async function loadRegionsAndPoints() {
    const sb = getSbClient();
    if (!sb) {
      console.warn("[BuddyCreate] Supabase client not ready");
      return;
    }

    try {
      if (window.SNORKYBuddyRegions) {
        await window.SNORKYBuddyRegions.loadRegions(sb);
        allRegions = window.SNORKYBuddyRegions.getAllRegions();
      } else {
        const regRes = await sb.from("regions").select("id, name, warning_area_code, land_warning_area_code").order("name");
        allRegions = regRes.data || [];
      }

      const ptRes = await sb.from("points").select("id, legacy_id, region_id, name").order("name");
      allPoints = ptRes.data || [];

      // 지역 셀렉트 옵션 채우기 (대분류 optgroup별로 자동 분류)
      if (regionSelect) {
        regionSelect.innerHTML = '<option value="">지역을 선택해 주세요</option>';
        if (window.SNORKYBuddyRegions) {
          const majors = window.SNORKYBuddyRegions.getMajorRegionNames();
          majors.forEach((major) => {
            const subRecords = window.SNORKYBuddyRegions.getSubRegionRecords(major);
            if (subRecords.length > 0) {
              const optgroup = document.createElement("optgroup");
              optgroup.label = major;
              subRecords.forEach((r) => {
                const opt = document.createElement("option");
                opt.value = r.name;
                if (r.id !== undefined && r.id !== null) {
                  opt.setAttribute("data-region-id", r.id);
                }
                opt.textContent = r.name;
                optgroup.appendChild(opt);
              });
              regionSelect.appendChild(optgroup);
            }
          });
        } else {
          allRegions.forEach((r) => {
            const opt = document.createElement("option");
            opt.value = r.name;
            opt.setAttribute("data-region-id", r.id);
            opt.textContent = r.name;
            regionSelect.appendChild(opt);
          });
        }
      }
    } catch (err) {
      console.error("[BuddyCreate] Error loading points/regions:", err);
    }
  }

  // 지역 변경 시 해당 지역 포인트 목록 갱신
  regionSelect?.addEventListener("change", () => {
    const selectedOpt = regionSelect.options[regionSelect.selectedIndex];
    const regionId = selectedOpt?.getAttribute("data-region-id");
    const regionName = regionSelect.value;

    if (!snorkyPointSelect) return;

    if (!regionName) {
      snorkyPointSelect.innerHTML = '<option value="">지역을 먼저 선택해 주세요</option>';
      return;
    }

    const filtered = allPoints.filter((p) => String(p.region_id) === String(regionId));
    if (filtered.length > 0) {
      snorkyPointSelect.innerHTML = '<option value="">스노키 포인트를 선택해 주세요</option>';
      filtered.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.legacy_id || p.id;
        opt.setAttribute("data-point-name", p.name);
        opt.textContent = p.name;
        snorkyPointSelect.appendChild(opt);
      });
    } else {
      snorkyPointSelect.innerHTML = '<option value="">해당 지역에 등록된 공식 포인트가 없습니다. (직접 입력 권장)</option>';
    }
  });

  // 7. 연락처/전화번호 차단 필터
  function containsContactInfo(text) {
    if (!text) return false;
    // 010, 011, 016, 017, 018, 019 등의 번호 패턴
    const phonePattern = /(01[016789][\s-]?\d{3,4}[\s-]?\d{4})|(\d{2,3}[\s-]\d{3,4}[\s-]\d{4})/;
    if (phonePattern.test(text)) return true;

    // 카카오톡 ID 패턴 노출 방지 (카톡, 오픈챗, 오픈채팅 링크 등)
    const chatPattern = /(open\.kakao\.com|오픈채팅|카톡아이디|카카오톡\s*아이디|라인\s*아이디)/i;
    if (chatPattern.test(text)) return true;

    return false;
  }

  // 8. 오픈채팅 URL 최소 유효성 검사
  function isValidOpenChatUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url.trim());
      return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.hostname.includes("open.kakao.com");
    } catch (_) {
      return false;
    }
  }

  let validatedFormPayload = null;

  // 9. 등록 1차 검증 및 확인 모달 열기
  function handleOpenConfirmModal() {
    const activityType = document.getElementById("activityTypeInput")?.value?.trim();
    const difficulty = document.getElementById("difficultyInput")?.value?.trim();
    const eventDate = eventDateInput?.value?.trim();
    const entryTime = entryTimeInput?.value?.trim();
    const region = regionSelect?.value?.trim();
    const preferredGender = document.getElementById("preferredGenderInput")?.value?.trim();
    const hostGender = document.getElementById("hostGenderInput")?.value?.trim();
    const capacity = parseInt(capacityInput?.value, 10);
    const description = descInput?.value?.trim() || "";
    const notificationEnabled = !!notificationToggle?.checked;
    const addToCalendar = !!addToCalendarToggle?.checked;
    const contactMethod = contactMethodInput?.value?.trim() || "open_chat";
    const openChatUrl = openChatUrlInput?.value?.trim() || "";

    // 필수값 검증
    if (!activityType) {
      showToast("활동 구분을 선택해 주세요.");
      return;
    }
    if (!eventDate) {
      showToast("날짜를 선택해 주세요.");
      eventDateInput?.focus();
      return;
    }
    if (eventDate < todayStr) {
      showToast("지난 날짜는 선택할 수 없습니다.");
      eventDateInput?.focus();
      return;
    }
    if (!entryTime) {
      showToast("입수 시간을 입력해 주세요.");
      entryTimeInput?.focus();
      return;
    }
    if (!region) {
      showToast("지역을 선택해 주세요.");
      regionSelect?.focus();
      return;
    }

    let pointId = null;
    let pointName = "";
    let isSnorkyPoint = isSnorkyPointMode;

    if (isSnorkyPointMode) {
      const selectedPointOpt = snorkyPointSelect?.options[snorkyPointSelect?.selectedIndex];
      pointId = snorkyPointSelect?.value || null;
      pointName = selectedPointOpt?.getAttribute("data-point-name") || "";

      if (!pointId || !pointName) {
        showToast("스노키 포인트를 선택해 주시거나 [직접 입력]을 이용해 주세요.");
        snorkyPointSelect?.focus();
        return;
      }
    } else {
      pointName = customPointInput?.value?.trim() || "";
      if (!pointName) {
        showToast("포인트명을 직접 입력해 주세요.");
        customPointInput?.focus();
        return;
      }
      pointId = null;
      isSnorkyPoint = false;
    }

    if (isNaN(capacity) || capacity < 2) {
      showToast("모집 총 인원은 주최자 포함 최소 2명 이상이어야 합니다.");
      return;
    }

    // 연락처 직접 기재 여부 검사
    if (containsContactInfo(description)) {
      alert("안전 및 개인정보 보호를 위해 모집 내용에 전화번호나 카카오톡 오픈채팅 링크 등 개인 연락처를 직접 기재할 수 없습니다.");
      descInput?.focus();
      return;
    }

    // 오픈채팅 링크 검증 (카카오 오픈채팅 선택 시)
    if (contactMethod === "open_chat") {
      if (!openChatUrl) {
        showToast("오픈채팅방 링크를 입력해 주세요. (또는 '추후 설정'을 선택하세요)");
        openChatUrlInput?.focus();
        return;
      }
      if (!isValidOpenChatUrl(openChatUrl)) {
        showToast("올바른 카카오 오픈채팅 링크를 입력해 주세요. (예: https://open.kakao.com/...)");
        openChatUrlInput?.focus();
        return;
      }
    }

    let finalHostAida = hostAidaLevelSelect ? hostAidaLevelSelect.value : "없음";
    if (finalHostAida === "기타") {
      finalHostAida = hostAidaCustomInput ? hostAidaCustomInput.value.trim() : "";
      if (!finalHostAida) {
        showToast("프리다이빙 레벨을 직접 입력해 주세요.");
        hostAidaCustomInput?.focus();
        return;
      }
    }

    validatedFormPayload = {
      user_id: String(userId),
      activity_type: activityType,
      region: region,
      point_id: pointId,
      point_name: pointName,
      is_snorky_point: isSnorkyPoint,
      event_date: eventDate,
      entry_time: entryTime,
      host_gender: hostGender || "남성",
      host_aida_level: finalHostAida,
      preferred_gender: preferredGender || "성별 무관",
      capacity: capacity,
      current_count: 1,
      difficulty: difficulty || "무관",
      description: description || null,
      application_notification_enabled: notificationEnabled,
      contact_method: contactMethod,
      open_chat_url: contactMethod === "open_chat" ? openChatUrl : null,
      status: "RECRUITING",
      addToCalendar: addToCalendar
    };

    // 모달 초기화 후 열기
    if (agreeSafetyCheck) agreeSafetyCheck.checked = false;
    if (btnSubmitFinal) {
      btnSubmitFinal.disabled = true;
      btnSubmitFinal.textContent = "동의하고 등록";
    }
    if (confirmModal) confirmModal.style.display = "flex";
  }

  // 모달 닫기
  function closeConfirmModal() {
    if (confirmModal) confirmModal.style.display = "none";
  }

  btnCloseConfirmModal?.addEventListener("click", closeConfirmModal);
  btnCancelConfirm?.addEventListener("click", closeConfirmModal);

  // 동의 체크박스 상태 변경
  agreeSafetyCheck?.addEventListener("change", () => {
    if (btnSubmitFinal) {
      btnSubmitFinal.disabled = !agreeSafetyCheck.checked;
    }
  });

  submitBtn?.addEventListener("click", handleOpenConfirmModal);

  // 10. 최종 등록 실행 (동의 확인 모달 승인 후)
  async function handleFinalSubmit() {
    if (!validatedFormPayload) return;
    if (!agreeSafetyCheck?.checked) {
      showToast("안전 및 면책 내용을 확인하고 동의해 주세요.");
      return;
    }

    const sb = getSbClient();
    if (!sb) {
      showToast("데이터베이스 연결에 실패했습니다.");
      return;
    }

    btnSubmitFinal.disabled = true;
    btnSubmitFinal.textContent = "등록 중...";

    try {
      const postPayload = {
        user_id: validatedFormPayload.user_id,
        activity_type: validatedFormPayload.activity_type,
        region: validatedFormPayload.region,
        point_id: validatedFormPayload.point_id,
        point_name: validatedFormPayload.point_name,
        is_snorky_point: validatedFormPayload.is_snorky_point,
        event_date: validatedFormPayload.event_date,
        entry_time: validatedFormPayload.entry_time,
        host_gender: validatedFormPayload.host_gender,
        host_aida_level: validatedFormPayload.host_aida_level,
        preferred_gender: validatedFormPayload.preferred_gender,
        capacity: validatedFormPayload.capacity,
        current_count: 1,
        difficulty: validatedFormPayload.difficulty,
        description: validatedFormPayload.description,
        application_notification_enabled: validatedFormPayload.application_notification_enabled,
        contact_method: validatedFormPayload.contact_method,
        open_chat_url: validatedFormPayload.open_chat_url,
        status: "RECRUITING",
      };

      let targetPostId = editPostId;

      if (editPostId) {
        // 수정 모드: update
        const updatePayload = { ...postPayload };
        delete updatePayload.current_count; // 기존 신청인원 보존
        const { error: updErr } = await sb.from("buddy_posts").update(updatePayload).eq("id", editPostId);
        if (updErr) throw updErr;

        // 일정/장소 등 중요 변경 감지 및 승인된 참가자 알림 발송 (규칙 1, 5)
        let prevPost = originalEditPostData;
        if (!prevPost) {
          try {
            const { data: fetchOld } = await sb.from("buddy_posts").select("*").eq("id", Number(editPostId)).maybeSingle();
            if (fetchOld) prevPost = fetchOld;
          } catch (_) {}
        }

        if (prevPost) {
          const prevDate = (prevPost.event_date || "").trim();
          const newDate = (validatedFormPayload.event_date || "").trim();
          const prevTime = (prevPost.entry_time || "").trim();
          const newTime = (validatedFormPayload.entry_time || "").trim();
          const prevRegion = (prevPost.region || "").trim();
          const newRegion = (validatedFormPayload.region || "").trim();
          const prevPointName = (prevPost.point_name || "").trim();
          const newPointName = (validatedFormPayload.point_name || "").trim();
          const prevPointId = prevPost.point_id ? String(prevPost.point_id).trim() : "";
          const newPointId = validatedFormPayload.point_id ? String(validatedFormPayload.point_id).trim() : "";
          const prevIsSnorky = !!prevPost.is_snorky_point;
          const newIsSnorky = !!validatedFormPayload.is_snorky_point;

          const isScheduleOrLocationChanged = (
            prevDate !== newDate ||
            prevTime !== newTime ||
            prevRegion !== newRegion ||
            prevPointName !== newPointName ||
            prevPointId !== newPointId ||
            prevIsSnorky !== newIsSnorky
          );

          if (isScheduleOrLocationChanged) {
            try {
              const { data: approvedApps, error: appErr } = await sb
                .from("buddy_applications")
                .select("applicant_user_id")
                .eq("buddy_post_id", Number(editPostId))
                .eq("status", "APPROVED");

              if (appErr) {
                console.error("[BuddyCreate] Error fetching approved applicants:", appErr);
              }

              if (approvedApps && approvedApps.length > 0) {
                const recipientIds = Array.from(new Set(
                  approvedApps
                    .map(a => a.applicant_user_id ? String(a.applicant_user_id) : null)
                    .filter(uid => uid && uid !== String(userId))
                ));

                if (recipientIds.length > 0) {
                  const pName = validatedFormPayload.point_name || "버디";
                  const timeSummary = validatedFormPayload.event_date + (validatedFormPayload.entry_time ? " " + validatedFormPayload.entry_time : "");
                  const notiRows = recipientIds.map(uid => ({
                    user_id: uid,
                    type: "buddy_schedule_changed",
                    title: "참가 중인 버디 모임 일정이 변경되었습니다.",
                    content: `[${pName} · ${timeSummary}] 참가 중인 버디 모임의 일시/장소 정보가 변경되었습니다.`,
                    buddy_post_id: Number(editPostId),
                    point_name: pName,
                    link_url: `./my-buddy.html?tab=myApps&post_id=${editPostId}`,
                    is_read: false
                  }));

                  const { error: insErr } = await sb.from("user_notifications").insert(notiRows);
                  if (insErr) {
                    console.error("[BuddyCreate] Notification insert error:", insErr);
                  }
                }
              }
            } catch (notiErr) {
              console.error("[BuddyCreate] Schedule change notification catch:", notiErr);
            }
          }
        }
      } else {
        // 신규 등록: insert
        const { data, error } = await sb.from("buddy_posts").insert([postPayload]).select("id").single();
        if (error) throw error;
        targetPostId = data?.id;
      }

      // 프로필 정보 동기화 (user_profiles 테이블에 작성자의 닉네임/아바타가 없으면 자동 upsert)
      try {
        const myNick = session?.user?.customNickname || null;
        const myAvatar = session?.user?.customAvatarUrl || session?.user?.profileImageUrl || null;
        const myType = session?.user?.avatarType || "default";

        const { data: existingProf } = await sb
          .from("user_profiles")
          .select("custom_nickname, custom_avatar_url")
          .eq("provider_user_id", String(userId))
          .maybeSingle();

        if (!existingProf || (!existingProf.custom_nickname && myNick)) {
          await sb.from("user_profiles").upsert({
            provider: session?.provider || "kakao",
            provider_user_id: String(userId),
            custom_nickname: existingProf?.custom_nickname || myNick,
            custom_avatar_url: existingProf?.custom_avatar_url || myAvatar,
            avatar_type: myType,
            updated_at: new Date().toISOString(),
          }, { onConflict: "provider,provider_user_id" });
        }
      } catch (_) {}

      // 내 다이빙 캘린더 추가 (addToCalendar === true)
      if (validatedFormPayload.addToCalendar && targetPostId) {
        try {
          const { data: existingSchedules } = await sb
            .from("user_diving_schedules")
            .select("id")
            .eq("user_id", validatedFormPayload.user_id)
            .eq("buddy_post_id", targetPostId)
            .limit(1);

          if (!existingSchedules || existingSchedules.length === 0) {
            await sb.from("user_diving_schedules").insert([{
              user_id: validatedFormPayload.user_id,
              schedule_date: validatedFormPayload.event_date,
              point_type: validatedFormPayload.is_snorky_point ? "official" : "custom",
              point_id: validatedFormPayload.point_id,
              point_name: validatedFormPayload.point_name,
              planned_time: validatedFormPayload.entry_time,
              memo: `[버디 모집: ${validatedFormPayload.activity_type}] ${validatedFormPayload.point_name}`,
              buddy_post_id: targetPostId
            }]);
          }
        } catch (calErr) {
          console.warn("[BuddyCreate] Failed to add diving schedule:", calErr);
        }
      }

      closeConfirmModal();
      showToast(editPostId ? "버디 모집글이 성공적으로 수정되었습니다." : "버디 모집글이 성공적으로 등록되었습니다.");
      setTimeout(() => {
        location.href = editPostId ? "./my-buddy.html?tab=myPosts" : "./buddy.html";
      }, 900);
    } catch (err) {
      console.error("[BuddyCreate] Submit error:", err);
      showToast(`저장 중 오류가 발생했습니다: ${err.message || "다시 시도해 주세요"}`);
      btnSubmitFinal.disabled = false;
      btnSubmitFinal.textContent = editPostId ? "동의하고 수정" : "동의하고 등록";
    }
  }

  btnSubmitFinal?.addEventListener("click", handleFinalSubmit);

  // 11. 수정 모드 시 기존 데이터 로드 (15개 필드 전체 완벽 복원)
  async function loadEditPostData(postId) {
    const sb = getSbClient();
    if (!sb || !postId) return;

    try {
      const { data: post, error } = await sb.from("buddy_posts").select("*").eq("id", postId).single();
      if (error || !post) return;
      originalEditPostData = post;

      if (String(post.user_id) !== String(userId)) {
        alert("본인이 작성한 모집글만 수정할 수 있습니다.");
        if (window.history.length > 1 && document.referrer) {
          window.history.back();
        } else {
          location.href = "./buddy.html";
        }
        return;
      }

      // UI 텍스트 변경
      const headerTitle = document.querySelector(".buddy-header-title");
      if (headerTitle) headerTitle.textContent = "버디 모집 수정";
      if (submitBtn) submitBtn.textContent = "버디 모집 수정하기";
      const modalTitle = document.getElementById("confirmModalTitle");
      if (modalTitle) modalTitle.textContent = "버디 모집 수정 전 확인";
      if (btnSubmitFinal) btnSubmitFinal.textContent = "동의하고 수정";

      // 1. 활동 구분 (activity_type)
      setChipGroupValue("activityTypeGroup", "activityTypeInput", post.activity_type);

      // 2. 난이도 (difficulty)
      setChipGroupValue("difficultyGroup", "difficultyInput", post.difficulty);

      // 3. 모집 대상 성별 (preferred_gender)
      setChipGroupValue("preferredGenderGroup", "preferredGenderInput", post.preferred_gender);

      // 4. 주최자 성별 (host_gender)
      setChipGroupValue("hostGenderGroup", "hostGenderInput", post.host_gender);

      // 5. 날짜 (event_date) & 입수 시간 (entry_time)
      if (eventDateInput && post.event_date) {
        eventDateInput.value = post.event_date;
      }
      if (entryTimeInput && post.entry_time) {
        entryTimeInput.value = post.entry_time;
      }

      // 6. 지역 (region) 복원 - 3단계 매칭으로 오매칭 방지
      let matchedRegionId = null;
      if (regionSelect && post.region) {
        const targetRegion = post.region.trim();
        let matchedIndex = -1;

        // 1단계: 정확히 일치 (value 또는 text)
        for (let i = 0; i < regionSelect.options.length; i++) {
          const opt = regionSelect.options[i];
          if (opt.value.trim() === targetRegion || opt.text.trim() === targetRegion) {
            matchedIndex = i;
            break;
          }
        }

        // 2단계: 정확한 일치가 없을 때만 접두사 일치 (공백/구분자 고려)
        if (matchedIndex === -1) {
          for (let i = 0; i < regionSelect.options.length; i++) {
            const optVal = regionSelect.options[i].value.trim();
            const optText = regionSelect.options[i].text.trim();
            if (!optVal) continue;
            if (targetRegion.startsWith(optVal) || targetRegion.startsWith(optText)) {
              matchedIndex = i;
              break;
            }
          }
        }

        // 3단계: 여전히 없으면, 기존 지역값을 옵션으로 추가하여 절대 다른 지역으로 바뀌지 않도록 방어
        if (matchedIndex !== -1) {
          regionSelect.selectedIndex = matchedIndex;
          matchedRegionId = regionSelect.options[matchedIndex].getAttribute("data-region-id");
        } else {
          const newRegionOpt = document.createElement("option");
          newRegionOpt.value = targetRegion;
          newRegionOpt.textContent = targetRegion;
          newRegionOpt.selected = true;
          regionSelect.appendChild(newRegionOpt);
          regionSelect.value = targetRegion;
        }
      }

      // 7. 해당 지역 포인트 목록 갱신
      if (snorkyPointSelect) {
        if (matchedRegionId) {
          const filtered = allPoints.filter((p) => String(p.region_id) === String(matchedRegionId));
          if (filtered.length > 0) {
            snorkyPointSelect.innerHTML = '<option value="">스노키 포인트를 선택해 주세요</option>';
            filtered.forEach((p) => {
              const opt = document.createElement("option");
              opt.value = p.legacy_id || p.id;
              opt.setAttribute("data-point-name", p.name);
              opt.textContent = p.name;
              snorkyPointSelect.appendChild(opt);
            });
          } else {
            snorkyPointSelect.innerHTML = '<option value="">해당 지역에 등록된 공식 포인트가 없습니다. (직접 입력 권장)</option>';
          }
        } else {
          snorkyPointSelect.innerHTML = '<option value="">스노키 포인트를 선택해 주세요</option>';
        }
      }

      // 8. 포인트 모드 (is_snorky_point), 포인트 ID (point_id), 포인트명 (point_name) 복원
      const isSnorky = post.is_snorky_point === true || (!post.is_snorky_point && !!post.point_id);
      if (isSnorky) {
        setPointMode(true);
        if (snorkyPointSelect) {
          let found = false;
          for (let i = 0; i < snorkyPointSelect.options.length; i++) {
            const opt = snorkyPointSelect.options[i];
            const optVal = String(opt.value);
            const optName = opt.getAttribute("data-point-name") || opt.textContent;
            if ((post.point_id && optVal === String(post.point_id)) || (post.point_name && optName === post.point_name)) {
              snorkyPointSelect.selectedIndex = i;
              found = true;
              break;
            }
          }
          // 포인트 목록에서 일치하는 옵션을 못 찾았더라도 기존 저장된 포인트 정보를 새 옵션으로 주입하여 복원
          if (!found && (post.point_name || post.point_id)) {
            const preservedOpt = document.createElement("option");
            preservedOpt.value = post.point_id || post.point_name;
            preservedOpt.setAttribute("data-point-name", post.point_name || post.point_id);
            preservedOpt.textContent = post.point_name || post.point_id;
            preservedOpt.selected = true;
            snorkyPointSelect.appendChild(preservedOpt);
            snorkyPointSelect.value = preservedOpt.value;
          }
        }
      } else {
        setPointMode(false);
        if (customPointInput && post.point_name) {
          customPointInput.value = post.point_name;
        }
      }

      // 9. 모집 인원 (capacity) 복원
      if (capacityInput && post.capacity) {
        capacityInput.value = post.capacity;
        updateCapacityBadge(post.capacity);
      }

      // 10. 주최자 성별 & AIDA 레벨 복원
      if (post.host_gender) {
        setChipGroupValue("hostGenderGroup", "hostGenderInput", post.host_gender);
      }
      if (hostAidaLevelSelect) {
        const standardLevels = ["없음", "AIDA 1", "AIDA 2", "AIDA 3", "AIDA 4", "Instructor"];
        const savedLvl = post.host_aida_level || "없음";
        if (standardLevels.includes(savedLvl)) {
          hostAidaLevelSelect.value = savedLvl;
          if (hostAidaCustomInput) { hostAidaCustomInput.style.display = "none"; hostAidaCustomInput.value = ""; }
        } else {
          hostAidaLevelSelect.value = "기타";
          if (hostAidaCustomInput) { hostAidaCustomInput.style.display = "block"; hostAidaCustomInput.value = savedLvl; }
        }
      }

      // 11. 설명 (description) 복원
      if (descInput && post.description) {
        descInput.value = post.description;
      }

      // 12. 알림 설정 (application_notification_enabled) 복원
      if (notificationToggle) {
        notificationToggle.checked = post.application_notification_enabled !== false;
      }

      // 13. 캘린더 추가 설정 (calendar_add_enabled) 복원
      if (addToCalendarToggle) {
        if (post.calendar_add_enabled !== undefined && post.calendar_add_enabled !== null) {
          addToCalendarToggle.checked = !!post.calendar_add_enabled;
        } else {
          try {
            const { data: scheds } = await sb.from("user_diving_schedules").select("id").eq("buddy_post_id", post.id).limit(1);
            addToCalendarToggle.checked = !!(scheds && scheds.length > 0);
          } catch (_) {}
        }
      }

      // 14. 연락 방법 (contact_method) & 오픈채팅 링크 (open_chat_url) 복원
      if (post.contact_method === "later") {
        setChipGroupValue("contactMethodGroup", "contactMethodInput", "later");
        if (openChatArea) openChatArea.style.display = "none";
        if (laterNoticeArea) laterNoticeArea.style.display = "flex";
      } else {
        setChipGroupValue("contactMethodGroup", "contactMethodInput", "open_chat");
        if (openChatArea) openChatArea.style.display = "block";
        if (laterNoticeArea) laterNoticeArea.style.display = "none";
        if (openChatUrlInput && post.open_chat_url) openChatUrlInput.value = post.open_chat_url;
      }
    } catch (err) {
      console.warn("[BuddyCreate] loadEditPostData error:", err);
    }
  }

  // 초기화 및 리스너 등록
  async function init() {
    await loadRegionsAndPoints();
    if (editPostId) {
      await loadEditPostData(editPostId);
    } else {
      // 신규 등록: 현재 사용자의 프로필 성별/AIDA 레벨을 기본값으로 설정
      let userLvl = session?.user?.aidaLevel || null;
      let userGender = session?.user?.gender || null;
      if ((!userLvl || !userGender) && userId) {
        try {
          const sb = getSbClient();
          if (sb) {
            const { data } = await sb.from("user_profiles").select("aida_level, gender").eq("provider_user_id", String(userId)).maybeSingle();
            if (data?.aida_level) userLvl = data.aida_level;
            if (data?.gender) userGender = data.gender;
          }
        } catch (_) {}
      }

      if (["남성", "여성", "비공개"].includes(userGender)) {
        setChipGroupValue("hostGenderGroup", "hostGenderInput", userGender);
      }

      if (hostAidaLevelSelect && userLvl) {
        const standardLevels = ["없음", "AIDA 1", "AIDA 2", "AIDA 3", "AIDA 4", "Instructor"];
        if (standardLevels.includes(userLvl)) {
          hostAidaLevelSelect.value = userLvl;
          if (hostAidaCustomInput) { hostAidaCustomInput.style.display = "none"; hostAidaCustomInput.value = ""; }
        } else {
          hostAidaLevelSelect.value = "기타";
          if (hostAidaCustomInput) { hostAidaCustomInput.style.display = "block"; hostAidaCustomInput.value = userLvl; }
        }
      }
    }
  }

  if (window.supabase) {
    init();
  } else {
    window.addEventListener("snorky:supabase-ready", init, { once: true });
  }
})();
