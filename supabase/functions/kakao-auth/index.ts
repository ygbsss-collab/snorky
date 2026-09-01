const TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const USER_URL = "https://kapi.kakao.com/v2/user/me";
const UNLINK_URL = "https://kapi.kakao.com/v1/user/unlink";

type AuthInput = {
  action?: unknown;
  code?: unknown;
  redirectUri?: unknown;
  targetUserId?: unknown;
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
    "Access-Control-Allow-Origin": origin || "null",
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

function validRedirectUri(value: string, requestOrigin: string | null) {
  if (!requestOrigin) return false;
  try {
    const redirect = new URL(value);
    return (redirect.protocol === "http:" || redirect.protocol === "https:")
      && redirect.origin === requestOrigin;
  } catch {
    return false;
  }
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
    return new Response(null, { status: requestOrigin ? 204 : 403, headers: corsHeaders(requestOrigin) });
  }
  if (request.method !== "POST") return json({ message: "허용되지 않은 요청입니다." }, 405, requestOrigin);

  let input: AuthInput;
  try {
    input = await request.json();
  } catch {
    return json({ message: "요청 형식을 확인해 주세요." }, 400, requestOrigin);
  }

  const action = text(input?.action) || "login";

  // 1. 카카오 연결 해제 (Unlink)
  if (action === "unlink") {
    const targetUserId = text(input?.targetUserId);
    const accessToken = text(input?.accessToken);
    const adminKey = Deno.env.get("KAKAO_ADMIN_KEY");
    const restApiKey = Deno.env.get("KAKAO_REST_API_KEY");

    if (!targetUserId && !accessToken) {
      return json({ message: "탈퇴 요청 대상이 올바르지 않습니다." }, 400, requestOrigin);
    }

    try {
      let unlinkResponse: Response;
      if (accessToken) {
        unlinkResponse = await fetch(UNLINK_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          },
        });
      } else if (adminKey && targetUserId) {
        const unlinkBody = new URLSearchParams({
          target_id_type: "user_id",
          target_id: targetUserId,
        });
        unlinkResponse = await fetch(UNLINK_URL, {
          method: "POST",
          headers: {
            Authorization: `KakaoAK ${adminKey}`,
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          },
          body: unlinkBody,
        });
      } else {
        return json({ message: "카카오 연결 해제를 위한 인증 수단이 필요합니다." }, 401, requestOrigin);
      }

      const unlinkResult = await readJson(unlinkResponse);
      if (unlinkResponse.ok || unlinkResponse.status === 400) {
        return json({ ok: true, id: unlinkResult.id || targetUserId }, 200, requestOrigin);
      }
      return json({ message: "카카오 연결 해제 처리에 실패했습니다." }, 400, requestOrigin);
    } catch {
      return json({ message: "카카오 인증 서버에 연결하지 못했습니다." }, 502, requestOrigin);
    }
  }

  // 2. 카카오 로그인 (OAuth Callback)
  const code = text(input?.code);
  const redirectUri = text(input?.redirectUri);
  if (!code || code.length > 2048 || !validRedirectUri(redirectUri, requestOrigin)) {
    return json({ message: "로그인 요청이 올바르지 않습니다." }, 400, requestOrigin);
  }

  const restApiKey = Deno.env.get("KAKAO_REST_API_KEY");
  if (!restApiKey) {
    console.error("[kakao-auth] missing KAKAO_REST_API_KEY secret");
    return json({ message: "카카오 로그인 설정이 필요합니다." }, 503, requestOrigin);
  }

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: restApiKey,
    redirect_uri: redirectUri,
    code,
  });

  try {
    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: tokenBody,
    });
    const token = await readJson(tokenResponse);
    const accessToken = typeof token.access_token === "string" ? token.access_token : "";
    if (!tokenResponse.ok || !accessToken) {
      return json({ message: "카카오 인증을 완료하지 못했습니다." }, 401, requestOrigin);
    }

    const userResponse = await fetch(USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await readJson(userResponse);
    if (!userResponse.ok || profile.id === undefined || profile.id === null) {
      return json({ message: "카카오 사용자 정보를 확인하지 못했습니다." }, 401, requestOrigin);
    }

    const account = profile.kakao_account && typeof profile.kakao_account === "object"
      ? profile.kakao_account as Record<string, unknown>
      : {};
    const kakaoProfile = account.profile && typeof account.profile === "object"
      ? account.profile as Record<string, unknown>
      : {};
    const properties = profile.properties && typeof profile.properties === "object"
      ? profile.properties as Record<string, unknown>
      : {};

    return json({
      user: {
        id: String(profile.id),
        nickname: text(kakaoProfile.nickname) || text(properties.nickname) || "카카오 사용자",
        profileImageUrl: text(kakaoProfile.profile_image_url) || text(properties.profile_image) || null,
      },
    }, 200, requestOrigin);
  } catch {
    return json({ message: "카카오 로그인 서버에 연결하지 못했습니다." }, 502, requestOrigin);
  }
});
