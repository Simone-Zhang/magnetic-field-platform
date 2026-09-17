[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$serverRoot = Split-Path -Parent $PSScriptRoot
$node = if ($env:MCP_NODE_PATH) { $env:MCP_NODE_PATH } else { 'D:\31508\node.exe' }

if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
    throw "Node.js not found. Set MCP_NODE_PATH to an approved Node.js executable."
}
if ([string]::IsNullOrWhiteSpace($env:MCP_AUDIT_HMAC_KEY) -or $env:MCP_AUDIT_HMAC_KEY.Length -lt 32) {
    throw 'MCP_AUDIT_HMAC_KEY must be supplied by the service environment and be at least 32 characters.'
}

$process = Start-Process -FilePath $node -ArgumentList @((Join-Path $serverRoot 'src\server.js')) -WorkingDirectory $serverRoot -NoNewWindow -PassThru
$process.PriorityClass = 'BelowNormal'
$process.WaitForExit()
exit $process.ExitCode
