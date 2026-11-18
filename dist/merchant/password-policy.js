/** Original-secret policy. This module never logs, stores or transmits a password. */
const COMMON = new Set([
 'password','password1','password12','password123','password1234','password12345','password123456',
 'password12345678','password2026','password2026!','password123!','password1234!',
 'qwerty','qwerty123','qwerty12345','qwertyuiop','qwertyuiop123','asdfghjkl','asdfghjkl123',
 '123456','12345678','123456789','1234567890','123456789012','0123456789','9876543210',
 'abcdefghij','abcdefghijk','abcdefghijklmnopqrstuvwxyz','letmein123','letmein12345',
 'welcome123','welcome1234','welcome12345','welcome2026','welcome2026!','iloveyou123',
 'changeme123','changeme1234','admin12345','administrator','administrator1','superadmin123',
 'passw0rd123','p@ssw0rd123','p@ssword123','p@ssword1234','p@ssword123!',
 'lumo123456','lumo12345678','lumopassword','lumopassword123','ghana123456','ghana123456789',
 'accra123456','university123','university1234','student1234','student12345','student123456',
]);
export function newPasswordError(value,{minLength=10,maxLength=128,maxBytes=Infinity,handle=''}={}) {
 if(typeof value!=='string'||value.length<minLength)return `Use at least ${minLength} characters for your login password.`;
 if(value.length>maxLength||new TextEncoder().encode(value).length>maxBytes)return `Keep your password within ${maxLength} characters${Number.isFinite(maxBytes)?' and '+maxBytes+' UTF-8 bytes':''}.`;
 if(!value.trim())return 'Choose a password with more than spaces.';
 const comparable=value.normalize('NFKC').toLowerCase(),compact=comparable.replace(/\s/g,'');
 // Block predictable secrets, not arbitrary composition: long passphrases work.
 const repeated=/^(.)\1{5,}$/u.test(compact)||/^(.{1,4})\1{2,}$/u.test(compact);
 const username=String(handle||'').trim().replace(/^@/,'').toLowerCase();
 const basedOnHandle=username.length>=3&&new RegExp('^'+username.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[0-9!@#$%^&*._-]*$').test(compact);
 if(repeated||COMMON.has(compact)||basedOnHandle)return 'Choose a less predictable password. Try a few unrelated words.';
 return '';
}
