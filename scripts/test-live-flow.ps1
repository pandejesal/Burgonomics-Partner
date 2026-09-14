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

function Go-Dashboard {
    Write-Host "Returning to Dashboard..."
    & $adb -s $device shell input tap 90 180
    Start-Sleep -Milliseconds 800
    & $adb -s $device shell input tap 350 250
    Start-Sleep -Seconds 1
}

Write-Host "=========================================================="
Write-Host "  TESTING TICKETS & CHAT ROOM LIVE ON-DEVICE              "
Write-Host "=========================================================="

# 1. Open Support Tickets
Write-Host "`n[1] Opening Support Tickets (X=750, Y=2100)..."
& $adb -s $device shell input tap 750 2100
Start-Sleep -Seconds 2
Capture-Screen "screen_tickets_live.png"

# Return to Dashboard
Go-Dashboard

# 2. Open Chat Hub
Write-Host "`n[2] Opening Chat Hub (X=290, Y=2100)..."
& $adb -s $device shell input tap 290 2100
Start-Sleep -Seconds 2
Capture-Screen "screen_chat_live.png"

# 3. Tap "+ Join Surat Adajan Hub" (X=400, Y=620)
Write-Host "`n[3] Tapping Join Surat Adajan Hub (X=400, Y=620)..."
& $adb -s $device shell input tap 400 620
Start-Sleep -Seconds 2
Capture-Screen "screen_chat_room_live.png"

# Type and send message in Chat Room
Write-Host "`n[3b] Sending message in Surat Adajan chat room..."
& $adb -s $device shell input tap 400 2250
Start-Sleep -Seconds 1
& $adb -s $device shell input text "Surat%sKitchen%sready%sfor%sdinner%sorders"
Start-Sleep -Seconds 1
& $adb -s $device shell input tap 990 2250
Start-Sleep -Seconds 2
Capture-Screen "screen_chat_message_sent.png"

Write-Host "`n=========================================================="
Write-Host "  TEST COMPLETE!                                          "
Write-Host "=========================================================="
