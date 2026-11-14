import {DatabaseSync} from 'node:sqlite';
export function createD1(filename=':memory:'){
 const db=new DatabaseSync(filename);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 function prepare(sql,args=[]){
  const run=()=>{const statement=db.prepare(sql);if(statement.columns().length)return {success:true,results:statement.all(...args),meta:{changes:0}};const result=statement.run(...args);return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}}};
  return {bind(...values){return prepare(sql,values)},async first(column){const row=db.prepare(sql).get(...args);return column?row?.[column]:row||null},async all(){return {success:true,results:db.prepare(sql).all(...args)}},async run(){return run()},async raw(){return db.prepare(sql).all(...args).map(Object.values)},_batch:run};
 }
 return {prepare,async batch(statements){db.exec('BEGIN IMMEDIATE');try{const results=statements.map(statement=>statement._batch());db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}},async exec(sql){db.exec(sql);return {count:1}},close(){db.close()}};
}
