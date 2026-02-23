# Upload statuto 10MB (FastAPI + Nginx)

## Diagnosi (Feb 23, 2026)

Il `413` sul path `POST /api/org-admin/organization/statute` e' generato dal reverse proxy Nginx prima di FastAPI.

Evidenza (probe live):

- `curl -I https://assonam.it/api/org-admin/organization/statute` -> header `Server: nginx/1.24.0 (Ubuntu)`
- `POST` multipart con file ~2 MB -> `413 Request Entity Too Large` (HTML Nginx)
- `POST` multipart con file ~100 KB -> `401 Unauthorized` JSON (richiesta arriva a FastAPI senza sessione)

Nel repo non e' presente il file di configurazione Nginx/Caddy/Traefik usato in produzione, quindi il fix proxy va applicato sul server.
E' incluso uno snippet pronto da adattare: `ops/nginx/assonam-upload-limit.conf.example`.

## Target

- Limite applicativo file statuto: `10 MB` (hard limit FastAPI)
- Limite proxy request body: `12M` (margine per multipart overhead)

## Nginx (produzione)

Applicare nel `server` block di `assonam.it` (o nella `location` che proxy-passa `/api`):

```nginx
server {
    server_name assonam.it www.assonam.it;

    client_max_body_size 12M;
    client_body_buffer_size 128k;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_request_buffering off;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Note:

- `client_max_body_size 12M` risolve il `413` proxy mantenendo un limite stretto.
- `proxy_request_buffering off` e' opzionale ma utile per upload.
- Se hai piu' `server` block/vhost, metti la direttiva nel vhost corretto (o in `http {}` se vuoi applicarla globalmente).

## Reload / verifica

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Oppure (container):

```bash
docker exec <nginx-container> nginx -t
docker exec <nginx-container> nginx -s reload
```

Verifica rapida:

```bash
curl -I https://assonam.it/api/org-admin/organization/statute
curl -s -o /dev/null -D - -X POST -F "file=@probe_2mb.pdf;type=application/pdf" https://assonam.it/api/org-admin/organization/statute
```

Atteso dopo fix proxy:

- file piccolo senza sessione -> `401` JSON (backend raggiunto)
- file >10 MB autenticato -> `413` JSON FastAPI con dettaglio `File troppo grande. Max 10 MB.`

## Cloudflare (se presente)

Cloudflare puo' imporre limiti upload dipendenti dal piano. Per questo use-case (10 MB) in genere non e' il collo di bottiglia, ma va comunque verificato se il traffico passa da Cloudflare.

Se Cloudflare blocca:

- aumentare il limite lato piano/proxy dove disponibile
- escludere il path upload da Cloudflare (DNS-only) se compatibile
- valutare upload diretto su storage (signed URL) per file piu' grandi in futuro
