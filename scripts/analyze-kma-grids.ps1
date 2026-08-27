$ErrorActionPreference = 'Stop'
$scriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { Join-Path (Get-Location) 'scripts' } else { $PSScriptRoot }

function ConvertTo-KmaGrid([double]$Latitude, [double]$Longitude) {
  $RE=6371.00877; $GRID=5.0; $SLAT1=30.0; $SLAT2=60.0; $OLON=126.0; $OLAT=38.0; $XO=43.0; $YO=136.0
  $DEGRAD=[Math]::PI/180.0; $re=$RE/$GRID; $slat1=$SLAT1*$DEGRAD; $slat2=$SLAT2*$DEGRAD; $olon=$OLON*$DEGRAD; $olat=$OLAT*$DEGRAD
  $sn=[Math]::Tan([Math]::PI*0.25+$slat2*0.5)/[Math]::Tan([Math]::PI*0.25+$slat1*0.5)
  $sn=[Math]::Log([Math]::Cos($slat1)/[Math]::Cos($slat2))/[Math]::Log($sn)
  $sf=[Math]::Tan([Math]::PI*0.25+$slat1*0.5); $sf=[Math]::Pow($sf,$sn)*[Math]::Cos($slat1)/$sn
  $ro=[Math]::Tan([Math]::PI*0.25+$olat*0.5); $ro=$re*$sf/[Math]::Pow($ro,$sn)
  $ra=[Math]::Tan([Math]::PI*0.25+$Latitude*$DEGRAD*0.5); $ra=$re*$sf/[Math]::Pow($ra,$sn)
  $theta=$Longitude*$DEGRAD-$olon; if($theta-gt[Math]::PI){$theta-=2*[Math]::PI}; if($theta-lt-[Math]::PI){$theta+=2*[Math]::PI}; $theta*=$sn
  [pscustomobject]@{nx=[int][Math]::Floor($ra*[Math]::Sin($theta)+$XO+0.5);ny=[int][Math]::Floor($ro-$ra*[Math]::Cos($theta)+$YO+0.5)}
}

$config=Get-Content (Join-Path $scriptRoot '..\public\js\supabase-client.js') -Raw
$base=[regex]::Match($config,'url:"([^"]+)"').Groups[1].Value
$key=[regex]::Match($config,'publishableKey:"([^"]+)"').Groups[1].Value
$headers=@{apikey=$key;Authorization="Bearer $key"}
$regionPayload=Invoke-RestMethod -Uri "$base/rest/v1/regions?select=id,name" -Headers $headers -TimeoutSec 15
$pointPayload=Invoke-RestMethod -Uri "$base/rest/v1/points?select=id,name,region_id,lat,lng&order=id.asc" -Headers $headers -TimeoutSec 15
$regions=if($regionPayload -is [array]){@($regionPayload.GetEnumerator())}else{@($regionPayload)}
$points=if($pointPayload -is [array]){@($pointPayload.GetEnumerator())}else{@($pointPayload)}
$regionNames=@{};foreach($region in $regions){$regionNames[[string]$region.id]=$region.name}
$invalid=@();$valid=@()
foreach($point in $points){
  $reason=$null;$lat=0.0;$lng=0.0
  if($null-eq$point.lat-or[string]::IsNullOrWhiteSpace([string]$point.lat)){$reason='latitude 없음'}
  elseif($null-eq$point.lng-or[string]::IsNullOrWhiteSpace([string]$point.lng)){$reason='longitude 없음'}
  elseif(-not[double]::TryParse([string]$point.lat,[ref]$lat)-or-not[double]::TryParse([string]$point.lng,[ref]$lng)){$reason='좌표가 숫자가 아님'}
  elseif($lat-lt32-or$lat-gt39.8-or$lng-lt124-or$lng-gt132){$reason='대한민국 범위 밖'}
  if($reason){$invalid+=[pscustomobject]@{id=$point.id;name=$point.name;region=$regionNames[[string]$point.region_id];latitude=$point.lat;longitude=$point.lng;reason=$reason};continue}
  $grid=ConvertTo-KmaGrid $lat $lng
  if($grid.nx-lt1-or$grid.nx-gt149-or$grid.ny-lt1-or$grid.ny-gt253){$invalid+=[pscustomobject]@{id=$point.id;name=$point.name;region=$regionNames[[string]$point.region_id];latitude=$lat;longitude=$lng;reason='nx/ny 변환 범위 밖'};continue}
  $valid+=[pscustomobject]@{id=$point.id;name=$point.name;region=$regionNames[[string]$point.region_id];latitude=$lat;longitude=$lng;nx=$grid.nx;ny=$grid.ny;gridKey="$($grid.nx):$($grid.ny)"}
}
$groups=@($valid|Group-Object gridKey|Sort-Object -Property @{Expression='Count';Descending=$true},@{Expression='Name';Descending=$false})
$regional=@($valid|Group-Object region|ForEach-Object{[pscustomobject]@{region=$_.Name;points=$_.Count;uniqueGrids=@($_.Group.gridKey|Sort-Object -Unique).Count}}|Sort-Object region)
$unique=$groups.Count;$validCount=$valid.Count;$saved=$validCount-$unique;$compression=if($validCount){$unique/$validCount}else{0};$reduction=if($validCount){$saved/$validCount}else{0}
$gajin=$valid|Where-Object{$_.name-eq'가진해변'}|Select-Object -First 1
$result=[ordered]@{generatedAt=(Get-Date).ToString('o');totalActivePoints=$points.Count;validCoordinatePoints=$validCount;invalidCoordinatePoints=$invalid.Count;uniqueGridCount=$unique;compressionRatio=$compression;pointCallsPerRelease=$validCount;gridCallsPerRelease=$unique;savedCallsPerRelease=$saved;reductionRatio=$reduction;gajinBeach=$gajin;regions=$regional;topSharedGrids=@($groups|Select-Object -First 10|ForEach-Object{[pscustomobject]@{gridKey=$_.Name;points=$_.Count;names=@($_.Group.name)}});invalidPoints=$invalid;points=$valid}
$tmp=[IO.Path]::GetFullPath((Join-Path $scriptRoot '..\tmp'));New-Item -ItemType Directory -Path $tmp -Force|Out-Null;$output=Join-Path $tmp 'kma-grid-analysis.json';[IO.File]::WriteAllText($output,($result|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false));$result|ConvertTo-Json -Depth 8
