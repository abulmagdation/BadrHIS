import {promisify} from 'node:util';
import {randomBytes,createHash,timingSafeEqual,scrypt as scryptCallback} from 'node:crypto';

const scrypt=promisify(scryptCallback);
export const SESSION_COOKIE='badr_session';
const SESSION_HOURS=12;

export const cleanText=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
export const usernameKey=value=>cleanText(value,40).toLocaleLowerCase('en-US');
export function validateUsername(value){return /^[\p{L}\p{N}_.-]{3,40}$/u.test(cleanText(value,40));}
export function validatePassword(value){return typeof value==='string'&&value.length>=8&&value.length<=128;}

export async function hashPassword(password){
 const salt=randomBytes(16),derived=await scrypt(password,salt,64);
 return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password,stored){
 try{const [kind,saltHex,hashHex]=String(stored).split('$');if(kind!=='scrypt'||!saltHex||!hashHex)return false;const expected=Buffer.from(hashHex,'hex'),actual=Buffer.from(await scrypt(password,Buffer.from(saltHex,'hex'),expected.length));return expected.length===actual.length&&timingSafeEqual(expected,actual);}catch{return false;}
}

export const hashToken=token=>createHash('sha256').update(token).digest('hex');
export const publicUser=user=>user?{id:user._id,name:user.name,username:user.username,role:user.role,created_at:user.created_at,deleted_at:user.deleted_at||null}:null;
export const activeQuery={deleted_at:null};

export function readCookie(req,name){
 const cookies=String(req.headers.cookie||'').split(';');
 for(const cookie of cookies){const index=cookie.indexOf('=');if(index>0&&cookie.slice(0,index).trim()===name)return decodeURIComponent(cookie.slice(index+1).trim());}
 return '';
}

export async function createSession(db,user,req,res){
 const token=randomBytes(32).toString('base64url'),createdAt=new Date(),expiresAt=new Date(createdAt.getTime()+SESSION_HOURS*60*60*1000);
 await db.collection('sessions').insertOne({_id:hashToken(token),user_id:user._id,created_at:createdAt,expires_at:expiresAt,revoked_at:null,user_agent:cleanText(req.headers['user-agent'],250)});
 res.setHeader('Set-Cookie',`${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS*60*60}${req.app.locals.secureCookies?'; Secure':''}`);
}

export function expireSessionCookie(res){res.setHeader('Set-Cookie',`${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${res.app.locals.secureCookies?'; Secure':''}`);}
