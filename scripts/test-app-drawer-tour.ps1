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

function Open-Drawer {
    Write-Host "Opening navigation drawer..."
    & $adb -s $device shell input tap 90 180
    Start-Sleep -Seconds 1
}

Write-Host "=========================================================="
Write-Host "  BURGONOMICS PARTNER - SYSTEMATIC DRAWER TOUR & CAPTURE  "
Write-Host "=========================================================="

# 1. Reset App to Dashboard
Write-Host "`n[1] Starting App on Dashboard..."
& $adb -s $device shell am force-stop com.glassdoorsstudio.burgonomics.partner
& $adb -s $device shell am start -n com.glassdoorsstudio.burgonomics.partner/.MainActivity
Start-Sleep -Seconds 4
Capture-Screen "screen_01_dashboard.png"

# 2. Customer CRM
Write-Host "`n[2] Opening Customer CRM from drawer..."
Open-Drawer
& $adb -s $device shell input tap 300 650
Start-Sleep -Seconds 2
Capture-Screen "screen_02_crm.png"

# 3. Chat Hub
Write-Host "`n[3] Opening Chat Hub from drawer..."
Open-Drawer
& $adb -s $device shell input tap 300 720
Start-Sleep -Seconds 2
Capture-Screen "screen_03_chat.png"

# Type and send message
Write-Host "`n[3b] Sending test message in Chat Hub..."
& $adb -s $device shell input tap 400 2250
Start-Sleep -Seconds 1
& $adb -s $device shell input text "Surat%sBranch%sOnline%sand%sAccepting%sOrders"
Start-Sleep -Seconds 1
& $adb -s $device shell input tap 980 2250
Start-Sleep -Seconds 2
Capture-Screen "screen_03b_chat_active.png"

# 4. Support Tickets
Write-Host "`n[4] Opening Support Tickets from drawer..."
Open-Drawer
& $adb -s $device shell input tap 300 790
Start-Sleep -Seconds 2
Capture-Screen "screen_04_tickets.png"

# 5. Store Network & Future Stores
Write-Host "`n[5] Opening Store Network from drawer..."
Open-Drawer
& $adb -s $device shell input tap 300 930
Start-Sleep -Seconds 2
Capture-Screen "screen_05_stores.png"

# 6. Delivery Settings Modal (Surat Branch)
Write-Host "`n[6] Opening Delivery Settings Modal..."
# Tap on Delivery Settings button (middle-left card action)
& $adb -s $device shell input tap 330 1350
Start-Sleep -Seconds 2
Capture-Screen "screen_06_delivery_settings_modal.png"
# Close modal
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# 7. Add Future Store Modal
Write-Host "`n[7] Opening Add Future Store Modal..."
# Tap "Add Future Store" button at top right
& $adb -s $device shell input tap 850 350
Start-Sleep -Seconds 2
Capture-Screen "screen_07_future_store_modal.png"
# Close modal
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# 8. Settings Page
Write-Host "`n[8] Opening Settings Page from drawer..."
Open-Drawer
& $adb -s $device shell input tap 300 1070
Start-Sleep -Seconds 2
Capture-Screen "screen_08_settings.png"

Write-Host "`n=========================================================="
Write-Host "  DRAWER TOUR COMPLETED SUCCESSFULLY!                     "
Write-Host "=========================================================="
