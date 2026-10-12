# One-time publish of Neja Cheque to GitHub.
# Asks for the GitHub username, fills the USERNAME placeholders, commits, and pushes main + tags.
# Before running: create an empty repository named NejaCheque on github.com (no README, no license).
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

Write-Host ""
Write-Host "  انتشار نژا چک در گیت‌هاب" -ForegroundColor Cyan
Write-Host "  پیش از ادامه، در github.com یک مخزن خالی به نام NejaCheque بسازید." -ForegroundColor Gray
Write-Host ""
$user = (Read-Host "  نام کاربری گیت‌هاب شما").Trim().TrimStart("@")
if ($user -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$') { Write-Host "  نام کاربری درست نیست." -ForegroundColor Red; exit 1 }

# fill the placeholders (project README, and the GitHub profile kit if it is on this computer)
$utf8 = New-Object System.Text.UTF8Encoding($false)
$files = @("$repo\README.md", "$repo\..\Neja\github-profile\README.md") | Where-Object { Test-Path $_ }
foreach ($f in $files) {
  $text = [System.IO.File]::ReadAllText($f, $utf8)
  if ($text.Contains("USERNAME")) { [System.IO.File]::WriteAllText($f, $text.Replace("USERNAME", $user), $utf8); Write-Host "  پر شد: $f" -ForegroundColor Gray }
}

git add README.md
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { git commit -q -m "پیوندهای گیت‌هاب: $user" }

$url = "https://github.com/$user/NejaCheque.git"
if (git remote | Select-String -Quiet "^origin$") { git remote set-url origin $url } else { git remote add origin $url }

Write-Host ""
Write-Host "  در حال ارسال… اگر صفحهٔ ورود گیت‌هاب باز شد، وارد شوید." -ForegroundColor Cyan
git push -u origin main
if ($LASTEXITCODE -ne 0) { Write-Host "  ارسال نشد. مطمئن شوید مخزن NejaCheque را ساخته‌اید و دوباره اجرا کنید." -ForegroundColor Red; exit 1 }
git push origin --tags

Write-Host ""
Write-Host "  انجام شد." -ForegroundColor Green
Write-Host "  پروژه:  https://github.com/$user/NejaCheque"
Write-Host "  چند دقیقه بعد فایل نصب در این‌جا می‌آید:  https://github.com/$user/NejaCheque/releases"
Start-Process "https://github.com/$user/NejaCheque/actions"
