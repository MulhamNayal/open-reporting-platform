"""Downloads the deploy bundle onto the target Windows server via WinRM and runs
its bundled deploy-bootstrap.ps1. Invoked by .github/workflows/deploy.yml, which
supplies all configuration via environment variables (never as literal arguments)."""

import os
import sys

import winrm


def main() -> int:
    session = winrm.Session(
        target=os.environ["EC2_HOST"],
        auth=(os.environ["EC2_USER"], os.environ["EC2_PASS"]),
        transport="ntlm",
        server_cert_validation="ignore",
        operation_timeout_sec=1800,
        read_timeout_sec=1810,
    )

    run_id = os.environ["RUN_ID"]
    bundle_url = os.environ["BUNDLE_URL"].replace("'", "%27")
    site_name = os.environ["IIS_SITE_NAME"].replace("'", "''")
    db_conn = os.environ["DB_CONNECTION_STRING"].replace("'", "''")
    url_file = f"C:\\temp\\bundle-url-{run_id}.txt"

    # Write the presigned URL to a temp file first: embedding it directly in the
    # bootstrap script below risks pushing the base64-encoded -EncodedCommand
    # argument past the 8191-character Windows command-line limit.
    url_setup = f"""
New-Item -ItemType Directory -Force -Path "C:\\temp" | Out-Null
Set-Content -Path '{url_file}' -Value '{bundle_url}' -NoNewline
"""
    result = session.run_ps(url_setup)
    if result.status_code != 0:
        print(result.std_out.decode("utf-8", errors="replace"))
        print(result.std_err.decode("utf-8", errors="replace"))
        return 1

    # Keep this script small -- pywinrm base64-encodes it for -EncodedCommand.
    # The real deploy steps live in deploy-bootstrap.ps1, shipped inside the bundle.
    bundle_dir = f"C:\\temp\\deploy-reporting-{run_id}"
    bootstrap = f"""
$ErrorActionPreference = 'Stop'
$bundleUrl = Get-Content '{url_file}' -Raw
$bundleDir = "{bundle_dir}"
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null
try {{
    Write-Host "Downloading bundle..."
    Invoke-WebRequest -Uri $bundleUrl -OutFile "$bundleDir\\bundle.zip" -UseBasicParsing
    Expand-Archive -Path "$bundleDir\\bundle.zip" -DestinationPath $bundleDir -Force
    Remove-Item "$bundleDir\\bundle.zip"
    $env:IIS_SITE_NAME = '{site_name}'
    $env:DB_CONNECTION_STRING = '{db_conn}'
    $LASTEXITCODE = 0
    & "$bundleDir\\scripts\\deploy-bootstrap.ps1"
    if ($LASTEXITCODE -ne 0) {{ throw "deploy-bootstrap.ps1 failed (exit $LASTEXITCODE)" }}
}} finally {{
    Remove-Item -Recurse -Force $bundleDir -ErrorAction SilentlyContinue
    Remove-Item -Force '{url_file}' -ErrorAction SilentlyContinue
}}
"""

    result = session.run_ps(bootstrap)
    print(result.std_out.decode("utf-8", errors="replace"))
    errors = result.std_err.decode("utf-8", errors="replace")
    if errors.strip():
        print(errors)
    return 1 if result.status_code != 0 else 0


if __name__ == "__main__":
    sys.exit(main())
