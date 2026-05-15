# Deploy bastro-bot: push main -> Cloud Build -> Cloud Run (project lllcnd)
param(
    [switch]$Push,
    [switch]$Wait,
    [string]$Message,
    [int]$TimeoutMinutes = 18
)

$ErrorActionPreference = "Stop"
$Config = & (Join-Path $PSScriptRoot "deploy-config.ps1")
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Write-Step([string]$Text) { Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "OK  $Text" -ForegroundColor Green }
function Write-WarnLine([string]$Text) { Write-Host "!!  $Text" -ForegroundColor Yellow }

function Assert-Gcloud {
    if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
        throw "gcloud not found. Install Google Cloud SDK and run: gcloud auth login"
    }
}

function Get-GitHeadSha {
    Push-Location $RepoRoot
    try { return (git rev-parse HEAD).Trim() }
    finally { Pop-Location }
}

function Get-GitShortSha([string]$Full) {
    if ($Full.Length -ge 7) { return $Full.Substring(0, 7) }
    return $Full
}

function Get-LiveDeployInfo {
    $proj = $Config.GcpProject
    $reg = $Config.GcpRegion
    $svc = $Config.CloudRunService
    $fmtSvc = "value(status.latestReadyRevisionName)"
    $fmtRev = "value(metadata.labels.commit-sha)"

    $name = & gcloud run services describe $svc --project=$proj --region=$reg --format=$fmtSvc 2>$null
    if (-not $name) { return $null }

    $sha = & gcloud run revisions describe $name.Trim() --project=$proj --region=$reg --format=$fmtRev 2>$null

    [pscustomobject]@{
        RevisionName = $name.Trim()
        CommitSha    = ($sha | ForEach-Object { $_.Trim() })
    }
}

function Show-Status {
    $local = Get-GitHeadSha
    $live = Get-LiveDeployInfo
    Write-Step "Deploy status"
    Write-Host "  Local HEAD    : $(Get-GitShortSha $local)  ($local)"
    if ($live) {
        Write-Host "  Live revision : $($live.RevisionName)"
        Write-Host "  Live commit   : $(Get-GitShortSha $live.CommitSha)  ($($live.CommitSha))"
        if ($live.CommitSha -eq $local) {
            Write-Ok "Local matches Cloud Run."
            return $true
        }
        Write-WarnLine "Out of sync. Push main and wait for build."
        return $false
    }
    Write-WarnLine "Could not read Cloud Run (check gcloud project/permissions)."
    return $false
}

function Ensure-MainBranch {
    Push-Location $RepoRoot
    try {
        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        if ($branch -ne $Config.GitBranch) {
            throw "Branch is '$branch'. Use $($Config.GitBranch) before deploy."
        }
    }
    finally { Pop-Location }
}

function Invoke-GitPush {
    param([string]$CommitMessage)

    Push-Location $RepoRoot
    try {
        Ensure-MainBranch

        $status = git status --porcelain
        if ($status) {
            if (-not $CommitMessage) {
                throw "Uncommitted changes. Commit first or use -Message."
            }
            Write-Step "git add / commit"
            git add -A
            git commit -m $CommitMessage
            Write-Ok "Committed: $CommitMessage"
        }

        $ahead = git rev-list --count "$($Config.GitRemote)/$($Config.GitBranch)..HEAD" 2>$null
        if ($ahead -and [int]$ahead -gt 0) {
            Write-Step "git push $($Config.GitRemote) $($Config.GitBranch)"
            git push $Config.GitRemote $Config.GitBranch
            Write-Ok "Pushed. Cloud Build will deploy bastro-bot."
        }
        else {
            Write-WarnLine "Nothing to push. Use -Wait if build is already running."
        }
    }
    finally { Pop-Location }
}

function Wait-ForCloudRunRevision {
    param([string]$ExpectedSha)

    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
    $expectedShort = Get-GitShortSha $ExpectedSha
    Write-Step "Waiting for commit $expectedShort (max $TimeoutMinutes min)"

    while ((Get-Date) -lt $deadline) {
        $live = Get-LiveDeployInfo
        if ($live -and $live.CommitSha -eq $ExpectedSha) {
            Write-Ok "Live: $($live.RevisionName)"
            return
        }
        if ($live) {
            Write-Host "  ... still on $(Get-GitShortSha $live.CommitSha)" -ForegroundColor DarkGray
        }
        Start-Sleep -Seconds 20
    }
    throw "Timeout. Check Cloud Build logs in GCP Console."
}

Assert-Gcloud
Set-Location $RepoRoot

if (-not $Push -and -not $Wait) {
    $synced = Show-Status
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\scripts\deploy-backend.ps1 -Push"
    Write-Host "  .\scripts\deploy-backend.ps1 -Push -Message ""your message"""
    Write-Host "  .\scripts\deploy-backend.ps1 -Wait"
    exit $(if ($synced) { 0 } else { 2 })
}

if ($Push) {
    Invoke-GitPush -CommitMessage $Message
}

if ($Push -or $Wait) {
    $head = Get-GitHeadSha
    Wait-ForCloudRunRevision -ExpectedSha $head
    Show-Status | Out-Null
}
