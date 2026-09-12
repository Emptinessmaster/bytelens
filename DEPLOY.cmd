@echo off
setlocal
set "DEPLOY_SCRIPT=%~f0"
set "DEPLOY_ROOT=%~1"
set "DEPLOY_MODE=%~2"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$source = [IO.File]::ReadAllText($env:DEPLOY_SCRIPT); $body = ($source -split '(?m)^# POWERSHELL_START\r?$', 2)[1]; & ([scriptblock]::Create($body))"
set "DEPLOY_EXIT=%ERRORLEVEL%"
if not "%DEPLOY_MODE%"=="--list" pause
exit /b %DEPLOY_EXIT%
# POWERSHELL_START
$ErrorActionPreference = 'Stop'

# Uso: doppio clic oppure DEPLOY.cmd "C:\cartella\progetti"
# Inventario senza modifiche: DEPLOY.cmd "C:\cartella\progetti" --list
# Richiede Git e autenticazione gia configurata. Non consuma token AI.
# Pubblica via git push: build/hosting devono essere gia configurati nel repository.
# Non esegue force-push, pull, merge, installazioni o configurazioni dell'hosting.

function Git-Read {
    param([string]$Repo, [string[]]$Arguments)
    $output = @(& git -C $Repo @Arguments)
    if ($LASTEXITCODE -ne 0) { throw ('Git fallito: ' + ($Arguments -join ' ')) }
    return ($output -join "`n").Trim()
}

function Git-Run {
    param([string]$Repo, [string[]]$Arguments)
    & git -C $Repo @Arguments
    if ($LASTEXITCODE -ne 0) { throw ('Git fallito: ' + ($Arguments -join ' ')) }
}

function Find-Repositories {
    param([string]$Root)
    $pending = New-Object 'System.Collections.Generic.Queue[string]'
    $pending.Enqueue($Root)
    while ($pending.Count -gt 0) {
        $folder = $pending.Dequeue()
        if (Test-Path -LiteralPath (Join-Path $folder '.git')) {
            $folder
            continue
        }
        foreach ($child in Get-ChildItem -LiteralPath $folder -Directory -Force -ErrorAction SilentlyContinue) {
            if ($child.Name -in @('node_modules', '.git', '.venv', 'venv', 'dist', 'build', '.next', '.cache', '.codex', '.agents')) { continue }
            if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
            $pending.Enqueue($child.FullName)
        }
    }
}

try {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git non trovato. Installa Git for Windows e riapri il file.' }
    $scriptFolder = Split-Path -Parent $env:DEPLOY_SCRIPT
    $root = $env:DEPLOY_ROOT
    if (-not $root) {
        # Nel repository: cerca i progetti nella cartella superiore.
        # Nella cartella comune: cerca direttamente qui.
        $root = if (Test-Path -LiteralPath (Join-Path $scriptFolder '.git')) { Split-Path -Parent $scriptFolder } else { $scriptFolder }
    }
    $root = (Resolve-Path -LiteralPath $root).Path
    if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw 'La radice deve essere una cartella.' }
    $repositories = @(Find-Repositories $root | Sort-Object)
    if ($repositories.Count -eq 0) { throw "Nessun repository Git trovato in $root" }
    Write-Host "`nPROGETTI IN $root`n"
    for ($i = 0; $i -lt $repositories.Count; $i++) {
        Write-Host ('[{0}] {1}' -f ($i + 1), $repositories[$i])
    }
    if ($env:DEPLOY_MODE -eq '--list') { exit 0 }
    $choice = Read-Host "`nNumero progetto (Invio per uscire)"
    if (-not $choice) { exit 0 }
    $number = 0
    if (-not [int]::TryParse($choice, [ref]$number) -or $number -lt 1 -or $number -gt $repositories.Count) { throw 'Selezione non valida.' }
    $repo = $repositories[$number - 1]
    $branch = Git-Read $repo @('branch', '--show-current')
    if (-not $branch) { throw 'HEAD scollegato: seleziona un branch prima del deploy.' }
    foreach ($operation in @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG')) {
        $operationPath = Git-Read $repo @('rev-parse', '--git-path', $operation)
        if (-not [IO.Path]::IsPathRooted($operationPath)) { $operationPath = Join-Path $repo $operationPath }
        if (Test-Path -LiteralPath $operationPath) { throw "Operazione Git in corso ($operation). Completala prima del deploy." }
    }
    if (Git-Read $repo @('diff', '--name-only', '--diff-filter=U')) { throw 'Sono presenti conflitti non risolti.' }

    # Usa il tracking del branch; se assente chiedi una destinazione esplicita.
    $tracking = Git-Read $repo @('for-each-ref', '--format=%(upstream:remotename)|%(upstream:remoteref)', "refs/heads/$branch")
    $parts = $tracking -split '\|', 2
    $remote = $parts[0]
    $targetRef = if ($parts.Count -gt 1) { $parts[1] } else { '' }
    if (-not $remote -or $remote -eq '.' -or -not $targetRef) {
        $remotes = @( (Git-Read $repo @('remote')) -split "`n" | Where-Object { $_ })
        if ($remotes.Count -eq 0) { throw 'Nessun remote configurato.' }
        Write-Host ('Remote disponibili: ' + ($remotes -join ', '))
        $remote = Read-Host 'Nome del remote da usare'
        if ($remote -notin $remotes) { throw 'Remote non valido.' }
        $targetBranch = Read-Host "Branch remoto (Invio = $branch)"
        if (-not $targetBranch) { $targetBranch = $branch }
        Git-Read $repo @('check-ref-format', '--branch', $targetBranch) | Out-Null
        $targetRef = "refs/heads/$targetBranch"
    }
    $remoteUrls = Git-Read $repo @('remote', 'get-url', '--push', '--all', $remote)
    Write-Host "`nProgetto: $repo`nBranch locale: $branch`nDestinazione: $remote / $targetRef`nURL push: $remoteUrls"
    Write-Host "`nMODIFICHE DA INCLUDERE (tutte quelle non ignorate):"
    $changes = Git-Read $repo @('status', '--short', '--untracked-files=all')
    if ($changes) { Write-Host $changes } else { Write-Host 'Nessuna modifica locale; verranno inviati gli eventuali commit gia presenti.' }
    Write-Host "`nIl push avvia solo il deploy gia configurato sul servizio remoto."
    if ((Read-Host 'Scrivi DEPLOY per confermare commit e push') -cne 'DEPLOY') { Write-Host 'Annullato.'; exit 0 }
    if ($changes) {
        $message = Read-Host 'Messaggio commit (Invio = data e ora)'
        if (-not $message) { $message = 'Deploy manuale ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') }
        Git-Run $repo @('add', '--all')
        # Un submodule sporco potrebbe non produrre un diff committabile nel padre.
        $staged = Git-Read $repo @('diff', '--cached', '--name-only')
        if (-not $staged) { throw 'Nessuna modifica committabile. Verifica eventuali submodule modificati.' }
        Git-Run $repo @('commit', '-m', $message)
    }
    Git-Run $repo @('push', '--', $remote, "HEAD:$targetRef")
    Write-Host "`nPUSH COMPLETATO. Controlla il risultato del deploy nel servizio di hosting."
    Write-Host 'Questo script conferma il push, non il completamento della build o della pubblicazione.'
    exit 0
} catch {
    Write-Host "`nERRORE: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Deploy interrotto. Nessun ripristino automatico: eventuali commit o file in staging restano locali.'
    exit 1
}
