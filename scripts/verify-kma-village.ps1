$ErrorActionPreference = 'Stop'

$endpoint = 'https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst'
$nx = 86
$ny = 145
$key = $env:KMA_API_KEY
if ([string]::IsNullOrWhiteSpace($key)) { throw 'KMA_API_KEY 환경변수가 없습니다.' }

$kst = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Korea Standard Time').AddMinutes(-40)
$issueHours = @(2, 5, 8, 11, 14, 17, 20, 23)
$available = @($issueHours | Where-Object { $_ -le $kst.Hour })
if ($available.Count -eq 0) {
  $baseDate = $kst.AddDays(-1).ToString('yyyyMMdd')
  $baseHour = 23
} else {
  $baseDate = $kst.ToString('yyyyMMdd')
  $baseHour = $available[-1]
}
$baseTime = '{0:D2}00' -f $baseHour
$parameters = @{
  pageNo = '1'; numOfRows = '2000'; dataType = 'JSON'
  base_date = $baseDate; base_time = $baseTime
  nx = [string]$nx; ny = [string]$ny; authKey = $key
}

$timer = [Diagnostics.Stopwatch]::StartNew()
$response = Invoke-WebRequest -Uri $endpoint -Method Get -Body $parameters -TimeoutSec 25 -UseBasicParsing
$timer.Stop()
$payload = $response.Content | ConvertFrom-Json
$header = $payload.response.header
$items = @($payload.response.body.items.item)
$times = @($items | ForEach-Object { "{0}{1}" -f $_.fcstDate, $_.fcstTime } | Sort-Object -Unique)
$categories = @('TMP','WSD','VEC','PCP','POP','SKY','PTY','TMX','TMN')
$present = @{}
foreach ($category in $categories) { $present[$category] = @($items | Where-Object { $_.category -eq $category }).Count -gt 0 }

$hourly = foreach ($time in ($times | Select-Object -First 12)) {
  $row = [ordered]@{ time = $time }
  foreach ($category in @('TMP','WSD','VEC','PCP','POP','SKY','PTY')) {
    $item = $items | Where-Object { ("{0}{1}" -f $_.fcstDate, $_.fcstTime) -eq $time -and $_.category -eq $category } | Select-Object -First 1
    $row[$category] = if ($null -ne $item) { $item.fcstValue } else { $null }
  }
  [pscustomobject]$row
}
$daily = foreach ($date in @($items.fcstDate | Sort-Object -Unique)) {
  $tmx = $items | Where-Object { $_.fcstDate -eq $date -and $_.category -eq 'TMX' } | Select-Object -First 1
  $tmn = $items | Where-Object { $_.fcstDate -eq $date -and $_.category -eq 'TMN' } | Select-Object -First 1
  [pscustomobject]@{ date = $date; TMX = if ($null -ne $tmx) { $tmx.fcstValue } else { $null }; TMN = if ($null -ne $tmn) { $tmn.fcstValue } else { $null } }
}

$summary = [ordered]@{
  http = [int]$response.StatusCode
  contentType = $response.Headers['Content-Type']
  resultCode = $header.resultCode
  resultMsg = $header.resultMsg
  itemCount = $items.Count
  elapsedMs = $timer.ElapsedMilliseconds
  baseDate = $baseDate
  baseTime = $baseTime
  nx = $nx
  ny = $ny
  firstForecast = if ($times.Count) { $times[0] } else { $null }
  lastForecast = if ($times.Count) { $times[-1] } else { $null }
  categories = $present
}
'[KMA VILLAGE FORECAST VERIFY]'
$summary | ConvertTo-Json -Depth 4
'[HOURLY FIRST 12]'
$hourly | Format-Table -AutoSize
'[DAILY TMX/TMN]'
$daily | Format-Table -AutoSize
