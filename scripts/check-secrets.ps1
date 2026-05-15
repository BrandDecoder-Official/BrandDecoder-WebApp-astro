# Quick secret scan before git push (ASCII only for Windows PowerShell)
param(
    [string]$Path = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
$failures = @()

$patterns = @(
    @{ Name = "ECPay HashKey literal"; Regex = "(?i)(ECPAY_HASH_KEY|ECPAY_HASH_IV)\s*[:=]\s*['\x22][0-9A-Za-z]{8,}" },
    @{ Name = "LINE secret literal"; Regex = "(?i)LINE_CHANNEL_SECRET\s*[:=]\s*['\x22][0-9a-f]{20,}" },
    @{ Name = "Gemini API key literal"; Regex = "(?i)GEMINI_API_KEY\s*[:=]\s*['\x22]AIza[0-9A-Za-z\-_]{20,}" },
    @{ Name = "Private key block"; Regex = "BEGIN (RSA |EC )?PRIVATE KEY" },
    @{ Name = "Bearer JWT in source"; Regex = "Bearer\s+eyJ[0-9A-Za-z\-_]+\.[0-9A-Za-z\-_]+" }
)

# Hardcoded Gemini/Google keys must not live in backend source
$backendOnlyPatterns = @(
    @{ Name = "Hardcoded API key in bastro-bot"; Regex = "AIza[0-9A-Za-z\-_]{20,}" }
)

$scanGlobs = @("*.js", "*.html", "*.json", "*.md", "*.yml", "*.yaml", "*.env*", "*.ps1")
$skipDirs = @("node_modules", ".git", "dist", "build")

function Test-ShouldSkip([string]$fullPath) {
    foreach ($d in $skipDirs) {
        if ($fullPath -match [regex]::Escape([IO.Path]::DirectorySeparatorChar + $d + [IO.Path]::DirectorySeparatorChar)) {
            return $true
        }
    }
    return $false
}

Write-Host "Scanning: $Path" -ForegroundColor Cyan

foreach ($glob in $scanGlobs) {
    Get-ChildItem -Path $Path -Filter $glob -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        if (Test-ShouldSkip $_.FullName) { return }
        if ($_.Name -eq "check-secrets.ps1") { return }

        $rel = $_.FullName.Substring($Path.Length).TrimStart("\", "/")
        if ($rel -match "\\?\.env(\.|$)" -and $rel -notmatch "\.example") {
            $failures += "Tracked or present env file: $rel"
            return
        }
        if ($rel -match "\.example$") { return }

        $content = Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $content) { return }

        foreach ($p in $patterns) {
            if ($content -match $p.Regex) {
                $failures += "$($p.Name) in $rel"
            }
        }

        if ($rel -match "^bastro-bot[\\/]") {
            foreach ($p in $backendOnlyPatterns) {
                if ($content -match $p.Regex) {
                    $failures += "$($p.Name) in $rel"
                }
            }
        }
    }
}

# Staged files that should never be committed
Push-Location $Path
try {
    $staged = git diff --cached --name-only 2>$null
    foreach ($f in $staged) {
        if (-not $f) { continue }
        $base = [IO.Path]::GetFileName($f)
        if ($base -eq ".env" -or $base -match "^\.env\." -and $base -notmatch "\.example$") {
            $failures += "Staged secret file: $f"
        }
        if ($base -match "serviceAccount.*\.json$") {
            $failures += "Staged service account: $f"
        }
    }
}
finally { Pop-Location }

if ($failures.Count -eq 0) {
    Write-Host "OK  No obvious secrets found." -ForegroundColor Green
    exit 0
}

Write-Host "FAIL  Possible secrets or risky files:" -ForegroundColor Red
$failures | Select-Object -Unique | ForEach-Object { Write-Host "  - $_" }
Write-Host ""
Write-Host "Fix before push. Do not paste real keys into chat." -ForegroundColor Yellow
exit 1
