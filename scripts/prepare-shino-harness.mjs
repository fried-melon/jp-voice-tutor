import {mkdirSync,cpSync,writeFileSync} from 'node:fs';
mkdirSync('dist-avatar',{recursive:true});
cpSync('public/vendor','dist-avatar/vendor',{recursive:true});
for(const name of ['shino-adapter.mjs','shino-reference.json'])cpSync('public/'+name,'dist-avatar/'+name);
cpSync('public/avatar-shino.glb','dist-avatar/shino.glb');
cpSync('public/avatar.glb','dist-avatar/mpfb-ref.glb');
writeFileSync('dist-avatar/index.html','<html><head><script type="importmap">{"imports":{"three":"./vendor/three/three.module.js","three/addons/":"./vendor/three/jsm/"}}</script></head><body style="margin:0;background:#eee"><div id="head" style="width:100vw;height:100vh"></div></body></html>');
console.log('Local Shino harness prepared');
