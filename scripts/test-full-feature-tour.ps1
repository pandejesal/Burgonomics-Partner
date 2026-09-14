$ErrorActionPreference = "Stop"
$adb = "C:\Users\DELL\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$device = "RZCX51TXRKB"
$artifactDir = "C:\Users\DELL\.gemini\antigravity-ide\brain\eab0f29b-1974-4711-899d-43c7b8633dea"

function Capture-Screen($name) {
    $outPath = Join-Path $artifactDir $name
    Write-Host "Capturing screen: $name"
    & $adb -s $device shell screencap -p /sdcard/temp_screen.png
    & $adb -s $device pull /sdcard/temp_screen.png $outPath
}

Write-Host "=========================================================="
Write-Host "  BURGONOMICS PARTNER - FULL ON-DEVICE VERIFICATION TOUR  "
Write-Host "=========================================================="

# 1. Dashboard
Write-Host "`n[1] Launching Dashboard..."
& $adb -s $device shell am force-stop com.glassdoorsstudio.burgonomics.partner
& $adb -s $device shell am start -n com.glassdoorsstudio.burgonomics.partner/.MainActivity
Start-Sleep -Seconds 3
Capture-Screen "screen_01_dashboard.png"

# 2. Live Orders (Command Center: Top-Left)
Write-Host "`n[2] Tapping Live Orders (X=290, Y=1750)..."
& $adb -s $device shell input tap 290 1750
Start-Sleep -Seconds 2
Capture-Screen "screen_02_orders.png"
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# 3. Customer CRM (Command Center: Top-Right)
Write-Host "`n[3] Tapping Customer CRM (X=750, Y=1750)..."
& $adb -s $device shell input tap 750 1750
Start-Sleep -Seconds 2
Capture-Screen "screen_03_crm.png"
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# 4. Chat Hub (Command Center: Bottom-Left)
Write-Host "`n[4] Tapping Chat Hub (X=290, Y=2100)..."
& $adb -s $device shell input tap 290 2100
Start-Sleep -Seconds 2
Capture-Screen "screen_04_chat.png"

# Send a test chat message
Write-Host "`n[4b] Typing and sending live chat message..."
# Tap on input box (bottom approx X=400, Y=2250)
& $adb -s $device shell input tap 400 2250
Start-Sleep -Seconds 1
& $adb -s $device shell input text "Branch%sready%sfor%sdinner%srush!"
Start-Sleep -Seconds 1
# Tap Send button (approx X=980, Y=2250)
& $adb -s $device shell input tap 980 2250
Start-Sleep -Seconds 2
Capture-Screen "screen_05_chat_sent.png"
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# 5. Support Tickets (Command Center: Bottom-Right)
Write-Host "`n[5] Tapping Support Tickets (X=750, Y=2100)..."
& $adb -s $device shell input tap 750 2100
Start-Sleep -Seconds 2
Capture-Screen "screen_06_tickets.png"
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# 6. Scroll Dashboard to reach Store Network
Write-Host "`n[6] Scrolling down to reach Store Network..."
& $adb -s $device shell input swipe 540 1800 540 800 300
Start-Sleep -Seconds 1
Capture-Screen "screen_06b_dashboard_scrolled.png"

# Tap Store Network (now near X=290, Y=1200 or Y=1400)
Write-Host "`n[6b] Tapping Store Network..."
& $adb -s $device shell input tap 290 1400
Start-Sleep -Seconds 2
Capture-Screen "screen_07_stores.png"

# 7. Delivery Settings Modal
Write-Host "`n[7] Opening Delivery Settings Modal on Surat branch..."
& $adb -s $device shell input tap 320 1350
Start-Sleep -Seconds 2
Capture-Screen "screen_08_delivery_settings_modal.png"
# Close modal
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# 8. Add Future Store
Write-Host "`n[8] Opening Add Future Store modal..."
# Tap Add Future Store button (approx X=850, Y=350)
& $adb -s $device shell input tap 850 350
Start-Sleep -Seconds 2
Capture-Screen "screen_09_future_store_modal.png"

Write-Host "`n=========================================================="
Write-Host "  FULL TOUR FINISHED AND ALL SCREEN ARTIFACTS CAPTURED!   "
Write-Host "=========================================================="
