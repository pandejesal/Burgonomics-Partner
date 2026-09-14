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

Write-Host "=========================================================="
Write-Host "  TESTING FEATURES VIA DIRECT DASHBOARD COMMAND CARDS     "
Write-Host "=========================================================="

# 1. Start App
Write-Host "`n[1] Starting App..."
& $adb -s $device shell am force-stop com.glassdoorsstudio.burgonomics.partner
& $adb -s $device shell am start -n com.glassdoorsstudio.burgonomics.partner/.MainActivity
Start-Sleep -Seconds 3

# 2. Open Chat Hub directly (Bottom-Left card in Command Center: X=290, Y=2100)
Write-Host "`n[2] Tapping Chat Hub (X=290, Y=2100)..."
& $adb -s $device shell input tap 290 2100
Start-Sleep -Seconds 2
Capture-Screen "screen_04_chat_hub.png"

# Return to Dashboard
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# 3. Open Support Tickets directly (Bottom-Right card in Command Center: X=750, Y=2100)
Write-Host "`n[3] Tapping Support Tickets (X=750, Y=2100)..."
& $adb -s $device shell input tap 750 2100
Start-Sleep -Seconds 2
Capture-Screen "screen_05_tickets_hub.png"

# Return to Dashboard
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# 4. Scroll down in middle of screen (X=540, Y=1400 to Y=700)
Write-Host "`n[4] Scrolling dashboard to reveal Store Network..."
& $adb -s $device shell input swipe 540 1400 540 700 300
Start-Sleep -Seconds 1
Capture-Screen "screen_05b_dashboard_scrolled.png"

# 5. Open Store Network (X=290, Y=1750 on scrolled screen)
Write-Host "`n[5] Tapping Store Network card..."
& $adb -s $device shell input tap 290 1750
Start-Sleep -Seconds 2
Capture-Screen "screen_06_store_network.png"

# 6. Open Delivery Settings modal on Surat Branch
Write-Host "`n[6] Opening Delivery Settings modal on branch card..."
& $adb -s $device shell input tap 330 1350
Start-Sleep -Seconds 2
Capture-Screen "screen_07_delivery_settings_modal.png"
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# 7. Open Add Future Store Modal
Write-Host "`n[7] Opening Add Future Store modal..."
& $adb -s $device shell input tap 850 350
Start-Sleep -Seconds 2
Capture-Screen "screen_08_future_store_modal.png"
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

Write-Host "`n=========================================================="
Write-Host "  DIRECT COMMAND CARDS TOUR COMPLETE!                     "
Write-Host "=========================================================="
