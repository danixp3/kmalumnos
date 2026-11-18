# Estado local de KMAlumnos en este PC: data.json + pending_sync.json
# (solo ASCII: PowerShell 5.1 malinterpreta UTF-8 sin BOM)
$dir = Join-Path $env:APPDATA 'kmalumnos'
$dataFile = Join-Path $dir 'data.json'
$pendFile = Join-Path $dir 'pending_sync.json'

if (-not (Test-Path $dataFile)) {
    Write-Output "data.json: NO EXISTE en $dir (PC sin datos o sin usar)"
} else {
    try {
        $d = Get-Content $dataFile -Raw | ConvertFrom-Json
        Write-Output ("data.json: vehiculos=" + @($d.vehiculos).Count + " alumnos=" + @($d.alumnos).Count + " practicas=" + @($d.practicas).Count)
        Write-Output ("  vehiculo ids: " + (@($d.vehiculos.id) -join ','))
        Write-Output ("  alumno ids:   " + (@($d.alumnos.id) -join ','))
        $sinKm = @($d.practicas | Where-Object { $_.km_inicial -eq 0 -and $_.km_final -eq 0 })
        Write-Output ("  practicas sin km: " + $sinKm.Count)
    } catch {
        Write-Output "data.json: DANADO (no es JSON valido). Sintoma clave: el sync se auto-recupera desde v1.3.10"
    }
}

if (Test-Path $pendFile) {
    $p = Get-Content $pendFile -Raw | ConvertFrom-Json
    Write-Output ("pending_sync.json: lastSync=" + $p.lastSync)
    Write-Output ("  colas: vehiculos=" + @($p.vehiculos).Count + " alumnos=" + @($p.alumnos).Count + " practicas=" + @($p.practicas).Count + " / borrados: p=" + @($p.deleted.practicas).Count + " a=" + @($p.deleted.alumnos).Count + " v=" + @($p.deleted.vehiculos).Count)
} else {
    Write-Output "pending_sync.json: no existe (nunca ha sincronizado)"
}

# Copias de data.json danado que haya guardado el sync (v1.3.10+)
Get-ChildItem $dir -Filter 'data.json.danado-*' -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Output ("copia de archivo danado: " + $_.Name + " (" + $_.LastWriteTime + ")")
}
