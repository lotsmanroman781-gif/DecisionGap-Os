/**
 * Single-merchant persistent state with an optional transactional SQLite backend.
 * SQLite is the default when SQLITE_FILE is set (Render / Railway). JSON fallback
 * is intended for local development and unit tests only. Single replica only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { initialState } from './data.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const filepath = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : (process.env.VERCEL ? '/tmp/decisiongap-state.json' : path.resolve(here, '../.data/state.json'));
const sqlitePath = process.env.SQLITE_FILE ? path.resolve(process.env.SQLITE_FILE) : null;
let state;
let db;
function database() {
  if(!sqlitePath) return null;
  if(db)return db;
  fs.mkdirSync(path.dirname(sqlitePath),{recursive:true});
  db=new DatabaseSync(sqlitePath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, updated_at TEXT NOT NULL);');
  return db;
}
export function loadState() {
  if(state)return state;
  if(sqlitePath){
    const row=database().prepare('SELECT payload FROM app_state WHERE id = 1').get();
    state=row?JSON.parse(row.payload):initialState();
    if(!row)persist();
    return state;
  }
  fs.mkdirSync(path.dirname(filepath),{recursive:true});
  if(fs.existsSync(filepath)){
    try{state=JSON.parse(fs.readFileSync(filepath,'utf8'));}
    catch(e){throw new Error(`Persisted state at ${filepath} cannot be read. Restore your backup instead of resetting: ${e.message}`);}
  }else state=initialState();
  return state;
}
export function persist() {
  if(sqlitePath){
    database().prepare('INSERT INTO app_state(id,payload,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at')
      .run(JSON.stringify(state),new Date().toISOString());
    return;
  }
  fs.mkdirSync(path.dirname(filepath),{recursive:true});
  fs.writeFileSync(`${filepath}.tmp`,JSON.stringify(state));
  fs.renameSync(`${filepath}.tmp`,filepath);
}
export function updateState(mutator){
  // Keep existing single-process semantics; all mutations are synchronous.
  mutator(loadState());persist();return state;
}
export function resetState(){state=initialState();persist();return state;}
export function addEvent(event){updateState(s=>{s.events.push({...event,timestamp:new Date().toISOString(),seed:false});s.events=s.events.slice(-10000);});}
export function addDecision(decision){updateState(s=>{s.decisions.unshift({id:`decision-${Date.now()}-${Math.floor(Math.random()*999)}`,timestamp:new Date().toISOString(),seed:false,...decision});s.decisions=s.decisions.slice(0,75);});}
