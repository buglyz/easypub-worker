"use strict";(()=>{function ct(n,t){if(n.length<t.length)return!1;for(let e=0;e<t.length;e++)if(n[e]!==t[e])return!1;return!0}function ht(n,t){let e={fatal:!0,ignoreBOM:!1};try{let i=new TextDecoder(t,e).decode(n);return i.includes("\uFFFD")?null:i}catch{try{let i=new TextDecoder(t,{fatal:!1,ignoreBOM:!1}).decode(n);return i.includes("\uFFFD")?null:i}catch{return null}}}function Bt(n){try{return new TextDecoder("utf-8",{fatal:!0,ignoreBOM:!1}).decode(n),!0}catch{return!1}}function Ot(n){let t=[["gbk","GBK"],["gb18030","GB18030"],["big5","Big5"]];for(let[e,r]of t){let i=ht(n,e);if(i!=null)return{text:i,enc:r}}return null}function Ut(n){if(ct(n,[255,254])){let e=ht(n.subarray(2),"utf-16le");if(e==null)throw new Error("UTF-16LE \u89E3\u7801\u5931\u8D25");return{text:e,encoding:"UTF-16LE"}}if(ct(n,[254,255])){let e=ht(n.subarray(2),"utf-16be");if(e==null)throw new Error("UTF-16BE \u89E3\u7801\u5931\u8D25");return{text:e,encoding:"UTF-16BE"}}if(ct(n,[239,187,191])){let e=n.subarray(3);if(!Bt(e)){let r=Ot(e);if(r)return{text:r.text,encoding:r.enc};throw new Error("UTF-8 BOM \u540E\u5185\u5BB9\u975E\u6CD5\u4E14\u5019\u9009\u7F16\u7801\u5747\u5931\u8D25")}return{text:new TextDecoder("utf-8",{fatal:!1,ignoreBOM:!1}).decode(e),encoding:"UTF-8"}}if(Bt(n))return{text:new TextDecoder("utf-8",{fatal:!1,ignoreBOM:!1}).decode(n),encoding:"UTF-8"};let t=Ot(n);if(t)return{text:t.text,encoding:t.enc};throw new Error("\u65E0\u6CD5\u8BC6\u522B\u7F16\u7801")}function Pt(n){return n.replace(/\r\n/g,`
`).replace(/\r/g,`
`)}function E(n){return n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&#34;").replace(/'/g,"&#39;")}function pt(n){return n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}var S=Uint8Array,B=Uint16Array,yt=Int32Array,wt=new S([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),bt=new S([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]),Dt=new S([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),Zt=function(n,t){for(var e=new B(31),r=0;r<31;++r)e[r]=t+=1<<n[r-1];for(var i=new yt(e[30]),r=1;r<30;++r)for(var o=e[r];o<e[r+1];++o)i[o]=o-e[r]<<5|r;return{b:e,r:i}},Ht=Zt(wt,2),fn=Ht.b,vt=Ht.r;fn[28]=258,vt[258]=28;var Gt=Zt(bt,0),Zn=Gt.b,kt=Gt.r,mt=new B(32768);for(p=0;p<32768;++p)Z=(p&43690)>>1|(p&21845)<<1,Z=(Z&52428)>>2|(Z&13107)<<2,Z=(Z&61680)>>4|(Z&3855)<<4,mt[p]=((Z&65280)>>8|(Z&255)<<8)>>1;var Z,p,nt=(function(n,t,e){for(var r=n.length,i=0,o=new B(t);i<r;++i)n[i]&&++o[n[i]-1];var a=new B(t);for(i=1;i<t;++i)a[i]=a[i-1]+o[i-1]<<1;var s;if(e){s=new B(1<<t);var u=15-t;for(i=0;i<r;++i)if(n[i])for(var f=i<<4|n[i],l=t-n[i],c=a[n[i]-1]++<<l,v=c|(1<<l)-1;c<=v;++c)s[mt[c]>>u]=f}else for(s=new B(r),i=0;i<r;++i)n[i]&&(s[i]=mt[a[n[i]-1]++]>>15-n[i]);return s}),X=new S(288);for(p=0;p<144;++p)X[p]=8;var p;for(p=144;p<256;++p)X[p]=9;var p;for(p=256;p<280;++p)X[p]=7;var p;for(p=280;p<288;++p)X[p]=8;var p,it=new S(32);for(p=0;p<32;++p)it[p]=5;var p,un=nt(X,9,0);var cn=nt(it,5,0);var qt=function(n){return(n+7)/8|0},Vt=function(n,t,e){return(t==null||t<0)&&(t=0),(e==null||e>n.length)&&(e=n.length),new S(n.subarray(t,e))};var hn=["unexpected EOF","invalid block type","invalid length/literal","invalid distance","stream finished","no stream handler",,"no callback","invalid UTF-8 data","extra field too long","date not in range 1980-2099","filename too long","stream finishing","invalid zip data"],ot=function(n,t,e){var r=new Error(t||hn[n]);if(r.code=n,Error.captureStackTrace&&Error.captureStackTrace(r,ot),!e)throw r;return r};var H=function(n,t,e){e<<=t&7;var r=t/8|0;n[r]|=e,n[r+1]|=e>>8},_=function(n,t,e){e<<=t&7;var r=t/8|0;n[r]|=e,n[r+1]|=e>>8,n[r+2]|=e>>16},gt=function(n,t){for(var e=[],r=0;r<n.length;++r)n[r]&&e.push({s:r,f:n[r]});var i=e.length,o=e.slice();if(!i)return{t:jt,l:0};if(i==1){var a=new S(e[0].s+1);return a[e[0].s]=1,{t:a,l:1}}e.sort(function(A,$){return A.f-$.f}),e.push({s:-1,f:25001});var s=e[0],u=e[1],f=0,l=1,c=2;for(e[0]={s:-1,f:s.f+u.f,l:s,r:u};l!=i-1;)s=e[e[f].f<e[c].f?f++:c++],u=e[f!=l&&e[f].f<e[c].f?f++:c++],e[l++]={s:-1,f:s.f+u.f,l:s,r:u};for(var v=o[0].s,r=1;r<i;++r)o[r].s>v&&(v=o[r].s);var m=new B(v+1),x=dt(e[l-1],m,0);if(x>t){var r=0,d=0,T=x-t,k=1<<T;for(o.sort(function($,y){return m[y.s]-m[$.s]||$.f-y.f});r<i;++r){var O=o[r].s;if(m[O]>t)d+=k-(1<<x-m[O]),m[O]=t;else break}for(d>>=T;d>0;){var I=o[r].s;m[I]<t?d-=1<<t-m[I]++-1:++r}for(;r>=0&&d;--r){var w=o[r].s;m[w]==t&&(--m[w],++d)}x=t}return{t:new S(m),l:x}},dt=function(n,t,e){return n.s==-1?Math.max(dt(n.l,t,e+1),dt(n.r,t,e+1)):t[n.s]=e},It=function(n){for(var t=n.length;t&&!n[--t];);for(var e=new B(++t),r=0,i=n[0],o=1,a=function(u){e[r++]=u},s=1;s<=t;++s)if(n[s]==i&&s!=t)++o;else{if(!i&&o>2){for(;o>138;o-=138)a(32754);o>2&&(a(o>10?o-11<<5|28690:o-3<<5|12305),o=0)}else if(o>3){for(a(i),--o;o>6;o-=6)a(8304);o>2&&(a(o-3<<5|8208),o=0)}for(;o--;)a(i);o=1,i=n[s]}return{c:e.subarray(0,r),n:t}},tt=function(n,t){for(var e=0,r=0;r<t.length;++r)e+=n[r]*t[r];return e},Xt=function(n,t,e){var r=e.length,i=qt(t+2);n[i]=r&255,n[i+1]=r>>8,n[i+2]=n[i]^255,n[i+3]=n[i+1]^255;for(var o=0;o<r;++o)n[i+o+4]=e[o];return(i+4+r)*8},Rt=function(n,t,e,r,i,o,a,s,u,f,l){H(t,l++,e),++i[256];for(var c=gt(i,15),v=c.t,m=c.l,x=gt(o,15),d=x.t,T=x.l,k=It(v),O=k.c,I=k.n,w=It(d),A=w.c,$=w.n,y=new B(19),g=0;g<O.length;++g)++y[O[g]&31];for(var g=0;g<A.length;++g)++y[A[g]&31];for(var h=gt(y,7),M=h.t,j=h.l,F=19;F>4&&!M[Dt[F-1]];--F);var Y=f+5<<3,U=tt(i,X)+tt(o,it)+a,P=tt(i,v)+tt(o,d)+a+14+3*F+tt(y,M)+2*y[16]+3*y[17]+7*y[18];if(u>=0&&Y<=U&&Y<=P)return Xt(t,l,n.subarray(u,u+f));var R,b,D,G;if(H(t,l,1+(P<U)),l+=2,P<U){R=nt(v,m,0),b=v,D=nt(d,T,0),G=d;var st=nt(M,j,0);H(t,l,I-257),H(t,l+5,$-1),H(t,l+10,F-4),l+=14;for(var g=0;g<F;++g)H(t,l+3*g,M[Dt[g]]);l+=3*F;for(var L=[O,A],Q=0;Q<2;++Q)for(var W=L[Q],g=0;g<W.length;++g){var N=W[g]&31;H(t,l,st[N]),l+=M[N],N>15&&(H(t,l,W[g]>>5&127),l+=W[g]>>12)}}else R=un,b=X,D=cn,G=it;for(var g=0;g<s;++g){var z=r[g];if(z>255){var N=z>>18&31;_(t,l,R[N+257]),l+=b[N+257],N>7&&(H(t,l,z>>23&31),l+=wt[N]);var J=z&31;_(t,l,D[J]),l+=G[J],J>3&&(_(t,l,z>>5&8191),l+=bt[J])}else _(t,l,R[z]),l+=b[z]}return _(t,l,R[256]),l+b[256]},pn=new yt([65540,131080,131088,131104,262176,1048704,1048832,2114560,2117632]),jt=new S(0),gn=function(n,t,e,r,i,o){var a=o.z||n.length,s=new S(r+a+5*(1+Math.ceil(a/7e3))+i),u=s.subarray(r,s.length-i),f=o.l,l=(o.r||0)&7;if(t){l&&(u[0]=o.r>>3);for(var c=pn[t-1],v=c>>13,m=c&8191,x=(1<<e)-1,d=o.p||new B(32768),T=o.h||new B(x+1),k=Math.ceil(e/3),O=2*k,I=function(ut){return(n[ut]^n[ut+1]<<k^n[ut+2]<<O)&x},w=new yt(25e3),A=new B(288),$=new B(32),y=0,g=0,h=o.i||0,M=0,j=o.w||0,F=0;h+2<a;++h){var Y=I(h),U=h&32767,P=T[Y];if(d[U]=P,T[Y]=U,j<=h){var R=a-h;if((y>7e3||M>24576)&&(R>423||!f)){l=Rt(n,u,0,w,A,$,g,M,F,h-F,l),M=y=g=0,F=h;for(var b=0;b<286;++b)A[b]=0;for(var b=0;b<30;++b)$[b]=0}var D=2,G=0,st=m,L=U-P&32767;if(R>2&&Y==I(h-L))for(var Q=Math.min(v,R)-1,W=Math.min(32767,h),N=Math.min(258,R);L<=W&&--st&&U!=P;){if(n[h+D]==n[h+D-L]){for(var z=0;z<N&&n[h+z]==n[h+z-L];++z);if(z>D){if(D=z,G=L,z>Q)break;for(var J=Math.min(L,z-2),Et=0,b=0;b<J;++b){var lt=h-L+b&32767,ln=d[lt],$t=lt-ln&32767;$t>Et&&(Et=$t,P=lt)}}}U=P,P=d[U],L+=U-P&32767}if(G){w[M++]=268435456|vt[D]<<18|kt[G];var Mt=vt[D]&31,Ft=kt[G]&31;g+=wt[Mt]+bt[Ft],++A[257+Mt],++$[Ft],j=h+D,++y}else w[M++]=n[h],++A[n[h]]}}for(h=Math.max(h,j);h<a;++h)w[M++]=n[h],++A[n[h]];l=Rt(n,u,f,w,A,$,g,M,F,h-F,l),f||(o.r=l&7|u[l/8|0]<<3,l-=7,o.h=T,o.p=d,o.i=h,o.w=j)}else{for(var h=o.w||0;h<a+f;h+=65535){var ft=h+65535;ft>=a&&(u[l/8|0]=f,ft=a),l=Xt(u,l+1,n.subarray(h,ft))}o.i=a}return Vt(s,0,r+qt(l)+i)},vn=(function(){for(var n=new Int32Array(256),t=0;t<256;++t){for(var e=t,r=9;--r;)e=(e&1&&-306674912)^e>>>1;n[t]=e}return n})(),mn=function(){var n=-1;return{p:function(t){for(var e=n,r=0;r<t.length;++r)e=vn[e&255^t[r]]^e>>>8;n=e},d:function(){return~n}}};var dn=function(n,t,e,r,i){if(!i&&(i={l:1},t.dictionary)){var o=t.dictionary.subarray(-32768),a=new S(o.length+n.length);a.set(o),a.set(n,o.length),n=a,i.w=o.length}return gn(n,t.level==null?6:t.level,t.mem==null?i.l?Math.ceil(Math.max(8,Math.min(13,Math.log(n.length)))*1.5):20:12+t.mem,e,r,i)},Yt=function(n,t){var e={};for(var r in n)e[r]=n[r];for(var r in t)e[r]=t[r];return e};var C=function(n,t,e){for(;e;++t)n[t]=e,e>>>=8};function xn(n,t){return dn(n,t||{},0,0)}var Wt=function(n,t,e,r){for(var i in n){var o=n[i],a=t+i,s=r;Array.isArray(o)&&(s=Yt(r,o[1]),o=o[0]),ArrayBuffer.isView(o)?e[a]=[o,s]:(e[a+="/"]=[new S(0),s],Wt(o,a,e,r))}},Lt=typeof TextEncoder<"u"&&new TextEncoder,yn=typeof TextDecoder<"u"&&new TextDecoder,wn=0;try{yn.decode(jt,{stream:!0}),wn=1}catch{}function et(n,t){if(t){for(var e=new S(n.length),r=0;r<n.length;++r)e[r]=n.charCodeAt(r);return e}if(Lt)return Lt.encode(n);for(var i=n.length,o=new S(n.length+(n.length>>1)),a=0,s=function(l){o[a++]=l},r=0;r<i;++r){if(a+5>o.length){var u=new S(a+8+(i-r<<1));u.set(o),o=u}var f=n.charCodeAt(r);f<128||t?s(f):f<2048?(s(192|f>>6),s(128|f&63)):f>55295&&f<57344?(f=65536+(f&1047552)|n.charCodeAt(++r)&1023,s(240|f>>18),s(128|f>>12&63),s(128|f>>6&63),s(128|f&63)):(s(224|f>>12),s(128|f>>6&63),s(128|f&63))}return Vt(o,0,a)}var xt=function(n){var t=0;if(n)for(var e in n){var r=n[e].length;r>65535&&ot(9),t+=r+4}return t},Nt=function(n,t,e,r,i,o,a,s){var u=r.length,f=e.extra,l=s&&s.length,c=xt(f);C(n,t,a!=null?33639248:67324752),t+=4,a!=null&&(n[t++]=20,n[t++]=e.os),n[t]=20,t+=2,n[t++]=e.flag<<1|(o<0&&8),n[t++]=i&&8,n[t++]=e.compression&255,n[t++]=e.compression>>8;var v=new Date(e.mtime==null?Date.now():e.mtime),m=v.getFullYear()-1980;if((m<0||m>119)&&ot(10),C(n,t,m<<25|v.getMonth()+1<<21|v.getDate()<<16|v.getHours()<<11|v.getMinutes()<<5|v.getSeconds()>>1),t+=4,o!=-1&&(C(n,t,e.crc),C(n,t+4,o<0?-o-2:o),C(n,t+8,e.size)),C(n,t+12,u),C(n,t+14,c),t+=16,a!=null&&(C(n,t,l),C(n,t+6,e.attrs),C(n,t+10,a),t+=14),n.set(r,t),t+=u,c)for(var x in f){var d=f[x],T=d.length;C(n,t,+x),C(n,t+2,T),n.set(d,t+4),t+=4+T}return l&&(n.set(s,t),t+=l),t},bn=function(n,t,e,r,i){C(n,t,101010256),C(n,t+8,e),C(n,t+10,e),C(n,t+12,r),C(n,t+16,i)};function Jt(n,t){t||(t={});var e={},r=[];Wt(n,"",e,t);var i=0,o=0;for(var a in e){var s=e[a],u=s[0],f=s[1],l=f.level==0?0:8,c=et(a),v=c.length,m=f.comment,x=m&&et(m),d=x&&x.length,T=xt(f.extra);v>65535&&ot(11);var k=l?xn(u,f):u,O=k.length,I=mn();I.p(u),r.push(Yt(f,{size:u.length,crc:I.d(),c:k,f:c,m:x,u:v!=a.length||x&&m.length!=d,o:i,compression:l})),i+=30+v+T+O,o+=76+2*(v+T)+(d||0)+O}for(var w=new S(o+22),A=i,$=o-i,y=0;y<r.length;++y){var c=r[y];Nt(w,c.o,c,c.f,c.u,c.c.length);var g=30+c.f.length+xt(c.extra);w.set(c.c,c.o+g),Nt(w,i,c,c.f,c.u,c.c.length,c.o,c.m),i+=16+g+(c.m?c.m.length:0)}return bn(w,i,r.length,$,A),w}var St=`<?xml version="1.0" encoding="utf-8" ?>
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
`,Cn=`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;function zn(n){let t=new Uint8Array(n);return crypto.getRandomValues(t),Array.from(t,e=>e.toString(16).padStart(2,"0")).join("")}function Tt(n,...t){let e=0;return n.replace(/%s/g,()=>t[e++]??"")}function Sn(n){let t=`<div>
<h1 class="booktitle">${E(n.title)}</h1>
<h3 class="bookauthor">${E(n.author)}</h3>
</div>`;return Tt(St,"Cover",t)}function Tn(n){let t=`<dl>
`;for(let r=0;r<n.chapters.length;r++){let i=n.chapters[r];i.title.trim()&&(t+=`<dt class="tocl2"><a href="chapter${r}.html">${E(i.title)}</a></dt>
`)}t+=`</dl>
`;let e=`<h2 class="titletoc">
\u76EE\u5F55
</h2>
<div class="toc">
${t}</div>`;return Tt(St,"Table Of Contents",e)}function An(n,t){let e=n.chapters[t],r="";e.title.trim()&&(r+=`<h2 id="title" class="titlel2std">${E(e.title)}</h2>
`);for(let i of e.body){if(!i.trim()){r+=`<p class="a"></p>
`;continue}r+=`<p class="a">${i}</p>
`}return r=r.replace(/\n$/,""),Tt(St,`chapter ${t} - 0`,r)}function En(n){let t="";t+=`<?xml version="1.0" encoding="utf-8" standalone="no"?>

`,t+=`<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
`,t+=`<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
`,t+=`<dc:identifier id="bookid">${pt(n.uid)}</dc:identifier>
`,t+=`<dc:title>${E(n.title)}</dc:title>
`,t+=`<dc:date>${E(n.date)}</dc:date>
`,t+=`<dc:rights>Created with EasyPub v1.50</dc:rights>
`,t+=`<dc:language>${E(n.language)}</dc:language>
`,n.author&&(t+=`<dc:creator>${E(n.author)}</dc:creator>
`),t+=`</metadata>
`,t+=`<manifest>
`,t+=`<item id="ncxtoc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
`,t+=`<item id="htmltoc"  href="book-toc.html" media-type="application/xhtml+xml"/>
`,t+=`<item id="css" href="style.css" media-type="text/css"/>
`,t+=`<item id="cover" href="cover.html" media-type="application/xhtml+xml"/>
`;for(let e=0;e<n.chapters.length;e++)t+=`<item id="chapter${e}" href="chapter${e}.html" media-type="application/xhtml+xml"/>
`;t+=`</manifest>
`,t+=`<spine toc="ncxtoc">
`,t+=`<itemref idref="cover" linear="no"/>
`,t+=`<itemref idref="htmltoc" linear="yes"/>
`;for(let e=0;e<n.chapters.length;e++)t+=`<itemref idref="chapter${e}" linear="yes"/>
`;return t+=`</spine>
`,t+=`<guide>
`,t+=`<reference href="cover.html" type="cover" title="Cover"/>
`,t+=`<reference href="book-toc.html" type="toc" title="Table Of Contents"/>
`,n.chapters.length>0&&(t+=`<reference href="chapter0.html" type="text" title="Beginning"/>
`),t+=`</guide>
`,t+=`</package>
`,t}function $n(n){let t="";t+=`<?xml version="1.0" encoding="utf-8" standalone="no"?>
`,t+=`<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
`,t+=`<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
`,t+=`<head>
`,t+=`<meta name="cover" content="cover"/>
`,t+=`<meta name="dtb:uid" content="${pt(n.uid)}" />
`,t+=`<meta name="dtb:depth" content="1"/>
`,t+=`<meta name="dtb:generator" content="EasyPub v1.50"/>
`,t+=`<meta name="dtb:totalPageCount" content="0"/>
`,t+=`<meta name="dtb:maxPageNumber" content="0"/>
`,t+=`</head>

`,t+=`<docTitle>
`,t+=`<text>${E(n.title)}</text>
`,t+=`</docTitle>
`,t+=`<docAuthor>
`,t+=`<text>${E(n.author)}</text>
`,t+=`</docAuthor>

`,t+=`<navMap>
`;let e=1;t+=`<navPoint id="cover" playOrder="${e}">
`,t+=`<navLabel><text>\u5C01\u9762</text></navLabel>
`,t+=`<content src="cover.html"/>
`,t+=`</navPoint>

`,e++,t+=`<navPoint id="htmltoc" playOrder="${e}">
`,t+=`<navLabel><text>\u76EE\u5F55</text></navLabel>
`,t+=`<content src="book-toc.html"/>
`,t+=`</navPoint>

`,e++;for(let r=0;r<n.chapters.length;r++){let i=n.chapters[r];i.title.trim()&&(t+=`<navPoint id="chapter${r}" playOrder="${e}">
`,t+=`<navLabel><text>${E(i.title)}</text></navLabel>
`,t+=`<content src="chapter${r}.html"/>
`,t+=`</navPoint>

`,e++)}return t+=`</navMap>
`,t+=`</ncx>
`,t}function zt(n){return n.replace(/\r\n/g,`
`).replace(/\n/g,`\r
`)}function rt(n){let t=new Uint8Array([239,187,191]),e=et(zt(n));if(e.length>=3&&e[0]===239&&e[1]===187&&e[2]===191)return e;let r=new Uint8Array(t.length+e.length);return r.set(t,0),r.set(e,t.length),r}function Ct(n){return et(n)}function Mn(n){return{title:n.title,author:n.author??"",language:n.language||"zh-CN",date:n.date||String(new Date().getFullYear()),uid:n.uid||"easypub-"+zn(4),css:n.css,chapters:n.chapters}}function Kt(n){let t=Mn(n),e=new Date("1980-01-01T00:00:00Z"),r={mtime:e},i={level:0,mtime:e},o={};o.mimetype=[Ct("application/epub+zip"),i],o["META-INF/container.xml"]=[Ct(zt(Cn)),r],o["OEBPS/style.css"]=[Ct(zt(t.css)),r],o["OEBPS/cover.html"]=[rt(Sn(t)),r],o["OEBPS/book-toc.html"]=[rt(Tn(t)),r];for(let a=0;a<t.chapters.length;a++)o[`OEBPS/chapter${a}.html`]=[rt(An(t,a)),r];return o["OEBPS/content.opf"]=[rt(En(t)),r],o["OEBPS/toc.ncx"]=[rt($n(t)),r],Jt(o,{level:6})}function Qt(n,t){let e=n.replace(/\r\n/g,`
`).replace(/\r/g,`
`).split(`
`);for(let o of e.slice(0,30)){let a=o.trim();if(!a)continue;let s=a.match(/^(?:书名|Title)\s*[:：]\s*(.*)$/i);if(s){let u=s[1].trim();return u||a}}let r=(t||"book").replace(/\\/g,"/").split("/").pop()||"book",i=r.lastIndexOf(".");return(i>0?r.slice(0,i):i===-1?r:"book")||"untitled"}function Fn(n){return{fontFamily:"easypub",fontSrcs:[],lineHeight:120,fontSize:100,marginTop:5,textAlign:0,indent:0,customCss:"",...n}}function _t(n){return Fn({lineHeight:at(parseInt(n.lineHeight||"0",10)||0,50,300,120),fontSize:at(parseInt(n.fontSize||"0",10)||0,50,300,100),marginTop:at(parseInt(n.marginTop||"0",10)||0,0,50,5),textAlign:at(parseInt(n.textAlign||"0",10)||0,0,3,0),indent:Bn(parseFloat(n.indent||"0")||0,0,4,0),customCss:(n.customCss||"").slice(0,1e4)})}function tn(n){n.fontFamily||(n.fontFamily="easypub"),(!Number.isFinite(n.lineHeight)||n.lineHeight<=0)&&(n.lineHeight=120),(!Number.isFinite(n.fontSize)||n.fontSize<=0)&&(n.fontSize=100),(!Number.isFinite(n.textAlign)||n.textAlign<0||n.textAlign>3)&&(n.textAlign=0),(!Number.isFinite(n.marginTop)||n.marginTop<0)&&(n.marginTop=5),(!Number.isFinite(n.indent)||n.indent<0)&&(n.indent=0);let t="";t+=`/*  Generated by EasyPub  */
`,t+=`/*  \u6B64css\u7531EasyPub\u81EA\u52A8\u751F\u6210  */
`,t+=`/*  \u90E8\u5206\u53C2\u8003\u8001\u725B\u4E2D\u6587\u6837\u5F0F  */

`,t+=`@font-face {
`,t+=`      font-family: "${n.fontFamily}";
`,n.fontSrcs.length===0?t+=`      src: local(sans-serif);
`:(t+="      src: ",t+=n.fontSrcs.map(r=>`url(${r})`).join(`,
           `),t+=`;
`),t+=`}

`,t+=`@page { 
`,t+=`      margin-top: 0px;
`,t+=`      margin-bottom: 0px;
`,t+=`}

`,t+=`body { 
`,t+=`      font-family: "${n.fontFamily}";
`,t+=`      padding: 0;
`,t+=`      margin-left: 0px;
`,t+=`      margin-right: 0px;
`,t+=`      orphans: 0;
`,t+=`      widows: 0;
`,t+=`}

`,t+=`p { 
`,t+=`      font-family: "${n.fontFamily}";
`,t+=`      font-size: ${n.fontSize}%;
`,t+=`      line-height: ${n.lineHeight}%;
`,t+=`      margin-top: ${n.marginTop}px;
`,t+=`      margin-bottom: 0;
`,t+=`      margin-left: 0;
`,t+=`      margin-right: 0;
`,t+=`      orphans: 0;
`,t+=`      widows: 0;
`,t+=`}

`;let e=n.indent>0?`${n.indent}rem`:"0em";if(t+=`.a { 
`,t+=`      text-indent: ${e};
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

`,n.textAlign!==0){let r=["justify","left","center","right"][n.textAlign];t+=`p, .a { text-align: ${r}; }
`}return n.customCss&&n.customCss.trim()&&(t+=`
/* ===== \u7528\u6237\u81EA\u5B9A\u4E49 CSS ===== */
`,t+=n.customCss.trim()+`
`),t}function at(n,t,e,r){return!Number.isFinite(n)||n===0&&r!==0&&t>0&&n<t?r:n<t?t:n>e?e:n}function Bn(n,t,e,r){return Number.isFinite(n)?n<t?n===0&&r!==0?r:t:n>e?e:n:r}function On(n){if(n=n.trim(),!n)return"";let t="";for(let r of n){let i=r.codePointAt(0);if(!(i<32||i===127)){if('<>:"/\\|?*'.includes(r)){t+="_";continue}t+=r}}t=t.trim().replace(/^[\s.]+|[\s.]+$/g,"");let e=Array.from(t);return e.length>120&&(t=e.slice(0,120).join("").replace(/[\s.]+$/g,"")),t==="."||t===".."?"":t}function nn(n,t=".epub"){let e=n.replace(/\\/g,"/").split("/").pop()||"upload.txt",r=e.lastIndexOf("."),i=r===-1?e:r>0?e.slice(0,r):"",o=On(i);o||(o="book");let a=t.toLowerCase();return a!==".epub"&&(a=".epub"),o+a}function Un(n){return{splitMode:0,splitCount:0,fullReg:"",simpleRegP1:"",simpleRegP2:0,simpleRegP3:"",simpleRegExt:"",simpleRegLeadingSpace:!1,additionalReg:[],autoMark:!0,removeBlankLine:!0,addSpace:!1,addSpaceCount:1,forceEmptyChapter:!0,...n}}var K="0-9\u96F6\u3007\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341\u767E\u5343\u4E07\u4E24\u58F9\u8D30\u53C1\u8086\u4F0D\u9646\u67D2\u634C\u7396\u62FE\u4F70\u4EDF",Pn=[`^\\s*[\u3010\\[\\(\uFF08\u300C\u300E]?[\u2606\u2605\u203B\u25C6\u25A0\u25CF\u25B2\u25BC\uFF0A*]*\\s*(\u5185\u5BB9\u7B80\u4ECB|\u4F5C\u54C1\u7B80\u4ECB|\u4F5C\u54C1\u7B80\u8BC4|\u4F5C\u54C1\u76F8\u5173|\u4F5C\u54C1\u5F3A\u63A8|\u4F5C\u8005\u7B80\u4ECB|\u7F16\u8F91\u63A8\u8350|\u7F16\u8F91\u8BC4\u4EF7|\u6587\u6848|\u7B80\u4ECB|\u5BFC\u8BFB|\u6954\u5B50|\u5F15\u5B50|\u5F15\u8A00|\u524D\u8A00|\u81EA\u5E8F|\u4EE3\u5E8F|\u5E8F\u7AE0|\u5E8F\u8A00?|\u5E8F\u66F2|\u5E8F[0-9${K}]|\u6B63\u6587|\u540E\u8BB0|\u5C3E\u58F0|\u7EC8\u7AE0|\u7EC8\u5377|\u7ED3\u5C40|\u756A\u5916\u7BC7?|\u5916\u4F20|\u7279\u522B\u7BC7|\u52A0\u7B14|\u611F\u8A00|\u5B8C\u7ED3\u611F\u8A00|\u4F5C\u8005\u7684\u8BDD|\u5199\u5728\u524D\u9762|\u5199\u5728\u540E\u9762|\u5199\u5728\u6700\u540E|\u9644\u5F55|\u5377\u9996\u8BED?|\u5377\u672B|\u4E0A\u90E8|\u4E2D\u90E8|\u4E0B\u90E8|\u4E0A\u7BC7|\u4E2D\u7BC7|\u4E0B\u7BC7|\u7B2C\u4E00\u90E8|\u7B2C\u4E8C\u90E8|\u7B2C\u4E09\u90E8|\u7B2C\u56DB\u90E8|\u7B2C\u4E94\u90E8)\\s*[\u3011\\]\\)\uFF09\u300D\u300F]?[\u2606\u2605\u203B\u25C6\u25A0\u25CF\u25B2\u25BC\uFF0A*]*([:\uFF1A\u3001\uFF0E.\xB7\u2014\\-~\\s\u3000].{0,40})?$`,`^\\s*[\u3010\\[\\(\uFF08\u300C\u300E]?\u7B2C\\s*[${K}]+\\s*[\u7AE0\u8BDD\u7BC7][\u3011\\]\\)\uFF09\u300D\u300F]?([:\uFF1A\u3001\uFF0E.\xB7\u2014\\-~\\s\u3000].{0,40}|[^\u3002\uFF01\uFF1F!?\uFF1B;\\n]{0,30})?$`,`^\\s*[\u3010\\[\\(\uFF08\u300C\u300E]?\u7B2C\\s*[${K}]+\\s*[\u56DE\u8282\u90E8\u96C6\u5377\u5E55\u8BB2][\u3011\\]\\)\uFF09\u300D\u300F]?([:\uFF1A\u3001\uFF0E.\xB7\u2014\\-~\\s\u3000].{0,40})?$`,`^\\s*[\u3010\\[\\(\uFF08\u300C\u300E]?\u7B2C\\s*[${K}]+\\s*\u90E8\u5206[\u3011\\]\\)\uFF09\u300D\u300F]?([:\uFF1A\u3001\uFF0E.\xB7\u2014\\-~\\s\u3000].{0,40})?$`,`^\\s*[\u3010\\[\\(\uFF08\u300C\u300E]?\u5377\\s*[${K}]+[\u3011\\]\\)\uFF09\u300D\u300F]?([:\uFF1A\u3001\uFF0E.\xB7\u2014\\-~\\s\u3000].{0,40})?$`,`^\\s*[\u3010\\[\\(\uFF08\u300C\u300E]?[\u7AE0\u8282\u5377]\\s*\u4E4B\\s*[${K}]+[\u3011\\]\\)\uFF09\u300D\u300F]?([:\uFF1A\u3001\uFF0E.\xB7\u2014\\-~\\s\u3000].{0,40})?$`,"^\\s*Chapter\\s+[0-9IVXLCDMivxlcdm]+([:\uFF1A.\xB7\u2014\\-~\\s].{0,60})?$","^\\s*Ch\\.?\\s*[0-9IVXLCDMivxlcdm]+([:\uFF1A.\xB7\u2014\\-~\\s].{0,60})?$","^\\s*Part\\s+[0-9IVXLCDMivxlcdm]+([:\uFF1A.\xB7\u2014\\-~\\s].{0,60})?$","^\\s*(Volume|Vol\\.?)\\s*[0-9IVXLCDMivxlcdm]+([:\uFF1A.\xB7\u2014\\-~\\s].{0,60})?$","^\\s*(Prologue|Epilogue|Interlude|Afterword|Preface|Foreword|Appendix|Introduction|Postscript|Extra|Side\\s*Story)([:\uFF1A.\xB7\u2014\\-~\\s].{0,60})?$"];function on(n,t=""){try{return new RegExp(n,t)}catch{return null}}function en(n,t,e=""){try{return new RegExp(n,e)}catch(r){throw new Error(`${t}\u6B63\u5219\u7F16\u8BD1\u5931\u8D25\uFF1A${r instanceof Error?r.message:String(r)}`)}}function rn(n){return n.startsWith("[")&&(n=n.slice(1)),n.endsWith("]")&&(n=n.slice(0,-1)),n}function Dn(n){let t=n.simpleRegP1;if(!t)return null;let e="0123456789";n.simpleRegP2===1&&(e="\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341\u96F6\u3007\u767E\u5343\u4E24");let r=n.simpleRegP3;n.simpleRegExt&&(r="["+rn(r)+rn(n.simpleRegExt)+"]");let o=`${n.simpleRegLeadingSpace?"\\s*":""}^\\s*${t}[${e}]+${r}.*`;return on(o)}function kn(n){let t=[];if(n.fullReg&&t.push(en(n.fullReg,"\u5B8C\u6574\u6B63\u5219")),n.simpleRegP1||n.simpleRegP3){let e=Dn(n);if(e)t.push(e);else if(n.simpleRegP1)throw new Error("\u9644\u52A0\u6B63\u5219 P3 \u7F16\u8BD1\u5931\u8D25")}for(let e of n.additionalReg)e&&t.push(en(e,"\u9644\u52A0\u6B63\u5219"));if(n.autoMark||t.length===0)for(let e of Pn){let r="";(e.includes("Chapter")||e.includes("Ch\\.?")||e.includes("Part")||e.includes("Volume")||e.includes("Prologue")||e.includes("Epilogue")||e.includes("Interlude")||e.includes("Afterword")||e.includes("Preface")||e.includes("Foreword")||e.includes("Appendix")||e.includes("Introduction")||e.includes("Postscript")||e.includes("Extra")||e.includes("Side"))&&(r="i");let i=on(e,r);i&&t.push(i)}return t}function In(n){if(n.length===0)return n;let t=[n[0]];for(let e=1;e<n.length;e++)n[e].start!==t[t.length-1].start&&t.push(n[e]);return t}function q(n,t,e,r){t<0&&(t=0),e>n.length&&(e=n.length);let i=[];if(t>=e)return i;for(let o=t;o<e;o++){let a=n[o].replace(/\r$/,"");if(a.trim()===""){if(r.removeBlankLine)continue;if(r.addSpace&&i.length>0){let u=r.addSpaceCount;u<=0&&(u=1);for(let f=0;f<u;f++)i.push("");continue}i.push("");continue}i.push(E(a))}for(;i.length>0&&i[i.length-1].trim()==="";)i.pop();return i}function Rn(n,t){let e=t.splitCount;if(e<=0)return[{title:"",body:q(n,0,n.length,t)}];let r=[],i=0,o=0,a=s=>{let u=q(n,i,s,t);(u.length>0||t.forceEmptyChapter)&&r.push({title:"",body:u}),i=s,o=0};for(let s=0;s<n.length;s++){let f=n[s].replace(/\r$/,"").trim();if(f==="")continue;let l=f.replace(/^[\u3000 ]+/,"");o+=Array.from(l).length,o>=e&&s+1<n.length&&a(s+1)}return a(n.length),r.length===0&&r.push({title:"",body:q(n,0,n.length,t)}),r}function At(n,t){if(t.splitMode<0||t.splitMode>2)throw new Error(`invalid SplitMode ${t.splitMode} (\u5141\u8BB8 0=\u6B63\u5219\u5207, 1=\u6309\u5B57\u6570\u5207, 2=\u6574\u672C\u4E00\u7AE0)`);n=Pt(n);let e=n.split(`
`);if(t.splitMode===2)return[{title:"",body:q(e,0,e.length,t)}];if(t.splitMode===1)return Rn(e,t);let r=kn(t),i=[];for(let s=0;s<e.length;s++){let u=e[s],f=u.trim();for(let l of r)if(l.lastIndex=0,l.test(u)||l.test(f)){i.push({title:f,start:s});break}}if(i.length===0)return[{title:"",body:q(e,0,e.length,t)}];let o=In(i),a=[];if(o[0].start>0){let s=q(e,0,o[0].start,t);(s.length>0||t.forceEmptyChapter)&&a.push({title:"",body:s})}for(let s=0;s<o.length;s++){let u=o[s],f=s+1<o.length?o[s+1].start:e.length,l=q(e,u.start+1,f,t);(l.length>0||t.forceEmptyChapter)&&a.push({title:u.title,body:l})}return a.length===0?[{title:"",body:q(e,0,e.length,t)}]:a}function an(n){let t=[];for(let e of n){let r=e.title.trim();r&&t.push(r)}return t}function sn(n){let t=parseInt(n.splitMode||"0",10);(Number.isNaN(t)||t<0||t>2)&&(t=0);let e=n.fullReg||"";e.length>200&&(e=e.slice(0,200));let r=n.autoMark,o=Un({autoMark:r==="true"||r==="1",removeBlankLine:n.removeBlank===void 0?!0:n.removeBlank==="true"||n.removeBlank==="1",splitMode:t,splitCount:parseInt(n.splitCount||"0",10)||0,fullReg:e,addSpace:n.addSpace==="true"||n.addSpace==="1",addSpaceCount:n.addSpaceCount===void 0?1:parseInt(n.addSpaceCount||"0",10)||0,forceEmptyChapter:!0});return!o.fullReg&&o.splitMode===0&&(o.autoMark=!0),o.addSpace&&o.addSpaceCount<=0&&(o.addSpaceCount=1),o}function Ln(n){return n instanceof Error&&n.message?n.message:String(n||"\u672C\u5730\u8F6C\u6362\u5931\u8D25")}function V(n,t,e){self.postMessage({id:n,type:"progress",stage:t,percent:e})}self.onmessage=async function(n){let t=n.data||{};try{let e=t.file&&t.file.arrayBuffer?new Uint8Array(await t.file.arrayBuffer()):new Uint8Array(t.bytes||[]),r=t.fields||{},i=sn(r);V(t.id,"decode",5);let o=Ut(e),a=t.fileName||"upload.txt";if(t.action==="detect"){V(t.id,"parse",30);let v=an(At(o.text,i));V(t.id,"done",100),self.postMessage({id:t.id,ok:!0,result:{count:v.length,titles:v,encoding:o.encoding,local:!0}});return}if(t.action!=="convert")throw new Error("\u4E0D\u652F\u6301\u7684\u672C\u5730\u64CD\u4F5C");V(t.id,"parse",30);let s=At(o.text,i);V(t.id,"render",55);let u=r.title||Qt(o.text,a),f=tn(_t(r));V(t.id,"build",70);let l=Kt({title:u,author:r.author||"",css:f,chapters:s});V(t.id,"zip",90);let c=nn(a,".epub");V(t.id,"done",100),self.postMessage({id:t.id,ok:!0,result:{epub:l.buffer,epubName:c,chapters:s.length,encoding:o.encoding,local:!0}},[l.buffer])}catch(e){self.postMessage({id:t.id,ok:!1,error:Ln(e)})}};})();
