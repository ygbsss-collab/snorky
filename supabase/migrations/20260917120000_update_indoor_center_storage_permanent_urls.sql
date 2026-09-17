-- 실내다이빙 센터 45개 대표 이미지(image_url, hero_image_url) 및 indoor_center_images를 Supabase Storage 영구 Public URL로 전환

update public.indoor_diving_centers set
  image_url = replace(
    image_url,
    './public/images/indoor-centers/',
    'https://vqpkckonpsnzhuwuybav.supabase.co/storage/v1/object/public/avatars/indoor_centers/'
  ),
  hero_image_url = replace(
    hero_image_url,
    './public/images/indoor-centers/',
    'https://vqpkckonpsnzhuwuybav.supabase.co/storage/v1/object/public/avatars/indoor_centers/'
  )
where image_url like './public/images/indoor-centers/%'
   or hero_image_url like './public/images/indoor-centers/%';

update public.indoor_center_images set
  storage_path = replace(
    storage_path,
    './public/images/indoor-centers/',
    'https://vqpkckonpsnzhuwuybav.supabase.co/storage/v1/object/public/avatars/indoor_centers/'
  )
where storage_path like './public/images/indoor-centers/%';
