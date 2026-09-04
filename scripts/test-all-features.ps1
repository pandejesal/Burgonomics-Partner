$ErrorActionPreference = "Stop"
$adb = "C:\Users\DELL\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$device = "RZCX51TXRKB"
$artifactDir = "C:\Users\DELL\.gemini\antigravity-ide\brain\eab0f29b-1974-4711-899d-43c7b8633dea"

function Capture-Screen($name) {
    $outPath = Join-Path $artifactDir $name
    Write-Host "Capturing: $name"
    & $adb -s $device shell screencap -p /sdcard/temp_screen.png
    & $adb -s $device pull /sdcard/temp_screen.png $outPath
}

Write-Host "=========================================================="
Write-Host "  EXECUTING END-TO-END FEATURE VERIFICATION SUITE         "
Write-Host "=========================================================="

# STEP 1: Launch App to Dashboard
Write-Host "`n[1] Capturing Dashboard..."
& $adb -s $device shell am force-stop com.glassdoorsstudio.burgonomics.partner
& $adb -s $device shell am start -n com.glassdoorsstudio.burgonomics.partner/.MainActivity
Start-Sleep -Seconds 3
Capture-Screen "screen_01_dashboard.png"

# STEP 2: Tap Customer CRM Card (X=750, Y=1800)
Write-Host "`n[2] Navigating to Customer CRM..."
& $adb -s $device shell input tap 750 1800
Start-Sleep -Seconds 2
Capture-Screen "screen_02_crm_hub.png"

# STEP 3: Tap Chat Hub
Write-Host "`n[3] Opening Chat Hub via Sidebar..."
& $adb -s $device shell input tap 90 180
Start-Sleep -Seconds 1
# Tap Chat Hub in Sidebar
& $adb -s $device shell input tap 300 750
Start-Sleep -Seconds 2
Capture-Screen "screen_03_chat_hub.png"

# STEP 4: Open Support Tickets Hub via Sidebar
Write-Host "`n[4] Opening Support Tickets Hub..."
& $adb -s $device shell input tap 90 180
Start-Sleep -Seconds 1
# Tap Support Tickets in Sidebar (approx Y=830)
& $adb -s $device shell input tap 300 830
Start-Sleep -Seconds 2
Capture-Screen "screen_04_tickets_hub.png"

# STEP 5: Open Store Network & Future Stores
Write-Host "`n[5] Opening Store Network..."
& $adb -s $device shell input tap 90 180
Start-Sleep -Seconds 1
# Tap Stores in Sidebar (approx Y=620)
& $adb -s $device shell input tap 300 620
Start-Sleep -Seconds 2
Capture-Screen "screen_05_stores_network.png"

# STEP 6: Open Delivery Settings Modal
Write-Host "`n[6] Opening Delivery Settings Modal..."
# Tap on Delivery Settings button on the branch card
& $adb -s $device shell input tap 320 1350
Start-Sleep -Seconds 2
Capture-Screen "screen_06_delivery_settings.png"

# STEP 7: Tap Future Store Tab
Write-Host "`n[7] Opening Add Future Store..."
# Close modal
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1
# Scroll or tap Add Future Store button (approx X=800, Y=350)
& $adb -s $device shell input tap 850 350
Start-Sleep -Seconds 2
Capture-Screen "screen_07_future_store.png"

Write-Host "`n=========================================================="
Write-Host "  FULL ON-DEVICE VERIFICATION SUITE COMPLETE!             "
Write-Host "=========================================================="
