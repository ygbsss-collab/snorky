// Supabase REST API를 통한 buddy_alert_settings upsert & select 검증
const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

async function verifyAlertSettingsApi() {
  console.log("=== Testing buddy_alert_settings Supabase API ===");

  const testUserId = "test_user_verify_123";
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${publishableKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation"
  };

  // 1. Upsert test
  const payload = {
    user_id: testUserId,
    enabled: true,
    date_filter: "weekend",
    region: "강원",
    sub_region: "고성",
    activity_type: "프리다이빙",
    difficulty: "중급",
    recruit_gender: "성별 무관",
    host_gender: "남성",
    participant_level: "AIDA 2",
    updated_at: new Date().toISOString()
  };

  console.log("1. Upserting alert settings...");
  const postRes = await fetch(`${restUrl}/buddy_alert_settings?on_conflict=user_id`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!postRes.ok) {
    const errText = await postRes.text();
    throw new Error(`Upsert failed (${postRes.status}): ${errText}`);
  }

  const postData = await postRes.json();
  console.log("✔ Upsert success:", postData[0]);

  // 2. Select test
  console.log("2. Fetching alert settings...");
  const getRes = await fetch(`${restUrl}/buddy_alert_settings?user_id=eq.${testUserId}&select=*`, {
    method: "GET",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`
    }
  });

  if (!getRes.ok) {
    const errText = await getRes.text();
    throw new Error(`Fetch failed (${getRes.status}): ${errText}`);
  }

  const getData = await getRes.json();
  console.log("✔ Fetch success:", getData[0]);

  // 3. Clean up test row
  console.log("3. Cleaning up test record...");
  await fetch(`${restUrl}/buddy_alert_settings?user_id=eq.${testUserId}`, {
    method: "DELETE",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`
    }
  });
  console.log("✔ Clean up complete. ALL REST API CHECKS PASSED!");
}

verifyAlertSettingsApi().catch(err => {
  console.error("❌ API Verification Failed:", err);
  process.exit(1);
});
