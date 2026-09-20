export function readConfig(env=process.env) {
 const production=env.NODE_ENV==='production';
 if(production&&!env.MONGODB_URI)throw Error('MONGODB_URI is required in production.');
 const mongodbUri=env.MONGODB_URI||'mongodb://127.0.0.1:27017';
 if(!/^mongodb(?:\+srv)?:\/\//.test(mongodbUri))throw Error('MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string.');
 const port=Number(env.PORT||3000);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be between 1 and 65535.');
 let appOrigin='';
 if(env.APP_ORIGIN){const url=new URL(env.APP_ORIGIN);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('APP_ORIGIN must be an origin such as https://badrhis.example.com.');appOrigin=url.origin;}
 const setupToken=env.SETUP_TOKEN||'';
 if(production&&setupToken.length<32)throw Error('SETUP_TOKEN must contain at least 32 characters in production.');
 return {production,mongodbUri,database:env.MONGODB_DATABASE||'badr_his_local',port,host:env.HOST||(production?'0.0.0.0':'127.0.0.1'),appOrigin,setupToken};
}

export function originAllowed(origin,host,config) {
 if(!origin)return true;
 try {
  const url=new URL(origin);
  if(url.origin!==origin)return false;
  if(config.appOrigin)return origin===config.appOrigin;
  if(config.production)return url.protocol==='https:'&&url.host===host;
  return url.host===host&&['http:','https:'].includes(url.protocol)||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
 }catch{return false;}
}
