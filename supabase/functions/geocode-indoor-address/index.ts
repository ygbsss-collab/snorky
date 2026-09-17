const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, reason: "METHOD_NOT_ALLOWED" }, 405);
  }

  let payload: { address?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, reason: "INVALID_JSON" }, 400);
  }

  const address = String(payload.address ?? "").trim();
  if (!address) {
    return jsonResponse({ ok: false, reason: "ADDRESS_REQUIRED" }, 400);
  }

  const kakaoRestApiKey = Deno.env.get("KAKAO_REST_API_KEY");
  if (!kakaoRestApiKey) {
    return jsonResponse({ ok: false, reason: "KAKAO_API_KEY_NOT_CONFIGURED" }, 500);
  }

  const kakaoUrl = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  kakaoUrl.searchParams.set("query", address);

  let kakaoResponse: Response;
  try {
    kakaoResponse = await fetch(kakaoUrl, {
      headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` }
    });
  } catch {
    return jsonResponse({ ok: false, reason: "KAKAO_REQUEST_FAILED", address }, 502);
  }

  if (!kakaoResponse.ok) {
    return jsonResponse({
      ok: false,
      reason: "KAKAO_API_ERROR",
      address,
      status: kakaoResponse.status
    }, 502);
  }

  let kakaoData: { documents?: Array<Record<string, unknown>> };
  try {
    kakaoData = await kakaoResponse.json();
  } catch {
    return jsonResponse({ ok: false, reason: "KAKAO_INVALID_RESPONSE", address }, 502);
  }

  const documents = Array.isArray(kakaoData.documents) ? kakaoData.documents : [];
  if (documents.length === 0) {
    return jsonResponse({ ok: false, reason: "NO_RESULT", address });
  }

  const results = documents.map((document) => {
    const roadAddress = document.road_address as Record<string, unknown> | null | undefined;
    return {
      address_name: String(document.address_name ?? ""),
      road_address_name: String(roadAddress?.address_name ?? ""),
      lat: toNumber(document.y),
      lng: toNumber(document.x)
    };
  });

  if (documents.length > 1) {
    return jsonResponse({
      ok: false,
      reason: "MULTIPLE_RESULTS",
      address,
      results
    });
  }

  const result = results[0];
  if (result.lat === null || result.lng === null) {
    return jsonResponse({ ok: false, reason: "INVALID_COORDINATES", address }, 502);
  }

  return jsonResponse({
    ok: true,
    address,
    lat: result.lat,
    lng: result.lng,
    result_count: documents.length
  });
});
