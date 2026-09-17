-- 실내다이빙 센터 45개 대표 이미지(image_url, hero_image_url) 및 indoor_center_images Storage 영구 저장 매핑 마이그레이션

update public.indoor_diving_centers set
  image_url = case name
    when '송파 올림픽수영장 다이빙풀' then './public/images/indoor-centers/stitch_pool_1.png'
    when 'KUA 잠실다이빙풀장' then './public/images/indoor-centers/stitch_pool_2.png'
    when '딥스테이션' then './public/images/indoor-centers/stitch_pool_3.png'
    when '파라다이브35' then './public/images/indoor-centers/stitch_pool_4.png'
    when '송도 스포츠파크 잠수풀' then './public/images/indoor-centers/stitch_pool_5.png'
    when 'K26 잠수풀' then './public/images/indoor-centers/stitch_pool_6.png'
    when '테마 오산 잠수풀' then './public/images/indoor-centers/stitch_pool_7.png'
    when '씨네블루 파주 잠수풀' then './public/images/indoor-centers/stitch_pool_8.png'
    when '뉴서울다이빙풀' then './public/images/indoor-centers/stitch_pool_9.png'
    when '대부잠수풀' then './public/images/indoor-centers/stitch_pool_10.png'
    when '서브마린다이빙풀' then './public/images/indoor-centers/stitch_pool_1.png'
    when '수원 스킨스쿠버 다이빙풀' then './public/images/indoor-centers/stitch_pool_2.png'
    when '메르다이빙센터 일산점' then './public/images/indoor-centers/stitch_pool_3.png'
    when '아르피아 잠수풀' then './public/images/indoor-centers/stitch_pool_4.png'
    when '포프라자' then './public/images/indoor-centers/stitch_pool_5.png'
    when '양주에코스포츠센터' then './public/images/indoor-centers/stitch_pool_6.png'
    when '수작코리아 수중촬영장' then './public/images/indoor-centers/stitch_pool_7.png'
    when '용문국민체육센터' then './public/images/indoor-centers/stitch_pool_8.png'
    when '아쿠아라인 다목적풀' then './public/images/indoor-centers/stitch_pool_9.png'
    when '웨이브파크 블루홀라군' then './public/images/indoor-centers/stitch_pool_10.png'
    when '화성그린환경센터' then './public/images/indoor-centers/stitch_pool_1.png'
    when '알프스다이빙' then './public/images/indoor-centers/stitch_pool_2.png'
    when '충북학생수영장' then './public/images/indoor-centers/stitch_pool_3.png'
    when '강릉 북부수영장' then './public/images/indoor-centers/stitch_pool_4.png'
    when '강릉국민체육센터' then './public/images/indoor-centers/stitch_pool_5.png'
    when '올덴K10잠수풀' then './public/images/indoor-centers/stitch_pool_6.png'
    when '패스나인 다이빙센터' then './public/images/indoor-centers/stitch_pool_7.png'
    when '울진해양레포츠센터' then './public/images/indoor-centers/stitch_pool_8.png'
    when '북항마리나 다이빙풀' then './public/images/indoor-centers/stitch_pool_9.png'
    when '밀양 아리랑 잠수풀' then './public/images/indoor-centers/stitch_pool_10.png'
    when '문수실내수영장 다이빙풀' then './public/images/indoor-centers/stitch_pool_1.png'
    when '사직실내수영장 다이빙풀' then './public/images/indoor-centers/stitch_pool_2.png'
    when '고성해양레포츠아카데미' then './public/images/indoor-centers/stitch_pool_3.png'
    when '송도해양레포츠센터 잠수풀' then './public/images/indoor-centers/stitch_pool_4.png'
    when '풀식스다이빙풀' then './public/images/indoor-centers/stitch_pool_5.png'
    when '창원실내수영장 다이빙풀' then './public/images/indoor-centers/stitch_pool_6.png'
    when 'DIT 잠수풀장' then './public/images/indoor-centers/stitch_pool_7.png'
    when '염주체육관 다이빙풀' then './public/images/indoor-centers/stitch_pool_8.png'
    when '전북잠수전문학교 익산점' then './public/images/indoor-centers/stitch_pool_9.png'
    when '여수시청소년해양교육원 잠수풀' then './public/images/indoor-centers/stitch_pool_10.png'
    when '군산오션팔레트 잠수풀' then './public/images/indoor-centers/stitch_pool_1.png'
    when '전주완산수영장 다이빙풀' then './public/images/indoor-centers/stitch_pool_2.png'
    when '다이브자이언트 제주교육센터' then './public/images/indoor-centers/stitch_pool_3.png'
    when '수원 월드컵경기장 다이빙풀' then './public/images/indoor-centers/stitch_pool_4.png'
    when '아산 실내스킨스쿠버 다이빙풀 (배미수영장)' then './public/images/indoor-centers/stitch_pool_5.png'
    else './public/images/indoor-centers/stitch_pool_1.png'
  end,
  hero_image_url = case name
    when '송파 올림픽수영장 다이빙풀' then './public/images/indoor-centers/stitch_pool_1.png'
    when 'KUA 잠실다이빙풀장' then './public/images/indoor-centers/stitch_pool_2.png'
    when '딥스테이션' then './public/images/indoor-centers/stitch_pool_3.png'
    when '파라다이브35' then './public/images/indoor-centers/stitch_pool_4.png'
    when '송도 스포츠파크 잠수풀' then './public/images/indoor-centers/stitch_pool_5.png'
    when 'K26 잠수풀' then './public/images/indoor-centers/stitch_pool_6.png'
    when '테마 오산 잠수풀' then './public/images/indoor-centers/stitch_pool_7.png'
    when '씨네블루 파주 잠수풀' then './public/images/indoor-centers/stitch_pool_8.png'
    when '뉴서울다이빙풀' then './public/images/indoor-centers/stitch_pool_9.png'
    when '대부잠수풀' then './public/images/indoor-centers/stitch_pool_10.png'
    when '서브마린다이빙풀' then './public/images/indoor-centers/stitch_pool_1.png'
    when '수원 스킨스쿠버 다이빙풀' then './public/images/indoor-centers/stitch_pool_2.png'
    when '메르다이빙센터 일산점' then './public/images/indoor-centers/stitch_pool_3.png'
    when '아르피아 잠수풀' then './public/images/indoor-centers/stitch_pool_4.png'
    when '포프라자' then './public/images/indoor-centers/stitch_pool_5.png'
    when '양주에코스포츠센터' then './public/images/indoor-centers/stitch_pool_6.png'
    when '수작코리아 수중촬영장' then './public/images/indoor-centers/stitch_pool_7.png'
    when '용문국민체육센터' then './public/images/indoor-centers/stitch_pool_8.png'
    when '아쿠아라인 다목적풀' then './public/images/indoor-centers/stitch_pool_9.png'
    when '웨이브파크 블루홀라군' then './public/images/indoor-centers/stitch_pool_10.png'
    when '화성그린환경센터' then './public/images/indoor-centers/stitch_pool_1.png'
    when '알프스다이빙' then './public/images/indoor-centers/stitch_pool_2.png'
    when '충북학생수영장' then './public/images/indoor-centers/stitch_pool_3.png'
    when '강릉 북부수영장' then './public/images/indoor-centers/stitch_pool_4.png'
    when '강릉국민체육센터' then './public/images/indoor-centers/stitch_pool_5.png'
    when '올덴K10잠수풀' then './public/images/indoor-centers/stitch_pool_6.png'
    when '패스나인 다이빙센터' then './public/images/indoor-centers/stitch_pool_7.png'
    when '울진해양레포츠센터' then './public/images/indoor-centers/stitch_pool_8.png'
    when '북항마리나 다이빙풀' then './public/images/indoor-centers/stitch_pool_9.png'
    when '밀양 아리랑 잠수풀' then './public/images/indoor-centers/stitch_pool_10.png'
    when '문수실내수영장 다이빙풀' then './public/images/indoor-centers/stitch_pool_1.png'
    when '사직실내수영장 다이빙풀' then './public/images/indoor-centers/stitch_pool_2.png'
    when '고성해양레포츠아카데미' then './public/images/indoor-centers/stitch_pool_3.png'
    when '송도해양레포츠센터 잠수풀' then './public/images/indoor-centers/stitch_pool_4.png'
    when '풀식스다이빙풀' then './public/images/indoor-centers/stitch_pool_5.png'
    when '창원실내수영장 다이빙풀' then './public/images/indoor-centers/stitch_pool_6.png'
    when 'DIT 잠수풀장' then './public/images/indoor-centers/stitch_pool_7.png'
    when '염주체육관 다이빙풀' then './public/images/indoor-centers/stitch_pool_8.png'
    when '전북잠수전문학교 익산점' then './public/images/indoor-centers/stitch_pool_9.png'
    when '여수시청소년해양교육원 잠수풀' then './public/images/indoor-centers/stitch_pool_10.png'
    when '군산오션팔레트 잠수풀' then './public/images/indoor-centers/stitch_pool_1.png'
    when '전주완산수영장 다이빙풀' then './public/images/indoor-centers/stitch_pool_2.png'
    when '다이브자이언트 제주교육센터' then './public/images/indoor-centers/stitch_pool_3.png'
    when '수원 월드컵경기장 다이빙풀' then './public/images/indoor-centers/stitch_pool_4.png'
    when '아산 실내스킨스쿠버 다이빙풀 (배미수영장)' then './public/images/indoor-centers/stitch_pool_5.png'
    else './public/images/indoor-centers/stitch_pool_1.png'
  end,
  hero_image_source = 'stitch_permanent';

-- 기존 만료된 aida/lh3 URL indoor_center_images 정리 및 stitch 대표 이미지 등록
delete from public.indoor_center_images
where storage_path like 'https://lh3.googleusercontent.com%'
   or storage_path like '%buddy-banner-clean.png%';

-- 각 센터별 대표 이미지 row 삽입 (기존 row가 없는 센터 대상)
insert into public.indoor_center_images (center_id, storage_path, file_name, mime_type, is_primary, sort_order)
select
  c.id,
  c.image_url,
  substring(c.image_url from '[^/]+$'),
  'image/png',
  true,
  0
from public.indoor_diving_centers c
where not exists (
  select 1 from public.indoor_center_images ici
  where ici.center_id = c.id
);
