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
    & $adb -s $device shell input tap 90 180
    Start-Sleep -Seconds 1
}

Write-Host "=========================================================="
Write-Host "  EXACT ON-DEVICE FEATURE TOUR ACROSS ALL PAGES           "
Write-Host "=========================================================="

# 1. Chat Hub
Write-Host "`n[1] Opening Chat Hub (Y=460)..."
Open-Drawer
& $adb -s $device shell input tap 350 460
Start-Sleep -Seconds 2
Capture-Screen "screen_04_chat_hub.png"

# Send Chat Message
Write-Host "`n[1b] Sending message in Chat Hub..."
& $adb -s $device shell input tap 400 2250
Start-Sleep -Seconds 1
& $adb -s $device shell input text "Surat%sAdajan%skitchen%sis%soperational%sand%saccepting%sorders!"
Start-Sleep -Seconds 1
# Tap Send button (approx X=990, Y=2250)
& $adb -s $device shell input tap 990 2250
Start-Sleep -Seconds 2
Capture-Screen "screen_04b_chat_message.png"

# 2. Support Tickets Hub
Write-Host "`n[2] Opening Support Tickets Hub (Y=510)..."
Open-Drawer
& $adb -s $device shell input tap 350 510
Start-Sleep -Seconds 2
Capture-Screen "screen_05_tickets_hub.png"

# 3. Store Network
Write-Host "`n[3] Opening Store Network (Y=615)..."
Open-Drawer
& $adb -s $device shell input tap 350 615
Start-Sleep -Seconds 2
Capture-Screen "screen_06_store_network.png"

# 4. Delivery Settings Modal on Surat branch
Write-Host "`n[4] Opening Delivery Settings Modal..."
# Tap on Delivery Settings button (middle-left card action)
& $adb -s $device shell input tap 330 1350
Start-Sleep -Seconds 2
Capture-Screen "screen_07_delivery_settings_modal.png"
# Close modal
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# 5. Add Future Store Modal
Write-Host "`n[5] Opening Add Future Store Modal..."
# Tap "Add Future Store" button at top right
& $adb -s $device shell input tap 850 350
Start-Sleep -Seconds 2
Capture-Screen "screen_08_future_store_modal.png"
# Close modal
& $adb -s $device shell input keyevent 4
Start-Sleep -Seconds 1

# 6. Settings Page
Write-Host "`n[6] Opening Settings Page (Y=765)..."
Open-Drawer
& $adb -s $device shell input tap 350 765
Start-Sleep -Seconds 2
Capture-Screen "screen_09_settings_page.png"

Write-Host "`n=========================================================="
Write-Host "  EXACT ON-DEVICE TOUR COMPLETED!                         "
Write-Host "=========================================================="
