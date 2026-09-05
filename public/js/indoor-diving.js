/**
 * SNORKY Indoor Diving Center Module v20260904_v1
 * 실내 다이빙풀 검색 & 센터 상세 UI 프로토타입
 */
(function () {
  "use strict";

  // 1. 임시/폴백 기본 테스트 데이터 (3개 센터)
  const INDOOR_CENTERS = [
    {
      id: "deepstation",
      name: "딥스테이션",
      region: "경기",
      subRegion: "용인시",
      lat: 37.2882,
      lng: 127.1856,
      maxDepth: 36,
      hasFreediving: true,
      hasScuba: true,
      hasParking: true,
      status: "운영중",
      businessHours: "08:00 ~ 22:00 (입장마감 20:00)",
      holiday: "연중무휴",
      address: "경기 용인시 처인구 포곡읍 성산로 523",
      parkingInfo: "센터 전용 야외 주차장 완비 (이용객 무료)",
      phone: "031-333-8888",
      facilities: "국내 최대 36m 딥다이빙 풀, 수온 29~30℃ 유지, 프리다이빙/스쿠버 장비 렌탈샵, 핀샤워실/드라이기 완비, 카페테리아, 관람 라운지",
      homepage: "https://www.deepstation.kr",
      mapGuide: "에버랜드 인근, 전용 주차장 무료 이용 가능",
      imageUrl: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop&q=80",
      description: "수심 36m 아시아 최고 수준의 딥다이빙 시설과 쾌적한 전용 라운지",
      featureShort: "수심 36m 아시아 최고 수준의 딥다이빙풀 및 전용 라운지",
      featureFull: "아시아 최고 수심 36m 실내 다이빙풀로, 초심자부터 전문 프리다이버까지 훈련 가능한 단계별 수심 플랫폼과 안전 시설이 완비되어 있습니다.",
      buddyCondition: "2인 1조 버디 동반 필수 (자격증 소지자 또는 강사 동반)",
      facilityShort: "사계절 30℃ 수온 유지 · 핀샤워실 및 풀세트 렌탈샵 완비",
      poolTemp: "사계절 29℃ ~ 30℃ 항온 유지",
      poolSpecs: "최대 36m 딥풀 · 1.3/2.5/5/16/36m 단계별 플랫폼 · 수중 포토존",
      priceShort: "평일 44,000원 / 주말·공휴일 66,000원 (사전예약제)",
      priceFull: "평일 44,000원 / 주말·공휴일 66,000원 (3시간 기준 이용권)",
      rentalInfo: "슈트, 마스크, 스노클, 롱핀 렌탈 지원 (현장 대여 가능)",
      reservationInfo: "100% 공식 홈페이지 사전 예약제 운영 (현장 접수 불가)"
    },
    {
      id: "k26",
      name: "K26 잠수풀",
      region: "경기",
      subRegion: "가평군",
      lat: 37.7126,
      lng: 127.4646,
      maxDepth: 26,
      hasFreediving: true,
      hasScuba: true,
      hasParking: true,
      status: "운영중",
      businessHours: "평일 09:00 ~ 21:00 / 주말 06:00 ~ 21:00",
      holiday: "연중무휴",
      address: "경기 가평군 청평면 고성리 59-1",
      parkingInfo: "센터 앞 전용 주차장 (무료 주차 가능)",
      phone: "031-585-5757",
      facilities: "아시아 최초 26m 잠수풀, 단계별 플랫폼(1.3m, 2.5m, 5m, 10m, 26m), 에어포켓 트레이닝 룸, 청평호 전망 라운지",
      homepage: "http://k-26.com",
      mapGuide: "청평호 인근 위치, 자차 이동 권장",
      imageUrl: "https://images.unsplash.com/photo-1682687220063-4742bd7fd538?w=800&auto=format&fit=crop&q=80",
      description: "26m 수심과 다양한 수심별 트레이닝 플랫폼을 갖춘 국내 대표 잠수풀",
      featureShort: "26m 수심과 계단식 트레이닝 플랫폼을 갖춘 국내 대표 잠수풀",
      featureFull: "국내 최초 26m 딥풀로 1.3m, 2.5m, 5m, 10m, 26m 계단식 구조 및 수중 에어포켓 트레이닝 룸을 갖추고 있습니다.",
      buddyCondition: "2인 이상 버디 필수 (라이선스 소지자 입장 가능)",
      facilityShort: "29~30℃ 수온 유지 · 청평호 전망 라운지 · 풀세트 렌탈샵",
      poolTemp: "29℃ ~ 30℃ 항온 유지",
      poolSpecs: "최대 26m 계단식 구조 (1.3m~26m) · 에어포켓 트레이닝 룸",
      priceShort: "평일 33,000원 / 주말 44,000원 (3시간 기준)",
      priceFull: "평일 33,000원 / 주말 44,000원 (3시간 기준)",
      rentalInfo: "스쿠버 풀세트, 프리다이빙 장비 렌탈샵 완비",
      reservationInfo: "사전 예약 및 현장 입장 가능 (주말 사전 예약 권장)"
    },
    {
      id: "paradive35",
      name: "파라다이브35",
      region: "경기",
      subRegion: "시흥시",
      lat: 37.3245,
      lng: 126.6853,
      maxDepth: 35,
      hasFreediving: true,
      hasScuba: true,
      hasParking: true,
      status: "운영중",
      businessHours: "09:00 ~ 22:00 (입장마감 20:30)",
      holiday: "매주 월요일 정기휴무",
      address: "경기 시흥시 거북섬둘레길 10",
      parkingInfo: "건물 지하 전용 주차장 (3시간 무료 지원)",
      phone: "031-432-3535",
      facilities: "35m 초심도 딥풀, 30℃ 사계절 항온 유지, 수중 동굴/터널 코스, 최신 스쿠버/프리다이빙 렌탈 장비, 스마트 락커 시스템",
      homepage: "https://paradive35.com",
      mapGuide: "시흥 거북섬 웨이브파크 인근 위치",
      imageUrl: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&auto=format&fit=crop&q=80",
      description: "35m 딥풀과 수중 터널/동굴 어트랙션이 마련된 신규 복합 다이빙 시설",
      featureShort: "35m 초심도 딥풀과 인공 해저동굴 및 수중 터널 어트랙션",
      featureFull: "35m 초심도 풀과 함께 이색적인 수중 터널 및 동굴 코스가 조성된 최신형 복합 다이빙 시설입니다.",
      buddyCondition: "버디 동반 필수 (미동반 시 강사 인솔 프로그램 필수)",
      facilityShort: "30℃ 사계절 항온 · 스마트 락커 시스템 · 최신 렌탈 장비",
      poolTemp: "30℃ 사계절 항온 유지",
      poolSpecs: "최대 35m 초심도 딥풀 · 인공 해저동굴 & 수중 터널 코스",
      priceShort: "평일 40,000원 / 주말 60,000원 (입장마감 20:30)",
      priceFull: "평일 40,000원 / 주말 60,000원 (입장마감 20:30)",
      rentalInfo: "최신 프리/스쿠버 장비 렌탈 및 스마트 락커 시스템",
      reservationInfo: "공식 홈페이지 및 네이버 사전 예약제 운영"
    }
  ];

  window.SNORKYIndoorCenters = window.SNORKYIndoorCenters || INDOOR_CENTERS;

  // DB 행 데이터를 JS 센터 객체로 변환
  function mapDbRowToCenter(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      region: row.region,
      subRegion: row.sub_region || "",
      lat: row.lat,
      lng: row.lng,
      maxDepth: row.max_depth ? Number(row.max_depth) : null,
      hasFreediving: Boolean(row.has_freediving),
      hasScuba: Boolean(row.has_scuba),
      hasParking: Boolean(row.has_parking),
      status: row.status || "운영중",
      businessHours: row.business_hours || "",
      holiday: row.holiday || "",
      address: row.address || "",
      parkingInfo: row.parking_info || "",
      phone: row.phone || "",
      facilities: row.facilities || "",
      homepage: row.homepage || "",
      mapGuide: row.map_guide || "",
      imageUrl: row.image_url || "",
      description: row.description || "",
      featureShort: row.feature_short || "",
      featureFull: row.feature_full || "",
      buddyCondition: row.buddy_condition || "",
      facilityShort: row.feature_short || "",
      poolTemp: row.pool_temp || "",
      poolSpecs: row.pool_specs || "",
      priceShort: row.price_short || "",
      priceFull: row.price_full || "",
      rentalInfo: row.rental_info || "",
      reservationInfo: row.reservation_info || "",
      sortOrder: row.sort_order || 0,
      images: []
    };
  }

  // Supabase 실내센터 데이터 비동기 로드
  async function loadIndoorCenters(sbClient) {
    try {
      const sb = sbClient || (window.getSnorkySupabase && window.supabase?.createClient ? window.getSnorkySupabase() : window.snorkySupabase);
      if (!sb) return window.SNORKYIndoorCenters || INDOOR_CENTERS;
      const { data, error } = await sb
        .from("indoor_diving_centers")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        let imagesMap = {};
        try {
          const { data: imgData } = await sb
            .from("indoor_center_images")
            .select("*")
            .order("sort_order", { ascending: true });
          if (Array.isArray(imgData)) {
            imgData.forEach((img) => {
              if (!imagesMap[img.center_id]) imagesMap[img.center_id] = [];
              imagesMap[img.center_id].push(img);
            });
          }
        } catch (_) {}

        const loaded = data.map((row) => {
          const c = mapDbRowToCenter(row);
          c.images = imagesMap[row.id] || [];
          if (c.images.length > 0) {
            const primaryImg = c.images.find((im) => im.is_primary) || c.images[0];
            if (primaryImg && primaryImg.storage_path) {
              const pubUrl = sb.storage.from("point-images").getPublicUrl(primaryImg.storage_path).data?.publicUrl;
              if (pubUrl) c.imageUrl = pubUrl;
            }
          }
          return c;
        });

        window.SNORKYIndoorCenters = loaded;
        window.dispatchEvent(new CustomEvent("snorky:indoor-centers-updated", { detail: loaded }));
        return loaded;
      }
    } catch (err) {
      console.warn("[SNORKYIndoor] Supabase centers load error:", err);
    }

    window.SNORKYIndoorCenters = window.SNORKYIndoorCenters || INDOOR_CENTERS;
    return window.SNORKYIndoorCenters;
  }
  const state = {
    searchQuery: "",
    selectedRegion: "전체",
    selectedSubRegion: "전체",
    depthRange: "all", // 'all' | 'under5' | '5to10' | '10to20' | 'over20'
    onlyFreediving: false,
    onlyScuba: false,
    onlyParking: false,
    activeTab: null, // null | 'region' | 'depth' | 'facility'
    sortBy: "depth" // 'depth' | 'name'
  };

  const REGION_OPTIONS = ["전체", "경기", "서울", "인천", "충청", "경상", "전라", "강원", "제주"];

  const DEPTH_OPTIONS = [
    { value: "all", label: "전체" },
    { value: "under5", label: "5m 이하" },
    { value: "5to10", label: "5~10m" },
    { value: "10to20", label: "10~20m" },
    { value: "over20", label: "20m 이상" }
  ];

  const FACILITY_OPTIONS = [
    { key: "freediving", label: "프리다이빙" },
    { key: "scuba", label: "스쿠버" },
    { key: "parking", label: "주차가능" }
  ];

  // DOM Elements
  let searchInput, searchClearBtn, searchSubmitBtn,
      tabRegion, tabDepth, tabFacility,
      panelRegion, panelDepth, panelFacility,
      regionOptionsHost, subRegionBlock, subRegionOptionsHost,
      depthOptionsHost, facilityOptionsHost,
      summaryHost, summaryChipsHost, resetBtn,
      countEl, sortSelect, cardsGrid, emptyState, detailModal, toastEl;

  // Selected Center for Modal
  let activeCenter = null;
  async function init() {
    if (!document.getElementById("indoorCardsGrid") && !document.getElementById("indoorSearchInput")) {
      await loadIndoorCenters();
      return;
    }
    bindDOMElements();
    bindEvents();
    renderFilterUi();
    render();
    const refreshCenters = async () => {
      await loadIndoorCenters();
      renderFilterUi();
      render();
    };
    window.addEventListener("snorky:supabase-ready", refreshCenters, { once: true });
    await refreshCenters();

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const targetCenterId = urlParams.get("centerId") || urlParams.get("id");
      if (targetCenterId) {
        setTimeout(() => openDetailModal(targetCenterId), 100);
      }
    } catch (_) {}
  }

  window.SNORKYIndoor = {
    loadIndoorCenters,
    mapDbRowToCenter,
    getCenters: () => window.SNORKYIndoorCenters || INDOOR_CENTERS
  };

  function bindDOMElements() {
    searchInput = document.getElementById("indoorSearchInput");
    searchClearBtn = document.getElementById("indoorSearchClear");
    searchSubmitBtn = document.getElementById("indoorSearchSubmit");

    tabRegion = document.getElementById("tabRegion");
    tabDepth = document.getElementById("tabDepth");
    tabFacility = document.getElementById("tabFacility");

    panelRegion = document.getElementById("panelRegion");
    panelDepth = document.getElementById("panelDepth");
    panelFacility = document.getElementById("panelFacility");

    regionOptionsHost = document.getElementById("indoorRegionOptions");
    subRegionBlock = document.getElementById("indoorSubRegionBlock");
    subRegionOptionsHost = document.getElementById("indoorSubRegionOptions");
    depthOptionsHost = document.getElementById("indoorDepthOptions");
    facilityOptionsHost = document.getElementById("indoorFacilityOptions");

    summaryHost = document.getElementById("indoorSearchSummary");
    summaryChipsHost = document.getElementById("indoorSummaryChips");
    resetBtn = document.getElementById("indoorResetBtn");

    countEl = document.getElementById("indoorCount");
    sortSelect = document.getElementById("indoorSortSelect");
    cardsGrid = document.getElementById("indoorCardsGrid");
    emptyState = document.getElementById("indoorEmptyState");
    detailModal = document.getElementById("indoorDetailModal");
    toastEl = document.getElementById("indoorToast");
  }

  function bindEvents() {
    // 검색창 입력
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        if (searchClearBtn) {
          searchClearBtn.classList.toggle("visible", Boolean(state.searchQuery));
        }
        render();
      });

      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          closeAllTabs();
          render();
          scrollToResults();
        }
      });
    }

    // 검색어 지우기
    if (searchClearBtn) {
      searchClearBtn.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        state.searchQuery = "";
        searchClearBtn.classList.remove("visible");
        render();
      });
    }

    // 1행 탭 버튼 토글
    if (tabRegion) {
      tabRegion.addEventListener("click", () => toggleTab("region"));
    }
    if (tabDepth) {
      tabDepth.addEventListener("click", () => toggleTab("depth"));
    }
    if (tabFacility) {
      tabFacility.addEventListener("click", () => toggleTab("facility"));
    }

    // 패널 닫기 버튼들
    document.querySelectorAll(".indoor-panel-close").forEach(btn => {
      btn.addEventListener("click", closeAllTabs);
    });

    // 2행: 검색 버튼
    if (searchSubmitBtn) {
      searchSubmitBtn.addEventListener("click", () => {
        closeAllTabs();
        render();
        scrollToResults();
      });
    }

    // 정렬 셀렉트
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => {
        state.sortBy = e.target.value;
        render();
      });
    }

    // 필터 초기화
    if (resetBtn) {
      resetBtn.addEventListener("click", resetFilters);
    }

    // 모달 닫기
    if (detailModal) {
      detailModal.addEventListener("click", (e) => {
        if (e.target === detailModal || e.target.closest("#modalCloseBtn")) {
          closeDetailModal();
        }
      });
    }

    // ESC 키 모달 또는 패널 닫기
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (state.activeTab) {
          closeAllTabs();
        } else if (detailModal && detailModal.classList.contains("open")) {
          closeDetailModal();
        }
      }
    });

    // 상세 모달 요약 탭 클릭
    bindDetailSummaryTabs();

    // 상세 모달 더보기 접힘/펼침
    bindFoldableSections();

    // 상세 모달 액션 버튼들
    bindModalActionButtons();
  }

  function bindDetailSummaryTabs() {
    const tabs = document.querySelectorAll(".indoor-detail-tab");
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const targetId = tab.dataset.targetSection;
        if (!targetId) return;

        // 접힌 섹션 내부 항목인 경우 자동으로 펼침
        if (targetId === "sectionBuddy") {
          const content = document.getElementById("featuresContent");
          const btn = document.querySelector('.indoor-toggle-more[data-target="featuresContent"]');
          if (content && content.hidden) {
            content.hidden = false;
            if (btn) {
              btn.setAttribute("aria-expanded", "true");
              btn.innerHTML = "<span>접기</span> ‹";
            }
          }
        } else if (targetId === "sectionPool") {
          const content = document.getElementById("facilityContent");
          const btn = document.querySelector('.indoor-toggle-more[data-target="facilityContent"]');
          if (content && content.hidden) {
            content.hidden = false;
            if (btn) {
              btn.setAttribute("aria-expanded", "true");
              btn.innerHTML = "<span>접기</span> ‹";
            }
          }
        }

        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          tabs.forEach(t => t.classList.remove("active"));
          tab.classList.add("active");
          targetEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          targetEl.classList.remove("highlight-flash");
          void targetEl.offsetWidth; // trigger reflow
          targetEl.classList.add("highlight-flash");
          setTimeout(() => {
            targetEl.classList.remove("highlight-flash");
          }, 1400);
        }
      });
    });
  }

  function bindFoldableSections() {
    const buttons = document.querySelectorAll(".indoor-toggle-more");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.target;
        if (!targetId) return;
        const targetEl = document.getElementById(targetId);
        if (!targetEl) return;
        const isHidden = targetEl.hidden;
        targetEl.hidden = !isHidden;
        btn.setAttribute("aria-expanded", String(isHidden));
        btn.innerHTML = isHidden ? "<span>접기</span> ‹" : "<span>더보기</span> ›";
      });
    });
  }

  function bindModalActionButtons() {
    const buddyCtaBtn = document.getElementById("modalBuddyCtaBtn");
    const navBtn = document.getElementById("modalNavBtn");
    const homepageBtn = document.getElementById("modalHomepageBtn");
    const callBtn = document.getElementById("modalCallBtn");
    const copyAddressBtn = document.getElementById("modalCopyAddressBtn");

    // 길찾기 버튼: 카카오맵 길찾기 링크 실행
    if (navBtn) {
      navBtn.addEventListener("click", () => {
        if (!activeCenter) return;
        const destination = encodeURIComponent(activeCenter.name);
        const lat = activeCenter.lat || "";
        const lng = activeCenter.lng || "";
        const url = (lat && lng)
          ? `https://map.kakao.com/link/to/${destination},${lat},${lng}`
          : `https://map.kakao.com/?eName=${encodeURIComponent(activeCenter.address || activeCenter.name)}`;
        window.open(url, "_blank", "noopener,noreferrer");
      });
    }

    // 홈페이지 버튼
    if (homepageBtn) {
      homepageBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!activeCenter?.homepage) return;
        window.open(activeCenter.homepage, "_blank", "noopener,noreferrer");
      });
    }

    // 전화하기 버튼
    if (callBtn) {
      callBtn.addEventListener("click", () => {
        if (!activeCenter?.phone) return;
        window.location.href = `tel:${activeCenter.phone}`;
      });
    }

    // 버디 구하기 CTA
    if (buddyCtaBtn) {
      buddyCtaBtn.addEventListener("click", () => {
        if (!activeCenter) return;
        showToast(`🤿 '${activeCenter.name}' 버디 모집 준비 중입니다.`);
        setTimeout(() => {
          window.location.href = "./buddy.html";
        }, 1200);
      });
    }

    // 주소 복사 버튼
    if (copyAddressBtn) {
      copyAddressBtn.addEventListener("click", () => {
        if (!activeCenter?.address) return;
        navigator.clipboard.writeText(activeCenter.address)
          .then(() => showToast("주소가 복사되었습니다."))
          .catch(() => showToast(activeCenter.address));
      });
    }
  }

  function toggleTab(tabName) {
    if (state.activeTab === tabName) {
      state.activeTab = null;
    } else {
      state.activeTab = tabName;
    }
    renderFilterUi();
  }

  function closeAllTabs() {
    if (state.activeTab !== null) {
      state.activeTab = null;
      renderFilterUi();
    }
  }

  function scrollToResults() {
    const resultsHeader = document.querySelector(".indoor-results-header");
    if (resultsHeader) {
      resultsHeader.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderFilterUi() {
    // 1. 탭 버튼 상태 동기화
    if (tabRegion) {
      const isExpanded = state.activeTab === "region";
      tabRegion.setAttribute("aria-expanded", String(isExpanded));
      const hasValue = state.selectedRegion !== "전체" || state.selectedSubRegion !== "전체";
      tabRegion.classList.toggle("has-value", hasValue);
      const label = tabRegion.querySelector(".indoor-tab-label");
      if (label) {
        if (state.selectedRegion !== "전체") {
          const cleanSub = (state.selectedSubRegion !== "전체") ? state.selectedSubRegion.replace(/(시|군|구)$/, "") : "";
          label.textContent = cleanSub ? `지역: ${cleanSub}` : `지역: ${state.selectedRegion}`;
        } else {
          label.textContent = "지역";
        }
      }
    }

    if (tabDepth) {
      const isExpanded = state.activeTab === "depth";
      tabDepth.setAttribute("aria-expanded", String(isExpanded));
      const hasValue = state.depthRange !== "all";
      tabDepth.classList.toggle("has-value", hasValue);
      const label = tabDepth.querySelector(".indoor-tab-label");
      if (label) {
        const found = DEPTH_OPTIONS.find(d => d.value === state.depthRange);
        label.textContent = (found && found.value !== "all") ? `수심: ${found.label}` : "수심";
      }
    }

    if (tabFacility) {
      const isExpanded = state.activeTab === "facility";
      tabFacility.setAttribute("aria-expanded", String(isExpanded));
      const activeCount = [state.onlyFreediving, state.onlyScuba, state.onlyParking].filter(Boolean).length;
      tabFacility.classList.toggle("has-value", activeCount > 0);
      const label = tabFacility.querySelector(".indoor-tab-label");
      if (label) {
        label.textContent = activeCount > 0 ? `편의시설 (${activeCount})` : "편의시설";
      }
    }

    // 2. 패널 visibility 토글
    if (panelRegion) panelRegion.hidden = state.activeTab !== "region";
    if (panelDepth) panelDepth.hidden = state.activeTab !== "depth";
    if (panelFacility) panelFacility.hidden = state.activeTab !== "facility";

    // 3. 지역 옵션 렌더링
    if (regionOptionsHost && state.activeTab === "region") {
      regionOptionsHost.innerHTML = REGION_OPTIONS.map(reg => {
        const isSelected = state.selectedRegion === reg;
        return `<button type="button" class="indoor-search-option${isSelected ? ' is-selected' : ''}" data-region-val="${escapeHtml(reg)}" aria-pressed="${isSelected ? 'true' : 'false'}">${escapeHtml(reg)}</button>`;
      }).join("");

      regionOptionsHost.onclick = (e) => {
        const btn = e.target.closest("[data-region-val]");
        if (!btn) return;
        const val = btn.dataset.regionVal;
        state.selectedRegion = val;
        state.selectedSubRegion = "전체";
        renderFilterUi();
        render();
      };

      // 세부지역 렌더링
      if (subRegionBlock && subRegionOptionsHost) {
        if (state.selectedRegion === "전체") {
          subRegionBlock.hidden = true;
          subRegionOptionsHost.innerHTML = "";
        } else {
          const subRegions = Array.from(new Set(
            window.SNORKYIndoor.getCenters()
              .filter(c => c.region === state.selectedRegion && c.subRegion)
              .map(c => c.subRegion)
          )).sort((a, b) => a.localeCompare(b, "ko"));

          if (subRegions.length > 0) {
            subRegionBlock.hidden = false;
            const subOptions = ["전체", ...subRegions];
            subRegionOptionsHost.innerHTML = subOptions.map(sub => {
              const isSelected = state.selectedSubRegion === sub;
              const displayLabel = sub === "전체" ? "전체" : sub.replace(/(시|군|구)$/, "");
              return `<button type="button" class="indoor-search-option${isSelected ? ' is-selected' : ''}" data-subregion-val="${escapeHtml(sub)}" aria-pressed="${isSelected ? 'true' : 'false'}">${escapeHtml(displayLabel)}</button>`;
            }).join("");

            subRegionOptionsHost.onclick = (e) => {
              const btn = e.target.closest("[data-subregion-val]");
              if (!btn) return;
              state.selectedSubRegion = btn.dataset.subregionVal;
              renderFilterUi();
              render();
            };
          } else {
            subRegionBlock.hidden = true;
            subRegionOptionsHost.innerHTML = "";
          }
        }
      }
    }

    // 4. 수심 옵션 렌더링
    if (depthOptionsHost && state.activeTab === "depth") {
      depthOptionsHost.innerHTML = DEPTH_OPTIONS.map(opt => {
        const isSelected = state.depthRange === opt.value;
        return `<button type="button" class="indoor-search-option${isSelected ? ' is-selected' : ''}" data-depth-val="${escapeHtml(opt.value)}" aria-pressed="${isSelected ? 'true' : 'false'}">${escapeHtml(opt.label)}</button>`;
      }).join("");

      depthOptionsHost.onclick = (e) => {
        const btn = e.target.closest("[data-depth-val]");
        if (!btn) return;
        state.depthRange = btn.dataset.depthVal;
        renderFilterUi();
        render();
      };
    }

    // 5. 편의시설 옵션 렌더링
    if (facilityOptionsHost && state.activeTab === "facility") {
      facilityOptionsHost.innerHTML = FACILITY_OPTIONS.map(opt => {
        let isSelected = false;
        if (opt.key === "freediving") isSelected = state.onlyFreediving;
        else if (opt.key === "scuba") isSelected = state.onlyScuba;
        else if (opt.key === "parking") isSelected = state.onlyParking;

        return `<button type="button" class="indoor-search-option${isSelected ? ' is-selected' : ''}" data-facility-key="${escapeHtml(opt.key)}" aria-pressed="${isSelected ? 'true' : 'false'}">${escapeHtml(opt.label)}</button>`;
      }).join("");

      facilityOptionsHost.onclick = (e) => {
        const btn = e.target.closest("[data-facility-key]");
        if (!btn) return;
        const key = btn.dataset.facilityKey;
        if (key === "freediving") state.onlyFreediving = !state.onlyFreediving;
        else if (key === "scuba") state.onlyScuba = !state.onlyScuba;
        else if (key === "parking") state.onlyParking = !state.onlyParking;
        renderFilterUi();
        render();
      };
    }

    // 6. 선택 조건 요약 칩 바 렌더링
    renderFilterSummary();
  }

  function renderFilterSummary() {
    if (!summaryHost || !summaryChipsHost) return;

    const chips = [];

    if (state.selectedRegion !== "전체") {
      chips.push({
        type: "region",
        label: state.selectedRegion,
        onRemove: () => {
          state.selectedRegion = "전체";
          state.selectedSubRegion = "전체";
        }
      });
    }

    if (state.selectedSubRegion !== "전체") {
      chips.push({
        type: "subRegion",
        label: state.selectedSubRegion,
        onRemove: () => {
          state.selectedSubRegion = "전체";
        }
      });
    }

    if (state.depthRange !== "all") {
      const found = DEPTH_OPTIONS.find(d => d.value === state.depthRange);
      if (found) {
        chips.push({
          type: "depth",
          label: found.label,
          onRemove: () => {
            state.depthRange = "all";
          }
        });
      }
    }

    if (state.onlyFreediving) {
      chips.push({
        type: "freediving",
        label: "프리다이빙",
        onRemove: () => {
          state.onlyFreediving = false;
        }
      });
    }

    if (state.onlyScuba) {
      chips.push({
        type: "scuba",
        label: "스쿠버",
        onRemove: () => {
          state.onlyScuba = false;
        }
      });
    }

    if (state.onlyParking) {
      chips.push({
        type: "parking",
        label: "주차가능",
        onRemove: () => {
          state.onlyParking = false;
        }
      });
    }

    if (chips.length === 0) {
      summaryHost.hidden = true;
      summaryChipsHost.innerHTML = "";
      return;
    }

    summaryHost.hidden = false;
    summaryChipsHost.innerHTML = chips.map((chip, idx) => {
      return `<button type="button" class="indoor-summary-chip" data-chip-idx="${idx}" aria-label="${escapeHtml(chip.label)} 필터 해제">
        <span>${escapeHtml(chip.label)}</span>
        <b aria-hidden="true">×</b>
      </button>`;
    }).join("");

    summaryChipsHost.onclick = (e) => {
      const btn = e.target.closest("[data-chip-idx]");
      if (!btn) return;
      const idx = parseInt(btn.dataset.chipIdx, 10);
      if (chips[idx] && typeof chips[idx].onRemove === "function") {
        chips[idx].onRemove();
        renderFilterUi();
        render();
      }
    };
  }

  function resetFilters() {
    state.searchQuery = "";
    state.selectedRegion = "전체";
    state.selectedSubRegion = "전체";
    state.depthRange = "all";
    state.onlyFreediving = false;
    state.onlyScuba = false;
    state.onlyParking = false;
    state.activeTab = null;
    state.sortBy = "depth";

    if (searchInput) searchInput.value = "";
    if (searchClearBtn) searchClearBtn.classList.remove("visible");
    if (sortSelect) sortSelect.value = "depth";

    renderFilterUi();
    render();
    showToast("필터가 초기화되었습니다.");
  }

  function getFilteredCenters() {
    return window.SNORKYIndoor.getCenters().filter(center => {
      // 검색어 필터 (센터명, 지역, 주소)
      if (state.searchQuery) {
        const query = state.searchQuery;
        const matchName = (center.name || "").toLowerCase().includes(query);
        const matchRegion = (center.region || "").toLowerCase().includes(query);
        const matchSub = (center.subRegion || "").toLowerCase().includes(query);
        const matchAddr = (center.address || "").toLowerCase().includes(query);
        if (!matchName && !matchRegion && !matchSub && !matchAddr) return false;
      }

      // 광역지역 필터
      if (state.selectedRegion !== "전체" && center.region !== state.selectedRegion) {
        return false;
      }

      // 세부지역 필터
      if (state.selectedSubRegion !== "전체" && center.subRegion !== state.selectedSubRegion) {
        return false;
      }

      // 수심 필터 (5단계: 전체, 5m 이하, 5~10m, 10~20m, 20m 이상)
      if (state.depthRange !== "all") {
        const depth = Number(center.maxDepth) || 0;
        if (state.depthRange === "under5" && depth > 5) return false;
        if (state.depthRange === "5to10" && (depth <= 5 || depth > 10)) return false;
        if (state.depthRange === "10to20" && (depth <= 10 || depth > 20)) return false;
        if (state.depthRange === "over20" && depth <= 20) return false;
      }

      // 프리다이빙 지원 여부
      if (state.onlyFreediving && !center.hasFreediving) {
        return false;
      }

      // 스쿠버 지원 여부
      if (state.onlyScuba && !center.hasScuba) {
        return false;
      }

      // 주차 가능 여부
      if (state.onlyParking && !center.hasParking) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      if (state.sortBy === "depth") {
        return (b.maxDepth || 0) - (a.maxDepth || 0);
      } else if (state.sortBy === "name") {
        return (a.name || "").localeCompare(b.name || "", "ko");
      }
      return 0;
    });
  }

  function render() {
    const list = getFilteredCenters();

    // 건수 업데이트
    if (countEl) countEl.textContent = String(list.length);

    // 필터 초기화 버튼 노출 여부
    const hasActiveFilters = Boolean(
      state.searchQuery ||
      state.selectedRegion !== "전체" ||
      state.selectedSubRegion !== "전체" ||
      state.minDepth > 0 ||
      state.onlyFreediving ||
      state.onlyScuba ||
      state.onlyParking
    );
    if (resetBtn) resetBtn.classList.toggle("visible", hasActiveFilters);

    // 목록 렌더링
    if (!cardsGrid) return;
    cardsGrid.innerHTML = "";

    if (list.length === 0) {
      if (emptyState) emptyState.classList.add("visible");
      return;
    }

    if (emptyState) emptyState.classList.remove("visible");

    list.forEach(center => {
      const card = createCenterCard(center);
      cardsGrid.appendChild(card);
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function createCenterCard(center) {
    const card = document.createElement("article");
    card.className = "indoor-center-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `${center.name} 상세정보 보기`);

    const cleanSub = (center.subRegion || "").replace(/(시|군|구)$/, "");
    const regionText = [center.region, cleanSub].filter(Boolean).join(" ");
    const depthText = center.maxDepth ? `최대 ${center.maxDepth}m` : "";
    const metaText = [regionText, depthText].filter(Boolean).join(" · ");

    const features = [
      center.hasFreediving ? "프리다이빙" : "",
      center.hasScuba ? "스쿠버" : "",
      center.hasParking ? "주차" : ""
    ].filter(Boolean).join(" · ");

    let statusClass = "open";
    if (center.status === "휴장") statusClass = "closed";
    else if (center.status === "확인 필요") statusClass = "check";

    card.innerHTML = `
      <span class="indoor-card-thumb">
        ${center.imageUrl ? `<img src="${escapeHtml(center.imageUrl)}" alt="${escapeHtml(center.name)}" loading="lazy">` : ""}
      </span>
      <span class="indoor-card-info">
        <strong class="indoor-card-name">${escapeHtml(center.name)}</strong>
        <small class="indoor-card-meta">${escapeHtml(metaText)}</small>
        <span class="indoor-card-features">${escapeHtml(features)}</span>
      </span>
      <span class="indoor-card-right">
        <span class="indoor-status-chip ${statusClass}">${escapeHtml(center.status || "운영중")}</span>
        <span class="indoor-card-chevron">›</span>
      </span>
    `;

    card.addEventListener("click", () => openDetailModal(center));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDetailModal(center);
      }
    });

    return card;
  }

  function openDetailModal(center) {
    if (typeof center === "string") center = window.SNORKYIndoor.getCenters().find(item => item.id === center);
    if (!center) return;
    activeCenter = center;
    if (!detailModal) return;

    // 1. 상단 배너 (센터명, 지역, 운영상태, 대표사진)
    const imgEl = document.getElementById("modalImg");
    const nameEl = document.getElementById("modalName");
    const regionEl = document.getElementById("modalRegion");
    const statusEl = document.getElementById("modalStatus");

    if (imgEl) imgEl.src = center.imageUrl || "";
    if (nameEl) nameEl.textContent = center.name;
    if (regionEl) regionEl.textContent = `${center.region} ${center.subRegion}`;
    if (statusEl) statusEl.textContent = center.status || "운영중";

    // 2. 상단 요약 탭 4개 (운영시간, 휴무일, 버디조건, 최대수심)
    const tabHoursEl = document.getElementById("modalTabHours");
    const tabHolidayEl = document.getElementById("modalTabHoliday");
    const tabBuddyEl = document.getElementById("modalTabBuddy");
    const tabDepthEl = document.getElementById("modalTabDepth");

    if (tabHoursEl) {
      const hourMatch = (center.businessHours || "").match(/\d{2}:\d{2}\s*~\s*\d{2}:\d{2}/);
      tabHoursEl.textContent = hourMatch ? hourMatch[0] : (center.businessHours || "-");
    }
    if (tabHolidayEl) tabHolidayEl.textContent = center.holiday || "-";
    if (tabBuddyEl) {
      tabBuddyEl.textContent = center.buddyCondition ? (center.buddyCondition.includes("2인") ? "2인 이상 필수" : "버디 필수 동반") : "버디 필수";
    }
    if (tabDepthEl) tabDepthEl.textContent = center.maxDepth ? `최대 ${center.maxDepth}m` : "-";

    // 3. 기본 핵심 운영/위치 정보 (중복 항목 제거)
    const hoursEl = document.getElementById("modalHours");
    const holidayEl = document.getElementById("modalHoliday");
    const addressEl = document.getElementById("modalAddress");
    const parkingDetailEl = document.getElementById("modalParkingDetail");
    const phoneEl = document.getElementById("modalPhone");
    const homepageLinkEl = document.getElementById("modalHomepageLink");

    if (hoursEl) hoursEl.textContent = center.businessHours || "-";
    if (holidayEl) holidayEl.textContent = center.holiday || "-";
    if (addressEl) addressEl.textContent = center.address || "-";
    if (parkingDetailEl) parkingDetailEl.textContent = center.parkingInfo || "주차 지원";
    if (phoneEl) phoneEl.textContent = center.phone || "-";

    if (homepageLinkEl) {
      if (center.homepage) {
        homepageLinkEl.href = center.homepage;
        homepageLinkEl.textContent = center.homepage;
        homepageLinkEl.style.display = "inline";
      } else {
        homepageLinkEl.style.display = "none";
      }
    }

    // 4. 상세정보 1: 시설 특징 (더보기)
    const featureShortEl = document.getElementById("modalFeatureShort");
    const buddyDetailEl = document.getElementById("modalBuddyDetail");
    const featureFullEl = document.getElementById("modalFeatureFull");

    if (featureShortEl) featureShortEl.textContent = center.featureShort || center.description || "-";
    if (buddyDetailEl) buddyDetailEl.textContent = center.buddyCondition || "2인 이상 버디 필수 동반 (자격증 소지자)";
    if (featureFullEl) featureFullEl.textContent = center.featureFull || center.description || "-";

    // 5. 상세정보 2: 시설 정보 & 풀규격 (더보기)
    const facilityShortEl = document.getElementById("modalFacilityShort");
    const poolSpecsEl = document.getElementById("modalPoolSpecs");
    const poolTempEl = document.getElementById("modalPoolTemp");
    const facilitiesFullEl = document.getElementById("modalFacilitiesFull");

    if (facilityShortEl) facilityShortEl.textContent = center.facilityShort || center.facilities || "-";
    if (poolSpecsEl) poolSpecsEl.textContent = center.poolSpecs || "다이빙 전용 플랫폼 및 수심 풀";
    if (poolTempEl) poolTempEl.textContent = center.poolTemp || "사계절 항온 유지";
    if (facilitiesFullEl) facilitiesFullEl.textContent = center.facilities || "-";

    // 6. 상세정보 3: 이용요금 & 예약안내 (더보기)
    const priceShortEl = document.getElementById("modalPriceShort");
    const priceFullEl = document.getElementById("modalPriceFull");
    const rentalInfoEl = document.getElementById("modalRentalInfo");
    const reservationInfoEl = document.getElementById("modalReservationInfo");

    if (priceShortEl) priceShortEl.textContent = center.priceShort || center.priceInfo || "-";
    if (priceFullEl) priceFullEl.textContent = center.priceFull || center.priceInfo || "-";
    if (rentalInfoEl) rentalInfoEl.textContent = center.rentalInfo || "스노클, 마스크, 슈트, 핀 렌탈 지원";
    if (reservationInfoEl) reservationInfoEl.textContent = center.reservationInfo || "사전 예약제 운영";

    // 더보기 섹션들 기본 접힘 상태로 리셋
    ["featuresContent", "facilityContent", "priceContent"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    document.querySelectorAll(".indoor-toggle-more").forEach(btn => {
      btn.setAttribute("aria-expanded", "false");
      btn.innerHTML = "<span>더보기</span> ›";
    });

    // 탭 액티브 상태 및 본문 스크롤 초기화
    document.querySelectorAll(".indoor-detail-tab").forEach(t => t.classList.remove("active"));
    const bodyEl = document.getElementById("indoorModalBody");
    if (bodyEl) bodyEl.scrollTop = 0;

    detailModal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeDetailModal() {
    if (!detailModal) return;
    detailModal.classList.remove("open");
    document.body.style.overflow = "";
    activeCenter = null;
  }

  let toastTimer = null;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 2400);
  }

  // 초기화 실행
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
