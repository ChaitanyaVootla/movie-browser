yes | sudo apt update
yes | sudo apt install nginx
yes | sudo ufw allow 'Nginx HTTP'
yes | sudo ufw allow 22
yes | sudo ufw allow https
yes | sudo ufw enable
yes | sudo apt-get install unzip

# cert bot SSL
apt-get update
sudo apt-get install certbot
apt-get install python3-certbot-nginx

sudo certbot --nginx -d themoviebrowser.com -d www.themoviebrowser.com

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
