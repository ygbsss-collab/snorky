(function (global) {
  "use strict";

  // 1. 3개 공인 협회 (AIDA, PADI, Molchanovs)
  const CERTIFICATION_AGENCIES = Object.freeze(["AIDA", "PADI", "Molchanovs"]);

  // 2. 각 기관별 프리다이빙 공식 자격명 및 SNORKY 레벨 매핑
  const OFFICIAL_FREEDIVING_CERTIFICATIONS = Object.freeze({
    AIDA: [
      { officialName: "AIDA 1", snorkyLevel: "AIDA 1", levelNumber: 1 },
      { officialName: "AIDA 2", snorkyLevel: "AIDA 2", levelNumber: 2 },
      { officialName: "AIDA 3", snorkyLevel: "AIDA 3", levelNumber: 3 },
      { officialName: "AIDA 4", snorkyLevel: "AIDA 4", levelNumber: 4 },
      { officialName: "AIDA Instructor", snorkyLevel: "AIDA Instructor", levelNumber: 5 }
    ],
    PADI: [
      { officialName: "Basic Freediver", snorkyLevel: "PADI 1", levelNumber: 1 },
      { officialName: "Freediver", snorkyLevel: "PADI 2", levelNumber: 2 },
      { officialName: "Advanced Freediver", snorkyLevel: "PADI 3", levelNumber: 3 },
      { officialName: "Master Freediver", snorkyLevel: "PADI 4", levelNumber: 4 },
      { officialName: "Freediver Instructor", snorkyLevel: "PADI Instructor", levelNumber: 5 }
    ],
    Molchanovs: [
      { officialName: "Wave 1 / Lap 1", snorkyLevel: "Molchanovs 1", levelNumber: 1 },
      { officialName: "Wave 2 / Lap 2", snorkyLevel: "Molchanovs 2", levelNumber: 2 },
      { officialName: "Wave 3 / Lap 3", snorkyLevel: "Molchanovs 3", levelNumber: 3 },
      { officialName: "Wave 4 / Lap 4", snorkyLevel: "Molchanovs 4", levelNumber: 4 },
      { officialName: "Wave Instructor", snorkyLevel: "Molchanovs Instructor", levelNumber: 5 }
    ]
  });

  // 3. 기존 SNORKY 레벨 목록 (하위 호환)
  const CERTIFICATION_ITEMS = Object.freeze({
    AIDA: ["AIDA 1", "AIDA 2", "AIDA 3", "AIDA 4", "AIDA Instructor"],
    PADI: ["PADI 1", "PADI 2", "PADI 3", "PADI 4", "PADI Instructor"],
    Molchanovs: ["Molchanovs 1", "Molchanovs 2", "Molchanovs 3", "Molchanovs 4", "Molchanovs Instructor"]
  });

  const ALL_CERTIFICATIONS = Object.freeze([
    ...CERTIFICATION_ITEMS.AIDA,
    ...CERTIFICATION_ITEMS.PADI,
    ...CERTIFICATION_ITEMS.Molchanovs
  ]);

  // 공식 자격명 -> 기존 SNORKY 레벨 매핑
  function mapOfficialToSnorkyLevel(agency, officialName) {
    if (!agency || !officialName) return "";
    const list = OFFICIAL_FREEDIVING_CERTIFICATIONS[agency];
    if (!list) return String(officialName).trim();
    const cleanOfficial = String(officialName).trim();
    const found = list.find((item) => item.officialName === cleanOfficial || item.snorkyLevel === cleanOfficial);
    return found ? found.snorkyLevel : cleanOfficial;
  }

  // 기존 SNORKY 레벨 -> 공식 자격명 역매핑
  function mapSnorkyLevelToOfficial(agency, snorkyLevel) {
    if (!agency || !snorkyLevel) return "";
    const list = OFFICIAL_FREEDIVING_CERTIFICATIONS[agency];
    if (!list) return String(snorkyLevel).trim();
    const cleanSnorky = String(snorkyLevel).replace(/\s*✓$/, "").trim();
    const found = list.find((item) => item.snorkyLevel === cleanSnorky || item.officialName === cleanSnorky);
    return found ? found.officialName : cleanSnorky;
  }

  // 4. 버디 모집/공고찾기/공고알림 공통 레벨 조건
  const COMMON_LEVEL_CONDITIONS = Object.freeze([
    "전체",
    "레벨 1 이상",
    "레벨 2 이상",
    "레벨 3 이상",
    "레벨 4 이상",
    "Instructor"
  ]);

  // 5. 자격 레벨 숫자 파싱 (0: 없음/미설정, 1~4: 레벨 1~4, 5: Instructor)
  function parseCertificationLevel(certOrLevel) {
    if (!certOrLevel || typeof certOrLevel !== "string") return 0;
    const clean = certOrLevel.replace(/\s*✓$/, "").trim();
    if (!clean || clean === "없음" || clean === "미설정" || clean === "레벨 없음" || clean === "무관" || clean === "전체") {
      return 0;
    }
    if (/instructor/i.test(clean)) return 5;
    if (/(?:master|wave\s*4|lap\s*4|4)/i.test(clean)) return 4;
    if (/(?:advanced|wave\s*3|lap\s*3|3)/i.test(clean)) return 3;
    if (/(?:freediver|wave\s*2|lap\s*2|2)/i.test(clean) && !/basic/i.test(clean)) return 2;
    if (/(?:basic|wave\s*1|lap\s*1|1)/i.test(clean)) return 1;
    return 0;
  }

  // 5. 공통 조건(condition)에 실제 자격(certOrLevel)이 부합하는지 검사
  // 매칭:
  // - 레벨 1 이상 → 각 협회 1 이상 + Instructor
  // - 레벨 2 이상 → 각 협회 2 이상 + Instructor
  // - 레벨 3 이상 → 각 협회 3 이상 + Instructor
  // - 레벨 4 이상 → AIDA 4 / Molchanovs 4 / 각 협회 Instructor
  // - Instructor → 각 협회 Instructor만
  function matchCommonLevel(condition, certOrLevel) {
    const cond = (condition || "").trim();
    if (!cond || cond === "전체" || cond === "무관" || cond === "전체 (무관)") {
      return true;
    }

    const clean = String(certOrLevel || "").replace(/\s*✓$/, "").trim();
    if (!clean || clean === "없음" || clean === "미설정" || clean === "레벨 없음" || clean === "무관") {
      return cond === "없음";
    }

    const isInst = /instructor/i.test(clean);
    if (cond === "Instructor") {
      return isInst;
    }
    if (isInst) {
      return true; // Instructor는 모든 "레벨 N 이상" 조건을 만족함
    }

    const numMatch = clean.match(/(\d+)/);
    const num = numMatch ? parseInt(numMatch[1], 10) : 0;
    if (!num) return false;

    if (cond === "레벨 4 이상") {
      return num >= 4; // AIDA 4, Molchanovs 4
    }
    if (cond === "레벨 3 이상") {
      return num >= 3;
    }
    if (cond === "레벨 2 이상") {
      return num >= 2;
    }
    if (cond === "레벨 1 이상") {
      return num >= 1;
    }

    // 하위 호환
    if (cond === "없음") return false;
    return clean === cond;
  }

  // 6. 공고 조건(postRequirement)과 검색/알림 필터 조건(filterCondition) 매칭
  function matchPostLevelRequirement(filterCondition, postRequirement) {
    const fCond = (filterCondition || "").trim();
    if (!fCond || fCond === "전체" || fCond === "무관" || fCond === "전체 (무관)") {
      return true;
    }

    const pReq = (postRequirement || "").trim();
    if (!pReq || pReq === "전체" || pReq === "무관" || pReq === "전체 (무관)") {
      // 공고에 레벨 조건이 없거나 무관이면 어떤 필터로 검색하든 매칭됨
      return true;
    }

    // 둘의 공통 조건명이 같으면 매칭
    if (fCond === pReq) {
      return true;
    }

    // 기존 데이터 호환: 공고에 "AIDA 2" 등으로 저장된 경우
    const postLevelNum = parseCertificationLevel(pReq);
    if (postLevelNum > 0 && !pReq.includes("이상")) {
      return matchCommonLevel(fCond, pReq);
    }

    // 공통 조건 단계 비교:
    const fLevel = parseCertificationLevel(fCond);
    const pLevel = parseCertificationLevel(pReq);
    if (fLevel > 0 && pLevel > 0) {
      return pLevel >= fLevel;
    }

    return false;
  }

  // 7. 인증 승인 상태 확인 (APPROVED만 인증마크 표시)
  function isApprovedStatus(status) {
    if (!status) return false;
    const s = String(status).trim().toLowerCase();
    return ["approved", "verified", "complete", "인증완료"].includes(s);
  }

  function checkIsVerified(target) {
    if (!target) return false;
    if (Array.isArray(target.certifications)
      && target.certifications.some((c) => isApprovedStatus(c?.status))) {
      return true;
    }
    const status = target.certificationStatus || target.qualificationStatus || target.verificationStatus || target.certification_status || target.qualification_status;
    if (status) return isApprovedStatus(status);
    if (target.certificationVerified === true || target.aidaVerified === true || target.isVerified === true || target.isCertified === true) {
      return true;
    }
    return false;
  }

  function getCertificationApplicationState(target) {
    if (!target) return "NONE";
    if (checkIsVerified(target)) return "APPROVED";
    const status = String(target.certificationStatus || target.qualificationStatus || target.verificationStatus || target.certification_status || target.qualification_status || "").trim().toLowerCase();
    return ["pending", "reviewing", "in_review", "검토중", "검토대기중"].includes(status) ? "PENDING" : "NONE";
  }

  function cleanDisplayLevel(value) {
    const raw = String(value || "").replace(/\s*✓$/u, "").trim();
    if (!raw || ["없음", "미설정", "레벨 없음", "무관", "전체", "무관 (전체)"].includes(raw) || raw.includes("이상")) return "";
    return raw;
  }

  function inferAgencyFromLevel(value) {
    const match = String(value || "").trim().match(/^(AIDA|PADI|Molchanovs)\b/i);
    if (!match) return "";
    return CERTIFICATION_AGENCIES.find((agency) => agency.toLowerCase() === match[1].toLowerCase()) || "";
  }

  function resolveDisplayLevel(target, fallbackActivityLevel = "") {
    const profile = target || {};
    const approvedCertification = Array.isArray(profile.certifications)
      ? profile.certifications.find((item) => isApprovedStatus(item?.status))
      : null;
    const explicitStatus = profile.certificationStatus || profile.qualificationStatus || profile.verificationStatus || profile.certification_status || profile.qualification_status;
    const hasExplicitCertificationState = Boolean(explicitStatus) || Array.isArray(profile.certifications);
    const approved = hasExplicitCertificationState
      ? checkIsVerified(profile)
      : (checkIsVerified(profile) || profile.isVerified === true || profile.isVerified === "true");
    const agency = profile.certificationOrganization || profile.certification_organization || approvedCertification?.organization || approvedCertification?.agency || "";
    const certifiedRaw = approvedCertification?.snorkyLevel
      || approvedCertification?.snorky_level
      || approvedCertification?.level
      || profile.certifiedSnorkyLevel
      || profile.certified_snorky_level
      || profile.certificationLevel
      || profile.certification_level
      || profile.aidaLevel
      || profile.aida_level;
    const resolvedAgency = agency || inferAgencyFromLevel(certifiedRaw);
    const certifiedLevel = cleanDisplayLevel(mapOfficialToSnorkyLevel(resolvedAgency, certifiedRaw));
    const activityLevel = cleanDisplayLevel(
      profile.activityLevel
      || profile.activity_level
      || profile.aidaLevel
      || profile.aida_level
      || fallbackActivityLevel
    );

    if (approved) return { level: certifiedLevel || "없음", isVerified: Boolean(certifiedLevel) };
    return { level: activityLevel || "없음", isVerified: false };
  }

  function renderCertificationMark(level = "") {
    const label = String(level || "").trim();
    return `<span class="snorky-certification-mark" aria-label="인증완료">${label ? `${label} ` : ""}✓</span>`;
  }

  // 8. 표시용 자격 레벨 문자열 반환 (인증마크는 renderCertificationMark로 별도 렌더링)
  function formatDisplayCertification(certOrLevel, isVerified) {
    const raw = String(certOrLevel || "").replace(/\s*✓$/, "").trim();
    if (!raw || raw === "없음" || raw === "미설정" || raw === "레벨 없음") {
      return "레벨 없음";
    }
    return raw;
  }

  // 9. 공고 상세용 참석자 레벨 조건 표시
  function formatParticipantLevelRequirement(levelReq) {
    const raw = String(levelReq || "").trim();
    if (!raw || raw === "무관" || raw === "전체" || raw === "무관 (전체)") {
      return "무관 (전체)";
    }
    return raw;
  }

  // 10. 프로필 편집용 실제 자격 셀렉트박스 옵션 HTML 생성
  function renderCertificationSelectOptions(currentValue = "") {
    const clean = String(currentValue || "").replace(/\s*✓$/, "").trim();
    let html = `<option value="없음"${!clean || clean === "없음" ? " selected" : ""}>미설정</option>`;
    for (const agency of CERTIFICATION_AGENCIES) {
      html += `<optgroup label="${agency}">`;
      for (const item of CERTIFICATION_ITEMS[agency]) {
        const isSel = clean === item ? " selected" : "";
        html += `<option value="${item}"${isSel}>${item}</option>`;
      }
      html += `</optgroup>`;
    }
    return html;
  }

  // 11. 버디 모집용/검색용 공통 레벨 셀렉트박스 옵션 HTML 생성
  function renderCommonLevelSelectOptions(currentValue = "", isSearch = false) {
    const clean = String(currentValue || "").trim();
    const defaultLabel = isSearch ? "전체 (무관)" : "무관 (전체)";
    const defaultVal = isSearch ? "" : "무관";
    let html = `<option value="${defaultVal}"${!clean || clean === defaultVal || clean === "전체" || clean === "무관" ? " selected" : ""}>${defaultLabel}</option>`;
    for (const cond of COMMON_LEVEL_CONDITIONS) {
      if (cond === "전체") continue;
      const isSel = clean === cond ? " selected" : "";
      html += `<option value="${cond}"${isSel}>${cond}</option>`;
    }
    return html;
  }

  // 12. 기관별 공식 프리다이빙 자격명 셀렉트박스 옵션 HTML 생성
  function renderOfficialLevelSelectOptions(agency, currentOfficialValue = "") {
    if (!agency || !OFFICIAL_FREEDIVING_CERTIFICATIONS[agency]) {
      return '<option value="">인증기관을 먼저 선택해 주세요</option>';
    }
    const list = OFFICIAL_FREEDIVING_CERTIFICATIONS[agency];
    const clean = String(currentOfficialValue || "").trim();
    let html = '<option value="">자격레벨 선택</option>';
    for (const item of list) {
      const isSel = clean === item.officialName || clean === item.snorkyLevel ? " selected" : "";
      html += `<option value="${item.officialName}"${isSel}>${item.officialName}</option>`;
    }
    return html;
  }

  const SNORKYCertification = Object.freeze({
    AGENCIES: CERTIFICATION_AGENCIES,
    ITEMS: CERTIFICATION_ITEMS,
    ALL_CERTIFICATIONS,
    OFFICIAL_FREEDIVING_CERTIFICATIONS,
    COMMON_LEVEL_CONDITIONS,
    mapOfficialToSnorkyLevel,
    mapSnorkyLevelToOfficial,
    parseCertificationLevel,
    matchCommonLevel,
    matchPostLevelRequirement,
    isApprovedStatus,
    checkIsVerified,
    getCertificationApplicationState,
    resolveDisplayLevel,
    renderCertificationMark,
    formatDisplayCertification,
    formatParticipantLevelRequirement,
    renderCertificationSelectOptions,
    renderCommonLevelSelectOptions,
    renderOfficialLevelSelectOptions
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SNORKYCertification;
  }
  global.SNORKYCertification = SNORKYCertification;
})(typeof window !== "undefined" ? window : globalThis);
