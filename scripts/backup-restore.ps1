param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("backup", "restore")]
  [string]$Action,
  [string]$File = "finora-backup.dump"
)

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL must be set."
}

if ($Action -eq "backup") {
  pg_dump --format=custom --file=$File $env:DATABASE_URL
  Write-Output "Backup written to $File"
  exit 0
}

if (-not (Test-Path -LiteralPath $File)) {
  throw "Backup file not found: $File"
}

pg_restore --clean --if-exists --exit-on-error --dbname=$env:DATABASE_URL $File
Write-Output "Restore completed from $File"
