// Placeholder for resource/secret provisioning, not the production application.
export default {
  fetch() {
    return Response.json({error:'Production migration not activated.'}, {
      status:503,headers:{'Cache-Control':'no-store'}
    });
  }
};
