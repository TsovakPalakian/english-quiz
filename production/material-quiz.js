(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const types=['Choice','Select all','True / false','Type','Gap','Build','Match','Listen','Spell','Memory','Tap','Reverse','Letters','Definition','Odd one out','Hangman','Flip'];
  const blank=kind=>kind==='Flip'||kind==='Reverse'?{front:'',back:''}:['Match','Memory'].includes(kind)?{left:'',right:''}:['Choice','Select all','Odd one out'].includes(kind)?{prompt:'',options:['',''],answer:0,...(kind==='Select all'?{answers:[]}:{})}:kind==='True / false'?{prompt:'',answer:'true'}:kind==='Gap'?{shown:'',answer:''}:kind==='Build'?{parts:'',answer:''}:['Spell','Letters','Hangman'].includes(kind)?{word:'',prompt:''}:kind==='Tap'?{text:'',answer:''}:{prompt:'',answer:''};
  function read(value,fallback){try{return JSON.parse(value)||fallback;}catch{return fallback;}}
  const selected=value=>Array.isArray(value)?value:read(value,[]);
  function hangman(item,value){const letters=selected(value),word=String(item.word||'').toLowerCase(),misses=letters.filter(letter=>!word.includes(letter)).length,mask=[...word].map(letter=>/^[a-z]$/.test(letter)&&!letters.includes(letter)?'_':letter).join(' ');return {letters,word,misses,mask,done:misses>=6||![...word].some(letter=>/^[a-z]$/.test(letter)&&!letters.includes(letter))};}
  function render(block,options={}){
    const kind=block.quizType||'Choice',values=options.values||{},lock=options.locked?' disabled':'';
    const head=(index,prompt)=>'<div class="material-question-head"><b>'+esc(prompt)+'</b>'+(options.score?.(index)||'')+'</div>';
    const field=(index,value,extra='')=>'<input type="text" data-mq-input="'+index+'" value="'+esc(value)+'"'+lock+' '+extra+'>';
    let body;
    if(kind==='Memory'){
      const faces=block.memoryFaces||window.MaterialScoring.memoryDeck(block),log=read(values[0],{turns:[]}),pairs=new Map(faces.map(face=>[face.id,face.pair])),done=new Set();
      for(const turn of log.turns||[])if(pairs.get(turn[0])===pairs.get(turn[1]))done.add(pairs.get(turn[0]));
      body=head(0,block.title||'Memory')+'<div class="material-memory">'+faces.map(face=>'<button type="button" data-mq-face="'+esc(face.id)+'" class="'+(done.has(face.pair)?'is-matched':'')+'"'+(options.locked||done.has(face.pair)?' disabled':'')+' aria-label="'+(done.has(face.pair)?esc(face.text):'Turn card')+'">'+(done.has(face.pair)?esc(face.text):'?')+'</button>').join('')+'</div>';
    }else if(kind==='Match'){
      const rights=block.answerOptions||[...new Set((block.items||[]).map(item=>item.right||''))],given=read(values[0],{});
      body=head(0,block.title||'Match')+(block.items||[]).map((item,index)=>'<label>'+esc(item.left)+'<select data-mq-match="'+index+'"'+lock+'><option value="">Choose</option>'+rights.map(right=>'<option value="'+esc(right)+'"'+(given[index]===right?' selected':'')+'>'+esc(right)+'</option>').join('')+'</select></label>').join('');
    }else body=(block.items||[]).map((item,index)=>{
      const given=values[index]??'',prompt=item.prompt||item.front||item.shown||item.text||(['Spell'].includes(kind)?item.word:'')||kind;
      let answer;
      if(kind==='Flip')answer='<button class="lm-btn" type="button" data-mq-flip="'+index+'">'+esc(item.front)+'</button><div data-mq-back="'+index+'" hidden>'+esc(item.back)+'</div>';
      else if(['Choice','Odd one out','Select all','True / false'].includes(kind)){
        const choices=kind==='True / false'?['True','False']:item.options||[],multiple=kind==='Select all';
        answer=choices.map((value,oi)=>{const option=kind==='True / false'?String(oi===0):oi,checked=multiple?selected(given).includes(oi):String(given)===String(option);return '<label><input type="'+(multiple?'checkbox':'radio')+'" name="mq-'+esc(block.id)+'-'+index+'" data-mq-choice="'+index+'" value="'+esc(option)+'"'+(checked?' checked':'')+lock+'> '+esc(value)+'</label>';}).join('');
      }else if(kind==='Tap')answer='<div class="material-tokens">'+String(item.text||'').split(/\s+/).map(word=>'<button class="lm-btn" type="button" data-mq-tap="'+index+'" data-word="'+esc(word)+'"'+lock+'>'+esc(word)+'</button>').join('')+'</div>'+field(index,given,'readonly');
      else if(kind==='Hangman'&&!options.exam){const game=hangman(item,given);answer='<p class="material-token-answer" data-mq-mask="'+index+'">'+esc(game.mask)+'</p><div class="material-tokens">'+'abcdefghijklmnopqrstuvwxyz'.split('').map(letter=>'<button class="lm-btn" type="button" data-mq-hangman="'+index+'" data-word="'+letter+'"'+(options.locked||game.done||game.letters.includes(letter)?' disabled':'')+'>'+letter+'</button>').join('')+'</div><p data-mq-misses="'+index+'">'+game.misses+' / 6</p>';}
      else if(['Build','Letters','Hangman'].includes(kind)){
        const tokens=kind==='Build'?String(item.parts||'').split(/\s+/):kind==='Letters'?(item.letterOptions||String(item.word||'').split('').sort()):'abcdefghijklmnopqrstuvwxyz'.split('');
        answer='<div class="material-tokens">'+tokens.filter(Boolean).map((word,oi)=>'<button class="lm-btn" type="button" data-mq-token="'+index+'" data-token-index="'+oi+'" data-word="'+esc(word)+'"'+lock+'>'+esc(word)+'</button>').join('')+'</div>'+field(index,given,'readonly')+'<button class="lm-icon" type="button" data-mq-undo="'+index+'" aria-label="Undo" title="Undo"'+lock+'><i data-lucide="undo-2"></i></button>';
      }else answer=(kind==='Listen'?'<button class="lm-icon" type="button" data-mq-speak="'+index+'" aria-label="Listen" title="Listen"><i data-lucide="volume-2"></i></button>':'')+field(index,given)+(kind==='Spell'?(options.voice?.(index)||''):'');
      return '<div class="material-question" data-mq-question="'+index+'">'+head(index,kind==='Listen'?'Listen':prompt)+answer+(options.feedback?.(index)||'')+'</div>';
    }).join('');
    return '<div class="material-quiz" data-mq="'+esc(block.id)+'" data-mq-kind="'+esc(kind)+'">'+body+(!options.exam&&kind!=='Flip'&&kind!=='Memory'?'<button class="lm-btn" type="button" data-mq-check>Check</button><p data-mq-result role="status"></p>':'')+'</div>';
  }
  const bindings=new WeakMap();
  function bind(root,context){
    if(bindings.has(root)){bindings.set(root,context);return;}bindings.set(root,context);
    const update=(node,block,index,value)=>{const ctx=bindings.get(root);if(ctx.locked?.())return;ctx.set(block,index,value);};
    root.addEventListener('change',event=>{
      const widget=event.target.closest('[data-mq]');if(!widget)return;const ctx=bindings.get(root),block=ctx.block(widget.dataset.mq);if(!block||ctx.locked?.())return;
      const field=event.target;
      if(field.hasAttribute('data-mq-match')){const value=read(ctx.get(block,0),{});value[field.dataset.mqMatch]=field.value;update(widget,block,0,JSON.stringify(value));}
      if(field.hasAttribute('data-mq-choice')){const index=Number(field.dataset.mqChoice)+Number(widget.dataset.mqOffset||0),kind=widget.dataset.mqKind,value=kind==='Select all'?[...field.closest('[data-mq-question]').querySelectorAll('input:checked')].map(input=>Number(input.value)):kind==='True / false'?field.value:Number(field.value);update(widget,block,index,value);}
    });
    root.addEventListener('input',event=>{const field=event.target.closest('[data-mq-input]'),widget=field?.closest('[data-mq]');if(!widget)return;const ctx=bindings.get(root),block=ctx.block(widget.dataset.mq);if(block)update(widget,block,Number(field.dataset.mqInput)+Number(widget.dataset.mqOffset||0),field.value);});
    root.addEventListener('click',event=>{
      const button=event.target.closest('button'),widget=button?.closest('[data-mq]');if(!widget)return;const ctx=bindings.get(root),block=ctx.block(widget.dataset.mq);if(!block)return;
      if(button.hasAttribute('data-mq-speak')){speechSynthesis.cancel();const voice=new SpeechSynthesisUtterance(block.items[button.dataset.mqSpeak].prompt||'');voice.lang='en-US';speechSynthesis.speak(voice);return;}
      if(ctx.locked?.())return;
      if(button.hasAttribute('data-mq-flip')){const back=widget.querySelector('[data-mq-back="'+button.dataset.mqFlip+'"]');back.hidden=!back.hidden;return;}
      if(button.hasAttribute('data-mq-hangman')){const index=Number(button.dataset.mqHangman),game=hangman(block.items[index],ctx.get(block,index));if(game.done||game.letters.includes(button.dataset.word))return;game.letters.push(button.dataset.word);const value=JSON.stringify(game.letters),next=hangman(block.items[index],value);update(widget,block,index,value);widget.querySelector('[data-mq-mask="'+index+'"]').textContent=next.mask;widget.querySelector('[data-mq-misses="'+index+'"]').textContent=next.misses+' / 6';widget.querySelectorAll('[data-mq-hangman="'+index+'"]').forEach(node=>node.disabled=next.done||next.letters.includes(node.dataset.word));return;}
      if(button.hasAttribute('data-mq-token')||button.hasAttribute('data-mq-tap')||button.hasAttribute('data-mq-undo')){
        const index=Number(button.dataset.mqToken??button.dataset.mqTap??button.dataset.mqUndo),field=widget.querySelector('[data-mq-input="'+index+'"]');
        const value=button.hasAttribute('data-mq-tap')?button.dataset.word:button.hasAttribute('data-mq-undo')?(block.quizType==='Build'?field.value.trim().split(/\s+/).slice(0,-1).join(' '):field.value.slice(0,-1)):field.value+(block.quizType==='Build'&&field.value?' ':'')+button.dataset.word;
        field.value=value;update(widget,block,index,value);return;
      }
      if(button.hasAttribute('data-mq-face')){
        if(widget._pending||button.classList.contains('is-open'))return;
        const faces=block.memoryFaces||window.MaterialScoring.memoryDeck(block),face=faces.find(item=>item.id===button.dataset.mqFace);if(!face)return;
        button.textContent=face.text;button.classList.add('is-open');
        if(!widget._first){widget._first=face;return;}
        const first=widget._first;widget._first=null;widget._pending=true;const log=read(ctx.get(block,0),{turns:[]});log.turns.push([first.id,face.id]);update(widget,block,0,JSON.stringify(log));
        setTimeout(()=>{if(!widget.isConnected)return;for(const item of faces){const tile=widget.querySelector('[data-mq-face="'+item.id+'"]');if(!tile)continue;if(item.pair===face.pair&&first.pair===face.pair){tile.disabled=true;tile.classList.add('is-matched');}else if(tile.classList.contains('is-open'))tile.textContent='?';tile.classList.remove('is-open');}widget._pending=false;},650);return;
      }
      if(button.hasAttribute('data-mq-check')){
        const norm=value=>String(value??'').trim().toLowerCase(),items=block.items||[];
        let correct=0;
        items.forEach((item,index)=>{const value=ctx.get(block,index),kind=block.quizType||'Choice';let ok;
          if(kind==='Match')ok=norm(read(ctx.get(block,0),{})[index])===norm(item.right);
          else if(kind==='Hangman'){const game=hangman(item,value);ok=game.done&&game.misses<6;}
          else if(kind==='Select all')ok=JSON.stringify([...selected(value)].sort((a,b)=>a-b))===JSON.stringify([...(item.answers||[])].sort((a,b)=>a-b));
          else ok=norm(value)===norm(item.answer??item.back??item.word);
          if(ok)correct++;
        });widget.querySelector('[data-mq-result]').textContent=correct+' / '+items.length;ctx.check?.(block);
      }
    });
    window.lucide?.createIcons();
  }
  window.MaterialQuiz={types,blank,render,bind};
})();
