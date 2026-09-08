(function (global) {
  "use strict";

  const byId = (id) => document.getElementById(id);

  function showMessage(text, isError = true) {
    const node = byId("testEmailMessage");
    if (!node) return;
    node.textContent = text;
    node.style.color = isError ? "#b42318" : "#067647";
    node.hidden = !text;
  }

  function credentials() {
    const email = byId("testEmail")?.value.trim() || "";
    const password = byId("testPassword")?.value || "";
    if (!email || !password) throw new Error("이메일과 비밀번호를 입력해 주세요.");
    return { email, password };
  }

  function errorMessage(error) {
    const code = String(error?.code || "").toLowerCase();
    const text = String(error?.message || "").toLowerCase();
    if (code.includes("user_already_exists") || text.includes("already registered") || text.includes("already exists")) return "이미 가입된 이메일입니다.";
    if (code.includes("email_not_confirmed") || text.includes("email not confirmed")) return "이메일 인증이 완료되지 않았습니다.";
    if (code.includes("invalid_credentials") || text.includes("invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    return error?.message || "이메일 인증 요청을 처리하지 못했습니다.";
  }

  async function completeLogin(user) {
    const session = global.SNORKYAuthSession.create("test_email", user);
    global.SNORKYAuthSession.save(session);
    await global.SNORKYUserProfile.ensureUserProfile(session);
    global.location.replace(new URL("./index.html?fromLogin=1", global.location.href));
  }

  async function signUp() {
    showMessage("");
    try {
      const result = await global.getSnorkySupabase().auth.signUp(credentials());
      if (result.error) throw result.error;
      if (!result.data?.session) {
        const identities = result.data?.user?.identities;
        showMessage(Array.isArray(identities) && identities.length === 0 ? "이미 가입된 이메일입니다." : "이메일 인증 후 로그인해 주세요.", false);
        return;
      }
      await completeLogin(result.data.user);
    } catch (error) {
      showMessage(errorMessage(error));
    }
  }

  async function login() {
    showMessage("");
    try {
      const result = await global.getSnorkySupabase().auth.signInWithPassword(credentials());
      if (result.error) throw result.error;
      if (!result.data?.session || !result.data?.user) throw new Error("이메일 인증이 완료되지 않았습니다.");
      await completeLogin(result.data.user);
    } catch (error) {
      showMessage(errorMessage(error));
    }
  }

  byId("testEmailSignUp")?.addEventListener("click", signUp);
  byId("testEmailLogin")?.addEventListener("click", login);
})(window);
