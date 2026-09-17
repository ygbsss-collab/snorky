-- 포인트 주차 위치 좌표 컬럼 추가
-- parking_lat / parking_lng: 주차 위치 핀을 지도에서 찍으면 저장
ALTER TABLE public.points
  ADD COLUMN IF NOT EXISTS parking_lat numeric(10, 7),
  ADD COLUMN IF NOT EXISTS parking_lng numeric(10, 7);

COMMENT ON COLUMN public.points.parking_lat IS '주차 위치 위도 (카카오지도 핀)';
COMMENT ON COLUMN public.points.parking_lng IS '주차 위치 경도 (카카오지도 핀)';
