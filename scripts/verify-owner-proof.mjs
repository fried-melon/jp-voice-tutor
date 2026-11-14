// Ephemeral read of the login callback, never stores or logs the ID token.
import{createRemoteJWKSet,jwtVerify}from'jose';
let input='';for await(const chunk of process.stdin)input+=chunk;
if(!input.trim()){console.error('Usage: pipe a Google login callback JSON into this script (manual owner-proof verification).');process.exit(2);}
const result=JSON.parse(input);const token=result.structured?.proof??JSON.parse(result.content).proof;
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const{payload}=await jwtVerify(token,keys,{algorithms:['RS256'],audience:'410292686280-79kcfl4b1bcvb9okkl2ptjmh77qksm5v.apps.googleusercontent.com',issuer:['https://accounts.google.com','accounts.google.com'],requiredClaims:['sub','aud','iss','exp','iat']});
if(payload.email!=='leejeongjin7178@gmail.com'||payload.email_verified!==true)throw Error('Intended account mismatch');
console.log(JSON.stringify({verified:true,sub:payload.sub,email:payload.email,issuer:payload.iss,audience:payload.aud,expiresAt:new Date(payload.exp*1000).toISOString()}));
