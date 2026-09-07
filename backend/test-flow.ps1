# Simple Test - NO AUTH REQUIRED
$baseUrl = "http://localhost:3000/v1"

Write-Host ""
Write-Host "Testing Parcel Creation (Public Endpoint)..." -ForegroundColor Cyan

$parcelData = @{
  tracking_code = "IR1405000001"
  recipient_phone = "09120000001"
  recipient_name = "Ali Test"
  recipient_address = "Tehran, Test St"
  base_post_cost = 50000
  proposed_hub_id = "test-hub-001"
}
$parcelBody = $parcelData | ConvertTo-Json

try {
  # ارسال درخواست بدون هیچ هدر یا توکنی!
  $parcelResp = Invoke-RestMethod -Uri "$baseUrl/parcels" -Method Post -Body $parcelBody -ContentType "application/json"
  
  Write-Host "✅ SUCCESS! Parcel created:" -ForegroundColor Green
  Write-Host "   ID: $($parcelResp.id)"
  Write-Host "   Tracking: $($parcelResp.tracking_code)"
  Write-Host "   Status: $($parcelResp.status)"
} catch {
  Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.Exception.Response) {
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = [System.IO.StreamReader]::new($stream)
    Write-Host "Details: $($reader.ReadToEnd())" -ForegroundColor Yellow
  }
}
Write-Host ""
Pause