$ErrorActionPreference = "Stop"
$adb = "C:\Users\DELL\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$device = "RZCX51TXRKB"
$artifactDir = "C:\Users\DELL\.gemini\antigravity-ide\brain\eab0f29b-1974-4711-899d-43c7b8633dea"

& $adb -s $device shell am start -n com.glassdoorsstudio.burgonomics.partner/.MainActivity
Start-Sleep -Seconds 2

# Tap hamburger
& $adb -s $device shell input tap 90 180
Start-Sleep -Seconds 2

& $adb -s $device shell screencap -p /sdcard/drawer.png
& $adb -s $device pull /sdcard/drawer.png "$artifactDir\screen_drawer_open.png"
Write-Host "Drawer captured!"
