# SCARchive

![](./misc/icon.png)

🎵 *Structured archival of SoundCloud likes and reposts.*

## Archival Structure

```ts
{config.OUTPUT}/
   likes.json
   reposts.json
   playlists.json

   playlists/
      {playlist.id}/
         playlist.json
         artwork.jpg
   tracks/
      {track.id}/
         track.json
         artwork.jpg
         {preset}.aac
   users/
      {user.permalink}/
         user.json
         avatar.jpg
tmp/
   cache/                                    Cached network requests
   download/                                 ffmpeg streams to this directory
   js/                                       JavaScript output files
```
