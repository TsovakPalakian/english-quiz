(() => {
  'use strict';
  // D1 is the only database; the media store keeps the name of the last live epoch so local files survive.
  const current='d1:3',ready=Promise.resolve(current);
  window.DatabaseContext={ready,confirmed:true,mediaDatabase:'enquiz-media:'+current,check:()=>ready};
})();
