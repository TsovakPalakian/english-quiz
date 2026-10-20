// Complete authored examples for editor round-trip tests, never production seed data.
export const reviewSamples={
  Flip:[{front:'drizzle',back:'изморось'}],
  Choice:[{prompt:'What is drizzle?',options:['snow','light rain','fog'],answer:1},{prompt:'Choose the meaning of drizzle.',options:['light rain','a storm'],answer:0}],
  Type:[{prompt:'изморось',answer:'drizzle'},{prompt:'буря',answer:'storm'}],
  Gap:[{shown:'A fine ____ started falling.',answer:'drizzle',hint:'Light rain'}],
  Build:[{parts:'falling drizzle A started',answer:'A drizzle started falling'}],
  Match:[{left:'drizzle',right:'изморось'},{left:'storm',right:'буря'}],
  'True / false':[{prompt:'Drizzle is heavy rain.',answer:'false'}],
  Tap:[{text:'A drizzle started falling.',answer:'drizzle'}],
  'Select all':[{prompt:'Select weather words.',options:['drizzle','rain','spoon'],answers:[0,1]}],
  Reverse:[{front:'изморось',back:'drizzle',options:['storm','drizzle'],answer:1}],
  Spell:[{word:'drizzle',hint:'Light rain'}],Letters:[{word:'drizzle',hint:'Light rain'}],
  Listen:[{prompt:'Listen and choose.',word:'drizzle',options:['heavy rain','light rain'],answer:1}],
  Definition:[{prompt:'Light rain in very small drops.',word:'drizzle',options:['drizzle','hail'],answer:0}],
  'Odd one out':[{prompt:'Which word is not weather?',options:['rain','drizzle','spoon'],answer:2}],
  Memory:[{left:'drizzle',right:'изморось'},{left:'storm',right:'буря'}],
  Hangman:[{word:'drizzle',hint:'Light rain'}],
};
