// Exact HTTPS providers only. No arbitrary iframe, script or media origins.
export const stageContentPolicy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://w.soundcloud.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
export function embedSource(value){
  let url;try{url=new URL(String(value||''));}catch{return '';}
  if(url.protocol!=='https:'||url.username||url.password||url.port)return '';
  const host=url.hostname.toLowerCase(),path=url.pathname;
  let id;
  if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(host))id=path==='/watch'?url.searchParams.get('v'):path.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]+)\/?$/)?.[1];
  else if(host==='youtu.be')id=path.match(/^\/([A-Za-z0-9_-]+)\/?$/)?.[1];
  if(id&&/^[A-Za-z0-9_-]{11}$/.test(id))return 'https://www.youtube-nocookie.com/embed/'+id+'?enablejsapi=1';
  if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)){
    id=path.match(/^\/(?:video\/)?(\d+)\/?$/)?.[1];if(id)return 'https://player.vimeo.com/video/'+id;
  }
  if(host==='open.spotify.com'){
    const match=path.match(/^\/(?:embed\/)?(track|album|playlist|episode)\/([A-Za-z0-9]+)\/?$/);
    if(match)return 'https://open.spotify.com/embed/'+match[1]+'/'+match[2];
  }
  if(['soundcloud.com','www.soundcloud.com'].includes(host)&&/^\/[^/]+\/[^/]+\/?$/.test(path))return 'https://w.soundcloud.com/player/?url='+encodeURIComponent('https://soundcloud.com'+path);
  return '';
}
