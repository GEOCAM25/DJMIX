/**
 * Cliente de Google Drive 100% del lado del navegador (Bring Your Own Cloud).
 *
 * No hay backend de DJMIX: el usuario aporta su propio **Client ID de OAuth**
 * (de Google Cloud Console) y sus respaldos van a la carpeta privada
 * `appDataFolder` de SU Drive. DJMIX nunca ve ni almacena esos datos.
 *
 * Flujo OAuth 2.0 "implicit" manual mediante popup (sin librerías externas ni
 * dependencias): abrimos el diálogo de Google, y cuando redirige de vuelta a
 * nuestro origen con `#access_token=…`, lo leemos del hash del popup.
 *
 * Requisitos de configuración (una vez, por el usuario) en Google Cloud:
 *  - Habilitar la API de Google Drive.
 *  - Crear credenciales OAuth (tipo "Web") y añadir el ORIGEN de la app como
 *    "Authorized JavaScript origin" y esta misma URL como "redirect URI".
 *  - Scope usado: drive.appdata (solo la carpeta de datos de la app).
 */

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

/** Abre el consentimiento de Google y resuelve con un access token. */
export function connectDrive(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!clientId) {
      reject(new Error('Falta el Client ID de Google.'));
      return;
    }
    const redirectUri = window.location.origin + window.location.pathname;
    const state = Math.random().toString(36).slice(2);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', DRIVE_SCOPE);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('prompt', 'consent');

    const popup = window.open(authUrl.toString(), 'djmix_gdrive', 'width=520,height=680');
    if (!popup) {
      reject(new Error('El navegador bloqueó la ventana emergente. Habilítala e inténtalo de nuevo.'));
      return;
    }

    const timer = window.setInterval(() => {
      try {
        if (popup.closed) {
          window.clearInterval(timer);
          reject(new Error('Autenticación cancelada.'));
          return;
        }
        // Mientras el popup está en accounts.google.com, esto lanza (cross-origin)
        // y lo ignoramos. Al volver a nuestro origen, ya podemos leer el hash.
        const hash = popup.location.hash;
        if (hash && hash.includes('access_token')) {
          const params = new URLSearchParams(hash.slice(1));
          window.clearInterval(timer);
          popup.close();
          if (params.get('state') !== state) {
            reject(new Error('Estado OAuth no coincide (posible manipulación).'));
            return;
          }
          const token = params.get('access_token');
          if (token) resolve(token);
          else reject(new Error(params.get('error') || 'No se recibió token de acceso.'));
        }
      } catch {
        /* cross-origin mientras el popup está en Google: esperar */
      }
    }, 400);

    // Salvaguarda: no esperar indefinidamente.
    window.setTimeout(() => {
      if (!popup.closed) {
        window.clearInterval(timer);
        reject(new Error('Tiempo de espera de autenticación agotado.'));
      }
    }, 120_000);
  });
}

/** Sube (crea) un archivo JSON en la carpeta appDataFolder del usuario. */
export async function driveUpload(
  accessToken: string,
  filename: string,
  content: string,
): Promise<DriveFile> {
  const metadata = { name: filename, parents: ['appDataFolder'], mimeType: 'application/json' };
  const boundary = 'djmix_' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`Subida a Drive falló (${res.status}): ${await res.text()}`);
  return (await res.json()) as DriveFile;
}

/** Lista los respaldos de DJMIX guardados en appDataFolder. */
export async function driveList(accessToken: string): Promise<DriveFile[]> {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('spaces', 'appDataFolder');
  url.searchParams.set('fields', 'files(id,name,modifiedTime)');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('pageSize', '20');
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`No se pudo listar Drive (${res.status}).`);
  const json = (await res.json()) as { files?: DriveFile[] };
  return json.files ?? [];
}

/** Descarga el contenido (texto JSON) de un archivo de Drive por su id. */
export async function driveDownload(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`No se pudo descargar de Drive (${res.status}).`);
  return res.text();
}
