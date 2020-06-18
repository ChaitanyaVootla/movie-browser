# movie-browser

Live link: http://139.59.94.40

## Setup steps:

Add a `.env` file to the project root with your TMDB API KEY
and the URL for the server (ignore if running on localhost)
```
VUE_APP_API_KEY=<YOUR TMDB API KEY HERE>
VUE_APP_SERVER_URL=<SERVER URL HERE - IGNORE IF RUNNING ON LOCALHOST>
```
##### linux terminal / mac terminal / windows powershell
 For server:
  - `cd /server && node ./server.js` 
 
For Webapp:
 - `npm install`
 - `npm run serve`