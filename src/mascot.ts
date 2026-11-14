/* Original geometric character. No external art/IP. Uses the CC0 test rig's
 * head transform and TalkingHead jaw/blink values, not its human appearance. */
export async function createMascot(head:any,getJaw?:()=>number) {
 const threeUrl='./vendor/three/three.module.js';const T=await import(/* @vite-ignore */ new URL(threeUrl,document.baseURI).href);
 head.armature.traverse((o:any)=>{if(o.isMesh)o.visible=false;});
 const group=new T.Group();group.name='OriginalKonbiniMascot';
 const mat=(color:string)=>new T.MeshStandardMaterial({color,roughness:.86});
 const cream=mat('#fff0ce'),green=mat('#426a58'),dark=mat('#243b35'),pink=mat('#df917c'),white=mat('#fffaf0');
 function ball(material:any,x:number,y:number,z:number,sx:number,sy:number,sz:number){const m=new T.Mesh(new T.SphereGeometry(1,32,24),material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);group.add(m);return m;}
 // Rounded tanuki-inspired shop companion, not a franchise character.
 ball(green,0,-.17,0,.20,.22,.13);
 ball(white,0,-.17,.115,.11,.14,.018);
 ball(cream,0,.075,0,.205,.185,.16);
 ball(green,-.154,.21,0,.065,.075,.055);ball(green,.154,.21,0,.065,.075,.055);
 ball(pink,-.154,.216,.043,.034,.04,.015);ball(pink,.154,.216,.043,.034,.04,.015);
 ball(green,-.085,.085,.135,.060,.070,.026);ball(green,.085,.085,.135,.060,.070,.026);
 const eyes=[ball(dark,-.077,.097,.161,.017,.026,.009),ball(dark,.077,.097,.161,.017,.026,.009)];
 ball(white,-.082,.107,.17,.005,.007,.003);ball(white,.072,.107,.17,.005,.007,.003);
 ball(pink,-.13,.025,.139,.028,.014,.006);ball(pink,.13,.025,.139,.028,.014,.006);
 ball(cream,0,.018,.15,.072,.045,.024);ball(dark,0,.031,.179,.018,.012,.008);
 const mouth=ball(dark,0,-.002,.176,.024,.006,.008);
 ball(green,-.20,-.15,0,.055,.13,.055);ball(green,.20,-.15,0,.055,.13,.055);
 ball(pink,.055,-.12,.137,.025,.025,.006);
 const headBone=head.armature.getObjectByName('Head');headBone.add(group);
 group.position.set(0,.02,.01);
 return ()=>{const jaw=Math.max(0,getJaw?getJaw():(head.mtAvatar?.jawOpen?.value||0));mouth.scale.y=.006+jaw*.055;mouth.position.y=-.002-jaw*.018;const blink=Math.max(head.mtAvatar?.eyeBlinkLeft?.value||0,head.mtAvatar?.eyeBlinkRight?.value||0);for(const eye of eyes)eye.scale.y=Math.max(.002,.026*(1-blink));};
}
