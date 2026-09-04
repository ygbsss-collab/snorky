(function (global) {
  "use strict";

  // 기본/공통 표시 순서가 지정된 광역 대분류 목록
  const ORDERED_MAJORS = ["강원", "경북", "경남", "전남", "서해", "제주", "울산", "부산", "수도권"];

  // 캐시된 데이터
  let cachedRegions = null;
  let cachedGroups = null;
  let loadPromise = null;

  // KMA 육상구역코드 또는 명칭 기반 대분류 자동 판별
  function resolveMajorRegion(r) {
    const l = String(r?.land_warning_area_code || "").trim();
    const n = String(r?.name || "").trim();

    // 1. KMA 육상구역코드 접두사
    if (l.startsWith("L102")) return "강원";
    if (l.startsWith("L107")) return "경북";
    if (l.startsWith("L108")) return "경남";
    if (l.startsWith("L105")) return "전남";
    if (l.startsWith("L103") || l.startsWith("L101")) return "서해";
    if (l.startsWith("L116")) return "울산";
    if (l.startsWith("L109")) return "제주";
    if (l.startsWith("L114")) return "부산";
    if (l.startsWith("L110") || l.startsWith("L100")) return "수도권";
    if (l.startsWith("L106")) return "전북";
    if (l.startsWith("L104")) return "충북";

    // 2. 명칭 키워드 매칭 fallback
    if (/강릉|고성|동해|삼척|속초|양양|태백|원주|춘천/.test(n)) return "강원";
    if (/영덕|울진|포항|울릉|경주|안동|영천/.test(n)) return "경북";
    if (/거제|남해|욕지|통영|창원|사천|마산|진해|김해/.test(n)) return "경남";
    if (/여수|완도|진도|해남|영광|신안|목포|순천|나주/.test(n)) return "전남";
    if (/태안|옹진|보령|서산|당진|인천|강화/.test(n)) return "서해";
    if (/울산/.test(n)) return "울산";
    if (/제주|서귀포/.test(n)) return "제주";
    if (/부산|기장|해운대/.test(n)) return "부산";
    if (/서울|경기|수원|성남|고양|용인/.test(n)) return "수도권";

    return "기타";
  }

  // Supabase regions 테이블 데이터 로드 및 대분류/소분류 자동 그룹화
  async function loadRegions(sbClient) {
    if (cachedGroups && cachedRegions) return { regions: cachedRegions, groups: cachedGroups };
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      const sb = sbClient || (window.getSnorkySupabase ? window.getSnorkySupabase() : window.snorkySupabase);
      let list = [];
      if (sb) {
        try {
          const { data, error } = await sb
            .from("regions")
            .select("id, name, warning_area_code, land_warning_area_code")
            .order("name");
          if (!error && Array.isArray(data) && data.length > 0) {
            list = data;
          }
        } catch (err) {
          console.warn("[SNORKYBuddyRegions] Failed to fetch regions from Supabase:", err);
        }
      }

      // Supabase 조회 실패 시 기본 방어 데이터 (기존 22개 시·군)
      if (!list.length) {
        list = [
          { id: 1, name: "강릉", land_warning_area_code: "L1022500" },
          { id: 2, name: "고성", land_warning_area_code: "L1022200" },
          { id: 3, name: "삼척", land_warning_area_code: "L1022000" },
          { id: 12, name: "동해", land_warning_area_code: "L1021900" },
          { id: 20, name: "속초", land_warning_area_code: "L1022100" },
          { id: 4, name: "영덕", land_warning_area_code: "L1072200" },
          { id: 5, name: "울진", land_warning_area_code: "L1073000" },
          { id: 10, name: "포항", land_warning_area_code: "L1072400" },
          { id: 16, name: "울릉도", land_warning_area_code: "L1072100" },
          { id: 13, name: "울산", land_warning_area_code: "L1160000" },
          { id: 17, name: "남해군", land_warning_area_code: "L1082400" },
          { id: 18, name: "거제", land_warning_area_code: "L1082200" },
          { id: 19, name: "욕지도", land_warning_area_code: "L1082000" },
          { id: 24, name: "통영", land_warning_area_code: "L1082000" },
          { id: 30, name: "여수", land_warning_area_code: "L1051000" },
          { id: 34, name: "완도", land_warning_area_code: "L1053300" },
          { id: 35, name: "진도", land_warning_area_code: "L1052300" },
          { id: 36, name: "해남", land_warning_area_code: "L1053200" },
          { id: 40, name: "영광", land_warning_area_code: "L1052700" },
          { id: 15, name: "태안", land_warning_area_code: "L1031100" },
          { id: 62, name: "옹진", land_warning_area_code: "L1013600" },
          { id: 11, name: "제주", land_warning_area_code: "L1090000" }
        ];
      }

      cachedRegions = list;

      const groups = {};
      list.forEach((r) => {
        const major = resolveMajorRegion(r);
        if (!groups[major]) groups[major] = [];
        groups[major].push(r);
      });

      cachedGroups = groups;
      return { regions: cachedRegions, groups: cachedGroups };
    })();

    return loadPromise;
  }

  // 대분류 목록 반환 (정렬 적용)
  function getMajorRegionNames() {
    if (!cachedGroups) return ORDERED_MAJORS;
    const existing = Object.keys(cachedGroups);
    const sorted = [];
    ORDERED_MAJORS.forEach((m) => {
      if (existing.includes(m)) sorted.push(m);
    });
    existing.forEach((m) => {
      if (!sorted.includes(m)) sorted.push(m);
    });
    return sorted;
  }

  // 특정 대분류 산하 세부지역명 목록 반환
  function getSubRegionNames(majorName) {
    if (!cachedGroups || !cachedGroups[majorName]) return [];
    return cachedGroups[majorName].map((r) => r.name);
  }

  // 특정 대분류 산하 세부지역 레코드 목록 반환 ({ id, name, ... })
  function getSubRegionRecords(majorName) {
    if (!cachedGroups || !cachedGroups[majorName]) return [];
    return cachedGroups[majorName];
  }

  // 전체 세부지역 레코드 목록 반환
  function getAllRegions() {
    return cachedRegions || [];
  }

  // 실내 다이빙 센터 지역 트리 추출 (실제 등록된 실내센터 데이터 기준)
  function getIndoorCenterRegions() {
    const centers = (window.SNORKYIndoorCenters && Array.isArray(window.SNORKYIndoorCenters))
      ? window.SNORKYIndoorCenters
      : [
          { id: "deepstation", name: "딥스테이션", region: "경기", subRegion: "용인시" },
          { id: "k26", name: "K26 잠수풀", region: "경기", subRegion: "가평군" },
          { id: "paradive35", name: "파라다이브35", region: "경기", subRegion: "시흥시" }
        ];

    const majorOrder = ["경기", "서울", "인천", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주", "부산", "울산", "대구", "대전", "광주", "세종"];
    const groups = {};

    centers.forEach((c) => {
      const reg = (c.region || "기타").trim();
      const sub = (c.subRegion || "").trim().replace(/(시|군|구)$/, "");
      const centerName = (c.name || "").trim();
      const labelText = sub ? `${sub} - ${centerName}` : centerName;

      if (!groups[reg]) groups[reg] = [];
      groups[reg].push({
        id: c.id,
        name: labelText,
        centerId: c.id,
        centerName: c.name,
        region: reg,
        subRegion: c.subRegion || ""
      });
    });

    const majors = [];
    majorOrder.forEach((m) => {
      if (groups[m] && groups[m].length > 0) majors.push(m);
    });
    Object.keys(groups).forEach((m) => {
      if (!majors.includes(m)) majors.push(m);
    });

    return { majors, groups };
  }

  // 활동 구분별 지역 데이터 반환 (스노클링/프리다이빙 vs 실내다이빙)
  function getRegionsForActivity(activityType) {
    if (activityType === "실내다이빙") {
      return getIndoorCenterRegions();
    }
    return {
      majors: getMajorRegionNames(),
      groups: cachedGroups || {}
    };
  }

  // 한 줄 계층형 <select> 렌더링 헬퍼 (등록/검색/알림 화면 공통 재사용)
  function populateHierarchicalRegionSelect(selectElement, activityType, options = {}) {
    if (!selectElement) return;

    const {
      selectedValue = "",
      placeholder = "지역을 선택해 주세요",
      includeMajorOption = false
    } = options;

    selectElement.innerHTML = "";

    // 1) 기본 플레이스홀더 옵션
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = placeholder;
    selectElement.appendChild(defaultOpt);

    // 활동 구분이 미선택인 경우 플레이스홀더만 유지
    if (!activityType) {
      return;
    }

    const { majors, groups } = getRegionsForActivity(activityType);
    const isIndoor = activityType === "실내다이빙";

    majors.forEach((major) => {
      const items = groups[major] || [];
      if (items.length === 0) return;

      const optgroup = document.createElement("optgroup");
      optgroup.label = major;

      // 검색/알림에서 광역 단위 선택(예: 경기 전체, 강원 전체) 지원
      if (includeMajorOption) {
        const majorOpt = document.createElement("option");
        majorOpt.value = major;
        majorOpt.setAttribute("data-is-major", "true");
        majorOpt.textContent = `${major} 전체`;
        if (selectedValue === major) {
          majorOpt.selected = true;
        }
        optgroup.appendChild(majorOpt);
      }

      items.forEach((item) => {
        const opt = document.createElement("option");
        const val = isIndoor ? (item.centerId || item.id) : (typeof item === "string" ? item : item.name);
        opt.value = val;
        if (item.id !== undefined && item.id !== null) {
          opt.setAttribute("data-region-id", item.id);
        }
        if (item.centerId) {
          opt.setAttribute("data-center-id", item.centerId);
        }
        if (item.centerName) {
          opt.setAttribute("data-center-name", item.centerName);
        }
        if (item.region) {
          opt.setAttribute("data-region", item.region);
        }
        if (item.subRegion) {
          opt.setAttribute("data-sub-region", item.subRegion);
        }

        opt.textContent = item.name || val;

        if (selectedValue) {
          if (
            selectedValue === val ||
            (item.centerId && selectedValue === item.centerId) ||
            (item.centerName && selectedValue === item.centerName) ||
            (item.name && selectedValue === item.name)
          ) {
            opt.selected = true;
          }
        }
        optgroup.appendChild(opt);
      });

      selectElement.appendChild(optgroup);
    });

    if (selectedValue) {
      selectElement.value = selectedValue;
    }
  }

  // 활동 미선택 상태에서 지역 클릭 시 안내 이벤트 바인딩
  function bindActivityGuard(selectElement, getActivityFn, onWarnFn) {
    if (!selectElement) return;

    const checkAndWarn = (e) => {
      const act = typeof getActivityFn === "function" ? getActivityFn() : "";
      if (!act) {
        if (typeof onWarnFn === "function") {
          onWarnFn("먼저 활동 구분을 선택해 주세요.");
        }
        selectElement.blur();
        if (e && typeof e.preventDefault === "function") {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    selectElement.addEventListener("mousedown", (e) => {
      const act = typeof getActivityFn === "function" ? getActivityFn() : "";
      if (!act) checkAndWarn(e);
    });

    selectElement.addEventListener("focus", () => {
      const act = typeof getActivityFn === "function" ? getActivityFn() : "";
      if (!act) checkAndWarn();
    });
  }

  global.SNORKYBuddyRegions = {
    loadRegions,
    resolveMajorRegion,
    getMajorRegionNames,
    getSubRegionNames,
    getSubRegionRecords,
    getAllRegions,
    getIndoorCenterRegions,
    getRegionsForActivity,
    populateHierarchicalRegionSelect,
    bindActivityGuard
  };
})(window);
