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

Write-Host "Tapping Chat Hub (X=290, Y=2000)..."
& $adb -s $device shell input tap 290 2000
Start-Sleep -Seconds 2
Capture-Screen "screen_chat_hub.png"

Write-Host "Tapping Join Surat Adajan Hub (X=400, Y=620)..."
& $adb -s $device shell input tap 400 620
Start-Sleep -Seconds 2
Capture-Screen "screen_chat_room.png"
