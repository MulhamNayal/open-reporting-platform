# Runs ON the target EC2 server after the deploy workflow downloads and extracts the
# bundle there. $PSScriptRoot is <bundleDir>\scripts, so the bundle root (containing
# backend/ and frontend/) is one level up.
#
# Expects these to already exist on the server (see the one-time IIS setup steps):
#   - IIS site "$env:IIS_SITE_NAME"
#   - IIS Application "reporting"    (backend)  at C:\AspNetCoreWebApps\reporting
#   - IIS Application "reportingweb" (frontend) at C:\AspNetCoreWebApps\reportingweb
#   - App pools "reporting" and "reportingweb"
#
# Expects these environment variables (set by the deploy workflow before running this):
#   - IIS_SITE_NAME          the parent IIS site name
#   - DB_CONNECTION_STRING   the backend's ConnectionStrings:ReportingDatabase value

$ErrorActionPreference = 'Stop'
Import-Module WebAdministration

$siteName     = $env:IIS_SITE_NAME
$backendApp   = "reporting"
$frontendApp  = "reportingweb"
$backendPool  = "reporting"
$frontendPool = "reportingweb"
$root         = "C:\AspNetCoreWebApps"
$backendRoot  = Join-Path $root $backendApp
$frontendRoot = Join-Path $root $frontendApp
$bundleRoot   = Split-Path -Parent $PSScriptRoot

Write-Host "=== stop app pools ==="
foreach ($pool in @($backendPool, $frontendPool)) {
    if (Test-Path "IIS:\AppPools\$pool") {
        if ((Get-WebAppPoolState -Name $pool).Value -eq 'Started') {
            Stop-WebAppPool -Name $pool
            while ((Get-WebAppPoolState -Name $pool).Value -ne 'Stopped') { Start-Sleep -Milliseconds 500 }
        }
        Write-Host "Pool '$pool' stopped."
    } else {
        Write-Host "Pool '$pool' does not exist yet (first deploy?) - skipping stop."
    }
}

Write-Host "=== copy backend files ==="
New-Item -ItemType Directory -Force -Path $backendRoot | Out-Null
robocopy "$bundleRoot\backend" $backendRoot /MIR /NFL /NDL /NJH /NJS /R:3 /W:5
if ($LASTEXITCODE -ge 8) { throw "robocopy backend failed with exit code $LASTEXITCODE" }

Write-Host "=== copy frontend files ==="
New-Item -ItemType Directory -Force -Path $frontendRoot | Out-Null
robocopy "$bundleRoot\frontend" $frontendRoot /MIR /NFL /NDL /NJH /NJS /R:3 /W:5
if ($LASTEXITCODE -ge 8) { throw "robocopy frontend failed with exit code $LASTEXITCODE" }

Write-Host "=== configure backend DB connection string (IIS app pool environment variable, never written to disk as a file) ==="
if ($siteName -and (Test-Path "IIS:\Sites\$siteName\$backendApp")) {
    $envVarPath = "/system.webServer/aspNetCore/environmentVariables"
    $existing = Get-WebConfigurationProperty -Filter $envVarPath -PSPath "IIS:\Sites\$siteName\$backendApp" -Name Collection -ErrorAction SilentlyContinue |
        Where-Object { $_.name -eq "ConnectionStrings__ReportingDatabase" }
    if ($existing) {
        Set-WebConfigurationProperty -Filter "$envVarPath/add[@name='ConnectionStrings__ReportingDatabase']" -PSPath "IIS:\Sites\$siteName\$backendApp" -Name "value" -Value $env:DB_CONNECTION_STRING
    } else {
        Add-WebConfigurationProperty -Filter $envVarPath -PSPath "IIS:\Sites\$siteName\$backendApp" -Name Collection -Value @{ name = "ConnectionStrings__ReportingDatabase"; value = $env:DB_CONNECTION_STRING }
    }
    Write-Host "Connection string configured on IIS Application '$backendApp'."
} else {
    Write-Host "IIS Application '$backendApp' does not exist yet under site '$siteName' - skipping connection-string configuration (create the site/app first, then re-run deploy)."
}

Write-Host "=== start app pools ==="
foreach ($pool in @($backendPool, $frontendPool)) {
    if (Test-Path "IIS:\AppPools\$pool") {
        Start-WebAppPool -Name $pool
        Write-Host "Pool '$pool' started."
    } else {
        Write-Host "Pool '$pool' does not exist - skipping start (create it via the one-time IIS setup, then re-run deploy)."
    }
}

Write-Host "Deploy complete."
# robocopy's own success exit code is 1 (0 means "nothing needed copying"), and nothing
# after the copy steps otherwise touches $LASTEXITCODE -- without this, the script's own
# exit code silently inherits robocopy's leftover value, which callers checking
# $LASTEXITCODE -ne 0 misread as a failure even though everything above succeeded.
exit 0
