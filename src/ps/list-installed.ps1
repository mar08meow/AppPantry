$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$sources = @(
  @{ source = 'hklm64'; hive = 'HKLM'; path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' },
  @{ source = 'hklm32'; hive = 'HKLM'; path = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' },
  @{ source = 'hkcu'; hive = 'HKCU'; path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' }
)

$items = foreach ($source in $sources) {
  Get-ItemProperty -Path $source.path |
    Where-Object {
      $_.DisplayName -and
      -not $_.SystemComponent -and
      -not $_.ParentKeyName -and
      -not $_.ReleaseType
    } |
    ForEach-Object {
      [PSCustomObject]@{
        source        = $source.source
        hive          = $source.hive
        key           = $_.PSChildName
        name          = $_.DisplayName
        version       = $_.DisplayVersion
        publisher     = $_.Publisher
        installDate   = $_.InstallDate
        sizeKb        = $_.EstimatedSize
        location      = $_.InstallLocation
        icon          = $_.DisplayIcon
        uninstall     = $_.UninstallString
        quietUninstall = $_.QuietUninstallString
      }
    }
}

$json = ConvertTo-Json -InputObject @($items) -Compress -Depth 3
[Console]::Out.Write($json)
