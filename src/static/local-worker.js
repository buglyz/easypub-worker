"use strict";(()=>{var pe=Object.defineProperty;var ge=(e,t,n)=>t in e?pe(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n;var it=(e,t,n)=>ge(e,typeof t!="symbol"?t+"":t,n);function vt(e,t){if(e.length<t.length)return!1;for(let n=0;n<t.length;n++)if(e[n]!==t[n])return!1;return!0}function Ft(e){try{return new TextDecoder("utf-8",{fatal:!0,ignoreBOM:!1}).decode(e)}catch{return null}}function ve(e,t){if(e.length<=65536)return!0;let n=e.subarray(0,65536);try{return!new TextDecoder(t,{fatal:!0,ignoreBOM:!1}).decode(n,{stream:!0}).includes("\uFFFD")}catch{try{return!new TextDecoder(t,{fatal:!1,ignoreBOM:!1}).decode(n,{stream:!0}).includes("\uFFFD")}catch{return!1}}}function mt(e,t){if(!ve(e,t))return null;let n={fatal:!0,ignoreBOM:!1};try{let i=new TextDecoder(t,n).decode(e);return i.includes("\uFFFD")?null:i}catch{try{let i=new TextDecoder(t,{fatal:!1,ignoreBOM:!1}).decode(e);return i.includes("\uFFFD")?null:i}catch{return null}}}function It(e){let t=[["gbk","GBK"],["gb18030","GB18030"],["big5","Big5"]];for(let[n,r]of t){let i=mt(e,n);if(i!=null)return{text:i,enc:r}}return null}function dt(e){if(vt(e,[255,254])){let r=mt(e.subarray(2),"utf-16le");if(r==null)throw new Error("UTF-16LE \u89E3\u7801\u5931\u8D25");return{text:r,encoding:"UTF-16LE"}}if(vt(e,[254,255])){let r=mt(e.subarray(2),"utf-16be");if(r==null)throw new Error("UTF-16BE \u89E3\u7801\u5931\u8D25");return{text:r,encoding:"UTF-16BE"}}if(vt(e,[239,187,191])){let r=e.subarray(3),i=Ft(r);if(i==null){let o=It(r);if(o)return{text:o.text,encoding:o.enc};throw new Error("UTF-8 BOM \u540E\u5185\u5BB9\u975E\u6CD5\u4E14\u5019\u9009\u7F16\u7801\u5747\u5931\u8D25")}return{text:i,encoding:"UTF-8"}}let t=Ft(e);if(t!=null)return{text:t,encoding:"UTF-8"};let n=It(e);if(n)return{text:n.text,encoding:n.enc};throw new Error("\u65E0\u6CD5\u8BC6\u522B\u7F16\u7801")}function Dt(e){return e.replace(/\r\n/g,`
`).replace(/\r/g,`
`)}function C(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&#34;").replace(/'/g,"&#39;")}function kt(e){return e.replace(/&#39;/g,"'").replace(/&#34;/g,'"').replace(/&gt;/g,">").replace(/&lt;/g,"<").replace(/&amp;/g,"&")}function ot(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}function me(e){return e.length>=3&&e[0]===255&&e[1]===216&&e[2]===255?"image/jpeg":e.length>=8&&e[0]===137&&e[1]===80&&e[2]===78&&e[3]===71&&e[4]===13&&e[5]===10&&e[6]===26&&e[7]===10?"image/png":e.length>=12&&e[0]===82&&e[1]===73&&e[2]===70&&e[3]===70&&e[8]===87&&e[9]===69&&e[10]===66&&e[11]===80?"image/webp":null}function Lt(e){switch(e){case"image/png":return"png";case"image/webp":return"webp";default:return"jpg"}}function xt(e){if(e.byteLength===0)throw new Error("\u5C01\u9762\u56FE\u7247\u4E3A\u7A7A");if(e.byteLength>5242880)throw new Error("\u5C01\u9762\u56FE\u7247\u8D85\u8FC7 5 MB \u9650\u5236");let t=me(e);if(!t)throw new Error("\u5C01\u9762\u56FE\u7247\u4EC5\u652F\u6301 JPG / PNG / WebP \u683C\u5F0F");return{bytes:e,mediaType:t}}var E=Uint8Array,U=Uint16Array,Et=Int32Array,St=new E([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),Tt=new E([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]),Nt=new E([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),Zt=function(e,t){for(var n=new U(31),r=0;r<31;++r)n[r]=t+=1<<e[r-1];for(var i=new Et(n[30]),r=1;r<30;++r)for(var o=n[r];o<n[r+1];++o)i[o]=o-n[r]<<5|r;return{b:n,r:i}},Xt=Zt(St,2),de=Xt.b,wt=Xt.r;de[28]=258,wt[258]=28;var Yt=Zt(Tt,0),Je=Yt.b,Ht=Yt.r,bt=new U(32768);for(p=0;p<32768;++p)D=(p&43690)>>1|(p&21845)<<1,D=(D&52428)>>2|(D&13107)<<2,D=(D&61680)>>4|(D&3855)<<4,bt[p]=((D&65280)>>8|(D&255)<<8)>>1;var D,p,et=(function(e,t,n){for(var r=e.length,i=0,o=new U(t);i<r;++i)e[i]&&++o[e[i]-1];var l=new U(t);for(i=1;i<t;++i)l[i]=l[i-1]+o[i-1]<<1;var a;if(n){a=new U(1<<t);var u=15-t;for(i=0;i<r;++i)if(e[i])for(var f=i<<4|e[i],s=t-e[i],c=l[e[i]-1]++<<s,m=c|(1<<s)-1;c<=m;++c)a[bt[c]>>u]=f}else for(a=new U(r),i=0;i<r;++i)e[i]&&(a[i]=bt[l[e[i]-1]++]>>15-e[i]);return a}),Z=new E(288);for(p=0;p<144;++p)Z[p]=8;var p;for(p=144;p<256;++p)Z[p]=9;var p;for(p=256;p<280;++p)Z[p]=7;var p;for(p=280;p<288;++p)Z[p]=8;var p,st=new E(32);for(p=0;p<32;++p)st[p]=5;var p,xe=et(Z,9,0);var ye=et(st,5,0);var Qt=function(e){return(e+7)/8|0},qt=function(e,t,n){return(t==null||t<0)&&(t=0),(n==null||n>e.length)&&(n=e.length),new E(e.subarray(t,n))};var k=function(e,t,n){n<<=t&7;var r=t/8|0;e[r]|=n,e[r+1]|=n>>8},_=function(e,t,n){n<<=t&7;var r=t/8|0;e[r]|=n,e[r+1]|=n>>8,e[r+2]|=n>>16},yt=function(e,t){for(var n=[],r=0;r<e.length;++r)e[r]&&n.push({s:r,f:e[r]});var i=n.length,o=n.slice();if(!i)return{t:Jt,l:0};if(i==1){var l=new E(n[0].s+1);return l[n[0].s]=1,{t:l,l:1}}n.sort(function(z,R){return z.f-R.f}),n.push({s:-1,f:25001});var a=n[0],u=n[1],f=0,s=1,c=2;for(n[0]={s:-1,f:a.f+u.f,l:a,r:u};s!=i-1;)a=n[n[f].f<n[c].f?f++:c++],u=n[f!=s&&n[f].f<n[c].f?f++:c++],n[s++]={s:-1,f:a.f+u.f,l:a,r:u};for(var m=o[0].s,r=1;r<i;++r)o[r].s>m&&(m=o[r].s);var v=new U(m+1),y=Ct(n[s-1],v,0);if(y>t){var r=0,d=0,N=y-t,G=1<<N;for(o.sort(function(R,b){return v[b.s]-v[R.s]||R.f-b.f});r<i;++r){var I=o[r].s;if(v[I]>t)d+=G-(1<<y-v[I]),v[I]=t;else break}for(d>>=N;d>0;){var j=o[r].s;v[j]<t?d-=1<<t-v[j]++-1:++r}for(;r>=0&&d;--r){var A=o[r].s;v[A]==t&&(--v[A],++d)}y=t}return{t:new E(v),l:y}},Ct=function(e,t,n){return e.s==-1?Math.max(Ct(e.l,t,n+1),Ct(e.r,t,n+1)):t[e.s]=n},Vt=function(e){for(var t=e.length;t&&!e[--t];);for(var n=new U(++t),r=0,i=e[0],o=1,l=function(u){n[r++]=u},a=1;a<=t;++a)if(e[a]==i&&a!=t)++o;else{if(!i&&o>2){for(;o>138;o-=138)l(32754);o>2&&(l(o>10?o-11<<5|28690:o-3<<5|12305),o=0)}else if(o>3){for(l(i),--o;o>6;o-=6)l(8304);o>2&&(l(o-3<<5|8208),o=0)}for(;o--;)l(i);o=1,i=e[a]}return{c:n.subarray(0,r),n:t}},tt=function(e,t){for(var n=0,r=0;r<t.length;++r)n+=e[r]*t[r];return n},Wt=function(e,t,n){var r=n.length,i=Qt(t+2);e[i]=r&255,e[i+1]=r>>8,e[i+2]=e[i]^255,e[i+3]=e[i+1]^255;for(var o=0;o<r;++o)e[i+o+4]=n[o];return(i+4+r)*8},Gt=function(e,t,n,r,i,o,l,a,u,f,s){k(t,s++,n),++i[256];for(var c=yt(i,15),m=c.t,v=c.l,y=yt(o,15),d=y.t,N=y.l,G=Vt(m),I=G.c,j=G.n,A=Vt(d),z=A.c,R=A.n,b=new U(19),g=0;g<I.length;++g)++b[I[g]&31];for(var g=0;g<z.length;++g)++b[z[g]&31];for(var h=yt(b,7),S=h.t,Y=h.l,T=19;T>4&&!S[Nt[T-1]];--T);var Q=f+5<<3,M=tt(i,Z)+tt(o,st)+l,B=tt(i,m)+tt(o,d)+l+14+3*T+tt(b,S)+2*b[16]+3*b[17]+7*b[18];if(u>=0&&Q<=M&&Q<=B)return Wt(t,s,e.subarray(u,u+f));var $,x,P,H;if(k(t,s,1+(B<M)),s+=2,B<M){$=et(m,v,0),x=m,P=et(d,N,0),H=d;var ct=et(S,Y,0);k(t,s,j-257),k(t,s+5,R-1),k(t,s+10,T-4),s+=14;for(var g=0;g<T;++g)k(t,s+3*g,S[Nt[g]]);s+=3*T;for(var O=[I,z],K=0;K<2;++K)for(var q=O[K],g=0;g<q.length;++g){var F=q[g]&31;k(t,s,ct[F]),s+=S[F],F>15&&(k(t,s,q[g]>>5&127),s+=q[g]>>12)}}else $=xe,x=Z,P=ye,H=st;for(var g=0;g<a;++g){var w=r[g];if(w>255){var F=w>>18&31;_(t,s,$[F+257]),s+=x[F+257],F>7&&(k(t,s,w>>23&31),s+=St[F]);var W=w&31;_(t,s,P[W]),s+=H[W],W>3&&(_(t,s,w>>5&8191),s+=Tt[W])}else _(t,s,$[w]),s+=x[w]}return _(t,s,$[256]),s+x[256]},we=new Et([65540,131080,131088,131104,262176,1048704,1048832,2114560,2117632]),Jt=new E(0),be=function(e,t,n,r,i,o){var l=o.z||e.length,a=new E(r+l+5*(1+Math.ceil(l/7e3))+i),u=a.subarray(r,a.length-i),f=o.l,s=(o.r||0)&7;if(t){s&&(u[0]=o.r>>3);for(var c=we[t-1],m=c>>13,v=c&8191,y=(1<<n)-1,d=o.p||new U(32768),N=o.h||new U(y+1),G=Math.ceil(n/3),I=2*G,j=function(gt){return(e[gt]^e[gt+1]<<G^e[gt+2]<<I)&y},A=new Et(25e3),z=new U(288),R=new U(32),b=0,g=0,h=o.i||0,S=0,Y=o.w||0,T=0;h+2<l;++h){var Q=j(h),M=h&32767,B=N[Q];if(d[M]=B,N[Q]=M,Y<=h){var $=l-h;if((b>7e3||S>24576)&&($>423||!f)){s=Gt(e,u,0,A,z,R,g,S,T,h-T,s),S=b=g=0,T=h;for(var x=0;x<286;++x)z[x]=0;for(var x=0;x<30;++x)R[x]=0}var P=2,H=0,ct=v,O=M-B&32767;if($>2&&Q==j(h-O))for(var K=Math.min(m,$)-1,q=Math.min(32767,h),F=Math.min(258,$);O<=q&&--ct&&M!=B;){if(e[h+P]==e[h+P-O]){for(var w=0;w<F&&e[h+w]==e[h+w-O];++w);if(w>P){if(P=w,H=O,w>K)break;for(var W=Math.min(O,w-2),Bt=0,x=0;x<W;++x){var ht=h-O+x&32767,he=d[ht],Pt=ht-he&32767;Pt>Bt&&(Bt=Pt,B=ht)}}}M=B,B=d[M],O+=M-B&32767}if(H){A[S++]=268435456|wt[P]<<18|Ht[H];var $t=wt[P]&31,Ot=Ht[H]&31;g+=St[$t]+Tt[Ot],++z[257+$t],++R[Ot],Y=h+P,++b}else A[S++]=e[h],++z[e[h]]}}for(h=Math.max(h,Y);h<l;++h)A[S++]=e[h],++z[e[h]];s=Gt(e,u,f,A,z,R,g,S,T,h-T,s),f||(o.r=s&7|u[s/8|0]<<3,s-=7,o.h=N,o.p=d,o.i=h,o.w=Y)}else{for(var h=o.w||0;h<l+f;h+=65535){var pt=h+65535;pt>=l&&(u[s/8|0]=f,pt=l),s=Wt(u,s+1,e.subarray(h,pt))}o.i=l}return qt(a,0,r+Qt(s)+i)};var Ce=function(e,t,n,r,i){if(!i&&(i={l:1},t.dictionary)){var o=t.dictionary.subarray(-32768),l=new E(o.length+e.length);l.set(o),l.set(e,o.length),e=l,i.w=o.length}return be(e,t.level==null?6:t.level,t.mem==null?i.l?Math.ceil(Math.max(8,Math.min(13,Math.log(e.length)))*1.5):20:12+t.mem,n,r,i)};function Kt(e,t){return Ce(e,t||{},0,0)}var jt=typeof TextEncoder<"u"&&new TextEncoder,Ee=typeof TextDecoder<"u"&&new TextDecoder,Se=0;try{Ee.decode(Jt,{stream:!0}),Se=1}catch{}function X(e,t){if(t){for(var n=new E(e.length),r=0;r<e.length;++r)n[r]=e.charCodeAt(r);return n}if(jt)return jt.encode(e);for(var i=e.length,o=new E(e.length+(e.length>>1)),l=0,a=function(s){o[l++]=s},r=0;r<i;++r){if(l+5>o.length){var u=new E(l+8+(i-r<<1));u.set(o),o=u}var f=e.charCodeAt(r);f<128||t?a(f):f<2048?(a(192|f>>6),a(128|f&63)):f>55295&&f<57344?(f=65536+(f&1047552)|e.charCodeAt(++r)&1023,a(240|f>>18),a(128|f>>12&63),a(128|f>>6&63),a(128|f&63)):(a(224|f>>12),a(128|f>>6&63),a(128|f&63))}return qt(o,0,l)}var Te=(()=>{let e=new Uint32Array(256);for(let t=0;t<256;t++){let n=t;for(let r=0;r<8;r++)n=n&1?3988292384^n>>>1:n>>>1;e[t]=n>>>0}return e})();function Ue(e){let t=4294967295;for(let n=0;n<e.length;n++)t=Te[(t^e[n])&255]^t>>>8;return(t^4294967295)>>>0}var _t=0,te=33,ee=2048,at=class{constructor(){it(this,"chunks",[]);it(this,"records",[]);it(this,"offset",0)}add(t,n,r){let i=X(t),o=Ue(n),l=n.byteLength,a=r?8:0,u=r?Kt(n,{level:6}):n,f=u.byteLength,s=new Uint8Array(30+i.byteLength),c=new DataView(s.buffer);c.setUint32(0,67324752,!0),c.setUint16(4,20,!0),c.setUint16(6,ee,!0),c.setUint16(8,a,!0),c.setUint16(10,_t,!0),c.setUint16(12,te,!0),c.setUint32(14,o,!0),c.setUint32(18,f,!0),c.setUint32(22,l,!0),c.setUint16(26,i.byteLength,!0),c.setUint16(28,0,!0),s.set(i,30),this.records.push({nameBytes:i,method:a,crc:o,compSize:f,uncompSize:l,offset:this.offset}),this.chunks.push(s,u),this.offset+=s.byteLength+f}finish(){let t=this.offset,n=0;for(let u of this.records){let f=new Uint8Array(46+u.nameBytes.byteLength),s=new DataView(f.buffer);s.setUint32(0,33639248,!0),s.setUint16(4,20,!0),s.setUint16(6,20,!0),s.setUint16(8,ee,!0),s.setUint16(10,u.method,!0),s.setUint16(12,_t,!0),s.setUint16(14,te,!0),s.setUint32(16,u.crc,!0),s.setUint32(20,u.compSize,!0),s.setUint32(24,u.uncompSize,!0),s.setUint16(28,u.nameBytes.byteLength,!0),s.setUint16(30,0,!0),s.setUint16(32,0,!0),s.setUint16(34,0,!0),s.setUint16(36,0,!0),s.setUint32(38,0,!0),s.setUint32(42,u.offset,!0),f.set(u.nameBytes,46),this.chunks.push(f),n+=f.byteLength}let r=new Uint8Array(22),i=new DataView(r.buffer);i.setUint32(0,101010256,!0),i.setUint16(4,0,!0),i.setUint16(6,0,!0),i.setUint16(8,this.records.length,!0),i.setUint16(10,this.records.length,!0),i.setUint32(12,n,!0),i.setUint32(16,t,!0),i.setUint16(20,0,!0),this.chunks.push(r);let o=t+n+22,l=new Uint8Array(o),a=0;for(let u of this.chunks)l.set(u,a),a+=u.byteLength;return l}};var lt=`<?xml version="1.0" encoding="utf-8" ?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head>
<meta http-equiv="Content-Type" content="application/xhtml+xml; charset=utf-8" />
<meta name="generator" content="EasyPub v1.50" />
<title>
%s
</title>
<link rel="stylesheet" href="style.css" type="text/css"/>
</head>
<body>
%s
</body>
</html>
`,ze=`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;function Ae(e){let t=new Uint8Array(e);return crypto.getRandomValues(t),Array.from(t,n=>n.toString(16).padStart(2,"0")).join("")}function ut(e,...t){let n=0;return e.replace(/%s/g,()=>t[n++]??"")}function zt(e){return e.coverImage?`cover.${Lt(e.coverImage.mediaType)}`:null}function Re(e){let t=zt(e);if(t){let r=`<div class="centeredimage" style="margin:0;padding:0;text-align:center;">
<img src="${t}" alt="${ot(e.title)}" style="max-width:100%;max-height:100%;height:auto;"/>
</div>`;return ut(lt,"Cover",r)}let n=`<div>
<h1 class="booktitle">${C(e.title)}</h1>
<h3 class="bookauthor">${C(e.author)}</h3>
</div>`;return ut(lt,"Cover",n)}function Me(e){let t=[`<dl>
`];for(let r=0;r<e.chapters.length;r++){let i=e.chapters[r];i.title.trim()&&t.push(`<dt class="tocl2"><a href="chapter${r}.html">${C(i.title)}</a></dt>
`)}t.push(`</dl>
`);let n=`<h2 class="titletoc">
\u76EE\u5F55
</h2>
<div class="toc">
${t.join("")}</div>`;return ut(lt,"Table Of Contents",n)}function Be(e,t){let n=e.chapters[t],r=[];n.title.trim()&&r.push(`<h2 id="title" class="titlel2std">${C(n.title)}</h2>
`);for(let o of n.body)o.trim()?r.push(`<p class="a">${o}</p>
`):r.push(`<p class="a"></p>
`);let i=r.join("").replace(/\n$/,"");return ut(lt,`chapter ${t} - 0`,i)}function Pe(e){let t=zt(e),n=[];n.push(`<?xml version="1.0" encoding="utf-8" standalone="no"?>

`),n.push(`<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
`),n.push(`<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
`),n.push(`<dc:identifier id="bookid">${ot(e.uid)}</dc:identifier>
`),n.push(`<dc:title>${C(e.title)}</dc:title>
`),n.push(`<dc:date>${C(e.date)}</dc:date>
`),n.push(`<dc:rights>Created with EasyPub v1.50</dc:rights>
`),n.push(`<dc:language>${C(e.language)}</dc:language>
`),e.author&&n.push(`<dc:creator>${C(e.author)}</dc:creator>
`),t&&n.push(`<meta name="cover" content="cover-image"/>
`),n.push(`</metadata>
`),n.push(`<manifest>
`),n.push(`<item id="ncxtoc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
`),n.push(`<item id="htmltoc"  href="book-toc.html" media-type="application/xhtml+xml"/>
`),n.push(`<item id="css" href="style.css" media-type="text/css"/>
`),n.push(`<item id="cover" href="cover.html" media-type="application/xhtml+xml"/>
`),t&&e.coverImage&&n.push(`<item id="cover-image" href="${t}" media-type="${e.coverImage.mediaType}"/>
`);for(let r=0;r<e.chapters.length;r++)n.push(`<item id="chapter${r}" href="chapter${r}.html" media-type="application/xhtml+xml"/>
`);n.push(`</manifest>
`),n.push(`<spine toc="ncxtoc">
`),n.push(`<itemref idref="cover" linear="no"/>
`),n.push(`<itemref idref="htmltoc" linear="yes"/>
`);for(let r=0;r<e.chapters.length;r++)n.push(`<itemref idref="chapter${r}" linear="yes"/>
`);return n.push(`</spine>
`),n.push(`<guide>
`),n.push(`<reference href="cover.html" type="cover" title="Cover"/>
`),n.push(`<reference href="book-toc.html" type="toc" title="Table Of Contents"/>
`),e.chapters.length>0&&n.push(`<reference href="chapter0.html" type="text" title="Beginning"/>
`),n.push(`</guide>
`),n.push(`</package>
`),n.join("")}function $e(e){let t=[];t.push(`<?xml version="1.0" encoding="utf-8" standalone="no"?>
`),t.push(`<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
`),t.push(`<ncx xmlns="http://www.daisy.org/2005/ncx/" version="2005-1">
`),t.push(`<head>
`),t.push(`<meta name="cover" content="cover"/>
`),t.push(`<meta name="dtb:uid" content="${ot(e.uid)}" />
`),t.push(`<meta name="dtb:depth" content="1"/>
`),t.push(`<meta name="dtb:generator" content="EasyPub v1.50"/>
`),t.push(`<meta name="dtb:totalPageCount" content="0"/>
`),t.push(`<meta name="dtb:maxPageNumber" content="0"/>
`),t.push(`</head>

`),t.push(`<docTitle>
`),t.push(`<text>${C(e.title)}</text>
`),t.push(`</docTitle>
`),t.push(`<docAuthor>
`),t.push(`<text>${C(e.author)}</text>
`),t.push(`</docAuthor>

`),t.push(`<navMap>
`);let n=1;t.push(`<navPoint id="cover" playOrder="${n}">
`),t.push(`<navLabel><text>\u5C01\u9762</text></navLabel>
`),t.push(`<content src="cover.html"/>
`),t.push(`</navPoint>

`),n++,t.push(`<navPoint id="htmltoc" playOrder="${n}">
`),t.push(`<navLabel><text>\u76EE\u5F55</text></navLabel>
`),t.push(`<content src="book-toc.html"/>
`),t.push(`</navPoint>

`),n++;for(let r=0;r<e.chapters.length;r++){let i=e.chapters[r];i.title.trim()&&(t.push(`<navPoint id="chapter${r}" playOrder="${n}">
`),t.push(`<navLabel><text>${C(i.title)}</text></navLabel>
`),t.push(`<content src="chapter${r}.html"/>
`),t.push(`</navPoint>

`),n++)}return t.push(`</navMap>
`),t.push(`</ncx>
`),t.join("")}function Ut(e){return e.replace(/\r\n/g,`
`).replace(/\n/g,`\r
`)}function nt(e){let t=new Uint8Array([239,187,191]),n=X(Ut(e));if(n.length>=3&&n[0]===239&&n[1]===187&&n[2]===191)return n;let r=new Uint8Array(t.length+n.length);return r.set(t,0),r.set(n,t.length),r}function Oe(e){return{title:e.title,author:e.author??"",language:e.language||"zh-CN",date:e.date||String(new Date().getFullYear()),uid:e.uid||"easypub-"+Ae(4),css:e.css,chapters:e.chapters,coverImage:e.coverImage}}function ne(e,t){let n=Oe(e),r=new at;r.add("mimetype",X("application/epub+zip"),!1),r.add("META-INF/container.xml",X(Ut(ze)),!0),r.add("OEBPS/style.css",X(Ut(n.css)),!0),r.add("OEBPS/cover.html",nt(Re(n)),!0);let i=zt(n);i&&n.coverImage&&r.add(`OEBPS/${i}`,n.coverImage.bytes,!1),r.add("OEBPS/book-toc.html",nt(Me(n)),!0);let o=n.chapters.length,l=Math.max(1,Math.floor(o/25));for(let a=0;a<o;a++)if(r.add(`OEBPS/chapter${a}.html`,nt(Be(n,a)),!0),t&&(a%l===0||a===o-1)){let u=45+Math.round((a+1)/o*45);t(u,"zip")}return r.add("OEBPS/content.opf",nt(Pe(n)),!0),r.add("OEBPS/toc.ncx",nt($e(n)),!0),t&&t(95,"zip"),r.finish()}function re(e,t){let r=(e.length>8192?e.slice(0,8192):e).replace(/\r\n/g,`
`).replace(/\r/g,`
`).split(`
`);for(let l of r.slice(0,30)){let a=l.trim();if(!a)continue;let u=a.match(/^(?:书名|Title)\s*[:：]\s*(.*)$/i);if(u){let f=u[1].trim();return f||a}}let i=(t||"book").replace(/\\/g,"/").split("/").pop()||"book",o=i.lastIndexOf(".");return(o>0?i.slice(0,o):o===-1?i:"book")||"untitled"}function Fe(e){return{fontFamily:"easypub",fontSrcs:[],lineHeight:120,fontSize:100,marginTop:5,textAlign:0,indent:0,customCss:"",...e}}function At(e){return Fe({lineHeight:ft(parseInt(e.lineHeight||"0",10)||0,50,300,120),fontSize:ft(parseInt(e.fontSize||"0",10)||0,50,300,100),marginTop:ft(parseInt(e.marginTop||"0",10)||0,0,50,5),textAlign:ft(parseInt(e.textAlign||"0",10)||0,0,3,0),indent:Ie(parseFloat(e.indent||"0")||0,0,4,0),customCss:(e.customCss||"").slice(0,1e4)})}function ie(e){e.fontFamily||(e.fontFamily="easypub"),(!Number.isFinite(e.lineHeight)||e.lineHeight<=0)&&(e.lineHeight=120),(!Number.isFinite(e.fontSize)||e.fontSize<=0)&&(e.fontSize=100),(!Number.isFinite(e.textAlign)||e.textAlign<0||e.textAlign>3)&&(e.textAlign=0),(!Number.isFinite(e.marginTop)||e.marginTop<0)&&(e.marginTop=5),(!Number.isFinite(e.indent)||e.indent<0)&&(e.indent=0);let t="";t+=`/*  Generated by EasyPub  */
`,t+=`/*  \u6B64css\u7531EasyPub\u81EA\u52A8\u751F\u6210  */
`,t+=`/*  \u90E8\u5206\u53C2\u8003\u8001\u725B\u4E2D\u6587\u6837\u5F0F  */

`,t+=`@font-face {
`,t+=`      font-family: "${e.fontFamily}";
`,e.fontSrcs.length===0?t+=`      src: local(sans-serif);
`:(t+="      src: ",t+=e.fontSrcs.map(r=>`url(${r})`).join(`,
           `),t+=`;
`),t+=`}

`,t+=`@page { 
`,t+=`      margin-top: 0px;
`,t+=`      margin-bottom: 0px;
`,t+=`}

`,t+=`body { 
`,t+=`      font-family: "${e.fontFamily}";
`,t+=`      padding: 0;
`,t+=`      margin-left: 0px;
`,t+=`      margin-right: 0px;
`,t+=`      orphans: 0;
`,t+=`      widows: 0;
`,t+=`}

`,t+=`p { 
`,t+=`      font-family: "${e.fontFamily}";
`,t+=`      font-size: ${e.fontSize}%;
`,t+=`      line-height: ${e.lineHeight}%;
`,t+=`      margin-top: ${e.marginTop}px;
`,t+=`      margin-bottom: 0;
`,t+=`      margin-left: 0;
`,t+=`      margin-right: 0;
`,t+=`      orphans: 0;
`,t+=`      widows: 0;
`,t+=`}

`;let n=e.indent>0?`${e.indent}rem`:"0em";if(t+=`.a { 
`,t+=`      text-indent: ${n};
`,t+=`}

`,t+=`div.centeredimage {
`,t+=`      text-align:center;
`,t+=`      display:block;
`,t+=`      margin-top: 0.5em;
`,t+=`      margin-bottom: 0.5em;
`,t+=`}

`,t+=`img.attpic {
`,t+=`      border: 1px solid #000000;
`,t+=`      max-width: 100%;
`,t+=`      margin: 0;
`,t+=`}

`,t+=`.booktitle {
`,t+=`      margin-top: 30%;
`,t+=`      margin-bottom: 0;
`,t+=`      border-style: none solid none none;
`,t+=`      border-width: 50px;
`,t+=`      border-color: #4E594D;
`,t+=`      font-size: 3em;
`,t+=`      line-height: 120%;
`,t+=`      text-align: right;
`,t+=`}

`,t+=`.bookauthor {
`,t+=`      margin-top: 0;
`,t+=`      border-style: none solid none none;
`,t+=`      border-width: 50px;
`,t+=`      border-color: #4E594D;
`,t+=`      page-break-after: always;
`,t+=`      font-size: large;
`,t+=`      line-height: 120%;
`,t+=`      text-align: right;
`,t+=`}

`,t+=`.titletoc, .titlel1top, .titlel1std,.titlel2top, .titlel2std,.titlel3top, .titlel3std,.titlel4std {
`,t+=`      margin-top: 0;
`,t+=`      border-style: none double none solid;
`,t+=`      border-width: 0px 5px 0px 20px;
`,t+=`      border-color: #586357;
`,t+=`      background-color: #C1CCC0;
`,t+=`      padding: 45px 5px 5px 5px;
`,t+=`      font-size: x-large;
`,t+=`      line-height: 115%;
`,t+=`      text-align: justify;
`,t+=`}

`,t+=`.titlel1single,.titlel2single,.titlel3single {
`,t+=`      margin-top: 35%;
`,t+=`      border-style: none solid none none;
`,t+=`      border-width: 30px;
`,t+=`      border-color: #4E594D;
`,t+=`      padding: 30px 5px 5px 5px;
`,t+=`      font-size: x-large;
`,t+=`      line-height: 125%;
`,t+=`      text-align: right;
`,t+=`}

`,t+=`.toc {
`,t+=`      margin-left:16%;
`,t+=`      padding:0px;
`,t+=`      line-height:130%;
`,t+=`      text-align: justify;
`,t+=`}

`,t+=`.toc a { text-decoration: none; color: #000000; }

`,t+=`.tocl1 {
`,t+=`      margin-top:0.5em;
`,t+=`      margin-left:-30px;
`,t+=`      border-style: none double double solid;
`,t+=`      border-width: 0px 5px 2px 20px;
`,t+=`      border-color: #6B766A;
`,t+=`      line-height: 135%;
`,t+=`      font-size: 132%;
`,t+=`}

`,t+=`.tocl2 {
`,t+=`      margin-top: 0.5em;
`,t+=`      margin-left:-20px;
`,t+=`      border-style: none double none solid;
`,t+=`      border-width: 0px 2px 0px 10px;
`,t+=`      border-color: #939E92;
`,t+=`      line-height: 123%;
`,t+=`      font-size: 120%;
`,t+=`}

`,t+=`.tocl3 {
`,t+=`      margin-top: 0.5em;
`,t+=`      margin-left:-20px;
`,t+=`      border-style: none double none solid;
`,t+=`      border-width: 0px 2px 0px 8px;
`,t+=`      border-color: #939E92;
`,t+=`      line-height: 112%;
`,t+=`      font-size: 109%;
`,t+=`}

`,t+=`.tocl4 {
`,t+=`      margin-top: 0.5em;
`,t+=`      margin-left:-20px;
`,t+=`      border-style: none double none solid;
`,t+=`      border-width: 0px 2px 0px 6px;
`,t+=`      border-color: #939E92;
`,t+=`      line-height: 115%;
`,t+=`      font-size: 110%;
`,t+=`}

`,t+=`.subtoc {
`,t+=`      margin-left:15%;
`,t+=`      padding:0px;
`,t+=`      text-align: justify;
`,t+=`}

`,t+=`.subtoclist {
`,t+=`      margin-top: 0.5em;
`,t+=`      margin-left:-20px;
`,t+=`      border-style: none double none solid;
`,t+=`      border-width: 0px 2px 0px 10px;
`,t+=`      border-color: #939E92;
`,t+=`      line-height: 123%;
`,t+=`      font-size: 120%;
`,t+=`}

`,e.textAlign!==0){let r=["justify","left","center","right"][e.textAlign];t+=`p, .a { text-align: ${r}; }
`}return e.customCss&&e.customCss.trim()&&(t+=`
/* ===== \u7528\u6237\u81EA\u5B9A\u4E49 CSS ===== */
`,t+=e.customCss.trim()+`
`),t}function ft(e,t,n,r){return!Number.isFinite(e)||e===0&&r!==0&&t>0&&e<t?r:e<t?t:e>n?n:e}function Ie(e,t,n,r){return Number.isFinite(e)?e<t?e===0&&r!==0?r:t:e>n?n:e:r}function De(e){return{splitMode:0,splitCount:0,fullReg:"",simpleRegP1:"",simpleRegP2:0,simpleRegP3:"",simpleRegExt:"",simpleRegLeadingSpace:!1,additionalReg:[],autoMark:!0,removeBlankLine:!0,addSpace:!1,addSpaceCount:1,forceEmptyChapter:!0,...e}}var J="0-9\u96F6\u3007\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341\u767E\u5343\u4E07\u4E24\u58F9\u8D30\u53C1\u8086\u4F0D\u9646\u67D2\u634C\u7396\u62FE\u4F70\u4EDF",ke=[`^\\s*[\u3010\\[\\(\uFF08\u300C\u300E]?[\u2606\u2605\u203B\u25C6\u25A0\u25CF\u25B2\u25BC\uFF0A*]*\\s*(\u5185\u5BB9\u7B80\u4ECB|\u4F5C\u54C1\u7B80\u4ECB|\u4F5C\u54C1\u7B80\u8BC4|\u4F5C\u54C1\u76F8\u5173|\u4F5C\u54C1\u5F3A\u63A8|\u4F5C\u8005\u7B80\u4ECB|\u7F16\u8F91\u63A8\u8350|\u7F16\u8F91\u8BC4\u4EF7|\u6587\u6848|\u7B80\u4ECB|\u5BFC\u8BFB|\u6954\u5B50|\u5F15\u5B50|\u5F15\u8A00|\u524D\u8A00|\u81EA\u5E8F|\u4EE3\u5E8F|\u5E8F\u7AE0|\u5E8F\u8A00?|\u5E8F\u66F2|\u5E8F[0-9${J}]|\u6B63\u6587|\u540E\u8BB0|\u5C3E\u58F0|\u7EC8\u7AE0|\u7EC8\u5377|\u7ED3\u5C40|\u756A\u5916\u7BC7?|\u5916\u4F20|\u7279\u522B\u7BC7|\u52A0\u7B14|\u611F\u8A00|\u5B8C\u7ED3\u611F\u8A00|\u4F5C\u8005\u7684\u8BDD|\u5199\u5728\u524D\u9762|\u5199\u5728\u540E\u9762|\u5199\u5728\u6700\u540E|\u9644\u5F55|\u5377\u9996\u8BED?|\u5377\u672B|\u4E0A\u90E8|\u4E2D\u90E8|\u4E0B\u90E8|\u4E0A\u7BC7|\u4E2D\u7BC7|\u4E0B\u7BC7|\u7B2C\u4E00\u90E8|\u7B2C\u4E8C\u90E8|\u7B2C\u4E09\u90E8|\u7B2C\u56DB\u90E8|\u7B2C\u4E94\u90E8)\\s*[\u3011\\]\\)\uFF09\u300D\u300F]?[\u2606\u2605\u203B\u25C6\u25A0\u25CF\u25B2\u25BC\uFF0A*]*([:\uFF1A\u3001\uFF0E.\xB7\u2014\\-~\\s\u3000].{0,40})?$`,`^\\s*[\u3010\\[\\(\uFF08\u300C\u300E]?\u7B2C\\s*[${J}]+\\s*[\u7AE0\u8BDD\u7BC7][\u3011\\]\\)\uFF09\u300D\u300F]?([:\uFF1A\u3001\uFF0E.\xB7\u2014\\-~\\s\u3000].{0,40}|[^\u3002\uFF01\uFF1F!?\uFF1B;\\n]{0,30})?$`,`^\\s*[\u3010\\[\\(\uFF08\u300C\u300E]?\u7B2C\\s*[${J}]+\\s*[\u56DE\u8282\u90E8\u96C6\u5377\u5E55\u8BB2][\u3011\\]\\)\uFF09\u300D\u300F]?([:\uFF1A\u3001\uFF0E.\xB7\u2014\\-~\\s\u3000].{0,40})?$`,`^\\s*[\u3010\\[\\(\uFF08\u300C\u300E]?\u7B2C\\s*[${J}]+\\s*\u90E8\u5206[\u3011\\]\\)\uFF09\u300D\u300F]?([:\uFF1A\u3001\uFF0E.\xB7\u2014\\-~\\s\u3000].{0,40})?$`,`^\\s*[\u3010\\[\\(\uFF08\u300C\u300E]?\u5377\\s*[${J}]+[\u3011\\]\\)\uFF09\u300D\u300F]?([:\uFF1A\u3001\uFF0E.\xB7\u2014\\-~\\s\u3000].{0,40})?$`,`^\\s*[\u3010\\[\\(\uFF08\u300C\u300E]?[\u7AE0\u8282\u5377]\\s*\u4E4B\\s*[${J}]+[\u3011\\]\\)\uFF09\u300D\u300F]?([:\uFF1A\u3001\uFF0E.\xB7\u2014\\-~\\s\u3000].{0,40})?$`,"^\\s*Chapter\\s+[0-9IVXLCDMivxlcdm]+([:\uFF1A.\xB7\u2014\\-~\\s].{0,60})?$","^\\s*Ch\\.?\\s*[0-9IVXLCDMivxlcdm]+([:\uFF1A.\xB7\u2014\\-~\\s].{0,60})?$","^\\s*Part\\s+[0-9IVXLCDMivxlcdm]+([:\uFF1A.\xB7\u2014\\-~\\s].{0,60})?$","^\\s*(Volume|Vol\\.?)\\s*[0-9IVXLCDMivxlcdm]+([:\uFF1A.\xB7\u2014\\-~\\s].{0,60})?$","^\\s*(Prologue|Epilogue|Interlude|Afterword|Preface|Foreword|Appendix|Introduction|Postscript|Extra|Side\\s*Story)([:\uFF1A.\xB7\u2014\\-~\\s].{0,60})?$"];function ae(e,t=""){try{return new RegExp(e,t)}catch{return null}}function Le(e){let t=!1,n=!1,r=[];for(let i=0;i<e.length;i++){let o=e[i];if(n){n=!1;continue}if(o==="\\"){n=!0;continue}if(t){o==="]"&&(t=!1);continue}if(o==="["){t=!0;continue}if(o==="("){r.push({hasQuantifier:!1});continue}if(o===")"){let l=r.pop();if(!l)continue;let a=e[i+1],u=a==="+"||a==="*"||a==="{";if(u&&l.hasQuantifier)return!0;(u||l.hasQuantifier)&&r.length>0&&(r[r.length-1].hasQuantifier=!0);continue}if((o==="+"||o==="*"||o==="{")&&r.length>0)if(o==="{"){let l=e.slice(i);/^\{\d+,\s*\d*\}/.test(l)&&(r[r.length-1].hasQuantifier=!0)}else r[r.length-1].hasQuantifier=!0}return!1}function oe(e,t,n=""){if(Le(e))throw new Error(`${t}\u6B63\u5219\u7F16\u8BD1\u5931\u8D25\uFF1A\u5305\u542B\u5D4C\u5957\u91CD\u590D\u91CF\u8BCD\uFF0C\u5B58\u5728\u6027\u80FD\u98CE\u9669`);try{return new RegExp(e,n)}catch(r){throw new Error(`${t}\u6B63\u5219\u7F16\u8BD1\u5931\u8D25\uFF1A${r instanceof Error?r.message:String(r)}`)}}function se(e){return e.startsWith("[")&&(e=e.slice(1)),e.endsWith("]")&&(e=e.slice(0,-1)),e}function Ne(e){let t=e.simpleRegP1;if(!t)return null;let n="0123456789";e.simpleRegP2===1&&(n="\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341\u96F6\u3007\u767E\u5343\u4E24");let r=e.simpleRegP3;e.simpleRegExt&&(r="["+se(r)+se(e.simpleRegExt)+"]");let o=`${e.simpleRegLeadingSpace?"\\s*":""}^\\s*${t}[${n}]+${r}.*`;return ae(o)}function He(e){let t=[];if(e.fullReg&&t.push(oe(e.fullReg,"\u5B8C\u6574\u6B63\u5219")),e.simpleRegP1||e.simpleRegP3){let n=Ne(e);if(n)t.push(n);else if(e.simpleRegP1)throw new Error("\u9644\u52A0\u6B63\u5219 P3 \u7F16\u8BD1\u5931\u8D25")}for(let n of e.additionalReg)n&&t.push(oe(n,"\u9644\u52A0\u6B63\u5219"));if(e.autoMark||t.length===0)for(let n of ke){let r="";(n.includes("Chapter")||n.includes("Ch\\.?")||n.includes("Part")||n.includes("Volume")||n.includes("Prologue")||n.includes("Epilogue")||n.includes("Interlude")||n.includes("Afterword")||n.includes("Preface")||n.includes("Foreword")||n.includes("Appendix")||n.includes("Introduction")||n.includes("Postscript")||n.includes("Extra")||n.includes("Side"))&&(r="i");let i=ae(n,r);i&&t.push(i)}return t}function Ve(e){if(e.length===0)return e;let t=[e[0]];for(let n=1;n<e.length;n++)e[n].start!==t[t.length-1].start&&t.push(e[n]);return t}function V(e,t,n,r){t<0&&(t=0),n>e.length&&(n=e.length);let i=[];if(t>=n)return i;for(let o=t;o<n;o++){let l=e[o].replace(/\r$/,"");if(l.trim()===""){if(r.removeBlankLine)continue;if(r.addSpace&&i.length>0){let u=r.addSpaceCount;u<=0&&(u=1);for(let f=0;f<u;f++)i.push("");continue}i.push("");continue}i.push(C(l))}for(;i.length>0&&i[i.length-1].trim()==="";)i.pop();return i}function Ge(e,t){let n=t.splitCount;if(n<=0)return[{title:"",body:V(e,0,e.length,t)}];let r=[],i=0,o=0,l=a=>{let u=V(e,i,a,t);(u.length>0||t.forceEmptyChapter)&&r.push({title:"",body:u}),i=a,o=0};for(let a=0;a<e.length;a++){let f=e[a].replace(/\r$/,"").trim();if(f==="")continue;let s=f.replace(/^[\u3000 ]+/,"");o+=Array.from(s).length,o>=n&&a+1<e.length&&l(a+1)}return l(e.length),r.length===0&&r.push({title:"",body:V(e,0,e.length,t)}),r}function Rt(e,t){if(t.splitMode<0||t.splitMode>2)throw new Error(`invalid SplitMode ${t.splitMode} (\u5141\u8BB8 0=\u6B63\u5219\u5207, 1=\u6309\u5B57\u6570\u5207, 2=\u6574\u672C\u4E00\u7AE0)`);e=Dt(e);let n=e.split(`
`);if(t.splitMode===2)return[{title:"",body:V(n,0,n.length,t)}];if(t.splitMode===1)return Ge(n,t);let r=He(t),i=!t.fullReg&&!t.simpleRegP1&&!t.simpleRegP3&&t.additionalReg.length===0,o=[];for(let u=0;u<n.length;u++){let f=n[u],s=f.trim();if(i&&(s.length===0||s.length>100))continue;let c=f===s;for(let m of r)if(m.lastIndex=0,m.test(f)||!c&&m.test(s)){o.push({title:s,start:u});break}}if(o.length===0)return[{title:"",body:V(n,0,n.length,t)}];let l=Ve(o),a=[];if(l[0].start>0){let u=V(n,0,l[0].start,t);(u.length>0||t.forceEmptyChapter)&&a.push({title:"",body:u})}for(let u=0;u<l.length;u++){let f=l[u],s=u+1<l.length?l[u+1].start:n.length,c=V(n,f.start+1,s,t);(c.length>0||t.forceEmptyChapter)&&a.push({title:f.title,body:c})}return a.length===0?[{title:"",body:V(n,0,n.length,t)}]:a}function le(e){let t=[];for(let n of e){let r=n.title.trim();r&&t.push(r)}return t}function ue(e,t=2){for(let n of e){let r=[];for(let i of n.body){let o=kt(i).trim();if(o&&(r.push(o.length>220?o.slice(0,220)+"\u2026":o),r.length>=t))break}if(r.length>0)return{title:n.title.trim(),paragraphs:r}}return null}function Mt(e){let t=parseInt(e.splitMode||"0",10);(Number.isNaN(t)||t<0||t>2)&&(t=0);let n=e.fullReg||"";n.length>200&&(n=n.slice(0,200));let r=e.autoMark,o=De({autoMark:r==="true"||r==="1",removeBlankLine:e.removeBlank===void 0?!0:e.removeBlank==="true"||e.removeBlank==="1",splitMode:t,splitCount:parseInt(e.splitCount||"0",10)||0,fullReg:n,addSpace:e.addSpace==="true"||e.addSpace==="1",addSpaceCount:e.addSpaceCount===void 0?1:parseInt(e.addSpaceCount||"0",10)||0,forceEmptyChapter:!0});return!o.fullReg&&o.splitMode===0&&(o.autoMark=!0),o.addSpace&&o.addSpaceCount<=0&&(o.addSpaceCount=1),o}function fe(e){return/multipart|解析上传|缺少文件字段|文件超过|封面图片|编码|无法识别编码|正则编译失败|P3 编译失败|invalid SplitMode/i.test(e)}function je(e){if(e=e.trim(),!e)return"";let t="";for(let r of e){let i=r.codePointAt(0);if(!(i<32||i===127)){if('<>:"/\\|?*'.includes(r)){t+="_";continue}t+=r}}t=t.trim().replace(/^[\s.]+|[\s.]+$/g,"");let n=Array.from(t);return n.length>120&&(t=n.slice(0,120).join("").replace(/[\s.]+$/g,"")),t==="."||t===".."?"":t}function ce(e,t=".epub"){let n=e.replace(/\\/g,"/").split("/").pop()||"upload.txt",r=n.lastIndexOf("."),i=r===-1?n:r>0?n.slice(0,r):"",o=je(i);o||(o="book");let l=t.toLowerCase();return l!==".epub"&&(l=".epub"),o+l}var rt=null;function Ze(e){return e.file&&typeof e.file.size=="number"?`${e.file.name||""}:${e.file.size}:${e.file.lastModified||0}`:null}function Xe(e){return e instanceof Error&&e.message?e.message:String(e||"\u672C\u5730\u8F6C\u6362\u5931\u8D25")}function L(e,t,n){self.postMessage({id:e,type:"progress",stage:t,percent:n})}async function Ye(e){let t=Ze(e);if(t&&rt&&rt.sig===t)return L(e.id,"decode",15),rt.decoded;L(e.id,"decode",8);let n=e.file&&e.file.arrayBuffer?new Uint8Array(await e.file.arrayBuffer()):new Uint8Array(e.bytes||[]),r=dt(n);return t&&(rt={sig:t,decoded:r}),L(e.id,"decode",20),r}self.onmessage=async function(e){let t=e.data||{};if(t.action==="clearCache"){rt=null;return}try{let n=t.fields||{},r=Mt(n),i=await Ye(t),o=t.fileName||"upload.txt";if(t.action==="detect"){L(t.id,"parse",45);let v=Rt(i.text,r),y=le(v),d=ue(v,2);L(t.id,"done",100),self.postMessage({id:t.id,ok:!0,result:{count:y.length,titles:y,preview:d,encoding:i.encoding,local:!0}});return}if(t.action!=="convert")throw new Error("\u4E0D\u652F\u6301\u7684\u672C\u5730\u64CD\u4F5C");L(t.id,"parse",30);let l=Rt(i.text,r),a;if(t.cover&&t.cover.arrayBuffer&&t.cover.size>0){let v=new Uint8Array(await t.cover.arrayBuffer());a=xt(v)}L(t.id,"render",42);let u=n.title||re(i.text,o),f=ie(At(n)),s=ne({title:u,author:n.author||"",css:f,chapters:l,coverImage:a},(v,y)=>L(t.id,y,v)),c=ce(o,".epub"),m=s.byteOffset===0&&s.byteLength===s.buffer.byteLength?s.buffer:s.slice().buffer;L(t.id,"done",100),self.postMessage({id:t.id,ok:!0,result:{epub:m,epubName:c,chapters:l.length,encoding:i.encoding,local:!0}},[m])}catch(n){let r=Xe(n),i=fe(r)?"INVALID_INPUT":"LOCAL_ERROR";self.postMessage({id:t.id,ok:!1,error:r,code:i})}};})();
