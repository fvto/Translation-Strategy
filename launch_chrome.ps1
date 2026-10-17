$targetUrl = "http://localhost:3000"
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) {
    $chrome = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
}
$dir = "$env:LOCALAPPDATA\Temp\chrome-dev-profile"
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$dest = "$env:LOCALAPPDATA\Google\Chrome\User Data"
if (-not (Test-Path $dest)) {
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
}

function Update-DevToolsActivePort ($guid) {
    if ($guid) {
        Set-Content -Path "$dest\DevToolsActivePort" -Value @("9222", $guid) -Encoding ascii
    }
}

# 1. Kiem tra xem Chrome tren cong debug 9222 da hoat dong chua (dung 127.0.0.1 de tranh loi IPv6 timeout tren Windows)
$existingVersion = $null
try {
    $existingVersion = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/version" -TimeoutSec 2 -ErrorAction Stop
} catch {
    $existingVersion = $null
}

if ($existingVersion) {
    Write-Output "Chrome Debug dang chay tren cong 9222."
    Write-Output "Dang mo tab moi cho $targetUrl (khong ghi de tab dang su dung)..."
    try {
        $newTab = Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:9222/json/new?$targetUrl" -TimeoutSec 5 -ErrorAction Stop
        if ($newTab -and $newTab.id) {
            Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/activate/$($newTab.id)" -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
            Write-Output "Da mo thanh cong tab moi vao Chrome!"
        }
    } catch {
        Write-Output "Loi khi mo tab moi qua CDP: $_"
    }

    $g = $existingVersion.webSocketDebuggerUrl -replace '^ws://[^/]+', ''
    Update-DevToolsActivePort $g
    Write-Output "Chrome Debugging is Ready! Guid: $g"
} else {
    Write-Output "Khoi dong Chrome moi voi remote debugging port 9222..."
    $arg = "--remote-debugging-port=9222 --user-data-dir=`"$dir`" --new-window $targetUrl"
    Start-Process -FilePath $chrome -ArgumentList $arg

    # Cho Chrome san sang
    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $v = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/version" -TimeoutSec 1 -ErrorAction Stop
            if ($v) {
                $ready = $true
                $g = $v.webSocketDebuggerUrl -replace '^ws://[^/]+', ''
                Update-DevToolsActivePort $g
                Write-Output "Chrome Debugging is Ready! Guid: $g"
                Write-Output "Da mo thanh cong tab moi cho: $targetUrl"
                break
            }
        } catch {
            # Dang khoi dong
        }
    }

    if (-not $ready) {
        Write-Output "Canh bao: Khong the ket noi toi cong debug 9222 sau 10 giay."
    }
}

# Focus vao cua so Google Chrome
try {
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.AppActivate('Google Chrome') | Out-Null
} catch {}
