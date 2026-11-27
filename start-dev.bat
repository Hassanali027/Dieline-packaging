@echo off
set "PATH=C:\php83;%PATH%"
npx concurrently -c "#93c5fd,#c4b5fd,#fdba74" "php artisan serve" "php artisan queue:listen --tries=1" "npm.cmd run dev" --names=server,queue,vite
