import {openDatabase} from '../server/db.js';
import {createApp} from '../server/app.js';
import {createServer} from 'vite';
const connection=await openDatabase('badr_his_test_preview');
await connection.db.collection('departments').updateOne({_id:1},{$setOnInsert:{name:'قسم تجريبي',english:'Test Ward',capacity:10}},{upsert:true});
await connection.db.collection('counters').updateOne({_id:'departments'},{$max:{value:1}},{upsert:true});
const app=createApp(connection.db),vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'spa'});app.use(vite.middlewares);
const server=app.listen(3001,'127.0.0.1',()=>console.log('Isolated QA: http://127.0.0.1:3001'));
process.on('SIGINT',async()=>{server.close();await vite.close();await connection.close();process.exit(0);});
