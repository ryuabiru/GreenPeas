$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

npm run licenses:generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run tauri build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
