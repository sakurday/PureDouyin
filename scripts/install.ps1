param([Parameter(Mandatory = $true)][string]$Serial)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$apk = Join-Path $projectRoot 'artifacts/pure-douyin-0.2.2-mobile-debug.apk'
if (-not (Test-Path -LiteralPath $apk)) { throw 'Build the debug APK first with scripts/build.ps1.' }
& adb -s $Serial install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'ADB install failed. Check the phone for an installation confirmation.' }
& adb -s $Serial shell am start -n io.github.puredouyin/.MainActivity
if ($LASTEXITCODE -ne 0) { throw 'ADB launch failed.' }
