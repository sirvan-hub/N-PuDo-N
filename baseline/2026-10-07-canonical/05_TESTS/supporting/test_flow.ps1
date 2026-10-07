# Hub Owner App Test - Auth Flow
$baseUrl = "http://10.0.2.2:3000/v1"

Write-Host ""
Write-Host "=== Hub Owner App Test Flow ===" -ForegroundColor Cyan

# Step 1: Login
Write-Host "`n1. Logging in..." -ForegroundColor Yellow
$loginBody = @{phone = "09120000001"} | ConvertTo-Json
try {
  $loginResp = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
  Write-Host "   ✅ Login: $($loginResp.message)" -ForegroundColor Green
} catch {
  Write-Host "   ❌ Login failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 2: Verify OTP
Write-Host "`n2. Verifying OTP..." -ForegroundColor Yellow
$verifyBody = @{phone = "09120000001"; otp = "12345"} | ConvertTo-Json
try {
  $verifyResp = Invoke-RestMethod -Uri "$baseUrl/auth/verify-otp" -Method Post -Body $verifyBody -ContentType "application/json"
  $token = $verifyResp.access_token
  Write-Host "   ✅ OTP verified, token obtained" -ForegroundColor Green
} catch {
  Write-Host "   ❌ OTP verification failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 3: Get my parcels
Write-Host "`n3. Fetching my parcels..." -ForegroundColor Yellow
try {
  $parcelsResp = Invoke-RestMethod -Uri "$baseUrl/hubs/my-parcels" -Method Get -Headers @{Authorization = "Bearer $token"}
  Write-Host "   ✅ Parcels loaded: $($parcelsResp.length) parcels" -ForegroundColor Green
} catch {
  Write-Host "   ❌ Failed to fetch parcels: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 4: Find nearby hubs
Write-Host "`n4. Finding nearby hubs..." -ForegroundColor Yellow
try {
  $hubsResp = Invoke-RestMethod -Uri "$baseUrl/hubs/nearby?latitude=35.6892&longitude=51.3890" -Method Get -Headers @{Authorization = "Bearer $token"}
  Write-Host "   ✅ Nearby hubs found" -ForegroundColor Green
} catch {
  Write-Host "   ❌ Failed to find hubs: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
Write-Host ""
Pause
