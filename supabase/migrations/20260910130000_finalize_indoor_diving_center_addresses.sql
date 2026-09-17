begin;

update public.indoor_diving_centers
set address = '경기 안산시 단원구 영전로 126'
where name = '대부잠수풀';

update public.indoor_diving_centers
set address = '경기 양주시 은현면 은남로 177'
where name = '양주에코스포츠센터';

update public.indoor_diving_centers
set address = '경기 양평군 용문면 용문체육공원길 55'
where name = '용문국민체육센터';

update public.indoor_diving_centers
set address = '충북 청주시 청원구 공항로59번길 33'
where name = '충북학생수영장 다이빙장';

update public.indoor_diving_centers
set address = '경북 울진군 기성면 망양리 87-2'
where name = '울진 올덴 K-10 잠수풀';

update public.indoor_diving_centers
set address = '경북 칠곡군 북삼읍 북삼로 25-19'
where name = '패스나인';

update public.indoor_diving_centers
set address = '부산 중구 이순신대로 72'
where name = '부산 북항 마리나 다이빙풀';

update public.indoor_diving_centers
set address = '부산 동래구 종합운동장로 29'
where name = '사직실내수영장 다이빙풀';

update public.indoor_diving_centers
set address = '전남 여수시 오동도로 61-7'
where name = '여수시청소년해양교육원 다이빙풀장';

update public.indoor_diving_centers
set address = '경기 오산시 청학로 286'
where name = '테마 오산 잠수풀';

update public.indoor_diving_centers
set address = '경기 가평군 청평면 고재길 262-57'
where name = 'K-26 실전잠수풀';

update public.indoor_diving_centers
set address = '경기 시흥시 거북섬중앙로 1'
where name = '파라다이브35';

update public.indoor_diving_centers
set address = '인천 연수구 인천신항대로892번길 40'
where name = '송도 스포츠파크 잠수풀';

update public.indoor_diving_centers
set name = '수원 월드컵다이빙풀',
    address = '경기 수원시 팔달구 월드컵로 310'
where id = 'center_44';

delete from public.indoor_diving_centers
where id = 'center_12';

commit;
