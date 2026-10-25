import test from 'node:test';

// Advance the same virtual duration and execute every timer/frame. Unlike
// fastForward this never skips callbacks; boundaries only expose progress.
export async function* clockSubtests(clock,milliseconds,label='Animation',slice=4000){
  if(!Number.isSafeInteger(milliseconds)||milliseconds<0||!Number.isSafeInteger(slice)||slice<1)throw new TypeError('Invalid virtual clock duration.');
  for(let elapsed=0;elapsed<milliseconds;){
    const next=Math.min(milliseconds,elapsed+slice);
    yield `${label}: ${elapsed}–${next} virtual ms`;
    await clock.runFor(next-elapsed);elapsed=next;
  }
}

// Yield the next phase name before its code. One generator retains lexical state,
// browser fixtures and assertion order; stopping it always runs the original finally.
export async function scenarioSubtests(name,createScenario){
  return test(name,context=>scenarioSteps(context,createScenario));
}

export async function scenarioSteps(context,createScenario){
    const scenario=createScenario();
    try{
      let phase=await scenario.next();
      while(!phase.done){
        let next,failed=false;
        const name=String(phase.value),started=performance.now();
        await context.test(name,async()=>{
          try{next=await scenario.next();}
          catch(error){failed=true;throw error;}
        });
        process.stdout.write('@@CHECK_PHASE@@'+JSON.stringify({name,milliseconds:Math.round(performance.now()-started),failed})+'\n');
        if(failed)return; // Dependent phases cannot pass after a broken prerequisite.
        phase=next;
      }
    }finally{await scenario.return();}
}
