import { Request, Response, NextFunction } from 'express';
import * as providersService from '../services/providers.service';
import {
  connectProviderSchema,
  oauthUrlQuerySchema,
} from '../validators/providers.validator';
import {
  storeTempCredentials,
  type ProviderType,
} from '../services/provider-adapters';
import { AppError } from '../middleware/error.middleware';

const DEEP_LINK_BASE = 'cloudshelve://oauth/callback';

function badRequest(message: string): AppError {
  const err: AppError = new Error(message);
  err.statusCode = 400;
  return err;
}

// ─── Protected endpoints ────────────────────────────────────────────────────────

/** GET /api/providers — List all connected providers. */
export async function listProviders(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await providersService.listProviders(req.user!.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/providers/oauth-url — Get OAuth authorization URL. */
export async function getOAuthUrl(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = oauthUrlQuerySchema.safeParse(req.query);
    if (!result.success)
      return next(badRequest(result.error.issues[0].message));

    const formBaseUrl = `${req.protocol}://${req.get('host')}`;
    const data = await providersService.generateOAuthUrl(
      req.user!.id,
      result.data.provider,
      formBaseUrl,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/providers/oauth/callback — Backend OAuth callback.
 *
 * All OAuth providers (Google, OneDrive, Dropbox, Box) redirect here after
 * user consent. This endpoint forwards the authorization code to the mobile
 * app via the cloudshelve:// deep link so expo-web-browser can close.
 *
 * This is a PUBLIC endpoint (no auth middleware) — it is called by the
 * provider's auth server, not by the mobile app.
 */
export function oauthCallback(req: Request, res: Response) {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  if (error) {
    // Provider returned an error (e.g. user denied access)
    const params = new URLSearchParams({
      error,
      error_description: error_description || error,
    });
    return res.redirect(`${DEEP_LINK_BASE}?${params}`);
  }

  if (!code || !state) {
    return res.redirect(
      `${DEEP_LINK_BASE}?error=missing_params&error_description=Missing+code+or+state`,
    );
  }

  // Forward code and state to the app via deep link
  const params = new URLSearchParams({ code, state });
  res.redirect(`${DEEP_LINK_BASE}?${params}`);
}

/** GET /api/providers/:id — Get provider detail. */
export async function getProviderDetail(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await providersService.getProviderDetail(
      req.user!.id,
      String(req.params.id),
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** POST /api/providers/connect — Exchange OAuth code for provider connection. */
export async function connectProvider(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = connectProviderSchema.safeParse(req.body);
    if (!result.success)
      return next(badRequest(result.error.issues[0].message));

    const data = await providersService.connectProvider(
      req.user!.id,
      result.data,
    );

    const providerNames: Record<string, string> = {
      google_drive: 'Google Drive',
      onedrive: 'OneDrive',
      dropbox: 'Dropbox',
      mega: 'MEGA',
      aws_s3: 'AWS S3',
      box: 'Box',
    };

    res.json({
      success: true,
      data,
      message: `${providerNames[result.data.provider_type] || result.data.provider_type} connected successfully`,
    });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/providers/:id — Disconnect a provider. */
export async function disconnectProvider(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await providersService.disconnectProvider(req.user!.id, String(req.params.id));
    res.json({ success: true, message: 'Provider disconnected successfully' });
  } catch (err) {
    next(err);
  }
}

/** POST /api/providers/:id/sync — Trigger manual sync. */
export async function syncProvider(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await providersService.syncProvider(
      req.user!.id,
      String(req.params.id),
    );
    res.json({ success: true, data, message: 'Sync completed successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── Public endpoints (credential form for MEGA / S3) ───────────────────────────

/** GET /api/providers/auth-form — Serve the credential input form. */
export function authFormPage(req: Request, res: Response) {
  const provider = req.query.provider as string;
  const state = req.query.state as string;
  const redirectUri = req.query.redirect_uri as string;
  const error = req.query.error as string | undefined;

  if (!provider || !state || !redirectUri) {
    return res.status(400).send('Missing required parameters');
  }

  const html = generateAuthFormHtml(
    provider as ProviderType,
    state,
    redirectUri,
    error,
  );
  res.type('html').send(html);
}

/** POST /api/providers/auth-form — Handle credential form submission. */
export async function authFormSubmit(req: Request, res: Response) {
  const { provider, state, redirect_uri, ...credentials } = req.body;

  if (!provider || !state || !redirect_uri) {
    return res.status(400).send('Missing required parameters');
  }

  // Store credentials temporarily and redirect back to the app
  const tempCode = storeTempCredentials(
    provider as ProviderType,
    credentials as Record<string, string>,
  );
  const callbackUrl = `${redirect_uri}?code=${encodeURIComponent(tempCode)}&state=${encodeURIComponent(state)}`;
  res.redirect(callbackUrl);
}

// ─── HTML form generator ────────────────────────────────────────────────────────

function generateAuthFormHtml(
  provider: ProviderType,
  state: string,
  redirectUri: string,
  error?: string,
): string {
  const config: Record<
    string,
    {
      title: string;
      color: string;
      icon: string;
      fields: {
        name: string;
        label: string;
        type: string;
        placeholder: string;
        required: boolean;
      }[];
    }
  > = {
    mega: {
      title: 'Connect MEGA',
      color: '#D9272E',
      icon: 'M',
      fields: [
        {
          name: 'email',
          label: 'Email Address',
          type: 'email',
          placeholder: 'your@email.com',
          required: true,
        },
        {
          name: 'password',
          label: 'Password',
          type: 'password',
          placeholder: '••••••••',
          required: true,
        },
      ],
    },
    aws_s3: {
      title: 'Connect AWS S3',
      color: '#FF9900',
      icon: '⬡',
      fields: [
        {
          name: 'access_key_id',
          label: 'Access Key ID',
          type: 'text',
          placeholder: 'AKIA...',
          required: true,
        },
        {
          name: 'secret_access_key',
          label: 'Secret Access Key',
          type: 'password',
          placeholder: '••••••••',
          required: true,
        },
        {
          name: 'region',
          label: 'Region',
          type: 'text',
          placeholder: 'us-east-1',
          required: true,
        },
        {
          name: 'bucket',
          label: 'Bucket (optional)',
          type: 'text',
          placeholder: 'my-bucket',
          required: false,
        },
      ],
    },
  };

  const cfg = config[provider];
  if (!cfg) return '<h1>Unsupported provider</h1>';

  const fieldsHtml = cfg.fields
    .map(
      (f) => `
      <div class="field">
        <label for="${f.name}">${f.label}</label>
        <input
          type="${f.type}"
          id="${f.name}"
          name="${f.name}"
          placeholder="${f.placeholder}"
          ${f.required ? 'required' : ''}
        />
      </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${cfg.title} — CloudShelve</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0F172A; color: #E2E8F0;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 20px;
    }
    .card {
      background: #1E293B; border-radius: 20px; padding: 32px;
      max-width: 400px; width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
    }
    .icon {
      width: 56px; height: 56px; border-radius: 14px;
      background: ${cfg.color}20; color: ${cfg.color};
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: 800; margin-bottom: 20px;
    }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .subtitle { color: #94A3B8; font-size: 14px; margin-bottom: 24px; }
    .field { margin-bottom: 16px; }
    label {
      display: block; font-size: 13px; font-weight: 600;
      margin-bottom: 6px; color: #94A3B8;
    }
    input {
      width: 100%; padding: 12px 14px; border-radius: 10px;
      border: 1.5px solid #334155; background: #0F172A; color: #E2E8F0;
      font-size: 15px; outline: none; transition: border-color 0.2s;
    }
    input:focus { border-color: ${cfg.color}; }
    .error {
      background: #EF444418; border: 1px solid #EF444430; border-radius: 10px;
      padding: 12px; margin-bottom: 16px; color: #EF4444; font-size: 13px;
    }
    button {
      width: 100%; padding: 14px; border: none; border-radius: 12px;
      background: ${cfg.color}; color: white;
      font-size: 16px; font-weight: 700; cursor: pointer;
      margin-top: 8px; transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    button:active { opacity: 0.8; }
    .security {
      margin-top: 20px; font-size: 12px; color: #64748B; text-align: center;
    }
    .security span { color: #94A3B8; }
  </style>
</head><body>
  <div class="card">
    <div class="icon">${cfg.icon}</div>
    <h1>${cfg.title}</h1>
    <p class="subtitle">Enter your credentials to connect</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/api/providers/auth-form">
      <input type="hidden" name="provider" value="${provider}" />
      <input type="hidden" name="state" value="${state}" />
      <input type="hidden" name="redirect_uri" value="${redirectUri}" />
      ${fieldsHtml}
      <button type="submit">Connect</button>
    </form>
    <p class="security">🔒 Your credentials are sent securely to <span>CloudShelve</span></p>
  </div>
</body></html>`;
}
