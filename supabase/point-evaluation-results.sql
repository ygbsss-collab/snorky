-- ============================================================================
-- SNORKY 2.0 Evaluation Results Storage DDL
-- Table Name: public.point_evaluation_results
-- Rationale: Matches standard repository convention (open_meteo_marine_cache, kma_weather_cache, kma_safety_cache),
-- explicitly reflects point-based evaluation outputs across modes (TODAY, SHORT, MID_MARINE_ONLY),
-- and conforms to PostgreSQL snake_case / plural naming.
--
-- Unique Key Contract: (point_id, target_date, mode, period_start, period_end)
-- Version: V1.5
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.point_evaluation_results (
    id BIGSERIAL PRIMARY KEY,
    point_id INTEGER NOT NULL REFERENCES public.points(id) ON DELETE CASCADE,
    target_date DATE NOT NULL,
    mode VARCHAR(20) NOT NULL, -- 'TODAY' | 'SHORT' | 'MID_MARINE_ONLY'
    slot_index SMALLINT NULL,  -- 0~4 for SHORT 3h slots, NULL for others
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    
    -- Engine Metadata
    algorithm_version VARCHAR(10) NOT NULL DEFAULT 'V1.5',
    quality_status VARCHAR(10) NOT NULL, -- 'READY' | 'PARTIAL' | 'UNKNOWN'
    
    -- Evaluation Output
    safety_status VARCHAR(10) NOT NULL,  -- 'PASS' | 'BLOCK' | 'UNKNOWN'
    safety_reasons TEXT[] NOT NULL DEFAULT '{}',
    condition_score SMALLINT NULL,       -- 0~100 or NULL (BLOCK/UNKNOWN)
    condition_status VARCHAR(20) NOT NULL, -- '좋음' | '보통' | '주의' | '나쁨' | '입수 금지' | '확인 필요'
    visibility_score SMALLINT NULL,      -- 0~100 or NULL
    visibility_grade VARCHAR(20) NOT NULL, -- '좋음' | '양호' | '보통/회복중' | '나쁨' | '매우나쁨' | 'UNKNOWN'
    visibility_explanation TEXT NOT NULL,
    recommendation VARCHAR(20) NOT NULL,  -- '추천' | '주의' | '비추천'
    
    -- Timestamps & Source Tracing
    point_updated_at TIMESTAMPTZ NULL,   -- 평가 당시 적용된 Point Profile(points.updated_at) 기준 시각
    forecast_time TIMESTAMPTZ NULL,      -- 실제 사용한 예보 슬롯 시각
    source_issue_time JSONB NULL,        -- 소스별 실제 사용 시각 { marine_fetched_at, kma_base_time, safety_fetched_at, rn1_observed_at, mid_land_base_time, mid_temp_base_time }
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- 계산 완료 시각
    
    -- UI Metrics (MID는 min~max 3종 포함)
    metrics JSONB NOT NULL,              -- UI 표시용 물리값 { wave_height, current_speed, wind_speed, wave_period, sea_temperature, ... }
    min_max_metrics JSONB NULL,          -- MID 전용 { wave_height: {min, max, mean}, current_speed: {min, max, mean}, sea_temperature: {min, max, mean}, wave_period }
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Composite Natural Unique Key for UPSERT
    CONSTRAINT uq_point_evaluation_results UNIQUE (point_id, target_date, mode, period_start, period_end)
);

-- Indexes for high performance reads
CREATE INDEX IF NOT EXISTS idx_eval_results_point_date
    ON public.point_evaluation_results(point_id, target_date);

CREATE INDEX IF NOT EXISTS idx_eval_results_mode_date
    ON public.point_evaluation_results(mode, target_date);

CREATE INDEX IF NOT EXISTS idx_eval_results_best_ranking
    ON public.point_evaluation_results(target_date, mode, safety_status, condition_score DESC);

-- RLS Policies
ALTER TABLE public.point_evaluation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read-only access to evaluation results"
    ON public.point_evaluation_results FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow service role full access to evaluation results"
    ON public.point_evaluation_results FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
