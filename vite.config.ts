import{defineConfig,loadEnv}from'vite';
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'VITE_');let tokenOrigin='';
 if(env.VITE_OWNER_TOKEN_SERVICE_ENABLED==='true'){
  if(!env.VITE_OWNER_TOKEN_ENDPOINT)throw Error('Flagged token service needs an explicit endpoint');const url=new URL(env.VITE_OWNER_TOKEN_ENDPOINT);
  if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Invalid token service endpoint');tokenOrigin=url.origin;
 }
 return{server:{allowedHosts:true},base:'./',build:{target:'es2022'},plugins:[{name:'reviewed-token-csp',transformIndexHtml(html){if(tokenOrigin)html=html.replace("connect-src 'self' blob:",`connect-src 'self' blob: ${tokenOrigin}`);if(env.VITE_GOOGLE_CLIENT_ID){html=html.replace("script-src 'self'","script-src 'self' https://accounts.google.com/gsi/client").replace("connect-src 'self'","connect-src 'self' https://accounts.google.com/gsi/").replace("style-src 'self'","frame-src https://accounts.google.com/gsi/; style-src 'self' https://accounts.google.com/gsi/style").replace('content="no-referrer"','content="strict-origin-when-cross-origin"');}return html;}}]};
});
