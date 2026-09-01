import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const USER_ME_URL = "https://kapi.kakao.com/v2/user/me";
const UNLINK_URL = "https://kapi.kakao.com/v1/user/unlink";

type DeleteAccountInput = {
  providerUserId?: unknown;
  code?: unknown;
  redirectUri?: unknown;
  accessToken?: unknown;
};

function normalizeOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = await response.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

Deno.serve(async (request) => {
  const requestOrigin = normalizeOrigin(request.headers.get("Origin"));
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(requestOrigin) });
  }
  if (request.method !== "POST") {
    return json({ ok: false, step: "method", message: "허용되지 않은 요청입니다." }, 405, requestOrigin);
  }

  let input: DeleteAccountInput;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, step: "validation", message: "요청 형식이 올바르지 않습니다." }, 400, requestOrigin);
  }

  const requestedUserId = text(input?.providerUserId);
  const code = text(input?.code);
  const redirectUri = text(input?.redirectUri);
  let accessToken = text(input?.accessToken);

  // 1. 필수 파라미터 확인 (requestedUserId 필수)
  if (!requestedUserId) {
    return json({ ok: false, step: "validation", message: "탈퇴 대상 사용자 식별값이 누락되었습니다." }, 400, requestOrigin);
  }

  const restApiKey = Deno.env.get("KAKAO_REST_API_KEY");

  // 2. 인가코드(code)가 전달된 경우: 서버에서 1회성 Access Token으로 직접 교환
  if (code && redirectUri) {
    if (!restApiKey) {
      console.error("[delete-account] missing KAKAO_REST_API_KEY secret");
      return json({ ok: false, step: "server_config", message: "카카오 인증 서버 설정이 누락되었습니다." }, 503, requestOrigin);
    }

    try {
      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: restApiKey,
        redirect_uri: redirectUri,
        code,
      });

      const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: tokenBody,
      });

      const tokenData = await readJson(tokenResponse);
      const exchangedToken = typeof tokenData.access_token === "string" ? tokenData.access_token : "";

      if (!tokenResponse.ok || !exchangedToken) {
        return json({
          ok: false,
          step: "token_exchange",
          message: "카카오 인증 토큰 교환에 실패했습니다. 다시 로그인 후 시도해 주세요.",
        }, 401, requestOrigin);
      }

      accessToken = exchangedToken;
    } catch {
      return json({
        ok: false,
        step: "token_exchange_network",
        message: "카카오 인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      }, 502, requestOrigin);
    }
  }

  // 토큰 미존재 시 본인 검증 불가로 차단
  if (!accessToken) {
    return json({
      ok: false,
      step: "auth_missing",
      message: "탈퇴 인증을 위한 카카오 인가 정보가 누락되었습니다.",
    }, 401, requestOrigin);
  }

  // 3. 카카오 서버를 통한 본인 검증 (/v2/user/me)
  // providerUserId를 클라이언트 요청값만 믿지 않고, 카카오 인증 서버에서 반환된 실제 ID와 엄격 대조
  let verifiedKakaoUserId = "";
  try {
    const userMeResponse = await fetch(USER_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meData = await readJson(userMeResponse);

    if (!userMeResponse.ok || meData.id === undefined || meData.id === null) {
      return json({
        ok: false,
        step: "user_verification",
        message: "카카오 로그인 인증이 만료되었거나 유효하지 않습니다. 다시 시도해 주세요.",
      }, 401, requestOrigin);
    }

    verifiedKakaoUserId = String(meData.id);
    if (verifiedKakaoUserId !== requestedUserId) {
      return json({
        ok: false,
        step: "identity_mismatch",
        message: "현재 로그인된 계정과 재인증된 카카오 계정 정보가 일치하지 않습니다.",
      }, 403, requestOrigin);
    }
  } catch {
    return json({
      ok: false,
      step: "kakao_network",
      message: "카카오 인증 서버와 통신하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    }, 502, requestOrigin);
  }

  // 4. 카카오 연결 해제 (OAuth Unlink)
  // 검증된 사용자 Access Token으로 연결 끊기 호출 -> 즉시 토큰 무효화
  let unlinkSuccess = false;
  try {
    const unlinkResponse = await fetch(UNLINK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
    });

    if (unlinkResponse.ok || unlinkResponse.status === 400) {
      // 200 OK 또는 이미 연결 해제된 계정(400)
      unlinkSuccess = true;
    } else {
      const resJson = await readJson(unlinkResponse);
      const msg = typeof resJson.msg === "string" ? resJson.msg : "카카오 연결 해제 처리에 실패했습니다.";
      return json({ ok: false, step: "kakao_unlink", message: msg }, 400, requestOrigin);
    }
  } catch {
    return json({
      ok: false,
      step: "kakao_unlink_network",
      message: "카카오 연결 해제 서버에 연결하지 못했습니다.",
    }, 502, requestOrigin);
  }

  if (!unlinkSuccess) {
    return json({ ok: false, step: "kakao_unlink", message: "카카오 연결 해제를 완료하지 못했습니다." }, 400, requestOrigin);
  }

  // 5. Supabase DB 사용자 프로필 및 스토리지 데이터 삭제 (Unlink 성공 후에만 실행)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

  if (supabaseUrl && serviceRoleKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // 5-1. user_profiles 테이블 레코드 삭제
      const { error: profileDeleteError } = await supabase
        .from("user_profiles")
        .delete()
        .eq("provider", "kakao")
        .eq("provider_user_id", verifiedKakaoUserId);

      if (profileDeleteError) {
        return json({
          ok: false,
          step: "db_profile_delete",
          message: "프로필 데이터 삭제 중 오류가 발생했습니다.",
        }, 500, requestOrigin);
      }

      // 5-2. avatars 스토리지 버킷 파일 삭제
      try {
        const { data: files } = await supabase.storage.from("avatars").list("user_avatars", {
          search: `kakao_${verifiedKakaoUserId}_`,
        });
        if (Array.isArray(files) && files.length > 0) {
          const filePaths = files.map((f: { name: string }) => `user_avatars/${f.name}`);
          await supabase.storage.from("avatars").remove(filePaths);
        }
      } catch {
        // 스토리지 파일 삭제 실패는 비치명적 경고 처리
      }
    } catch {
      return json({
        ok: false,
        step: "db_connection",
        message: "데이터베이스 연결 오류가 발생했습니다.",
      }, 500, requestOrigin);
    }
  }

  // 6. 최종 성공 응답 (토큰은 클라이언트에 반환하지 않음)
  return json({
    ok: true,
    message: "회원탈퇴 및 데이터 삭제가 정상적으로 완료되었습니다.",
  }, 200, requestOrigin);
});
