$ErrorActionPreference = "Stop"
$adb = "C:\Users\DELL\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$device = "RZCX51TXRKB"
$artifactDir = "C:\Users\DELL\.gemini\antigravity-ide\brain\eab0f29b-1974-4711-899d-43c7b8633dea"

function Capture-Screen($name) {
    $outPath = Join-Path $artifactDir $name
    Write-Host "Capturing screen: $name -> $outPath"
    & $adb -s $device shell screencap -p /sdcard/temp_screen.png
    & $adb -s $device pull /sdcard/temp_screen.png $outPath
}

Write-Host "=========================================================="
Write-Host "  BURGONOMICS PARTNER - LIVE ON-DEVICE VERIFICATION SUITE "
Write-Host "  Target Device: $device                                  "
Write-Host "=========================================================="

# STEP 1: Launch App
Write-Host "`n[Step 1] Launching App on Phone..."
& $adb -s $device shell am force-stop com.glassdoorsstudio.burgonomics.partner
& $adb -s $device shell am start -n com.glassdoorsstudio.burgonomics.partner/.MainActivity
Start-Sleep -Seconds 3

# Capture 1: Dashboard & Live Stats
Capture-Screen "screen_01_dashboard_live.png"

# STEP 2: Open Outlet & Delivery Parameters from Dashboard Quick Actions
Write-Host "`n[Step 2] Opening Store Network..."
# Tap on Store Network quick action (approx X=800, Y=1450)
& $adb -s $device shell input tap 800 1450
Start-Sleep -Seconds 3
Capture-Screen "screen_02_store_network_live.png"

# STEP 3: Open Delivery Settings Modal on Surat Branch
Write-Host "`n[Step 3] Opening Delivery Settings on Surat Outlet..."
# Tap Delivery Settings button on the card (approx X=350, Y=1300)
& $adb -s $device shell input tap 350 1300
Start-Sleep -Seconds 2
Capture-Screen "screen_03_delivery_settings_live.png"

# Close modal
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# STEP 4: Navigate to Simple Chat Hub
Write-Host "`n[Step 4] Opening Simple Chat Hub..."
# Open sidebar menu (hamburger top left approx X=90, Y=180)
& $adb -s $device shell input tap 90 180
Start-Sleep -Seconds 1
# Tap Chat Hub in sidebar (approx X=300, Y=650)
& $adb -s $device shell input tap 300 650
Start-Sleep -Seconds 2
Capture-Screen "screen_04_chat_hub_live.png"

# STEP 5: Navigate to Support Tickets Hub
Write-Host "`n[Step 5] Opening Support Tickets Hub..."
# Open sidebar menu
& $adb -s $device shell input tap 90 180
Start-Sleep -Seconds 1
# Tap Support Tickets in sidebar (approx X=300, Y=730)
& $adb -s $device shell input tap 300 730
Start-Sleep -Seconds 2
Capture-Screen "screen_05_tickets_hub_live.png"

# STEP 6: Navigate to Customer CRM
Write-Host "`n[Step 6] Opening Customer CRM Hub..."
# Open sidebar menu
& $adb -s $device shell input tap 90 180
Start-Sleep -Seconds 1
# Tap Customer CRM in sidebar (approx X=300, Y=570)
& $adb -s $device shell input tap 300 570
Start-Sleep -Seconds 2
Capture-Screen "screen_06_crm_hub_live.png"

Write-Host "`n=========================================================="
Write-Host "  ON-DEVICE SUITE EXECUTED AND ALL 6 SCREENS CAPTURED!    "
Write-Host "=========================================================="
