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

function Test-ServerReady {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", 3000)
        $tcp.Close()
        return $true
    } catch {
        return $false
    }
}

# ===================================================================
# 1. KIEM TRA VA KHOI DONG MAY CHU NEXT.JS (npm run dev)
# ===================================================================
Write-Output "-------------------------------------------------------------------"
Write-Output "[1/2] Kiem tra may chu web Next.js..."
Write-Output "-------------------------------------------------------------------"

if (-not (Test-ServerReady)) {
    Write-Output "May chu chua hoat dong. Dang khoi dong 'npm run dev' trong cua so rieng..."
    Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "title [Ching Luh] Next.js Web Server (npm run dev) && npm run dev" -WorkingDirectory $PSScriptRoot

    Write-Output "Dang cho may chu Next.js san sang tai $targetUrl..."
    $serverReady = $false
    for ($i = 1; $i -le 35; $i++) {
        Start-Sleep -Seconds 1
        if (Test-ServerReady) {
            $serverReady = $true
            break
        }
        Write-Host -NoNewline "."
    }
    Write-Output ""
    if ($serverReady) {
        Write-Output "[OK] May chu Next.js da san sang tai $targetUrl!"
    } else {
        Write-Output "[CANH BAO] May chu khoi dong hoi cham (>35s). Dang tiep tuc mo trinh duyet..."
    }
} else {
    Write-Output "[OK] May chu Next.js da dang hoat dong tai $targetUrl."
}

Write-Output ""
# ===================================================================
# 2. KHOI DONG / KET NOI CHROME REMOTE DEBUGGING & MO WEB
# ===================================================================
Write-Output "-------------------------------------------------------------------"
Write-Output "[2/2] Ket noi trinh duyet Google Chrome vao ung dung..."
Write-Output "-------------------------------------------------------------------"

$existingVersion = $null
try {
    $existingVersion = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/version" -TimeoutSec 2 -ErrorAction Stop
} catch {
    $existingVersion = $null
}

if ($existingVersion) {
    Write-Output "[OK] Chrome Debug dang hoat dong tren cong 9222."
    try {
        $tabs = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/list" -TimeoutSec 3 -ErrorAction SilentlyContinue
        $existingTab = $tabs | Where-Object { $_.type -eq "page" -and $_.url -like "*localhost:3000*" } | Select-Object -First 1

        if ($existingTab) {
            Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/activate/$($existingTab.id)" -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
            Write-Output "[OK] Da kich hoat tab ung dung hien co tren Chrome ($targetUrl)!"
        } else {
            Write-Output "Dang mo tab moi cho $targetUrl..."
            $newTab = Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:9222/json/new?$targetUrl" -TimeoutSec 5 -ErrorAction Stop
            if ($newTab -and $newTab.id) {
                Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/activate/$($newTab.id)" -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
                Write-Output "[OK] Da mo thanh cong tab moi vao Chrome!"
            }
        }
    } catch {
        Write-Output "Loi khi thao tac tab qua CDP: $_"
    }

    $g = $existingVersion.webSocketDebuggerUrl -replace '^ws://[^/]+', ''
    Update-DevToolsActivePort $g
} else {
    Write-Output "Khoi dong Chrome moi voi remote debugging port 9222..."
    $arg = "--remote-debugging-port=9222 --user-data-dir=`"$dir`" --new-window $targetUrl"
    Start-Process -FilePath $chrome -ArgumentList $arg

    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $v = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/version" -TimeoutSec 1 -ErrorAction Stop
            if ($v) {
                $ready = $true
                $g = $v.webSocketDebuggerUrl -replace '^ws://[^/]+', ''
                Update-DevToolsActivePort $g
                Write-Output "[OK] Da mo thanh cong Chrome va ket noi den $targetUrl!"
                break
            }
        } catch {}
    }

    if (-not $ready) {
        Write-Output "[CANH BAO] Khong the ket noi toi cong debug 9222 sau 10 giay."
    }
}

# Focus vao cua so Google Chrome
try {
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.AppActivate('Google Chrome') | Out-Null
} catch {}

Write-Output ""
Write-Output "==================================================================="
Write-Output "  HE THONG HOAN TAT KHOI DONG & DA SAN SANG!"
Write-Output "  - Ung dung web: $targetUrl"
Write-Output "  - Chrome Debug Port: 9222 (Ho tro Antigravity /browser)"
Write-Output "==================================================================="
