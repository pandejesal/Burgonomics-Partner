$ErrorActionPreference = "Stop"
$adb = "C:\Users\DELL\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$device = "RZCX51TXRKB"
$artifactDir = "C:\Users\DELL\.gemini\antigravity-ide\brain\eab0f29b-1974-4711-899d-43c7b8633dea"

function Capture-Screen($name) {
    $outPath = Join-Path $artifactDir $name
    Write-Host "Capturing: $name -> $outPath"
    & $adb -s $device shell screencap -p /sdcard/temp_screen.png
    & $adb -s $device pull /sdcard/temp_screen.png $outPath
}

function Open-Drawer {
    Write-Host "Opening navigation drawer..."
    & $adb -s $device shell input tap 90 180
    Start-Sleep -Seconds 1
}

Write-Host "=========================================================="
Write-Host "  TESTING EXACT DRAWER NAVIGATION HEIGHTS                 "
Write-Host "=========================================================="

# 1. Live Orders (Y=530)
Write-Host "`n[1] Opening Live Orders (Y=530)..."
Open-Drawer
& $adb -s $device shell input tap 350 530
Start-Sleep -Seconds 2
Capture-Screen "screen_01_orders_verified.png"

# 2. Chat Hub (Y=800)
Write-Host "`n[2] Opening Chat Hub (Y=800)..."
Open-Drawer
& $adb -s $device shell input tap 350 800
Start-Sleep -Seconds 2
Capture-Screen "screen_02_chat_verified.png"

# 3. Support Tickets (Y=890)
Write-Host "`n[3] Opening Support Tickets (Y=890)..."
Open-Drawer
& $adb -s $device shell input tap 350 890
Start-Sleep -Seconds 2
Capture-Screen "screen_03_tickets_verified.png"

# 4. Store Network (Y=1070)
Write-Host "`n[4] Opening Store Network (Y=1070)..."
Open-Drawer
& $adb -s $device shell input tap 350 1070
Start-Sleep -Seconds 2
Capture-Screen "screen_04_stores_verified.png"

# 5. Open Delivery Settings modal on Surat Branch
Write-Host "`n[5] Opening Delivery Settings modal on branch card..."
# Scroll down slightly to make sure the card is centered
& $adb -s $device shell input swipe 540 1200 540 900 200
Start-Sleep -Seconds 1
# Tap Delivery Settings button (middle-left card action)
& $adb -s $device shell input tap 330 1150
Start-Sleep -Seconds 2
Capture-Screen "screen_05_delivery_settings_verified.png"

# Close modal (tap X at top right or keyevent)
& $adb -s $device shell input tap 970 250
Start-Sleep -Seconds 1

# 6. Add Future Store modal
Write-Host "`n[6] Opening Add Future Store modal..."
# Tap "+ Add Future Store" button at top right
& $adb -s $device shell input tap 850 250
Start-Sleep -Seconds 2
Capture-Screen "screen_06_future_store_verified.png"

# Close modal
& $adb -s $device shell input tap 970 250
Start-Sleep -Seconds 1

# 7. Customer CRM (Y=710)
Write-Host "`n[7] Opening Customer CRM (Y=710)..."
Open-Drawer
& $adb -s $device shell input tap 350 710
Start-Sleep -Seconds 2
Capture-Screen "screen_07_crm_verified.png"

Write-Host "`n=========================================================="
Write-Host "  EXACT HEIGHT TOUR FINISHED SUCCESSFULLY!                "
Write-Host "=========================================================="
