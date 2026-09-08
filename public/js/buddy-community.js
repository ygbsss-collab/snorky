(function () {
  "use strict";

  let communityConfig = {
    enabled: false,
    open_chat_url: "",
    banner_text: "함께 다이빙하고 함께 이야기해요"
  };

  const el = (id) => document.getElementById(id);

  async function fetchCommunityConfig() {
    try {
      const sb = window.getSnorkySupabase?.();
      if (!sb) return communityConfig;
      const { data, error } = await sb
        .from("app_settings")
        .select("value")
        .eq("key", "community_config")
        .maybeSingle();

      if (error) throw error;
      if (data?.value) {
        communityConfig = {
          enabled: Boolean(data.value.enabled),
          open_chat_url: data.value.open_chat_url || "",
          banner_text: data.value.banner_text || "함께 다이빙하고 함께 이야기해요"
        };
      }
    } catch (err) {
      console.warn("[SNORKY Community] 설정 로드 실패, 기본값 사용", err);
    }
    return communityConfig;
  }

  function renderCommunityBanner() {
    const banner = el("snorkyCommunityBanner");
    const bannerText = el("snorkyCommunityBannerText");
    const modalText = el("snorkyCommunityModalText");

    if (!banner) return;

    if (!communityConfig.enabled) {
      banner.style.display = "none";
      return;
    }

    banner.style.display = "block";
    if (bannerText) bannerText.textContent = communityConfig.banner_text;
    if (modalText) modalText.textContent = communityConfig.banner_text;
  }

  function openModal() {
    const modal = el("buddyCommunityModal");
    if (!modal) return;
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";

    const chk = el("chkCommunityAgree");
    if (chk) chk.checked = false;
    updateEnterButtonState();
  }

  function closeModal() {
    const modal = el("buddyCommunityModal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.style.overflow = "";
  }

  function updateEnterButtonState() {
    const chk = el("chkCommunityAgree");
    const btnEnter = el("btnKakaoEnter");
    const btnText = btnEnter?.querySelector("span");

    if (!btnEnter) return;

    const hasUrl = Boolean(communityConfig.open_chat_url && communityConfig.open_chat_url.trim());

    if (!hasUrl) {
      btnEnter.disabled = true;
      if (btnText) btnText.textContent = "커뮤니티 준비 중";
      return;
    }

    if (btnText) btnText.textContent = "오픈채팅방 입장하기";
    btnEnter.disabled = !chk?.checked;
  }

  function handleKakaoEnter() {
    if (!communityConfig.open_chat_url) return;
    window.open(communityConfig.open_chat_url, "_blank", "noopener,noreferrer");
    closeModal();
  }

  function handleCopyLink() {
    if (!communityConfig.open_chat_url) {
      alert("오픈채팅방 링크가 설정되지 않았습니다.");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(communityConfig.open_chat_url)
        .then(() => {
          alert("오픈채팅방 링크가 복사되었습니다.");
        })
        .catch(() => {
          fallbackCopyText(communityConfig.open_chat_url);
        });
    } else {
      fallbackCopyText(communityConfig.open_chat_url);
    }
  }

  function fallbackCopyText(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      alert("오픈채팅방 링크가 복사되었습니다.");
    } catch (err) {
      alert("링크 복사 실패: " + text);
    }
    document.body.removeChild(textArea);
  }

  let eventsBound = false;

  function initEvents() {
    if (eventsBound) return;
    eventsBound = true;
    el("btnOpenCommunityModal")?.addEventListener("click", openModal);
    el("snorkyCommunityBanner")?.addEventListener("click", (e) => {
      openModal();
    });

    el("btnCloseCommunityModal")?.addEventListener("click", closeModal);
    el("btnDismissCommunityModal")?.addEventListener("click", closeModal);

    el("buddyCommunityModal")?.addEventListener("click", (e) => {
      if (e.target === el("buddyCommunityModal")) {
        closeModal();
      }
    });

    el("chkCommunityAgree")?.addEventListener("change", updateEnterButtonState);
    el("btnKakaoEnter")?.addEventListener("click", handleKakaoEnter);
    el("btnCopyCommunityLink")?.addEventListener("click", handleCopyLink);
  }

  async function syncCommunity() {
    await fetchCommunityConfig();
    renderCommunityBanner();
  }

  async function init() {
    initEvents();
    await syncCommunity();
  }

  window.addEventListener("snorky:supabase-ready", syncCommunity);
  window.addEventListener("pageshow", syncCommunity);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
