import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { runPointEvaluationBatch } from "../supabase/functions/point-evaluation-refresh/index.ts";

dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or key in .env");
  process.exit(1);
}

const client = createClient(url, key);

async function main() {
  console.log("=== 1. Running Re-Evaluation for All Active Points with Updated Engine ===");
  const report = await runPointEvaluationBatch(client);
  console.log(`• Batch completed: ok=${report.ok}, total_points=${report.total_points}, success=${report.successful_points}, records=${report.total_records_upserted}`);

  console.log("\n=== 2. Verifying Point 4 (영진해변) Evaluation Results (29 Slots) ===");
  const { data: rows, error } = await client
    .from("point_evaluation_results")
    .select("id, point_id, mode, slot_index, target_date, forecast_time, period_start, period_end, safety_status, condition_score, condition_status, recommendation, wave_height, current_speed, wind_speed, warning_summary")
    .eq("point_id", 4)
    .order("target_date", { ascending: true })
    .order("slot_index", { ascending: true });

  if (error) {
    console.error("Error fetching point 4 results:", error);
    process.exit(1);
  }

  console.log(`• Total slots returned for Point 4: ${rows.length} / 29`);
  
  // Group by mode
  const byMode: Record<string, typeof rows> = {};
  for (const r of rows) {
    byMode[r.mode] = byMode[r.mode] || [];
    byMode[r.mode].push(r);
  }

  for (const mode of Object.keys(byMode)) {
    console.log(`\n  Mode: ${mode} (${byMode[mode].length} slots)`);
    for (const r of byMode[mode]) {
      console.log(`    - Slot ${r.slot_index} [${r.period_start?.slice(11, 16) || r.forecast_time?.slice(11, 16)}]: safety=${r.safety_status}, score=${r.condition_score}, status=${r.condition_status}, wave=${r.wave_height}m, current=${r.current_speed}m/s, wind=${r.wind_speed}m/s`);
    }
  }

  // Check if any slot has BLOCK caused by current
  const blockedRows = rows.filter(r => r.safety_status === "BLOCK");
  console.log(`\n• Blocked Slots count: ${blockedRows.length} / ${rows.length}`);
  
  for (const b of blockedRows) {
    console.log(`  - Blocked Slot: mode=${b.mode}, slot=${b.slot_index}, wave=${b.wave_height}m, current=${b.current_speed}m/s, warning=${b.warning_summary || "none"}`);
  }

  // Check if wave is <= 0.80 and no warning, whether it is PASS
  const passRows = rows.filter(r => r.safety_status === "PASS");
  console.log(`• PASS Slots count: ${passRows.length} / ${rows.length}`);
  if (passRows.length > 0) {
    const sample = passRows[0];
    console.log(`  - Sample PASS slot has current_speed=${sample.current_speed}m/s with score=${sample.condition_score} (${sample.condition_status}) -> 조류가 높아도 입수금지 미발효!`);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
