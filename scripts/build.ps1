param(
    [string]$JavaHome,
    [string]$GradleHome,
    [string[]]$Tasks = @('assembleDebug', 'lintDebug')
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

if (-not $JavaHome) {
    $JavaHome = $env:JAVA_HOME
    if (-not $JavaHome -and (Test-Path -LiteralPath 'C:/Program Files/Android/openjdk/jdk-21.0.8')) {
        $JavaHome = 'C:/Program Files/Android/openjdk/jdk-21.0.8'
    }
}
if (-not $JavaHome) { throw 'Set JAVA_HOME or pass -JavaHome with a JDK 21 installation.' }
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = Join-Path $projectRoot '.tools/android-sdk'
$env:ANDROID_USER_HOME = Join-Path $projectRoot '.tools/android-user'
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.gradle-user-home'

$gradle = if ($GradleHome) { Join-Path $GradleHome 'bin/gradle.bat' } else { Join-Path $projectRoot 'gradlew.bat' }
if (-not (Test-Path -LiteralPath $gradle)) { throw 'Gradle not found. Pass -GradleHome or generate the Gradle wrapper.' }

$proxyArgs = @()
$proxyAddress = if ($env:HTTPS_PROXY) { $env:HTTPS_PROXY } else { $env:HTTP_PROXY }
if ($proxyAddress) {
    $proxyUri = [Uri]$proxyAddress
    if ($proxyUri.UserInfo) { throw 'Configure authenticated proxy credentials separately; this script never copies credentials.' }
    if ($proxyUri.Scheme -eq 'http') {
        $proxyArgs = @("-Dhttp.proxyHost=$($proxyUri.Host)", "-Dhttp.proxyPort=$($proxyUri.Port)", "-Dhttps.proxyHost=$($proxyUri.Host)", "-Dhttps.proxyPort=$($proxyUri.Port)")
    }
}

& $gradle @proxyArgs --no-daemon --console=plain @Tasks
if ($LASTEXITCODE -ne 0) { throw "Gradle exited with $LASTEXITCODE" }

$apk = Join-Path $projectRoot 'app/build/outputs/apk/debug/app-debug.apk'
if (Test-Path -LiteralPath $apk) {
    $artifact = Join-Path $projectRoot 'artifacts/pure-douyin-0.2.2-mobile-debug.apk'
    Copy-Item -LiteralPath $apk -Destination $artifact -Force
    Get-Item -LiteralPath $artifact | Select-Object FullName, Length
}
