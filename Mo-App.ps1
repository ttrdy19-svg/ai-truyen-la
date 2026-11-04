$ErrorActionPreference = 'Stop'
try {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $cfg = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.local.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $packaged = Join-Path $PSScriptRoot 'AI Ban Chay\win-unpacked\AI Truyen La.exe'
  if (Test-Path -LiteralPath $packaged) { Start-Process -FilePath $packaged -WorkingDirectory $PSScriptRoot -WindowStyle Hidden; return }
  $runtime = Join-Path $cfg.studioRoot 'node_modules\electron\dist\electron.exe'
  if (-not (Test-Path -LiteralPath $runtime)) { throw 'Khong tim thay Electron cua Duy TTD Studio. Sua studioRoot trong config.local.json.' }
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Start-Process -FilePath $runtime -ArgumentList ('"' + $PSScriptRoot + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($_.Exception.Message, 'AI Truyen La') | Out-Null
}
