/**
 * The working parts of an agent-built store's cart, checkout, login, account and thank-you pages.
 * The store's own design owns everything around them and every colour, font and shape through the
 * .ob-* classes; the markup and behaviour are ours, so a redesign can never break an order.
 * Runs inside the sandboxed page and reaches the server only through ORBIT.api (SiteFrame checks it).
 *
 * Plain script kept in String.raw: no backticks and no dollar-brace inside.
 */

/** Low specificity and placed before the store's stylesheet: a reset can't undo it, the store's own .ob rules win. */
export const WIDGETS_CSS = String.raw`.ob{--ob-bg:var(--ob-t-surface);--ob-line:var(--ob-t-border);--ob-ink:var(--ob-t-text);--ob-dim:var(--ob-t-muted);--ob-accent:var(--ob-t-accent);--ob-on:var(--ob-t-accent-text);--ob-r:var(--ob-t-radius);color:var(--ob-ink);font:inherit;font-size:16px;line-height:1.5;text-align:left}
.ob *,.ob *::before,.ob *::after{box-sizing:border-box}
.ob-page{max-width:1180px;margin:0 auto;padding:clamp(32px,6vw,80px) clamp(16px,4vw,40px);min-height:60vh}
.ob-page>h1{margin:0 0 clamp(20px,3vw,36px)}
.ob-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,380px);gap:clamp(24px,4vw,64px);align-items:start}
@media(max-width:860px){.ob-grid{grid-template-columns:minmax(0,1fr)}}
.ob-card{background:var(--ob-bg);border:1px solid var(--ob-line);border-radius:var(--ob-r);padding:clamp(18px,2.4vw,28px)}
.ob-narrow{max-width:460px;margin:0 auto}
.ob-h{margin:0 0 16px;font-size:20px;line-height:1.25}
.ob-line{display:grid;grid-template-columns:84px minmax(0,1fr) auto;gap:16px;padding:18px 0;border-bottom:1px solid var(--ob-line);align-items:start}
.ob-thumb{width:84px;height:100px;object-fit:cover;border-radius:calc(var(--ob-r)*.6);background:var(--ob-line);display:block}
.ob-name{font-weight:600;color:inherit;text-decoration:none;display:block;overflow-wrap:anywhere}
.ob-dim{color:var(--ob-dim);font-size:15px}
.ob-price{font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.ob-qty{display:inline-flex;align-items:center;border:1px solid var(--ob-line);border-radius:var(--ob-r);margin-top:10px}
.ob-qty button{width:44px;height:44px;border:0;background:none;color:inherit;font:inherit;font-size:18px;cursor:pointer}
.ob-qty span{min-width:28px;text-align:center;font-variant-numeric:tabular-nums}
.ob-link{border:0;background:none;padding:10px 0;margin-left:14px;font:inherit;font-size:15px;color:var(--ob-dim);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.ob-row{display:flex;justify-content:space-between;gap:16px;padding:7px 0}
.ob-total{border-top:1px solid var(--ob-line);margin-top:10px;padding-top:16px;font-size:19px;font-weight:700}
.ob-btn{display:flex;width:100%;min-height:52px;align-items:center;justify-content:center;text-align:center;padding:12px 22px;border:1px solid var(--ob-accent);border-radius:var(--ob-r);background:var(--ob-accent);color:var(--ob-on);font:inherit;font-weight:600;cursor:pointer;text-decoration:none;margin-top:18px}
.ob-btn[disabled]{opacity:.55;cursor:default}
.ob-btn.ob-alt{background:none;color:var(--ob-ink);border-color:var(--ob-line);margin-top:10px}
.ob-field{display:block;margin:0 0 16px}
.ob-field>span{display:block;font-size:15px;margin-bottom:6px}
.ob-field input:not([type=checkbox]),.ob-field textarea,.ob-code input{width:100%;min-height:50px;padding:12px 14px;border:1px solid var(--ob-line);border-radius:var(--ob-r);background:var(--ob-t-bg);color:var(--ob-ink);font:inherit;font-size:16px}
.ob-field textarea{min-height:86px;resize:vertical}
.ob :where(input,textarea,button,a):focus-visible{outline:2px solid var(--ob-accent);outline-offset:2px}
.ob-two{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
@media(max-width:520px){.ob-two{grid-template-columns:1fr}.ob-line{grid-template-columns:72px minmax(0,1fr)}.ob-line>.ob-price{grid-column:2}.ob-thumb{width:72px;height:88px}}
.ob-check{display:flex;gap:10px;align-items:center;margin:0 0 16px;min-height:44px;cursor:pointer}
.ob-check input{width:20px;height:20px;accent-color:var(--ob-accent)}
.ob-pay{display:flex;gap:12px;align-items:center;border:1px solid var(--ob-line);border-radius:var(--ob-r);padding:14px 16px;margin-bottom:10px;cursor:pointer}
.ob-pay:has(input:checked){border-color:var(--ob-accent);box-shadow:inset 0 0 0 1px var(--ob-accent)}
.ob-pay input{width:20px;height:20px;accent-color:var(--ob-accent)}
.ob-code{display:flex;gap:10px;margin:14px 0 4px}.ob-code button{flex:none;min-height:50px;padding:0 18px;border:1px solid var(--ob-line);border-radius:var(--ob-r);background:none;color:inherit;font:inherit;cursor:pointer}
.ob-err{color:#c0262d;background:#fdecec;border-radius:var(--ob-r);padding:12px 14px;margin:14px 0 0;font-size:15px}
.ob-ok{color:var(--ob-dim);font-size:15px;margin:8px 0 0}
.ob-tabs{display:flex;gap:24px;border-bottom:1px solid var(--ob-line);margin-bottom:22px}
.ob-tabs button{border:0;background:none;padding:12px 0;font:inherit;color:var(--ob-dim);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.ob-tabs button[aria-selected=true]{color:var(--ob-ink);border-color:var(--ob-accent);font-weight:600}
.ob-steps{display:flex;list-style:none;padding:0;margin:22px 0;gap:8px}.ob-steps li{flex:1;border-top:3px solid var(--ob-line);padding-top:8px;font-size:15px;color:var(--ob-dim)}.ob-steps li.on{border-color:var(--ob-accent);color:var(--ob-ink)}
.ob-empty{text-align:center;padding:40px 0}
.ob-card>p{margin:0 0 12px}.ob-signin{margin-bottom:18px!important}`;

export const WIDGETS_JS = String.raw`(function(){
var O=window.ORBIT;
function h(tag,a){var e=document.createElement(tag);a=a||{};for(var k in a){if(a[k]==null||a[k]===false)continue;if(k==="text")e.textContent=a[k];else if(k.slice(0,2)==="on")e.addEventListener(k.slice(2),a[k]);else if(k==="cls")e.className=a[k];else e.setAttribute(k,a[k]===true?"":a[k])}
 for(var i=2;i<arguments.length;i++){var c=arguments[i];if(c==null||c===false)continue;if(Array.isArray(c))c.forEach(function(x){if(x)e.append(x)});else e.append(c)}return e}
function img(src,name){var el=h("img",{cls:"ob-thumb",alt:name||"",loading:"lazy"});if(src)el.src=src;else el.style.visibility="hidden";return el}
var shotOf=function(l){if(l.image)return l.image;try{var f=window.ORBIT_STANDIN;return f?f(l.productId)||null:null}catch(e){return null}};
function rows(box,list){list.forEach(function(r){if(r[1]==null)return;box.append(h("div",{cls:"ob-row"+(r[2]?" ob-total":"")},h("span",{text:r[0]}),h("span",{cls:"ob-price",text:r[1]})))})}
function field(label,name,o){o=o||{};var inp=h(o.area?"textarea":"input",{name:name,type:o.area?null:(o.type||"text"),autocomplete:o.ac||null,inputmode:o.im||null,required:o.req||null,list:o.list||null,maxlength:o.max||200,value:o.area?null:(o.value||"")});if(o.area&&o.value)inp.value=o.value;return h("label",{cls:"ob-field"},h("span",{text:label+(o.req?"":" (optional)")}),inp)}
function say(box,msg){var old=box.querySelector(".ob-err");if(old)old.remove();if(msg){var e=h("p",{cls:"ob-err",role:"alert",text:msg});box.append(e);e.scrollIntoView({block:"nearest"})}}
function go(to,id){O.go(to,id)}

/* ---- demo answers: the preview and the automatic test never touch real orders ---- */
function demoOrder(){var ls=O.cart.lines();if(!ls.length)ls=O.products.slice(0,2).map(function(p){return{productId:p.id,name:p.name,price:p.fromPrice||p.price,qty:1,image:p.image}});var t=ls.reduce(function(s,l){return s+l.price*l.qty},0);return{id:"demo",number:"DEMO01",status:"pending",firstName:"Ayesha",phone:"0300 0000000",address:"12 Example Street, Lahore",items:ls,subtotal:t,shipping:0,discount:0,tax:0,total:t,payment:"Cash on delivery"}}
function mock(op,d){var ls=O.cart.lines(),t=ls.reduce(function(s,l){return s+l.price*l.qty},0);
 if(op==="me")return{methods:{enabled:true},authMode:"password",customer:O.page.slug==="account"?{name:"Ayesha Khan",email:"ayesha@example.com",phone:"0300 0000000"}:null};
 if(op==="options")return{options:["cod"]};
 if(op==="quote")return{ok:true,subtotal:t,discount:0,shipping:0,freeShipping:true,tax:0,total:t,giftCardDiscount:0,loyaltyDiscount:0,bundleDiscount:0,error:d&&d.code?"Codes work on your live store.":null};
 if(op==="orders"){var o=demoOrder();return{orders:[{id:"demo",total:o.total,status:"shipped",createdAt:new Date().toISOString(),items:o.items}]}}
 if(op==="cities")return{cities:["Lahore","Karachi","Islamabad","Multan"]};
 if(op==="place")return{ok:true,orderId:"demo"};
 if(op==="addresses")return{addresses:[]};
 return{ok:true}}
O.api=function(op,d){return(O.preview||parent===window)?Promise.resolve(mock(op,d)):O._ask("api",{op:op,data:d||{}}).then(function(r){return r||{error:"No answer. Please try again."}})};

var W={};
W.cart=function(box){
 O.cart.onChange(function(ls){
  box.replaceChildren();
  if(!ls.length){box.append(h("div",{cls:"ob-empty"},h("p",{cls:"ob-h",text:"Your bag is empty"}),h("a",{cls:"ob-btn ob-narrow",href:O.hasPage.shop?"#page:shop":"#page:home",text:"Continue shopping"})));return}
  var list=h("div",{cls:"ob-lines"});
  ls.forEach(function(l){list.append(h("div",{cls:"ob-line"},img(shotOf(l),l.name),
   h("div",{},h("a",{cls:"ob-name",href:l.productId&&O.hasPage.product?"#product:"+l.productId:"#page:home",text:l.name}),l.variantLabel?h("div",{cls:"ob-dim",text:l.variantLabel}):null,h("div",{cls:"ob-dim",text:O.money(l.price)}),
    h("span",{cls:"ob-qty"},h("button",{type:"button","aria-label":"Less of "+l.name,text:"−",onclick:function(){O.cart.setQty(l.key,l.qty-1)}}),h("span",{text:l.qty}),h("button",{type:"button","aria-label":"More of "+l.name,text:"+",onclick:function(){O.cart.setQty(l.key,l.qty+1)}})),
    h("button",{cls:"ob-link",type:"button",text:"Remove",onclick:function(){O.cart.remove(l.key)}})),
   h("div",{cls:"ob-price",text:O.money(l.price*l.qty)})))});
  var sum=h("aside",{cls:"ob-card ob-summary"},h("h2",{cls:"ob-h",text:"Summary"}));
  rows(sum,[["Subtotal",O.money(O.cart.total())],["Delivery","At checkout"],["Total",O.money(O.cart.total()),1]]);
  sum.append(h("a",{cls:"ob-btn ob-primary",href:"#checkout",text:"Checkout"}),h("a",{cls:"ob-btn ob-alt",href:O.hasPage.shop?"#page:shop":"#page:home",text:"Continue shopping"}));
  box.append(h("div",{cls:"ob-grid"},list,sum));
 });
};

W.checkout=function(box){
 var st={code:"",gift:"",points:0,quote:null,pay:"cod",busy:false,loy:null},drawn=false,form,sum,lines=[];
 function data(){var d={};if(form)new FormData(form).forEach(function(v,k){d[k]=String(v).trim()});return d}
 function quote(note){var d=data();return O.api("quote",{code:st.code,giftCardCode:st.gift,phone:d.phone||"",city:d.city||"",points:st.points}).then(function(q){if(q&&q.ok)st.quote=q;summary(note);return q})}
 function summary(note){
  var q=st.quote||{subtotal:O.cart.total(),total:O.cart.total()};sum.replaceChildren(h("h2",{cls:"ob-h",text:"Your order"}));
  lines.forEach(function(l){sum.append(h("div",{cls:"ob-row"},h("span",{text:l.qty+" × "+l.name+(l.variantLabel?" ("+l.variantLabel+")":"")}),h("span",{cls:"ob-price",text:O.money(l.price*l.qty)})))});
  var code=h("input",{"aria-label":"Discount or gift card code",placeholder:"Discount or gift card code",value:st.code||st.gift||""});
  sum.append(h("div",{cls:"ob-code"},code,h("button",{type:"button",text:"Apply",onclick:function(){apply(code.value.trim())}})));
  if(note)sum.append(h("p",{cls:"ob-ok",role:"status",text:note}));
  if(st.loy&&st.loy.enabled&&st.loy.signedIn&&st.loy.points>=st.loy.minRedeem&&st.loy.points>0)sum.append(h("label",{cls:"ob-check"},h("input",{type:"checkbox",checked:st.points>0,onchange:function(e){st.points=e.target.checked?st.loy.points:0;quote()}}),"Use my "+st.loy.points+" points"));
  var minus=function(n){return n>0?"− "+O.money(n):null};
  rows(sum,[["Subtotal",O.money(q.subtotal)],["Discount",minus((q.discount||0)+(q.bundleDiscount||0))],["Gift card",minus(q.giftCardDiscount)],["Points",minus(q.loyaltyDiscount)],[q.taxLabel||"Tax",q.tax>0?O.money(q.tax):null],["Delivery",st.quote?(q.shipping>0?O.money(q.shipping):"Free"):"…"],["Total",O.money(q.total),1]]);
  sum.append(h("button",{cls:"ob-btn ob-primary",type:"submit",form:"ob-checkout",disabled:st.busy,text:st.busy?"Placing your order…":"Place order"}));
  sum.append(h("p",{cls:"ob-dim ob-note",text:st.pay==="cod"?"Cash on delivery: pay when it reaches you.":"You will be taken to a secure payment page."}));
 }
 function apply(v){if(!v){st.code=st.gift="";quote();return}
  st.code=v;st.gift="";quote().then(function(q){if(q&&q.ok&&q.couponCode){summary("Applied: "+(q.couponLabel||v));return}
   st.code="";st.gift=v;return quote().then(function(g){if(g&&g.ok&&g.giftCardCode)summary("Gift card applied.");else{st.gift="";return quote((q&&q.error)||(g&&g.error)||"That code isn't valid.")}})})}
 function place(e){e.preventDefault();if(st.busy)return;var d=data(),miss=["name","phone","line1","city"].filter(function(k){return !d[k]});
  if(miss.length){say(form,"Please fill in your name, phone, address and city.");var f=form.elements[miss[0]];if(f)f.focus();return}
  if((d.phone.match(/[0-9]/g)||[]).length<7){say(form,"Please check the phone number.");form.elements.phone.focus();return}
  var custom={};(O.checkout.fields||[]).forEach(function(f){var el=form.elements["cf_"+f.key];custom[f.key]=f.type==="checkbox"?!!(el&&el.checked):(d["cf_"+f.key]||"")});
  var need=(O.checkout.fields||[]).find(function(f){return f.required&&!custom[f.key]});if(need){say(form,'Please fill in "'+need.label+'".');return}
  st.busy=true;say(form,"");summary();
  O.api("place",{customerName:d.name,customerPhone:d.phone,customerEmail:d.email||"",shipping:{line1:d.line1,city:d.city,area:d.area||"",postalCode:d.postal||""},couponCode:(st.quote&&st.quote.couponCode)||"",giftCardCode:(st.quote&&st.quote.giftCardCode)||"",loyaltyPointsRedeem:(st.quote&&st.quote.loyaltyPointsRedeemed)||0,payment:st.pay,customFields:custom}).then(function(r){
   if(r.redirect)return;
   if(r.error||!r.orderId){st.busy=false;summary();say(form,r.error||"Your order could not be placed. Please try again.");return}
   if(r.needsVerify){box.replaceChildren(h("div",{cls:"ob-card ob-narrow"},h("h2",{cls:"ob-h",text:"Please confirm your order"}),h("p",{text:"We have sent a confirmation to "+d.phone+". Tap the link, or reply YES, and we will get it moving. Unconfirmed orders are cancelled after 48 hours."}),h("a",{cls:"ob-btn",href:"#page:home",text:"Continue shopping"})));return}
   go("order",r.orderId)});
 }
 function draw(){
  if(drawn)return;drawn=true;
  form=h("form",{id:"ob-checkout",novalidate:true,cls:"ob-form",onsubmit:place});
  var cities=h("datalist",{id:"ob-cities"});
  var contact=h("section",{cls:"ob-card"},h("h2",{cls:"ob-h",text:"Delivery details"}),h("p",{cls:"ob-dim ob-signin"}),field("Full name","name",{req:1,ac:"name"}),h("div",{cls:"ob-two"},field("Phone","phone",{req:1,type:"tel",im:"tel",ac:"tel",max:30}),field("Email","email",{type:"email",ac:"email"})),field("Address (house and street)","line1",{req:1,area:1,ac:"address-line1"}),h("div",{cls:"ob-two"},field("City","city",{req:1,ac:"address-level2",list:"ob-cities"}),field("Area","area",{})),field("Postal code","postal",{ac:"postal-code",max:20}),cities);
  (O.checkout.fields||[]).forEach(function(f){contact.append(f.type==="checkbox"?h("label",{cls:"ob-check"},h("input",{type:"checkbox",name:"cf_"+f.key}),f.label):field(f.label,"cf_"+f.key,{req:f.required,area:f.type==="textarea",max:500}))});
  var pay=h("section",{cls:"ob-card",style:"margin-top:20px"},h("h2",{cls:"ob-h",text:"Payment"}));
  form.append(contact,pay);sum=h("aside",{cls:"ob-card ob-summary"});
  box.replaceChildren(h("div",{cls:"ob-grid"},form,sum));summary();
  var NAMES={cod:"Cash on delivery",stripe:"Card",jazzcash:"JazzCash",easypaisa:"Easypaisa"};
  O.api("options").then(function(r){var list=(r&&r.options&&r.options.length)?r.options:["cod"];st.pay=list[0];list.forEach(function(k,i){pay.append(h("label",{cls:"ob-pay"},h("input",{type:"radio",name:"pay",value:k,checked:i===0,onchange:function(){st.pay=k;summary()}}),h("span",{text:NAMES[k]||k})))});summary()});
  O.api("cities").then(function(r){((r&&r.cities)||[]).forEach(function(c){cities.append(h("option",{value:c}))})});
  O.api("me").then(function(r){var c=r&&r.customer,slot=box.querySelector(".ob-signin");if(!slot)return;
   if(!c){if(r&&r.methods&&r.methods.enabled!==false)slot.append("Have an account? ",h("a",{href:"#account",text:"Sign in",style:"color:inherit"}),". You can also order as a guest.");else slot.remove();return}
   slot.textContent="Signed in as "+c.name;var set=function(k,v){if(v&&form.elements[k]&&!form.elements[k].value)form.elements[k].value=v};
   set("name",c.name);set("phone",c.phone);set("email",c.email);
   O.api("loyalty").then(function(l){st.loy=l;summary()});
   O.api("addresses").then(function(a){var list=(a&&a.addresses)||[],x=list.find(function(y){return y.isDefault})||list[0];if(x){set("line1",x.line1);set("city",x.city);set("area",x.area);set("postal",x.postalCode);quote()}})});
  form.elements.city.addEventListener("change",function(){quote()});
  form.elements.phone.addEventListener("change",function(){var p=form.elements.phone.value.trim();if(p.length>=7)O.api("abandoned",{phone:p})});
  quote();
 }
 O.cart.onChange(function(ls){lines=ls;if(!ls.length){if(st.busy)return;drawn=false;box.replaceChildren(h("div",{cls:"ob-empty"},h("p",{cls:"ob-h",text:"Your bag is empty"}),h("a",{cls:"ob-btn ob-narrow",href:O.hasPage.shop?"#page:shop":"#page:home",text:"Continue shopping"})));return}if(drawn)quote();else draw()});
};

W.login=function(box){
 O.api("me").then(function(r){
  if(r.customer){go("account");return}
  var mode=r.authMode||"none";if(mode==="none"){box.replaceChildren(h("div",{cls:"ob-card ob-narrow"},h("p",{text:"This store doesn't use customer accounts. You can order as a guest."}),h("a",{cls:"ob-btn",href:"#page:home",text:"Continue shopping"})));return}
  var tab="in",way=mode==="otp"?"otp":"password",step="form",phone="",name="";
  function draw(dev){
   var form=h("form",{cls:"ob-form",novalidate:true,onsubmit:submit});
   if(step==="code")form.append(h("p",{text:"Enter the code we sent to "+phone+"."}),dev?h("p",{cls:"ob-ok",text:"Test code: "+dev}):null,field("Code","code",{req:1,im:"numeric",ac:"one-time-code",max:10}));
   else{if(tab==="up")form.append(field("Full name","name",{req:1,ac:"name"}));
    if(way==="password")form.append(field("Email","email",{req:1,type:"email",ac:"email"}),field("Password","password",{req:1,type:"password",ac:tab==="up"?"new-password":"current-password"}));else form.append(field("Phone","phone",{req:1,type:"tel",im:"tel",ac:"tel"}))}
   form.append(h("button",{cls:"ob-btn ob-primary",text:step==="code"?"Confirm":way==="otp"?"Send me a code":tab==="in"?"Sign in":"Create account"}));
   if(mode==="both"&&step==="form")form.append(h("button",{type:"button",cls:"ob-btn ob-alt",text:way==="otp"?"Use email and password":"Use a phone code",onclick:function(){way=way==="otp"?"password":"otp";draw()}}));
   var tabs=h("div",{cls:"ob-tabs",role:"tablist"});[["in","Sign in"],["up","Create account"]].forEach(function(t){tabs.append(h("button",{type:"button",role:"tab","aria-selected":String(tab===t[0]),text:t[1],onclick:function(){tab=t[0];step="form";draw()}}))});
   box.replaceChildren(h("div",{cls:"ob-card ob-narrow"},tabs,form));
  }
  function submit(e){e.preventDefault();var f=e.target,d={},b=f.querySelector(".ob-primary");new FormData(f).forEach(function(v,k){d[k]=k==="password"?String(v):String(v).trim()});
   var empty=[].find.call(f.elements,function(x){return x.required&&!x.value.trim()});if(empty){say(f,"Please fill in every field.");empty.focus();return}
   b.disabled=true;var op=step==="code"?"otp-verify":way==="password"?(tab==="in"?"login":"signup"):(tab==="up"?"signup":"otp-request");
   if(step==="code"){d.phone=phone;d.name=name}
   O.api(op,d).then(function(r){b.disabled=false;if(r.error||!r.ok){say(f,r.error||"That didn't work. Please try again.");return}
    if(way==="otp"&&step==="form"){phone=d.phone;name=d.name||"";step="code";draw(r.devCode);return}
    go("account")})}
  draw();
 });
};

W.account=function(box){
 O.api("me").then(function(r){
  if(!r.customer){go("login");return}
  var c=r.customer,list=h("div",{cls:"ob-card"},h("h2",{cls:"ob-h",text:"Your orders"}),h("p",{cls:"ob-dim",text:"Loading…"}));
  box.replaceChildren(h("div",{cls:"ob-grid"},list,h("aside",{cls:"ob-card"},h("h2",{cls:"ob-h",text:c.name}),c.email?h("p",{cls:"ob-dim",text:c.email}):null,c.phone?h("p",{cls:"ob-dim",text:c.phone}):null,h("button",{type:"button",cls:"ob-btn ob-alt",text:"Addresses, returns and rewards",onclick:function(){go("account-more")}}),h("button",{type:"button",cls:"ob-btn ob-alt",text:"Sign out",onclick:function(){O.api("logout").then(function(){go("home")})}}))));
  O.api("orders").then(function(o){var all=(o&&o.orders)||[];list.lastChild.remove();if(!all.length){list.append(h("p",{cls:"ob-dim",text:"No orders yet."}));return}
   all.forEach(function(x){list.append(h("div",{cls:"ob-line",style:"grid-template-columns:minmax(0,1fr) auto"},h("div",{},h("a",{cls:"ob-name",href:"#order:"+x.id,text:"Order "+String(x.id).slice(-6).toUpperCase()}),h("div",{cls:"ob-dim",text:new Date(x.createdAt).toLocaleDateString()+" · "+x.status}),h("div",{cls:"ob-dim",text:x.items.map(function(i){return i.qty+" × "+i.name}).join(", ")})),h("div",{cls:"ob-price",text:O.money(x.total)})))})});
 });
};

W.thanks=function(box){
 var o=O.order||(O.preview||parent===window?demoOrder():null);
 if(!o){box.replaceChildren(h("div",{cls:"ob-empty"},h("p",{text:"This order could not be found."}),h("a",{cls:"ob-btn ob-narrow",href:"#page:home",text:"Continue shopping"})));return}
 var card=h("div",{cls:"ob-card"},h("h2",{cls:"ob-h",text:"Order "+o.number}),h("p",{text:o.status==="cancelled"?"This order was cancelled. If that is a surprise, please contact us.":"Thank you, "+o.firstName+". We will call "+o.phone+" to confirm delivery."}));
 if(o.status!=="cancelled"){var S=[["pending","Placed"],["confirmed","Confirmed"],["shipped","Shipped"],["fulfilled","Delivered"]],at=S.findIndex(function(s){return s[0]===o.status});card.append(h("ol",{cls:"ob-steps"},S.map(function(s,i){return h("li",{cls:i<=Math.max(0,at)?"on":"",text:s[1]})})))}
 if(o.tracking)card.append(h("p",{cls:"ob-dim",text:"Tracking: "+o.tracking}));
 card.append(h("p",{cls:"ob-dim",text:"Delivering to: "+o.address}),h("p",{cls:"ob-dim",text:"Payment: "+o.payment}));
 var sum=h("aside",{cls:"ob-card ob-summary"},h("h2",{cls:"ob-h",text:"Summary"}));
 o.items.forEach(function(l){sum.append(h("div",{cls:"ob-row"},h("span",{text:l.qty+" × "+l.name+(l.variantLabel?" ("+l.variantLabel+")":"")}),h("span",{cls:"ob-price",text:O.money(l.price*l.qty)})))});
 rows(sum,[["Discount",o.discount>0?"− "+O.money(o.discount):null],["Tax",o.tax>0?O.money(o.tax):null],["Delivery",o.shipping>0?O.money(o.shipping):"Free"],["Total",O.money(o.total),1]]);
 sum.append(h("a",{cls:"ob-btn ob-primary",href:"#page:home",text:"Continue shopping"}));
 box.replaceChildren(h("div",{cls:"ob-grid"},card,sum));
};

function mount(){document.querySelectorAll("[data-orbit-widget]").forEach(function(s){if(s.__ob)return;s.__ob=1;s.classList.add("ob");var f=W[s.getAttribute("data-orbit-widget")];if(f)f(s)});
 // a fixed header must not sit on top of a page made from another page's shell
 var m=document.querySelector("main.ob-page"),hd=document.querySelector("header");if(m&&hd&&/fixed|absolute/.test(getComputedStyle(hd).position))m.style.paddingTop=Math.ceil(hd.getBoundingClientRect().bottom+40)+"px"}
addEventListener("DOMContentLoaded",function(){setTimeout(mount,0)});
})();`;
