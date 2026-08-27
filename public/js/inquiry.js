(function () {
  "use strict";

  const style = document.createElement("style");
  style.textContent = `
    .home-inquiry{position:fixed;z-index:1800;inset:0;display:none;align-items:flex-end;background:rgba(10,35,48,.35)}.home-inquiry.open{display:flex}.home-inquiry-card{box-sizing:border-box;width:100%;max-height:92vh;overflow:auto;padding:22px 20px calc(90px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:#fff;box-shadow:0 -15px 40px rgba(15,46,61,.14)}.home-inquiry-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.home-inquiry-head small{color:#1767d4;font-weight:900}.home-inquiry-head h2{margin:3px 0 0;font-size:24px;color:#123849}.home-inquiry-close{width:42px;height:42px;flex:0 0 42px;border:0;border-radius:50%;background:#f1f5f6;color:#405967;font-size:25px;cursor:pointer}.inquiry-form{display:grid;gap:16px;margin-top:22px}.inquiry-field{display:grid;gap:7px}.inquiry-field label{color:#294756;font-size:14px;font-weight:800}.inquiry-field label span{color:#1767d4}.inquiry-field input,.inquiry-field select,.inquiry-field textarea{box-sizing:border-box;width:100%;border:1px solid #d9e5e8;border-radius:13px;background:#fff;color:#173746;font:inherit;outline:none}.inquiry-field input,.inquiry-field select{height:48px;padding:0 13px}.inquiry-field textarea{min-height:150px;padding:13px;resize:vertical;line-height:1.55}.inquiry-field input:focus,.inquiry-field select:focus,.inquiry-field textarea:focus{border-color:#168ab2;box-shadow:0 0 0 3px rgba(22,138,178,.12)}.inquiry-field[hidden]{display:none}.inquiry-honeypot{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}.inquiry-captcha-slot{min-height:0;color:#6d818b;font-size:12px;line-height:1.45}.inquiry-status{min-height:20px;margin:0;color:#b33b34;font-size:13px;font-weight:700;line-height:1.5}.inquiry-status.success{color:#087c72}.inquiry-submit{min-height:52px;border:0;border-radius:14px;background:linear-gradient(135deg,#18aa9e,#087aa0);color:#fff;font-size:16px;font-weight:900;cursor:pointer}.inquiry-submit:disabled{opacity:.6;cursor:wait}@media(min-width:701px){.home-inquiry{align-items:center;justify-content:center;padding:24px}.home-inquiry-card{width:min(600px,100%);max-height:calc(100vh - 48px);padding:26px;border-radius:24px}}
  `;
  document.head.appendChild(style);

  // Replace the legacy my-page surface at the same bottom-navigation position.
  document.getElementById("homeMyPage")?.remove();
  const legacyMenuButton = document.querySelector('.home-bottom-nav [data-bottom="mypage"]');
  if (legacyMenuButton) {
    legacyMenuButton.querySelector("span").textContent = "문의하기";
    legacyMenuButton.setAttribute("aria-label", "문의하기");
  }

  const overlay = document.createElement("section");
  overlay.id = "homeInquiry";
  overlay.className = "home-inquiry";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "inquiryTitle");
  overlay.innerHTML = `
    <div class="home-inquiry-card"><header class="home-inquiry-head"><div><small>SNORKY</small><h2 id="inquiryTitle">문의하기</h2></div><button class="home-inquiry-close" type="button" data-close-inquiry aria-label="닫기">×</button></header><form class="inquiry-form" novalidate>
      <div class="inquiry-field"><label for="inquiryType">문의 유형 <span aria-hidden="true">*</span></label><select id="inquiryType" name="inquiry_type" required><option value="">문의 유형을 선택해 주세요.</option><option value="point_correction">포인트 정보 수정</option><option value="point_report">포인트 제보</option><option value="other">기타</option></select></div>
      <div class="inquiry-field" id="inquiryPointField" hidden><label for="inquiryPointName">포인트명</label><input id="inquiryPointName" name="point_name" maxlength="100" autocomplete="off" placeholder="문의할 포인트명을 입력해 주세요."></div>
      <div class="inquiry-field"><label for="inquiryContent">문의 내용 <span aria-hidden="true">*</span></label><textarea id="inquiryContent" name="content" maxlength="5000" required placeholder="문의 내용을 입력해 주세요."></textarea></div>
      <div class="inquiry-field"><label for="inquiryReplyEmail">회신 이메일 <small>(선택)</small></label><input id="inquiryReplyEmail" name="reply_email" type="email" maxlength="254" autocomplete="email" placeholder="답변을 받을 이메일 주소"></div>
      <div class="inquiry-field inquiry-honeypot" aria-hidden="true"><label for="inquiryWebsite">웹사이트</label><input id="inquiryWebsite" name="honeypot" type="text" tabindex="-1" autocomplete="off"></div>
      <div class="inquiry-captcha-slot" data-inquiry-captcha-slot hidden></div><p class="inquiry-status" aria-live="polite"></p><button class="inquiry-submit" type="submit">제출하기</button>
    </form></div>`;
  document.body.appendChild(overlay);

  const form = overlay.querySelector("form");
  const typeInput = overlay.querySelector("#inquiryType");
  const pointField = overlay.querySelector("#inquiryPointField");
  const status = overlay.querySelector(".inquiry-status");
  const submit = overlay.querySelector(".inquiry-submit");
  const pointTypes = new Set(["point_correction", "point_report"]);
  let captchaToken = "";

  function setBottomActive(active) {
    document.querySelectorAll(".home-bottom-nav [data-bottom]").forEach(button => button.classList.toggle("active", button.dataset.bottom === active));
  }
  function closeInquiry() { overlay.classList.remove("open"); setBottomActive("home"); }
  function openInquiry() { overlay.classList.add("open"); setBottomActive("mypage"); requestAnimationFrame(() => typeInput.focus()); }
  function updatePointField() { pointField.hidden = !pointTypes.has(typeInput.value); }
  function setStatus(message, success) { status.textContent = message; status.classList.toggle("success", Boolean(success)); }
  async function responseMessage(error) {
    try {
      const body = await error.context?.clone?.().json();
      if (body?.message) return body.message;
    } catch (_) { /* fall through to the generic message */ }
    return "문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }

  typeInput.addEventListener("change", updatePointField);
  overlay.addEventListener("click", event => { if (event.target === overlay || event.target.closest("[data-close-inquiry]")) closeInquiry(); });
  window.addEventListener("snorky:open-inquiry", openInquiry);
  window.SNORKYInquiry = { open: openInquiry, close: closeInquiry, setCaptchaToken: token => { captchaToken = typeof token === "string" ? token : ""; } };

  form.addEventListener("submit", async event => {
    event.preventDefault();
    setStatus("");
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.captcha_token = captchaToken;
    if (!payload.inquiry_type) return setStatus("문의 유형을 선택해 주세요.");
    if (!String(payload.content || "").trim()) return setStatus("문의 내용을 입력해 주세요.");
    if (payload.reply_email && !/^\S+@\S+\.\S+$/.test(String(payload.reply_email))) return setStatus("회신 이메일 형식을 확인해 주세요.");
    submit.disabled = true;
    try {
      const client = window.getSnorkySupabase?.();
      if (!client) throw new Error("SUPABASE_CLIENT_UNAVAILABLE");
      const { data, error } = await client.functions.invoke("submit-inquiry", { body: payload });
      if (error) throw new Error(await responseMessage(error));
      if (!data?.ok) throw new Error(data?.message || "문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      form.reset(); captchaToken = ""; updatePointField(); setStatus("문의가 접수되었습니다.", true);
    } catch (error) {
      setStatus(error instanceof Error && error.message ? error.message : "문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally { submit.disabled = false; }
  });
})();
