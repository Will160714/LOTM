<#
  Extracts pathway, Sequence, ability and acting data from a local LotMCraft checkout
  and writes pathways.js (plus emblem and ability icons) into this website's repo.

  Usage (Windows PowerShell 5.1+):
    git clone -b hunger-games https://github.com/jakob-wlf/LotMCraft.git <dir>
    powershell -ExecutionPolicy Bypass -File tools\extract-pathways.ps1 -Repo <dir>

  The LotMCraft checkout is only read, never modified.
#>
param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$Out = '',
  [int]$EmblemSize = 256,
  # After checking tools/ability-notes.json against the current source, record the source hashes.
  [switch]$StampNotes
)

$ErrorActionPreference = 'Stop'
if (-not $Out) { $Out = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }
$Repo = (Resolve-Path $Repo).Path
Add-Type -AssemblyName System.Web.Extensions
Add-Type -AssemblyName System.Drawing

$java     = Join-Path $Repo 'src\main\java\de\jakob\lotm'
$abilDir  = Join-Path $java 'beyonders\abilities'
$assets   = Join-Path $Repo 'src\main\resources\assets\lotmcraft'
$langPath = Join-Path $assets 'lang\en_us.json'

# ---------------------------------------------------------------- site-side config
# Order, page ids and accent colours are design choices of the website, not mod data.
$SITE = [ordered]@{
  fool             = @{ accent = '#b9bec4'; accent2 = '#6f7680' }
  error            = @{ accent = '#c9ced6'; accent2 = '#7d8796' }
  door             = @{ accent = '#7fb2ff'; accent2 = '#2f4f8f' }
  visionary        = @{ accent = '#b07ee8'; accent2 = '#5b2f8a' }
  sun              = @{ accent = '#f3d27a'; accent2 = '#a8862c' }
  tyrant           = @{ accent = '#5d8fd6'; accent2 = '#22416f' }
  twilight_giant   = @{ accent = '#e08a3c'; accent2 = '#7a3d12' }
  death            = @{ accent = '#d9d4c3'; accent2 = '#2f8077' }
  darkness         = @{ accent = '#8f6ee0'; accent2 = '#2b1a63' }
  wheel_of_fortune = @{ accent = '#46b98a'; accent2 = '#b8962e' }
  mother           = @{ accent = '#7fae5c'; accent2 = '#355a26' }
  abyss            = @{ accent = '#d8c24a'; accent2 = '#8f1420' }
  red_priest       = @{ accent = '#e2533a'; accent2 = '#7d1a0e' }
  demoness         = @{ accent = '#e07a9c'; accent2 = '#3a0f1f' }
  justiciar        = @{ accent = '#c63a3f'; accent2 = '#8a929c' }
  black_emperor    = @{ accent = '#c9a24a'; accent2 = '#1b1820' }
}

# ---------------------------------------------------------------- helpers
function Read-Text($path) {
  if ($path.Length -ge 240 -and -not $path.StartsWith('\\?\')) { $path = '\\?\' + $path }
  [IO.File]::ReadAllText($path)
}

$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$ser.MaxJsonLength = [int]::MaxValue
$lang = $ser.DeserializeObject((Read-Text $langPath))

function L($key) {
  if ($lang.ContainsKey($key)) { return ($lang[$key] -replace [char]0xA7 + '.', '').Trim() }
  return $null
}

function Title-Case($id) {
  (($id -replace '_ability$', '') -split '_' | ForEach-Object {
    if ($_.Length) { $_.Substring(0, 1).ToUpper() + $_.Substring(1) }
  }) -join ' '
}

# Returns the text of a method body (brace-matched) or $null.
function Get-MethodBody([string]$src, [string]$signatureRegex) {
  $m = [regex]::Match($src, $signatureRegex)
  if (-not $m.Success) { return $null }
  $i = $src.IndexOf('{', $m.Index + $m.Length - 1)
  if ($i -lt 0) { return $null }
  $depth = 0
  for ($j = $i; $j -lt $src.Length; $j++) {
    if ($src[$j] -eq '{') { $depth++ }
    elseif ($src[$j] -eq '}') { $depth--; if ($depth -eq 0) { return $src.Substring($i, $j - $i + 1) } }
  }
  return $null
}

function Parse-Number($s) { [double]::Parse(($s -replace '[fFdD]$', ''), [Globalization.CultureInfo]::InvariantCulture) }

function Parse-List($src, $field) {
  $m = [regex]::Match($src, $field + '\s*=\s*new\s+LinkedList<>\(\s*List\.of\(([^)]*)\)')
  if (-not $m.Success) { return $null }
  return @($m.Groups[1].Value -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ } | ForEach-Object { Parse-Number $_ })
}

# ---------------------------------------------------------------- pathway infos (BeyonderData)
$bd = Read-Text (Join-Path $java 'util\BeyonderData.java')
$infos = @{}
foreach ($m in [regex]::Matches($bd, 'pathwayInfos\.put\("(\w+)",\s*new PathwayInfos\("\w+",\s*0x([0-9A-Fa-f]{8}),\s*new String\[\]\{([^}]*)\},\s*new String\[\]\{([^}]*)\}')) {
  $names = @([regex]::Matches($m.Groups[3].Value, '"([^"]*)"') | ForEach-Object { $_.Groups[1].Value })
  $rel   = @([regex]::Matches($m.Groups[4].Value, '"([^"]*)"') | ForEach-Object { $_.Groups[1].Value })
  $infos[$m.Groups[1].Value] = @{ color = '#' + $m.Groups[2].Value.Substring(2).ToLower(); seqKeys = $names; related = $rel }
}
$allPathways = @([regex]::Match($bd, 'pathways\s*=\s*(?:new\s+String\[\]\s*)?\{([^}]*)\}').Groups[1].Value |
  ForEach-Object { [regex]::Matches($_, '"(\w+)"') } | ForEach-Object { $_.Groups[1].Value })
if (-not $allPathways.Count) { $allPathways = @($infos.Keys) }

$sanityMul = @([regex]::Match($bd, 'sanityDecreaseMultiplier\s*=\s*\{([^}]*)\}').Groups[1].Value -split ',' |
  ForEach-Object { Parse-Number $_.Trim() })

# ---------------------------------------------------------------- acting rules
$capSrc   = Read-Text (Join-Path $java 'beyonders\acting\ActingCapHelper.java')
$incr     = @([regex]::Match($capSrc, 'INCREMENTS\s*=\s*\{([^}]*)\}').Groups[1].Value -split ',' | ForEach-Object { Parse-Number $_.Trim() })
$capUp    = Parse-Number ([regex]::Match($capSrc, 'CAP_PER_SEQUENCE_UP\s*=\s*([\d.]+f?)').Groups[1].Value)
$taskSrc  = Read-Text (Join-Path $java 'beyonders\acting\EventActingTask.java')
$taskScale = Parse-Number ([regex]::Match($taskSrc, 'baseAmount\s*\*\s*([\d.]+f?)').Groups[1].Value)
$rules    = Read-Text (Join-Path $java 'gamerule\ModGameRules.java')
$digRate  = [int][regex]::Match($rules, '"digestion_rate"[\s\S]*?IntegerValue\.create\((\d+)\)').Groups[1].Value
$digMul   = $digRate / 10.0

$tasks = @{}
$reg = Read-Text (Join-Path $java 'beyonders\acting\ActingTaskRegistry.java')
foreach ($m in [regex]::Matches($reg, 'register\("(\w+)",\s*(\d+),\s*new EventActingTask\("(\w+)",\s*([\d.]+f?)(?:,\s*([^)]+))?\)\)')) {
  $p = $m.Groups[1].Value; $s = [int]$m.Groups[2].Value; $tid = $m.Groups[3].Value
  $base = (Parse-Number $m.Groups[4].Value) * $taskScale
  # Cooldowns are written as products like "20 * 10"; multiply the factors rather than evaluating source text.
  $cdTicks = 0
  if ($m.Groups[5].Success) {
    $cdTicks = 1.0
    foreach ($f in ($m.Groups[5].Value -split '\*')) { $cdTicks *= Parse-Number ($f.Trim() -replace '[Ll]$', '') }
  }
  # The mod only ever matches the first registration of a task id (ActingHandler uses findFirst).
  if ($tasks.ContainsKey("$p|$s") -and ($tasks["$p|$s"] | Where-Object { $_.id -eq $tid })) { continue }
  $name = L "lotm.acting.$tid"
  if (-not $name) {
    $am = [regex]::Match($tid, '^use_(\w+_ability)$')
    if ($am.Success) { $an = (L "lotmcraft.$($am.Groups[1].Value)"); if ($an) { $name = "Use $an" } }
  }
  if (-not $name) { $name = Title-Case $tid }
  $key = "$p|$s"
  if (-not $tasks.ContainsKey($key)) { $tasks[$key] = New-Object System.Collections.Generic.List[object] }
  $tasks[$key].Add([ordered]@{
    id = $tid; name = $name
    digestion = [math]::Round($base * $s * $digMul * 100, 2)   # percent of the potion per completion, default game rules
    cooldown  = [math]::Round($cdTicks / 20, 1)                  # seconds before it counts again
  })
}

# ---------------------------------------------------------------- abilities
$classFiles = @{}
Get-ChildItem $abilDir -Recurse -Filter *.java | ForEach-Object { $classFiles[$_.BaseName] = $_.FullName }

function Get-Registrations($file) {
  $src = Read-Text $file
  [regex]::Matches($src, 'new\s+(\w+)\(\s*"([^"]+)"') | ForEach-Object { @{ cls = $_.Groups[1].Value; id = $_.Groups[2].Value } }
}

$registered = @()
$registered += Get-Registrations (Join-Path $abilDir 'core\AbilityHandler.java') | ForEach-Object { $_.type = 'Active'; $_ }
$registered += Get-Registrations (Join-Path $abilDir 'core\PassiveAbilityHandler.java') | ForEach-Object { $_.type = 'Passive'; $_ }

function Resolve-Source($cls) {
  # Walk up the extends chain so inherited constructors / requirements are found.
  $chain = @()
  while ($cls -and $classFiles.ContainsKey($cls) -and $chain.Count -lt 5) {
    $src = Read-Text $classFiles[$cls]
    $chain += ,@{ cls = $cls; src = $src; path = $classFiles[$cls] }
    $cls = [regex]::Match($src, "class\s+$cls\s*(?:<[^>]*>)?\s+extends\s+(\w+)").Groups[1].Value
  }
  return $chain
}

# ---------------------------------------------------------------- ability details read from the class source
function Strip-Comments([string]$s) {
  $s = [regex]::Replace($s, '/\*[\s\S]*?\*/', '')
  return [regex]::Replace($s, '(?m)(?<![:"])//.*$', '')
}

function Eval-Product([string]$expr) {
  # Literal products such as "20 * 5" or "100"; anything with a variable is unknown.
  $e = $expr.Trim()
  if ($e -notmatch '^[\d\s.*()fFLl]+$') { return $null }
  $v = 1.0
  foreach ($f in ($e -replace '[()]', '' -split '\*')) { $t = $f.Trim() -replace '[fFLl]$', ''; if (-not $t) { return $null }; $v *= Parse-Number $t }
  return $v
}

$VANILLA_EFFECTS = @{
  MOVEMENT_SPEED = 'Speed'; MOVEMENT_SLOWDOWN = 'Slowness'; DIG_SPEED = 'Haste'; DIG_SLOWDOWN = 'Mining Fatigue'
  DAMAGE_BOOST = 'Strength'; HEAL = 'Instant Health'; HARM = 'Instant Damage'; JUMP = 'Jump Boost'; CONFUSION = 'Nausea'
  REGENERATION = 'Regeneration'; DAMAGE_RESISTANCE = 'Resistance'; FIRE_RESISTANCE = 'Fire Resistance'; WATER_BREATHING = 'Water Breathing'
  INVISIBILITY = 'Invisibility'; BLINDNESS = 'Blindness'; NIGHT_VISION = 'Night Vision'; HUNGER = 'Hunger'; WEAKNESS = 'Weakness'
  POISON = 'Poison'; WITHER = 'Wither'; HEALTH_BOOST = 'Health Boost'; ABSORPTION = 'Absorption'; SATURATION = 'Saturation'
  GLOWING = 'Glowing'; LEVITATION = 'Levitation'; LUCK = 'Luck'; UNLUCK = 'Bad Luck'; SLOW_FALLING = 'Slow Falling'
  CONDUIT_POWER = 'Conduit Power'; DOLPHINS_GRACE = "Dolphin's Grace"; BAD_OMEN = 'Bad Omen'; HERO_OF_THE_VILLAGE = 'Hero of the Village'; DARKNESS = 'Darkness'
}
function Effect-Name($ns, $id) {
  if ($ns -eq 'MobEffects' -and $VANILLA_EFFECTS.ContainsKey($id)) { return $VANILLA_EFFECTS[$id] }
  $n = L "effect.lotmcraft.$($id.ToLower())"
  if ($n) { return $n }
  return Title-Case $id.ToLower()
}

function Roman([int]$n) { @('', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X')[[math]::Min([math]::Max($n, 0), 10)] }

# PhysicalEnhancement types and their per-level attribute values (PhysicalEnhancementsAbility.EnhancementType)
$peSrc = Strip-Comments (Read-Text (Join-Path $abilDir 'core\PhysicalEnhancementsAbility.java'))
$PE = @{}
foreach ($m in [regex]::Matches($peSrc, '(?m)^\s*([A-Z_]+)\((?:Attributes\.(\w+)|null)\s*,\s*(?:AttributeModifier\.Operation\.(\w+)|null)\s*,\s*([\d.]+)\)')) {
  $PE[$m.Groups[1].Value] = @{ attr = $m.Groups[2].Value; op = $m.Groups[3].Value; per = (Parse-Number $m.Groups[4].Value) }
}
$PE_LABEL = @{
  STRENGTH = 'Strength'; SPEED = 'Speed'; HEALTH = 'Health'; MINING_EFFICIENCY = 'Mining efficiency'; KNOCKBACK_RESISTANCE = 'Knockback resistance'
  ATTACK_SPEED = 'Attack speed'; RESISTANCE = 'Resistance'; NIGHT_VISION = 'Night vision'; FIRE_RESISTANCE = 'Fire resistance'; LUCK = 'Luck'
  REGENERATION = 'Regeneration'; CONDUIT = 'Conduit power'; DOLPHINS_GRACE = "Dolphin's grace"; OXYGEN_BONUS = 'Oxygen bonus'
  UNDERWATER_BREATHING = 'Water breathing'; SATURATION = 'Saturation'; CONCEALMENT = 'Concealment'
}
function Enhancement-Text($type, [int]$level, [bool]$varies) {
  $label = $(if ($PE_LABEL.ContainsKey($type)) { $PE_LABEL[$type] } else { Title-Case $type.ToLower() })
  $info = $PE[$type]
  $more = $(if ($varies) { ' (more under some conditions)' } else { '' })
  if ($level -le 0) { return "${label}: only under some conditions" }
  if ($info -and $info.attr) {
    $v = $level * $info.per
    $val = switch ($type) {
      'HEALTH'               { "+$v max health ($($v / 2) hearts)" }
      'STRENGTH'             { "+$v attack damage" }
      'SPEED'                { "+$([math]::Round($v, 3)) movement speed" }
      'KNOCKBACK_RESISTANCE' { "+$([math]::Round($v * 100))% knockback resistance" }
      'ATTACK_SPEED'         { "+$([math]::Round($v * 100))% attack speed" }
      default                { "+$v" }
    }
    return "${label}: $val$more"
  }
  if ($level -le 1) { return "$label$(if ($varies) { ' (varies)' })" }
  return "$label $(Roman $level)$(if ($varies) { ' (varies)' })"
}

function Parse-Enhancements($list) {
  $items = New-Object System.Collections.Generic.List[string]
  foreach ($m in [regex]::Matches($list, 'new\s+PhysicalEnhancement\(\s*(?:PhysicalEnhancementsAbility\.)?EnhancementType\.(\w+)\s*,\s*([^)]+)\)')) {
    $expr = $m.Groups[2].Value.Trim()
    $num = [regex]::Match($expr, '\d+')
    $level = $(if ($num.Success) { [int]$num.Value } else { 0 })
    $varies = $expr -notmatch '^\d+$'
    if ($level -le 0 -and -not $varies) { continue }
    $items.Add((Enhancement-Text $m.Groups[1].Value $level $varies))
  }
  return ,$items.ToArray()
}

function Get-Details($chain) {
  $src = Strip-Comments $chain[0].src
  $classes = @($chain | ForEach-Object { $_.cls })
  $extends = @($chain | ForEach-Object { [regex]::Match($_.src, 'extends\s+(\w+)').Groups[1].Value })
  $d = [ordered]@{}

  if ($extends -contains 'ToggleAbility') { $d.kind = 'Toggle' }
  elseif ($extends -contains 'SelectableAbility') { $d.kind = 'Selectable' }

  # Selectable modes: getAbilityNames() returns lang keys
  $namesBody = Get-MethodBody $src 'getAbilityNames\(\)\s*\{'
  if ($namesBody) {
    $modes = New-Object System.Collections.Generic.List[object]
    foreach ($m in [regex]::Matches($namesBody, '"([\w.]+)"')) {
      $k = $m.Groups[1].Value
      $mn = L $k; if (-not $mn) { $mn = Title-Case ($k -split '\.')[-1] }
      $mode = [ordered]@{ name = $mn }
      $md = L "$k.description"; if ($md) { $mode.description = $md }
      $modes.Add($mode)
    }
    if ($modes.Count) { $d.modes = $modes.ToArray() }
  }

  # Internal cooldowns that passives keep themselves (e.g. Reincarnation's getCooldownMs, RETALIATION_COOLDOWN_TICKS).
  if ($extends -contains 'PassiveAbility' -or $extends -contains 'PhysicalEnhancementsAbility') {
    $cds = New-Object System.Collections.Generic.List[object]
    $msBody = Get-MethodBody $src 'getCooldownMs\([^)]*\)\s*\{'
    if ($msBody) {
      $m = [regex]::Match($msBody, 'return\s+([^;]+);')
      if ($m.Success) { $v = Eval-Product $m.Groups[1].Value; if ($v) { $cds.Add([ordered]@{ label = ''; seconds = [math]::Round($v / 1000, 1) }) } }
    }
    foreach ($m in [regex]::Matches($src, 'static\s+final\s+(?:long|int|float|double)\s+([A-Z_]*COOLDOWN[A-Z_]*)\s*=\s*([^;]+);')) {
      $v = Eval-Product $m.Groups[2].Value
      if (-not $v) { continue }
      $name = $m.Groups[1].Value
      $secs = $(if ($name -match '_MS$|MILLIS') { $v / 1000 } else { $v / 20 })
      $label = ($name -replace '_?COOLDOWN', '' -replace '_?(TICKS|MS|MILLIS)$', '' -replace '_', ' ').Trim().ToLower()
      if ($label) { $label = $label.Substring(0, 1).ToUpper() + $label.Substring(1) }
      $cds.Add([ordered]@{ label = $label; seconds = [math]::Round($secs, 1) })
    }
    if ($cds.Count) { $d.cooldowns = $cds.ToArray() }
  }

  $bd = [regex]::Match($src, 'baseDamage\s*=\s*([\d.]+)[fF]?\s*;')
  if ($bd.Success) { $d.baseDamage = Parse-Number $bd.Groups[1].Value }

  # Status effects: each "new MobEffectInstance(...)" with the statement that applies it
  $effects = New-Object System.Collections.Generic.List[object]
  $seen = @{}
  # "player" is the user when it was bound from the caster or from the event's own entity (passive event handlers).
  $playerIsSelf = $src -match '\b(entity|caster|user|event\.getEntity\(\))\s+instanceof\s+\w*Player\s+player\b' -and
                  $src -notmatch '\b(target|targetEntity|e|nearby|victim|living)\s+instanceof\s+\w*Player\s+player\b'
  foreach ($m in [regex]::Matches($src, 'new\s+MobEffectInstance\(\s*(MobEffects|ModEffects)\.(\w+)(?:\.get\(\))?\s*(?:,\s*([^,()]+(?:\([^()]*\))?[^,()]*))?(?:,\s*([^,()]+))?')) {
    $start = [math]::Max($src.LastIndexOf(';', $m.Index), [math]::Max($src.LastIndexOf('{', $m.Index), $src.LastIndexOf('}', $m.Index)))
    $stmt = $src.Substring($start + 1, $m.Index - $start - 1)
    $target = $null
    if ($stmt -match 'NearbyEntities') { $target = 'nearby creatures' }
    elseif ($stmt -match '\b(entity|caster|user)\s*\.\s*addEffect\s*\(\s*$') { $target = 'you' }
    elseif ($playerIsSelf -and $stmt -match '\bplayer\s*\.\s*addEffect\s*\(\s*$') { $target = 'you' }
    elseif ($stmt -match '\.\s*addEffect\s*\(\s*$') { $target = 'targets' }
    $name = Effect-Name $m.Groups[1].Value $m.Groups[2].Value
    $key = "$name|$target"
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = $true
    $e = [ordered]@{ name = $name }
    if ($target) { $e.target = $target }
    $ticks = $(if ($m.Groups[3].Success) { Eval-Product $m.Groups[3].Value } else { $null })
    if ($ticks -and $ticks -gt 0 -and $ticks -lt 20 * 60 * 60) { $e.seconds = [math]::Round($ticks / 20, 1) }
    if ($m.Groups[4].Success -and $m.Groups[4].Value.Trim() -match '^\d+$') {
      $lvl = [int]$m.Groups[4].Value.Trim() + 1
      if ($lvl -le 10) { $e.level = $lvl }   # very high amplifiers are internal markers, not meaningful levels
    }
    $effects.Add($e)
  }
  if ($effects.Count) { $d.effects = $effects.ToArray() }

  $limits = New-Object System.Collections.Generic.List[string]
  if ($src -match 'canBeCopied\s*=\s*false') { $limits.Add('copied') }
  if ($src -match 'cannotBeStolen\s*=\s*true') { $limits.Add('stolen') }
  if ($src -match 'canBeReplicated\s*=\s*false') { $limits.Add('replicated') }
  if ($src -match 'canBeShared\s*=\s*false') { $limits.Add('shared') }
  if ($src -match 'canBeUsedInArtifact\s*=\s*false') { $limits.Add('sealed into artifacts') }
  if ($limits.Count) { $d.cannotBe = $limits.ToArray() }

  # Physical enhancements: per-Sequence switch, or one list for every Sequence
  if ($extends -contains 'PhysicalEnhancementsAbility') {
    $body = Get-MethodBody $src 'getEnhancementsForSequence\(int\s+\w+(?:\s*,\s*LivingEntity\s+\w+)?\)\s*\{'
    $perSeq = New-Object System.Collections.Generic.List[object]
    if ($body) {
      foreach ($m in [regex]::Matches($body, '(case\s+([\d,\s]+)|default)\s*->\s*List\.of\(([\s\S]*?)\)\s*;')) {
        $items = Parse-Enhancements $m.Groups[3].Value
        $seqs = $(if ($m.Groups[2].Success) { @($m.Groups[2].Value -split ',' | ForEach-Object { [int]$_.Trim() }) } else { @() })
        foreach ($sq in $seqs) { $perSeq.Add([ordered]@{ sequence = $sq; items = $items }) }
      }
    }
    if (-not $perSeq.Count) {
      $all = Get-MethodBody $src 'getEnhancements\(\)\s*\{'
      if ($all) { $items = Parse-Enhancements $all; if ($items.Count) { $perSeq.Add([ordered]@{ sequence = 'all'; items = $items }) } }
    }
    if ($perSeq.Count) { $d.enhancements = @($perSeq.ToArray() | Sort-Object { if ($_.sequence -eq 'all') { 99 } else { -[int]$_.sequence } }) }
  }

  if (-not $d.Count) { return $null }
  return $d
}

# Hand-written explanations for abilities the mod leaves undescribed (tools/ability-notes.json).
# ability-notes.lock.json records the source hash each note was checked against.
$notesPath = Join-Path $PSScriptRoot 'ability-notes.json'
$lockPath = Join-Path $PSScriptRoot 'ability-notes.lock.json'
$NOTES = @{}; $NOTE_LOCK = @{}; $NOTE_LOCK_NEW = [ordered]@{}
if (Test-Path $notesPath) {
  $n = $ser.DeserializeObject((Read-Text $notesPath))
  foreach ($k in $n.Keys) { if ($k -ne '_comment') { $NOTES[$k] = $n[$k] } }
}
if (Test-Path $lockPath) { $l = $ser.DeserializeObject((Read-Text $lockPath)); foreach ($k in $l.Keys) { $NOTE_LOCK[$k] = $l[$k] } }
$sha = [Security.Cryptography.SHA256]::Create()
function Source-Hash($path) {
  $text = (Read-Text $path) -replace "`r`n", "`n"
  ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text))) -replace '-', '').Substring(0, 16).ToLower()
}

$warnings = New-Object System.Collections.Generic.List[string]
$byPathSeq = @{}
$seenPerPath = @{}

foreach ($r in $registered) {
  $chain = Resolve-Source $r.cls
  if (-not $chain.Count) { $warnings.Add("no source for $($r.cls)"); continue }
  $src = $chain[0].src
  if ($src -match 'shouldBeHidden\s*=\s*true') { continue }

  $reqBody = $null
  foreach ($c in $chain) { $reqBody = Get-MethodBody $c.src 'getRequirements\(\)\s*\{'; if ($reqBody) { break } }
  if (-not $reqBody) { $warnings.Add("no requirements for $($r.id)"); continue }

  $req = [ordered]@{}
  $loop = [regex]::Match($reqBody, 'for\s*\(\s*String\s+(\w+)\s*:\s*BeyonderData\.pathways\s*\)[\s\S]*?put\(\s*\1\s*,\s*(\d+)\s*\)')
  if ($loop.Success) { foreach ($p in $allPathways) { $req[$p] = [int]$loop.Groups[2].Value } }
  foreach ($m in [regex]::Matches($reqBody, '"(\w+)"\s*,\s*(\d+)')) { $req[$m.Groups[1].Value] = [int]$m.Groups[2].Value }
  if (-not $req.Count) { $warnings.Add("unparsed requirements for $($r.id)"); continue }

  # cooldown (seconds) from super(id, <cooldown>, ...)
  $cd = $null; $cost = $null; $cdList = $null; $costList = $null
  if ($r.type -eq 'Active') {
    foreach ($c in $chain) {
      $m = [regex]::Match($c.src, 'super\(\s*\w+\s*,\s*([\d.]+[fF]?)\s*[,)]')
      if ($m.Success) { $cd = Parse-Number $m.Groups[1].Value; break }
    }
    foreach ($c in $chain) {
      $b = Get-MethodBody $c.src 'float\s+getSpiritualityCost\(\)\s*\{'
      if ($b) { $m = [regex]::Match($b, 'return\s+([\d.]+[fF]?)\s*;'); if ($m.Success) { $cost = Parse-Number $m.Groups[1].Value }; break }
    }
    if ($src -match 'hasDynamicCooldown\s*=\s*true') { $cdList = Parse-List $src 'dynamicCooldown' }
    if ($src -match 'hasDynamicSpirituality\s*=\s*true') { $costList = Parse-List $src 'dynamicSpirituality' }
  }

  $name = (L "lotmcraft.$($r.id)"); if (-not $name) { $name = L "ability.lotmcraft.$($r.id)" }
  $desc = (L "lotmcraft.$($r.id).description"); if (-not $desc) { $desc = L "ability.lotmcraft.$($r.id).description" }
  if (-not $desc) { $bare = $r.id -replace '_ability$', ''; $desc = L "lotmcraft.$bare.description"; if (-not $desc) { $desc = L "ability.lotmcraft.$bare.description" } }
  $descSource = 'mod'
  if (-not $desc) {
    $noteKey = $(if ($r.id -like 'physical_enhancements_*') { '_physical_enhancements' } else { $r.id })
    if ($NOTES.ContainsKey($noteKey)) {
      $desc = $NOTES[$noteKey]; $descSource = 'code'
      $hash = Source-Hash $chain[0].path
      if (-not $NOTE_LOCK.ContainsKey($r.id)) { $NOTE_LOCK_NEW[$r.id] = $hash; if (-not $StampNotes) { $warnings.Add("note for $($r.id) has not been stamped against its source (run with -StampNotes after checking it)") } }
      elseif ($NOTE_LOCK[$r.id] -ne $hash) { $NOTE_LOCK_NEW[$r.id] = $hash; if (-not $StampNotes) { $warnings.Add("source of $($r.id) changed since its note was written; re-read it and update tools/ability-notes.json") } }
      else { $NOTE_LOCK_NEW[$r.id] = $hash }
    }
  }
  $details = Get-Details $chain

  $icon = $null
  foreach ($rel in @("textures\abilities\$($r.id).png", "textures\abilities\passive\$($r.id).png")) {
    $f = Join-Path $assets $rel
    if (Test-Path $f) {
      $dest = Join-Path $Out "assets\abilities\$($r.id).png"
      New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
      Copy-Item $f $dest -Force
      $icon = "assets/abilities/$($r.id).png"; break
    }
  }

  foreach ($p in $req.Keys) {
    if (-not $SITE.Contains($p)) { continue }
    $s = $req[$p]
    if (-not $seenPerPath.ContainsKey($p)) { $seenPerPath[$p] = @{} }
    if ($seenPerPath[$p].ContainsKey($r.id)) { continue }
    $seenPerPath[$p][$r.id] = $true

    # Values at the Sequence where the ability unlocks, and at Sequence 0, following Ability.getCooldown/spiritualityCost.
    $cdAt = { param($seq) if ($cdList -and $seq -lt $cdList.Count) { $cdList[$seq] } else { $cd } }
    $costAt = { param($seq) if ($costList -and $seq -lt $costList.Count) { $costList[$seq] } else { $cost } }

    $key = "$p|$s"
    if (-not $byPathSeq.ContainsKey($key)) { $byPathSeq[$key] = New-Object System.Collections.Generic.List[object] }
    $byPathSeq[$key].Add([ordered]@{
      id = $r.id
      name = $(if ($name) { $name } else { Title-Case $r.id })
      type = $r.type
      description = $(if ($desc) { $desc } else { '[Archive incomplete]' })
      descriptionSource = $(if ($desc) { $descSource } else { $null })
      cost = & $costAt $s
      cooldown = $(if ($r.type -eq 'Passive' -and $details -and $details.Contains('cooldowns')) { $details.cooldowns[0].seconds } else { & $cdAt $s })
      costAtZero = & $costAt 0
      cooldownAtZero = & $cdAt 0
      details = $details
      sharedWith = @($req.Keys | Where-Object { $_ -ne $p -and $SITE.Contains($_) })
      icon = $icon
      source = ($chain[0].path.Substring($chain[0].path.IndexOf('\src\main\') + 1) -replace '\\', '/')
    })
  }
}

# ---------------------------------------------------------------- emblems
New-Item -ItemType Directory -Force (Join-Path $Out 'assets\emblems') | Out-Null
function Save-Emblem($id) {
  $src = Join-Path $assets "textures\gui\icons\${id}_icon.png"
  if (-not (Test-Path $src)) { return $null }
  $dest = Join-Path $Out "assets\emblems\$id.png"
  $img = [Drawing.Image]::FromFile($src)
  try {
    $bmp = New-Object Drawing.Bitmap $EmblemSize, $EmblemSize
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $EmblemSize, $EmblemSize)
    $g.Dispose(); $bmp.Save($dest, [Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  } finally { $img.Dispose() }
  return "assets/emblems/$id.png"
}

# ---------------------------------------------------------------- assemble
$pathwayName = { param($id) $n = L "lotm.pathway.$id"; if ($n) { $n } else { Title-Case $id } }

# Divine groups: the mod's same-domain list (AdvancementUtil.PATHWAY_DOMAINS) plus each pathway's related list in BeyonderData.
$adv = Read-Text (Join-Path $java 'util\helper\AdvancementUtil.java')
$domains = @([regex]::Matches($adv, 'Set\.of\(([^)]*)\)') | ForEach-Object { ,@([regex]::Matches($_.Groups[1].Value, '"(\w+)"') | ForEach-Object { $_.Groups[1].Value }) })

$result = New-Object System.Collections.Generic.List[object]
foreach ($id in $SITE.Keys) {
  $info = $infos[$id]
  # The domain list is what the mod uses for same-group pathway switching, so it wins; otherwise fall back to the related list.
  $members = $null
  foreach ($d in $domains) { if ($d -contains $id) { $members = @($d) } }
  if (-not $members) { $members = @($id) + @($info.related) }
  $order = @($SITE.Keys) + @($infos.Keys | Sort-Object)
  $members = @($members | Select-Object -Unique | Sort-Object { [array]::IndexOf($order, $_) })
  $group = ($members | ForEach-Object { & $pathwayName $_ }) -join " $([char]0x00B7) "

  $seqs = New-Object System.Collections.Generic.List[object]
  $abilityCount = 0; $taskCount = 0
  for ($s = 9; $s -ge 0; $s--) {
    $seqKey = $info.seqKeys[$s]
    $seqName = $(if ($seqKey) { L "lotm.sequence.$seqKey" } else { $null })
    $ab = @(); if ($byPathSeq.ContainsKey("$id|$s")) { $ab = $byPathSeq["$id|$s"].ToArray() }
    $tk = @(); if ($tasks.ContainsKey("$id|$s")) { $tk = $tasks["$id|$s"].ToArray() }
    $abilityCount += $ab.Count; $taskCount += $tk.Count
    $label = $(if ($seqName) { $seqName } else { 'this Sequence' })

    if ($tk.Count) {
      $method = "Live as a $label. The archive recognises $($tk.Count) acting deeds at this Sequence; each one digests part of the potion and then rests for its cooldown before it counts again. The first three different deeds also restore " +
        (($incr | ForEach-Object { "$([math]::Round($_ * 100))%" }) -join ', ') + " of the acting cap."
    } elseif ($s -eq 0) {
      $method = "[Archive incomplete] No acting deeds are registered at Sequence 0. The acting cap no longer applies here; the potion is digested by using this pathway's abilities."
    } else {
      $method = "[Archive incomplete] No acting deeds are registered for this Sequence. Without registered deeds, the potion is digested by using this pathway's abilities instead."
    }

    $seqs.Add([ordered]@{
      number = $s
      name = $(if ($seqName) { $seqName } else { '[Archive incomplete]' })
      actingMethod = $method
      actingTasks = $tk
      abilities = $ab
    })
  }

  $n = & $pathwayName $id
  $s9 = $seqs[0].name; $s0 = $seqs[9].name
  $kin = @($members | Where-Object { $_ -ne $id } | ForEach-Object { & $pathwayName $_ }) -join ', '
  $lore = "Recovered from the Nighthawks' sealed files. The $n pathway descends from the $s9 at Sequence 9 to the $s0 at Sequence 0. " +
    $(if ($abilityCount) { "The clerks catalogued $abilityCount abilities and $taskCount acting deeds across its ten potions. " } else { "No abilities were recovered for it; the record is incomplete. " }) +
    $(if ($kin) { "Kindred pathways in the file: $kin." } else { '' })

  $result.Add([ordered]@{
    id = $id
    name = $n
    divineGroup = $group
    accentColor = $SITE[$id].accent
    accentColor2 = $SITE[$id].accent2
    modColor = $info.color
    emblem = Save-Emblem $id
    lore = $lore
    sequences = $seqs
  })
}

$commit = (& git -C $Repo rev-parse --short HEAD 2>$null)
$branch = (& git -C $Repo rev-parse --abbrev-ref HEAD 2>$null)
$meta = [ordered]@{
  repo = 'https://github.com/jakob-wlf/LotMCraft'
  branch = $branch
  commit = $commit
  extracted = (Get-Date -Format 'yyyy-MM-dd')
  rules = [ordered]@{
    digestionRateDefault = $digRate
    taskScale = $taskScale
    capPerSequenceUp = $capUp
    capRestoreIncrements = $incr
    sanityDecreaseMultiplier = $sanityMul
  }
}

$json = $result | ConvertTo-Json -Depth 12 -Compress
$metaJson = $meta | ConvertTo-Json -Depth 6
$header = "/* Generated by tools/extract-pathways.ps1 from LotMCraft ($branch @ $commit). Do not edit by hand; re-run the extractor. */`n"
$js = $header + "window.ARCHIVE_META = $metaJson;`nwindow.PATHWAYS = $json;`n"
[IO.File]::WriteAllText((Join-Path $Out 'pathways.js'), $js, (New-Object Text.UTF8Encoding $false))

Write-Host "Wrote $($result.Count) pathways to pathways.js"
foreach ($p in $result) {
  $a = ($p.sequences | ForEach-Object { $_.abilities.Count } | Measure-Object -Sum).Sum
  $t = ($p.sequences | ForEach-Object { $_.actingTasks.Count } | Measure-Object -Sum).Sum
  Write-Host ("  {0,-17} abilities={1,3} tasks={2,3} emblem={3}" -f $p.id, $a, $t, [bool]$p.emblem)
}
if ($StampNotes) {
  $sorted = [ordered]@{}; foreach ($k in ($NOTE_LOCK_NEW.Keys | Sort-Object)) { $sorted[$k] = $NOTE_LOCK_NEW[$k] }
  [IO.File]::WriteAllText($lockPath, ($sorted | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
  Write-Host "Stamped $($sorted.Count) ability notes against the current source."
}
$unusedNotes = @($NOTES.Keys | Where-Object { $_ -ne '_physical_enhancements' -and -not $NOTE_LOCK_NEW.Contains($_) })
foreach ($k in $unusedNotes) { $warnings.Add("note for $k is no longer used (the mod now describes it, or the ability is gone)") }
if ($warnings.Count) { Write-Host "Notes:"; $warnings | ForEach-Object { Write-Host "  $_" } }
