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

Write-Host "=== Starting On-Device Automated Test Suite on $device ==="

# 1. Restart App
& $adb -s $device shell am force-stop com.glassdoorsstudio.burgonomics.partner
& $adb -s $device shell am start -n com.glassdoorsstudio.burgonomics.partner/.MainActivity
Start-Sleep -Seconds 3

# Capture 1: Dashboard
Capture-Screen "screen_01_dashboard.png"

# 2. Get Window dump to inspect resolution and active hierarchy
& $adb -s $device shell wm size
& $adb -s $device shell uiautomator dump /sdcard/ui.xml
& $adb -s $device pull /sdcard/ui.xml "$artifactDir\ui_dump.xml"

Write-Host "Initial dashboard captured successfully!"
