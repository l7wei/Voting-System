# NTHU OAuth Proxy

This is a lightweight FastAPI server that runs on a VM with a static IP to handle NTHU OAuth callbacks.

## Purpose

NTHU OAuth requires callbacks to a static IP address. Since Cloud Run uses dynamic IPs, we use this proxy server as a bridge:

```
NTHU OAuth → VM Proxy (Static IP) → Cloud Run API → Firestore
```

## Prerequisites

- Python 3.8+
- Static IP VM
- NTHU OAuth credentials
- Cloud Run endpoint URL

## Installation

### 1. Clone/Copy Files

```bash
sudo mkdir -p /opt/nthu-oauth-proxy
sudo chown $USER:$USER /opt/nthu-oauth-proxy
cd /opt/nthu-oauth-proxy

# Copy these files:
# - proxy.py
# - requirements.txt
# - .env.example
```

### 2. Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp .env.example .env
nano .env
```

Fill in your configuration:

```env
OAUTH_CLIENT_ID=your-nthu-client-id
OAUTH_CLIENT_SECRET=your-nthu-client-secret
OAUTH_TOKEN_URL=https://oauth.ccxp.nthu.edu.tw/v1.1/token.php
OAUTH_RESOURCE_URL=https://oauth.ccxp.nthu.edu.tw/v1.1/resource.php
CLOUD_RUN_API_URL=https://your-cloud-run-url.run.app
AUTH_HANDSHAKE_API_KEY=your-shared-secret-key
FRONTEND_URL=https://your-domain.com
PORT=8000
```

**Important**: The `AUTH_HANDSHAKE_API_KEY` must match the key configured in Cloud Run.

### 4. Test Locally

```bash
python proxy.py
```

Visit `http://localhost:8000` - you should see:
```json
{
  "status": "healthy",
  "service": "NTHU OAuth Proxy",
  "version": "1.0.0"
}
```

## Deployment

### Option 1: Systemd Service (Recommended)

1. Copy the service file:

```bash
sudo cp nthu-oauth-proxy.service /etc/systemd/system/
```

2. Edit the service file with your username:

```bash
sudo nano /etc/systemd/system/nthu-oauth-proxy.service
# Change "your-username" to your actual username
```

3. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable nthu-oauth-proxy
sudo systemctl start nthu-oauth-proxy
```

4. Check status:

```bash
sudo systemctl status nthu-oauth-proxy
```

### Option 2: Manual Start

```bash
source venv/bin/activate
uvicorn proxy:app --host 0.0.0.0 --port 8000
```

## Nginx Configuration (Optional but Recommended)

Install Nginx:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create Nginx config (`/etc/nginx/sites-available/nthu-oauth-proxy`):

```nginx
server {
    listen 80;
    server_name voting.nthusa.tw;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/nthu-oauth-proxy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Get SSL certificate:

```bash
sudo certbot --nginx -d voting.nthusa.tw
```

## Monitoring

### View Logs

```bash
# Systemd logs
sudo journalctl -u nthu-oauth-proxy -f

# Or with timestamps
sudo journalctl -u nthu-oauth-proxy -f --since today
```

### Check Health

```bash
curl http://localhost:8000/
```

Expected response:
```json
{
  "status": "healthy",
  "service": "NTHU OAuth Proxy",
  "version": "1.0.0"
}
```

## Troubleshooting

### Service Won't Start

```bash
# Check service status
sudo systemctl status nthu-oauth-proxy

# View detailed logs
sudo journalctl -u nthu-oauth-proxy -n 50 --no-pager
```

Common issues:
- Missing environment variables (check `.env`)
- Port already in use (change `PORT` in `.env`)
- Python virtual environment not activated (check service file path)

### OAuth Callback Not Working

1. Verify NTHU OAuth callback URL is set to `https://voting.nthusa.tw/callback`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify proxy is running: `curl http://localhost:8000/`
4. Test Cloud Run endpoint: `curl https://your-cloud-run-url.run.app/api/internal/auth-handshake`

### Auth Handshake Fails

1. Verify `AUTH_HANDSHAKE_API_KEY` matches in both `.env` and Cloud Run
2. Check Cloud Run logs for detailed errors
3. Verify timestamp synchronization: `date` (should be correct)

## Security Notes

- Keep `.env` file secure (contains secrets)
- Use HTTPS for all production traffic
- Regularly update dependencies: `pip install -U -r requirements.txt`
- Monitor logs for suspicious activity
- Rotate `AUTH_HANDSHAKE_API_KEY` periodically

## Maintenance

### Update Code

```bash
cd /opt/nthu-oauth-proxy
git pull  # if using git, or manually update proxy.py
sudo systemctl restart nthu-oauth-proxy
```

### Update Dependencies

```bash
cd /opt/nthu-oauth-proxy
source venv/bin/activate
pip install -U -r requirements.txt
sudo systemctl restart nthu-oauth-proxy
```

### Backup

Important files to backup:
- `.env` (contains secrets)
- `proxy.py` (if customized)

```bash
tar -czf nthu-oauth-proxy-backup-$(date +%Y%m%d).tar.gz \
    /opt/nthu-oauth-proxy/.env \
    /opt/nthu-oauth-proxy/proxy.py
```

## Architecture

The proxy server:
1. Receives OAuth callback from NTHU CCXP
2. Exchanges authorization code for access token
3. Fetches user data from NTHU resource endpoint
4. Forwards data to Cloud Run `/api/internal/auth-handshake`
5. Redirects user back to frontend with session token

This design keeps the proxy simple and stateless - all user management happens in Cloud Run and Firestore.
