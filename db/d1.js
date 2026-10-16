import {BaseAdapter} from './base.js';
import {DatabaseError} from './errors.js';

export class D1Adapter extends BaseAdapter{
  constructor(env,options={}){
    super('d1',options);
    if(typeof env?.DB?.prepare!=='function'||typeof env.DB.batch!=='function')throw new DatabaseError('DB_CONFIG','D1 requires a database binding.',{status:500});
    this.binding=options.createD1?options.createD1(env.DB):env.DB;
  }
  statement(command){const query=this.binding.prepare(command.sql);return command.args.length?query.bind(...command.args):query;}
  result(result){if(!result?.success)throw new Error('D1 operation failed');return {rows:(result.results||[]).map(row=>Object.fromEntries(Object.entries(row))),rowsAffected:result.meta?.changes||0};}
  async _query(command){return (await this._batch([command],{write:false}))[0];}
  async _execute(command){return (await this._batch([command],{write:true}))[0];}
  async _batch(commands){const results=await this.binding.batch(commands.map(c=>this.statement(c)));return results.map((r,i)=>commands[i].operation==='query'?this.result(r).rows:this.result(r));}
  _close(){}
}
