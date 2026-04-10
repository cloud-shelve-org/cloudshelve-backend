import { Request, Response } from 'express';

export function confirmPage(_req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Email Confirmed — CloudShelve</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #0f0f11;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e4e4e7;
      padding: 24px;
    }

    .card {
      width: 100%;
      max-width: 420px;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 24px 64px rgba(0,0,0,0.5);
    }

    .header {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
      padding: 36px 32px 28px;
      text-align: center;
    }

    .logo {
      font-size: 22px;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.3px;
      margin-bottom: 20px;
      opacity: 0.95;
    }

    .icon-wrap {
      width: 68px;
      height: 68px;
      background: rgba(255,255,255,0.15);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto;
      backdrop-filter: blur(8px);
    }

    .icon-wrap svg {
      width: 36px;
      height: 36px;
    }

    .body {
      padding: 32px;
      text-align: center;
    }

    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #f4f4f5;
      margin-bottom: 10px;
    }

    .subtitle {
      font-size: 14px;
      color: #71717a;
      line-height: 1.6;
      margin-bottom: 28px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 14px 24px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      text-decoration: none;
      transition: opacity 0.15s, transform 0.1s;
      margin-bottom: 16px;
    }

    .btn:active { opacity: 0.85; transform: scale(0.98); }

    .fallback {
      display: none;
      margin-top: 20px;
      padding: 14px 16px;
      background: #1c1c1f;
      border: 1px solid #27272a;
      border-radius: 10px;
      font-size: 13px;
      color: #71717a;
      line-height: 1.6;
    }

    .fallback a {
      color: #818cf8;
      text-decoration: none;
    }

    .status {
      font-size: 12px;
      color: #52525b;
      margin-top: 12px;
    }

    .status.error {
      color: #f87171;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo">☁ CloudShelve</div>
      <div class="icon-wrap">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.2)"/>
          <path d="M7 12.5l3.5 3.5 6.5-7" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
    <div class="body">
      <h1>Email Confirmed!</h1>
      <p class="subtitle">Your account has been verified successfully.<br/>Return to the app to continue.</p>

      <a class="btn" id="openBtn" href="#">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white"/>
        </svg>
        Open CloudShelve App
      </a>

      <div class="status" id="status"></div>

      <div class="fallback" id="fallback">
        App didn't open? Make sure CloudShelve is installed on your device, then
        <a href="#" id="retryLink">try again</a>. You can also close this page and
        open the app manually — your account is already confirmed.
      </div>
    </div>
  </div>

  <script>
    (function () {
      var SCHEME = 'cloudshelve://auth/confirm';
      var FALLBACK_DELAY = 2500;
      var AUTO_OPEN_DELAY = 800;

      var params = {};
      try {
        var hash = window.location.hash.replace(/^#/, '');
        hash.split('&').forEach(function (part) {
          var kv = part.split('=');
          if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
        });
      } catch (e) {}

      function buildDeepLink() {
        var qs = [];
        if (params.access_token)  qs.push('access_token='  + encodeURIComponent(params.access_token));
        if (params.refresh_token) qs.push('refresh_token=' + encodeURIComponent(params.refresh_token));
        qs.push('type=' + encodeURIComponent(params.type || 'signup'));
        return SCHEME + '?' + qs.join('&');
      }

      var deepLink = buildDeepLink();
      var btn      = document.getElementById('openBtn');
      var statusEl = document.getElementById('status');
      var fallback = document.getElementById('fallback');
      var retryEl  = document.getElementById('retryLink');

      btn.href = deepLink;

      function attemptOpen() {
        var start = Date.now();
        window.location.href = deepLink;

        var timer = setTimeout(function () {
          if (Date.now() - start < FALLBACK_DELAY + 500) {
            statusEl.textContent = 'App not detected — is CloudShelve installed?';
            statusEl.className = 'status error';
            fallback.style.display = 'block';
          }
        }, FALLBACK_DELAY);

        // If page regains focus the app didn't open
        window.addEventListener('blur', function onBlur() {
          clearTimeout(timer);
          window.removeEventListener('blur', onBlur);
        }, { once: true });
      }

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        attemptOpen();
      });

      retryEl.addEventListener('click', function (e) {
        e.preventDefault();
        fallback.style.display = 'none';
        statusEl.textContent = '';
        statusEl.className = 'status';
        attemptOpen();
      });

      // Auto-open on mobile
      var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && params.access_token) {
        statusEl.textContent = 'Redirecting to app\u2026';
        setTimeout(attemptOpen, AUTO_OPEN_DELAY);
      }
    })();
  </script>
</body>
</html>`);
}
