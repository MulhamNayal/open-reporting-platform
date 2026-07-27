# Runs ON the target EC2 server after the deploy workflow downloads and extracts the
# bundle there. $PSScriptRoot is <bundleDir>\scripts, so the bundle root (containing
# backend/ and frontend/) is one level up.
#
# Self-provisioning: creates the app pools and IIS Applications under $env:IIS_SITE_NAME
# if they don't already exist, so no manual IIS Manager setup is required beforehand.
#
# Expects these environment variables (set by the deploy workflow before running this):
#   - IIS_SITE_NAME          the parent IIS site name (must already exist)
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

if (-not $siteName) {
    throw "IIS_SITE_NAME is not set -- can't provision or target any IIS Application without a parent site name."
}
if (-not (Test-Path "IIS:\Sites\$siteName")) {
    throw "IIS site '$siteName' does not exist on this server. This script provisions Applications under an existing site, not the site itself."
}

function Ensure-AppPool([string]$pool) {
    if (-not (Test-Path "IIS:\AppPools\$pool")) {
        Write-Host "Creating app pool '$pool'..."
        New-WebAppPool -Name $pool | Out-Null
        # ASP.NET Core apps run via the ASP.NET Core Module (ANCM) out-of-process,
        # not the classic CLR pipeline, so the app pool needs "No Managed Code".
        Set-ItemProperty "IIS:\AppPools\$pool" -Name managedRuntimeVersion -Value ""
    } else {
        Write-Host "App pool '$pool' already exists."
    }
}

function Ensure-Application([string]$appName, [string]$physicalPath, [string]$pool) {
    New-Item -ItemType Directory -Force -Path $physicalPath | Out-Null
    if (-not (Test-Path "IIS:\Sites\$siteName\$appName")) {
        Write-Host "Creating IIS Application '$appName' at '$physicalPath'..."
        New-WebApplication -Site $siteName -Name $appName -PhysicalPath $physicalPath -ApplicationPool $pool | Out-Null
    } else {
        Write-Host "IIS Application '$appName' already exists."
    }
}

Write-Host "=== ensure app pools exist ==="
Ensure-AppPool $backendPool
Ensure-AppPool $frontendPool

Write-Host "=== ensure IIS Applications exist ==="
Ensure-Application $backendApp $backendRoot $backendPool
Ensure-Application $frontendApp $frontendRoot $frontendPool

Write-Host "=== stop app pools (before overwriting files they're serving) ==="
foreach ($pool in @($backendPool, $frontendPool)) {
    if ((Get-WebAppPoolState -Name $pool).Value -eq 'Started') {
        Stop-WebAppPool -Name $pool
        while ((Get-WebAppPoolState -Name $pool).Value -ne 'Stopped') { Start-Sleep -Milliseconds 500 }
    }
    Write-Host "Pool '$pool' stopped."
}

Write-Host "=== copy backend files ==="
robocopy "$bundleRoot\backend" $backendRoot /MIR /NFL /NDL /NJH /NJS /R:3 /W:5
if ($LASTEXITCODE -ge 8) { throw "robocopy backend failed with exit code $LASTEXITCODE" }

Write-Host "=== copy frontend files ==="
robocopy "$bundleRoot\frontend" $frontendRoot /MIR /NFL /NDL /NJH /NJS /R:3 /W:5
if ($LASTEXITCODE -ge 8) { throw "robocopy frontend failed with exit code $LASTEXITCODE" }

Write-Host "=== configure backend environment variables (IIS app pool level, never written to disk as a file) ==="
function Set-BackendEnvVar([string]$name, [string]$value) {
    $envVarPath = "/system.webServer/aspNetCore/environmentVariables"
    $existing = Get-WebConfigurationProperty -Filter $envVarPath -PSPath "IIS:\Sites\$siteName\$backendApp" -Name Collection -ErrorAction SilentlyContinue |
        Where-Object { $_.name -eq $name }
    if ($existing) {
        Set-WebConfigurationProperty -Filter "$envVarPath/add[@name='$name']" -PSPath "IIS:\Sites\$siteName\$backendApp" -Name "value" -Value $value
    } else {
        Add-WebConfigurationProperty -Filter $envVarPath -PSPath "IIS:\Sites\$siteName\$backendApp" -Name Collection -Value @{ name = $name; value = $value }
    }
    Write-Host "Set '$name' on IIS Application '$backendApp'."
}

Set-BackendEnvVar "ConnectionStrings__ReportingDatabase" $env:DB_CONNECTION_STRING
# erpapidev is a dev box, not a real production instance -- Development matches what it
# actually is, and Program.cs only registers Swagger (needed at /reporting/swagger) when
# this is set. IIS/ANCM otherwise defaults ASPNETCORE_ENVIRONMENT to Production.
Set-BackendEnvVar "ASPNETCORE_ENVIRONMENT" "Development"

Write-Host "=== start app pools ==="
foreach ($pool in @($backendPool, $frontendPool)) {
    Start-WebAppPool -Name $pool
    Write-Host "Pool '$pool' started."
}

Write-Host "Deploy complete."
# robocopy's own success exit code is 1 (0 means "nothing needed copying"), and nothing
# after the copy steps otherwise touches $LASTEXITCODE -- without this, the script's own
# exit code silently inherits robocopy's leftover value, which callers checking
# $LASTEXITCODE -ne 0 misread as a failure even though everything above succeeded.
exit 0
