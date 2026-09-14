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

# 1. Start App
Write-Host "Starting App..."
& $adb -s $device shell am force-stop com.glassdoorsstudio.burgonomics.partner
& $adb -s $device shell am start -n com.glassdoorsstudio.burgonomics.partner/.MainActivity
Start-Sleep -Seconds 3

# 2. Tap Chat Hub (X=290, Y=2000)
Write-Host "Tapping Chat Hub..."
& $adb -s $device shell input tap 290 2000
Start-Sleep -Seconds 2
Capture-Screen "screen_04_chat_hub.png"

# 3. Tap "+ Join Surat Adajan Hub" (X=500, Y=650)
Write-Host "Joining Surat Adajan Room..."
& $adb -s $device shell input tap 500 650
Start-Sleep -Seconds 2
Capture-Screen "screen_04b_chat_room_opened.png"

# 4. Type and send a message
Write-Host "Sending operational chat message..."
& $adb -s $device shell input tap 400 2250
Start-Sleep -Milliseconds 800
& $adb -s $device shell input text "Surat%sKitchen%sis%sready%sfor%sdinner%sorders!"
Start-Sleep -Milliseconds 800
& $adb -s $device shell input tap 990 2250
Start-Sleep -Seconds 2
Capture-Screen "screen_04c_chat_message_sent.png"

Write-Host "Chat room flow completed!"
