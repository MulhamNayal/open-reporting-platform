# Runs a SQL script against a database, one GO-delimited batch at a time.
#
# Used by deploy-bootstrap.ps1 to apply the EF Core migration script on the target server, where
# the ReportingDb is reachable and sqlcmd is not guaranteed to be installed. SqlClient lives in the
# .NET Framework GAC, so this works on a bare Windows box with nothing extra provisioned.
#
# All batches run on ONE connection, so a script that opens a transaction in its first batch and
# commits in its last (which is exactly what `dotnet ef migrations script` emits) behaves as the
# single atomic unit it was written to be.

param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [Parameter(Mandatory = $true)][string]$ConnectionString,
    # Generous: an ALTER on a small table is instant, but a future migration backfilling a large
    # one shouldn't fail the deploy at the 30-second default.
    [int]$CommandTimeoutSeconds = 600
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ScriptPath)) {
    throw "SQL script not found: $ScriptPath"
}

# EF emits GO alone on its own line, so splitting on that is sufficient here — this is deliberately
# not a general-purpose T-SQL parser and would mis-split a script with "GO" inside a string literal.
$sql = Get-Content -Path $ScriptPath -Raw
$batches = [System.Text.RegularExpressions.Regex]::Split($sql, '(?im)^\s*GO\s*$') |
    Where-Object { $_.Trim().Length -gt 0 }

if ($batches.Count -eq 0) {
    Write-Host "Nothing to run: $ScriptPath contains no statements."
    return
}

$connection = New-Object System.Data.SqlClient.SqlConnection $ConnectionString
try {
    $connection.Open()
    Write-Host "Applying $(Split-Path -Leaf $ScriptPath) to '$($connection.Database)' ($($batches.Count) batches)..."

    $index = 0
    foreach ($batch in $batches) {
        $index++
        $command = $connection.CreateCommand()
        try {
            $command.CommandText = $batch
            $command.CommandTimeout = $CommandTimeoutSeconds
            [void]$command.ExecuteNonQuery()
        } catch {
            # The batch number alone is useless when reading a deploy log, so name the statement
            # that actually failed.
            $preview = ($batch.Trim() -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 3) -join ' '
            throw "Batch $index of $(Split-Path -Leaf $ScriptPath) failed: $($_.Exception.Message)`nStatement began: $preview"
        } finally {
            $command.Dispose()
        }
    }

    Write-Host "Applied $(Split-Path -Leaf $ScriptPath)."
} finally {
    $connection.Dispose()
}
