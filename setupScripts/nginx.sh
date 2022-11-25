sudo apt update
sudo apt install nginx
sudo ufw allow 'Nginx HTTP'
sudo ufw allow 3000
sudo ufw allow https
sudo ufw enable

# puppeteer dependencies
sudo apt update && sudo apt install -y gconf-service libgbm-dev libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget

# cert bot SSL
apt-get update
sudo apt-get install certbot
apt-get install python3-certbot-nginx

sudo certbot --nginx -d themoviebrowser.com -d www.themoviebrowser.com
sudo certbot --nginx -d vootlachaitanya.com -d www.vootlachaitanya.com

# Nginx config
map $sent_http_content_type $expires {
    default                    off;
    text/html                  7d;
    text/css                   7d;
    application/javascript     7d;
    ~image/                    max;
    ~font/                     max;
}

server {
    listen 80;
    server_name  themoviebrowser.com  www.themoviebrowser.com;
    expires $expires;
    location / {
        root     /movie-browser/dist;
        index    index.html index.htm;
        include  /etc/nginx/mime.types;
        try_files $uri $uri/ /index.html;
    }
    location /node/ {
        rewrite ^/node^/ /$1 break;
        proxy_pass http://localhost:3000/;
    }

    listen [::]:443 ssl http2 ipv6only=on; # managed by Certbot
    listen 443 ssl http2; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/themoviebrowser.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/themoviebrowser.com/privkey.pem; # managed by Certbot
    #include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_ciphers EECDH+CHACHA20:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}
