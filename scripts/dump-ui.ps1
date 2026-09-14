$ErrorActionPreference = "Stop"
$adb = "C:\Users\DELL\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$device = "RZCX51TXRKB"
$artifactDir = "C:\Users\DELL\.gemini\antigravity-ide\brain\eab0f29b-1974-4711-899d-43c7b8633dea"

& $adb -s $device shell uiautomator dump /sdcard/window_dump.xml
& $adb -s $device pull /sdcard/window_dump.xml "$artifactDir\window_dump.xml"
Write-Host "Dump complete!"
