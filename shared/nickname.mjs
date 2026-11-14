// Optional pseudonym only. Never infer from Google account identity.
export function validateNickname(value){
 if(value===undefined||value==='')return '';
 if(typeof value!=='string')throw Error('Invalid nickname');const nickname=value.trim();
 if([...nickname].length>16||!/^[-\p{L}\p{M} ]{1,32}$/u.test(nickname))throw Error('Use a short fictional nickname without digits or contact details');
 return nickname;
}
