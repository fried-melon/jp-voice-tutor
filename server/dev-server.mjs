// Binds loopback only. This is NOT a deployed production backend.
import{createServer}from'node:http';import{createTokenService}from'./token-service.mjs';
const service=createTokenService({apiKey:process.env.GEMINI_API_KEY,clientId:process.env.GOOGLE_CLIENT_ID,ownerSubject:process.env.OWNER_GOOGLE_SUB,allowedOrigin:process.env.APP_ORIGIN,privacyConfirmed:process.env.API_PRIVACY_CONFIRMED==='yes'});
const server=createServer(async(req,res)=>{
 let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2048){res.writeHead(413);res.end();return;}chunks.push(chunk);}
 if(req.url!=='/api/live-token'){res.writeHead(404);res.end();return;}
 let body;if(req.method!=='OPTIONS')try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{res.writeHead(400);res.end();return;}
 const response=await service({method:req.method,origin:req.headers.origin,authorization:req.headers.authorization,body,requestMethod:req.headers['access-control-request-method'],requestHeaders:req.headers['access-control-request-headers']});res.writeHead(response.status,response.headers);res.end(response.body);
});server.requestTimeout=15000;server.headersTimeout=10000;server.listen(4318,'127.0.0.1');
