# からまつ苑 利用料金シミュレーター - ローカル確認用サーバー
# Node.js等のインストールが不要な、簡易HTTPサーバーです。
# このスクリプトは「起動.bat」から呼び出されます。手動実行も可能です。

$Port = 8791
$RootDir = $PSScriptRoot

Add-Type -AssemblyName System.Net.HttpListener -ErrorAction SilentlyContinue

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "サーバーの起動に失敗しました。"
  Write-Host "同じポート(8791)で既に起動している場合は、そのウィンドウをご利用ください。"
  Write-Host "エラー内容: $($_.Exception.Message)"
  Write-Host ""
  Read-Host "終了するには Enter キーを押してください"
  exit 1
}

$url = "http://localhost:$Port/index.html"
Write-Host ""
Write-Host "======================================================"
Write-Host " からまつ苑 利用料金シミュレーター - ローカルサーバー起動中"
Write-Host "======================================================"
Write-Host ""
Write-Host " ブラウザで下記アドレスが開きます:"
Write-Host " $url"
Write-Host ""
Write-Host " 終了するには、このウィンドウを閉じるか Ctrl+C を押してください。"
Write-Host ""

Start-Process $url

$mimeMap = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".png"  = "image/png"
  ".svg"  = "image/svg+xml"
  ".webmanifest" = "application/manifest+json"
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $req = $context.Request
  $res = $context.Response
  try {
    $relPath = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrEmpty($relPath)) { $relPath = "index.html" }
    $filePath = Join-Path $RootDir $relPath
    if (Test-Path $filePath -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
      $mime = $mimeMap[$ext]
      if (-not $mime) { $mime = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $res.ContentType = $mime
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not Found: $relPath")
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    $res.StatusCode = 500
    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Error: $($_.Exception.Message)")
    $res.OutputStream.Write($errBytes, 0, $errBytes.Length)
  } finally {
    $res.OutputStream.Close()
  }
}
