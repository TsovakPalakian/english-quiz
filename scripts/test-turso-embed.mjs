import test from 'node:test';
import assert from 'node:assert/strict';
import {embedSource,stageContentPolicy} from '../src/turso-embed.mjs';
test('R5 embeds recognize exact HTTPS hosts and discard unrelated URL parameters',()=>{
  const id='abcdefghijk';
  assert.equal(embedSource('https://youtu.be/'+id+'?secret=ignored'),'https://www.youtube-nocookie.com/embed/'+id+'?enablejsapi=1');
  assert.equal(embedSource('https://www.youtube.com/watch?v='+id),'https://www.youtube-nocookie.com/embed/'+id+'?enablejsapi=1');
  assert.equal(embedSource('https://vimeo.com/123456'),'https://player.vimeo.com/video/123456');
  assert.equal(embedSource('https://open.spotify.com/track/ABC123?si=ignored'),'https://open.spotify.com/embed/track/ABC123');
  assert.match(embedSource('https://soundcloud.com/artist/song'),/^https:\/\/w.soundcloud.com\/player\/\?url=/);
  for(const url of ['http://youtu.be/'+id,'https://evil.test/youtube.com/watch?v='+id,'https://youtube.com.evil.test/watch?v='+id,'https://x@youtUbe.com/watch?v='+id,'https://youtu.be:444/'+id,'javascript:alert(1)','https://youtu.be/notvalid','https://localhost/media.mp3'])assert.equal(embedSource(url),'');
  assert.match(stageContentPolicy,/script-src 'self';/);assert.match(stageContentPolicy,/frame-src 'self' https:\/\/www.youtube-nocookie.com/);assert.ok(!stageContentPolicy.includes('*'));
});
