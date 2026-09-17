[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $ServiceAccount,
    [string[]] $DataRoots = @(
        'D:\31508\location2\final Experiment\MCPData',
        'D:\31508\Documents\GithubPlatform\magnetic-field-platform\mcp-data',
        'D:\31508\Documents\GithubPlatform\magnetic-field-platform\reports'
    )
)

$ErrorActionPreference = 'Stop'
$writeRights = [System.Security.AccessControl.FileSystemRights]'Write,Modify,FullControl,Delete,CreateFiles,CreateDirectories,AppendData,WriteData,WriteAttributes,WriteExtendedAttributes,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership'
$failed = $false

foreach ($root in $DataRoots) {
    $resolved = (Resolve-Path -LiteralPath $root).Path
    $acl = Get-Acl -LiteralPath $resolved
    if ($acl.Owner -eq $ServiceAccount) {
        Write-Error "$ServiceAccount owns $resolved and can change its ACL; use a separate data owner."
        $failed = $true
    }
    $rules = $acl.Access | Where-Object { $_.IdentityReference.Value -eq $ServiceAccount }
    if (-not $rules) {
        Write-Error "No explicit ACL entry for $ServiceAccount on $resolved"
        $failed = $true
        continue
    }
    foreach ($rule in $rules) {
        if ($rule.AccessControlType -eq 'Allow' -and (($rule.FileSystemRights -band $writeRights) -ne 0)) {
            Write-Error "Writable permission detected for $ServiceAccount on $resolved: $($rule.FileSystemRights)"
            $failed = $true
        }
    }
    Write-Output "Checked $resolved"
}

if ($failed) { exit 1 }
Write-Output 'PASS: explicit account ACL entries are read-only and the account is not the owner.'
Write-Warning 'This static check cannot resolve permissions inherited through group membership. Validate effective access under the actual non-admin service identity before production.'
