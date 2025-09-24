# Temporary Files

Currently these don't get cleaned automatically.

## Cache

This is for caching fetch requests so that we do not spam SoundCloud servers.
There's currently an issue where we cache the first page of likes which is a request that could change if you like something else, but I think that's OK for now.


-  first fix whatever cache nonsense is going on. I think there's a migration in process.

fetch thing https://api-v2.soundcloud.com/media/soundcloud:tracks:1411845244/25ad8522-128e-4ec6-b139-30630da70b59/stream/hls
   - decode request
- send to ffmpeg to download
