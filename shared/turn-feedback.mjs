// Turn result markers the tutor prompt puts at the start of a feedback turn.
// Display signals only — never scores, grades, or mastery judgments.
export const MARKER_PASS='【통과】';
export const MARKER_CORRECTION='【교정】';
export const MARKER_UNCLEAR='【못들음】';

export function parseTurnMarker(text){
 if(typeof text!=='string')return{marker:null,rest:''};
 const t=text.trimStart();
 if(t.startsWith(MARKER_PASS))return{marker:'pass',rest:t.slice(MARKER_PASS.length).trimStart()};
 if(t.startsWith(MARKER_CORRECTION))return{marker:'correction',rest:t.slice(MARKER_CORRECTION.length).trimStart()};
 if(t.startsWith(MARKER_UNCLEAR))return{marker:'unclear',rest:t.slice(MARKER_UNCLEAR.length).trimStart()};
 return{marker:null,rest:text};
}

// For matching only: drop whitespace and sentence punctuation.
export function normalizeJa(s){return String(s??'').replace(/[\s。、！？!?.,・「」『』]/g,'');}

// Char-level diff over whitespace-stripped strings (Japanese has no spaces;
// punctuation stays visible so the comparison reads naturally).
// Returns aligned segment lists: {learner:[{text,same}], target:[{text,same}]}.
export function diffChars(learnerRaw,targetRaw){
 const a=String(learnerRaw??'').replace(/\s+/g,'');
 const b=String(targetRaw??'').replace(/\s+/g,'');
 const n=a.length,m=b.length;
 const dp=Array.from({length:n+1},()=>new Array(m+1).fill(0));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 const la=[],ta=[];
 let i=0,j=0;
 while(i<n&&j<m){
  if(a[i]===b[j]){la.push({text:a[i],same:true});ta.push({text:b[j],same:true});i++;j++;}
  else if(dp[i+1][j]>=dp[i][j+1]){la.push({text:a[i],same:false});i++;}
  else{ta.push({text:b[j],same:false});j++;}
 }
 while(i<n){la.push({text:a[i++],same:false});}
 while(j<m){ta.push({text:b[j++],same:false});}
 return{learner:merge(la),target:merge(ta)};
}
function merge(segs){
 const out=[];
 for(const s of segs){const last=out[out.length-1];if(last&&last.same===s.same)last.text+=s.text;else out.push({...s});}
 return out;
}
