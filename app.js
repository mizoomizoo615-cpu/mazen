
(function(){
'use strict';

/* ---------- constants ---------- */
var STATUS=['جديد','قيد التصنيع','تنجيد وتشطيب','جاهز للتسليم','تم التسليم','ملغي'];
var APPROVAL=['قيد المراجعة','معتمد','مرفوض'];
var TYPES=['طلب جديد','تفصيل خاص','تعديل طلب','صيانة / إصلاح'];
var PAY=['نقدي','آجل','شيك','تحويل بنكي','بطاقة'];
var PRIORITY=['عادي','مستعجل','عاجل جدًا'];
var BRANCH_HINTS=['الفرع الرئيسي','نقطة بيع 1','نقطة بيع 2'];

var orders=[]; var editingId=null;

/* ---------- helpers ---------- */
function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function num(v){var n=parseFloat(v);return isNaN(n)?0:n;}
function fmt(n){return (Math.round(n*100)/100).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});}
function today(){var d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10);}
function addDays(s,n){var d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10);}
function toast(m){var t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(function(){t.classList.remove('on');},2600);}
function uid(){return 'o'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function nextNo(){
  var y=new Date().getFullYear(),mx=0;
  orders.forEach(function(o){var m=/-(\d+)$/.exec(o.orderNo||'');if(m&&(o.orderNo||'').indexOf(String(y))>-1)mx=Math.max(mx,parseInt(m[1],10));});
  return 'ORD-'+y+'-'+('0000'+(mx+1)).slice(-4);
}
function isLate(o){return o.deliveryDate&&o.deliveryDate<today()&&o.status!==STATUS[4]&&o.status!==STATUS[5];}
function sIdx(s){var i=STATUS.indexOf(s);return i<0?0:i;}

/* ---------- header field config ---------- */
function opt(arr){return arr.map(function(x){return '<option>'+esc(x)+'</option>';}).join('');}
function field(id,label,type,extra){
  extra=extra||{};
  var cls=(extra.cls||'')+'';
  var inner;
  if(type==='select') inner='<select id="'+id+'">'+opt(extra.opts)+'</select>';
  else if(type==='textarea') inner='<textarea id="'+id+'"></textarea>';
  else if(type==='check') return '<div class="'+cls+'"><label> </label><label class="chk"><input type="checkbox" id="'+id+'">'+esc(label)+'</label></div>';
  else inner='<input id="'+id+'" type="'+type+'"'+(extra.list?' list="'+extra.list+'"':'')+(extra.ro?' readonly':'')+(extra.step?' step="'+extra.step+'"':'')+'>';
  return '<div class="'+cls+'"><label for="'+id+'"'+(extra.req?' class="req"':'')+'>'+esc(label)+'</label>'+inner+'</div>';
}
function build(){
  $('hdrGrid').innerHTML=
    field('orderNo','رقم الطلب','text',{ro:true})+
    field('branch','الفرع / نقطة البيع','text',{list:'dlBranch',req:true})+
    field('type','نوع الطلب','select',{opts:TYPES})+
    field('orderDate','تاريخ الطلب','date',{req:true})+
    field('deliveryDate','تاريخ إنهاء الطلب (التسليم)','date',{req:true})+
    field('payMethod','طريقة الدفع','select',{opts:PAY})+
    field('priority','الأولوية','select',{opts:PRIORITY})+
    field('status','حالة الطلب / مرحلة التنفيذ','select',{opts:STATUS})+
    field('approval','حالة الاعتماد','select',{opts:APPROVAL})+
    field('refNo','رقم المرجع (عرض سعر / عقد)','text')+
    field('refDate','تاريخ المرجع','date')+
    field('currency','العملة','text',{list:'dlCur'})+
    field('rate','سعر التحويل','number',{step:'any'})+
    field('warehouse','المخزن','text')+
    field('costCenter','مركز التكلفة','text')+
    field('reserved','حجز كميات من المخزون','check')+
    field('stopped','إيقاف الطلب مؤقتًا','check')+
    field('poLinked','مرتبط بأمر شراء (خامات)','check');
  $('custGrid').innerHTML=
    field('custNo','رقم العميل','text')+
    field('custName','اسم العميل','text',{req:true,cls:'wide'})+
    field('phone','رقم التليفون','tel')+
    field('taxNo','الرقم الضريبي','text')+
    field('area','المنطقة','text')+
    field('address','العنوان وموقع التركيب','text',{cls:'wide'})+
    field('repNo','رقم المندوب','text')+
    field('marketerNo','رقم المسوق','text')+
    field('driverNo','رقم السائق','text')+
    field('notes','البيان / ملاحظات التصنيع','textarea',{cls:'full'});
  $('totGrid').innerHTML=
    field('totQty','إجمالي الكميات','text',{ro:true})+
    field('subtotal','المجموع','text',{ro:true})+
    field('itemDisc','خصم الأصناف','text',{ro:true})+
    field('discPct','خصم عام %','number',{step:'any'})+
    field('charges','الأعباء (نقل / تركيب)','number',{step:'any'})+
    field('taxPct','الضريبة %','number',{step:'any'})+
    field('taxVal','قيمة الضريبة','text',{ro:true})+
    '<div class="net"><label for="net">صافي المبلغ</label><input id="net" readonly></div>'+
    field('deposit','العربون المدفوع','number',{step:'any'})+
    field('remain','المتبقي على العميل','text',{ro:true});
  var dl='<datalist id="dlBranch">'+BRANCH_HINTS.map(function(x){return '<option value="'+esc(x)+'">';}).join('')+'</datalist>'+
         '<datalist id="dlCur"><option value="ر.س"><option value="ر.ي"><option value="USD"><option value="ج.م"><option value="د.إ"></datalist>';
  document.body.insertAdjacentHTML('beforeend',dl);
}

/* ---------- lines ---------- */
var LCOLS=[['code','text'],['name','text'],['unit','text'],['spec','text'],['size','text'],['color','text'],['batch','text'],
  ['qty','number'],['free','number'],['price','number'],['disc','number'],['total','calc'],
  ['rsvQty','number','rsv'],['rsvTo','date','rsv'],['barcode','text']];
var curImgs=[];
function renderOrdImgs(){
  $('ordImgs').innerHTML=curImgs.length?curImgs.map(function(m,i){
    return '<div class="ordimg"><img class="thumb big" src="'+m.src+'" alt="صورة الطلب"><input data-i="'+i+'" value="'+esc(m.cap||'')+'" placeholder="وصف الصورة" aria-label="وصف الصورة"><button class="btn sm red" data-i="'+i+'" type="button">حذف</button></div>';
  }).join(''):'<span class="empty" style="padding:6px">لا توجد صور مرفقة بالطلب.</span>';
}
function ordImgsHtml(o){
  var a=o.images||[];if(!a.length)return '';
  return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">'+a.map(function(m){return '<figure style="margin:0;text-align:center"><img style="width:150px;height:110px;object-fit:cover;border:1px solid #444;border-radius:14px;box-shadow:0 3px 10px rgba(0,0,0,.3)" src="'+m.src+'" alt=""><figcaption>'+esc(m.cap)+'</figcaption></figure>';}).join('')+'</div>';
}
function ordImgsLarge(o){
  var a=o.images||[];if(!a.length)return '';
  var n=a.length,cols=n===1?1:(n<=4?2:3),rows=Math.ceil(n/cols),mh=Math.floor(176/rows)-(rows>1?4:0);
  return '<div style="display:grid;grid-template-columns:repeat('+cols+',1fr);gap:6px;margin:8px 0;page-break-after:always;break-after:page">'+
    a.map(function(m){return '<figure style="margin:0;height:'+mh+'mm;display:flex;flex-direction:column"><img style="flex:1;min-height:0;width:100%;height:100%;object-fit:contain;background:#f6f3ef;border:1px solid #444;border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,.3)" src="'+m.src+'" alt="">'+(m.cap&&n>1?'<figcaption style="text-align:center">'+esc(m.cap)+'</figcaption>':'')+'</figure>';}).join('')+'</div>';
}
function ordImgStrip(o){
  var a=o.images||[];if(!a.length)return '';
  return '<div class="bar" style="margin-top:8px">'+a.map(function(m){return '<div class="ordimg"><img class="thumb big" src="'+m.src+'" alt=""><small>'+esc(m.cap)+'</small></div>';}).join('')+'</div>';
}
function imgCell(src,ctx,i){
  return '<div class="imgcell">'+(src?'<img class="thumb" src="'+src+'" alt="صورة">':'')+
    '<button class="btn sm ghost" data-a="imgpick" data-ctx="'+ctx+'" data-i="'+i+'" type="button">'+(src?'تغيير':'+ صورة')+'</button>'+
    (src?'<button class="btn sm red" data-a="imgrm" data-ctx="'+ctx+'" data-i="'+i+'" type="button" aria-label="حذف الصورة">×</button>':'')+'</div>';
}
function paintImg(tr){tr.querySelector('.imgc').innerHTML=imgCell(tr._img,'line','');}
function pickImage(cb){
  var f=$('imgIn');f.value='';
  f.onchange=function(){
    var file=f.files[0];if(!file)return;
    if(!/^image\//.test(file.type)){toast('اختر ملف صورة');return;}
    var r=new FileReader();
    r.onload=function(){
      var im=new Image();
      im.onload=function(){
        var s=Math.min(1,900/Math.max(im.width,im.height)),c=document.createElement('canvas');
        c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));
        var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
        cb(c.toDataURL('image/jpeg',0.78));
      };
      im.onerror=function(){toast('تعذر قراءة الصورة');};
      im.src=r.result;
    };
    r.readAsDataURL(file);
  };
  f.click();
}
function lineRow(l){
  l=l||{};
  var tr=document.createElement('tr');
  var h='<td class="n"></td>';
  tr._img=l.img||'';
  LCOLS.forEach(function(c){
    var k=c[0],t=c[1],cls=c[2]||'';
    if(t==='calc'){h+='<td class="calc"><input data-k="total" readonly tabindex="-1"></td>';return;}
    h+='<td class="'+cls+'"><input data-k="'+k+'" type="'+t+'"'+(t==='number'?' step="any" min="0"':'')+' value="'+esc(l[k]==null?'':l[k])+'"'+(k==='unit'&&!l[k]?' placeholder="قطعة"':'')+'></td>';
    if(k==='name')h+='<td class="imgc"></td>';
  });
  h+='<td class="del"><button type="button" title="حذف الصنف" aria-label="حذف الصنف">×</button></td>';
  tr.innerHTML=h;
  tr._parts=(l.parts||[]).map(function(p){return JSON.parse(JSON.stringify(p));});
  paintParts(tr);
  paintImg(tr);
  tr.querySelector('.imgc').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b)return;
    if(b.dataset.a==='imgpick')pickImage(function(d){tr._img=d;paintImg(tr);});
    else{tr._img='';paintImg(tr);}
  });
  tr.querySelector('.del button').onclick=function(){
    var b=$('linesBody'); if(b.children.length>1){b.removeChild(tr);renum();calc();}
  };
  return tr;
}
function renum(){Array.prototype.forEach.call($('linesBody').children,function(tr,i){tr.querySelector('.n').textContent=i+1;});}
function setLines(arr){
  var b=$('linesBody');b.innerHTML='';
  (arr&&arr.length?arr:[{},{},{}]).forEach(function(l){b.appendChild(lineRow(l));});
  renum();calc();
}
function readLines(){
  var out=[];
  Array.prototype.forEach.call($('linesBody').children,function(tr){
    var l={};tr.querySelectorAll('input[data-k]').forEach(function(i){if(i.dataset.k!=='total')l[i.dataset.k]=i.value;});
    l.total=num(tr.querySelector('[data-k=total]').value.replace(/,/g,''));
    l.img=tr._img||'';
    l.parts=(tr._parts||[]).map(function(p){return JSON.parse(JSON.stringify(p));});
    out.push(l);
  });
  return out;
}

/* ---------- مكونات الطقم (غرفة نوم وغيرها) ---------- */
var PARTS_PRESETS={
 'غرفة نوم':[['سرير','',1],['دولاب','',1],['تسريحة بمرآة','',1],['كومدينو','',2],['أجور توصيل وتركيب','s',1]],
 'غرفة سفرة':[['طاولة سفرة','',1],['كراسي سفرة','',6],['نيش / بوفيه','',1],['أجور توصيل وتركيب','s',1]],
 'صالون':[['كنبة ثلاثية','',1],['كنبة ثنائية','',1],['كرسي مفرد','',2],['ترابيزة وسط','',1],['أجور توصيل','s',1]],
 'غرفة أطفال':[['سرير أطفال','',1],['دولاب','',1],['مكتب','',1],['كرسي مكتب','',1],['أجور توصيل وتركيب','s',1]]
};
var pdState=null;
function partsSum(ps){return (ps||[]).reduce(function(a,p){return a+(num(p.qty)||1)*num(p.price);},0);}
function autoPrice(tr){
  var pi=tr.querySelector('[data-k=price]'),sum=partsSum(tr._parts);
  if(sum>0){pi.value=Math.round(sum*100)/100;pi.readOnly=true;pi.title='محسوب من مكونات الطقم';}
  else if(pi.readOnly){pi.readOnly=false;pi.title='';}
}
function paintParts(tr){
  var td=tr.querySelector('[data-k=name]').parentNode,d=td.querySelector('.partsbtn');
  if(!d){d=document.createElement('div');d.className='partsbtn';td.appendChild(d);d.addEventListener('click',function(e){if(e.target.closest('button'))openParts(tr);});}
  var n=(tr._parts||[]).length;
  d.innerHTML='<button type="button" class="btn sm ghost">'+(n?'مكونات الطقم ('+n+')':'+ مكونات الطقم')+'</button>';
}
function pdRender(){
  var rows=pdState.rows;
  $('pdBody').innerHTML=rows.length?rows.map(function(p,i){
    function t(k,type,ph){return '<td><input data-i="'+i+'" data-k="'+k+'" type="'+(type||'text')+'"'+(type==='number'?' step="any" min="0"':'')+(ph?' placeholder="'+ph+'"':'')+' value="'+esc(p[k]==null?'':p[k])+'"></td>';}
    return '<tr><td><select data-i="'+i+'" data-k="svc"><option value="m"'+(p.svc?'':' selected')+'>تصنيع</option><option value="s"'+(p.svc?' selected':'')+'>خدمة</option></select></td>'+
      t('name','text')+t('code','text','مثال: BR101-BED')+t('size','text','مثال: 180×200')+t('color','text','مثال: تنجيد بيج')+t('qty','number')+t('price','number')+t('note','text')+
      '<td><button class="btn sm red" data-a="pddel" data-i="'+i+'" type="button" aria-label="حذف المكوّن">×</button></td></tr>';
  }).join(''):'<tr><td colspan="9" class="empty">لا توجد مكونات. أضف مكوّنًا أو حمّل مكونات جاهزة.</td></tr>';
  $('pdSum').textContent=fmt(partsSum(rows));
}
function openParts(tr){
  var nm=tr.querySelector('[data-k=name]').value.trim();
  if(!nm){toast('اكتب اسم الصنف أولًا، مثل: غرفة نوم موديل 101');return;}
  pdState={tr:tr,rows:(tr._parts||[]).map(function(p){return JSON.parse(JSON.stringify(p));})};
  $('pdT').textContent='مكونات: '+nm;
  $('pdPreset').innerHTML='<option value="">— مكونات جاهزة —</option>'+Object.keys(PARTS_PRESETS).map(function(k){return '<option>'+esc(k)+'</option>';}).join('');
  pdRender();$('partsDlg').style.display='grid';
}
function pdApply(){
  var rows=pdState.rows.filter(function(p){return (p.name||'').trim()||num(p.price)>0;}),seen={};
  for(var i=0;i<rows.length;i++){
    var p=rows[i];
    if(!(p.name||'').trim()){toast('اكتب اسم كل مكوّن');return;}
    if(!p.svc&&num(p.qty)<=0){toast('كمية المكوّن '+p.name+' يجب أن تكون أكبر من صفر');return;}
    if(!p.svc){var k=lkey(p.name);if(seen[k]){toast('المكوّن "'+p.name+'" مكرر. استخدم الكمية للطقم أو غيّر الاسم (مثل: كومدينو يمين / كومدينو يسار)');return;}seen[k]=1;}
  }
  rows.forEach(function(p){p.name=p.name.trim();if(!num(p.qty))p.qty=1;});
  pdState.tr._parts=rows;paintParts(pdState.tr);calc();formDirty=true;
  $('partsDlg').style.display='none';pdState=null;
}
function initParts(){
  $('pdBody').addEventListener('input',function(e){
    var t=e.target;if(t.dataset.i===undefined||!pdState)return;
    var p=pdState.rows[+t.dataset.i];
    if(t.dataset.k==='svc'){p.svc=t.value==='s';if(p.svc){p.code='';p.size='';p.color='';}pdRender();return;}
    p[t.dataset.k]=t.value;$('pdSum').textContent=fmt(partsSum(pdState.rows));
  });
  $('pdBody').addEventListener('click',function(e){var b=e.target.closest('button[data-a=pddel]');if(b&&pdState){pdState.rows.splice(+b.dataset.i,1);pdRender();}});
  $('pdAdd').onclick=function(){if(pdState){pdState.rows.push({svc:false,name:'',code:'',size:'',color:'',qty:1,price:'',note:''});pdRender();}};
  $('pdAddSvc').onclick=function(){if(pdState){pdState.rows.push({svc:true,name:'أجور توصيل وتركيب',code:'',size:'',color:'',qty:1,price:'',note:''});pdRender();}};
  $('pdLoad').onclick=function(){
    var k=$('pdPreset').value;if(!k||!pdState)return;
    var have={};pdState.rows.forEach(function(p){have[lkey(p.name)]=1;});
    PARTS_PRESETS[k].forEach(function(r){if(have[lkey(r[0])])return;pdState.rows.push({svc:r[1]==='s',name:r[0],code:'',size:'',color:'',qty:r[2],price:'',note:''});});
    pdRender();
  };
  $('pdApply').onclick=pdApply;
  $('pdCancel').onclick=function(){$('partsDlg').style.display='none';pdState=null;};
}

/* ---------- calculations ---------- */
function compute(lines,discPct,charges,taxPct,deposit){
  var qty=0,gross=0,disc=0;
  lines.forEach(function(l){
    var q=num(l.qty),p=num(l.price),d=num(l.disc);
    qty+=q+num(l.free);gross+=q*p;disc+=d;
  });
  var sub=gross-disc, dv=sub*num(discPct)/100, taxable=sub-dv, tax=taxable*num(taxPct)/100;
  var net=taxable+num(charges)+tax;
  return {qty:qty,gross:gross,itemDisc:disc,subtotal:sub,tax:tax,net:net,remain:net-num(deposit)};
}
function calc(){
  var lines=[];
  Array.prototype.forEach.call($('linesBody').children,function(tr){
    autoPrice(tr);
    var g=function(k){return tr.querySelector('[data-k='+k+']').value;};
    var q=num(g('qty')),p=num(g('price')),d=num(g('disc'));
    tr.querySelector('[data-k=total]').value=(q||p)?fmt(q*p-d):'';
    lines.push({qty:g('qty'),free:g('free'),price:g('price'),disc:g('disc')});
  });
  var r=compute(lines,$('discPct').value,$('charges').value,$('taxPct').value,$('deposit').value);
  $('totQty').value=fmt(r.qty);$('subtotal').value=fmt(r.subtotal);$('itemDisc').value=fmt(r.itemDisc);
  $('taxVal').value=fmt(r.tax);$('net').value=fmt(r.net);$('remain').value=fmt(r.remain);
}

/* ---------- form <-> object ---------- */
var FKEYS=['orderNo','branch','type','orderDate','deliveryDate','payMethod','priority','status','approval','refNo','refDate','currency','rate','warehouse','costCenter',
  'custNo','custName','phone','taxNo','area','address','repNo','marketerNo','driverNo','notes','discPct','charges','taxPct','deposit'];
var FCHK=['reserved','stopped','poLinked'];
function fillForm(o){
  FKEYS.forEach(function(k){$(k).value=o[k]==null?'':o[k];});
  FCHK.forEach(function(k){$(k).checked=!!o[k];});
  curImgs=(o.images||[]).map(function(m){return {src:m.src,cap:m.cap||''};});renderOrdImgs();
  setLines(o.lines);
  $('formTitle').textContent=editingId?'تعديل الطلب '+o.orderNo:'بيانات الطلب';
  formDirty=false;
}
function blank(){
  return {orderNo:nextNo(),branch:'',type:TYPES[0],orderDate:today(),deliveryDate:addDays(today(),21),payMethod:PAY[0],priority:PRIORITY[0],
    status:STATUS[0],approval:APPROVAL[0],discPct:0,charges:0,taxPct:0,deposit:0,lines:[]};
}
function readForm(){
  var o={};FKEYS.forEach(function(k){o[k]=$(k).value.trim?$(k).value.trim():$(k).value;});
  FCHK.forEach(function(k){o[k]=$(k).checked;});
  o.images=curImgs.map(function(m){return {src:m.src,cap:m.cap};});
  o.lines=readLines().filter(function(l){return (l.name||'').trim()||(l.code||'').trim();});
  var r=compute(o.lines,o.discPct,o.charges,o.taxPct,o.deposit);
  o.totQty=r.qty;o.subtotal=r.subtotal;o.net=r.net;o.remain=r.remain;o.tax=r.tax;
  return o;
}
var saveOk=false,formDirty=false,curView='home';
function save(){
  saveOk=false;
  var o=readForm();
  var miss=[];
  if(!o.branch)miss.push('الفرع');
  if(!o.custName)miss.push('اسم العميل');
  if(!o.orderDate)miss.push('تاريخ الطلب');
  if(!o.deliveryDate)miss.push('تاريخ التسليم');
  if(miss.length){toast('أكمل الحقول المطلوبة: '+miss.join('، '));return;}
  if(!o.lines.length||!o.lines.some(function(l){return num(l.qty)>0;})){toast('أضف صنفًا واحدًا على الأقل بكمية أكبر من صفر');return;}
  if(o.deliveryDate<o.orderDate){toast('تاريخ التسليم لا يمكن أن يسبق تاريخ الطلب');return;}
  if(o.net<0){toast('صافي المبلغ سالب، راجع الخصومات');return;}
  if(num(o.deposit)>o.net){toast('العربون أكبر من صافي المبلغ');return;}
  if(!editingId&&orders.some(function(x){return x.orderNo===o.orderNo;}))o.orderNo=nextNo();
  if(editingId){
    var i=orders.findIndex(function(x){return x.id===editingId;});
    o.id=editingId;orders[i]=o;toast('تم تحديث الطلب '+o.orderNo);
  }else{
    o.id=uid();orders.push(o);toast('تم حفظ الطلب '+o.orderNo);
  }
  saveOk=true;editingId=null;fillForm(blank());show('list');refresh();
}

/* ---------- views ---------- */
function show(v){
  if(!can(v)){toast('هذا القسم غير متاح لصلاحيتك');return;}
  var prevView=curView;
  curView=v;document.body.classList.toggle('at-home',v==='home');
  document.querySelectorAll('.view').forEach(function(s){s.classList.toggle('on',s.id==='v-'+v);});
  document.querySelectorAll('.tab').forEach(function(t){t.setAttribute('aria-selected',t.dataset.v===((v==='catsec'||v==='catsub')?'cat':v)?'true':'false');});
  if(v==='mats'){renderMats();renderBomEd();}
  if(v==='panel')renderPanelCalc();
  if(v==='job')renderTpls();
  if(v!=='gal')galCtx=null;
  if(v==='gal'){if(!galCtx)galManage=true;renderGal();}
  if(v!=='cat'&&v!=='catsec'&&v!=='catsub')catCtx=null;
  if(v==='cat'){if(!catCtx&&prevView!=='catsec'&&prevView!=='catsub')catManage=true;renderCatSecs();}
  if(v==='catsub')renderCatSubPage();
  if(v==='catsec')renderCatSec();
  refresh();
  window.scrollTo(0,0);
}
function renderHome(){
  try{
    var M=mrp(true),O=function(o){return o.status!==STATUS[4]&&o.status!==STATUS[5];};
    var cyc=0;orders.filter(O).forEach(function(o){var S=cycleOf(o,M);for(var i=1;i<S.length;i++){if(S[i].s==='todo'||S[i].s==='part'){cyc++;break;}}});
    var v={
      dash:orders.filter(isLate).length,
      form:orders.filter(function(o){return o.orderDate===today();}).length,
      list:orders.length,
      cycle:cyc,
      mats:products().filter(function(p){return !p.bom;}).length,
      mrp:M.list.filter(function(x){return x.short>0;}).length,
      pr:prs.filter(function(p){return PR_OPEN.indexOf(p.status)>-1;}).length,
      job:orders.filter(function(o){return [STATUS[0],STATUS[1],STATUS[2],STATUS[3]].indexOf(o.status)>-1;}).length,
      scope:orders.filter(function(o){return O(o)&&!(scopes[o.id]&&scopes[o.id].status===SCS[2]);}).length,
      cost:orders.filter(function(o){return O(o)&&!(costs[o.id]&&costs[o.id].status===CSTS[1]);}).length,
      xfer:xfers.filter(function(x){return !x.confirmed;}).length,
      cat:catalog.length,
      gal:gallery.length,
      panel:pcFilled()
    };
    var warn={dash:1,mrp:1,cycle:1,mats:1,scope:1,cost:1,xfer:1};
    Object.keys(v).forEach(function(k){
      var b=document.querySelector('.hbadge[data-b='+k+']');if(!b)return;
      var e=b.firstChild,t=String(v[k]);
      if(e.textContent!==t){e.textContent=t;b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop');}
      b.classList.toggle('bad',!!warn[k]&&v[k]>0);b.classList.toggle('zero',v[k]===0);
    });
  }catch(e){}
}
function refresh(){renderDash();renderList();renderProd();renderHome();schedSave();}

function bars(el,rows,cls){
  var mx=Math.max.apply(null,rows.map(function(r){return r[1];}).concat([1]));
  el.innerHTML=rows.length?rows.map(function(r,i){
    return '<div class="hbar '+(cls?cls(i):'')+'"><span>'+esc(r[0])+'</span><div class="track"><i style="width:'+(r[1]/mx*100)+'%"></i></div><b>'+r[1]+'</b></div>';
  }).join(''):'<div class="empty">لا توجد بيانات بعد</div>';
}
function renderDash(){
  var open=orders.filter(function(o){return o.status!==STATUS[4]&&o.status!==STATUS[5];});
  var late=orders.filter(isLate);
  var active=orders.filter(function(o){return o.status!==STATUS[5];});
  var tot=active.reduce(function(a,o){return a+num(o.net);},0);
  var rem=active.reduce(function(a,o){return a+num(o.remain);},0);
  var ready=orders.filter(function(o){return o.status===STATUS[3];}).length;
  $('kpis').innerHTML=
    '<div class="kpi"><b>'+orders.length+'</b><span>إجمالي الطلبات</span></div>'+
    '<div class="kpi t"><b>'+open.length+'</b><span>طلبات مفتوحة قيد التنفيذ</span></div>'+
    '<div class="kpi g"><b>'+ready+'</b><span>جاهزة للتسليم</span></div>'+
    '<div class="kpi r"><b>'+late.length+'</b><span>متأخرة عن موعد التسليم</span></div>'+
    '<div class="kpi"><b>'+fmt(tot)+'</b><span>قيمة الطلبات (دون الملغاة)</span></div>'+
    '<div class="kpi r"><b>'+fmt(rem)+'</b><span>المتبقي تحصيله من العملاء</span></div>'+prodKpis();
  bars($('chStatus'),STATUS.map(function(s){return [s,orders.filter(function(o){return o.status===s;}).length];}),function(i){return 's'+i;});
  var br={};orders.forEach(function(o){var b=o.branch||'غير محدد';br[b]=(br[b]||0)+1;});
  bars($('chBranch'),Object.keys(br).map(function(k){return [k,br[k]];}).sort(function(a,b){return b[1]-a[1];}),function(){return 's4';});
  var due=open.slice().sort(function(a,b){return (a.deliveryDate||'').localeCompare(b.deliveryDate||'');}).slice(0,8);
  $('dueTbl').innerHTML=due.length?
    '<thead><tr><th>رقم الطلب</th><th>العميل</th><th>الفرع</th><th>موعد التسليم</th><th>المرحلة</th><th>المتبقي</th></tr></thead><tbody>'+
    due.map(function(o){return '<tr><td>'+esc(o.orderNo)+'</td><td>'+esc(o.custName)+'</td><td>'+esc(o.branch)+'</td><td class="num '+(isLate(o)?'late':'')+'">'+esc(o.deliveryDate)+(isLate(o)?' (متأخر)':'')+'</td><td><span class="tag s'+sIdx(o.status)+'">'+esc(o.status)+'</span></td><td class="num">'+fmt(num(o.remain))+'</td></tr>';}).join('')+'</tbody>'
    :'<tbody><tr><td class="empty">لا توجد طلبات مفتوحة. سجّل طلبك الأول من تبويب «تسجيل طلب».</td></tr></tbody>';
}
function filtered(){
  var q=$('q').value.trim().toLowerCase(),fs=$('fStatus').value,fb=$('fBranch').value,fl=$('fLate').value,t=today(),t7=addDays(t,7);
  return orders.filter(function(o){
    if(fs&&o.status!==fs)return false;
    if(fb&&o.branch!==fb)return false;
    if(fl==='late'&&!isLate(o))return false;
    if(fl==='due'&&!(o.deliveryDate>=t&&o.deliveryDate<=t7&&o.status!==STATUS[4]&&o.status!==STATUS[5]))return false;
    if(q){
      var hay=[o.orderNo,o.custName,o.phone,o.custNo].concat((o.lines||[]).map(function(l){return (l.name||'')+' '+(l.code||'');})).join(' ').toLowerCase();
      if(hay.indexOf(q)<0)return false;
    }
    return true;
  }).sort(function(a,b){return (b.orderDate||'').localeCompare(a.orderDate||'')||(b.orderNo||'').localeCompare(a.orderNo||'');});
}
function firstImg(o){
  var src=(o.images&&o.images[0]&&o.images[0].src)||'';
  if(!src)(o.lines||[]).some(function(l){if(l.img){src=l.img;return true;}return false;});
  return src?'<img class="thumb" src="'+src+'" alt="صورة الطلب">':'';
}
/* ---------- بطاقات جديدة (سجل الطلبات / الدورة المستندية / مراحل التصنيع) ---------- */
var OC_ART='<svg viewBox="0 0 120 100" aria-hidden="true" focusable="false"><rect x="22" y="12" width="76" height="46" rx="22" fill="#d9b48a"/><rect x="8" y="40" width="26" height="40" rx="13" fill="#c99763"/><rect x="86" y="40" width="26" height="40" rx="13" fill="#c99763"/><rect x="26" y="52" width="68" height="28" rx="12" fill="#e7c9a3"/><rect x="38" y="24" width="44" height="22" rx="11" fill="#f1dcc0" opacity=".75"/><rect x="30" y="80" width="6" height="14" rx="3" fill="#8a5a35"/><rect x="84" y="80" width="6" height="14" rx="3" fill="#8a5a35"/></svg>';
/* ---------- شرائح الطلبات: تنقل تلقائي + أسهم + نقاط + سحب ---------- */
var OCS_MS=5000;
function ocSlide(el){
  var cards=[].slice.call(el.querySelectorAll(':scope > .oc'));
  if(!cards.length){el.classList.remove('ocs');return;}
  var keep=el._i||0,n=cards.length;
  clearTimeout(el._t);
  el.classList.add('ocs');el._i=Math.min(keep,n-1);el._pause=false;
  var many=n>10,dots='';
  for(var k=0;k<(many?1:n);k++)dots+='<button type="button" class="ocs-dot" data-k="'+k+'" aria-label="الطلب '+(k+1)+'"></button>';
  el.innerHTML='<div class="ocs-vp"><div class="ocs-track">'+cards.map(function(c){return c.outerHTML;}).join('')+'</div></div>'+
    '<div class="ocs-nav"><button type="button" class="ocs-btn" data-d="-1" aria-label="السابق">›</button><div class="ocs-dots'+(many?' many':'')+'">'+dots+'</div>'+
    (n>1?'<span class="ocs-count"></span>':'')+'<button type="button" class="ocs-btn" data-d="1" aria-label="التالي">‹</button></div>';
  if(n<2)el.classList.add('single');
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches;
  function paint(){
    var tr=el.querySelector('.ocs-track');
    el.style.setProperty('--dir',getComputedStyle(el).direction==='rtl'?1:-1);
    tr.style.setProperty('--i',el._i);
    [].forEach.call(el.querySelectorAll('.oc'),function(c,j){c.classList.toggle('cur',j===el._i);c.setAttribute('aria-hidden',j===el._i?'false':'true');});
    var ds=el.querySelectorAll('.ocs-dot');
    [].forEach.call(ds,function(d,j){d.classList.remove('on');if(many?true:j===el._i){void d.offsetWidth;d.classList.add('on');}});
    el.classList.toggle('paused',el._pause);
    var ct=el.querySelector('.ocs-count');if(ct)ct.textContent=(el._i+1)+' / '+n;
    clearTimeout(el._t);
    if(n>1&&!el._pause&&!reduce)el._t=setTimeout(tick,OCS_MS);
  }
  function go(i){el._i=((i%n)+n)%n;paint();}
  function tick(){
    if(!el.isConnected)return;
    if(el.offsetParent===null||document.hidden){el._t=setTimeout(tick,1000);return;}
    go(el._i+1);
  }
  function setPause(v){if(el._pause===v)return;el._pause=v;paint();}
  el.onclick=function(e){
    var b=e.target.closest('.ocs-btn');if(b){go(el._i+(+b.dataset.d));return;}
    var d=e.target.closest('.ocs-dot');if(d&&!many){go(+d.dataset.k);}
  };
  el.onmouseenter=function(){setPause(true);};
  el.onmouseleave=function(){if(!el.querySelector('.oc>input:checked')&&!el.contains(document.activeElement))setPause(false);};
  el.onfocusin=function(){setPause(true);};
  el.onfocusout=function(){setTimeout(function(){if(!el.matches(':hover')&&!el.querySelector('.oc>input:checked'))setPause(false);},50);};
  el.onchange=function(e){if(e.target.matches('.oc>input')){var open=!!el.querySelector('.oc>input:checked');if(open)setPause(true);else if(!el.matches(':hover'))setPause(false);}};
  var x0=null;
  el.ontouchstart=function(e){x0=e.touches[0].clientX;setPause(true);};
  el.ontouchend=function(e){
    if(x0!==null){var dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>45){var rtl=getComputedStyle(el).direction==='rtl';go(el._i+(dx>0?1:-1)*(rtl?1:-1));}}
    x0=null;setTimeout(function(){if(!el.querySelector('.oc>input:checked'))setPause(false);},4000);
  };
  paint();
}
function firstSrc(o){
  var src=(o.images&&o.images[0]&&o.images[0].src)||'';
  if(!src)(o.lines||[]).some(function(l){if(l.img){src=l.img;return true;}return false;});
  return src;
}
function ocImg(o,id){
  var s=firstSrc(o);
  return s?'<label for="'+id+'" class="oc-img" title="اضغط لتكبير الصورة"><img src="'+s+'" alt="صورة الطلب" loading="lazy"></label>'
          :'<div class="oc-img ph">'+OC_ART+'</div>';
}
function ocKV(k,v,cls){return '<div><span>'+k+'</span><b'+(cls?' class="'+cls+'"':'')+'>'+v+'</b></div>';}
function ocCard(o,id,tagsHtml,kvHtml,actHtml){
  return '<article class="oc"><input type="checkbox" id="'+id+'" aria-label="تكبير الصورة"><div class="oc-inner">'+ocImg(o,id)+
    '<div class="oc-content"><div class="title">'+esc(o.orderNo)+'</div><div class="sub">'+esc(o.custName)+'</div>'+
    '<div class="oc-tags">'+tagsHtml+'</div><div class="text">'+kvHtml+'</div><div class="oc-actions">'+actHtml+'</div></div></div></article>';
}

/* ---------- وضع عرض سجل الطلبات: شرائح / شبكي / جدولي ---------- */
var LIST_MODE=(function(){var m='slide';try{m=localStorage.getItem('ordersListMode')||'slide';}catch(e){}return ['slide','grid','table'].indexOf(m)<0?'slide':m;})();
function syncListMode(){
  [].forEach.call(document.querySelectorAll('#listMode button'),function(b){b.setAttribute('aria-pressed',b.dataset.m===LIST_MODE?'true':'false');});
}
function setListMode(m){
  if(['slide','grid','table'].indexOf(m)<0||m===LIST_MODE)return;
  LIST_MODE=m;try{localStorage.setItem('ordersListMode',m);}catch(e){}
  renderList();
}
/* إلغاء سلوك الشرائح (التنقل التلقائي) عند العرض الشبكي أو الجدولي */
function ocPlain(el){
  clearTimeout(el._t);
  el.classList.remove('ocs','single','paused');
  el.onclick=el.onmouseenter=el.onmouseleave=el.onfocusin=el.onfocusout=el.onchange=el.ontouchstart=el.ontouchend=null;
  el.style.removeProperty('--dir');
}

function renderList(){
  var fs=$('fStatus').value,fb=$('fBranch').value;
  $('fStatus').innerHTML='<option value="">كل المراحل</option>'+opt(STATUS);$('fStatus').value=fs;
  var bs=[];orders.forEach(function(o){if(o.branch&&bs.indexOf(o.branch)<0)bs.push(o.branch);});
  $('fBranch').innerHTML='<option value="">كل الفروع</option>'+opt(bs);$('fBranch').value=fb;
  var rows=filtered(),box=$('recTbl');
  syncListMode();
  function tagsOf(o){return '<span class="tag s'+sIdx(o.status)+'">'+esc(o.status)+'</span>'+(o.stopped?'<span class="tag s5">موقوف</span>':'')+(o.priority&&o.priority!==PRIORITY[0]?'<span class="tag s5">'+esc(o.priority)+'</span>':'');}
  function actOf(o){return '<button class="btn sm ghost" data-a="print" data-id="'+o.id+'" type="button">طباعة</button><button class="btn sm ghost" data-a="edit" data-id="'+o.id+'" type="button">تعديل</button><button class="btn sm red" data-a="del" data-id="'+o.id+'" type="button">حذف</button>';}
  /* وضع العرض: شرائح / شبكي / جدولي */
  if(LIST_MODE==='table'){
    ocPlain(box);box.classList.remove('ocards');
    box.innerHTML=rows.length?
      '<table class="rec otbl"><thead><tr><th>م</th><th>رقم الطلب</th><th>صورة</th><th>التاريخ</th><th>العميل</th><th>الهاتف</th><th>الفرع</th><th>موعد التسليم</th><th>المرحلة</th><th>الاعتماد</th><th>الصافي</th><th>المتبقي</th><th>إجراءات</th></tr></thead><tbody>'+
      rows.map(function(o,i){
        return '<tr><td>'+(i+1)+'</td><td><b>'+esc(o.orderNo)+'</b></td><td>'+(firstImg(o)||'—')+'</td><td class="num">'+esc(o.orderDate)+'</td><td>'+esc(o.custName)+'</td><td class="num">'+esc(o.phone)+'</td><td>'+esc(o.branch)+'</td>'+
          '<td class="num'+(isLate(o)?' late':'')+'">'+esc(o.deliveryDate)+(isLate(o)?' • متأخر':'')+'</td><td>'+tagsOf(o)+'</td><td>'+esc(o.approval)+'</td>'+
          '<td class="num">'+fmt(num(o.net))+' '+esc(o.currency)+'</td><td class="num">'+fmt(num(o.remain))+'</td><td class="act">'+actOf(o)+'</td></tr>';
      }).join('')+'</tbody></table>'
      :'<div class="oc-empty">لا توجد طلبات مطابقة.</div>';
    return;
  }
  box.classList.add('ocards');
  box.innerHTML=rows.length?
    rows.map(function(o,i){
      var kv=ocKV('التاريخ',esc(o.orderDate))+ocKV('الهاتف',esc(o.phone))+ocKV('الفرع',esc(o.branch))+
        ocKV('موعد التسليم',esc(o.deliveryDate)+(isLate(o)?' • متأخر':''),isLate(o)?'late':'')+ocKV('الاعتماد',esc(o.approval))+
        ocKV('الصافي',fmt(num(o.net))+' '+esc(o.currency))+ocKV('المتبقي',fmt(num(o.remain)));
      return ocCard(o,'ocl'+i,tagsOf(o),kv,actOf(o));
    }).join('')
    :'<div class="oc-empty">لا توجد طلبات مطابقة.</div>';
  if(LIST_MODE==='grid')ocPlain(box);else ocSlide(box);
}

/* ---------- صور الأصناف في تقارير PDF ---------- */
function pImg(src,st){return src?'<img class="pimg" loading="eager" decoding="sync" src="'+src+'" alt=""'+(st?' style="'+st+'"':'')+'>':'';}
function matImgByName(n){
  n=lkey(n);if(!n)return '';
  var m=materials.find(function(x){return lkey(matLabel(x))===n||lkey(x.name)===n||lkey(x.code)===n;});
  return (m&&m.img)||'';
}
function prodImgByName(n,code){
  var k=lkey(n),c=lkey(code),src='';
  if(!k&&!c)return '';
  orders.some(function(o){return (o.lines||[]).some(function(l){
    if(!l.img)return false;
    var hit=(c&&lkey(l.code)===c)||(k&&lkey(l.name)===k);
    if(!hit&&hasParts(l))hit=(l.parts||[]).some(function(p){if(p.svc)return false;var pk=partKey(l,p);return (c&&lkey(pk.code)===c)||(k&&lkey(pk.name)===k);});
    if(hit){src=l.img;return true;}
    return false;
  });});
  return src;
}
function lineImg(l){l=l||{};return l.img||prodImgByName(l.name,l.code)||matImgByName(l.name)||'';}
function orderItemImgs(o){
  var seen={},a=[];
  (o.lines||[]).forEach(function(l){var s=lineImg(l);if(s&&!seen[s]){seen[s]=1;a.push(s);}});
  if(!a.length)return firstImg(o);
  var more=a.length>6?'<small>+'+(a.length-6)+'</small>':'';
  return '<div style="display:flex;flex-wrap:wrap;gap:3px;max-width:150px">'+a.slice(0,6).map(function(s){return pImg(s,'width:40px;height:40px');}).join('')+more+'</div>';
}
/* ينتظر تحميل وفك ترميز كل الصور قبل فتح نافذة الطباعة حتى لا تخرج الصور فارغة في ملف PDF */
function printWhenReady(){
  var imgs=[].slice.call(document.querySelectorAll('#sheet img'));
  var p=Promise.all(imgs.map(function(im){return im.decode?im.decode().catch(function(){}):Promise.resolve();}));
  var t=new Promise(function(r){setTimeout(r,6000);});
  Promise.race([p,t]).then(function(){setTimeout(function(){window.print();},250);});
}
/* ---------- print sheet ---------- */
function printSheet(o){
  var cur=esc(o.currency||'');
  var rows=(o.lines||[]).map(function(l,i){
    var t=num(l.qty)*num(l.price)-num(l.disc);
    return '<tr><td>'+(i+1)+'</td><td>'+esc(l.code)+'</td><td>'+esc(l.name)+'</td><td>'+pImg(lineImg(l))+'</td><td>'+esc(l.spec)+'</td><td>'+esc(l.size)+'</td><td>'+esc(l.color)+'</td><td>'+esc(l.unit||'قطعة')+'</td><td>'+esc(l.qty)+(num(l.free)?' + '+esc(l.free)+' مجانًا':'')+'</td><td>'+fmt(num(l.price))+'</td><td>'+fmt(num(l.disc))+'</td><td>'+fmt(t)+'</td></tr>'+
      ((l.parts&&l.parts.length)?'<tr><td></td><td colspan="11">'+partsTable(l)+'</td></tr>':'');
  }).join('');
  $('sheet').innerHTML=
    '<h2>أمر طلب عميل — أثاث</h2>'+
    '<table class="kv"><tr><td>رقم الطلب</td><td>'+esc(o.orderNo)+'</td><td>تاريخ الطلب</td><td>'+esc(o.orderDate)+'</td><td>موعد التسليم</td><td>'+esc(o.deliveryDate)+'</td></tr>'+
    '<tr><td>الفرع</td><td>'+esc(o.branch)+'</td><td>نوع الطلب</td><td>'+esc(o.type)+'</td><td>الأولوية</td><td>'+esc(o.priority)+'</td></tr>'+
    '<tr><td>العميل</td><td>'+esc(o.custName)+'</td><td>رقم العميل</td><td>'+esc(o.custNo)+'</td><td>التليفون</td><td>'+esc(o.phone)+'</td></tr>'+
    '<tr><td>العنوان</td><td colspan="3">'+esc(o.address)+' '+esc(o.area)+'</td><td>الرقم الضريبي</td><td>'+esc(o.taxNo)+'</td></tr>'+
    '<tr><td>طريقة الدفع</td><td>'+esc(o.payMethod)+'</td><td>المرجع</td><td>'+esc(o.refNo)+' '+esc(o.refDate)+'</td><td>المرحلة / الاعتماد</td><td>'+esc(o.status)+' / '+esc(o.approval)+'</td></tr></table>'+
    '<table><thead><tr><th>م</th><th>رقم الصنف</th><th>اسم الصنف</th><th>الصورة</th><th>المواصفات</th><th>المقاس</th><th>اللون</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr></thead><tbody>'+rows+'</tbody></table>'+
    ordImgsHtml(o)+'<table class="kv"><tr><td>إجمالي الكميات</td><td>'+fmt(num(o.totQty))+'</td><td>المجموع</td><td>'+fmt(num(o.subtotal))+' '+cur+'</td><td>خصم %</td><td>'+esc(o.discPct||0)+'</td></tr>'+
    '<tr><td>الأعباء</td><td>'+fmt(num(o.charges))+'</td><td>الضريبة</td><td>'+fmt(num(o.tax))+'</td><td>صافي المبلغ</td><td><b>'+fmt(num(o.net))+' '+cur+'</b></td></tr>'+
    '<tr><td>العربون</td><td>'+fmt(num(o.deposit))+'</td><td>المتبقي</td><td><b>'+fmt(num(o.remain))+' '+cur+'</b></td><td>مندوب / سائق</td><td>'+esc(o.repNo)+' / '+esc(o.driverNo)+'</td></tr></table>'+
    (o.notes?'<table class="kv"><tr><td>ملاحظات التصنيع</td><td>'+esc(o.notes)+'</td></tr></table>':'')+
    '<div class="sign"><div>المندوب / البائع</div><div>مدير الإنتاج</div><div>المحاسب</div><div>توقيع العميل</div></div>';
  $('sheetWrap').style.display='block';
}

/* ---------- طباعة سجل الطلبات PDF ---------- */
function printOrdersPdf(){
  var rows=filtered();
  if(!rows.length){toast('لا توجد طلبات مطابقة لطباعتها.');return;}
  var tot={},rem={};
  rows.forEach(function(o){var c=o.currency||'';tot[c]=(tot[c]||0)+num(o.net);rem[c]=(rem[c]||0)+num(o.remain);});
  var fl=[];
  if($('q').value)fl.push('بحث: '+esc($('q').value));
  if($('fStatus').value)fl.push('المرحلة: '+esc($('fStatus').value));
  if($('fBranch').value)fl.push('الفرع: '+esc($('fBranch').value));
  if($('fLate').value)fl.push('التسليم: '+esc($('fLate').options[$('fLate').selectedIndex].text));
  var body=rows.map(function(o,i){
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(o.orderNo)+'</b></td><td>'+orderItemImgs(o)+'</td><td>'+esc(o.orderDate)+'</td><td>'+esc(o.custName)+'</td><td>'+esc(o.phone)+'</td><td>'+esc(o.branch)+'</td>'+
      '<td>'+esc(o.deliveryDate)+(isLate(o)?' (متأخر)':'')+'</td><td>'+esc(o.status)+(o.stopped?' (موقوف)':'')+'</td><td>'+esc(o.approval)+'</td>'+
      '<td>'+fmt(num(o.net))+' '+esc(o.currency)+'</td><td>'+fmt(num(o.remain))+'</td></tr>';
  }).join('');
  var sums=Object.keys(tot).map(function(c){return '<tr><td>إجمالي الصافي '+esc(c)+'</td><td><b>'+fmt(tot[c])+'</b></td><td>إجمالي المتبقي '+esc(c)+'</td><td><b>'+fmt(rem[c])+'</b></td></tr>';}).join('');
  openSheet('<style>@page{size:A4 landscape;margin:10mm}</style><h2>سجل الطلبات</h2>'+
    '<table class="kv"><tr><td>تاريخ الطباعة</td><td>'+esc(today())+'</td><td>عدد الطلبات</td><td>'+rows.length+'</td><td>التصفية</td><td>'+(fl.join(' — ')||'كل الطلبات')+'</td></tr></table>'+
    '<table><thead><tr><th>م</th><th>رقم الطلب</th><th>صورة</th><th>التاريخ</th><th>العميل</th><th>الهاتف</th><th>الفرع</th><th>موعد التسليم</th><th>المرحلة</th><th>الاعتماد</th><th>الصافي</th><th>المتبقي</th></tr></thead><tbody>'+body+'</tbody></table>'+
    '<table class="kv">'+sums+'</table>');
  var old=document.title;document.title='سجل-الطلبات-'+today();
  window.addEventListener('afterprint',function r(){document.title=old;window.removeEventListener('afterprint',r);});
  printWhenReady();
}

/* ---------- export / import ---------- */
function download(name,text,mime){
  var b=new Blob([text],{type:mime});var a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);
}
function csv(rows){
  return '\uFEFF'+rows.map(function(r){return r.map(function(c){c=String(c==null?'':c);return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(',');}).join('\r\n');
}
function exportOrders(){
  var rows=[['رقم الطلب','تاريخ الطلب','موعد التسليم','الفرع','العميل','الهاتف','نوع الطلب','المرحلة','الاعتماد','الأولوية','طريقة الدفع','إجمالي الكميات','المجموع','الأعباء','الضريبة','الصافي','العربون','المتبقي','العملة']];
  filtered().forEach(function(o){rows.push([o.orderNo,o.orderDate,o.deliveryDate,o.branch,o.custName,o.phone,o.type,o.status,o.approval,o.priority,o.payMethod,o.totQty,o.subtotal,o.charges,o.tax,o.net,o.deposit,o.remain,o.currency]);});
  download('furniture-orders-'+today()+'.csv',csv(rows),'text/csv;charset=utf-8');
}
function exportLines(){
  var rows=[['رقم الطلب','العميل','الفرع','موعد التسليم','المرحلة','م','رقم الصنف','اسم الصنف','الوحدة','المواصفات','المقاس','اللون','رقم الدفعة','الكمية','مجانية','السعر','الخصم','الإجمالي','كمية محجوزة','الحجز إلى','الباركود','المكونات']];
  filtered().forEach(function(o){(o.lines||[]).forEach(function(l,i){
    rows.push([o.orderNo,o.custName,o.branch,o.deliveryDate,o.status,i+1,l.code,l.name,l.unit,l.spec,l.size,l.color,l.batch,l.qty,l.free,l.price,l.disc,num(l.qty)*num(l.price)-num(l.disc),l.rsvQty,l.rsvTo,l.barcode,partsText(l)]);
  });});
  download('furniture-order-lines-'+today()+'.csv',csv(rows),'text/csv;charset=utf-8');
}
function sample(){
  var t=today();
  var s=[
    {branch:'الفرع الرئيسي',custName:'شركة النخبة للتجهيزات',phone:'0500000001',type:'تفصيل خاص',status:'قيد التصنيع',approval:'معتمد',priority:'مستعجل',orderDate:addDays(t,-12),deliveryDate:addDays(t,6),payMethod:'تحويل بنكي',deposit:4000,taxPct:15,charges:300,discPct:0,
      lines:[{code:'DS-110',name:'مكتب مدير خشب زان',unit:'قطعة',spec:'خشب زان، قشرة جوز',size:'200×90×76',color:'جوزي',qty:2,price:2400,disc:0},{code:'CH-220',name:'كرسي مدير جلد',unit:'قطعة',spec:'جلد طبيعي',size:'—',color:'أسود',qty:2,price:900,disc:100}]},
    {branch:'نقطة بيع 1',custName:'أحمد الشمري',phone:'0500000002',type:'طلب جديد',status:'جاهز للتسليم',approval:'معتمد',priority:'عادي',orderDate:addDays(t,-20),deliveryDate:addDays(t,2),payMethod:'نقدي',deposit:3000,taxPct:15,charges:150,discPct:5,
      lines:[{code:'SF-300',name:'كنبة ثلاثية قماش',unit:'قطعة',spec:'قماش مقاوم للبقع',size:'220×95',color:'رمادي',qty:1,price:3200,disc:0},{code:'TB-310',name:'طاولة وسط',unit:'قطعة',spec:'رخام وحديد',size:'100×60',color:'أبيض',qty:1,price:850,disc:0}]},
    {branch:'الفرع الرئيسي',custName:'مطعم الواحة',phone:'0500000003',type:'طلب جديد',status:'جديد',approval:'قيد المراجعة',priority:'عادي',orderDate:addDays(t,-30),deliveryDate:addDays(t,-3),payMethod:'آجل',deposit:0,taxPct:15,charges:0,discPct:0,
      lines:[{code:'TB-401',name:'طاولة مطعم 4 أشخاص',unit:'قطعة',spec:'خشب صلب',size:'80×80',color:'بني غامق',qty:12,price:450,disc:0}]}
  ];
  s.forEach(function(o){
    o.id=uid();o.orderNo=nextNo();o.stopped=false;o.reserved=false;o.currency='';
    var r=compute(o.lines,o.discPct,o.charges,o.taxPct,o.deposit);
    o.totQty=r.qty;o.subtotal=r.subtotal;o.tax=r.tax;o.net=r.net;o.remain=r.remain;
    orders.push(o);
  });
  sampleProd();refresh();toast('تم تحميل طلبات وخامات وحصر تجريبية. احذفها قبل بدء العمل الفعلي.');
}

/* ================= الدورة المستندية للإنتاج ================= */
var DEF_TPLS={
 'عام':['قص وتجهيز الخامات','نجارة وتجميع الهيكل','صنفرة وتجهيز للدهان','دهان وتشطيب','تنجيد وتفصيل الأقمشة','تركيب الإكسسوارات والفرش','فحص الجودة','تغليف وجاهزية للتسليم'],
 'نجارة — مكاتب وخزائن وغرف نوم':['قص وتجهيز الألواح','نجارة وتجميع الهيكل','صنفرة وتجهيز للدهان','دهان وتشطيب','تركيب الأدراج والمفصلات والإكسسوارات','فحص الجودة','تغليف وجاهزية للتسليم'],
 'تنجيد — كنب وصالونات':['قص وتجهيز الخشب','نجارة هيكل الكنب','تثبيت الإسفنج والحشو','تفصيل وخياطة القماش','تنجيد وتغطية','تركيب الأرجل والإكسسوارات','فحص الجودة','تغليف وجاهزية للتسليم'],
 'كراسي ومقاعد':['تجهيز الهيكل (خشب / معدن)','تجميع الهيكل','تثبيت الإسفنج','تنجيد وتغطية','تركيب القواعد والعجلات','فحص الجودة','تغليف وجاهزية للتسليم'],
 'طاولات (خشب / رخام / حديد)':['تقطيع وتجهيز الخامات','لحام / تجميع الهيكل','تجهيز السطح (خشب / رخام / زجاج)','دهان وتشطيب','تركيب السطح','فحص الجودة','تغليف وجاهزية للتسليم'],
 'مطابخ':['أخذ المقاسات من الموقع','قص الألواح وتحزيزها','تجميع الوحدات','دهان / تكسية الأبواب','تركيب المفصلات والمقابض','فحص الجودة','تغليف ونقل','تركيب في موقع العميل'],
 'سرير منجّد':['قص وتجهيز الألواح','نجارة هيكل السرير','تثبيت الإسفنج والحشو','تفصيل وتنجيد الرأس والقاعدة','دهان وتشطيب الأجزاء الخشبية','تركيب الإكسسوارات','فحص الجودة','تغليف وجاهزية للتسليم'],
 'مفروشات وستائر':['قص القماش','خياطة','كي وتشطيب','تركيب الإكسسوارات (حلقات / سكك)','فحص الجودة','تغليف وتسليم']
};
var tpls=JSON.parse(JSON.stringify(DEF_TPLS));
function guessTpl(l,b){
  if(b&&b.tpl&&tpls[b.tpl])return b.tpl;
  var n=String(l.name||'')+' '+String(l.spec||'');
  var N=Object.keys(tpls);
  function has(k){return N.indexOf(k)>-1?k:'عام';}
  if(/سرير/.test(n)&&/تنجيد|منجد|قماش|جلد|شمواه|كتان|مخمل|قطيفة/.test(n))return has('سرير منجّد');
  if(/كنب|صالون|أريكة|اريكة|ركنة|ركنه|بف|فوتيه/.test(n))return has('تنجيد — كنب وصالونات');
  if(/كرسي|كراسي|مقعد/.test(n))return has('كراسي ومقاعد');
  if(/طاولة|طاولات|ترابيزة|ترابيزه|سفرة/.test(n))return has('طاولات (خشب / رخام / حديد)');
  if(/مطبخ/.test(n))return has('مطابخ');
  if(/ستارة|ستائر|مفرش|مفروش|لحاف|وسادة|مخدة/.test(n))return has('مفروشات وستائر');
  if(/مكتب|خزانة|دولاب|سرير|غرفة نوم|تسريحة|مكتبة|كومد|كمد|نيش|بوفيه/.test(n))return has('نجارة — مكاتب وخزائن وغرف نوم');
  return 'عام';
}
var ST=['لم يبدأ','جاري','مكتمل','غير مطلوب'];
var PRS=['مسودة','معتمد','تم الشراء','مستلم','ملغي'];
var PR_OPEN=['مسودة','معتمد','تم الشراء'];
var materials=[],boms=[],prs=[],jobs={},cfg={mfgDays:10};
var mrpExcl={},mrpApprovedOnly=false,bomDraft=null,prDraft=null,jobOrderId=null,prodList=[];

function r3(n){return Math.round(n*1000)/1000;}
function lkey(s){return String(s==null?'':s).trim().toLowerCase();}
function matBy(id){return materials.find(function(m){return m.id===id;});}
function matOpts(sel){return '<option value="">— اختر الخامة —</option>'+materials.map(function(m){return '<option value="'+m.id+'"'+(m.id===sel?' selected':'')+'>'+esc((m.code?m.code+' — ':'')+matLabel(m))+'</option>';}).join('');}
function armDel(b,fn){
  if(b.dataset.armed){fn();}
  else{var orig=b.textContent;b.dataset.armed='1';b.textContent='تأكيد';setTimeout(function(){if(b.isConnected){delete b.dataset.armed;b.textContent=orig;}},3000);}
}
function openSheet(html){$('sheet').innerHTML=html;$('sheetWrap').style.display='block';}
function kv(rows){return '<table class="kv">'+rows.map(function(r){var h='<tr>';for(var i=0;i<r.length;i+=2)h+='<td>'+esc(r[i])+'</td><td>'+esc(r[i+1])+'</td>';return h+'</tr>';}).join('')+'</table>';}
function sigs(a){return '<div class="sign">'+a.map(function(x){return '<div>'+esc(x)+'</div>';}).join('')+'</div>';}
function orderBy(id){return orders.find(function(o){return o.id===id;});}

/* ---------- BOM lookup & requirements ---------- */
function findBom(l){
  var c=lkey(l.code),n=lkey(l.name),i;
  if(c){for(i=0;i<boms.length;i++){if(lkey(boms[i].code)===c)return boms[i];}}
  if(n){for(i=0;i<boms.length;i++){if(lkey(boms[i].name)===n)return boms[i];}}
  return null;
}
function hasParts(l){return !!(l.parts&&l.parts.some(function(p){return !p.svc;}));}
function partKey(l,p){return {code:p.code||'',name:(l.name||l.code||'')+' — '+(p.name||'')};}
function partsText(l){return (l.parts||[]).map(function(p){return p.name+(p.size?' '+p.size:'')+(p.color?' — '+p.color:'')+((num(p.qty)||1)!==1?' ×'+p.qty:'')+(p.svc?' (خدمة)':'');}).join('، ');}
function partsTable(l){
  return '<table style="margin:2px 0"><thead><tr><th>مكوّنات الطقم</th><th>المقاس</th><th>اللون / التنجيد</th><th>الكمية</th><th>السعر</th><th>ملاحظات</th></tr></thead><tbody>'+
    (l.parts||[]).map(function(p){return '<tr><td>'+esc(p.name)+(p.svc?' (خدمة)':'')+'</td><td>'+esc(p.size)+'</td><td>'+esc(p.color)+'</td><td>'+esc(p.qty)+'</td><td>'+(num(p.price)?fmt(num(p.price)):'')+'</td><td>'+esc(p.note)+'</td></tr>';}).join('')+'</tbody></table>';
}
function mfgUnits(o){
  var u=[];
  (o.lines||[]).forEach(function(l,li){
    var q=num(l.qty)+num(l.free);if(q<=0)return;
    if(hasParts(l)){(l.parts||[]).forEach(function(p,pi){if(p.svc)return;var k=partKey(l,p);u.push({li:li,pi:pi,code:k.code,name:k.name,qty:q*(num(p.qty)||1),l:l,p:p});});}
    else u.push({li:li,pi:-1,code:l.code||'',name:l.name||'',qty:q,l:l});
  });
  return u;
}
function orderNeeds(o){
  var items=[],missing=[];
  mfgUnits(o).forEach(function(u){
    var b=findBom({code:u.code,name:u.name});
    if(!b||!b.comps.length){missing.push(u.name||u.code||'صنف');return;}
    b.comps.forEach(function(c){if(c.mat)items.push({mat:c.mat,need:u.qty*num(c.qty)*(1+num(c.waste)/100),prod:(u.name||u.code),qty:u.qty});});
  });
  return {items:items,missing:missing};
}
function aggNeeds(o){var r=orderNeeds(o),agg={};r.items.forEach(function(it){agg[it.mat]=(agg[it.mat]||0)+it.need;});return {agg:agg,missing:r.missing,items:r.items};}
function mrpEligible(o){
  var j=jobs[o.id];
  return [STATUS[0],STATUS[1],STATUS[2]].indexOf(o.status)>-1&&!o.stopped&&o.approval!==APPROVAL[2]&&!(j&&j.issued);
}
function onOrderMap(){
  var m={};
  prs.forEach(function(p){if(PR_OPEN.indexOf(p.status)>-1)p.lines.forEach(function(l){m[l.mat]=(m[l.mat]||0)+num(l.qty);});});
  return m;
}
function mrp(all){
  var rows={},detail=[],missing=[],oo=onOrderMap();
  orders.filter(function(o){
    if(!mrpEligible(o))return false;
    if(all)return true;
    return !mrpExcl[o.id]&&(!mrpApprovedOnly||o.approval===APPROVAL[1]);
  }).forEach(function(o){
    var r=orderNeeds(o);
    r.missing.forEach(function(n){missing.push({order:o.orderNo,prod:n});});
    r.items.forEach(function(it){
      var m=matBy(it.mat);if(!m)return;
      var x=rows[it.mat]||(rows[it.mat]={m:m,need:0,orders:{},prods:{},dd:null});
      x.need+=it.need;x.orders[o.id]=o.orderNo;x.prods[it.prod]=1;
      if(o.deliveryDate&&(!x.dd||o.deliveryDate<x.dd))x.dd=o.deliveryDate;
      detail.push({order:o.orderNo,cust:o.custName,prod:it.prod,qty:it.qty,m:m,need:it.need});
    });
  });
  var map={};
  var list=Object.keys(rows).map(function(id){
    var x=rows[id];
    x.id=id;x.stock=num(x.m.stock);x.min=num(x.m.min);x.onOrder=oo[id]||0;
    x.short=Math.max(0,r3(x.need+x.min-x.stock-x.onOrder));
    x.cost=x.short*num(x.m.price);
    x.orderBy=x.dd?addDays(x.dd,-(num(cfg.mfgDays)+num(x.m.lead))):'';
    map[id]=x;return x;
  });
  list.sort(function(a,b){return b.short-a.short||String(a.m.name).localeCompare(String(b.m.name),'ar');});
  var below=materials.filter(function(m){return !map[m.id]&&num(m.min)>0&&num(m.stock)+(oo[m.id]||0)<num(m.min);});
  return {list:list,map:map,detail:detail,missing:missing,below:below};
}

/* ---------- jobs ---------- */
function newStages(tn){return (tpls[tn]||tpls['عام']||DEF_TPLS['عام']).map(function(s){return {name:s,state:ST[0],owner:'',plan:'',done:'',note:''};});}
function applyTpl(lj,name){
  var names=tpls[name]||[],old={};
  lj.stages.forEach(function(s){old[s.name]=s;});
  var out=names.map(function(n){return old[n]||{name:n,state:ST[0],owner:'',plan:'',done:'',note:''};});
  lj.stages.forEach(function(s){if(names.indexOf(s.name)<0&&(s.state!==ST[0]||s.owner||s.note))out.push(s);});
  lj.stages=out;lj.tpl=name;
}
function ensureJob(o){
  var j=jobs[o.id]||(jobs[o.id]={lines:[],issued:null});
  var ls=o.lines||[];
  ls.forEach(function(l,i){
    var k=lkey(l.code)||lkey(l.name),lj=j.lines[i];
    if(!lj||(lj.key&&lj.key!==k))lj=j.lines[i]={key:k};
    if(!lj.key)lj.key=k;
    if(hasParts(l)){
      var om={};(lj.pj||[]).forEach(function(u){if(u&&u.key)om[u.key]=u;});
      lj.pj=(l.parts||[]).map(function(p){
        if(p.svc)return null;
        var pk=partKey(l,p),kk=lkey(pk.code)||lkey(pk.name),u=om[kk];
        if(u){if(!u.tpl)u.tpl='عام';return u;}
        var tn=guessTpl({name:p.name,spec:(p.note||'')+' '+(p.color||'')},findBom(pk));
        return {key:kk,tpl:tn,stages:newStages(tn)};
      });
    }else{
      delete lj.pj;
      if(!lj.stages){var tn2=guessTpl(l,findBom(l));lj.tpl=tn2;lj.stages=newStages(tn2);}
      else if(!lj.tpl)lj.tpl='عام';
    }
  });
  if(j.lines.length>ls.length)j.lines.length=ls.length;
  return j;
}
function stageProg(lj){
  var a=(lj.stages||[]).filter(function(s){return s.state!==ST[3];});
  if(!a.length)return 0;
  return Math.round(a.filter(function(s){return s.state===ST[2];}).length/a.length*100);
}
function lineProg(lj){
  if(lj.pj){var us=lj.pj.filter(Boolean);if(!us.length)return 0;return Math.round(us.reduce(function(a,u){return a+stageProg(u);},0)/us.length);}
  return stageProg(lj);
}
function jobUnits(j){var out=[];j.lines.forEach(function(lj){if(lj.pj)lj.pj.forEach(function(u){if(u)out.push(u);});else if(lj.stages)out.push(lj);});return out;}
function unitOf(j,l,p){var lj=j.lines[+l];return (p===undefined||p==='')?lj:lj.pj[+p];}
function orderProg(o){
  var j=jobs[o.id];if(!j)return 0;
  var ls=(o.lines||[]).map(function(l,i){return {l:l,j:j.lines[i]};}).filter(function(x){return x.j&&num(x.l.qty)>0;});
  if(!ls.length)return 0;
  return Math.round(ls.reduce(function(a,x){return a+lineProg(x.j);},0)/ls.length);
}
function syncStatus(o){
  if(o.status===STATUS[4]||o.status===STATUS[5])return;
  var j=jobs[o.id];if(!j)return;
  var any=false,fin=false;
  jobUnits(j).forEach(function(lj){lj.stages.forEach(function(s){
    if(s.state===ST[1]||s.state===ST[2]){any=true;if(/دهان|تنجيد/.test(s.name))fin=true;}
  });});
  o.status=orderProg(o)>=100?STATUS[3]:fin?STATUS[2]:any?STATUS[1]:STATUS[0];
}
function issueMaterials(o){
  var j=ensureJob(o);
  if(j.issued){toast('الخامات مصروفة مسبقًا');return;}
  var r=aggNeeds(o);
  if(r.missing.length){toast('أكمل حصر المواد للأصناف: '+r.missing.join('، '));return;}
  if(!Object.keys(r.agg).length){toast('لا توجد خامات لصرفها');return;}
  var short=[];
  Object.keys(r.agg).forEach(function(id){var m=matBy(id);if(m&&num(m.stock)<r.agg[id]-1e-9)short.push(matLabel(m)+' (ينقص '+fmt(r.agg[id]-num(m.stock))+')');});
  if(short.length){toast('المخزون لا يكفي: '+short.join('، '));return;}
  var items=[];
  Object.keys(r.agg).forEach(function(id){var m=matBy(id);if(!m)return;m.stock=r3(num(m.stock)-r.agg[id]);items.push({mat:id,qty:r3(r.agg[id])});});
  j.issued={date:today(),items:items};
  toast('تم صرف الخامات وخصمها من المخزون');
}
function unissue(o){
  var j=jobs[o.id];if(!j||!j.issued)return;
  j.issued.items.forEach(function(it){var m=matBy(it.mat);if(m)m.stock=r3(num(m.stock)+it.qty);});
  j.issued=null;toast('تم إلغاء الصرف وإرجاع الكميات إلى المخزون');
}

/* ---------- document cycle ---------- */
function cycleOf(o,M){
  var us=mfgUnits(o);
  var wb=us.filter(function(u){var b=findBom({code:u.code,name:u.name});return b&&b.comps.length;}).length;
  var bomDone=us.length>0&&wb===us.length;
  var j=jobs[o.id],issued=!!(j&&j.issued);
  var lp=prs.filter(function(p){return p.orders&&p.orders.indexOf(o.id)>-1&&p.status!==PRS[4];});
  var rc=lp.filter(function(p){return p.status===PRS[3];}).length;
  var gross=orderNeeds(o).items.some(function(it){var x=M.map[it.mat];return x&&x.need>num(x.m.stock)+1e-9;});
  var cancelled=o.status===STATUS[5];
  var S=[];
  S.push({k:'order',t:'طلب العميل',s:'done',d:'مسجّل'});
  if(cancelled){
    ['مراجعة النطاق','عناصر التكلفة','حصر المواد','طلب الشراء','استلام الخامات','صرف للتصنيع','التصنيع','التسليم'].forEach(function(t){S.push({k:'x',t:t,s:'na',d:'ملغي'});});
    return S;
  }
  var sc0=scopes[o.id],sUs=us.filter(function(u){var d=sc0&&sc0.items[scKey(u)];return d&&num(d.l)>0&&num(d.w)>0&&num(d.h)>0;}).length;
  if(sc0&&sc0.status===SCS[2])S.push({k:'scope',t:'مراجعة النطاق',s:'done',d:'معتمد من العميل'});
  else if(sc0&&(sUs>0||sc0.status!==SCS[0]))S.push({k:'scope',t:'مراجعة النطاق',s:'part',d:sc0.status===SCS[0]?sUs+' من '+us.length+' مقاسات':sc0.status});
  else S.push({k:'scope',t:'مراجعة النطاق',s:'todo',d:'بانتظار المراجعة'});
  var cc0=costs[o.id],cn0=cc0?cc0.mats.length+cc0.ops.length+cc0.ext.length+cc0.inst.length+cc0.ind.length:0;
  if(cc0&&cn0>0&&cc0.status===CSTS[1])S.push({k:'cost',t:'عناصر التكلفة',s:'done',d:'معتمدة'});
  else if(cn0>0)S.push({k:'cost',t:'عناصر التكلفة',s:'part',d:'مسودة'});
  else S.push({k:'cost',t:'عناصر التكلفة',s:'todo',d:'لم تُحدد'});
  S.push({k:'bom',t:'حصر المواد',s:bomDone?'done':wb>0?'part':'todo',d:bomDone?'اكتمل':wb+' من '+us.length+' أصناف/مكونات'});
  var s3;
  if(lp.length)s3={s:'done',d:lp.length+' طلب'};
  else if(!bomDone)s3={s:'todo',d:'بانتظار الحصر'};
  else if(gross&&!issued)s3={s:'todo',d:'مطلوب إنشاؤه'};
  else s3={s:'na',d:'المخزون يكفي'};
  S.push({k:'mrp',t:'طلب الشراء',s:s3.s,d:s3.d});
  var s4;
  if(lp.length)s4=rc===lp.length?{s:'done',d:'تم الاستلام'}:rc>0?{s:'part',d:rc+' من '+lp.length}:{s:'todo',d:'بانتظار الاستلام'};
  else s4={s:'na',d:'—'};
  S.push({k:'pr',t:'استلام الخامات',s:s4.s,d:s4.d});
  var s5;
  if(issued)s5={s:'done',d:j.issued.date};
  else if(!bomDone)s5={s:'todo',d:'بانتظار الحصر'};
  else if((lp.length&&rc<lp.length)||(gross&&!lp.length))s5={s:'todo',d:'بانتظار الخامات'};
  else s5={s:'todo',d:'جاهز للصرف'};
  S.push({k:'issue',t:'صرف للتصنيع',s:s5.s,d:s5.d});
  var p=orderProg(o);
  S.push({k:'job',t:'التصنيع',s:p>=100?'done':p>0?'part':'todo',d:p+'%'});
  S.push({k:'close',t:'التسليم',s:o.status===STATUS[4]?'done':o.status===STATUS[3]?'part':'todo',d:o.status===STATUS[4]?'تم التسليم':o.status===STATUS[3]?'جاهز للتسليم':'—'});
  return S;
}
var SYM={done:'✓',part:'◐',todo:'○',na:'—'};
function renderCycle(){
  var hide=$('cycHide').checked,M=mrp(true);
  var list=orders.filter(function(o){return !hide||(o.status!==STATUS[4]&&o.status!==STATUS[5]);})
    .sort(function(a,b){return (a.deliveryDate||'').localeCompare(b.deliveryDate||'');});
  var heads=['طلب العميل','مراجعة النطاق','عناصر التكلفة','حصر المواد','طلب الشراء','استلام الخامات','صرف للتصنيع','التصنيع','التسليم'];
  $('cycTbl').innerHTML=list.length?
    list.map(function(o){
      var S=cycleOf(o,M),nx=null;
      for(var i=1;i<S.length;i++){if(S[i].s==='todo'||S[i].s==='part'){nx=S[i];break;}}
      var map={scope:['scope','مراجعة النطاق'],cost:['cost','عناصر التكلفة'],bom:['bom','حصر المواد'],mrp:['mrp','إنشاء طلب شراء'],pr:['pr','متابعة الاستلام'],issue:['job','صرف الخامات'],job:['job','مراحل التصنيع'],close:['list','سجل الطلبات']};
      var btn=nx&&map[nx.k]?'<button class="btn sm gold" data-a="go" data-to="'+map[nx.k][0]+'" data-id="'+o.id+'" type="button">'+map[nx.k][1]+' ›</button>':'<span class="cy-done">✓ مكتمل</span>';
      var src=firstSrc(o);
      return '<article class="cy"><div class="cy-art">'+(src?'<img src="'+src+'" alt="" loading="lazy">':OC_ART)+'</div>'+
        '<div class="cy-head"><b class="cy-no">'+esc(o.orderNo)+'</b><span class="cy-cust">'+esc(o.custName)+'</span><span class="cy-date'+(isLate(o)?' late':'')+'">التسليم: '+esc(o.deliveryDate)+(isLate(o)?' • متأخر':'')+'</span></div>'+
        '<div class="cy-steps">'+S.map(function(x){return '<div class="cy-step s-'+x.s+'"><i>'+SYM[x.s]+'</i><em>'+esc(x.t)+'</em><small>'+esc(x.d)+'</small></div>';}).join('')+'</div>'+
        '<div class="cy-act">'+btn+'</div></article>';
    }).join('')
    :'<div class="oc-empty">لا توجد طلبات. سجّل طلبًا أو حمّل البيانات التجريبية من لوحة المتابعة.</div>';
}
function goTo(to,id){
  var o=orderBy(id);
  if(to==='bom'){
    show('mats');
    if(!materials.length){toast('أضف الخامات أولًا في دليل الخامات');return;}
    var u=mfgUnits(o).filter(function(x){return !findBom({code:x.code,name:x.name});})[0];
    bomSecSel='';if(u){bomDraft=newBom(u.code,u.name);renderBomEd();}
  }else if(to==='job'){jobOrderId=id;show('job');}
  else if(to==='list'){show('list');$('q').value=o.orderNo;renderList();}
  else if(to==='scope'){scOrderId=id;show('scope');}
  else if(to==='cost'){costOrderId=id;show('cost');}
  else show(to);
}

/* ---------- materials ---------- */
function stockSecOpts(){
  var s=$('stockSec');if(!s)return;var cur=s.value,names=MTnames().slice();
  if(materials.some(function(m){return matType(m)===MT_NONE;})&&names.indexOf(MT_NONE)<0)names.push(MT_NONE);
  s.innerHTML='<option value="">كل الأقسام</option>'+names.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join('');
  s.value=(cur&&names.indexOf(cur)>-1)?cur:(matSel&&names.indexOf(matSel)>-1?matSel:'');
}
function renderMats(){
  renderMatSecs();
  stockSecOpts();
  renderSubSlider();
  renderMatFilters();
  renderMatTable();
}
function matScope(){
  return materials.map(function(m,i){return {m:m,i:i};}).filter(function(x){
    if(matSel&&matType(x.m)!==matSel)return false;
    if(matSel&&matSub==='__none')return !subOf(x.m);
    if(matSel&&matSub&&(!subOf(x.m)||subOf(x.m).id!==matSub))return false;
    return true;
  });
}
function subOpts(m){
  var L=subsOfSec(secIdByName(matType(m))),cur=subOf(m)?m.sub:'';
  return '<option value="">— بدون —</option>'+L.map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===cur?' selected':'')+'>'+esc(x.name)+'</option>';}).join('');
}
function renderMatTable(){
  var rows=matScope().filter(function(x){return (!matColor||lkey(x.m.color)===matColor)&&(!matKind||lkey(x.m.kind)===matKind);});
  $('matBody').innerHTML=rows.length?rows.map(function(x){
    var m=x.m,i=x.i;
    function c(k,t){return '<td><input data-i="'+i+'" data-k="'+k+'" type="'+t+'"'+(t==='number'?' step="any" min="0"':'')+(k==='supplier'?' list="dlSup"':'')+' value="'+esc(m[k]==null?'':m[k])+'"></td>';}
    return '<tr>'+c('code','text')+c('name','text')+
      '<td><select data-i="'+i+'" data-k="type" aria-label="القسم" style="min-width:96px">'+MTopts(m)+'</select></td>'+
      '<td><select data-i="'+i+'" data-k="sub" aria-label="القسم الفرعي" style="min-width:120px">'+subOpts(m)+'</select></td>'+
      '<td><div class="ccell">'+swHtml(m,i)+'<input data-i="'+i+'" data-k="color" type="text" list="dlColor" placeholder="أبيض، أسود…" value="'+esc(m.color||'')+'"></div></td>'+
      '<td><input data-i="'+i+'" data-k="kind" type="text" list="dlKind" placeholder="حديد، بلاستيك…" value="'+esc(m.kind||'')+'"></td>'+
      '<td>'+imgCell(m.img,'mat',i)+'</td>'+c('unit','text')+c('stock','number')+c('min','number')+c('price','number')+c('supplier','text')+c('lead','number')+
      '<td><button class="btn sm red" data-a="delmat" data-i="'+i+'" type="button">حذف</button></td></tr>';
  }).join(''):'<tr><td colspan="14" class="empty">'+(materials.length?'لا توجد خامات في هذا التحديد. اضغط «+ إضافة خامة» لإضافة أول خامة له.':'لا توجد خامات. أضف أول خامة أو حمّل البيانات التجريبية من لوحة المتابعة.')+'</td></tr>';
  supList();
}
function supList(){
  var s=[];materials.forEach(function(m){if(m.supplier&&s.indexOf(m.supplier)<0)s.push(m.supplier);});
  prs.forEach(function(p){if(p.supplier&&s.indexOf(p.supplier)<0)s.push(p.supplier);});
  $('dlSup').innerHTML=s.map(function(x){return '<option value="'+esc(x)+'">';}).join('');
  var uc={},uk={};materials.forEach(function(m){if(m.color&&m.color.trim())uc[m.color.trim()]=1;if(m.kind&&m.kind.trim())uk[m.kind.trim()]=1;});
  var dc=$('dlColor'),dk=$('dlKind');
  if(dc){var have={};Array.prototype.forEach.call(dc.options,function(o){have[o.value]=1;});Object.keys(uc).forEach(function(v){if(!have[v]){var o=document.createElement('option');o.value=v;dc.appendChild(o);}});}
  if(dk){var hk={};Array.prototype.forEach.call(dk.options,function(o){hk[o.value]=1;});Object.keys(uk).forEach(function(v){if(!hk[v]){var o=document.createElement('option');o.value=v;dk.appendChild(o);}});}
}
function usedMat(id){
  return boms.some(function(b){return b.comps.some(function(c){return c.mat===id;});})||prs.some(function(p){return p.lines.some(function(l){return l.mat===id;});})||
    Object.keys(jobs).some(function(k){return jobs[k].issued&&jobs[k].issued.items.some(function(i){return i.mat===id;});});
}

/* ---------- BOM editor ---------- */
function newBom(code,name){return {id:uid(),code:code||'',name:name||'',tpl:'',comps:[{mat:'',qty:'',waste:5,note:'',sec:''}]};}
/* ----- أقسام الحصر (نجارة / دهان / تنجيد / ...) ----- */
var bomSecSel='',trkOrderId='';
function secDisp(n){return n==='أخشاب'?'النجارة (أخشاب)':n;}
function secInfo(n){var s=matSecs().find(function(x){return x.name===n;});return s||{name:n,ic:'📦',c:'#6b6b6b'};}
function compSec(c){
  if(c.sec&&(MTnames().indexOf(c.sec)>-1||c.sec===MT_NONE))return c.sec;
  var m=matBy(c.mat);return m?matType(m):MT_NONE;
}
function secCounts(b){var r={};if(!b)return r;b.comps.forEach(function(c){if(!c.mat)return;var k=compSec(c);r[k]=(r[k]||0)+1;});return r;}
function matOptsSec(sel,sec){
  if(!sec||sec===MT_NONE)return matOpts(sel);
  function o(m){return '<option value="'+m.id+'"'+(m.id===sel?' selected':'')+'>'+esc((m.code?m.code+' — ':'')+matLabel(m))+'</option>';}
  var a=materials.filter(function(m){return matType(m)===sec;}),b=materials.filter(function(m){return matType(m)!==sec;});
  return '<option value="">— اختر الخامة —</option>'+(a.length?'<optgroup label="خامات '+esc(secDisp(sec))+'">'+a.map(o).join('')+'</optgroup>':'')+(b.length?'<optgroup label="خامات أقسام أخرى">'+b.map(o).join('')+'</optgroup>':'');
}
function ensureSecRow(sec){
  if(!bomDraft||!sec)return;
  if(bomDraft.comps.some(function(c){return compSec(c)===sec;}))return;
  bomDraft.comps=bomDraft.comps.filter(function(c){return c.mat||num(c.qty)>0;});
  bomDraft.comps.push({mat:'',qty:'',waste:5,note:'',sec:sec});
}
function products(){
  var map={};
  orders.forEach(function(o){(o.lines||[]).forEach(function(l){
    var items=[];
    if(hasParts(l)){(l.parts||[]).forEach(function(p){if(p.svc)return;var pk=partKey(l,p);items.push({code:pk.code,name:pk.name,qty:num(l.qty)*(num(p.qty)||1)});});}
    else items.push({code:l.code||'',name:l.name||'',qty:num(l.qty)});
    items.forEach(function(it){
      var k=lkey(it.code)||lkey(it.name);if(!k)return;
      var x=map[k]||(map[k]={code:it.code,name:it.name,qty:0,orders:0});
      x.qty+=it.qty;x.orders++;if(!x.img&&l.img)x.img=l.img;
    });
  });});
  return Object.keys(map).map(function(k){var x=map[k];x.bom=findBom({code:x.code,name:x.name});return x;});
}
function renderProdLists(){
  prodList=products();
  var cur=$('bomPick').value;
  $('bomPick').innerHTML='<option value="">— اختر صنفًا —</option>'+prodList.map(function(p,i){return '<option value="'+i+'">'+(p.bom?'✓ ':'○ ')+esc((p.code?p.code+' — ':'')+p.name)+'</option>';}).join('');
  $('bomPick').value=cur;
  $('bomCopy').innerHTML='<option value="">— اختر —</option>'+boms.map(function(b,i){return '<option value="'+i+'">'+esc((b.code?b.code+' — ':'')+b.name)+'</option>';}).join('');
  renderProdSlider();
}

var prodSlideIdx=0;
function renderProdSlider(){
  var box=$('prodTbl');
  if(!prodList.length){box.innerHTML='<div class="empty" style="padding:18px;text-align:center">تظهر هنا أصناف الطلبات بعد تسجيلها.</div>';return;}
  var done=prodList.filter(function(p){return p.bom;}).length;
  var cards=prodList.map(function(p,i){
    var st=p.bom?'<span class="st done">✓ '+p.bom.comps.length+' مواد</span>':'<span class="st todo">○ بلا حصر</span>';
    return '<div class="pcard'+(p.bom?' ok':'')+'" data-idx="'+i+'">'+
      '<div class="pimg">'+(p.img?'<img src="'+p.img+'" alt="">':'<span>🪑</span>')+'</div>'+
      '<div class="pbody"><b class="pname">'+esc(p.name)+'</b>'+(p.code?'<span class="pcode">'+esc(p.code)+'</span>':'')+
      '<div class="pstats"><div><em>'+fmt(p.qty)+'</em><small>الكمية في الطلبات</small></div><div><em>'+p.orders+'</em><small>عدد الطلبات</small></div></div>'+
      '<div class="pchips">'+MTnames().map(function(n){var s=secInfo(n),k=(secCounts(p.bom)[n])||0;return '<button type="button" class="pchip'+(k?' has':'')+'" style="--c:'+s.c+'" data-a="bomopen" data-i="'+i+'" data-sec="'+esc(n)+'" title="حصر مواد '+esc(secDisp(n))+'">'+s.ic+' '+esc(secDisp(n))+' <em>'+(k?k:'＋')+'</em></button>';}).join('')+'</div>'+
      '<div class="pfoot">'+st+'<button class="btn sm '+(p.bom?'ghost':'gold')+'" data-a="bomopen" data-i="'+i+'" type="button">'+(p.bom?'تعديل':'حصر المواد')+'</button></div></div></div>';
  }).join('');
  box.innerHTML='<div class="psl-top"><span>تم حصر <b>'+done+'</b> من <b>'+prodList.length+'</b> صنف</span><span class="psl-count" id="pslCount"></span></div>'+
    '<div class="psl-wrap"><button type="button" class="psl-nav" data-psl="1" aria-label="السابق">›</button>'+
    '<div class="psl-track" id="pslTrack" tabindex="0">'+cards+'</div>'+
    '<button type="button" class="psl-nav" data-psl="-1" aria-label="التالي">‹</button></div>'+
    '<div class="psl-dots" id="pslDots">'+prodList.map(function(p,i){return '<button type="button" class="psl-dot'+(p.bom?' ok':'')+'" data-go="'+i+'" aria-label="الصنف '+(i+1)+'"></button>';}).join('')+'</div>';
  var tr=$('pslTrack');
  function step(){var c=tr.children[0];return c?c.getBoundingClientRect().width+14:300;}
  function cur(){return Math.max(0,Math.min(prodList.length-1,Math.round(Math.abs(tr.scrollLeft)/step())));}
  function mark(){
    var k=cur();prodSlideIdx=k;
    $('pslCount').textContent=(k+1)+' / '+prodList.length;
    Array.prototype.forEach.call($('pslDots').children,function(d,j){d.classList.toggle('on',j===k);});
  }
  tr.addEventListener('scroll',function(){clearTimeout(tr._h);tr._h=setTimeout(mark,40);});
  box.onclick=function(e){
    var n=e.target.closest('button[data-psl]');
    if(n){var dir=getComputedStyle(tr).direction==='rtl'?-1:1;tr.scrollBy({left:(+n.dataset.psl>0?-dir:dir)*step(),behavior:'smooth'});return;}
    var g=e.target.closest('button[data-go]');
    if(g){var d2=getComputedStyle(tr).direction==='rtl'?-1:1;tr.scrollTo({left:d2*(+g.dataset.go)*step(),behavior:'smooth'});return;}
    var b=e.target.closest('button[data-a=bomopen]');if(b){bomSecSel=b.dataset.sec||'';openBom(prodList[+b.dataset.i]);if(bomSecSel){ensureSecRow(bomSecSel);renderBomEd();}}
  };
  var d3=getComputedStyle(tr).direction==='rtl'?-1:1;
  tr.scrollLeft=d3*Math.min(prodSlideIdx,prodList.length-1)*step();
  mark();
}
function renderBomEd(){
  var d=bomDraft;
  $('bomEdit').style.display=d?'block':'none';
  if(!d)return;
  $('bomCode').value=d.code;$('bomName').value=d.name;
  $('bomTpl').innerHTML='<option value="">— تلقائي حسب اسم الصنف —</option>'+Object.keys(tpls).map(function(k){return '<option>'+esc(k)+'</option>';}).join('');$('bomTpl').value=d.tpl||'';
  var names=MTnames().slice();
  if(d.comps.some(function(c){return (c.mat||num(c.qty)>0)&&compSec(c)===MT_NONE;}))names.push(MT_NONE);
  if(bomSecSel&&names.indexOf(bomSecSel)<0)bomSecSel='';
  var cnt={},tot=0;
  d.comps.forEach(function(c){if(!(c.mat||num(c.qty)>0))return;var k=compSec(c);cnt[k]=(cnt[k]||0)+1;tot++;});
  $('bomSecTabs').innerHTML='<button type="button" class="bsec'+(!bomSecSel?' on':'')+'" data-sec="" style="--c:#14284b">📋 كل الأقسام <em>'+tot+'</em></button>'+
    names.map(function(n){var s=secInfo(n);return '<button type="button" class="bsec'+(bomSecSel===n?' on':'')+'" data-sec="'+esc(n)+'" style="--c:'+s.c+'">'+s.ic+' '+esc(secDisp(n))+' <em>'+(cnt[n]||0)+'</em></button>';}).join('');
  $('bomSecHint').textContent=bomSecSel?('تعرض الآن مواد قسم «'+secDisp(bomSecSel)+'» فقط لهذا الصنف. يمكنك نقل أي مادة إلى قسم آخر من عمود «القسم».'):'تعرض كل مواد الصنف. اختر قسمًا (نجارة، دهان…) لحصر مواده فقط.';
  var rows=[];
  d.comps.forEach(function(c,i){
    var cs=compSec(c);
    if(bomSecSel&&cs!==bomSecSel)return;
    var m=matBy(c.mat);
    rows.push('<tr><td><select data-i="'+i+'" data-k="mat">'+matOptsSec(c.mat,cs)+'</select></td>'+
      '<td><select class="secsel" data-i="'+i+'" data-k="sec">'+names.map(function(n){return '<option value="'+esc(n)+'"'+(n===cs?' selected':'')+'>'+esc(secDisp(n))+'</option>';}).join('')+'</select></td>'+
      '<td class="unitc">'+esc(m?m.unit:'')+'</td>'+
      '<td><input type="number" step="any" min="0" data-i="'+i+'" data-k="qty" value="'+esc(c.qty)+'"></td>'+
      '<td><input type="number" step="any" min="0" data-i="'+i+'" data-k="waste" value="'+esc(c.waste)+'"></td>'+
      '<td class="tot num">'+fmt(num(c.qty)*(1+num(c.waste)/100))+'</td>'+
      '<td><input data-i="'+i+'" data-k="note" value="'+esc(c.note||'')+'"></td>'+
      '<td><button class="btn sm red" data-a="delcomp" data-i="'+i+'" type="button" aria-label="حذف المادة">×</button></td></tr>');
  });
  $('bomBody').innerHTML=rows.length?rows.join(''):'<tr><td colspan="8" class="empty">لا توجد مواد في هذا القسم لهذا الصنف. اضغط «+ إضافة مادة».</td></tr>';
}
function openBom(p){
  if(!materials.length){toast('أضف الخامات أولًا في دليل الخامات');return;}
  bomDraft=p.bom?JSON.parse(JSON.stringify(p.bom)):newBom(p.code,p.name);
  renderBomEd();$('bomEdit').scrollIntoView({block:'center'});
}
function saveBom(){
  var d=bomDraft;if(!d)return;
  var code=$('bomCode').value.trim(),name=$('bomName').value.trim();
  if(!code&&!name){toast('أدخل كود الصنف أو اسمه');return;}
  var comps=d.comps.filter(function(c){return c.mat||num(c.qty)>0;});
  if(!comps.length){toast('أضف مادة واحدة على الأقل');return;}
  if(comps.some(function(c){return !c.mat||num(c.qty)<=0;})){toast('كل مادة تحتاج خامة وكمية أكبر من صفر');return;}
  var seen={};
  if(comps.some(function(c){if(seen[c.mat])return true;seen[c.mat]=1;return false;})){toast('خامة مكررة في القائمة، اجمع كمياتها في سطر واحد');return;}
  var dup=boms.some(function(b){return b.id!==d.id&&((code&&lkey(b.code)===lkey(code))||(name&&lkey(b.name)===lkey(name)));});
  if(dup){toast('يوجد حصر آخر بنفس الكود أو الاسم');return;}
  comps.forEach(function(c){c.sec=compSec(c);});
  d.code=code;d.name=name;d.comps=comps;
  var i=boms.findIndex(function(b){return b.id===d.id;});
  if(i>-1)boms[i]=d;else boms.push(d);
  bomDraft=null;renderBomEd();refresh();toast('تم حفظ حصر المواد للصنف '+(name||code));
}


/* ---------- حصر طلب كامل بجميع مكوناته ---------- */
var obOrderId='',obList=[],obSec='',obDirty=false,obLoadedFor='';
function obClone(o){return JSON.parse(JSON.stringify(o));}
function obLoad(){
  var o=orderBy(obOrderId),seen={};
  obList=[];obDirty=false;obLoadedFor=obOrderId;
  if(o)mfgUnits(o).forEach(function(u){
    var k=lkey(u.code)||lkey(u.name);if(!k)return;
    if(seen[k]){seen[k].qty+=u.qty;return;}
    var b=findBom({code:u.code,name:u.name});
    var e={code:u.code,name:u.name,qty:u.qty,li:u.li,line:u.l.name||u.l.code||'',isSet:u.pi>-1,bom:b?obClone(b):newBom(u.code,u.name)};
    seen[k]=e;obList.push(e);
  });
  obRender();
}
function obNames(){
  var n=MTnames().slice();
  if(obList.some(function(e){return e.bom.comps.some(function(c){return (c.mat||num(c.qty)>0)&&compSec(c)===MT_NONE;});}))n.push(MT_NONE);
  return n;
}
function obUnit(e,ui,names){
  var rows=[],n=0;
  e.bom.comps.forEach(function(c,i){
    if(c.mat||num(c.qty)>0)n++;
    var cs=compSec(c);if(obSec&&cs!==obSec)return;
    var m=matBy(c.mat),per=num(c.qty)*(1+num(c.waste)/100),d=' data-u="'+ui+'" data-i="'+i+'"';
    rows.push('<tr><td><select'+d+' data-k="mat">'+matOptsSec(c.mat,cs)+'</select></td>'+
      '<td><select class="secsel"'+d+' data-k="sec">'+names.map(function(x){return '<option value="'+esc(x)+'"'+(x===cs?' selected':'')+'>'+esc(secDisp(x))+'</option>';}).join('')+'</select></td>'+
      '<td class="unitc">'+esc(m?m.unit:'')+'</td>'+
      '<td><input type="number" step="any" min="0"'+d+' data-k="qty" value="'+esc(c.qty)+'"></td>'+
      '<td><input type="number" step="any" min="0"'+d+' data-k="waste" value="'+esc(c.waste)+'"></td>'+
      '<td class="tot num">'+fmt(per)+'</td><td class="ord num">'+fmt(r3(per*e.qty))+'</td>'+
      '<td><input'+d+' data-k="note" value="'+esc(c.note||'')+'"></td>'+
      '<td><button class="btn sm red" data-a="obdel"'+d+' type="button" aria-label="حذف المادة">×</button></td></tr>');
  });
  var opts=obList.map(function(x,j){return j!==ui?'<option value="u'+j+'">'+esc('من هذا الطلب: '+(x.name||x.code))+'</option>':'';}).join('')+
    boms.map(function(b,j){return '<option value="b'+j+'">'+esc((b.code?b.code+' — ':'')+b.name)+'</option>';}).join('');
  return '<div class="obunit"><div class="obhead"><b>'+esc(e.name||e.code)+'</b><span>× '+fmt(e.qty)+' في الطلب</span><span class="st '+(n?'done':'todo')+'">'+(n?'✓ '+n+' مواد':'○ بلا حصر')+'</span></div>'+
    '<div class="scroll"><table class="rec mt"><thead><tr><th style="min-width:220px">الخامة</th><th>القسم</th><th>الوحدة</th><th>الكمية لكل وحدة</th><th>الهالك %</th><th>مع الهالك</th><th>إجمالي الطلب</th><th>ملاحظة</th><th></th></tr></thead><tbody>'+
    (rows.join('')||'<tr><td colspan="9" class="empty">لا توجد مواد'+(obSec?' في هذا القسم':'')+' لهذا المكوّن. اضغط «+ إضافة مادة».</td></tr>')+'</tbody></table></div>'+
    '<div class="bar"><button class="btn sm ghost" data-a="obadd" data-u="'+ui+'" type="button">+ إضافة مادة</button>'+
    '<select data-cp="'+ui+'" style="max-width:260px" aria-label="نسخ المواد من"><option value="">نسخ المواد من…</option>'+opts+'</select>'+
    '<button class="btn sm ghost" data-a="obcopy" data-u="'+ui+'" type="button">نسخ</button></div></div>';
}
function obRender(){
  var box=$('obBody'),names=obNames(),cnt={},tot=0,h='',last=-1;
  if(obSec&&names.indexOf(obSec)<0)obSec='';
  if(!obList.length){
    box.innerHTML='<div class="empty" style="padding:14px">لا توجد أصناف في هذا الطلب.</div>';
    $('obSecTabs').innerHTML='';obSummary();return;
  }
  obList.forEach(function(e){e.bom.comps.forEach(function(c){if(!(c.mat||num(c.qty)>0))return;var k=compSec(c);cnt[k]=(cnt[k]||0)+1;tot++;});});
  $('obSecTabs').innerHTML='<button type="button" class="bsec'+(!obSec?' on':'')+'" data-sec="" style="--c:#14284b">📋 كل الأقسام <em>'+tot+'</em></button>'+
    names.map(function(n){var s=secInfo(n);return '<button type="button" class="bsec'+(obSec===n?' on':'')+'" data-sec="'+esc(n)+'" style="--c:'+s.c+'">'+s.ic+' '+esc(secDisp(n))+' <em>'+(cnt[n]||0)+'</em></button>';}).join('');
  obList.forEach(function(e,ui){
    if(e.li!==last){last=e.li;h+='<h3 class="obline">'+esc(e.line)+(e.isSet?' <small>(طقم — مكوّناته أدناه)</small>':'')+'</h3>';}
    h+=obUnit(e,ui,names);
  });
  box.innerHTML=h;obSummary();
}
function obSummary(){
  var agg={},ids=[],box=$('obSum');if(!box)return;
  obList.forEach(function(e){e.bom.comps.forEach(function(c){
    if(!c.mat||num(c.qty)<=0)return;var m=matBy(c.mat);if(!m)return;
    var sc=compSec(c);if(obSec&&sc!==obSec)return;
    var x=agg[c.mat];if(!x){x=agg[c.mat]={m:m,sec:sc,need:0,prods:[]};ids.push(c.mat);}
    x.need+=e.qty*num(c.qty)*(1+num(c.waste)/100);
    if(x.prods.indexOf(e.name||e.code)<0)x.prods.push(e.name||e.code);
  });});
  if(!ids.length){box.innerHTML='';return;}
  box.innerHTML='<h2 style="margin-top:18px">إجمالي خامات الطلب'+(obSec?' — '+esc(secDisp(obSec)):'')+' ('+ids.length+' خامة)</h2><div class="scroll"><table class="rec mt"><thead><tr><th>م</th><th>الخامة</th><th>القسم</th><th>الوحدة</th><th>الاحتياج للطلب</th><th>رصيد المخزون</th><th>العجز</th><th>المكوّنات المستخدمة فيها</th></tr></thead><tbody>'+
    ids.map(function(id,i){var x=agg[id],sh=Math.max(0,r3(x.need-num(x.m.stock)));
      return '<tr><td>'+(i+1)+'</td><td>'+esc(matLabel(x.m))+'</td><td>'+esc(secDisp(x.sec))+'</td><td>'+esc(x.m.unit)+'</td><td class="num"><b>'+fmt(r3(x.need))+'</b></td><td class="num">'+fmt(num(x.m.stock))+'</td><td class="num">'+(sh?fmt(sh):'—')+'</td><td>'+esc(x.prods.join('، '))+'</td></tr>';}).join('')+'</tbody></table></div>';
}
function obSave(){
  if(!materials.length){toast('أضف الخامات أولًا في دليل الخامات');return;}
  var out=[],i,e,comps,seen;
  for(i=0;i<obList.length;i++){
    e=obList[i];
    comps=e.bom.comps.filter(function(c){return c.mat||num(c.qty)>0;});
    if(!comps.length)continue;
    if(comps.some(function(c){return !c.mat||num(c.qty)<=0;})){toast('«'+(e.name||e.code)+'»: كل مادة تحتاج خامة وكمية أكبر من صفر');return;}
    seen={};
    if(comps.some(function(c){if(seen[c.mat])return true;seen[c.mat]=1;return false;})){toast('«'+(e.name||e.code)+'»: خامة مكررة، اجمع كمياتها في سطر واحد');return;}
    out.push({e:e,comps:comps});
  }
  if(!out.length){toast('أضف مادة واحدة على الأقل');return;}
  out.forEach(function(x){
    x.comps.forEach(function(c){c.sec=compSec(c);});
    var b=x.e.bom,j;b.comps=x.comps;b.code=x.e.code;b.name=x.e.name;
    j=boms.findIndex(function(z){return z.id===b.id;});
    if(j>-1)boms[j]=b;else boms.push(b);
  });
  var miss=obList.length-out.length;
  obDirty=false;refresh();
  toast('تم حفظ حصر '+out.length+' مكوّن من الطلب'+(miss?' — بقي '+miss+' بلا حصر':''));
}
function obSync(){
  var sel=$('obOrder');if(!sel)return;
  var list=orders.filter(function(o){return o.status!==STATUS[5];}).sort(function(a,b){return (a.deliveryDate||'').localeCompare(b.deliveryDate||'');});
  sel.innerHTML=list.length?list.map(function(o){return '<option value="'+o.id+'">'+esc(o.orderNo)+' — '+esc(o.custName)+(o.deliveryDate?' ('+esc(o.deliveryDate)+')':'')+'</option>';}).join(''):'<option value="">لا توجد طلبات</option>';
  if(!list.some(function(o){return o.id===obOrderId;}))obOrderId=list.length?list[0].id:'';
  sel.value=obOrderId;
  if(!obDirty||obLoadedFor!==obOrderId)obLoad();
}
function obInit(){
  var body=$('obBody');
  $('obOrder').onchange=function(){
    if(obDirty&&!confirm('توجد تعديلات غير محفوظة على هذا الطلب، هل تتجاهلها؟')){this.value=obOrderId;return;}
    obOrderId=this.value;obSec='';obLoad();
  };
  $('obSecTabs').addEventListener('click',function(e){var b=e.target.closest('button[data-sec]');if(!b)return;obSec=b.dataset.sec;obRender();});
  body.addEventListener('input',function(e){
    var t=e.target,k=t.dataset.k;if(!k||t.dataset.u==null)return;
    var en=obList[+t.dataset.u],c=en&&en.bom.comps[+t.dataset.i];if(!c)return;
    c[k]=t.value;obDirty=true;
    var tr=t.closest('tr'),per=num(c.qty)*(1+num(c.waste)/100);
    tr.querySelector('.tot').textContent=fmt(per);tr.querySelector('.ord').textContent=fmt(r3(per*en.qty));
    if(k==='mat'){var m=matBy(t.value);tr.querySelector('.unitc').textContent=m?m.unit:'';}
    obSummary();
  });
  body.addEventListener('change',function(e){var t=e.target;if(t.dataset.k==='sec'&&t.dataset.u!=null){obRender();toast('نُقلت المادة إلى قسم '+secDisp(t.value));}});
  body.addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b)return;
    var ui=+b.dataset.u,en=obList[ui],a=b.dataset.a;if(!en)return;
    if(a==='obadd'){en.bom.comps.push({mat:'',qty:'',waste:5,note:'',sec:obSec});obDirty=true;obRender();}
    else if(a==='obdel'){en.bom.comps.splice(+b.dataset.i,1);if(!en.bom.comps.length)en.bom.comps.push({mat:'',qty:'',waste:5,note:'',sec:''});obDirty=true;obRender();}
    else if(a==='obcopy'){
      var s=body.querySelector('select[data-cp="'+ui+'"]'),v=s?s.value:'';if(!v)return;
      var src=v.charAt(0)==='u'?(obList[+v.slice(1)]||{}).bom:boms[+v.slice(1)];if(!src)return;
      en.bom.comps=obClone(src.comps);obDirty=true;obRender();toast('تم نسخ المواد، عدّل الكميات ثم احفظ');
    }
  });
  $('obSave').onclick=obSave;
  $('obReset').onclick=function(){obLoad();};
}

/* ---------- متابعة حصر الطلب حسب الأقسام ---------- */
function secTrackData(o){
  var us=mfgUnits(o),j=jobs[o.id],issued=!!(j&&j.issued),res={},order=[];
  var inPR={};
  prs.forEach(function(p){if(p.orders&&p.orders.indexOf(o.id)>-1&&p.status!==PRS[4])(p.lines||[]).forEach(function(l){inPR[l.mat]=1;});});
  var noBom=us.filter(function(u){var b=findBom({code:u.code,name:u.name});return !b||!b.comps.length;});
  function slot(n){if(!res[n]){res[n]={name:n,units:{},mats:{}};order.push(n);}return res[n];}
  MTnames().forEach(slot);
  us.forEach(function(u){
    var b=findBom({code:u.code,name:u.name});if(!b)return;
    b.comps.forEach(function(c){
      var m=matBy(c.mat);if(!m)return;
      var s=slot(compSec(c)),per=num(c.qty)*(1+num(c.waste)/100);
      s.units[(u.code||'')+'|'+(u.name||'')]=1;
      var x=s.mats[c.mat]||(s.mats[c.mat]={m:m,need:0,prods:[]});
      x.need+=u.qty*per;x.prods.push({name:u.name||u.code,qty:u.qty});
    });
  });
  order.forEach(function(n){
    var s=res[n],ids=Object.keys(s.mats);
    s.nUnits=Object.keys(s.units).length;s.nMats=ids.length;
    s.short=ids.filter(function(id){return s.mats[id].need>num(s.mats[id].m.stock)+1e-9;});
    var pr=s.short.filter(function(id){return inPR[id];}).length;
    if(!ids.length)s.st=noBom.length?{s:'todo',d:'بانتظار الحصر'}:{s:'na',d:'لا يلزم لهذا الطلب'};
    else if(issued)s.st={s:'done',d:'صُرفت للتصنيع'};
    else if(!s.short.length)s.st={s:'done',d:'جاهز للصرف'};
    else if(pr===s.short.length)s.st={s:'part',d:'قيد الشراء'};
    else s.st={s:'todo',d:'عجز '+s.short.length+' خامة — يلزم شراء'};
  });
  return {list:order.map(function(n){return res[n];}),map:res,noBom:noBom,us:us,issued:issued};
}
function renderSecTrack(){
  var sel=$('trkOrder');if(!sel)return;
  var list=orders.filter(function(o){return o.status!==STATUS[5];}).sort(function(a,b){return (a.deliveryDate||'').localeCompare(b.deliveryDate||'');});
  sel.innerHTML=list.length?list.map(function(o){return '<option value="'+o.id+'">'+esc(o.orderNo)+' — '+esc(o.custName)+(o.deliveryDate?' ('+esc(o.deliveryDate)+')':'')+'</option>';}).join(''):'<option value="">لا توجد طلبات</option>';
  if(!list.some(function(o){return o.id===trkOrderId;}))trkOrderId=list.length?list[0].id:'';
  sel.value=trkOrderId;
  var o=orderBy(trkOrderId);
  if(!o){$('trkFlow').innerHTML='';$('trkNote').innerHTML='';$('trkTbl').innerHTML='<tbody><tr><td class="empty">لا توجد طلبات. سجّل طلبًا أو حمّل البيانات التجريبية من لوحة المتابعة.</td></tr></tbody>';return;}
  var S=cycleOf(o,mrp(true));
  $('trkFlow').innerHTML=S.map(function(x,i){return (i?'<span class="trkarr">‹</span>':'')+'<span class="st '+x.s+'">'+SYM[x.s]+' '+esc(x.t)+(x.d?' <small>'+esc(x.d)+'</small>':'')+'</span>';}).join('');
  var D=secTrackData(o);
  $('trkTbl').innerHTML='<thead><tr><th>القسم</th><th>أصناف لها مواد في القسم</th><th>عدد الخامات</th><th>المخزون</th><th>الحالة</th><th></th></tr></thead><tbody>'+
    D.list.map(function(s){
      var inf=secInfo(s.name);
      return '<tr><td><b style="color:'+inf.c+'">'+inf.ic+' '+esc(secDisp(s.name))+'</b></td>'+
        '<td class="num">'+s.nUnits+' من '+D.us.length+'</td><td class="num">'+s.nMats+'</td>'+
        '<td>'+(s.nMats?(D.issued?'مصروف':s.short.length?'ناقص '+s.short.length:'يكفي'):'—')+'</td>'+
        '<td><span class="st '+s.st.s+'">'+SYM[s.st.s]+' '+esc(s.st.d)+'</span></td>'+
        '<td><button class="btn sm gold" data-a="trkopen" data-sec="'+esc(s.name)+'" type="button">'+(s.nMats?'تعديل الحصر':'حصر المواد')+'</button> '+
        (s.nMats?'<button class="btn sm ghost" data-a="trkprint" data-sec="'+esc(s.name)+'" type="button">🖨 طباعة</button>':'')+'</td></tr>';
    }).join('')+'</tbody>';
  $('trkNote').innerHTML=D.noBom.length?'<div class="note bad">أصناف لم يُحصر لها أي مواد بعد: '+D.noBom.map(function(u){return esc(u.name||u.code||'صنف');}).join('، ')+'.</div>':'';
}
function secOpenBom(o,sec){
  var D=secTrackData(o),u=D.us.filter(function(x){return !D.map[sec]||!D.map[sec].units[(x.code||'')+'|'+(x.name||'')];})[0]||D.us[0];
  if(!u){toast('لا توجد أصناف في هذا الطلب');return;}
  if(!materials.length){toast('أضف الخامات أولًا في دليل الخامات');return;}
  var p=prodList.filter(function(x){return (lkey(u.code)&&lkey(x.code)===lkey(u.code))||lkey(x.name)===lkey(u.name);})[0];
  if(!p){toast('تعذر إيجاد الصنف في قائمة الأصناف');return;}
  bomSecSel=sec;openBom(p);ensureSecRow(sec);renderBomEd();
  toast('حصر مواد '+secDisp(sec)+' للصنف: '+(u.name||u.code));
}
function trkSecPrint(o,sec){
  var D=secTrackData(o),s=D.map[sec];if(!s)return;
  var ids=Object.keys(s.mats);
  openSheet('<h2>قائمة مواد '+esc(secDisp(sec))+' — طلب '+esc(o.orderNo)+'</h2>'+
    kv([['رقم الطلب',o.orderNo,'العميل',o.custName],['تاريخ التسليم',o.deliveryDate||'','تاريخ الطباعة',today()],['القسم',secDisp(sec),'عدد الخامات',ids.length]])+
    '<table><thead><tr><th>م</th><th>الخامة</th><th>الصورة</th><th>الوحدة</th><th>الكمية المطلوبة</th><th>رصيد المخزون</th><th>العجز</th><th>الأصناف المستخدمة فيها</th></tr></thead><tbody>'+
    ids.map(function(id,i){var x=s.mats[id],sh=Math.max(0,r3(x.need-num(x.m.stock)));
      return '<tr><td>'+(i+1)+'</td><td>'+esc(matLabel(x.m))+'</td><td>'+pImg(x.m.img)+'</td><td>'+esc(x.m.unit)+'</td><td><b>'+fmt(r3(x.need))+'</b></td><td>'+fmt(num(x.m.stock))+'</td><td>'+(D.issued||!sh?'—':fmt(sh))+'</td><td>'+esc(x.prods.map(function(p){return p.name+' ×'+fmt(p.qty);}).join('، '))+'</td></tr>';}).join('')+'</tbody></table>'+
    sigs(['مدير الإنتاج','أمين المخزن','رئيس قسم '+secDisp(sec),'المستلم']));
}

/* ================= حاسبة الألواح ================= */
var PC_PRESETS=[['244x122','244 × 122 سم (قياسي)',244,122],['250x125','250 × 125 سم',250,125],['280x207','280 × 207 سم',280,207],['183x122','183 × 122 سم',183,122],['custom','مقاس مخصص',0,0]];
var PC_COLS=['#d9b48a','#9fb48a','#e0c36a','#c98e6a','#8fb4c0','#c493a8','#b3c27a','#e3a577','#a5a3d1','#85c0aa'];
function pcCfg(){
  var c=cfg.pc;if(!c||typeof c!=='object')c=cfg.pc={};
  if(c.preset==null)c.preset='244x122';
  if(!num(c.L))c.L=244;if(!num(c.W))c.W=122;
  if(c.th==null)c.th='';if(c.kerf==null)c.kerf=3;if(c.trim==null)c.trim=0;
  if(!num(c.units))c.units=1;if(c.reserve==null)c.reserve=0;if(c.mat==null)c.mat='';
  if(!Array.isArray(c.pieces)||!c.pieces.length)c.pieces=[{n:'',l:'',w:'',q:1,lock:false}];
  return c;
}
function pcFilled(){var c=cfg.pc;return c&&Array.isArray(c.pieces)?c.pieces.filter(function(p){return num(p.l)>0&&num(p.w)>0&&num(p.q)>0;}).length:0;}
function pcN(x){return String(Math.round(x*10)/10);}
function pcPackRun(items,aw,ah,kerf){
  var sheets=[],E=1e-9;
  function ns(){return {free:[{x:0,y:0,w:aw+kerf,h:ah+kerf}],items:[],area:0};}
  function put(s,p){
    var best=null;
    s.free.forEach(function(f){
      for(var rot=0;rot<2;rot++){
        if(rot&&(p.lock||p.w===p.h))break;
        var pw=(rot?p.h:p.w)+kerf,ph=(rot?p.w:p.h)+kerf;
        if(pw<=f.w+E&&ph<=f.h+E){
          var a=Math.min(f.w-pw,f.h-ph),b=Math.max(f.w-pw,f.h-ph);
          if(!best||a<best.a-E||(Math.abs(a-best.a)<=E&&b<best.b))best={x:f.x,y:f.y,w:pw,h:ph,rot:rot,a:a,b:b};
        }
      }
    });
    if(!best)return false;
    var nf=[];
    s.free.forEach(function(f){
      if(best.x>=f.x+f.w-E||best.x+best.w<=f.x+E||best.y>=f.y+f.h-E||best.y+best.h<=f.y+E){nf.push(f);return;}
      if(best.x>f.x+E)nf.push({x:f.x,y:f.y,w:best.x-f.x,h:f.h});
      if(best.x+best.w<f.x+f.w-E)nf.push({x:best.x+best.w,y:f.y,w:f.x+f.w-best.x-best.w,h:f.h});
      if(best.y>f.y+E)nf.push({x:f.x,y:f.y,w:f.w,h:best.y-f.y});
      if(best.y+best.h<f.y+f.h-E)nf.push({x:f.x,y:best.y+best.h,w:f.w,h:f.y+f.h-best.y-best.h});
    });
    s.free=nf.filter(function(a,i){
      return !nf.some(function(b,j){
        if(i===j)return false;
        if(!(a.x>=b.x-E&&a.y>=b.y-E&&a.x+a.w<=b.x+b.w+E&&a.y+a.h<=b.y+b.h+E))return false;
        var same=Math.abs(a.x-b.x)<E&&Math.abs(a.y-b.y)<E&&Math.abs(a.w-b.w)<E&&Math.abs(a.h-b.h)<E;
        return !same||j<i;
      });
    });
    s.items.push({id:p.id,x:best.x,y:best.y,w:best.rot?p.h:p.w,h:best.rot?p.w:p.h,rot:!!best.rot});
    s.area+=p.w*p.h;return true;
  }
  items.forEach(function(p){
    var ok=false;
    for(var i=0;i<sheets.length&&!ok;i++)ok=put(sheets[i],p);
    if(!ok){var s=ns();sheets.push(s);put(s,p);}
  });
  return sheets;
}
function pcCompute(){
  var c=pcCfg(),L=num(c.L),W=num(c.W),kerf=Math.max(0,num(c.kerf))/10,trim=Math.max(0,num(c.trim));
  var aw=L-2*trim,ah=W-2*trim,units=Math.max(1,Math.floor(num(c.units))||1);
  var r={L:L,W:W,aw:aw,ah:ah,trim:trim,kerf:kerf,units:units,legend:[],lmap:{},bad:[],sheets:[],used:0,err:''};
  if(!(L>0&&W>0)){r.err='أدخل مقاس اللوح (الطول والعرض).';return r;}
  if(!(aw>0&&ah>0)){r.err='التشذيب أكبر من مقاس اللوح.';return r;}
  var items=[];
  c.pieces.forEach(function(p,i){
    var l=num(p.l),w=num(p.w),q=Math.floor(num(p.q));
    if(!(l>0&&w>0&&q>0))return;
    var lg={id:i+1,n:p.n||('قطعة '+(i+1)),l:l,w:w,q:q*units,lock:!!p.lock,col:PC_COLS[i%PC_COLS.length]};
    r.legend.push(lg);r.lmap[lg.id]=lg;
    var asIs=l<=aw+1e-9&&w<=ah+1e-9,rot=!p.lock&&w<=aw+1e-9&&l<=ah+1e-9;
    if(!asIs&&!rot){r.bad.push(lg);return;}
    for(var k=0;k<lg.q;k++)items.push({id:lg.id,w:l,h:w,lock:!!p.lock});
    r.used+=l*w*lg.q;
  });
  if(items.length>1500){r.err='عدد القطع كبير جدًا (أكثر من 1500). قلّل عدد الوحدات.';return r;}
  if(items.length){
    var a=items.slice().sort(function(x,y){return y.w*y.h-x.w*x.h||Math.max(y.w,y.h)-Math.max(x.w,x.h);});
    var b=items.slice().sort(function(x,y){return Math.max(y.w,y.h)-Math.max(x.w,x.h)||y.w*y.h-x.w*x.h;});
    var s1=pcPackRun(a,aw,ah,kerf),s2=pcPackRun(b,aw,ah,kerf);
    r.sheets=s2.length<s1.length?s2:s1;
  }
  return r;
}
function pcSvg(s,r){
  var h='<svg viewBox="0 0 '+r.L+' '+r.W+'" role="img" style="width:100%;height:auto;display:block;background:#efe6d2;border:1px solid #bda97e;border-radius:4px;direction:ltr">';
  if(r.trim>0)h+='<rect x="'+r.trim+'" y="'+r.trim+'" width="'+r.aw+'" height="'+r.ah+'" fill="none" stroke="#bda97e" stroke-dasharray="3 2" stroke-width=".6"/>';
  s.items.forEach(function(it){
    var lg=r.lmap[it.id],x=it.x+r.trim,y=it.y+r.trim;
    h+='<rect x="'+x+'" y="'+y+'" width="'+it.w+'" height="'+it.h+'" fill="'+lg.col+'" stroke="#3d4a34" stroke-width=".5"/>';
    var tx=pcN(it.w)+'×'+pcN(it.h),fs=Math.min(it.h*0.42,it.w/(tx.length*0.62),7);
    if(fs>=3.2)h+='<text x="'+(x+it.w/2)+'" y="'+(y+it.h/2)+'" font-size="'+fs.toFixed(2)+'" text-anchor="middle" dominant-baseline="central" fill="#1c1c1c" style="direction:ltr;unicode-bidi:embed">'+tx+'</text>';
    else if(Math.min(it.w,it.h)>=5){var f2=Math.min(it.h*0.6,it.w*0.6,6);h+='<text x="'+(x+it.w/2)+'" y="'+(y+it.h/2)+'" font-size="'+f2.toFixed(2)+'" text-anchor="middle" dominant-baseline="central" fill="#1c1c1c">'+it.id+'</text>';}
  });
  return h+'</svg>';
}
function pcMatOpts(sel){
  return matOptsSec(sel,'أخشاب').replace('— اختر الخامة —','— بدون ربط بخامة —');
}
function renderPcInputs(){
  var c=pcCfg();
  $('pcPreset').innerHTML=PC_PRESETS.map(function(x){return '<option value="'+x[0]+'">'+esc(x[1])+'</option>';}).join('');
  $('pcPreset').value=c.preset;
  $('pcL').value=c.L;$('pcW').value=c.W;$('pcTh').value=c.th;$('pcKerf').value=c.kerf;$('pcTrim').value=c.trim;$('pcUnits').value=c.units;$('pcReserve').value=c.reserve;
  $('pcMat').innerHTML=pcMatOpts(c.mat);$('pcMat').value=c.mat;
  $('pcBody').innerHTML=c.pieces.map(function(p,i){
    return '<tr><td class="num"><span class="pcsw" style="background:'+PC_COLS[i%PC_COLS.length]+'"></span>'+(i+1)+'</td>'+
      '<td><input data-i="'+i+'" data-k="n" value="'+esc(p.n||'')+'" placeholder="مثال: جانب، رف، ظهر"></td>'+
      '<td><input type="number" min="0" step="any" data-i="'+i+'" data-k="l" value="'+esc(p.l)+'"></td>'+
      '<td><input type="number" min="0" step="any" data-i="'+i+'" data-k="w" value="'+esc(p.w)+'"></td>'+
      '<td><input type="number" min="1" step="1" data-i="'+i+'" data-k="q" value="'+esc(p.q)+'"></td>'+
      '<td><label class="chk"><input type="checkbox" data-i="'+i+'" data-k="lock"'+(p.lock?' checked':'')+'>ثابت</label></td>'+
      '<td><button class="btn sm red" data-a="pcdel" data-i="'+i+'" type="button" aria-label="حذف القطعة">×</button></td></tr>';
  }).join('');
}
function renderPcResult(){
  var c=pcCfg(),r=pcCompute(),n=r.sheets.length;
  var kp=$('pcKpis'),wn=$('pcWarn'),ly=$('pcLayouts'),lg=$('pcLegend');
  wn.innerHTML='';kp.innerHTML='';ly.innerHTML='';lg.innerHTML='';
  if(r.err){wn.innerHTML='<div class="note bad">'+esc(r.err)+'</div>';return;}
  if(r.bad.length)wn.innerHTML='<div class="note bad">قطع أكبر من اللوح المتاح ولا يمكن قصها: '+r.bad.map(function(x){return esc(x.n)+' ('+pcN(x.l)+'×'+pcN(x.w)+')';}).join('، ')+'. غيّر مقاس اللوح أو قسّم القطعة.</div>';
  if(!r.legend.length){ly.innerHTML='<div class="empty" style="padding:14px">أدخل قطع الصنف (الطول والعرض والعدد) لتظهر النتيجة.</div>';return;}
  var res=num(c.reserve),buy=(n&&res>0)?Math.ceil(n*(1+res/100)-1e-9):n;
  var util=n?r.used/(n*r.L*r.W):0,m=matBy(c.mat),price=m?num(m.price):0;
  var k='<div class="kpi t"><b>'+n+'</b><span>لوح مطلوب حسب مخطط القص</span></div>';
  if(res>0&&n)k+='<div class="kpi"><b>'+buy+'</b><span>لوح مع الاحتياطي ('+pcN(res)+'%)</span></div>';
  k+='<div class="kpi"><b>'+Math.round(util*100)+'%</b><span>نسبة الاستغلال</span></div>'+
     '<div class="kpi"><b>'+Math.round((1-util)*100)+'%</b><span>نسبة الهالك</span></div>'+
     '<div class="kpi"><b>'+(Math.round(r.used/100)/100)+'</b><span>مساحة القطع (م²)</span></div>';
  if(r.units>1&&n)k+='<div class="kpi"><b>'+r3(n/r.units)+'</b><span>لوح لكل وحدة من الصنف</span></div>';
  if(m){
    if(price>0)k+='<div class="kpi"><b>'+fmt(buy*price)+'</b><span>التكلفة التقديرية للألواح</span></div>';
    var st=num(m.stock);k+='<div class="kpi'+(st<buy?' t':'')+'"><b>'+(st>=buy?'يكفي':'ناقص '+fmt(buy-st))+'</b><span>مخزون الخامة ('+fmt(st)+')</span></div>';
  }
  kp.innerHTML=k;
  var placed={};r.sheets.forEach(function(s){s.items.forEach(function(it){placed[it.id]=(placed[it.id]||0)+1;});});
  ly.innerHTML=r.sheets.map(function(s,i){return '<div class="pcard2"><div class="pch"><b>لوح '+(i+1)+'</b><span>استغلال '+Math.round(s.area/(r.L*r.W)*100)+'%</span></div>'+pcSvg(s,r)+'<small>'+s.items.length+' قطعة</small></div>';}).join('');
  lg.innerHTML='<thead><tr><th>م</th><th>القطعة</th><th>الطول</th><th>العرض</th><th>العدد الكلي</th><th>الموضوع</th><th>العرق</th></tr></thead><tbody>'+
    r.legend.map(function(x){return '<tr><td class="num"><span class="pcsw" style="background:'+x.col+'"></span>'+x.id+'</td><td>'+esc(x.n)+'</td><td class="num">'+pcN(x.l)+'</td><td class="num">'+pcN(x.w)+'</td><td class="num">'+x.q+'</td><td class="num">'+(placed[x.id]||0)+'</td><td>'+(x.lock?'ثابت':'يجوز التدوير')+'</td></tr>';}).join('')+'</tbody>';
}
function renderPanelCalc(){renderPcInputs();renderPcResult();}
function pcPrintSheet(){
  var c=pcCfg(),r=pcCompute();
  if(r.err||!r.sheets.length){toast(r.err||'أدخل قطع الصنف أولًا');return;}
  var n=r.sheets.length,util=r.used/(n*r.L*r.W),m=matBy(c.mat);
  openSheet('<h2>مخطط قص الألواح</h2>'+
    kv([['تاريخ الطباعة',today(),'مقاس اللوح',pcN(r.L)+' × '+pcN(r.W)+' سم'],['عدد الألواح',n,'نسبة الاستغلال',Math.round(util*100)+'%'],['سمك الشفرة',pcN(r.kerf*10)+' مم','عدد وحدات الصنف',r.units],['خامة اللوح',m?matLabel(m):'—','السمك',c.th?c.th+' مم':'—']])+
    '<table><thead><tr><th>م</th><th>القطعة</th><th>الطول</th><th>العرض</th><th>العدد</th><th>العرق</th></tr></thead><tbody>'+
    r.legend.map(function(x){return '<tr><td>'+x.id+'</td><td>'+esc(x.n)+'</td><td>'+pcN(x.l)+'</td><td>'+pcN(x.w)+'</td><td>'+x.q+'</td><td>'+(x.lock?'ثابت':'يجوز التدوير')+'</td></tr>';}).join('')+'</tbody></table>'+
    r.sheets.map(function(s,i){return '<div style="display:inline-block;width:48%;margin:1%;vertical-align:top;page-break-inside:avoid"><b>لوح '+(i+1)+'</b> — استغلال '+Math.round(s.area/(r.L*r.W)*100)+'%'+pcSvg(s,r)+'</div>';}).join('')+
    sigs(['النجار','مدير الإنتاج']));
}
function pcToBom(){
  var c=pcCfg(),r=pcCompute();
  if(r.err||!r.sheets.length){toast(r.err||'أدخل قطع الصنف أولًا');return;}
  if(!c.mat||!matBy(c.mat)){toast('اختر خامة اللوح من الدليل أولًا');return;}
  if(!bomDraft){toast('افتح حصر الصنف أولًا من «المواد والحصر» ثم ارجع لهذه الحاسبة');return;}
  var m=matBy(c.mat),q=r3(r.sheets.length/r.units),w=num(c.reserve);
  var ex=bomDraft.comps.filter(function(x){return x.mat===c.mat;})[0];
  if(ex){ex.qty=q;ex.waste=w;ex.note='من حاسبة الألواح';}
  else{
    bomDraft.comps=bomDraft.comps.filter(function(x){return x.mat||num(x.qty)>0;});
    bomDraft.comps.push({mat:c.mat,qty:q,waste:w,note:'من حاسبة الألواح',sec:matType(m)});
  }
  bomSecSel='';show('mats');renderBomEd();
  toast('أُضيفت '+q+' لوح لكل وحدة إلى حصر الصنف، راجع الحصر واحفظه');
}

/* ---------- MRP ---------- */
function renderMrp(){
  var elig=orders.filter(mrpEligible);
  $('mrpCnt').textContent=elig.filter(function(o){return !mrpExcl[o.id];}).length+' من '+elig.length;
  $('mrpOrders').innerHTML=elig.length?elig.map(function(o){
    return '<label class="chk chip"><input type="checkbox" data-id="'+o.id+'"'+(mrpExcl[o.id]?'':' checked')+'>'+esc(o.orderNo)+' — '+esc(o.custName)+' ('+esc(o.deliveryDate)+')</label>';
  }).join(''):'<span class="empty">لا توجد طلبات مفتوحة مؤهلة للحساب.</span>';
  var M=mrp(false),sh=M.list.filter(function(x){return x.short>0;}),cost=sh.reduce(function(a,x){return a+x.cost;},0);
  $('mrpKpis').innerHTML=
    '<div class="kpi"><b>'+M.list.length+'</b><span>خامات مطلوبة للطلبات المشمولة</span></div>'+
    '<div class="kpi r"><b>'+sh.length+'</b><span>خامات بها عجز</span></div>'+
    '<div class="kpi g"><b>'+fmt(cost)+'</b><span>تكلفة العجز التقديرية</span></div>'+
    '<div class="kpi t"><b>'+M.missing.length+'</b><span>أصناف بلا حصر مواد</span></div>';
  $('mrpTbl').innerHTML=M.list.length?
    '<thead><tr><th>الخامة</th><th>الوحدة</th><th>الاحتياج</th><th>المخزون</th><th>قيد الشراء</th><th>العجز</th><th>التكلفة التقديرية</th><th>أقرب تسليم</th><th>آخر موعد لإصدار الطلب</th><th>المورد</th><th>الطلبات</th></tr></thead><tbody>'+
    M.list.map(function(x){
      var lt=x.short>0&&x.orderBy&&x.orderBy<today();
      return '<tr class="'+(x.short>0?'warn':'')+'"><td><b>'+esc(matLabel(x.m))+'</b><span class="sub">'+esc(x.m.code)+' · '+esc(matType(x.m))+'</span></td><td>'+esc(x.m.unit)+'</td><td class="num">'+fmt(x.need)+'</td><td class="num">'+fmt(x.stock)+'</td><td class="num">'+fmt(x.onOrder)+'</td>'+
        '<td class="num '+(x.short>0?'late':'')+'">'+(x.short>0?fmt(x.short):'—')+'</td><td class="num">'+(x.short>0?fmt(x.cost):'—')+'</td><td class="num">'+esc(x.dd||'')+'</td><td class="num '+(lt?'late':'')+'">'+(x.short>0?esc(x.orderBy)+(lt?' (متأخر)':''):'—')+'</td><td>'+esc(x.m.supplier)+'</td><td>'+esc(Object.keys(x.orders).map(function(k){return x.orders[k];}).join('، '))+'</td></tr>';
    }).join('')+'<tr><td colspan="6"><b>إجمالي تكلفة العجز</b></td><td class="num"><b>'+fmt(cost)+'</b></td><td colspan="4"></td></tr></tbody>'
    :'<tbody><tr><td class="empty">لا يوجد احتياج محسوب. تأكد من وجود طلبات مفتوحة وحصر مواد لأصنافها.</td></tr></tbody>';
  var w='';
  if(M.missing.length)w+='<div class="note bad">أصناف بلا حصر مواد (لم تُحسب خاماتها): '+M.missing.map(function(x){return esc(x.prod)+' (طلب '+esc(x.order)+')';}).join('، ')+'. <button class="btn sm ghost" data-a="tobom" type="button">فتح الحصر</button></div>';
  if(M.below.length)w+='<div class="note bad">خامات تحت الحد الأدنى للمخزون: '+M.below.map(function(m){return esc(m.name)+' (الرصيد '+fmt(num(m.stock))+' / الحد '+fmt(num(m.min))+')';}).join('، ')+'.</div>';
  $('mrpWarn').innerHTML=w;
  $('mrpDetail').innerHTML=M.detail.length?
    '<thead><tr><th>الطلب</th><th>العميل</th><th>الصنف</th><th>الكمية</th><th>الخامة</th><th>الاحتياج مع الهالك</th></tr></thead><tbody>'+
    M.detail.map(function(d){return '<tr><td>'+esc(d.order)+'</td><td>'+esc(d.cust)+'</td><td>'+esc(d.prod)+'</td><td class="num">'+fmt(d.qty)+'</td><td>'+esc(d.m.name)+'</td><td class="num">'+fmt(d.need)+' '+esc(d.m.unit)+'</td></tr>';}).join('')+'</tbody>'
    :'<tbody><tr><td class="empty">لا يوجد تفصيل.</td></tr></tbody>';
}
function nextPrNo(){
  var y=new Date().getFullYear(),mx=0;
  prs.forEach(function(p){var m=/-(\d+)$/.exec(p.no||'');if(m&&p.no.indexOf(String(y))>-1)mx=Math.max(mx,parseInt(m[1],10));});
  return 'PR-'+y+'-'+('0000'+(mx+1)).slice(-4);
}
function createPRs(){
  var M=mrp(false),by={};
  M.list.forEach(function(x){if(x.short<=0)return;var s=x.m.supplier||'غير محدد';(by[s]=by[s]||[]).push(x);});
  var keys=Object.keys(by);
  if(!keys.length){toast('لا يوجد عجز لإنشاء طلب شراء');return;}
  var made=[];
  keys.forEach(function(s){
    var oids={},req=null;
    var lines=by[s].map(function(x){
      Object.keys(x.orders).forEach(function(id){oids[id]=1;});
      if(x.dd){var r=addDays(x.dd,-num(cfg.mfgDays));if(!req||r<req)req=r;}
      return {mat:x.id,qty:Math.ceil(x.short*100)/100,price:num(x.m.price),note:'',img:x.m.img||''};
    });
    var p={id:uid(),no:nextPrNo(),date:today(),req:req||'',supplier:s==='غير محدد'?'':s,status:PRS[0],notes:'مُولَّد من تقرير احتياج الخامات',orders:Object.keys(oids),lines:lines,applied:false};
    prs.push(p);made.push(p.no);
  });
  refresh();toast('تم إنشاء '+made.length+' طلب شراء (مسودة): '+made.join('، '));
}
/* ---------- طباعة المخزون (المواد والحصر) ---------- */
function stockPrint(){
  var sec=$('stockSec').value,same=(sec===matSel);
  var rows=(same?matScope().filter(function(x){return (!matColor||lkey(x.m.color)===matColor)&&(!matKind||lkey(x.m.kind)===matKind);}):materials.map(function(m,i){return {m:m,i:i};}).filter(function(x){return !sec||matType(x.m)===sec;}));
  if(!rows.length){toast('لا توجد خامات لطباعتها'+(sec?' في قسم «'+sec+'»':'')+'.');return;}
  if(!sec){rows=rows.slice().sort(function(a,b){var ta=matType(a.m),tb=matType(b.m);return ta===tb?String(a.m.name||'').localeCompare(String(b.m.name||''),'ar'):ta.localeCompare(tb,'ar');});}
  var low=0,out=0,totVal=0;
  var body=rows.map(function(x,i){
    var m=x.m,st=num(m.stock),mn=num(m.min),val=st*num(m.price),s,cls='';
    if(st<=0){s='نفد';out++;cls=' style="background:#f6d6d6"';}
    else if(mn>0&&st<=mn){s='منخفض';low++;cls=' style="background:#fbecc8"';}
    else s='متوفر';
    totVal+=val;
    return '<tr'+cls+'><td>'+(i+1)+'</td><td>'+esc(m.code)+'</td><td><b>'+esc(m.name)+'</b></td><td>'+pImg(m.img)+'</td><td>'+esc(matType(m))+'</td><td>'+esc(subOf(m)?subOf(m).name:'')+'</td><td>'+esc(m.color)+'</td><td>'+esc(m.kind)+'</td><td>'+esc(m.unit)+'</td><td><b>'+fmt(st)+'</b></td><td>'+(mn?fmt(mn):'—')+'</td><td>'+s+'</td><td>'+(num(m.price)?fmt(val):'—')+'</td><td>'+esc(m.supplier)+'</td></tr>';
  }).join('');
  var fl=[];
  if(sec)fl.push('القسم: '+esc(sec));
  if(same&&sec&&matSub){var sb=matSub==='__none'?null:matSubs().find(function(s){return s.id===matSub;});fl.push('القسم الفرعي: '+(sb?esc(sb.name):'بدون'));}
  if(same&&matColor)fl.push('اللون: '+esc(matColor));
  if(same&&matKind)fl.push('نوع المادة: '+esc(matKind));
  openSheet('<style>@page{size:A4 landscape;margin:10mm}</style><h2>تقرير مخزون الخامات</h2>'+
    '<table class="kv"><tr><td>تاريخ الطباعة</td><td>'+esc(today())+'</td><td>عدد الخامات</td><td>'+rows.length+'</td><td>منخفضة / نافدة</td><td>'+low+' / '+out+'</td></tr>'+
    '<tr><td>التصفية</td><td colspan="5">'+(fl.join(' — ')||'كل الأقسام')+'</td></tr></table>'+
    '<table><thead><tr><th>م</th><th>الكود</th><th>اسم الخامة</th><th>الصورة</th><th>القسم</th><th>القسم الفرعي</th><th>اللون</th><th>نوع المادة</th><th>الوحدة</th><th>رصيد المخزون</th><th>الحد الأدنى</th><th>الحالة</th><th>القيمة التقديرية</th><th>المورد</th></tr></thead><tbody>'+body+'</tbody></table>'+
    '<table class="kv"><tr><td>إجمالي القيمة التقديرية للمخزون</td><td><b>'+fmt(totVal)+'</b></td></tr></table>'+
    '<div class="sign"><div>أمين المخزن</div><div>المحاسب</div><div>مدير الإنتاج</div><div>المدير العام</div></div>');
  var old=document.title;document.title='مخزون-الخامات-'+today();
  window.addEventListener('afterprint',function r(){document.title=old;window.removeEventListener('afterprint',r);});
}

function mrpPrint(){
  var M=mrp(false),seen={},items=[],names=[];
  M.detail.forEach(function(d){
    var k=d.order+'|'+d.prod;
    if(!seen[k]){seen[k]=1;items.push(d);}
    if(names.indexOf(d.prod)<0)names.push(d.prod);
  });
  openSheet('<h2>تقرير احتياج الخامات</h2>'+kv([['تاريخ التقرير',today(),'عدد الخامات',M.list.length,'أيام التصنيع قبل التسليم',cfg.mfgDays],['عدد الأصناف المشمولة',names.length,'عدد الطلبات',Object.keys(items.reduce(function(a,d){a[d.order]=1;return a;},{})).length]])+
    '<table><thead><tr><th colspan="6">الأصناف التي أُعدّ لها تقرير الاحتياج</th></tr><tr><th>م</th><th>الطلب</th><th>العميل</th><th>الصنف</th><th>الصورة</th><th>الكمية</th></tr></thead><tbody>'+
    (items.length?items.map(function(d,i){return '<tr><td>'+(i+1)+'</td><td>'+esc(d.order)+'</td><td>'+esc(d.cust)+'</td><td><b>'+esc(d.prod)+'</b></td><td>'+pImg(prodImgByName(d.prod))+'</td><td>'+fmt(d.qty)+'</td></tr>';}).join(''):'<tr><td colspan="6">لا توجد أصناف</td></tr>')+'</tbody></table>'+
    (M.missing.length?'<p><b>أصناف بلا حصر مواد (لم تُحسب خاماتها):</b> '+M.missing.map(function(x){return esc(x.prod)+' (طلب '+esc(x.order)+')';}).join('، ')+'</p>':'')+
    '<table><thead><tr><th>الخامة</th><th>الصورة</th><th>النوع</th><th>الوحدة</th><th>الاحتياج</th><th>المخزون</th><th>قيد الشراء</th><th>العجز</th><th>التكلفة التقديرية</th><th>آخر موعد للطلب</th><th>المورد</th><th>الأصناف المستخدمة فيها</th></tr></thead><tbody>'+
    M.list.map(function(x){return '<tr><td>'+esc(matLabel(x.m))+'</td><td>'+pImg(x.m.img)+'</td><td>'+esc(matType(x.m))+'</td><td>'+esc(x.m.unit)+'</td><td>'+fmt(x.need)+'</td><td>'+fmt(x.stock)+'</td><td>'+fmt(x.onOrder)+'</td><td><b>'+(x.short>0?fmt(x.short):'—')+'</b></td><td>'+(x.short>0?fmt(x.cost):'—')+'</td><td>'+(x.short>0?esc(x.orderBy):'')+'</td><td>'+esc(x.m.supplier)+'</td><td>'+esc(Object.keys(x.prods).join('، '))+'</td></tr>';}).join('')+'</tbody></table>'+
    sigs(['مدير الإنتاج','أمين المخزن','المشتريات','المحاسب']));
}
function mrpCsv(){
  var M=mrp(false),rows=[['الكود','الخامة','النوع','الوحدة','الاحتياج','المخزون','قيد الشراء','العجز','التكلفة التقديرية','أقرب تسليم','آخر موعد للطلب','المورد','الأصناف','الطلبات']];
  M.list.forEach(function(x){rows.push([x.m.code,matLabel(x.m),matType(x.m),x.m.unit,r3(x.need),x.stock,x.onOrder,x.short,x.cost,x.dd||'',x.short>0?x.orderBy:'',x.m.supplier,Object.keys(x.prods).join(' | '),Object.keys(x.orders).map(function(k){return x.orders[k];}).join(' | ')]);});
  download('materials-requirements-'+today()+'.csv',csv(rows),'text/csv;charset=utf-8');
}

/* ---------- purchase requests ---------- */
function prTotal(p){return p.lines.reduce(function(a,l){return a+num(l.qty)*num(l.price);},0);}
function renderPrList(){
  var l=prs.slice().sort(function(a,b){return (b.no||'').localeCompare(a.no||'');});
  $('prTbl').innerHTML=l.length?
    '<thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>المورد</th><th>مطلوب قبل</th><th>البنود</th><th>الإجمالي التقديري</th><th>الطلبات المرتبطة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>'+
    l.map(function(p){
      var on=(p.orders||[]).map(function(id){var o=orderBy(id);return o?o.orderNo:'';}).filter(Boolean).join('، ');
      return '<tr><td><b>'+esc(p.no)+'</b></td><td class="num">'+esc(p.date)+'</td><td>'+esc(p.supplier||'—')+'</td><td class="num">'+esc(p.req||'')+'</td><td class="num">'+p.lines.length+'</td><td class="num">'+fmt(prTotal(p))+'</td><td>'+esc(on)+'</td>'+
        '<td><select data-a="prstatus" data-id="'+p.id+'" aria-label="حالة الطلب">'+PRS.map(function(s){return '<option'+(s===p.status?' selected':'')+'>'+s+'</option>';}).join('')+'</select></td>'+
        '<td><div class="bar"><button class="btn sm ghost" data-a="prprint" data-id="'+p.id+'" type="button">طباعة</button><button class="btn sm ghost" data-a="predit" data-id="'+p.id+'" type="button">تعديل</button><button class="btn sm red" data-a="prdel" data-id="'+p.id+'" type="button">حذف</button></div></td></tr>';
    }).join('')+'</tbody>'
    :'<tbody><tr><td class="empty">لا توجد طلبات شراء. أنشئها من تقرير احتياج الخامات أو يدويًا.</td></tr></tbody>';
}
function setPrStatus(p,s){
  p.status=s;
  if(s===PRS[3]&&!p.applied){p.lines.forEach(function(l){var m=matBy(l.mat);if(m)m.stock=r3(num(m.stock)+num(l.qty));});p.applied=true;toast('تم استلام '+p.no+' وإضافة الكميات إلى المخزون');}
  else if(s!==PRS[3]&&p.applied){p.lines.forEach(function(l){var m=matBy(l.mat);if(m)m.stock=r3(num(m.stock)-num(l.qty));});p.applied=false;toast('تم عكس الاستلام وخصم الكميات من المخزون');}
}
function openPr(p){
  if(p&&p.applied){toast('طلب مستلم لا يُعدّل. غيّر حالته أولًا.');return;}
  if(!materials.length){toast('أضف الخامات أولًا في دليل الخامات');return;}
  prDraft=p?JSON.parse(JSON.stringify(p)):{id:uid(),no:nextPrNo(),date:today(),req:'',supplier:'',status:PRS[0],notes:'',orders:[],lines:[{mat:'',qty:'',price:'',note:''}],applied:false,_new:true};
  renderPrEd();$('prEdit').scrollIntoView({block:'start'});
}
function renderPrEd(){
  var d=prDraft;$('prEdit').style.display=d?'block':'none';if(!d)return;
  $('prEdTitle').textContent=d._new?'طلب شراء جديد':'تعديل '+d.no;
  $('prNo').value=d.no;$('prDate').value=d.date;$('prReq').value=d.req||'';$('prSup').value=d.supplier||'';$('prNotes').value=d.notes||'';
  $('prBody').innerHTML=d.lines.map(function(l,i){
    var m=matBy(l.mat);
    return '<tr><td><select data-i="'+i+'" data-k="mat">'+matOpts(l.mat)+'</select></td><td class="unitc">'+esc(m?m.unit:'')+'</td>'+
      '<td><input type="number" step="any" min="0" data-i="'+i+'" data-k="qty" value="'+esc(l.qty)+'"></td>'+
      '<td><input type="number" step="any" min="0" data-i="'+i+'" data-k="price" value="'+esc(l.price)+'"></td>'+
      '<td class="tot num">'+fmt(num(l.qty)*num(l.price))+'</td>'+
      '<td>'+imgCell(l.img,'pr',i)+'</td>'+
      '<td><input data-i="'+i+'" data-k="note" value="'+esc(l.note||'')+'"></td>'+
      '<td><button class="btn sm red" data-a="prdelline" data-i="'+i+'" type="button" aria-label="حذف البند">×</button></td></tr>';
  }).join('');
  $('prTotal').textContent=fmt(prTotal(d));
}
function savePr(){
  var d=prDraft;if(!d)return;
  var ls=d.lines.filter(function(l){return l.mat||num(l.qty)>0;});
  if(!ls.length){toast('أضف بندًا واحدًا على الأقل');return;}
  if(ls.some(function(l){return !l.mat||num(l.qty)<=0;})){toast('كل بند يحتاج خامة وكمية أكبر من صفر');return;}
  if(d.req&&d.req<d.date){toast('موعد التوريد لا يسبق تاريخ الطلب');return;}
  d.lines=ls;delete d._new;
  var i=prs.findIndex(function(p){return p.id===d.id;});
  if(i>-1)prs[i]=d;else prs.push(d);
  prDraft=null;renderPrEd();refresh();toast('تم حفظ طلب الشراء '+d.no);
}
function printPR(p){
  var on=(p.orders||[]).map(function(id){var o=orderBy(id);return o?o.orderNo:'';}).filter(Boolean).join('، ');
  openSheet('<h2>طلب شراء خامات</h2>'+kv([['رقم الطلب',p.no,'التاريخ',p.date,'مطلوب قبل',p.req||''],['المورد',p.supplier||'—','الحالة',p.status,'الطلبات المرتبطة',on]])+
    '<table><thead><tr><th>م</th><th>الكود</th><th>الخامة</th><th>الصورة</th><th>الوحدة</th><th>الكمية</th><th>السعر التقديري</th><th>الإجمالي</th><th>ملاحظة</th></tr></thead><tbody>'+
    p.lines.map(function(l,i){var m=matBy(l.mat)||{};return '<tr><td>'+(i+1)+'</td><td>'+esc(m.code)+'</td><td>'+esc(matLabel(m))+'</td><td>'+pImg(l.img||m.img)+'</td><td>'+esc(m.unit)+'</td><td>'+fmt(num(l.qty))+'</td><td>'+fmt(num(l.price))+'</td><td>'+fmt(num(l.qty)*num(l.price))+'</td><td>'+esc(l.note)+'</td></tr>';}).join('')+
    '<tr><td colspan="7"><b>الإجمالي التقديري</b></td><td colspan="2"><b>'+fmt(prTotal(p))+'</b></td></tr></tbody></table>'+
    (p.notes?kv([['ملاحظات',p.notes]]):'')+sigs(['مقدّم الطلب (الإنتاج)','المحاسب','المشتريات','الاعتماد']));
}

/* ---------- jobs UI ---------- */
function tplOpts(v){return Object.keys(tpls).map(function(k){return '<option'+(k===v?' selected':'')+'>'+esc(k)+'</option>';}).join('');}
function stOpts(v){return ST.map(function(s){return '<option'+(s===v?' selected':'')+'>'+s+'</option>';}).join('');}
function renderJobs(){
  var open=orders.filter(function(o){return [STATUS[0],STATUS[1],STATUS[2],STATUS[3]].indexOf(o.status)>-1;})
    .sort(function(a,b){return (a.deliveryDate||'').localeCompare(b.deliveryDate||'');});
  $('jobTbl').innerHTML=open.length?
    open.map(function(o,i){
      var p=orderProg(o),j=jobs[o.id];
      var tags='<span class="tag s'+sIdx(o.status)+'">'+esc(o.status)+'</span>'+(o.stopped?'<span class="tag s5">موقوف</span>':'')+
        (j&&j.issued?'<span class="st done">✓ خامات مصروفة</span>':'<span class="st todo">○ لم تُصرف</span>');
      var kv=ocKV('موعد التسليم',esc(o.deliveryDate)+(isLate(o)?' • متأخر':''),isLate(o)?'late':'')+
        '<div class="wide"><span>التقدم</span><b>'+p+'%</b><span class="prog"><i style="width:'+p+'%"></i></span></div>';
      var act='<button class="btn sm gold" data-a="openjob" data-id="'+o.id+'" type="button">بطاقة التصنيع</button><button class="btn sm ghost" data-a="jobrowpdf" data-id="'+o.id+'" type="button">PDF</button>';
      return ocCard(o,'ocj'+i,tags,kv,act);
    }).join('')
    :'<div class="oc-empty">لا توجد طلبات تحت التصنيع.</div>';
  ocSlide($('jobTbl'));
  var cnt={};
  open.forEach(function(o){var j=jobs[o.id];if(!j)return;jobUnits(j).forEach(function(lj){lj.stages.forEach(function(s){if(s.state===ST[1])cnt[s.name]=(cnt[s.name]||0)+1;});});});
  bars($('jobLoad'),Object.keys(cnt).map(function(k){return [k,cnt[k]];}),function(){return 's2';});
  renderJobDetail();
}
function renderJobDetail(){
  var el=$('jobDetail'),o=orderBy(jobOrderId);
  if(!o){el.innerHTML='<div class="card"><div class="empty">اختر طلبًا من الجدول أعلاه لفتح بطاقة التصنيع.</div></div>';return;}
  var j=ensureJob(o),r=aggNeeds(o),mat;
  if(j.issued){
    mat='<div class="note ok">صُرفت الخامات بتاريخ '+esc(j.issued.date)+' وخُصمت من المخزون.</div><div class="bar"><button class="btn ghost sm" data-a="printissue" type="button">طباعة إذن الصرف</button><button class="btn red sm" data-a="unissue" type="button">إلغاء الصرف</button></div>';
  }else if(r.missing.length){
    mat='<div class="note bad">لا يمكن صرف الخامات قبل حصر المواد للأصناف: '+esc(r.missing.join('، '))+'. <button class="btn sm ghost" data-a="tobom" type="button">فتح الحصر</button></div>';
  }else{
    var sh=[];Object.keys(r.agg).forEach(function(id){var m=matBy(id);if(m&&num(m.stock)<r.agg[id]-1e-9)sh.push(matLabel(m)+' (ينقص '+fmt(r.agg[id]-num(m.stock))+' '+m.unit+')');});
    mat=sh.length?'<div class="note bad">المخزون الحالي لا يكفي لصرف الطلب: '+esc(sh.join('، '))+'. أنشئ طلب شراء واستلمه أولًا.</div>':'<div class="note ok">الخامات متوفرة في المخزون وجاهزة للصرف.</div>';
    mat+='<div class="bar"><button class="btn gold sm" data-a="issue" type="button">صرف الخامات للتصنيع</button></div>';
  }
  var h='<div class="card"><h2>بطاقة التصنيع — '+esc(o.orderNo)+' ('+esc(o.custName)+')</h2><div class="bar"><span>موعد التسليم: <b class="'+(isLate(o)?'late':'')+'">'+esc(o.deliveryDate)+'</b></span><span class="tag s'+sIdx(o.status)+'">'+esc(o.status)+'</span><b>التقدم: '+orderProg(o)+'%</b><button class="btn ghost sm" data-a="printjob" type="button">طباعة بطاقة التصنيع</button><button class="btn gold sm" data-a="jobpdf" type="button">حفظ البطاقة PDF</button></div>'+mat+ordImgStrip(o)+'</div>';
  function unitCard(u,i,pi,title){
    var id=i+'_'+pi;
    return (title?'<h4 style="margin:10px 0 4px;color:var(--navy)">'+esc(title)+' <small>('+stageProg(u)+'%)</small></h4>':'')+
      '<div class="bar" style="margin:6px 0"><label for="tp'+id+'" style="margin:0">قالب المراحل:</label><select id="tp'+id+'" data-l="'+i+'" data-p="'+pi+'" data-k="tpl" style="max-width:300px">'+tplOpts(u.tpl)+'</select></div>'+
      '<div class="scroll"><table class="rec mt"><thead><tr><th>المرحلة</th><th>الحالة</th><th>الفني / الورشة</th><th>التاريخ المخطط</th><th>تاريخ الإنجاز</th><th>ملاحظات</th></tr></thead><tbody>'+
      u.stages.map(function(s,k){
        var a='data-l="'+i+'" data-p="'+pi+'" data-s="'+k+'"';
        return '<tr><td>'+esc(s.name)+'</td><td><select '+a+' data-k="state">'+stOpts(s.state)+'</select></td>'+
          '<td><input '+a+' data-k="owner" value="'+esc(s.owner)+'"></td>'+
          '<td><input type="date" '+a+' data-k="plan" value="'+esc(s.plan)+'"></td>'+
          '<td class="num">'+esc(s.done)+'</td>'+
          '<td><input '+a+' data-k="note" value="'+esc(s.note)+'"></td></tr>';
      }).join('')+'</tbody></table></div>'+
      '<div class="bar" style="margin-top:8px"><input id="addst'+id+'" placeholder="اسم مرحلة إضافية" style="max-width:260px"><button class="btn sm ghost" data-a="addstage" data-l="'+i+'" data-p="'+pi+'" type="button">+ إضافة مرحلة</button></div>';
  }
  (o.lines||[]).forEach(function(l,i){
    if(num(l.qty)<=0)return;
    var lj=j.lines[i],p=lineProg(lj);
    h+='<div class="card jl"><h3>'+(l.img?'<img class="thumb" src="'+l.img+'" alt="" style="display:inline-block;vertical-align:middle;margin-inline-end:8px">':'')+esc(l.name||l.code)+' — الكمية '+esc(l.qty)+' ('+p+'%)</h3><span class="prog"><i style="width:'+p+'%"></i></span>';
    if(lj.pj){
      (l.parts||[]).forEach(function(pt,pi){
        var det=[pt.size,pt.color,(num(pt.qty)||1)!==1?'×'+pt.qty+' للطقم':''].filter(Boolean).join(' — ');
        if(pt.svc){h+='<div class="note ok">خدمة: '+esc(pt.name)+' — لا تحتاج تصنيعًا</div>';return;}
        h+=unitCard(lj.pj[pi],i,pi,pt.name+(det?' — '+det:''));
      });
    }else h+=unitCard(lj,i,'','');
    h+='</div>';
  });
  el.innerHTML=h;
}
function stageTbl(u){
  return '<table><thead><tr><th>المرحلة</th><th>الفني / الورشة</th><th>مخطط</th><th>الحالة</th><th>تاريخ الإنجاز</th><th>توقيع</th></tr></thead><tbody>'+
    u.stages.filter(function(s){return s.state!==ST[3];}).map(function(s){return '<tr><td>'+esc(s.name)+'</td><td>'+esc(s.owner)+'</td><td>'+esc(s.plan)+'</td><td>'+esc(s.state)+'</td><td>'+esc(s.done)+'</td><td></td></tr>';}).join('')+'</tbody></table>';
}
function jobCardHtml(o){
  var j=ensureJob(o),h='<h2>بطاقة تصنيع</h2>'+kv([['رقم الطلب',o.orderNo,'العميل',o.custName,'موعد التسليم',o.deliveryDate],['الفرع',o.branch,'الأولوية',o.priority,'التقدم',orderProg(o)+'%']]);
  (o.lines||[]).forEach(function(l,i){
    if(num(l.qty)<=0)return;
    h+='<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:4px">'+pImg(lineImg(l),'width:90px;height:90px;flex:none')+'<div style="flex:1;min-width:0"><table class="kv"><tr><td>الصنف</td><td>'+esc(l.name||l.code)+'</td><td>الكمية</td><td>'+esc(l.qty)+'</td><td>المقاس / اللون</td><td>'+esc(l.size)+' / '+esc(l.color)+'</td></tr><tr><td>المواصفات</td><td colspan="5">'+esc(l.spec)+'</td></tr></table></div></div>';
    var lj=j.lines[i];
    if(lj.pj){
      h+=partsTable(l);
      (l.parts||[]).forEach(function(pt,pi){
        if(pt.svc)return;
        h+='<p style="margin:8px 0 2px"><b>'+esc(pt.name)+'</b> — '+esc(pt.size)+' '+esc(pt.color)+' — الكمية '+esc(num(l.qty)*(num(pt.qty)||1))+'</p>'+stageTbl(lj.pj[pi]);
      });
    }else h+=stageTbl(lj);
  });
  h+=ordImgsHtml(o);
  if(o.notes)h+=kv([['ملاحظات التصنيع',o.notes]]);
  return h+sigs(['مدير الإنتاج','مشرف الورشة','مراقب الجودة','أمين المخزن']);
}
function printJob(o){openSheet(jobCardHtml(o));}
/* طباعة / حفظ كملف PDF: تفتح نافذة الطباعة باسم ملف جاهز، اختر منها «حفظ كملف PDF» */
function printPdf(html,fname,landscape){
  openSheet((landscape?'<style>@page{size:A4 landscape;margin:10mm}</style>':'')+html);
  var old=document.title;document.title=fname;
  window.addEventListener('afterprint',function r(){document.title=old;window.removeEventListener('afterprint',r);});
  printWhenReady();
}
function jobsPdf(list){
  if(!list.length){toast('لا توجد بطاقات تصنيع لطباعتها.');return;}
  var html=list.map(function(o,i){return '<div'+(i?' style="page-break-before:always"':'')+'>'+jobCardHtml(o)+'</div>';}).join('');
  printPdf(html,list.length===1?'بطاقة-تصنيع-'+list[0].orderNo:'بطاقات-التصنيع-'+today());
}
/* طباعة أي قسم: تُنسخ محتويات القسم الظاهرة إلى ورقة الطباعة بعد تحويل الحقول إلى نص */
function viewSheetHtml(v){
  var live=$('v-'+v);if(!live)return '';
  var cl=live.cloneNode(true),lo=live.querySelectorAll('*'),co=cl.querySelectorAll('*'),rm=[],rp=[];
  for(var i=0;i<lo.length;i++){
    var a=lo[i],c=co[i],tg=a.tagName;
    if(!c)continue;
    if(a.closest('.viewprint')||tg==='SCRIPT'||tg==='STYLE'||tg==='DATALIST'||tg==='TEMPLATE'||a.hidden){rm.push(c);continue;}
    if(a.offsetParent===null&&getComputedStyle(a).position!=='fixed'){rm.push(c);continue;}
    var n=null;
    if(tg==='BUTTON'){
      if(a.classList.contains('hcard')){n=document.createElement('div');n.className=a.className;n.innerHTML=c.innerHTML;rp.push([c,n]);}
      else rm.push(c);
    }else if(tg==='INPUT'){
      var ty=(a.type||'').toLowerCase();
      if(ty==='file'||ty==='hidden'||ty==='button'||ty==='submit'){rm.push(c);continue;}
      n=document.createElement('span');n.className='vtxt';
      if(ty==='checkbox'||ty==='radio')n.textContent=a.checked?'☑':'☐';
      else if(ty==='color'){n.className='vsw';n.style.background=a.value;}
      else n.textContent=a.value||'';
      rp.push([c,n]);
    }else if(tg==='SELECT'){
      n=document.createElement('span');n.className='vtxt';
      n.textContent=a.selectedIndex>-1?a.options[a.selectedIndex].text:'';rp.push([c,n]);
    }else if(tg==='TEXTAREA'){
      n=document.createElement('span');n.className='vtxt';n.textContent=a.value||'';rp.push([c,n]);
    }else if(tg==='CANVAS'){
      try{n=document.createElement('img');n.src=a.toDataURL('image/png');rp.push([c,n]);}catch(e){rm.push(c);}
    }
  }
  rp.forEach(function(x){if(x[0].parentNode)x[0].parentNode.replaceChild(x[1],x[0]);});
  rm.forEach(function(x){if(x.parentNode)x.parentNode.removeChild(x);});
  return '<h2>'+esc(VIEW_NAMES[v]||v)+'</h2><table class="kv"><tr><td>تاريخ الطباعة</td><td>'+esc(today())+'</td></tr></table>'+cl.innerHTML;
}
function printView(v){
  var h=viewSheetHtml(v);if(!h){toast('لا يوجد ما يمكن طباعته في هذا القسم.');return;}
  printPdf(h,'قسم-'+(VIEW_NAMES[v]||v)+'-'+today(),v==='mats'||v==='cycle');
}
function addViewPrintButtons(){
  ['home','dash','form','cat','cycle','mats'].forEach(function(v){
    var sec=$('v-'+v);if(!sec||sec.querySelector('.viewprint'))return;
    var d=document.createElement('div');d.className='viewprint';
    d.innerHTML='<button class="btn ghost sm" type="button" data-pv="'+v+'">🖨 طباعة هذا القسم</button>';
    if(v==='home')sec.appendChild(d);else sec.insertBefore(d,sec.firstChild);
  });
  document.addEventListener('click',function(e){var b=e.target.closest('button[data-pv]');if(b)printView(b.dataset.pv);});
}
function openJobOrders(){
  return orders.filter(function(o){return [STATUS[0],STATUS[1],STATUS[2],STATUS[3]].indexOf(o.status)>-1;})
    .sort(function(a,b){return (a.deliveryDate||'').localeCompare(b.deliveryDate||'');});
}
function printIssue(o){
  var j=jobs[o.id];if(!j||!j.issued)return;
  openSheet('<h2>إذن صرف خامات للتصنيع</h2>'+kv([['رقم الطلب',o.orderNo,'العميل',o.custName,'تاريخ الصرف',j.issued.date]])+
    '<table><thead><tr><th>م</th><th>الكود</th><th>الخامة</th><th>الصورة</th><th>الوحدة</th><th>الكمية المصروفة</th></tr></thead><tbody>'+
    j.issued.items.map(function(it,i){var m=matBy(it.mat)||{};return '<tr><td>'+(i+1)+'</td><td>'+esc(m.code)+'</td><td>'+esc(matLabel(m))+'</td><td>'+pImg(m.img)+'</td><td>'+esc(m.unit)+'</td><td>'+fmt(it.qty)+'</td></tr>';}).join('')+'</tbody></table>'+
    sigs(['أمين المخزن','مدير الإنتاج','مستلم الورشة','المحاسب']));
}

/* ---------- aggregate render / sample ---------- */
function prodKpis(){
  var M=mrp(true),sh=M.list.filter(function(x){return x.short>0;}).length;
  var op=prs.filter(function(p){return PR_OPEN.indexOf(p.status)>-1;}).length;
  return '<div class="kpi r"><b>'+sh+'</b><span>خامات بها عجز عن الطلبات المفتوحة</span></div><div class="kpi g"><b>'+op+'</b><span>طلبات شراء مفتوحة</span></div>';
}
function renderTpls(){
  var cur=$('tplSel').value,names=Object.keys(tpls);
  if(names.indexOf(cur)<0)cur=names[0]||'';
  $('tplSel').innerHTML=names.map(function(k){return '<option>'+esc(k)+'</option>';}).join('');
  $('tplSel').value=cur;
  $('tplTxt').value=cur?tpls[cur].join('\n'):'';
}
function renderProd(){renderPrOrd();renderCycle();renderMrp();renderPrList();renderJobs();renderProdLists();renderSecTrack();obSync();supList();
  if(curView==='scope')renderScope();
  if(curView==='cost')renderCost();
  if(curView==='xfer')renderXfer();}
function renderXfer(){renderDepts();renderXfList();renderXfLoc();renderXfPieces();renderXfEd();}
function sampleProd(){
  if(materials.length)return;
  [['M01','لوح MDF 18مم','لوح',40,10,110,'مورد الأخشاب',5],['M02','قشرة جوز','متر مربع',5,2,65,'مورد الأخشاب',7],['M03','رنج لاكيه','لتر',8,3,48,'مورد الدهانات',4],
   ['M04','جلد طبيعي','متر',4,2,150,'مورد الجلود والأقمشة',10],['M05','إسفنج تنجيد','متر',10,3,40,'مورد الجلود والأقمشة',6],['M06','قماش مقاوم للبقع','متر',12,3,55,'مورد الجلود والأقمشة',10],
   ['M07','مسامير ومفصلات','طقم',100,20,6,'مورد الإكسسوارات',3],['M08','رخام تجاري','متر مربع',0.5,0,380,'مورد الرخام',12],['M09','مواسير حديد','متر',30,5,22,'مورد الحديد',5],
   ['M10','خشب صلب (زان)','متر مكعب',0.5,0,2800,'مورد الأخشاب',7],
   ['M11','رنج لاكيه','لتر',5,2,50,'مورد الدهانات',4],['M12','أساس','لتر',6,2,35,'مورد الدهانات',4],['M13','معجون خشب','كيلو',10,3,25,'مورد الدهانات',4],['M14','غراء أبيض','لتر',12,4,30,'مورد الدهانات',4],
   ['M15','مهزر','قطعة',200,50,3,'مورد الإكسسوارات',3],['M16','مهزر','قطعة',200,50,3.5,'مورد الإكسسوارات',3]
  ].forEach(function(r){var x=SAMPLE_X[r[0]]||[];materials.push({id:uid(),code:r[0],name:r[1],unit:r[2],stock:r[3],min:r[4],price:r[5],supplier:r[6],lead:r[7],type:({M01:'أخشاب',M02:'أخشاب',M10:'أخشاب',M08:'أخشاب',M09:'إكسسوارات',M03:'دهان',M07:'إكسسوارات',M04:'تنجيد',M05:'تنجيد',M06:'تنجيد',M11:'دهان',M12:'دهان',M13:'دهان',M14:'دهان',M15:'إكسسوارات',M16:'إكسسوارات'})[r[0]]||'أخشاب',sub:x[0]||'',color:x[1]||'',kind:x[2]||''});});
  function id(c){return materials.find(function(m){return m.code===c;}).id;}
  [['DS-110','مكتب مدير خشب زان',[['M01',6,5],['M02',3,10],['M03',2,5],['M07',2,0]]],
   ['CH-220','كرسي مدير جلد',[['M01',1,5],['M04',2.5,10],['M05',1.5,0],['M07',1,0],['M03',0.3,5]]],
   ['SF-300','كنبة ثلاثية قماش',[['M10',0.08,8],['M05',6,0],['M06',9,10],['M07',2,0]]],
   ['TB-310','طاولة وسط',[['M08',0.6,10],['M09',4,0],['M07',1,0]]],
   ['TB-401','طاولة مطعم 4 أشخاص',[['M10',0.05,8],['M03',0.5,0],['M07',1,0]]]
  ].forEach(function(b){boms.push({id:uid(),code:b[0],name:b[1],tpl:'',comps:b[2].map(function(c){return {mat:id(c[0]),qty:c[1],waste:c[2],note:''};})});});
}
function exportAll(){return JSON.stringify({v:3,orders:orders,materials:materials,boms:boms,prs:prs,jobs:jobs,cfg:cfg,tpls:tpls,scopes:scopes,costs:costs,depts:depts,xfers:xfers,catalog:catalog,catSecs:catSecs,catSubs:catSubs,gallery:gallery});}
function importAll(d){
  var added={o:0,m:0,b:0,p:0};
  var src=Array.isArray(d)?{orders:d}:d;
  function addTo(arr,items,key){var seen={};arr.forEach(function(x){seen[x[key]]=1;});var n=0;(items||[]).forEach(function(x){if(x&&x[key]&&!seen[x[key]]){arr.push(x);seen[x[key]]=1;n++;}});return n;}
  added.o=addTo(orders,src.orders,'id');added.m=addTo(materials,src.materials,'id');added.b=addTo(boms,src.boms,'id');added.p=addTo(prs,src.prs,'id');
  if(src.jobs)Object.keys(src.jobs).forEach(function(k){if(!jobs[k])jobs[k]=src.jobs[k];});
  if(src.scopes)Object.keys(src.scopes).forEach(function(k){if(!scopes[k])scopes[k]=src.scopes[k];});
  if(src.costs)Object.keys(src.costs).forEach(function(k){if(!costs[k])costs[k]=src.costs[k];});
  if(Array.isArray(src.catSecs)){var sids={};catSecs.forEach(function(x){sids[x.id]=1;});src.catSecs.forEach(function(x){if(x&&x.id&&x.name&&!sids[x.id]){catSecs.push(x);sids[x.id]=1;}});catSync();}
  if(Array.isArray(src.catSubs)){var ubs={};catSubs.forEach(function(x){ubs[x.id]=1;});src.catSubs.forEach(function(x){if(x&&x.id&&x.name&&!ubs[x.id]){catSubs.push(x);ubs[x.id]=1;}});catSync();}
  if(Array.isArray(src.gallery)){var gids={};gallery.forEach(function(x){gids[x.id]=1;});src.gallery.forEach(function(x){if(x&&x.id&&x.u&&!gids[x.id]){gallery.push(x);gids[x.id]=1;}});}
  if(Array.isArray(src.catalog)){var cids={};catalog.forEach(function(x){cids[x.id]=1;});src.catalog.forEach(function(x){if(x&&x.id&&!cids[x.id]){catalog.push(x);cids[x.id]=1;}});}
  var dmap={};
  (src.depts||[]).forEach(function(d){
    var ex=depts.find(function(x){return x.id===d.id;})||depts.find(function(x){return lkey(x.name)===lkey(d.name);});
    if(ex)dmap[d.id]=ex.id;else{depts.push(d);dmap[d.id]=d.id;}
  });
  (src.xfers||[]).forEach(function(x){
    if(xfers.some(function(y){return y.id===x.id;}))return;
    x=JSON.parse(JSON.stringify(x));
    if(dmap[x.from])x.from=dmap[x.from];
    if(dmap[x.to])x.to=dmap[x.to];
    xfers.push(x);
  });
  if(src.cfg&&Array.isArray(src.cfg.matSecs)){var sn={};matSecs().forEach(function(x){sn[lkey(x.name)]=1;});src.cfg.matSecs.forEach(function(x){if(x&&x.name&&!sn[lkey(x.name)]){cfg.matSecs.push(x);sn[lkey(x.name)]=1;}});}
  if(src.cfg&&Array.isArray(src.cfg.matSubs)){
    var secMap={};(src.cfg.matSecs||[]).forEach(function(x){var l=matSecs().find(function(y){return lkey(y.name)===lkey(x.name);});if(l)secMap[x.id]=l.id;});
    var subMap={};
    src.cfg.matSubs.forEach(function(x){
      if(!x||!x.id||!x.name)return;
      var sid=secMap[x.sec]||x.sec;if(!matSecs().some(function(y){return y.id===sid;}))return;
      var ex=matSubs().find(function(y){return y.sec===sid&&lkey(y.name)===lkey(x.name);});
      if(ex){subMap[x.id]=ex.id;}else{var n=JSON.parse(JSON.stringify(x));n.sec=sid;matSubs().push(n);subMap[x.id]=n.id;}
    });
    materials.forEach(function(m){if(m.sub&&subMap[m.sub])m.sub=subMap[m.sub];});
  }
  if(src.cfg&&orders.length&&added.o)cfg.mfgDays=src.cfg.mfgDays==null?cfg.mfgDays:src.cfg.mfgDays;
  if(src.tpls&&typeof src.tpls==='object'&&Object.keys(src.tpls).length)tpls=src.tpls;
  ensureNewTpls();
  $('mfgDays').value=cfg.mfgDays;
  return added;
}
function initProd(){
  $('cycHide').onchange=renderCycle;
  $('cycTbl').addEventListener('click',function(e){var b=e.target.closest('button[data-a=go]');if(b)goTo(b.dataset.to,b.dataset.id);});
  /* materials */
  $('addMat').onclick=function(){
    materials.push({id:uid(),code:'M'+('00'+(materials.length+1)).slice(-2),name:'',unit:'',stock:0,min:0,price:0,supplier:'',lead:5,type:(matSel&&matSel!==MT_NONE)?matSel:MTnames()[0],sub:(matSel&&matSel!==MT_NONE&&matSub&&matSub!=='__none')?matSub:'',color:'',kind:''});
    renderMats();var r=$('matBody').lastElementChild;if(r)r.querySelector('[data-k=name]').focus();
  };
  $('matBody').addEventListener('input',function(e){
    var t=e.target,k=t.dataset.k;if(!k)return;
    var m=materials[+t.dataset.i];if(!m)return;
    m[k]=t.value;
    if(k==='type'){m.sub='';var y0=window.scrollY;renderMats();window.scrollTo(0,y0);schedSave();}
    else if(k==='sub'){var y1=window.scrollY;renderMats();window.scrollTo(0,y1);schedSave();}
    else if(k==='color'||k==='hex'){
      if(k==='color'&&nameHex(m.color))m.hex='';
      var tr=t.closest('tr'),sw=tr?tr.querySelector('.csw'):null;
      if(sw){var h=colorHex(m);sw.style.background=h||'transparent';sw.classList.toggle('empty',!h);var ci=sw.querySelector('input');if(ci&&h)ci.value=h;}
    }
  });
  $('matBody').addEventListener('change',function(e){var k=e.target.dataset.k;if(k==='color'||k==='kind'||k==='hex'){renderSubSlider();renderMatFilters();}});
  $('matBody').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a=delmat]');if(!b)return;
    var m=materials[+b.dataset.i];
    if(usedMat(m.id)){toast('الخامة مستخدمة في حصر أو طلب شراء أو إذن صرف، ولا يمكن حذفها');return;}
    armDel(b,function(){materials.splice(+b.dataset.i,1);renderMats();refresh();});
  });
  /* BOM */
  $('bomPick').onchange=function(){var v=$('bomPick').value;bomSecSel='';if(v!=='')openBom(prodList[+v]);};
  $('bomNew').onclick=function(){if(!materials.length){toast('أضف الخامات أولًا في دليل الخامات');return;}bomSecSel='';bomDraft=newBom('','');renderBomEd();};
  $('bomCode').oninput=function(){if(bomDraft)bomDraft.code=this.value;};
  $('bomName').oninput=function(){if(bomDraft)bomDraft.name=this.value;};
  $('bomTpl').onchange=function(){if(bomDraft)bomDraft.tpl=this.value;};
  $('bomAddComp').onclick=function(){if(bomDraft){bomDraft.comps.push({mat:'',qty:'',waste:5,note:'',sec:bomSecSel});renderBomEd();}};
  $('bomSecTabs').addEventListener('click',function(e){var b=e.target.closest('button[data-sec]');if(!b||!bomDraft)return;bomSecSel=b.dataset.sec;ensureSecRow(bomSecSel);renderBomEd();});
  $('bomBody').addEventListener('change',function(e){var t=e.target;if(t.dataset.k==='sec'&&bomDraft){var v=t.value;renderBomEd();toast('نُقلت المادة إلى قسم '+secDisp(v));}});
  /* panel calculator */
  function pcUp(){renderPcResult();schedSave();}
  var PCMAP={pcTh:'th',pcKerf:'kerf',pcTrim:'trim',pcUnits:'units',pcReserve:'reserve'};
  Object.keys(PCMAP).forEach(function(id){$(id).oninput=function(){pcCfg()[PCMAP[id]]=this.value;pcUp();};});
  $('pcPreset').onchange=function(){var c=pcCfg(),v=this.value,p=PC_PRESETS.filter(function(x){return x[0]===v;})[0];c.preset=v;if(p&&p[2]){c.L=p[2];c.W=p[3];$('pcL').value=c.L;$('pcW').value=c.W;}pcUp();};
  function pcDims(){var c=pcCfg();c.L=$('pcL').value;c.W=$('pcW').value;var k=PC_PRESETS.filter(function(x){return x[2]&&x[2]===num(c.L)&&x[3]===num(c.W);})[0];c.preset=k?k[0]:'custom';$('pcPreset').value=c.preset;pcUp();}
  $('pcL').oninput=pcDims;$('pcW').oninput=pcDims;
  $('pcMat').onchange=function(){pcCfg().mat=this.value;pcUp();};
  function pcRow(e){var t=e.target,k=t.dataset.k;if(!k)return;var p=pcCfg().pieces[+t.dataset.i];if(!p)return;p[k]=(t.type==='checkbox')?t.checked:t.value;pcUp();}
  $('pcBody').addEventListener('input',pcRow);
  $('pcBody').addEventListener('change',function(e){if(e.target.type==='checkbox')pcRow(e);});
  $('pcBody').addEventListener('click',function(e){var b=e.target.closest('button[data-a=pcdel]');if(!b)return;var c=pcCfg();if(c.pieces.length>1){c.pieces.splice(+b.dataset.i,1);renderPcInputs();pcUp();}});
  $('pcAdd').onclick=function(){pcCfg().pieces.push({n:'',l:'',w:'',q:1,lock:false});renderPcInputs();pcUp();var r=$('pcBody').querySelectorAll('tr');var f=r[r.length-1].querySelector('input');if(f)f.focus();};
  $('pcClear').onclick=function(){armDel(this,function(){pcCfg().pieces=[{n:'',l:'',w:'',q:1,lock:false}];renderPanelCalc();schedSave();});};
  $('pcPrint').onclick=pcPrintSheet;$('pcToBom').onclick=pcToBom;
  $('trkOrder').onchange=function(){trkOrderId=this.value;renderSecTrack();};
  $('trkTbl').addEventListener('click',function(e){var b=e.target.closest('button[data-a]');if(!b)return;var o=orderBy(trkOrderId);if(!o)return;if(b.dataset.a==='trkprint')trkSecPrint(o,b.dataset.sec);else if(b.dataset.a==='trkopen')secOpenBom(o,b.dataset.sec);});
  $('bomSave').onclick=saveBom;obInit();
  $('bomCancel').onclick=function(){bomDraft=null;renderBomEd();};
  $('bomCopyBtn').onclick=function(){
    var v=$('bomCopy').value;if(v===''||!bomDraft)return;
    bomDraft.comps=JSON.parse(JSON.stringify(boms[+v].comps));renderBomEd();toast('تم نسخ المكونات، عدّل الكميات ثم احفظ');
  };
  $('bomBody').addEventListener('input',function(e){
    var t=e.target;if(!t.dataset.k||!bomDraft)return;
    var c=bomDraft.comps[+t.dataset.i];c[t.dataset.k]=t.value;
    var tr=t.closest('tr');tr.querySelector('.tot').textContent=fmt(num(c.qty)*(1+num(c.waste)/100));
    if(t.dataset.k==='mat'){var m=matBy(t.value);tr.querySelector('.unitc').textContent=m?m.unit:'';}
  });
  $('bomBody').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a=delcomp]');if(!b||!bomDraft)return;
    if(bomDraft.comps.length>1){bomDraft.comps.splice(+b.dataset.i,1);renderBomEd();}
  });
  
  /* MRP */
  $('mfgDays').oninput=function(){cfg.mfgDays=num(this.value);renderMrp();};
  $('mrpApproved').onchange=function(){mrpApprovedOnly=this.checked;renderMrp();};
  $('mrpOrders').addEventListener('change',function(e){var t=e.target;if(!t.dataset.id)return;if(t.checked)delete mrpExcl[t.dataset.id];else mrpExcl[t.dataset.id]=1;renderMrp();});
  $('mrpMakePR').onclick=createPRs;$('mrpPrint').onclick=mrpPrint;$('stockPrint').onclick=stockPrint;$('mrpCsv').onclick=mrpCsv;
  $('mrpWarn').addEventListener('click',function(e){if(e.target.closest('[data-a=tobom]'))show('mats');});
  /* PR */
  $('prNew').onclick=function(){openPr(null);};
  $('prAddLine').onclick=function(){if(prDraft){prDraft.lines.push({mat:'',qty:'',price:'',note:''});renderPrEd();}};
  $('prSave').onclick=savePr;
  $('prCancel').onclick=function(){prDraft=null;renderPrEd();};
  ['prDate:date','prReq:req','prSup:supplier','prNotes:notes'].forEach(function(s){var p=s.split(':');$(p[0]).oninput=function(){if(prDraft)prDraft[p[1]]=this.value;};});
  $('prBody').addEventListener('input',function(e){
    var t=e.target;if(!t.dataset.k||!prDraft)return;
    var l=prDraft.lines[+t.dataset.i];l[t.dataset.k]=t.value;
    if(t.dataset.k==='mat'){var mm=matBy(t.value);if(mm&&mm.img&&!l.img){l.img=mm.img;if(!num(l.price))l.price=mm.price;renderPrEd();return;}}
    var tr=t.closest('tr');
    if(t.dataset.k==='mat'){var m=matBy(t.value);tr.querySelector('.unitc').textContent=m?m.unit:'';if(m&&!num(l.price)){l.price=m.price;tr.querySelector('[data-k=price]').value=m.price;}}
    tr.querySelector('.tot').textContent=fmt(num(l.qty)*num(l.price));
    $('prTotal').textContent=fmt(prTotal(prDraft));
  });
  $('prBody').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a=prdelline]');if(!b||!prDraft)return;
    if(prDraft.lines.length>1){prDraft.lines.splice(+b.dataset.i,1);renderPrEd();}
  });
  $('prTbl').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b)return;
    var p=prs.find(function(x){return x.id===b.dataset.id;});if(!p)return;
    if(b.dataset.a==='prprint')printPR(p);
    if(b.dataset.a==='predit')openPr(p);
    if(b.dataset.a==='prdel'){
      if(p.applied){toast('طلب مستلم لا يُحذف. غيّر حالته أولًا.');return;}
      armDel(b,function(){prs=prs.filter(function(x){return x.id!==p.id;});refresh();toast('تم حذف '+p.no);});
    }
  });
  $('prTbl').addEventListener('change',function(e){
    var t=e.target;if(t.dataset.a!=='prstatus')return;
    var p=prs.find(function(x){return x.id===t.dataset.id;});if(!p)return;
    setPrStatus(p,t.value);refresh();
  });
  /* jobs */
  $('jobAllPdf').onclick=function(){jobsPdf(openJobOrders());};
  $('jobTbl').addEventListener('click',function(e){
    var pb=e.target.closest('button[data-a=jobrowpdf]');
    if(pb){var po=orderBy(pb.dataset.id);if(po)jobsPdf([po]);return;}
    var b=e.target.closest('button[data-a=openjob]');if(!b)return;jobOrderId=b.dataset.id;renderJobDetail();$('jobDetail').scrollIntoView({block:'start'});});
  $('jobDetail').addEventListener('change',function(e){
    var t=e.target;
    if(t.dataset.k==='tpl'){var o2=orderBy(jobOrderId),j2=ensureJob(o2);applyTpl(unitOf(j2,t.dataset.l,t.dataset.p),t.value);syncStatus(o2);refresh();toast('تم تطبيق قالب المراحل');return;}
    if(t.dataset.k!=='state')return;
    var o=orderBy(jobOrderId),j=ensureJob(o),s=unitOf(j,t.dataset.l,t.dataset.p).stages[+t.dataset.s];
    s.state=t.value;
    if(t.value===ST[2]){if(!s.done)s.done=today();}else s.done='';
    if((t.value===ST[1]||t.value===ST[2])&&!j.issued)toast('تنبيه: لم تُصرف خامات هذا الطلب من المخزون بعد');
    syncStatus(o);refresh();
  });
  $('jobDetail').addEventListener('input',function(e){
    var t=e.target;if(!t.dataset.k||t.dataset.k==='state'||t.dataset.k==='tpl')return;
    var o=orderBy(jobOrderId),j=ensureJob(o);
    unitOf(j,t.dataset.l,t.dataset.p).stages[+t.dataset.s][t.dataset.k]=t.value;
  });
  $('jobDetail').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b)return;
    var o=orderBy(jobOrderId);if(!o)return;
    var a=b.dataset.a;
    if(a==='issue'){issueMaterials(o);refresh();}
    if(a==='unissue'){armDel(b,function(){unissue(o);refresh();});}
    if(a==='printjob')printJob(o);
    if(a==='jobpdf')jobsPdf([o]);
    if(a==='printissue')printIssue(o);
    if(a==='tobom')show('mats');
    if(a==='addstage'){
      var inp=$('addst'+b.dataset.l+'_'+(b.dataset.p||'')),v=inp.value.trim();if(!v){toast('اكتب اسم المرحلة');return;}
      unitOf(ensureJob(o),b.dataset.l,b.dataset.p).stages.push({name:v,state:ST[0],owner:'',plan:'',done:'',note:''});
      renderJobDetail();
    }
  });
  $('mfgDays').value=cfg.mfgDays;
  /* image buttons (materials / purchase request) and lightbox */
  document.addEventListener('click',function(e){
    var t=e.target;
    if(t.classList&&t.classList.contains('thumb')){$('lb').querySelector('img').src=t.src;$('lb').style.display='grid';return;}
    var b=t.closest?t.closest('button[data-a=imgpick],button[data-a=imgrm]'):null;
    if(!b||b.dataset.ctx==='line')return;
    var i=+b.dataset.i,ctx=b.dataset.ctx;
    function set(v){
      if(ctx==='mat'){materials[i].img=v;renderMats();}
      else if(ctx==='pr'&&prDraft){prDraft.lines[i].img=v;renderPrEd();}
    }
    if(b.dataset.a==='imgrm')set('');else pickImage(set);
  });
  $('lb').onclick=function(){this.style.display='none';};
  /* stage templates */
  $('tplSel').onchange=function(){$('tplTxt').value=(tpls[this.value]||[]).join('\n');};
  function tplLines(){var seen={},out=[];$('tplTxt').value.split('\n').forEach(function(x){x=x.trim();if(x&&!seen[x]){seen[x]=1;out.push(x);}});return out;}
  $('tplSave').onclick=function(){
    var n=$('tplSel').value,l=tplLines();
    if(!n)return;if(!l.length){toast('أدخل مرحلة واحدة على الأقل');return;}
    tpls[n]=l;renderTpls();toast('تم حفظ القالب، ويسري على الأصناف الجديدة');
  };
  $('tplAdd').onclick=function(){
    var n=$('tplNewName').value.trim(),l=tplLines();
    if(!n){toast('اكتب اسم القالب الجديد');return;}
    if(tpls[n]){toast('يوجد قالب بنفس الاسم');return;}
    tpls[n]=l.length?l:['مرحلة 1'];$('tplNewName').value='';$('tplSel').value=n;renderTpls();$('tplSel').value=n;$('tplTxt').value=tpls[n].join('\n');toast('تم إنشاء القالب');
  };
  $('tplDel').onclick=function(){
    var n=$('tplSel').value;
    if(n==='عام'){toast('القالب العام لا يُحذف');return;}
    armDel(this,function(){delete tpls[n];boms.forEach(function(b){if(b.tpl===n)b.tpl='';});renderTpls();toast('تم حذف القالب');});
  };
}

/* ================= أنواع الخامات ================= */
var MT_NONE='غير مصنّف';
var DEF_SECS=[{id:'s1',name:'دهان',ic:'🎨',c:'#1f7673'},{id:'s2',name:'أخشاب',ic:'🪵',c:'#8a5a35'},{id:'s3',name:'إكسسوارات',ic:'🔩',c:'#c99a3b'},{id:'s4',name:'تنجيد',ic:'🛋️',c:'#8e1c1f'}];
var SEC_PAL=['#14284b','#6a7a5b','#7a4b8c','#b5651d','#2f6f9f','#9b2c5a','#4d7c0f','#a16207'];
var SEC_ICS=['📦','🧱','🧵','🪑','🔧','🪟','🧴','⚙️'];
var matSel='',secEditId=null;
function matSecs(){if(!Array.isArray(cfg.matSecs)||!cfg.matSecs.length)cfg.matSecs=JSON.parse(JSON.stringify(DEF_SECS));return cfg.matSecs;}
function MTnames(){return matSecs().map(function(x){return x.name;});}
function matType(m){return MTnames().indexOf(m.type)>-1?m.type:MT_NONE;}
function MTopts(m){
  var cur=matType(m),L=MTnames();if(cur===MT_NONE)L=[MT_NONE].concat(L);
  return L.map(function(t){return '<option'+(cur===t?' selected':'')+'>'+esc(t)+'</option>';}).join('');
}
function renderMatSecs(){
  var secs=matSecs(),cnt={},tot=materials.length;
  materials.forEach(function(m){var k=matType(m);cnt[k]=(cnt[k]||0)+1;});
  if(matSel&&matSel!==MT_NONE&&MTnames().indexOf(matSel)<0)matSel='';
  if(matSel===MT_NONE&&!cnt[MT_NONE])matSel='';
  function card(key,ic,name,n,color,id,extra){
    return '<div class="msec'+(matSel===key?' on':'')+'" role="button" tabindex="0" data-sec="'+esc(key)+'" style="--sc:'+color+'">'+
      '<span class="msi">'+ic+'</span><b>'+esc(name)+'</b><small>'+n+' خامة'+(id&&subsOfSec(id).length?' · '+subsOfSec(id).length+' فرعي':'')+'</small>'+(extra||'')+'</div>';
  }
  var h=card('','📚','كل الأقسام',tot,'#14284b','','');
  secs.forEach(function(s){
    h+=card(s.name,s.ic||'📦',s.name,cnt[s.name]||0,s.c||'#14284b',s.id,
      '<span class="msact"><button type="button" class="msb" data-a="secren" data-id="'+s.id+'" title="تعديل الاسم" aria-label="تعديل اسم القسم">✎</button><button type="button" class="msb del" data-a="secdel" data-id="'+s.id+'" title="حذف القسم" aria-label="حذف القسم">✕</button></span>');
  });
  if(cnt[MT_NONE])h+=card(MT_NONE,'❔',MT_NONE,cnt[MT_NONE],'#7a7a7a','','');
  h+='<button type="button" class="msec add" id="secAddBtn"><span class="msi">＋</span><b>قسم جديد</b><small>أضف أي قسم مستقبلاً</small></button>';
  $('matSecs').innerHTML=h;
  var tt=$('matSelTitle');
  tt.innerHTML=matSel?('الخامات المعروضة: <b>'+esc(matSel)+'</b> — <a href="#" id="secAll">عرض كل الأقسام</a>'):'';
  tt.style.display=matSel?'block':'none';
}
function secFormOpen(id){
  secEditId=id||null;
  var s=id?matSecs().find(function(x){return x.id===id;}):null;
  $('secName').value=s?s.name:'';
  $('secOk').textContent=s?'حفظ الاسم':'حفظ القسم';
  $('secForm').style.display='flex';$('secName').focus();
}
function secFormClose(){secEditId=null;$('secForm').style.display='none';$('secName').value='';}
function secSave(){
  var n=$('secName').value.trim();
  if(!n){toast('اكتب اسم القسم');return;}
  if(n===MT_NONE){toast('هذا الاسم محجوز');return;}
  var secs=matSecs();
  if(secs.some(function(x){return lkey(x.name)===lkey(n)&&x.id!==secEditId;})){toast('يوجد قسم بهذا الاسم');return;}
  if(secEditId){
    var s=secs.find(function(x){return x.id===secEditId;});
    if(s){var old=s.name;s.name=n;materials.forEach(function(m){if(m.type===old)m.type=n;});boms.forEach(function(b){b.comps.forEach(function(c){if(c.sec===old)c.sec=n;});});if(bomSecSel===old)bomSecSel=n;if(matSel===old)matSel=n;toast('تم تعديل اسم القسم');}
  }else{
    var k=secs.length;
    secs.push({id:uid(),name:n,ic:SEC_ICS[k%SEC_ICS.length],c:SEC_PAL[k%SEC_PAL.length]});
    matSel=n;matSub='';matColor='';matKind='';toast('تمت إضافة قسم «'+n+'»');
  }
  secFormClose();renderMats();schedSave();
}
function initMatSecs(){
  $('matSecs').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');
    if(b){
      e.stopPropagation();
      var id=b.dataset.id;
      if(b.dataset.a==='secren'){secFormOpen(id);return;}
      var s=matSecs().find(function(x){return x.id===id;});if(!s)return;
      if(materials.some(function(m){return m.type===s.name;})){toast('لا يمكن حذف قسم يحتوي خامات. انقل خاماته إلى قسم آخر أولًا');return;}
      if(matSecs().length<2){toast('يجب أن يبقى قسم واحد على الأقل');return;}
      armDel(b,function(){cfg.matSecs=matSecs().filter(function(x){return x.id!==id;});cfg.matSubs=matSubs().filter(function(x){return x.sec!==id;});if(matSel===s.name){matSel='';matSub='';}renderMats();schedSave();});
      return;
    }
    if(e.target.closest('#secAddBtn')){secFormOpen(null);return;}
    var c=e.target.closest('.msec[data-sec]');
    if(c){selSec(c.dataset.sec);}
  });
  $('matSecs').addEventListener('keydown',function(e){
    if(e.key!=='Enter'&&e.key!==' ')return;
    var c=e.target.closest('.msec[data-sec]');if(c&&e.target===c){e.preventDefault();selSec(c.dataset.sec);}
  });
  $('secOk').onclick=secSave;$('secNo').onclick=secFormClose;
  $('secName').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();secSave();}else if(e.key==='Escape')secFormClose();});
  $('matSelTitle').addEventListener('click',function(e){if(e.target.id==='secAll'){e.preventDefault();selSec('');}});
  initSub3d();
}

/* ================= الأقسام الفرعية (سلايدر 3D) + اللون + نوع المادة ================= */
var matSub='',matColor='',matKind='',subEditId=null,s3List=[];
var SUB_ICS=['📦','🔹','🔸','🧩','🔧','🧴','⚙️','🪛'];
var DEF_SUBS=[
 {id:'d1',sec:'s1',name:'رنج',ic:'🖌️'},{id:'d2',sec:'s1',name:'أساس',ic:'🪣'},{id:'d3',sec:'s1',name:'معجون',ic:'🧱'},{id:'d4',sec:'s1',name:'غراء',ic:'🧴'},
 {id:'d5',sec:'s2',name:'ألواح (MDF / أبلكاش)',ic:'🟫'},{id:'d6',sec:'s2',name:'خشب صلب',ic:'🌳'},{id:'d7',sec:'s2',name:'قشرة',ic:'📜'},{id:'d8',sec:'s2',name:'رخام وأسطح',ic:'🪨'},
 {id:'d9',sec:'s3',name:'مهازر',ic:'🔩'},{id:'d10',sec:'s3',name:'مقابض',ic:'🚪'},{id:'d11',sec:'s3',name:'مجاري أدراج',ic:'🗄️'},{id:'d12',sec:'s3',name:'مسامير وبراغي',ic:'🔧'},{id:'d13',sec:'s3',name:'مواسير وهياكل حديد',ic:'🏗️'},
 {id:'d14',sec:'s4',name:'أقمشة',ic:'🧵'},{id:'d15',sec:'s4',name:'جلود',ic:'🧥'},{id:'d16',sec:'s4',name:'إسفنج',ic:'🛋️'},{id:'d17',sec:'s4',name:'خيوط ومستلزمات',ic:'🪡'}
];
var SAMPLE_X={M01:['d5','طبيعي','MDF'],M02:['d7','جوزي','خشب'],M03:['d1','أبيض','لاكيه'],M04:['d15','بني','جلد طبيعي'],M05:['d16','','إسفنج'],M06:['d14','رمادي','قماش مقاوم للبقع'],M07:['d12','','حديد'],M08:['d8','أبيض','رخام'],M09:['d13','أسود','حديد'],M10:['d6','طبيعي','خشب زان'],M11:['d1','أسود','لاكيه'],M12:['d2','أبيض','بولي يوريثان'],M13:['d3','طبيعي','معجون'],M14:['d4','أبيض','غراء PVA'],M15:['d9','أبيض','بلاستيك'],M16:['d9','أسود','حديد']};
var CLR_MAP=[['أبيض','#ffffff'],['أسود','#111111'],['رمادي','#8a8a8a'],['رمادي فاتح','#d0d0d0'],['رمادي غامق','#4a4a4a'],['بني','#6b4423'],['بيج','#d9c4a0'],['جوزي','#5c3a21'],['وينجيه','#3b2a20'],['ذهبي','#c99a3b'],['فضي','#c0c0c0'],['كروم','#b8bcc2'],['نحاسي','#b87333'],['أحمر','#c0392b'],['أزرق','#2f6f9f'],['سماوي','#6cc3e0'],['كحلي','#14284b'],['أخضر','#4d7c0f'],['أصفر','#e8c53a'],['برتقالي','#e67e22'],['وردي','#e78fb3'],['بنفسجي','#7a4b8c'],['عاجي','#f3ead3'],['كريمي','#f1e6c8'],['طبيعي','#d2a86a'],['شفاف','#e6f2f5'],['زان','#d8b98a'],['ماهوجني','#6e2c1c']];
function normAr(s){return String(s==null?'':s).replace(/[\u064B-\u0652\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').trim().toLowerCase();}
function nameHex(name){
  var n=normAr(name);if(!n)return '';
  var best='',bl=0;
  CLR_MAP.forEach(function(p){var k=normAr(p[0]);if(n.indexOf(k)>-1&&k.length>bl){best=p[1];bl=k.length;}});
  return best;
}
function colorHex(m){if(m.hex&&/^#[0-9a-f]{6}$/i.test(m.hex))return m.hex;return nameHex(m.color);}
function matLabel(m){m=m||{};return (m.name||'')+(m.color&&String(m.color).trim()?' — '+String(m.color).trim():'')+(m.kind&&String(m.kind).trim()?' ('+String(m.kind).trim()+')':'');}
function swHtml(m,i){var h=colorHex(m);return '<label class="csw'+(h?'':' empty')+'" style="background:'+(h||'transparent')+'" title="اختر لونًا مخصصًا"><input type="color" data-i="'+i+'" data-k="hex" value="'+(h||'#cccccc')+'" aria-label="لون مخصص"></label>';}
function matSubs(){
  if(!Array.isArray(cfg.matSubs)){
    var have={};matSecs().forEach(function(s){have[s.id]=1;});
    cfg.matSubs=DEF_SUBS.filter(function(x){return have[x.sec];}).map(function(x){return {id:x.id,sec:x.sec,name:x.name,ic:x.ic};});
  }
  return cfg.matSubs;
}
function secIdByName(n){var s=matSecs().find(function(x){return x.name===n;});return s?s.id:'';}
function subsOfSec(sid){return sid?matSubs().filter(function(x){return x.sec===sid;}):[];}
function subOf(m){if(!m.sub)return null;var s=matSubs().find(function(x){return x.id===m.sub;});return (s&&s.sec===secIdByName(matType(m)))?s:null;}
function curSub(){return matSub&&matSub!=='__none'?(matSubs().find(function(x){return x.id===matSub;})||null):null;}
function selSec(v){matSel=v;matSub='';matColor='';matKind='';renderMats();}
function selSub(key){matSub=key;matColor='';matKind='';layout3d();updSubUI();renderMatFilters();renderMatTable();}

function renderSubSlider(){
  var wrap=$('subWrap');
  var sid=(matSel&&matSel!==MT_NONE)?secIdByName(matSel):'';
  if(!sid){wrap.style.display='none';matSub='';s3List=[];return;}
  wrap.style.display='block';
  var sec=matSecs().find(function(x){return x.id===sid;})||{},sc=sec.c||'#8e1c1f';
  var subs=subsOfSec(sid);
  var scope=materials.filter(function(m){return matType(m)===matSel;});
  var list=[{key:'',name:'كل الأنواع',ic:'📚',items:scope}];
  subs.forEach(function(x){list.push({key:x.id,name:x.name,ic:x.ic||'📦',items:scope.filter(function(m){var o=subOf(m);return o&&o.id===x.id;})});});
  var un=scope.filter(function(m){return !subOf(m);});
  if(subs.length&&un.length)list.push({key:'__none',name:'بدون قسم فرعي',ic:'❔',items:un});
  s3List=list;
  if(!list.some(function(x){return x.key===matSub;}))matSub='';
  $('sub3dStage').innerHTML=list.map(function(it,i){
    var seen={},ns=0,dots='',kn=[],ks={};
    it.items.forEach(function(m){
      var c=lkey(m.color);if(c&&!seen[c]&&ns<6){seen[c]=1;ns++;dots+='<i title="'+esc(m.color)+'" style="background:'+(colorHex(m)||'#ddd')+'"></i>';}
      var k=lkey(m.kind);if(k&&!ks[k]&&kn.length<3){ks[k]=1;kn.push(String(m.kind).trim());}
    });
    return '<div class="s3c" data-k="'+esc(it.key)+'" data-i="'+i+'" role="button" aria-label="'+esc(it.name)+'" style="--sc:'+sc+'"><span class="s3i">'+it.ic+'</span><b>'+esc(it.name)+'</b><small>'+it.items.length+' خامة</small>'+(dots?'<span class="s3dots">'+dots+'</span>':'')+(kn.length?'<span class="s3k">'+esc(kn.join(' · '))+'</span>':'')+'</div>';
  }).join('');
  $('sub3dDots').innerHTML=list.map(function(it,i){return '<button type="button" class="s3dot" data-i="'+i+'" aria-label="'+esc(it.name)+'"></button>';}).join('');
  var h=$('subHint');
  if(!subs.length){h.style.display='block';h.textContent='لا توجد أقسام فرعية في «'+matSel+'» بعد. اضغط «＋ قسم فرعي» لإضافة أول قسم (مثال: رنج، أساس، معجون).';}
  else h.style.display='none';
  layout3d();updSubUI();
}
function updSubUI(){
  var idx=Math.max(0,s3List.findIndex(function(x){return x.key===matSub;}));
  var it=s3List[idx];
  $('subTitle').textContent='الأقسام الفرعية لقسم «'+matSel+'»'+(it&&it.key?' — '+it.name:'');
  Array.prototype.forEach.call($('sub3dDots').children,function(d,i){d.classList.toggle('on',i===idx);});
  var s=curSub();$('subRen').disabled=!s;$('subDel').disabled=!s;
}
var s3W=0;
function layout3d(){
  var el=$('sub3d'),st=$('sub3dStage');if(!el||!st||!s3List.length)return;
  var idx=Math.max(0,s3List.findIndex(function(x){return x.key===matSub;}));
  var W=el.clientWidth||620;s3W=W;
  var cw=Math.max(130,Math.min(200,W*0.44)),ch=Math.round(cw*1.05),gap=cw*0.74;
  el.style.height=(ch+46)+'px';
  var cards=st.children;
  for(var i=0;i<cards.length;i++){
    var o=i-idx,a=Math.abs(o),sg=o<0?-1:1,c=cards[i];
    var x=o===0?0:-sg*(gap*0.95+(a-1)*gap*0.55),z=-a*90,ry=o===0?0:sg*52,sc=1-Math.min(a,3)*0.06;
    c.style.width=cw+'px';c.style.height=ch+'px';
    c.style.transform='translateX(-50%) translate3d('+x+'px,0,'+z+'px) rotateY('+ry+'deg) scale('+sc+')';
    c.style.opacity=a>3?0:String(1-a*0.2);
    c.style.zIndex=String(20-a);
    c.style.pointerEvents=a>3?'none':'auto';
    c.classList.toggle('on',o===0);
    c.setAttribute('aria-current',o===0?'true':'false');
  }
}
function s3Move(d){
  if(!s3List.length)return;
  var idx=Math.max(0,s3List.findIndex(function(x){return x.key===matSub;}));
  var n=Math.max(0,Math.min(s3List.length-1,idx+d));
  if(n!==idx)selSub(s3List[n].key);
}
function renderMatFilters(){
  var box=$('matFilters');
  if(!matSel){box.innerHTML='';return;}
  var sc=matScope(),cm={},km={};
  sc.forEach(function(x){
    var c=lkey(x.m.color),k=lkey(x.m.kind);
    if(c){var o=cm[c]||(cm[c]={l:String(x.m.color).trim(),h:'',n:0});o.n++;if(!o.h)o.h=colorHex(x.m);}
    if(k){var p=km[k]||(km[k]={l:String(x.m.kind).trim(),n:0});p.n++;}
  });
  if(matColor&&!cm[matColor])matColor='';
  if(matKind&&!km[matKind])matKind='';
  function chips(map,type,cur,all,label){
    var ks=Object.keys(map);if(!ks.length)return '';
    return '<div class="mfrow"><span>'+label+'</span><button type="button" class="mchip'+(cur?'':' on')+'" data-f="'+type+'" data-v="">'+all+'</button>'+
      ks.map(function(k){var o=map[k];return '<button type="button" class="mchip'+(cur===k?' on':'')+'" data-f="'+type+'" data-v="'+esc(k)+'">'+(type==='c'?'<i style="background:'+(o.h||'transparent')+'"></i>':'')+esc(o.l)+' ('+o.n+')</button>';}).join('')+'</div>';
  }
  box.innerHTML=chips(cm,'c',matColor,'كل الألوان','اللون:')+chips(km,'k',matKind,'الكل','نوع المادة:');
}
function subFormOpen(id){
  subEditId=id||null;
  var s=id?matSubs().find(function(x){return x.id===id;}):null;
  $('subName').value=s?s.name:'';
  $('subOk').textContent=s?'حفظ الاسم':'حفظ';
  $('subForm').style.display='flex';$('subName').focus();
}
function subFormClose(){subEditId=null;$('subForm').style.display='none';$('subName').value='';}
function subSave(){
  var n=$('subName').value.trim();
  if(!n){toast('اكتب اسم القسم الفرعي');return;}
  var sid=secIdByName(matSel);if(!sid){toast('اختر قسمًا أولًا');return;}
  if(subsOfSec(sid).some(function(x){return lkey(x.name)===lkey(n)&&x.id!==subEditId;})){toast('يوجد قسم فرعي بهذا الاسم');return;}
  if(subEditId){
    var s=matSubs().find(function(x){return x.id===subEditId;});
    if(s){s.name=n;}toast('تم تعديل اسم القسم الفرعي');
  }else{
    var k=subsOfSec(sid).length,ns={id:'u'+uid(),sec:sid,name:n,ic:SUB_ICS[k%SUB_ICS.length]};
    matSubs().push(ns);matSub=ns.id;toast('تمت إضافة القسم الفرعي «'+n+'»');
  }
  subFormClose();matColor='';matKind='';renderMats();schedSave();
}
function initSub3d(){
  var el=$('sub3d'),drag=null;
  el.addEventListener('pointerdown',function(e){if(e.target.closest('.s3-nav'))return;drag={x:e.clientX,moved:false};});
  el.addEventListener('pointermove',function(e){if(drag&&Math.abs(e.clientX-drag.x)>8)drag.moved=true;});
  el.addEventListener('pointercancel',function(){drag=null;});
  el.addEventListener('pointerleave',function(){drag=null;});
  el.addEventListener('pointerup',function(e){
    if(!drag)return;
    var dx=e.clientX-drag.x,moved=drag.moved;drag=null;
    if(Math.abs(dx)>40){s3Move(dx>0?1:-1);}
    else if(!moved){var c=e.target.closest('.s3c');if(c)selSub(c.dataset.k);}
  });
  el.addEventListener('keydown',function(e){
    if(e.key==='ArrowLeft'){e.preventDefault();s3Move(1);}
    else if(e.key==='ArrowRight'){e.preventDefault();s3Move(-1);}
    else if(e.key==='Home'){e.preventDefault();s3Move(-99);}
    else if(e.key==='End'){e.preventDefault();s3Move(99);}
  });
  $('subPrev').onclick=function(){s3Move(-1);};
  $('subNext').onclick=function(){s3Move(1);};
  $('sub3dDots').addEventListener('click',function(e){var b=e.target.closest('.s3dot');if(b&&s3List[+b.dataset.i])selSub(s3List[+b.dataset.i].key);});
  $('subAdd').onclick=function(){subFormOpen(null);};
  $('subRen').onclick=function(){var s=curSub();if(!s){toast('اختر قسمًا فرعيًا لتعديله');return;}subFormOpen(s.id);};
  $('subDel').onclick=function(){
    var s=curSub();if(!s){toast('اختر قسمًا فرعيًا لحذفه');return;}
    if(materials.some(function(m){var o=subOf(m);return o&&o.id===s.id;})){toast('لا يمكن حذف قسم فرعي يحتوي خامات. انقل خاماته إلى قسم فرعي آخر أولًا');return;}
    armDel(this,function(){cfg.matSubs=matSubs().filter(function(x){return x.id!==s.id;});matSub='';renderMats();schedSave();});
  };
  $('subOk').onclick=subSave;$('subNo').onclick=subFormClose;
  $('subName').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();subSave();}else if(e.key==='Escape')subFormClose();});
  $('matFilters').addEventListener('click',function(e){
    var b=e.target.closest('.mchip');if(!b)return;
    if(b.dataset.f==='c')matColor=b.dataset.v;else matKind=b.dataset.v;
    renderMatFilters();renderMatTable();
  });
  if(window.ResizeObserver){new ResizeObserver(function(){var w=el.clientWidth;if(w&&w!==s3W)layout3d();}).observe(el);}
  window.addEventListener('resize',layout3d);
}

/* ================= مراجعة نطاق العمل مع العميل ================= */
var SCS=['لم تُراجع','قيد المراجعة مع العميل','معتمد من العميل','مطلوب تعديل'];
var scopes={},scOrderId=null,scSel={};
var SCI={
 wardrobe:'<rect x="8" y="5" width="32" height="38" rx="3"/><path d="M24 5v38M20 22v4M28 22v4"/>',
 bed:'<path d="M5 38V12M43 38V26M5 30h38M5 26h36a2 2 0 0 1 2 2"/><rect x="10" y="17" width="12" height="9" rx="3"/><path d="M26 26v-5a3 3 0 0 1 3-3h9a5 5 0 0 1 5 5v3"/>',
 bedroom:'<path d="M4 38V14M30 38V26M4 31h26M4 27h26"/><rect x="8" y="19" width="9" height="8" rx="3"/><rect x="33" y="8" width="11" height="30" rx="2"/><path d="M38.5 8v30"/>',
 kitchen:'<rect x="6" y="6" width="36" height="9" rx="2"/><rect x="6" y="15" width="36" height="27" rx="2"/><path d="M24 15v27M6 28h36"/>',
 table:'<path d="M6 12h36M10 12v26M38 12v26M10 22h28"/>',
 tv:'<rect x="6" y="8" width="36" height="22" rx="3"/><path d="M16 38h16M24 30v8"/>',
 desk:'<path d="M5 14h38M8 14v26M40 14v26M8 22h18v18"/><path d="M30 24h6M30 30h6"/>',
 sofa:'<path d="M9 22v-6a5 5 0 0 1 5-5h20a5 5 0 0 1 5 5v6"/><path d="M5 26a4 4 0 0 1 8 0v4h22v-4a4 4 0 0 1 8 0v10H5z"/><path d="M11 40v3M37 40v3"/>',
 chair:'<path d="M14 6h20v18H14zM12 24h24v6H12zM14 30v13M34 30v13"/>',
 dresser:'<circle cx="24" cy="11" r="6"/><path d="M10 40V28a14 14 0 0 1 28 0v12M10 32h28M10 40h28"/>',
 night:'<rect x="9" y="8" width="30" height="32" rx="3"/><path d="M9 24h30M20 16h8M20 32h8"/>',
 shelf:'<path d="M8 6v36M40 6v36M8 14h32M8 24h32M8 34h32M8 6h32M8 42h32"/>',
 box:'<path d="M24 6l16 8v20l-16 8-16-8V14z"/><path d="M8 14l16 8 16-8M24 22v20"/>'
};
function scIcon(t,name){
  var k='box';
  if(/مطبخ|مطابخ/.test(name||''))k='kitchen';
  else if(t===FT[1])k='wardrobe';else if(t===FT[2])k='bed';else if(t===FT[3])k='bedroom';
  else if(t===FT[4])k='tv';else if(t===FT[5])k='table';else if(t===FT[6])k='desk';
  else if(t===FT[7])k='sofa';else if(t===FT[8])k='chair';else if(t===FT[9])k='dresser';
  else if(t===FT[10])k='night';else if(t===FT[11])k='shelf';
  return '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">'+SCI[k]+'</svg>';
}
function getScope(id){return scopes[id]||(scopes[id]={status:SCS[0],date:'',by:'',note:'',items:{}});}
function scKey(u){return u.li+'_'+(u.pi<0?'':u.pi);}
function scItem(sc,u){var k=scKey(u);return sc.items[k]||(sc.items[k]={l:'',w:'',h:'',note:''});}
function parseSize(s){
  var t=String(s||'').replace(/[٠-٩]/g,function(d){return '٠١٢٣٤٥٦٧٨٩'.indexOf(d);});
  var m=t.match(/\d+(?:[.,]\d+)?/g);
  if(!m||m.length<3)return null;
  return m.slice(0,3).map(function(x){return parseFloat(x.replace(',','.'));});
}
function isoSvg(L,W,H){
  L=num(L);W=num(W);H=num(H);
  if(L<=0||W<=0||H<=0)return '<div class="empty" style="padding:24px 10px">أدخل الطول والعرض والارتفاع لعرض المجسم ثلاثي الأبعاد</div>';
  var s=140/Math.max(L,W,H),c=0.866;
  function P(x,y,z){return [(x-y)*c*s,(x+y)*0.5*s-z*s];}
  var cs=[[0,0,0],[L,0,0],[0,W,0],[L,W,0],[0,0,H],[L,0,H],[0,W,H],[L,W,H]].map(function(a){return P(a[0],a[1],a[2]);});
  var xs=cs.map(function(p){return p[0];}),ys=cs.map(function(p){return p[1];});
  var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);
  var ox=62-minX,oy=26-minY,w=Math.round(maxX-minX+124),h=Math.round(maxY-minY+66);
  function Q(x,y,z){var p=P(x,y,z);return [p[0]+ox,p[1]+oy];}
  function poly(a,fill){return '<polygon points="'+a.map(function(p){var q=Q(p[0],p[1],p[2]);return q[0].toFixed(1)+','+q[1].toFixed(1);}).join(' ')+'" fill="'+fill+'" stroke="#6c1214" stroke-width="1.5" stroke-linejoin="round"></polygon>';}
  function T(q,dx,dy,t,anc){return '<text x="'+(q[0]+dx).toFixed(1)+'" y="'+(q[1]+dy).toFixed(1)+'" text-anchor="'+anc+'" font-size="11" font-weight="700" fill="#6c1214">'+esc(t)+'</text>';}
  return '<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" style="max-width:100%;height:auto" role="img" aria-label="مجسم ثلاثي الأبعاد">'+
    '<text x="'+(w/2)+'" y="13" text-anchor="middle" font-size="12" font-weight="700" fill="#8e1c1f">مجسم ثلاثي الأبعاد</text>'+
    poly([[0,0,H],[L,0,H],[L,W,H],[0,W,H]],'#f5dcaa')+
    poly([[L,0,0],[L,W,0],[L,W,H],[L,0,H]],'#d9b774')+
    poly([[0,W,0],[L,W,0],[L,W,H],[0,W,H]],'#e8c98c')+
    T(Q(L/2,W,0),-14,18,'الطول '+fmt(L),'middle')+
    T(Q(L,W/2,0),14,16,'العرض '+fmt(W),'start')+
    T(Q(0,W,H/2),-8,4,'الارتفاع '+fmt(H),'end')+
    '</svg>';
}
function rectSvg(a,b,ta,tb,title,plan){
  a=num(a);b=num(b);if(a<=0||b<=0)return '';
  var s=Math.min(150/a,110/b),rw=a*s,rh=b*s,p=44,w=Math.round(rw+p*2),h=Math.round(rh+p*2+10);
  var x0=p,y0=p+4,x1=x0+rw,y1=y0+rh,yd=y1+14,xd=x0-14;
  function ln(a1,b1,a2,b2,sw){return '<line x1="'+a1.toFixed(1)+'" y1="'+b1.toFixed(1)+'" x2="'+a2.toFixed(1)+'" y2="'+b2.toFixed(1)+'" stroke="#6c1214" stroke-width="'+(sw||1)+'" stroke-linecap="round"></line>';}
  var det=(plan||[]).map(function(q){
    if(q.k==='r')return '<rect x="'+(x0+q.u*rw).toFixed(1)+'" y="'+(y1-(q.v+q.h)*rh).toFixed(1)+'" width="'+(q.w*rw).toFixed(1)+'" height="'+(q.h*rh).toFixed(1)+'" fill="'+(q.f||'#8a6a3a')+'" stroke="#6c1214" stroke-width="0.8"></rect>';
    return ln(x0+q.u1*rw,y1-q.v1*rh,x0+q.u2*rw,y1-q.v2*rh,q.b?2.4:0.9);
  }).join('');
  return '<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" style="max-width:100%;height:auto" role="img" aria-label="'+esc(title)+'">'+
    '<text x="'+(w/2)+'" y="13" text-anchor="middle" font-size="12" font-weight="700" fill="#8e1c1f">'+esc(title)+'</text>'+
    '<rect x="'+x0+'" y="'+y0+'" width="'+rw.toFixed(1)+'" height="'+rh.toFixed(1)+'" fill="#f5dcaa" stroke="#6c1214" stroke-width="1.5"></rect>'+det+
    ln(x0,yd,x1,yd)+ln(x0,yd-4,x0,yd+4)+ln(x1,yd-4,x1,yd+4)+
    '<text x="'+(x0+rw/2).toFixed(1)+'" y="'+(yd+15)+'" text-anchor="middle" font-size="11" font-weight="700" fill="#6c1214">'+esc(ta+' '+fmt(a))+'</text>'+
    ln(xd,y0,xd,y1)+ln(xd-4,y0,xd+4,y0)+ln(xd-4,y1,xd+4,y1)+
    '<text transform="rotate(-90 '+(xd-7)+' '+(y0+rh/2).toFixed(1)+')" x="'+(xd-7)+'" y="'+(y0+rh/2).toFixed(1)+'" text-anchor="middle" font-size="11" font-weight="700" fill="#6c1214">'+esc(tb+' '+fmt(b))+'</text>'+
    '</svg>';
}

/* ---------- أنواع الأثاث وتفاصيل المجسم ---------- */
var FT=['صندوق عام','دولاب / خزانة','سرير','غرفة نوم كاملة','طاولة تلفزيون','طاولة / سفرة','مكتب','كنبة','كرسي','تسريحة','كومدينو','مكتبة / رف'];
var CL={wood:['#f5dcaa','#d9b774','#e8c98c'],fab:['#dfe6ea','#a9b6bd','#c4d0d6'],fab2:['#f1f4f6','#c3cdd3','#e2e8ec'],glass:['#d8eef6','#9cc3d1','#b7d9e6']};
function guessFT(name){
  var seg=String(name||'').split('—'),n=seg[seg.length-1],whole=seg.length===1;
  if(whole&&/غرفة نوم|غرفه نوم/.test(n))return FT[3];
  if(/سرير|سرائر/.test(n))return FT[2];
  if(/كومد|كمد/.test(n))return FT[10];
  if(/تسريحة|تسريحه|تسريحات/.test(n))return FT[9];
  if(/تلفزيون|تلفاز|شاشة|TV/i.test(n))return FT[4];
  if(/مكتبة|مكتبه|(^|\s)(رف|رفوف|أرفف)(\s|$)/.test(n))return FT[11];
  if(/دولاب|خزانة|خزانه|كبت|وردروب|ملابس/.test(n))return FT[1];
  if(/مكتب/.test(n))return FT[6];
  if(/كنب|صالون|أريكة|اريكة|ركنة|ركنه|فوتيه/.test(n))return FT[7];
  if(/كرسي|كراسي|مقعد/.test(n))return FT[8];
  if(/طاولة|طاولات|ترابيزة|ترابيزه|سفرة/.test(n))return FT[5];
  if(/غرفة نوم|غرفه نوم/.test(n))return FT[3];
  return FT[0];
}
function ftype(d,name){return FT.indexOf(d.type)>-1?d.type:guessFT(name);}
function fdef(t,d,L){
  function n(v,def,mx){var x=parseFloat(v);return (v===''||v==null||isNaN(x))?def:Math.min(mx,Math.max(0,Math.round(x)));}
  return {
    doors:n(d.doors,t===FT[1]?Math.max(2,Math.round(num(L)/50)):t===FT[4]?1:t===FT[3]?3:0,12),
    drawers:n(d.drawers,t===FT[4]?2:t===FT[6]?3:t===FT[9]?3:t===FT[10]?2:0,10),
    shelves:n(d.shelves,t===FT[11]?4:t===FT[7]?Math.max(2,Math.round(num(L)/70)):0,12)
  };
}
function pDoors(n,u0,u1,v0,v1){
  var a=[],w=(u1-u0)/Math.max(n,1),k;
  for(k=1;k<n;k++)a.push({k:'l',u1:u0+w*k,v1:v0,u2:u0+w*k,v2:v1});
  for(k=0;k<n;k++){var hu=u0+w*(k+1)-w*0.14,vm=(v0+v1)/2;a.push({k:'l',b:1,u1:hu,v1:vm-(v1-v0)*0.07,u2:hu,v2:vm+(v1-v0)*0.07});}
  return a;
}
function pDrawers(n,u0,u1,v0,v1){
  var a=[],h=(v1-v0)/Math.max(n,1),k;
  for(k=1;k<n;k++)a.push({k:'l',u1:u0,v1:v0+h*k,u2:u1,v2:v0+h*k});
  for(k=0;k<n;k++){var vc=v0+h*(k+0.5),uc=(u0+u1)/2,hw=(u1-u0)*0.1;a.push({k:'l',b:1,u1:uc-hw,v1:vc,u2:uc+hw,v2:vc});}
  return a;
}
function frontPlan(t,r,forBox){
  var a,k;
  if(t===FT[1]){var z=r.drawers>0?0.25:0;return pDrawers(r.drawers,0,1,0,z).concat(z?[{k:'l',u1:0,v1:z,u2:1,v2:z}]:[],pDoors(r.doors,0,1,z,1));}
  if(t===FT[4])return [{k:'r',u:0.3,v:0.12,w:0.4,h:0.76,f:'#a98a58'},{k:'l',u1:0.3,v1:0,u2:0.3,v2:1},{k:'l',u1:0.7,v1:0,u2:0.7,v2:1},{k:'l',u1:0.3,v1:0.5,u2:0.7,v2:0.5}].concat(r.doors?pDoors(r.doors,0,0.3,0,1):[],pDrawers(r.drawers,0.7,1,0,1));
  if(t===FT[9])return forBox?pDrawers(r.drawers,0,1,0,1):pDrawers(r.drawers,0,1,0,0.5).concat([{k:'r',u:0.1,v:0.55,w:0.8,h:0.42,f:'#b7d9e6'}]);
  if(t===FT[10])return pDrawers(r.drawers,0,1,0,1);
  if(t===FT[11]){a=[{k:'r',u:0.04,v:0.03,w:0.92,h:0.94,f:'#a98a58'}];for(k=1;k<r.shelves;k++)a.push({k:'l',u1:0.04,v1:k/r.shelves,u2:0.96,v2:k/r.shelves});return a;}
  return null;
}
function furnDesc(t,r){
  if(t===FT[1])return 'دولاب '+r.doors+' أبواب'+(r.drawers?' + '+r.drawers+' أدراج سفلية':'');
  if(t===FT[2])return 'هيكل سرير + لوح رأس + مرتبة + وسادتان';
  if(t===FT[3])return 'سرير بلوح رأس + كومدينو عدد 2 + دولاب '+r.doors+' أبواب + تسريحة بمرآة';
  if(t===FT[4])return (r.doors?r.doors+' باب جانبي + ':'')+'رف مفتوح في الوسط'+(r.drawers?' + '+r.drawers+' أدراج':'');
  if(t===FT[5])return 'سطح علوي + 4 أرجل';
  if(t===FT[6])return 'سطح مكتب + وحدة '+r.drawers+' أدراج + لوح جانبي';
  if(t===FT[7])return 'كنبة بـ '+r.shelves+' وسائد مقعد + مسند ظهر + مسندان جانبيان';
  if(t===FT[8])return 'مقعد + مسند ظهر + 4 أرجل';
  if(t===FT[9])return 'تسريحة '+r.drawers+' أدراج + مرآة';
  if(t===FT[10])return 'كومدينو '+r.drawers+' أدراج';
  if(t===FT[11])return 'مكتبة '+r.shelves+' أرفف مفتوحة';
  return 'صندوق بالأبعاد المدخلة';
}
function furnSvg(t,L,W,H,r){
  if(!(L>0&&W>0&&H>0))return '<div class="empty" style="padding:24px 10px">أدخل الطول والعرض والارتفاع لعرض المجسم ثلاثي الأبعاد</div>';
  var s=140/Math.max(L,W,H),c=0.866;
  function P(x,y,z){return [(x-y)*c*s,(x+y)*0.5*s-z*s];}
  var cs=[[0,0,0],[L,0,0],[0,W,0],[L,W,0],[0,0,H],[L,0,H],[0,W,H],[L,W,H]].map(function(a){return P(a[0],a[1],a[2]);});
  var xs=cs.map(function(p){return p[0];}),ys=cs.map(function(p){return p[1];});
  var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);
  var ox=62-minX,oy=26-minY,w=Math.round(maxX-minX+124),h=Math.round(maxY-minY+66);
  function Q(x,y,z){var p=P(x,y,z);return [p[0]+ox,p[1]+oy];}
  function pt(x,y,z){var q=Q(x,y,z);return q[0].toFixed(1)+','+q[1].toFixed(1);}
  function poly(a,fill,sw){return '<polygon points="'+a.map(function(p){return pt(p[0],p[1],p[2]);}).join(' ')+'" fill="'+fill+'" stroke="#6c1214" stroke-width="'+(sw||1.2)+'" stroke-linejoin="round"></polygon>';}
  var out='',WD=CL.wood,FB=CL.fab,GL=CL.glass;
  function box(x,y,z,l,w2,h2,col,plan){
    col=col||WD;
    out+=poly([[x,y,z+h2],[x+l,y,z+h2],[x+l,y+w2,z+h2],[x,y+w2,z+h2]],col[0])+
      poly([[x+l,y,z],[x+l,y+w2,z],[x+l,y+w2,z+h2],[x+l,y,z+h2]],col[1])+
      poly([[x,y+w2,z],[x+l,y+w2,z],[x+l,y+w2,z+h2],[x,y+w2,z+h2]],col[2]);
    if(plan)plan.forEach(function(p){
      if(p.k==='r')out+=poly([[x+p.u*l,y+w2,z+p.v*h2],[x+(p.u+p.w)*l,y+w2,z+p.v*h2],[x+(p.u+p.w)*l,y+w2,z+(p.v+p.h)*h2],[x+p.u*l,y+w2,z+(p.v+p.h)*h2]],p.f||'#a98a58',0.8);
      else{var a=pt(x+p.u1*l,y+w2,z+p.v1*h2).split(','),b=pt(x+p.u2*l,y+w2,z+p.v2*h2).split(',');out+='<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="#6c1214" stroke-width="'+(p.b?2.4:0.9)+'" stroke-linecap="round"></line>';}
    });
  }
  function bedAt(x,y,l,w2,h2){
    var hb=Math.max(Math.min(l,w2)*0.06,1),ll=l-hb;
    box(x,y,0,hb,w2,h2,WD);
    box(x+hb,y,h2*0.08,ll,w2,h2*0.25,WD);
    box(x+hb+ll*0.02,y+w2*0.03,h2*0.33,ll*0.96,w2*0.94,h2*0.17,FB);
    box(x+hb+ll*0.04,y+w2*0.08,h2*0.5,ll*0.14,w2*0.38,h2*0.06,CL.fab2);
    box(x+hb+ll*0.04,y+w2*0.54,h2*0.5,ll*0.14,w2*0.38,h2*0.06,CL.fab2);
  }
  function dresserAt(x,y,l,w2,h2){
    box(x,y,0,l,w2,h2*0.5,WD,pDrawers(r.drawers||3,0,1,0,1));
    box(x+l*0.1,y,h2*0.55,l*0.8,w2*0.08,h2*0.45,GL);
  }
  var lg,th,i;
  if(t===FT[1])box(0,0,0,L,W,H,WD,frontPlan(t,r));
  else if(t===FT[2])bedAt(0,0,L,W,H);
  else if(t===FT[3]){
    out+=poly([[0,0,0],[L,0,0],[L,W,0],[0,W,0]],'#efe7df',0.8);
    var items=[
      {x0:0,x1:L*0.09,y0:W*0.1,y1:W*0.27,f:function(){box(0,W*0.1,0,L*0.09,W*0.17,H*0.4,WD,pDrawers(2,0,1,0,1));}},
      {x0:0,x1:L*0.09,y0:W*0.81,y1:W*0.98,f:function(){box(0,W*0.81,0,L*0.09,W*0.17,H*0.4,WD,pDrawers(2,0,1,0,1));}},
      {x0:0,x1:L*0.55,y0:W*0.3,y1:W*0.78,f:function(){bedAt(0,W*0.3,L*0.55,W*0.48,H*0.45);}},
      {x0:L*0.62,x1:L,y0:0,y1:W*0.3,f:function(){box(L*0.62,0,0,L*0.38,W*0.3,H,WD,frontPlan(FT[1],r));}},
      {x0:L*0.75,x1:L,y0:W*0.7,y1:W*0.98,f:function(){dresserAt(L*0.75,W*0.7,L*0.25,W*0.28,H*0.85);}}
    ],done=[];
    function front(A,B){return A.x0>=B.x1-1e-6||A.y0>=B.y1-1e-6;}
    while(items.length){
      var pick=-1;
      for(i=0;i<items.length&&pick<0;i++){
        var ok=true;
        for(var j=0;j<items.length;j++){if(j!==i&&front(items[i],items[j])&&!front(items[j],items[i])){ok=false;break;}}
        if(ok)pick=i;
      }
      if(pick<0)pick=0;
      items.splice(pick,1)[0].f();
    }
  }
  else if(t===FT[4]){
    lg=Math.max(Math.min(L,W)*0.04,1);
    box(0,0,0,lg,lg,H*0.1,WD);box(L-lg,0,0,lg,lg,H*0.1,WD);box(0,W-lg,0,lg,lg,H*0.1,WD);box(L-lg,W-lg,0,lg,lg,H*0.1,WD);
    box(0,0,H*0.1,L,W,H*0.9,WD,frontPlan(t,r));
  }
  else if(t===FT[5]){
    lg=Math.max(Math.min(L,W)*0.07,1);th=Math.max(H*0.08,1);
    box(0,0,0,lg,lg,H-th,WD);box(L-lg,0,0,lg,lg,H-th,WD);box(0,W-lg,0,lg,lg,H-th,WD);box(L-lg,W-lg,0,lg,lg,H-th,WD);
    box(0,0,H-th,L,W,th,WD);
  }
  else if(t===FT[6]){
    th=Math.max(H*0.08,1);
    box(L*0.04,0,H*0.3,L*0.68,W*0.03,H*0.55,WD);
    box(0,0,0,L*0.04,W,H-th,WD);
    box(L*0.72,0,0,L*0.28,W,H-th,WD,pDrawers(r.drawers,0.06,0.94,0.04,0.96));
    box(0,0,H-th,L,W,th,WD);
  }
  else if(t===FT[7]){
    var n=Math.max(1,r.shelves||2);
    box(0,0,0,L*0.1,W,H*0.62,FB);
    box(L*0.1,0,0,L*0.8,W,H*0.3,FB);
    box(L*0.1,0,H*0.3,L*0.8,W*0.22,H*0.7,FB);
    for(i=0;i<n;i++)box(L*0.1+L*0.8*i/n,W*0.22,H*0.3,L*0.8/n,W*0.78,H*0.14,CL.fab2);
    box(L*0.9,0,0,L*0.1,W,H*0.62,FB);
  }
  else if(t===FT[8]){
    lg=Math.max(Math.min(L,W)*0.09,1);
    box(0,0,0,lg,lg,H*0.46,WD);box(L-lg,0,0,lg,lg,H*0.46,WD);
    box(0,0,H*0.5,L,W*0.1,H*0.5,WD);
    box(0,W-lg,0,lg,lg,H*0.46,WD);box(L-lg,W-lg,0,lg,lg,H*0.46,WD);
    box(0,0,H*0.46,L,W,H*0.07,FB);
  }
  else if(t===FT[9])dresserAt(0,0,L,W,H);
  else if(t===FT[10])box(0,0,0,L,W,H,WD,frontPlan(t,r,true));
  else if(t===FT[11])box(0,0,0,L,W,H,WD,frontPlan(t,r));
  else box(0,0,0,L,W,H,WD);
  function T(q,dx,dy,tx,anc){return '<text x="'+(q[0]+dx).toFixed(1)+'" y="'+(q[1]+dy).toFixed(1)+'" text-anchor="'+anc+'" font-size="11" font-weight="700" fill="#6c1214">'+esc(tx)+'</text>';}
  return '<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" style="max-width:100%;height:auto" role="img" aria-label="'+esc('مجسم ثلاثي الأبعاد — '+t)+'">'+
    '<text x="'+(w/2)+'" y="13" text-anchor="middle" font-size="12" font-weight="700" fill="#8e1c1f">'+esc('مجسم: '+t)+'</text>'+out+
    T(Q(L/2,W,0),-14,18,'الطول '+fmt(L),'middle')+
    T(Q(L,W/2,0),14,16,'العرض '+fmt(W),'start')+
    T(Q(0,W,H/2),-8,4,'الارتفاع '+fmt(H),'end')+'</svg>';
}
/* ---------- التقسيم الداخلي (المقطع الداخلي بالأبواب مفتوحة) ---------- */
var SECK=[['shelves','رفوف'],['hang','شماعة تعليق'],['hang2','شماعتان'],['drawers','أدراج'],['combo','رفوف + أدراج سفلية'],['empty','فراغ'],['mix','تقسيم مخصص حسب طلب العميل']];
function hasInt(t){return t===FT[1]||t===FT[4]||t===FT[10]||t===FT[11];}
function ci(v,def,mx){var x=parseFloat(v);return (v===''||v==null||isNaN(x))?def:Math.min(mx||99,Math.max(0,Math.round(x)));}
function r1(x){return Math.round(x*10)/10;}
function defSecs(t,L,r){
  L=num(L);
  if(t===FT[1]){
    if(L<90)return [{k:'shelves',w:'',n:4,m:''}];
    if(L<160)return [{k:'hang',w:'',n:1,m:''},{k:'shelves',w:'',n:4,m:''}];
    return [{k:'hang',w:'',n:1,m:''},{k:'shelves',w:'',n:4,m:''},{k:'combo',w:'',n:3,m:2}];
  }
  if(t===FT[4])return [{k:'shelves',w:Math.round(L*0.3),n:1,m:''},{k:'combo',w:'',n:Math.max(1,r.shelves||1),m:r.drawers||''},{k:'shelves',w:Math.round(L*0.3),n:1,m:''}];
  if(t===FT[10])return [{k:'drawers',w:'',n:Math.max(1,r.drawers||2),m:''}];
  return [{k:'shelves',w:'',n:Math.max(1,(r.shelves||4)-1),m:''}];
}
/* ===== اتجاه فتح الأبواب (لكل باب على حدة) ===== */
var DSML={mid:'من المنتصف للخارج (الافتراضي)',R:'كل الأبواب تفتح لليمين',L:'كل الأبواب تفتح لليسار',altR:'بالتناوب: الأول يمين والثاني يسار وهكذا',altL:'بالتناوب: الأول يسار والثاني يمين وهكذا',custom:'مخصص — أحدد اتجاه كل باب'};
function doorSides(m,l,n){
  var a=[],k,sd;
  for(k=0;k<n;k++){
    if(m==='R')sd='R';
    else if(m==='L')sd='L';
    else if(m==='altR')sd=(k%2===0)?'R':'L';
    else if(m==='altL')sd=(k%2===0)?'L':'R';
    else if(m==='custom'&&l&&l[k])sd=(l[k]==='R')?'R':'L';
    else sd=(k<n/2)?'L':'R';
    a.push(sd);
  }
  return a;
}
function dsDesc(d,n){
  var m=d.dsm||'mid';
  if(m==='mid')return '';
  var sd=doorSides(m,d.dsl,n||(d.dsl?d.dsl.length:0));
  if(m==='custom'||sd.length)return (m==='custom'?'':DSML[m]+' — ')+sd.map(function(x,i){return 'باب '+(i+1)+': '+(x==='R'?'يمين':'يسار');}).join('، ');
  return DSML[m]||'';
}
/* ===== التقسيم الداخلي حسب الأبواب (كل تقسيم يشمل باب أو أكثر) ===== */
var BAYT=[['tpHS','رف علوي + عمود شماعة | عمود رفوف (مثل الصورة)'],['tpSH','رف علوي + عمود رفوف | عمود شماعة'],['tpHSD','رف علوي + شماعة | رفوف وأدراج أسفل'],['tpH','رف علوي + شماعة كاملة'],['tpS','رفوف كاملة'],['tpH2','شماعتان علوية وسفلية'],['tpSD','رفوف + أدراج أسفل'],['tpD','أدراج فقط']];
function bayMake(id){
  function P(p,n){return {p:p,n:n,h:''};}
  var T=function(h){return {on:true,h:h||40,n:0};};
  if(id==='tpHS')return {top:T(),cols:[{f:1,parts:[P('hang',1)]},{f:1,parts:[P('shelves',3)]}]};
  if(id==='tpSH')return {top:T(),cols:[{f:1,parts:[P('shelves',3)]},{f:1,parts:[P('hang',1)]}]};
  if(id==='tpHSD')return {top:T(),cols:[{f:1,parts:[P('hang',1)]},{f:1,parts:[P('shelves',2),P('drawers',2)]}]};
  if(id==='tpH')return {top:T(),cols:[{f:1,parts:[P('hang',1)]}]};
  if(id==='tpS')return {top:{on:false,h:40,n:0},cols:[{f:1,parts:[P('shelves',4)]}]};
  if(id==='tpH2')return {top:{on:false,h:40,n:0},cols:[{f:1,parts:[P('hang',1),P('hang',1)]}]};
  if(id==='tpSD')return {top:{on:false,h:40,n:0},cols:[{f:1,parts:[P('shelves',3),P('drawers',2)]}]};
  if(id==='tpD')return {top:{on:false,h:40,n:0},cols:[{f:1,parts:[P('drawers',4)]}]};
  return null;
}
function bayNew(span,tpl){var m=bayMake(tpl)||bayMake('tpS');return {span:span,tpl:tpl,top:m.top,cols:m.cols};}
function bayAuto(n,per){
  var a=[],left=Math.max(1,n),i=0;
  while(left>0){var sp=Math.min(per,left);a.push(bayNew(sp,sp>=2?'tpHS':(i%2===0?'tpH':'tpS')));left-=sp;i++;}
  return a;
}
function baysToSecs(d){
  return d.bays.map(function(by){
    var sp=Math.max(1,parseInt(by.span,10)||1);
    return {k:'bay',w:sp,rel:1,span:sp,top:by.top,cols:(by.cols&&by.cols.length)?by.cols:[{f:1,parts:[]}]};
  });
}
function bayColW(cols,wd,tk){
  var nc=cols.length,av=wd-tk*(nc-1),tot=0,fs=cols.map(function(c){var f=parseFloat(c.f);f=(f>0)?f:1;tot+=f;return f;});
  return fs.map(function(f){return av*f/tot;});
}
function bayTop(sc,vb,vt,tk){
  var tp=sc.top;
  if(!tp||!tp.on)return {has:0,h:0,vcol:vt};
  var h=parseFloat(tp.h);if(!(h>0))h=40;
  h=Math.min(h,(vt-vb)*0.5);
  return {has:1,h:h,vcol:vt-h-tk};
}
function getSecs(d,t,L,r){
  if(t===FT[1]&&d.bays&&d.bays.length)return baysToSecs(d);
  return (d.secs&&d.secs.length)?d.secs:defSecs(t,L,r);
}
function secTk(L,H){return Math.max(0.8,Math.min(1.8,L*0.02,H*0.02));}
/* تقسيم مخصص داخل الفتحة الواحدة: أجزاء مرتبة من الأعلى إلى الأسفل (رفوف / شماعة / أدراج / فراغ) */
function mixLayout(parts,vb,vt,tk){
  var m=parts.length;if(!m)return [];
  var avail=vt-vb-tk*(m-1),given=0,pb=0,pf=parts.map(function(p){
    var h=parseFloat(p.h),kd=p.p||'shelves',n=ci(p.n,kd==='drawers'||kd==='shelves'?2:1,30);
    if(h>0){given+=h;return {h:h,fx:1};}
    var pr=kd==='hang'?110:kd==='drawers'?Math.max(1,n)*20:kd==='shelves'?Math.max(1,n)*30:40;pb+=pr;return {h:pr,fx:0};
  }),f=1,free=avail-given,hs;
  if(pb>0&&free>=8*pf.filter(function(q){return !q.fx;}).length)hs=pf.map(function(q){return q.fx?q.h:q.h*free/pb;});
  else{f=avail/(given+pb);hs=pf.map(function(q){return q.h*f;});}
  var v=vt,out=[];
  parts.forEach(function(p,i){var hh=Math.max(4,hs[i]);out.push({p:p.p||'shelves',n:p.n,vlo:v-hh,vhi:v,h:hh});v=v-hh-tk;});
  return out;
}
function mixPartTxt(p){
  var k=p.p||'shelves',n=ci(p.n,k==='drawers'||k==='shelves'?2:1,30),h=parseFloat(p.h)>0?' ('+fmt(parseFloat(p.h))+' سم)':'';
  return (k==='shelves'?n+' رفوف':k==='drawers'?n+' أدراج':k==='hang'?'شماعة تعليق':'فراغ')+h;
}
function mixFrom(sc){
  var k=sc.k||'shelves',n=sc.n;
  if(k==='hang')return [{p:'shelves',n:ci(n,1,1),h:''},{p:'hang',n:1,h:''}];
  if(k==='hang2')return [{p:'hang',n:1,h:''},{p:'hang',n:1,h:''}];
  if(k==='drawers')return [{p:'drawers',n:ci(n,3,12),h:''}];
  if(k==='combo')return [{p:'shelves',n:ci(n,3,30),h:''},{p:'drawers',n:ci(sc.m,2,10),h:''}];
  if(k==='empty')return [{p:'empty',n:1,h:''}];
  return [{p:'shelves',n:ci(n,3,30),h:''}];
}
function secLayout(secs,L,H){
  var tk=secTk(L,H),n=secs.length,avail=L-tk*(n+1);
  if(!n||avail<=n*5)return null;
  var given=0,blanks=0,raw=secs.map(function(x){var w=parseFloat(x.w);if(x.w===''||x.w==null||isNaN(w)||w<=0){blanks++;return null;}given+=w;return w;});
  var ws,note='';
  if(blanks>0&&avail-given>=5*blanks){var bw=(avail-given)/blanks;ws=raw.map(function(w){return w==null?bw:w;});}
  else if(blanks===0&&!secs.every(function(x){return x.rel;})&&Math.abs(given-avail)<=0.6)ws=raw;
  else{
    var rr=raw.map(function(w){return w==null?avail/n:w;}),tot=rr.reduce(function(a,b){return a+b;},0);
    ws=rr.map(function(w){return w*avail/tot;});
    note=secs.every(function(x){return x.rel;})?'':'مجموع عروض الأقسام لا يطابق العرض الداخلي المتاح ('+fmt(r1(avail))+' سم بعد خصم سماكة الألواح)، لذلك عُدّلت العروض نسبيًا في الرسم.';
  }
  return {tk:tk,ws:ws,note:note,avail:avail};
}
function secDesc(secs,lay){
  var sh=0,dr=0;
  var parts=secs.map(function(sc,i){
    var k=sc.k||'shelves',n,m,txt;
    if(k==='shelves'){n=ci(sc.n,3,30);sh+=n;txt=n+' رفوف';}
    else if(k==='hang'){n=ci(sc.n,1,1);sh+=n;txt='شماعة تعليق'+(n?' + رف علوي':'');}
    else if(k==='hang2')txt='شماعتان (علوية وسفلية)';
    else if(k==='drawers'){n=ci(sc.n,3,12);dr+=n;txt=n+' أدراج';}
    else if(k==='combo'){n=ci(sc.n,3,30);m=ci(sc.m,2,10);sh+=n;dr+=m;txt=n+' رفوف + '+m+' أدراج سفلية';}
    else if(k==='mix'){var ps=sc.parts||[];txt='تقسيم مخصص من الأعلى: '+(ps.length?ps.map(mixPartTxt).join(' + '):'فارغ');ps.forEach(function(p){if(p.p==='shelves')sh+=ci(p.n,2,30);else if(p.p==='drawers')dr+=ci(p.n,2,12);});}
    else if(k==='bay'){
      var cl2=sc.cols||[],tn2=(sc.top&&sc.top.on)?ci(sc.top.n,0,6):0;sh+=tn2;
      txt='يشمل '+(sc.span>1?(sc.span===2?'بابين':sc.span+' أبواب'):'باب واحد')+': '+((sc.top&&sc.top.on)?'حيز علوي بعرض التقسيم'+(tn2?' ('+tn2+' رفوف)':'')+' + ':'')+cl2.map(function(c,j){var ps=c.parts||[];ps.forEach(function(p){if(p.p==='shelves')sh+=ci(p.n,2,30);else if(p.p==='drawers')dr+=ci(p.n,2,12);});return 'عمود '+(j+1)+' ['+(ps.length?ps.map(mixPartTxt).join(' + '):'فارغ')+']';}).join(' | ');
    }
    else txt='فراغ';
    return (k==='bay'?'التقسيم ':'القسم ')+(i+1)+' ('+fmt(r1(lay.ws[i]))+' سم): '+txt;
  });
  return parts.join(' — ')+' — الإجمالي: '+sh+' رفوف'+(dr?' و'+dr+' أدراج':'');
}
function interiorSvg(t,L,H,secs,lay,sf){
  if(!(L>0&&H>0)||!lay)return '';
  var tk=lay.tk,base=(t===FT[11])?0:Math.min(6,H*0.04),vb=base+tk,vt=H-tk,hh=vt-vb;
  if(hh<=5)return '';
  var s=Math.min(300/L,280/H),rw=L*s,rh=H*s,ml=Math.max(36,Math.round((330-rw)/2)),mt=28,mb=62,mr=Math.max(16,Math.round((330-rw)/2)-16),w=Math.round(rw+ml+mr),h=Math.round(rh+mt+mb),x0=ml,y1=mt+rh;
  function X(u){return x0+u*s;}
  function Y(v){return y1-v*s;}
  var o='',WD='#d9b774';
  function rect(u,v,ww,h2,fill,sw){return '<rect x="'+X(u).toFixed(1)+'" y="'+Y(v+h2).toFixed(1)+'" width="'+(ww*s).toFixed(1)+'" height="'+(h2*s).toFixed(1)+'" fill="'+fill+'" stroke="#6c1214" stroke-width="'+(sw||0.8)+'"></rect>';}
  function ln(u1,v1,u2,v2,sw,c){return '<line x1="'+X(u1).toFixed(1)+'" y1="'+Y(v1).toFixed(1)+'" x2="'+X(u2).toFixed(1)+'" y2="'+Y(v2).toFixed(1)+'" stroke="'+(c||'#6c1214')+'" stroke-width="'+(sw||1)+'" stroke-linecap="round"></line>';}
  function px(x1,y1b,x2,y2,sw){return '<line x1="'+x1.toFixed(1)+'" y1="'+y1b.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="#6c1214" stroke-width="'+(sw||1)+'"></line>';}
  function tx(u,v,str,sz,anc,fill){return '<text x="'+X(u).toFixed(1)+'" y="'+(Y(v)+3).toFixed(1)+'" text-anchor="'+(anc||'middle')+'" font-size="'+(sz||9)+'" fill="'+(fill||'#6c1214')+'">'+esc(str)+'</text>';}
  function gapLbl(u0,wd,vlo,vhi){return ((vhi-vlo)*s>=11&&wd*s>=26)?tx(u0+wd/2,(vlo+vhi)/2,fmt(r1(vhi-vlo)),9):'';}
  function rod(u0,wd,v){
    var r='',cnt=Math.max(2,Math.floor(wd/10)),k;
    r+=ln(u0+0.8,v,u0+wd-0.8,v,2.4);
    if(wd*s>=24)for(k=0;k<cnt;k++){
      var uc=u0+wd*(k+0.5)/cnt;
      r+=ln(uc,v,uc,v-2,0.8)+'<polyline points="'+[[uc-5,v-9],[uc,v-2],[uc+5,v-9],[uc-5,v-9]].map(function(p){return X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1);}).join(' ')+'" fill="none" stroke="#6c1214" stroke-width="0.8"></polyline>';
    }
    return r;
  }
  function shelvesRun(u0,wd,vlo,vhi,n){
    var gap=(vhi-vlo-n*tk)/(n+1),v=vlo,r='',i;
    for(i=0;i<=n;i++){r+=gapLbl(u0,wd,v,v+gap);v+=gap;if(i<n){r+=rect(u0,v,wd,tk,WD);v+=tk;}}
    return r;
  }
  function drawerRect(u0,wd,v,dh){
    var uc=u0+wd/2;
    return rect(u0+0.4,v+0.3,wd-0.8,dh-0.6,'#efd49c')+ln(uc-4,v+dh/2,uc+4,v+dh/2,2)+((dh*s>=11&&wd*s>=26)?tx(u0+wd/2,v+dh*0.22,fmt(r1(dh)),8):'');
  }
  function mixRun(u0,wd,vb2,vt2,parts){
    var ml2=mixLayout(parts||[],vb2,vt2,tk);
    ml2.forEach(function(q,qi){
      var nn2,dh2,j2,rd2;
      if(q.p==='shelves')o+=shelvesRun(u0,wd,q.vlo,q.vhi,ci(q.n,2,30));
      else if(q.p==='hang'){rd2=q.vhi-6;o+=rod(u0,wd,rd2)+gapLbl(u0,wd,q.vlo,rd2-10);}
      else if(q.p==='drawers'){nn2=ci(q.n,2,12);dh2=(q.vhi-q.vlo)/Math.max(nn2,1);for(j2=0;j2<nn2;j2++)o+=drawerRect(u0,wd,q.vlo+j2*dh2,dh2);}
      else o+=tx(u0+wd/2,(q.vlo+q.vhi)/2,'فراغ',9);
      if(qi<ml2.length-1)o+=rect(u0,q.vlo-tk,wd,tk,WD);
    });
  }
  o+=rect(0,0,L,H,WD,1.5)+rect(tk,vb,L-2*tk,hh,'#fbf3df',0.8);
  var u=tk,n=secs.length;
  secs.forEach(function(sc,i){
    var wd=lay.ws[i],k=sc.k||'shelves',u0=u,m,nn,j,dh,dm,cap,sv,rd,r1v,r2v;
    if(k==='shelves')o+=shelvesRun(u0,wd,vb,vt,ci(sc.n,3,30));
    else if(k==='hang'){
      nn=ci(sc.n,1,1);cap=vt;
      if(nn){sv=vt-32;o+=rect(u0,sv,wd,tk,WD);o+=gapLbl(u0,wd,sv+tk,vt);cap=sv;}
      rd=cap-6;o+=rod(u0,wd,rd)+gapLbl(u0,wd,vb,rd-10);
    }else if(k==='hang2'){
      r1v=vt-6;r2v=hh>=190?r1v-100:(r1v+vb)/2;
      if(r2v<vb+25)r2v=vb+(r1v-vb)/2;
      o+=rod(u0,wd,r1v)+rod(u0,wd,r2v)+gapLbl(u0,wd,r2v,r1v-10)+gapLbl(u0,wd,vb,r2v-10);
    }else if(k==='drawers'){
      nn=ci(sc.n,3,12);dh=hh/Math.max(nn,1);
      for(j=0;j<nn;j++)o+=drawerRect(u0,wd,vb+j*dh,dh);
    }else if(k==='combo'){
      nn=ci(sc.n,3,30);m=ci(sc.m,2,10);dh=Math.min(20,hh*0.4/Math.max(m,1));dm=m*dh;
      for(j=0;j<m;j++)o+=drawerRect(u0,wd,vb+j*dh,dh);
      if(m){o+=rect(u0,vb+dm,wd,tk,WD);}
      o+=shelvesRun(u0,wd,vb+dm+(m?tk:0),vt,nn);
    }else if(k==='mix'){
      var ml=mixLayout(sc.parts||[],vb,vt,tk);
      ml.forEach(function(q,qi){
        if(q.p==='shelves')o+=shelvesRun(u0,wd,q.vlo,q.vhi,ci(q.n,2,30));
        else if(q.p==='hang'){rd=q.vhi-6;o+=rod(u0,wd,rd)+gapLbl(u0,wd,q.vlo,rd-10);}
        else if(q.p==='drawers'){nn=ci(q.n,2,12);dh=(q.vhi-q.vlo)/Math.max(nn,1);for(j=0;j<nn;j++)o+=drawerRect(u0,wd,q.vlo+j*dh,dh);}
        else o+=tx(u0+wd/2,(q.vlo+q.vhi)/2,'فراغ',9);
        if(qi<ml.length-1)o+=rect(u0,q.vlo-tk,wd,tk,WD);
      });
    }else if(k==='bay'){
      var bt=bayTop(sc,vb,vt,tk),cls=sc.cols||[],cw=bayColW(cls,wd,tk),cu=u0,tn=(sc.top&&sc.top.on)?ci(sc.top.n,0,6):0;
      if(bt.has){o+=rect(u0,bt.vcol,wd,tk,WD);o+=tn?shelvesRun(u0,wd,vt-bt.h,vt,tn):gapLbl(u0,wd,vt-bt.h,vt);}
      cls.forEach(function(cl,cj){
        mixRun(cu,cw[cj],vb,bt.vcol,cl.parts);
        if(cj<cls.length-1)o+=rect(cu+cw[cj],vb,tk,bt.vcol-vb,WD);
        cu+=cw[cj]+tk;
      });
    }else o+=tx(u0+wd/2,(vb+vt)/2,'فراغ',10);
    o+=tx(u0+wd/2,H+4,'قسم '+(i+1),9.5,'middle','#8e1c1f');
    if(i<n-1)o+=rect(u0+wd,vb,tk,hh,WD);
    var ya=Y(0)+14;
    o+=px(X(u0),ya,X(u0+wd),ya)+px(X(u0),ya-3,X(u0),ya+3)+px(X(u0+wd),ya-3,X(u0+wd),ya+3)+
      '<text x="'+X(u0+wd/2).toFixed(1)+'" y="'+(ya+12).toFixed(1)+'" text-anchor="middle" font-size="10" font-weight="700" fill="#6c1214">'+esc(fmt(r1(wd)))+'</text>';
    u+=wd+tk;
  });
  if(sf&&sf.on&&t===FT[1]){
    var si=Math.max(0,Math.min(secs.length-1,(parseInt(sf.sec,10)||1)-1)),uu=tk,j2,SZ=SFSZN[sf.size]||SFSZN.m;
    for(j2=0;j2<si;j2++)uu+=lay.ws[j2]+tk;
    var sw=Math.min(SZ[0],lay.ws[si]-4),sh2=Math.min(SZ[2],hh-2),sv0=sf.pos==='floor'?vb:sf.pos==='top'?vt-sh2:(vb+vt)/2-sh2/2;
    if(sw>=10)o+=rect(uu+(lay.ws[si]-sw)/2,sv0,sw,sh2,'rgba(60,64,70,0.38)',1.4)+tx(uu+lay.ws[si]/2,sv0+sh2/2,'خزنة سرية',9,'middle','#1d1d1f');
  }
  var yb=y1+40,xd=x0-12;
  o+=px(X(0),yb,X(L),yb)+px(X(0),yb-4,X(0),yb+4)+px(X(L),yb-4,X(L),yb+4)+
    '<text x="'+X(L/2).toFixed(1)+'" y="'+(yb+14)+'" text-anchor="middle" font-size="11" font-weight="700" fill="#6c1214">'+esc('الطول '+fmt(L))+'</text>'+
    px(xd,Y(0),xd,Y(H))+px(xd-4,Y(0),xd+4,Y(0))+px(xd-4,Y(H),xd+4,Y(H))+
    '<text transform="rotate(-90 '+(xd-7)+' '+((Y(0)+Y(H))/2).toFixed(1)+')" x="'+(xd-7)+'" y="'+((Y(0)+Y(H))/2).toFixed(1)+'" text-anchor="middle" font-size="11" font-weight="700" fill="#6c1214">'+esc('الارتفاع '+fmt(H))+'</text>';
  return '<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" style="max-width:100%;height:auto" role="img" aria-label="المقطع الداخلي">'+
    '<text x="'+(w/2)+'" y="13" text-anchor="middle" font-size="12" font-weight="700" fill="#8e1c1f">المقطع الداخلي (الأبواب مفتوحة) — الأرقام بالسم</text>'+o+'</svg>';
}
function mixEditor(k,i,sc){
  var ps=sc.parts||[];
  return '<div style="margin:0 0 10px;padding:8px 12px;border:1px dashed var(--gold);border-radius:12px;background:#fffdf8"><span class="hint">أجزاء القسم '+(i+1)+' — مرتبة من الأعلى إلى الأسفل داخل نفس الفتحة. اترك الارتفاع فارغًا ليُوزَّع تلقائيًا.</span>'+
    ps.map(function(p,pi){
      var a='data-sec="'+k+'" data-si="'+i+'" data-pi="'+pi+'"',kd=p.p||'shelves',nPh=kd==='drawers'?'عدد الأدراج':'عدد الرفوف',ba='data-a';
      return '<div class="bar" style="gap:6px;margin:6px 0;align-items:center"><b style="min-width:42px">جزء '+(pi+1)+'</b>'+
        '<select '+a+' data-sf="p" style="width:160px" aria-label="نوع الجزء">'+MIXK.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===kd?' selected':'')+'>'+x[1]+'</option>';}).join('')+'</select>'+
        ((kd==='hang'||kd==='empty')?'':'<input type="number" min="0" step="1" '+a+' data-sf="n" placeholder="'+nPh+'" style="width:110px" value="'+esc(p.n==null?'':p.n)+'" aria-label="'+nPh+'">')+
        '<input type="number" min="0" step="any" '+a+' data-sf="h" placeholder="الارتفاع سم (تلقائي)" style="width:150px" value="'+esc(p.h==null?'':p.h)+'" aria-label="ارتفاع الجزء">'+
        '<button class="btn ghost sm" type="button" data-a="mixup" data-sk="'+k+'" data-si="'+i+'" data-pi="'+pi+'" aria-label="للأعلى">↑</button>'+
        '<button class="btn ghost sm" type="button" data-a="mixdn" data-sk="'+k+'" data-si="'+i+'" data-pi="'+pi+'" aria-label="للأسفل">↓</button>'+
        '<button class="btn sm red" type="button" data-a="mixdel" data-sk="'+k+'" data-si="'+i+'" data-pi="'+pi+'" aria-label="حذف الجزء">×</button></div>';
    }).join('')+
    '<button class="btn ghost sm" type="button" data-a="mixadd" data-sk="'+k+'" data-si="'+i+'">+ إضافة جزء (رفوف / شماعة / أدراج / فراغ)</button></div>';
}
function scDoorN(d,name){var t=ftype(d,name);return fdef(t,d,num(d.l)).doors;}
function doorEditor(k,d,name){
  if(!fvTypeDoors(d,name))return '';
  var t=ftype(d,name),n=scDoorN(d,name);
  if(n<1)return '';
  if((t===FT[1]||t===FT[3])&&d.dt==='slide'&&n>1)return '<div style="margin-top:12px"><b>اتجاه فتح الأبواب</b> <span class="hint">— الأبواب الجرّارة تنزلق على سكّة ولا يُحدَّد لها اتجاه مفصلات. غيّر «نوع أبواب الدولاب» إلى مفصلي لتحديد اتجاه كل باب.</span></div>';
  var m=d.dsm||'mid',sd=doorSides(m,d.dsl,n);
  var h='<div class="dsw" style="margin-top:12px"><b>طريقة فتح الأبواب</b> <span class="hint">— الأبواب مرقمة من اليسار إلى اليمين كما في الرسم، والاتجاه هو الجهة التي ينفتح نحوها الباب (كما تراه وأنت أمام الدولاب)</span>'+
    '<div class="bar" style="margin-top:6px"><label style="display:inline-flex;align-items:center;gap:6px;font-weight:600">النمط <select data-ds="mode" data-dsk="'+k+'" style="width:auto;min-height:34px">'+
    Object.keys(DSML).map(function(x){return '<option value="'+x+'"'+(x===m?' selected':'')+'>'+DSML[x]+'</option>';}).join('')+'</select></label></div>'+
    '<div class="bar" style="gap:6px;margin-top:6px;flex-wrap:wrap">'+
    sd.map(function(x,i){return '<button type="button" class="btn ghost sm" data-a="dstog" data-sk="'+k+'" data-i="'+i+'" title="اضغط لعكس اتجاه هذا الباب" style="min-width:104px">باب '+(i+1)+': '+(x==='R'?'يمين ▶':'◀ يسار')+'</button>';}).join('')+
    '</div><span class="hint">اضغط على أي باب لعكس اتجاهه (يتحول النمط تلقائيًا إلى «مخصص»).</span></div>';
  return h;
}
function bayPartRows(k,bi,cj,parts){
  return parts.map(function(p,pi){
    var a='data-bk="'+k+'" data-bi="'+bi+'" data-bc="'+cj+'" data-bp="'+pi+'"',kd=p.p||'shelves',nPh=kd==='drawers'?'عدد الأدراج':'عدد الرفوف';
    return '<div class="bar" style="gap:6px;margin:4px 0;align-items:center"><span style="min-width:48px">جزء '+(pi+1)+'</span>'+
      '<select '+a+' data-bf="pp" style="width:150px" aria-label="نوع الجزء">'+MIXK.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===kd?' selected':'')+'>'+x[1]+'</option>';}).join('')+'</select>'+
      ((kd==='hang'||kd==='empty')?'':'<input type="number" min="0" step="1" '+a+' data-bf="pn" placeholder="'+nPh+'" style="width:105px" value="'+esc(p.n==null?'':p.n)+'" aria-label="'+nPh+'">')+
      '<input type="number" min="0" step="any" '+a+' data-bf="ph" placeholder="الارتفاع سم (تلقائي)" style="width:140px" value="'+esc(p.h==null?'':p.h)+'" aria-label="ارتفاع الجزء">'+
      '<button class="btn ghost sm" type="button" data-a="bypup" data-sk="'+k+'" data-bi="'+bi+'" data-bc="'+cj+'" data-bp="'+pi+'" aria-label="للأعلى">↑</button>'+
      '<button class="btn ghost sm" type="button" data-a="bypdn" data-sk="'+k+'" data-bi="'+bi+'" data-bc="'+cj+'" data-bp="'+pi+'" aria-label="للأسفل">↓</button>'+
      '<button class="btn sm red" type="button" data-a="bypdel" data-sk="'+k+'" data-bi="'+bi+'" data-bc="'+cj+'" data-bp="'+pi+'" aria-label="حذف الجزء">×</button></div>';
  }).join('');
}
function bayEditor(k,d,name){
  var n=scDoorN(d,name),h='<div class="bayed" style="margin-top:12px"><b>التقسيم الداخلي حسب الأبواب</b> <span class="hint">— حدّد عدد الأبواب، ثم لكل تقسيم داخلي اختر هل يشمل بابًا واحدًا أو بابين، واختر القالب المناسب (مثل: حيز علوي + شماعة وأرفف) ثم عدّل أي تفصيلة</span>';
  h+='<div class="bar" style="gap:6px;margin:6px 0;flex-wrap:wrap;align-items:center"><span>عدد الأبواب:</span>';
  [1,2,3,4,5,6,7,8].forEach(function(x){h+='<button type="button" class="btn '+(x===n?'gold':'ghost')+' sm" data-a="bydoors" data-sk="'+k+'" data-n="'+x+'" style="min-width:36px">'+x+'</button>';});
  h+='<span class="hint">(أو غيّرها من خانة «عدد الأبواب» أعلاه)</span></div>';
  if(!d.bays||!d.bays.length){
    return h+'<p class="hint">التقسيم الحالي تلقائي أو عبر الأقسام العامة أدناه. ابدأ تقسيمًا مخصصًا ليشمل كل تقسيمٍ بابًا أو بابين.</p><div class="bar"><button class="btn gold sm" type="button" data-a="byauto2" data-sk="'+k+'">🧩 تقسيم مخصص — كل بابين تقسيم</button><button class="btn ghost sm" type="button" data-a="byauto1" data-sk="'+k+'">تقسيم لكل باب</button></div></div>';
  }
  var cov=0,start=0;
  d.bays.forEach(function(by,bi){
    var sp=Math.max(1,parseInt(by.span,10)||1),a='data-bk="'+k+'" data-bi="'+bi+'"',tp=by.top||{on:false,h:40,n:0},cls=by.cols||[];
    var from=start+1,to=start+sp;start+=sp;cov+=sp;
    h+='<div class="baycard" style="border:1px dashed var(--gold);border-radius:12px;padding:8px 12px;margin:8px 0;background:#fffdf8">'+
      '<div class="bar" style="gap:8px;align-items:center;flex-wrap:wrap"><b>تقسيم '+(bi+1)+' — '+(sp>1?'الأبواب '+from+' إلى '+to:'الباب '+from)+'</b>'+
      '<label style="display:inline-flex;align-items:center;gap:6px">يشمل <select '+a+' data-bf="span" style="width:auto;min-height:34px">'+[1,2,3,4].concat(sp>4?[sp]:[]).map(function(x){return '<option value="'+x+'"'+(x===sp?' selected':'')+'>'+(x===1?'باب واحد':x===2?'بابين':x+' أبواب')+'</option>';}).join('')+'</select></label>'+
      '<label style="display:inline-flex;align-items:center;gap:6px">قالب جاهز <select '+a+' data-bf="tpl" style="width:auto;max-width:260px;min-height:34px"><option value="">— اختر لإعادة التعبئة —</option>'+BAYT.map(function(x){return '<option value="'+x[0]+'">'+x[1]+'</option>';}).join('')+'</select></label>'+
      '<button class="btn sm red" type="button" data-a="bydel" data-sk="'+k+'" data-bi="'+bi+'" aria-label="حذف التقسيم">× حذف</button></div>'+
      '<div class="bar" style="gap:8px;margin:6px 0;align-items:center;flex-wrap:wrap"><label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" '+a+' data-bf="topon"'+(tp.on?' checked':'')+'> حيز علوي (رف للوسائد/البطاطين) بعرض التقسيم كله</label>'+
      (tp.on?'<input type="number" min="0" step="any" '+a+' data-bf="toph" placeholder="ارتفاعه سم (40)" style="width:130px" value="'+esc(tp.h==null?'':tp.h)+'" aria-label="ارتفاع الحيز العلوي"><input type="number" min="0" step="1" '+a+' data-bf="topn" placeholder="رفوف داخله (0)" style="width:120px" value="'+esc(tp.n==null?'':tp.n)+'" aria-label="رفوف داخل الحيز العلوي">':'')+'</div>';
    cls.forEach(function(cl,cj){
      var ca=a+' data-bc="'+cj+'"';
      h+='<div style="margin:6px 0;padding:6px 10px;border:1px solid #e4d3a8;border-radius:10px"><div class="bar" style="gap:8px;align-items:center;flex-wrap:wrap"><b>عمود '+(cj+1)+'</b> <span class="hint">(من اليسار)</span>'+
        '<input type="number" min="0" step="any" '+ca+' data-bf="cf" placeholder="عرض نسبي (1)" style="width:120px" value="'+esc(cl.f==null?'':cl.f)+'" aria-label="العرض النسبي للعمود">'+
        (cls.length>1?'<button class="btn sm red" type="button" data-a="bycoldel" data-sk="'+k+'" data-bi="'+bi+'" data-bc="'+cj+'" aria-label="حذف العمود">× حذف العمود</button>':'')+'</div>'+
        bayPartRows(k,bi,cj,cl.parts||[])+
        '<button class="btn ghost sm" type="button" data-a="bypadd" data-sk="'+k+'" data-bi="'+bi+'" data-bc="'+cj+'">+ إضافة جزء (رفوف / شماعة / أدراج / فراغ)</button></div>';
    });
    h+='<button class="btn ghost sm" type="button" data-a="bycoladd" data-sk="'+k+'" data-bi="'+bi+'">+ إضافة عمود (تقسيم رأسي داخل هذا التقسيم)</button></div>';
  });
  if(cov!==n)h+='<p class="hint" style="color:#b3261e;font-weight:700">⚠ التقسيمات تغطي '+cov+' من '+n+' أبواب. عدّل «يشمل» أو أضف تقسيمًا أو اضغط «توزيع تلقائي» ليتطابق العدد (سيُرسم المقطع الداخلي نسبيًا على أي حال).</p>';
  return h+'<div class="bar" style="margin-top:6px"><button class="btn ghost sm" type="button" data-a="byadd" data-sk="'+k+'">+ إضافة تقسيم</button><button class="btn gold sm" type="button" data-a="byauto2" data-sk="'+k+'">توزيع تلقائي (كل بابين)</button><button class="btn ghost sm" type="button" data-a="byauto1" data-sk="'+k+'">تقسيم لكل باب</button><button class="btn ghost sm" type="button" data-a="byclr" data-sk="'+k+'">إلغاء التقسيم المخصص</button></div></div>';
}
function secEditor(k,d,name){
  var t=ftype(d,name);if(!hasInt(t))return '';
  if(t!==FT[1])return secEditor0(k,d,name);
  var be=bayEditor(k,d,name);
  return (d.bays&&d.bays.length)?be:be+secEditor0(k,d,name);
}
function bayItem(t,ds){var dd=getScope(scOrderId).items[t.dataset.bk];return dd&&dd.bays&&dd.bays[+t.dataset.bi]?{dd:dd,by:dd.bays[+t.dataset.bi]}:null;}
function bayApply(t){
  var r=bayItem(t);if(!r)return false;
  var by=r.by,f=t.dataset.bf,v=(t.type==='checkbox')?t.checked:t.value,c=by.cols&&by.cols[+t.dataset.bc],p=c&&c.parts&&c.parts[+t.dataset.bp],tp;
  if(f==='span')by.span=Math.max(1,parseInt(v,10)||1);
  else if(f==='tpl'){var m=bayMake(v);if(m){by.tpl=v;by.top=m.top;by.cols=m.cols;}}
  else if(f==='topon'){tp=by.top||(by.top={on:false,h:40,n:0});tp.on=!!v;}
  else if(f==='toph'){tp=by.top||(by.top={on:true,h:40,n:0});tp.h=v;}
  else if(f==='topn'){tp=by.top||(by.top={on:true,h:40,n:0});tp.n=v;}
  else if(f==='cf'&&c)c.f=v;
  else if(f==='pp'&&p)p.p=v;
  else if(f==='pn'&&p)p.n=v;
  else if(f==='ph'&&p)p.h=v;
  return true;
}
function bayAct(ac,b,o){
  var sk=b.dataset.sk,dd=getScope(o.id).items[sk],bx=$('scBody').querySelector('.fv3[data-sk="'+sk+'"]');
  if(!dd||!bx)return;
  var n=scDoorN(dd,bx.dataset.nm),bi=+b.dataset.bi,cj=+b.dataset.bc,pi=+b.dataset.bp,by=dd.bays&&dd.bays[bi],cl=by&&by.cols&&by.cols[cj],tm;
  if(ac==='dstog'){
    var sd=doorSides(dd.dsm||'mid',dd.dsl,n),i=+b.dataset.i;
    sd[i]=(sd[i]==='R')?'L':'R';dd.dsl=sd;dd.dsm='custom';
  }
  else if(ac==='bydoors'){dd.doors=+b.dataset.n;if(dd.dsm==='custom'&&dd.dsl)dd.dsl=doorSides('custom',dd.dsl,+b.dataset.n);}
  else if(ac==='byauto2')dd.bays=bayAuto(n,2);
  else if(ac==='byauto1')dd.bays=bayAuto(n,1);
  else if(ac==='byclr')dd.bays=[];
  else if(ac==='byadd'){dd.bays=dd.bays||[];dd.bays.push(bayNew(1,'tpS'));}
  else if(ac==='bydel'&&dd.bays)dd.bays.splice(bi,1);
  else if(ac==='bycoladd'&&by){by.cols=by.cols||[];by.cols.push({f:1,parts:[{p:'shelves',n:3,h:''}]});}
  else if(ac==='bycoldel'&&by&&by.cols&&by.cols.length>1)by.cols.splice(cj,1);
  else if(ac==='bypadd'&&cl){cl.parts=cl.parts||[];cl.parts.push({p:'shelves',n:2,h:''});}
  else if(ac==='bypdel'&&cl&&cl.parts)cl.parts.splice(pi,1);
  else if(ac==='bypup'&&cl&&cl.parts&&pi>0){tm=cl.parts[pi];cl.parts[pi]=cl.parts[pi-1];cl.parts[pi-1]=tm;}
  else if(ac==='bypdn'&&cl&&cl.parts&&pi<cl.parts.length-1){tm=cl.parts[pi];cl.parts[pi]=cl.parts[pi+1];cl.parts[pi+1]=tm;}
  var yy=window.scrollY;renderScope();window.scrollTo(0,yy);schedSave();
}
function secEditor0(k,d,name){
  var t=ftype(d,name);if(!hasInt(t))return '';
  var h='<div style="margin-top:12px"><b>التقسيم الداخلي</b> <span class="hint">— الأقسام مرتبة من اليسار إلى اليمين كما في رسم المقطع الداخلي، وترك العرض فارغًا يوزّع المتبقي بالتساوي</span>';
  if(!d.secs||!d.secs.length){
    return h+'<p class="hint">يستخدم الرسم الآن تقسيمًا مقترحًا حسب النوع والطول. اضغط «تخصيص التقسيم» لتحديد عدد الأقسام ونوع كل قسم وعدد الرفوف.</p><div class="bar"><button class="btn ghost sm" type="button" data-a="secdef" data-sk="'+k+'">تخصيص التقسيم</button><button class="btn gold sm" type="button" data-a="secmixnew" data-sk="'+k+'">🧩 تقسيم حسب طلب العميل (رفوف + شماعة + أدراج بنفس الفتحة)</button></div></div>';
  }
  d.secs.forEach(function(sc,i){
    var kd=sc.k||'shelves',a='data-sec="'+k+'" data-si="'+i+'"';
    var nPh=kd==='hang'?'رف علوي (0 أو 1)':kd==='drawers'?'عدد الأدراج':'عدد الرفوف';
    h+='<div class="bar" style="gap:8px;margin-bottom:6px;align-items:center"><b style="min-width:52px">قسم '+(i+1)+'</b>'+
      '<select '+a+' data-sf="k" style="width:170px" aria-label="نوع القسم">'+SECK.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===kd?' selected':'')+'>'+x[1]+'</option>';}).join('')+'</select>'+
      '<input type="number" min="0" step="any" '+a+' data-sf="w" placeholder="العرض سم (تلقائي)" style="width:150px" value="'+esc(sc.w==null?'':sc.w)+'" aria-label="عرض القسم">'+
      ((kd==='hang2'||kd==='empty'||kd==='mix')?'':'<input type="number" min="0" step="1" '+a+' data-sf="n" placeholder="'+nPh+'" style="width:130px" value="'+esc(sc.n==null?'':sc.n)+'" aria-label="'+nPh+'">')+
      (kd==='combo'?'<input type="number" min="0" step="1" '+a+' data-sf="m" placeholder="عدد الأدراج" style="width:110px" value="'+esc(sc.m==null?'':sc.m)+'" aria-label="عدد الأدراج">':'')+
      (kd!=='mix'?'<button class="btn ghost sm" type="button" data-a="secmix" data-sk="'+k+'" data-si="'+i+'">🧩 تقسيم مخصص</button>':'')+'<button class="btn sm red" type="button" data-a="secdel" data-sk="'+k+'" data-si="'+i+'" aria-label="حذف القسم">×</button></div>';
    if(kd==='mix')h+=mixEditor(k,i,sc);
  });
  return h+'<div class="bar" style="margin-top:6px"><button class="btn ghost sm" type="button" data-a="secadd" data-sk="'+k+'">+ إضافة قسم</button><button class="btn gold sm" type="button" data-a="secmixnew" data-sk="'+k+'">🧩 + قسم حسب طلب العميل</button><button class="btn ghost sm" type="button" data-a="secdef" data-sk="'+k+'">استعادة التقسيم المقترح</button><button class="btn ghost sm" type="button" data-a="secclr" data-sk="'+k+'">العودة للتلقائي</button></div></div>';
}
function scDraw(d,name){
  var t=ftype(d,name),L=num(d.l),W=num(d.w),H=num(d.h),r=fdef(t,d,L),ok=L>0&&W>0&&H>0;
  var secs=(ok&&hasInt(t))?getSecs(d,t,L,r):null,lay=secs?secLayout(secs,L,H):null;
  return '<div class="scviews">'+furnSvg(t,L,W,H,r)+
    rectSvg(d.l,d.h,'الطول','الارتفاع','الواجهة الأمامية',frontPlan(t,r))+
    rectSvg(d.w,d.h,'العرض','الارتفاع','الواجهة الجانبية')+
    rectSvg(d.l,d.w,'الطول','العرض','المسقط الأفقي')+
    (lay?interiorSvg(t,L,H,secs,lay,d.sf):'')+'</div>'+
    (ok?'<div class="scdet"><b>تفاصيل المجسم:</b> '+esc(t)+' — '+esc(furnDesc(t,r))+
      (lay?'<br><b>التقسيم الداخلي (من اليسار):</b> '+esc(secDesc(secs,lay))+(lay.note?'<br><b>تنبيه:</b> '+esc(lay.note):''):'')+'</div>':'');
}

function renderScope(){
  var list=orders.filter(function(o){return o.status!==STATUS[5];}).sort(function(a,b){return (b.orderDate||'').localeCompare(a.orderDate||'')||(b.orderNo||'').localeCompare(a.orderNo||'');});
  var cur=orderBy(scOrderId);
  if(!cur||cur.status===STATUS[5])scOrderId=list[0]?list[0].id:null;
  var sel=$('scOrder');
  sel.innerHTML=list.length?list.map(function(o){return '<option value="'+o.id+'">'+esc(o.orderNo+' — '+o.custName)+'</option>';}).join(''):'<option value="">لا توجد طلبات</option>';
  sel.value=scOrderId||'';
  var el=$('scBody'),o=orderBy(scOrderId);
  if(!o){el.innerHTML='<div class="card"><div class="empty">سجّل طلبًا أولًا ثم ارجع هنا لمراجعة نطاق العمل مع العميل.</div></div>';return;}
  var sc=getScope(o.id),us=mfgUnits(o);
  var h='<div class="card"><h2>بيانات المراجعة — '+esc(o.orderNo)+' ('+esc(o.custName)+')</h2><div class="grid">'+
    '<div><label for="scSt">حالة المراجعة</label><select id="scSt" data-o="status">'+SCS.map(function(s){return '<option'+(s===sc.status?' selected':'')+'>'+s+'</option>';}).join('')+'</select></div>'+
    '<div><label for="scDt">تاريخ المراجعة</label><input id="scDt" type="date" data-o="date" value="'+esc(sc.date)+'"></div>'+
    '<div class="wide"><label for="scBy">اسم من راجع النطاق مع العميل</label><input id="scBy" data-o="by" value="'+esc(sc.by)+'"></div>'+
    '<div class="full"><label for="scNote">ملاحظات العميل / التعديلات المطلوبة</label><textarea id="scNote" data-o="note">'+esc(sc.note)+'</textarea></div></div>'+
    ordImgStrip(o)+panoSection(sc)+
    '<div class="bar" style="margin-top:12px"><button class="btn ghost" data-a="scparse" type="button">استخراج الأبعاد من حقل «المقاس» في الطلب</button><label style="display:inline-flex;align-items:center;gap:6px;font-weight:600">صورة المجسم في الطباعة <select id="scPrMode" style="width:auto;min-height:34px"><option value="auto">حسب إعداد كل صنف</option><option value="day">وضع النهار</option><option value="night">وضع الليل</option><option value="both">النهار والليل معًا</option></select></label><button class="btn" data-a="scvideo" type="button">🎬 فيديو عرض الطلب (موشن جرافيك)</button><button class="btn gold" data-a="scprint" type="button">طباعة نموذج المراجعة للتوقيع</button></div></div>';
  if(!us.length)h+='<div class="card"><div class="empty">لا توجد أصناف بكميات في هذا الطلب.</div></div>';
  var sKeys=us.map(scKey),sk=scSel[o.id];
  if(sKeys.indexOf(sk)<0)sk=sKeys[0];
  scSel[o.id]=sk;
  if(us.length){
    var okN=0,tiles=us.map(function(u){
      var d=scItem(sc,u),k=scKey(u),on=k===sk,done=num(d.l)>0&&num(d.w)>0&&num(d.h)>0;
      if(done)okN++;
      return '<button type="button" class="sctile" data-a="scpick" data-sk="'+k+'" aria-pressed="'+(on?'true':'false')+'" title="'+esc(u.name)+'">'+
        (u.qty>1?'<span class="scq">×'+fmt(u.qty)+'</span>':'')+(done?'<span class="scok" title="تم إدخال المقاسات">✓</span>':'')+
        scIcon(ftype(d,u.name),u.name)+'<b>'+esc(u.name)+'</b><em>'+(done?'المقاسات مُدخلة':'بانتظار المقاسات')+'</em></button>';
    }).join('');
    h+='<div class="card"><div class="scpick-h"><h2>أصناف الطلب</h2><small>اختر صنفًا لمراجعته — '+okN+' من '+us.length+' بمقاسات مُدخلة</small></div><div class="scpick" role="group" aria-label="أصناف الطلب">'+tiles+'</div></div>';
  }
  us.forEach(function(u){
    var d=scItem(sc,u),k=scKey(u),ref=(u.p?u.p.size:u.l.size)||'';
    if(k!==sk)return;
    function g(key,lab){return '<div><label>'+lab+'</label><input type="number" min="0" step="1" placeholder="تلقائي" data-sk="'+k+'" data-k="'+key+'" value="'+esc(d[key])+'"></div>';}
    function f(key,lab){return '<div><label>'+lab+'</label><input type="number" min="0" step="any" data-sk="'+k+'" data-k="'+key+'" value="'+esc(d[key])+'"></div>';}
    h+='<div class="card"><h2>'+esc(u.name)+' <small>— الكمية '+fmt(u.qty)+'</small></h2>'+
      (ref?'<p class="hint">المقاس المسجل في الطلب: '+esc(ref)+(u.p&&u.p.color?' — '+esc(u.p.color):'')+'</p>':'')+
      '<div class="grid">'+f('l','الطول (سم)')+f('w','العرض (سم)')+f('h','الارتفاع (سم)')+
      '<div class="wide"><label>نوع الأثاث (يحدد شكل المجسم)</label><select data-sk="'+k+'" data-k="type">'+FT.map(function(x){return '<option'+(x===ftype(d,u.name)?' selected':'')+'>'+x+'</option>';}).join('')+'</select></div>'+
      g('doors','عدد الأبواب')+g('drawers','عدد الأدراج')+g('shelves','أرفف / وسائد')+
      '<div class="wide"><label>ملاحظات (سماكة، فتحات، تفاصيل)</label><input data-sk="'+k+'" data-k="note" value="'+esc(d.note)+'"></div></div>'+doorEditor(k,d,u.name)+secEditor(k,d,u.name)+catSlots(k,d)+galSlots(k,d)+
      '<div class="fv3" data-sk="'+k+'" data-nm="'+esc(u.name)+'" data-col="'+esc(u.p&&u.p.color||'')+'"></div>'+
      (us.length>1?'<div class="scnav">'+
        '<button type="button" class="btn ghost" data-a="scnav" data-d="-1"'+(sKeys.indexOf(k)===0?' disabled':'')+'>› الصنف السابق</button>'+
        '<button type="button" class="btn" data-a="scnav" data-d="1"'+(sKeys.indexOf(k)===sKeys.length-1?' disabled':'')+'>الصنف التالي ‹</button></div>':'')+
      '</div>';
  });
  if(us.length)h+='<div class="card plancard" id="planBox">'+planBoxHtml(o)+'</div>';
  el.innerHTML=h;
  var stl=el.querySelector('.sctile[aria-pressed="true"]');if(stl&&stl.scrollIntoView)stl.scrollIntoView({inline:'nearest',block:'nearest'});
  Array.prototype.forEach.call(el.querySelectorAll('.fv3'),function(hh){fvMount(hh,sc.items[hh.dataset.sk],hh.dataset.nm);});
}
function secPrint(d,u){
  var t=ftype(d,u.name),L=num(d.l),W=num(d.w),H=num(d.h);
  if(!(L>0&&W>0&&H>0)||!hasInt(t)||!((d.secs&&d.secs.length)||(d.bays&&d.bays.length)))return '';
  var r=fdef(t,d,L),secs=getSecs(d,t,L,r),lay=secLayout(secs,L,H);if(!lay)return '';
  return '<table class="kv"><tr><td>التقسيم الداخلي (من اليسار)</td><td colspan="5">'+esc(secDesc(secs,lay))+(lay.note?'<br>'+esc(lay.note):'')+'</td></tr></table>'+
    '<div style="text-align:center;margin:6px 0">'+interiorSvg(t,L,H,secs,lay,d.sf)+'</div>';
}
function printScope(o){
  var sc=getScope(o.id),us=mfgUnits(o);
  var h='<h2>نموذج مراجعة نطاق العمل مع العميل</h2>'+kv([['رقم الطلب',o.orderNo,'العميل',o.custName,'التليفون',o.phone],['موقع التركيب',(o.address||'')+' '+(o.area||''),'تاريخ المراجعة',sc.date||'','حالة المراجعة',sc.status]])+ordImgsLarge(o)+panoPrint(sc)+planPrint(o);
  us.forEach(function(u){
    var d=scItem(sc,u);
    h+='<div class="brk"><div style="display:flex;gap:8px;align-items:flex-start">'+pImg(lineImg(u.l),'width:84px;height:84px;flex:none')+'<div style="flex:1;min-width:0"><table class="kv"><tr><td>الصنف</td><td>'+esc(u.name)+'</td><td>الكمية</td><td>'+fmt(u.qty)+'</td><td>الأبعاد (سم)</td><td>'+(num(d.l)>0?esc(d.l)+' × '+esc(d.w)+' × '+esc(d.h)+' (طول × عرض × ارتفاع)':'غير محددة')+'</td></tr>'+(d.note?'<tr><td>ملاحظات</td><td colspan="5">'+esc(d.note)+'</td></tr>':'')+'</table></div></div>'+czPrint(d)+secPrint(d,u)+catPrint(d)+galPrint(d)+fvSnap(scKey(u),d,u.name)+'</div>';
  });
  if(sc.note)h+=kv([['ملاحظات العميل',sc.note]]);
  h+='<p>أقرّ بأنني راجعت المقاسات والمجسم أعلاه ووافقت عليها كنطاق للتنفيذ.</p>'+sigs(['توقيع العميل','مندوب المبيعات','المراجع','مدير الإنتاج']);
  openSheet(h);
}

/* ================= صور طلب العميل 360° / VR (عارض بانوراما بدون مكتبات خارجية) ================= */
function panoKind(p){var m=p.mode||'auto';if(m==='360')return '360';if(m==='flat')return 'flat';return (p.w&&p.h&&Math.abs(p.w/p.h-2)<0.12)?'360':'flat';}
function panoSection(sc){
  var a=sc.pano||[];
  var h='<div class="panocard"><h3>🌐 صور طلب العميل (عرض 360° / VR)</h3>'+
    '<p class="hint">ارفع صور الطلب — غرفة نوم أو أي صنف — ثم اضغط على الصورة لتتصفحها كبانوراما 360° بالسحب أو بحساس حركة الجوال أو بنظارة VR. أفضل نتيجة مع صور بنسبة 2:1 (كاميرا 360° أو وضع Panorama في الجوال)، والصور العادية تُعرض بتكبير وتحريك.</p>'+
    '<div class="bar"><button class="btn" data-a="panoadd" type="button">+ رفع صور الطلب</button></div>';
  if(a.length)h+='<div class="panolist">'+a.map(function(p,i){
    var k=panoKind(p),m=p.mode||'auto';
    return '<div class="panoit"><button type="button" class="panoth" data-a="panoview" data-i="'+i+'" aria-label="عرض الصورة"><img src="'+p.src+'" alt=""><span class="panobadge">'+(k==='360'?'360°':'صورة')+'</span><span class="panoplay">▶ '+(k==='360'?'عرض 360° / VR':'عرض وتكبير')+'</span></button>'+
      '<input data-pcap="'+i+'" value="'+esc(p.cap||'')+'" placeholder="وصف الصورة (غرفة نوم، ركنة...)" aria-label="وصف الصورة">'+
      '<select data-pmode="'+i+'" aria-label="نوع العرض"><option value="auto"'+(m==='auto'?' selected':'')+'>نوع العرض: تلقائي</option><option value="360"'+(m==='360'?' selected':'')+'>بانوراما 360°</option><option value="flat"'+(m==='flat'?' selected':'')+'>صورة عادية</option></select>'+
      '<button class="btn sm red" data-a="panorm" data-i="'+i+'" type="button">حذف</button></div>';
  }).join('')+'</div>';
  return h+'</div>';
}
function panoPrint(sc){
  var a=sc.pano||[];if(!a.length)return '';
  return '<h3 style="margin:10px 0 4px">صور الطلب (بانوراما 360° / VR)</h3><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px">'+
    a.map(function(p){return '<figure style="margin:0;page-break-inside:avoid"><img src="'+p.src+'" alt="" style="width:100%;max-height:75mm;object-fit:contain;background:#f6f3ef;border:1px solid #444;display:block"><figcaption style="text-align:center">'+esc(p.cap||'')+(panoKind(p)==='360'?' — صورة 360° (تُعرض في العارض الإلكتروني)':'')+'</figcaption></figure>';}).join('')+'</div>';
}
function panoRead(file,cb){
  if(!/^image\//.test(file.type)){cb(null);return;}
  var r=new FileReader();
  r.onload=function(){
    var im=new Image();
    im.onload=function(){
      var is360=Math.abs(im.width/im.height-2)<0.12,mx=is360?4096:2400,sc=Math.min(1,mx/Math.max(im.width,im.height));
      var w=Math.max(1,Math.round(im.width*sc)),h=Math.max(1,Math.round(im.height*sc)),c=document.createElement('canvas');
      c.width=w;c.height=h;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(im,0,0,w,h);
      cb({src:c.toDataURL('image/jpeg',is360?0.86:0.82),w:w,h:h});
    };
    im.onerror=function(){toast('تعذر قراءة الصورة');cb(null);};
    im.src=r.result;
  };
  r.onerror=function(){cb(null);};
  r.readAsDataURL(file);
}
function panoScopeAct(o,b){
  var sc=getScope(o.id),ac=b.dataset.a,i=+b.dataset.i;
  if(ac==='panoview'){panoOpen(sc.pano||[],i);return;}
  if(ac==='panorm'){
    if(!b.dataset.armed){b.dataset.armed='1';b.textContent='تأكيد الحذف';setTimeout(function(){if(b.isConnected){delete b.dataset.armed;b.textContent='حذف';}},3000);return;}
    (sc.pano||[]).splice(i,1);var y=window.scrollY;renderScope();window.scrollTo(0,y);schedSave();return;
  }
  if(ac==='panoadd'){
    var f=document.createElement('input');f.type='file';f.accept='image/*';f.multiple=true;
    f.onchange=function(){
      var fs=[].slice.call(f.files||[]);if(!fs.length)return;
      var left=fs.length,added=0;toast('جارٍ تجهيز الصور…');
      fs.forEach(function(file){panoRead(file,function(r){
        left--;
        if(r){(sc.pano=sc.pano||[]).push({id:uid(),src:r.src,w:r.w,h:r.h,cap:file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ')});added++;}
        if(!left){var y=window.scrollY;renderScope();window.scrollTo(0,y);schedSave();toast(added?'تم رفع '+added+' صورة':'لم تُرفع أي صورة');}
      });});
    };
    f.click();
  }
}
var PV=null;
function pvClamp(v,a,b){return v<a?a:v>b?b:v;}
function pvQ(x,y,z,w){return [x,y,z,w];}
function pvQAxis(ax,an){var s=Math.sin(an/2);return [ax[0]*s,ax[1]*s,ax[2]*s,Math.cos(an/2)];}
function pvQMul(a,b){return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
function pvRot(q,v){
  var x=v[0],y=v[1],z=v[2],qx=q[0],qy=q[1],qz=q[2],qw=q[3];
  var ix=qw*x+qy*z-qz*y,iy=qw*y+qz*x-qx*z,iz=qw*z+qx*y-qy*x,iw=-qx*x-qy*y-qz*z;
  return [ix*qw+iw*-qx+iy*-qz-iz*-qy,iy*qw+iw*-qy+iz*-qx-ix*-qz,iz*qw+iw*-qz+ix*-qy-iy*-qx];
}
function pvGyroYawPitch(o){
  var D=Math.PI/180,a=(o.alpha||0)*D,b=(o.beta||0)*D,g=(o.gamma||0)*D;
  var so=((screen.orientation&&screen.orientation.angle!=null)?screen.orientation.angle:(window.orientation||0))*D;
  var q=pvQMul(pvQMul(pvQAxis([0,1,0],a),pvQAxis([1,0,0],b)),pvQAxis([0,0,1],-g));
  q=pvQMul(q,pvQ(-Math.SQRT1_2,0,0,Math.SQRT1_2));
  q=pvQMul(q,pvQAxis([0,0,1],-so));
  var f=pvRot(q,[0,0,-1]);
  return {yaw:Math.atan2(f[0],-f[2]),pitch:Math.asin(pvClamp(f[1],-1,1))};
}
function panoBuild(){
  var el=document.createElement('div');el.id='panoV';el.setAttribute('role','dialog');el.setAttribute('aria-label','عارض الصور 360');
  el.innerHTML='<div class="pv-stage"><canvas class="pv-cv"></canvas><div class="pv-flat"><img alt="" draggable="false"></div></div><div class="pv-vrline"></div>'+
    '<div class="pv-top"><b class="pv-title"></b><span class="pv-cnt"></span><button type="button" data-p="close" aria-label="إغلاق">✕</button></div>'+
    '<div class="pv-hint"></div>'+
    '<div class="pv-bar">'+
    '<button type="button" data-p="prev" aria-label="السابق">›</button><button type="button" data-p="next" aria-label="التالي">‹</button>'+
    '<button type="button" data-p="zin" aria-label="تكبير">＋</button><button type="button" data-p="zout" aria-label="تصغير">－</button>'+
    '<button type="button" data-p="auto" title="دوران تلقائي">⟳ تلقائي</button>'+
    '<button type="button" data-p="gyro" title="التحكم بحركة الجوال">🧭 حساس الحركة</button>'+
    '<button type="button" data-p="vr" title="وضع نظارة VR (شاشة مقسومة)">🥽 VR</button>'+
    '<button type="button" data-p="full" title="ملء الشاشة">⛶</button></div>';
  document.body.appendChild(el);
  PV={el:el,stage:el.querySelector('.pv-stage'),cv:el.querySelector('.pv-cv'),flat:el.querySelector('.pv-flat'),fimg:el.querySelector('.pv-flat img'),
    ptrs:{},yaw:0,pitch:0,fov:1.3,vx:0,vy:0,auto:false,gyro:false,vr:false,drag:false,kind:'360',FL:{s:1,x:0,y:0},gl:null,tex:null,list:[],idx:0};
  el.addEventListener('click',function(e){
    var b=e.target.closest('button[data-p]');if(!b)return;var a=b.dataset.p;
    if(a==='close')panoClose();
    else if(a==='prev')panoGo(-1);else if(a==='next')panoGo(1);
    else if(a==='zin')pvZoom(1.25);else if(a==='zout')pvZoom(0.8);
    else if(a==='auto'){PV.auto=!PV.auto;b.classList.toggle('on',PV.auto);}
    else if(a==='gyro')pvToggleGyro();
    else if(a==='vr')pvToggleVR();
    else if(a==='full')pvFull();
  });
  var st=PV.stage;
  st.addEventListener('pointerdown',function(e){
    PV.ptrs[e.pointerId]={x:e.clientX,y:e.clientY};try{st.setPointerCapture(e.pointerId);}catch(_){}
    PV.drag=true;PV.vx=PV.vy=0;PV.mt=0;if(Object.keys(PV.ptrs).length===2)PV.pd=pvDist();
  });
  st.addEventListener('pointermove',function(e){
    var p=PV.ptrs[e.pointerId];if(!p)return;
    var dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(Object.keys(PV.ptrs).length>=2){var d=pvDist();if(PV.pd&&d)pvZoom(d/PV.pd);PV.pd=d;return;}
    var now=performance.now(),dt=Math.max(0.008,(now-(PV.mt||now-16))/1000);PV.mt=now;
    if(PV.kind==='360'){
      var k=PV.fov/Math.max(1,st.clientHeight);
      PV.yaw-=dx*k;if(!PV.gyro)PV.pitch+=dy*k;
      PV.vx=pvClamp(-dx*k/dt,-3,3);PV.vy=PV.gyro?0:pvClamp(dy*k/dt,-3,3);
    }else{PV.FL.x+=dx;PV.FL.y+=dy;pvFlatApply();}
  });
  function up(e){
    delete PV.ptrs[e.pointerId];PV.pd=0;
    if(!Object.keys(PV.ptrs).length){PV.drag=false;if(performance.now()-(PV.mt||0)>90){PV.vx=PV.vy=0;}}
  }
  st.addEventListener('pointerup',up);st.addEventListener('pointercancel',up);
  st.addEventListener('wheel',function(e){e.preventDefault();pvZoom(Math.exp(-e.deltaY*0.0015));},{passive:false});
  st.addEventListener('dblclick',function(){if(PV.kind==='flat'){PV.FL={s:PV.FL.s>1.2?1:2.2,x:0,y:0};pvFlatApply();}});
  document.addEventListener('keydown',function(e){
    if(!PV||PV.el.style.display==='none')return;
    var k=e.key;
    if(k==='Escape')panoClose();
    else if(k==='ArrowLeft')PV.yaw-=0.08;else if(k==='ArrowRight')PV.yaw+=0.08;
    else if(k==='ArrowUp')PV.pitch+=0.06;else if(k==='ArrowDown')PV.pitch-=0.06;
    else if(k==='+'||k==='=')pvZoom(1.15);else if(k==='-')pvZoom(0.87);
  });
  document.addEventListener('fullscreenchange',function(){if(PV&&PV.vr&&!document.fullscreenElement){PV.vr=false;PV.el.classList.remove('vr');}});
}
function pvDist(){var k=Object.keys(PV.ptrs);if(k.length<2)return 0;var a=PV.ptrs[k[0]],b=PV.ptrs[k[1]];return Math.hypot(a.x-b.x,a.y-b.y);}
function pvZoom(m){
  if(PV.kind==='360')PV.fov=pvClamp(PV.fov/m,0.5,1.75);
  else{PV.FL.s=pvClamp(PV.FL.s*m,1,8);if(PV.FL.s===1){PV.FL.x=PV.FL.y=0;}pvFlatApply();}
}
function pvFlatApply(){var f=PV.FL;PV.fimg.style.transform='translate('+f.x+'px,'+f.y+'px) scale('+f.s+')';}
function pvFull(){
  var el=PV.el;
  if(document.fullscreenElement||document.webkitFullscreenElement){(document.exitFullscreen||document.webkitExitFullscreen).call(document);}
  else{var rq=el.requestFullscreen||el.webkitRequestFullscreen;if(rq)try{var r=rq.call(el);if(r&&r.catch)r.catch(function(){});}catch(_){}}
}
function pvToggleGyro(){
  var btn=PV.el.querySelector('[data-p=gyro]');
  if(PV.gyro){PV.gyro=false;window.removeEventListener('deviceorientation',PV.onOri);btn.classList.remove('on');PV.ori=null;return;}
  function start(){
    PV.ori=null;PV.onOri=function(ev){if(ev.alpha==null&&ev.beta==null)return;PV.ori=ev;};
    window.addEventListener('deviceorientation',PV.onOri);
    PV.gyro=true;PV.recenter=true;PV.yaw0=PV.yaw;btn.classList.add('on');
    setTimeout(function(){if(PV&&PV.gyro&&!PV.ori){toast('هذا الجهاز لا يدعم حساس الحركة. استخدم الجوال أو التابلت.');pvToggleGyro();if(PV.vr)pvToggleVR();}},1800);
  }
  var DO=window.DeviceOrientationEvent;
  if(DO&&typeof DO.requestPermission==='function'){DO.requestPermission().then(function(r){if(r==='granted')start();else toast('لم يُسمح بالوصول إلى حساسات الحركة');}).catch(function(){toast('تعذر تفعيل حساس الحركة');});}
  else start();
}
function pvToggleVR(){
  if(PV.kind!=='360')return;
  PV.vr=!PV.vr;PV.el.classList.toggle('vr',PV.vr);
  var btn=PV.el.querySelector('[data-p=vr]');btn.classList.toggle('on',PV.vr);
  if(PV.vr){
    PV.fovSave=PV.fov;PV.fov=1.5;
    var rq=PV.el.requestFullscreen||PV.el.webkitRequestFullscreen;
    if(rq&&!document.fullscreenElement)try{var r=rq.call(PV.el);if(r&&r.catch)r.catch(function(){});}catch(_){}
    try{if(screen.orientation&&screen.orientation.lock)screen.orientation.lock('landscape').catch(function(){});}catch(_){}
    if(!PV.gyro)pvToggleGyro();
    toast('ضع الجوال داخل نظارة VR (Cardboard) أفقيًا');
  }else{
    if(PV.fovSave)PV.fov=PV.fovSave;
    if(document.fullscreenElement)document.exitFullscreen();
    try{if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock();}catch(_){}
  }
}
function pvInitGL(){
  if(PV.gl)return true;
  var gl=null;try{gl=PV.cv.getContext('webgl')||PV.cv.getContext('experimental-webgl');}catch(_){}
  if(!gl)return false;
  var vs='attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}';
  var fs='#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nvarying vec2 v;uniform sampler2D t;uniform float asp,f,yaw,pit,k;\n'+
    'void main(){vec2 q=v;q*=1.+k*dot(q,q);vec3 d=normalize(vec3(q.x*asp*f,q.y*f,-1.));'+
    'float cp=cos(pit),sp=sin(pit);float y1=d.y*cp-d.z*sp;float z1=d.y*sp+d.z*cp;'+
    'float cy=cos(yaw),sy=sin(yaw);float x2=d.x*cy-z1*sy;float z2=d.x*sy+z1*cy;'+
    'float lon=atan(x2,-z2);float lat=asin(clamp(y1,-1.,1.));'+
    'gl_FragColor=texture2D(t,vec2(lon/6.2831853+.5,.5-lat/3.1415927));}';
  function sh(type,src){var o=gl.createShader(type);gl.shaderSource(o,src);gl.compileShader(o);return gl.getShaderParameter(o,gl.COMPILE_STATUS)?o:null;}
  var a=sh(gl.VERTEX_SHADER,vs),b=sh(gl.FRAGMENT_SHADER,fs);if(!a||!b)return false;
  var pr=gl.createProgram();gl.attachShader(pr,a);gl.attachShader(pr,b);gl.linkProgram(pr);
  if(!gl.getProgramParameter(pr,gl.LINK_STATUS))return false;
  gl.useProgram(pr);
  var buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  var loc=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  PV.gl=gl;PV.pr=pr;PV.u={asp:gl.getUniformLocation(pr,'asp'),f:gl.getUniformLocation(pr,'f'),yaw:gl.getUniformLocation(pr,'yaw'),pit:gl.getUniformLocation(pr,'pit'),k:gl.getUniformLocation(pr,'k'),t:gl.getUniformLocation(pr,'t')};
  return true;
}
function pvTex(img){
  var gl=PV.gl,mx=gl.getParameter(gl.MAX_TEXTURE_SIZE),src=img;
  if(img.width>mx||img.height>mx){
    var sc=Math.min(mx/img.width,mx/img.height),c=document.createElement('canvas');
    c.width=Math.floor(img.width*sc);c.height=Math.floor(img.height*sc);c.getContext('2d').drawImage(img,0,0,c.width,c.height);src=c;
  }
  if(PV.tex)gl.deleteTexture(PV.tex);
  PV.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,PV.tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
}
function panoOpen(list,idx){
  list=(list||[]).filter(function(p){return p&&p.src;});if(!list.length)return;
  if(!PV)panoBuild();
  PV.list=list;PV.idx=pvClamp(idx||0,0,list.length-1);
  PV.el.style.display='flex';PV.bodyOv=document.body.style.overflow;document.body.style.overflow='hidden';
  panoLoad();
  cancelAnimationFrame(PV.raf);PV.t=0;PV.raf=requestAnimationFrame(pvFrame);
}
function panoGo(d){var n=PV.list.length;PV.idx=(PV.idx+d+n)%n;panoLoad();}
function panoLoad(){
  var p=PV.list[PV.idx],kind=panoKind(p);
  PV.el.classList.toggle('one',PV.list.length<2);
  PV.el.querySelector('.pv-title').textContent=p.cap||'صورة الطلب';
  PV.el.querySelector('.pv-cnt').textContent=PV.list.length>1?(PV.idx+1)+' / '+PV.list.length:'';
  if(kind==='360'&&!pvInitGL()){kind='flat';toast('المتصفح لا يدعم WebGL: تُعرض الصورة بشكل عادي');}
  PV.kind=kind;PV.el.classList.toggle('flat',kind==='flat');
  PV.cv.style.display=kind==='360'?'block':'none';PV.flat.style.display=kind==='flat'?'flex':'none';
  PV.el.querySelector('.pv-hint').textContent=kind==='360'?'اسحب للدوران • العجلة أو قرص بإصبعين للتكبير • 🧭 حساس الحركة • 🥽 نظارة VR':'اسحب لتحريك الصورة • العجلة أو قرص بإصبعين للتكبير • نقرتان للتكبير السريع';
  if(PV.vr&&kind!=='360')pvToggleVR();
  var im=new Image();
  im.onload=function(){
    if(PV.list[PV.idx]!==p)return;
    if(kind==='360'){PV.yaw=0;PV.pitch=0;PV.fov=PV.vr?1.5:1.3;PV.vx=PV.vy=0;if(PV.gyro){PV.recenter=true;PV.yaw0=0;}pvTex(im);}
    else{PV.fimg.src=p.src;PV.FL={s:1,x:0,y:0};pvFlatApply();}
  };
  im.src=p.src;
}
function pvFrame(ts){
  if(!PV||PV.el.style.display==='none')return;
  PV.raf=requestAnimationFrame(pvFrame);
  var dt=Math.min(0.05,(ts-(PV.t||ts))/1000);PV.t=ts;
  if(PV.kind!=='360'||!PV.gl||!PV.tex)return;
  var cv=PV.cv,dpr=Math.min(2,window.devicePixelRatio||1),W=Math.floor(cv.clientWidth*dpr),H=Math.floor(cv.clientHeight*dpr);
  if(W<2||H<2)return;
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
  var Y,P;
  if(PV.gyro&&PV.ori){
    var g=pvGyroYawPitch(PV.ori);
    if(PV.recenter){PV.yaw=PV.yaw0-g.yaw;PV.recenter=false;}
    Y=g.yaw+PV.yaw;P=g.pitch;
  }else{
    if(!PV.drag){
      if(PV.auto)PV.yaw+=dt*0.18;
      PV.yaw+=PV.vx*dt;PV.pitch+=PV.vy*dt;
      var dk=Math.pow(0.03,dt);PV.vx*=dk;PV.vy*=dk;
    }
    PV.pitch=pvClamp(PV.pitch,-1.55,1.55);Y=PV.yaw;P=PV.pitch;
  }
  var gl=PV.gl,u=PV.u;
  gl.bindTexture(gl.TEXTURE_2D,PV.tex);gl.uniform1i(u.t,0);
  gl.uniform1f(u.f,Math.tan(PV.fov/2));gl.uniform1f(u.yaw,Y);gl.uniform1f(u.pit,P);
  if(PV.vr){
    var hw=Math.floor(W/2);gl.uniform1f(u.k,0.2);gl.uniform1f(u.asp,hw/H);
    gl.viewport(0,0,hw,H);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    gl.viewport(hw,0,W-hw,H);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }else{
    gl.uniform1f(u.k,0);gl.uniform1f(u.asp,W/H);gl.viewport(0,0,W,H);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
}
function panoClose(){
  if(!PV)return;
  cancelAnimationFrame(PV.raf);
  if(PV.gyro)pvToggleGyro();
  if(PV.vr){PV.vr=false;PV.el.classList.remove('vr');PV.el.querySelector('[data-p=vr]').classList.remove('on');try{if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock();}catch(_){}}
  PV.auto=false;PV.el.querySelector('[data-p=auto]').classList.remove('on');
  if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen();
  PV.el.style.display='none';document.body.style.overflow=PV.bodyOv||'';
}

/* ================= مخطط توزيع الأصناف داخل الغرفة (خيارات تُعرض على العميل) ================= */
var PLC=['#c9a26b','#7da0a6','#b57c7c','#8fa87a','#9a86b8','#d1b34f','#6f9bd1','#c78a5a'];
var planSel=null,PLUID=0,PD=null,PP=null;
function planUnits(o){
  var sc=getScope(o.id);
  return mfgUnits(o).map(function(u,i){
    var d=scItem(sc,u),L=num(d.l),D=num(d.w),est=false;
    if(!(L>0&&D>0)){
      var ps=parseSize(u.p?u.p.size:u.l.size);
      if(ps&&ps[0]>0&&ps[1]>0){L=ps[0];D=ps[1];}else{L=L>0?L:100;D=D>0?D:60;est=true;}
    }
    return {k:scKey(u),name:u.name||u.code||'صنف',L:L,D:D,qty:u.qty,est:est,col:PLC[i%PLC.length],d:d,u:u};
  });
}
function planBox_(it,ps){var q=((ps.r||0)%180)!==0;return {w:q?it.D:it.L,h:q?it.L:it.D};}
function planAutoPlace(p,us,op){
  var x=10,y=10,rowH=0;
  us.forEach(function(it){var ps=op.pos[it.k];if(ps){var b=planBox_(it,ps);y=Math.max(y,ps.y+b.h+10);}});
  us.forEach(function(it){
    if(op.pos[it.k])return;
    if(x+it.L>p.rw-10&&x>10){x=10;y+=rowH+10;rowH=0;}
    op.pos[it.k]={x:x,y:y,r:0};x+=it.L+10;rowH=Math.max(rowH,it.D);
  });
}
function getPlan(sc,us){
  var p=sc.plan;
  if(!p)p=sc.plan={rw:400,rl:350,snap:1,opts:[],marks:[],cur:0,chosen:''};
  if(!p.opts.length)p.opts.push({id:uid(),name:'الوضع الحالي',note:'',pos:{}});
  if(!(p.cur>=0&&p.cur<p.opts.length))p.cur=0;
  p.opts.forEach(function(op){if(!op.pos)op.pos={};planAutoPlace(p,us,op);});
  return p;
}
function planIssues(p,us,op){
  var bad={},out={},b=[],i,j,a,c;
  us.forEach(function(it){var ps=op.pos[it.k];if(!ps)return;var q=planBox_(it,ps);b.push({k:it.k,x:ps.x,y:ps.y,w:q.w,h:q.h});});
  for(i=0;i<b.length;i++){
    a=b[i];
    if(a.x<-0.5||a.y<-0.5||a.x+a.w>p.rw+0.5||a.y+a.h>p.rl+0.5)out[a.k]=1;
    for(j=i+1;j<b.length;j++){c=b[j];if(a.x<c.x+c.w-0.5&&c.x<a.x+a.w-0.5&&a.y<c.y+c.h-0.5&&c.y<a.y+a.h-0.5){bad[a.k]=1;bad[c.k]=1;}}
  }
  return {bad:bad,out:out};
}
function planTf(it,ps){
  var q=planBox_(it,ps),cx=ps.x+q.w/2,cy=ps.y+q.h/2,r=ps.r||0;
  return {a:'translate('+cx+','+cy+') rotate('+r+')',s:'translate('+cx+'px,'+cy+'px) rotate('+r+'deg)',lb:'rotate('+(-r)+'deg)',lba:'rotate('+(-r)+')'};
}
function planMoved(p,us,idx){
  if(!idx)return [];var op=p.opts[idx],o0=p.opts[0];
  return us.filter(function(it){
    var a=o0.pos[it.k],b=op.pos[it.k];if(!a||!b)return false;
    return Math.abs(a.x-b.x)>=1||Math.abs(a.y-b.y)>=1||((a.r||0)%360)!==((b.r||0)%360);
  });
}
function planGhostHtml(p,us,idx,n){
  var h='';
  planMoved(p,us,idx).forEach(function(it){
    var a=p.opts[0].pos[it.k],b=p.opts[idx].pos[it.k],ba=planBox_(it,a),bb=planBox_(it,b);
    var ax=a.x+ba.w/2,ay=a.y+ba.h/2,bx=b.x+bb.w/2,by=b.y+bb.h/2;
    h+='<rect x="'+a.x+'" y="'+a.y+'" width="'+ba.w+'" height="'+ba.h+'" fill="none" stroke="#b33" stroke-width="3" stroke-dasharray="9 6" rx="4"/>'+
      '<line x1="'+ax+'" y1="'+ay+'" x2="'+bx+'" y2="'+by+'" stroke="#b33" stroke-width="3" stroke-dasharray="3 6" marker-end="url(#plar'+n+')"/>';
  });
  return h;
}
function planMarkRect(p,m){
  var L=num(m.len)||90,t=14;
  if(m.wall==='t')return {x:m.pos,y:-t/2,w:L,h:t};
  if(m.wall==='b')return {x:m.pos,y:p.rl-t/2,w:L,h:t};
  if(m.wall==='l')return {x:-t/2,y:m.pos,w:t,h:L};
  return {x:p.rw-t/2,y:m.pos,w:t,h:L};
}
function planSvg(o,idx,cfg){
  cfg=cfg||{};
  var sc=getScope(o.id),us=planUnits(o),p=getPlan(sc,us),op=p.opts[idx]||p.opts[0],iss=planIssues(p,us,op);
  var rw=num(p.rw)||400,rl=num(p.rl)||350,m=46,fs=Math.max(9,Math.round(Math.min(rw,rl)/24)),n=++PLUID;
  var h='<svg class="plsvg'+(cfg.anim?' anim':'')+'" viewBox="'+(-m)+' '+(-m)+' '+(rw+2*m)+' '+(rl+2*m)+'" xmlns="http://www.w3.org/2000/svg">'+
    '<defs><pattern id="plg'+n+'" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#e6ddcf" stroke-width="1"/></pattern>'+
    '<marker id="plar'+n+'" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#b33"/></marker></defs>'+
    '<rect x="0" y="0" width="'+rw+'" height="'+rl+'" fill="url(#plg'+n+')" stroke="#3a2a1a" stroke-width="7"/>'+
    '<text x="'+(rw/2)+'" y="-16" text-anchor="middle" font-size="'+fs+'" fill="#555">'+fmt(rw)+' سم</text>'+
    '<text transform="translate('+(rw+26)+','+(rl/2)+') rotate(90)" text-anchor="middle" font-size="'+fs+'" fill="#555">'+fmt(rl)+' سم</text>';
  (p.marks||[]).forEach(function(mk){
    var r=planMarkRect(p,mk),door=mk.t==='door';
    h+='<g class="pl-mk'+(cfg.sel==='mk:'+mk.id?' sel':'')+'" data-id="'+mk.id+'"><rect x="'+r.x+'" y="'+r.y+'" width="'+r.w+'" height="'+r.h+'" fill="'+(door?'#a9744f':'#7fb6e8')+'" stroke="#333" stroke-width="2"/>'+
      '<text x="'+(r.x+r.w/2)+'" y="'+(r.y+r.h/2+fs*0.35)+'" text-anchor="middle" font-size="'+(fs*0.8)+'" fill="#111" stroke="#fff" stroke-width="2.5" paint-order="stroke" pointer-events="none">'+(door?'باب':'نافذة')+'</text></g>';
  });
  h+='<g class="pl-ghost">'+(cfg.ghost?planGhostHtml(p,us,idx,n):'')+'</g>';
  us.forEach(function(it){
    var ps=op.pos[it.k];if(!ps)return;
    var tf=planTf(it,ps),cls='pl-it'+((iss.bad[it.k]||iss.out[it.k])?' bad':'')+(cfg.sel===it.k?' sel':'');
    h+='<g class="'+cls+'" data-k="'+it.k+'" data-ang="'+(ps.r||0)+'" transform="'+tf.a+'" style="transform:'+tf.s+'">'+
      '<rect class="body" x="'+(-it.L/2)+'" y="'+(-it.D/2)+'" width="'+it.L+'" height="'+it.D+'" rx="4" fill="'+it.col+'"/>'+
      '<rect x="'+(-it.L/2)+'" y="'+(it.D/2-5)+'" width="'+it.L+'" height="5" fill="#3a2a1a" opacity=".55" pointer-events="none"/>'+
      '<g class="pl-lb" transform="'+tf.lba+'" style="transform:'+tf.lb+'"><text text-anchor="middle" y="'+(-fs*0.1)+'" font-size="'+fs+'" font-weight="700" fill="#1b1b1b" stroke="#fff" stroke-width="3" paint-order="stroke">'+esc(it.name)+(it.qty>1?' ×'+fmt(it.qty):'')+'</text>'+
      '<text text-anchor="middle" y="'+(fs*1.05)+'" font-size="'+(fs*0.8)+'" fill="#1b1b1b" stroke="#fff" stroke-width="2.5" paint-order="stroke">'+fmt(it.L)+'×'+fmt(it.D)+(it.est?'*':'')+'</text></g></g>';
  });
  return h+'</svg>';
}
function planWarnHtml(o){
  var sc=getScope(o.id),us=planUnits(o),p=getPlan(sc,us),op=p.opts[p.cur],iss=planIssues(p,us,op),h='';
  var nb=Object.keys(iss.bad).length,no=Object.keys(iss.out).length;
  if(nb)h+='<div class="note bad">⚠ يوجد تداخل بين أصناف في هذا الخيار ('+nb+' صنف) — الأصناف المتداخلة بإطار أحمر</div>';
  if(no)h+='<div class="note bad">⚠ '+no+' صنف خارج حدود الغرفة</div>';
  if(us.some(function(x){return x.est;}))h+='<p class="hint">* صنف بلا أبعاد مسجلة رُسم بمقاس تقديري، أدخل طوله وعرضه من بطاقته أعلاه ليُرسم بدقة.</p>';
  return h;
}
function planSelHtml(o){
  var sc=getScope(o.id),us=planUnits(o),p=getPlan(sc,us),op=p.opts[p.cur];
  var it=us.filter(function(x){return x.k===planSel;})[0];
  if(it){
    var ps=op.pos[it.k];
    return '<div class="grid" style="margin-top:8px"><div class="wide"><b>'+esc(it.name)+'</b> — '+fmt(it.L)+' × '+fmt(it.D)+' سم'+(it.est?' (مقاس تقديري)':'')+'</div>'+
      '<div><label>البعد من الحائط الأيسر (سم)</label><input type="number" step="1" data-pl="px" value="'+Math.round(ps.x)+'"></div>'+
      '<div><label>البعد من الحائط العلوي (سم)</label><input type="number" step="1" data-pl="py" value="'+Math.round(ps.y)+'"></div></div>'+
      '<div class="bar" style="margin-top:6px"><button class="btn ghost sm" data-a="planrot" type="button">⟳ تدوير 90°</button>'+
      (p.cur>0?'<button class="btn ghost sm" data-a="planreset" type="button">↩ إعادة لموضعه في الخيار الأول</button>':'')+'</div>';
  }
  if(planSel&&planSel.indexOf('mk:')===0){
    var mk=(p.marks||[]).filter(function(x){return 'mk:'+x.id===planSel;})[0];
    if(mk)return '<div class="grid" style="margin-top:8px"><div class="wide"><b>'+(mk.t==='door'?'باب':'نافذة')+'</b> — اسحبه على أي حائط</div><div><label>العرض (سم)</label><input type="number" step="5" min="30" data-pl="mlen" value="'+esc(mk.len)+'"></div></div>'+
      '<div class="bar" style="margin-top:6px"><button class="btn red sm" data-a="planmkdel" type="button">حذف العنصر</button></div>';
  }
  return '<p class="hint" style="margin-top:8px">اضغط على صنف لتعديل موضعه بالأرقام أو تدويره، أو اسحبه مباشرة إلى المكان الجديد.</p>';
}
function planBoxHtml(o){
  var sc=getScope(o.id),us=planUnits(o),p=getPlan(sc,us),op=p.opts[p.cur];
  return '<h2>🧩 مخطط توزيع الأصناف في الغرفة — خيارات للعميل</h2>'+
    '<p class="hint">اسحب أي صنف لتغيير مكانه داخل الغرفة (مثلًا نقل الدولاب من حائط إلى آخر)، وأنشئ خيارًا جديدًا لكل توزيع تقترحه، ثم اضغط «عرض للعميل» لينتقل الصنف بحركة بين الخيارات. الأبعاد مأخوذة من بطاقة كل صنف أعلاه (الطول × العرض)، والخط الغامق أسفل كل صنف يمثل واجهته.</p>'+
    '<div class="grid"><div><label>عرض الغرفة (سم)</label><input type="number" min="100" step="10" data-pl="rw" value="'+esc(p.rw)+'"></div>'+
    '<div><label>عمق الغرفة (سم)</label><input type="number" min="100" step="10" data-pl="rl" value="'+esc(p.rl)+'"></div>'+
    '<div><label style="display:flex;gap:6px;align-items:center;margin-top:24px"><input type="checkbox" data-pl="snap"'+(p.snap?' checked':'')+' style="width:auto"> محاذاة لأقرب 5 سم</label></div></div>'+
    '<div class="bar" style="margin:8px 0"><button class="btn ghost sm" data-a="planmk" data-t="door" type="button">+ باب</button><button class="btn ghost sm" data-a="planmk" data-t="win" type="button">+ نافذة</button></div>'+
    '<div class="pltabs">'+p.opts.map(function(x,i){return '<button type="button" class="btn sm '+(i===p.cur?'gold':'ghost')+'" data-a="planopt" data-i="'+i+'">'+(p.chosen===x.id?'✔ ':'')+esc(x.name||('خيار '+(i+1)))+'</button>';}).join('')+
    '<button class="btn sm ghost" data-a="plannew" type="button">+ خيار جديد (نسخة من الحالي)</button></div>'+
    '<div class="grid" style="margin-top:6px"><div class="wide"><label>اسم الخيار</label><input data-pl="oname" value="'+esc(op.name||'')+'"></div>'+
    '<div class="wide"><label>ملاحظة للعميل عن هذا الخيار</label><input data-pl="onote" value="'+esc(op.note||'')+'" placeholder="مثال: الدولاب بجانب النافذة ومساحة أوسع أمام السرير"></div></div>'+
    '<div id="planSvgBox" class="planbox">'+planSvg(o,p.cur,{sel:planSel,ghost:p.cur>0})+'</div>'+
    '<div id="planWarn">'+planWarnHtml(o)+'</div><div id="planSel">'+planSelHtml(o)+'</div>'+
    '<div class="bar" style="margin-top:10px"><button class="btn gold" data-a="planshow" type="button">▶ عرض للعميل (ثلاثي الأبعاد)</button>'+
    '<button class="btn ghost" data-a="planchoose" type="button">'+(p.chosen===op.id?'إلغاء اعتماد هذا الخيار':'✔ العميل اعتمد هذا الخيار')+'</button>'+
    (p.opts.length>1?'<button class="btn red sm" data-a="plandel" type="button">حذف هذا الخيار</button>':'')+'</div>';
}
function planRender(o){var b=$('planBox');if(b)b.innerHTML=planBoxHtml(o);}
function planRefreshSvg(o){
  var sc=getScope(o.id),us=planUnits(o),p=getPlan(sc,us),bx=$('planSvgBox');if(!bx)return;
  bx.innerHTML=planSvg(o,p.cur,{sel:planSel,ghost:p.cur>0});
  var w=$('planWarn');if(w)w.innerHTML=planWarnHtml(o);
}
function planRefresh(o){planRefreshSvg(o);var s=$('planSel');if(s)s.innerHTML=planSelHtml(o);}
function planSetTf(g,it,ps){
  var tf=planTf(it,ps);g.setAttribute('transform',tf.a);g.style.transform=tf.s;
  var lb=g.querySelector('.pl-lb');if(lb){lb.setAttribute('transform',tf.lba);lb.style.transform=tf.lb;}
}
function planApplyIssues(o){
  var sc=getScope(o.id),us=planUnits(o),p=getPlan(sc,us),iss=planIssues(p,us,p.opts[p.cur]),bx=$('planSvgBox');if(!bx)return;
  Array.prototype.forEach.call(bx.querySelectorAll('.pl-it'),function(g){g.classList.toggle('bad',!!(iss.bad[g.dataset.k]||iss.out[g.dataset.k]));});
  var w=$('planWarn');if(w)w.innerHTML=planWarnHtml(o);
}
function planSvgPt(svg,e){var pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;var m=svg.getScreenCTM();return m?pt.matrixTransform(m.inverse()):{x:0,y:0};}
function planSnap(p,v){return p.snap?Math.round(v/5)*5:Math.round(v);}
function planDown(e){
  var svg=e.target.closest&&e.target.closest('#planSvgBox .plsvg');if(!svg||!scOrderId)return;
  var o=orderBy(scOrderId);if(!o)return;
  var sc=getScope(o.id),us=planUnits(o),p=getPlan(sc,us),op=p.opts[p.cur],g=e.target.closest('.pl-it,.pl-mk');
  if(!g){if(planSel){planSel=null;planRefresh(o);}return;}
  e.preventDefault();
  var pt=planSvgPt(svg,e);
  if(g.classList.contains('pl-it')){
    var k=g.dataset.k,ps=op.pos[k];if(!ps)return;
    planSel=k;PD={t:'it',k:k,dx:pt.x-ps.x,dy:pt.y-ps.y,o:o,p:p,op:op,us:us,moved:false};
    Array.prototype.forEach.call(svg.querySelectorAll('.pl-it,.pl-mk'),function(x){x.classList.toggle('sel',x===g);});
  }else{
    planSel='mk:'+g.dataset.id;PD={t:'mk',id:g.dataset.id,o:o,p:p,moved:false};
    Array.prototype.forEach.call(svg.querySelectorAll('.pl-it,.pl-mk'),function(x){x.classList.toggle('sel',x===g);});
  }
  var s=$('planSel');if(s)s.innerHTML=planSelHtml(o);
  window.addEventListener('pointermove',planMove);window.addEventListener('pointerup',planUp);window.addEventListener('pointercancel',planUp);
}
function planMove(e){
  if(!PD)return;
  var bx=$('planSvgBox'),svg=bx&&bx.querySelector('.plsvg');if(!svg)return;
  var pt=planSvgPt(svg,e),p=PD.p;
  if(PD.t==='it'){
    var it=PD.us.filter(function(x){return x.k===PD.k;})[0],ps=PD.op.pos[PD.k];if(!it||!ps)return;
    var q=planBox_(it,ps);
    ps.x=Math.max(0,Math.min(Math.max(0,p.rw-q.w),planSnap(p,pt.x-PD.dx)));
    ps.y=Math.max(0,Math.min(Math.max(0,p.rl-q.h),planSnap(p,pt.y-PD.dy)));
    var g=svg.querySelector('.pl-it[data-k="'+PD.k+'"]');if(g)planSetTf(g,it,ps);
    planApplyIssues(PD.o);
    var ix=document.querySelector('#planSel [data-pl=px]'),iy=document.querySelector('#planSel [data-pl=py]');
    if(ix)ix.value=Math.round(ps.x);if(iy)iy.value=Math.round(ps.y);
  }else{
    var mk=(p.marks||[]).filter(function(x){return x.id===PD.id;})[0];if(!mk)return;
    var L=num(mk.len)||90,dt=pt.y,db=p.rl-pt.y,dl=pt.x,dr=p.rw-pt.x,mn=Math.min(dt,db,dl,dr);
    mk.wall=mn===dt?'t':mn===db?'b':mn===dl?'l':'r';
    var wl=(mk.wall==='t'||mk.wall==='b')?p.rw:p.rl,c=(mk.wall==='t'||mk.wall==='b')?pt.x:pt.y;
    mk.pos=Math.max(0,Math.min(Math.max(0,wl-L),planSnap(p,c-L/2)));
    planRefreshSvg(PD.o);
  }
  PD.moved=true;p.touched=true;
}
function planUp(){
  window.removeEventListener('pointermove',planMove);window.removeEventListener('pointerup',planUp);window.removeEventListener('pointercancel',planUp);
  if(PD&&PD.moved){schedSave();}
  PD=null;
}
function planInput(t){
  var o=orderBy(scOrderId);if(!o)return;
  var sc=getScope(o.id),us=planUnits(o),p=getPlan(sc,us),op=p.opts[p.cur],f=t.dataset.pl,v=t.type==='checkbox'?t.checked:t.value;
  p.touched=true;
  if(f==='rw'||f==='rl'){var n=num(v);if(n>=50){p[f]=n;planRefreshSvg(o);}}
  else if(f==='snap')p.snap=v?1:0;
  else if(f==='oname'){op.name=v;var tb=document.querySelector('#planBox .pltabs [data-i="'+p.cur+'"]');if(tb)tb.textContent=(p.chosen===op.id?'✔ ':'')+(v||('خيار '+(p.cur+1)));}
  else if(f==='onote')op.note=v;
  else if(f==='px'||f==='py'){
    var it=us.filter(function(x){return x.k===planSel;})[0],ps=it&&op.pos[it.k];
    if(ps){var q=planBox_(it,ps);
      if(f==='px')ps.x=Math.max(0,Math.min(Math.max(0,p.rw-q.w),num(v)));else ps.y=Math.max(0,Math.min(Math.max(0,p.rl-q.h),num(v)));
      planRefreshSvg(o);}
  }else if(f==='mlen'){
    var mk=(p.marks||[]).filter(function(x){return 'mk:'+x.id===planSel;})[0];
    if(mk&&num(v)>=20){mk.len=num(v);planRefreshSvg(o);}
  }
  schedSave();
}
function planAct(o,b){
  var sc=getScope(o.id),us=planUnits(o),p=getPlan(sc,us),op=p.opts[p.cur],ac=b.dataset.a,y=window.scrollY;
  function done(){planRender(o);window.scrollTo(0,y);schedSave();}
  p.touched=true;
  if(ac==='planopt'){p.cur=+b.dataset.i;planSel=null;done();return;}
  if(ac==='plannew'){
    var c=JSON.parse(JSON.stringify(op));c.id=uid();c.name='الخيار '+(p.opts.length+1);c.note='';
    p.opts.push(c);p.cur=p.opts.length-1;planSel=null;done();return;
  }
  if(ac==='plandel'){
    if(!b.dataset.armed){b.dataset.armed='1';b.textContent='تأكيد حذف الخيار';setTimeout(function(){if(b.isConnected){delete b.dataset.armed;b.textContent='حذف هذا الخيار';}},3000);return;}
    if(p.opts.length<2)return;
    if(p.chosen===op.id)p.chosen='';
    p.opts.splice(p.cur,1);p.cur=0;planSel=null;done();return;
  }
  if(ac==='planchoose'){p.chosen=(p.chosen===op.id)?'':op.id;done();return;}
  if(ac==='planmk'){
    var mk={id:uid(),t:b.dataset.t==='door'?'door':'win',wall:'t',pos:30,len:b.dataset.t==='door'?90:120};
    (p.marks=p.marks||[]).push(mk);planSel='mk:'+mk.id;done();return;
  }
  if(ac==='planmkdel'){p.marks=(p.marks||[]).filter(function(x){return 'mk:'+x.id!==planSel;});planSel=null;done();return;}
  if(ac==='planrot'||ac==='planreset'){
    var it=us.filter(function(x){return x.k===planSel;})[0];if(!it)return;
    var ps=op.pos[it.k];
    if(ac==='planreset'){var z=p.opts[0].pos[it.k];if(z)op.pos[it.k]={x:z.x,y:z.y,r:z.r||0};}
    else{
      var q=planBox_(it,ps),cx=ps.x+q.w/2,cy=ps.y+q.h/2;ps.r=((ps.r||0)+90)%360;
      var q2=planBox_(it,ps);ps.x=Math.max(0,Math.min(Math.max(0,p.rw-q2.w),Math.round(cx-q2.w/2)));ps.y=Math.max(0,Math.min(Math.max(0,p.rl-q2.h),Math.round(cy-q2.h/2)));
    }
    done();return;
  }
  if(ac==='planshow'){planPresent(o,p.cur);return;}
}
function p3SnapAll(o){
  var old=PP,res=[];
  try{
    PP={tpl:{},open:{},ptr:{}};PP.ctx=p3Ctx(o);
    var w=1100,h=800,v={yaw:-0.62,pit:0.55,zoom:0.92};
    PP.ctx.p.opts.forEach(function(op,i){
      var cv=document.createElement('canvas');cv.width=w;cv.height=h;
      var ctx=cv.getContext('2d');
      p3Paint(ctx,w,h,p3Frame(w,h,i,p3Target(i),v,null),{ghost:i>0,idx:i});
      res.push(cv.toDataURL('image/jpeg',0.88));
    });
  }catch(e){res=[];}
  PP=old;return res;
}
function planPrint(o){
  var sc=getScope(o.id);
  if(!sc.plan||!(sc.plan.touched||sc.plan.opts.length>1))return '';
  var us=planUnits(o),p=getPlan(sc,us),snaps=p3SnapAll(o);
  return '<h3 style="margin:10px 0 4px">مخطط توزيع الأصناف داخل الغرفة ('+fmt(p.rw)+' × '+fmt(p.rl)+' سم)</h3>'+p.opts.map(function(op,i){
    var mv=planMoved(p,us,i).map(function(x){return x.name;});
    return '<div class="brk"><table class="kv"><tr><td>الخيار '+(i+1)+'</td><td>'+esc(op.name||'')+(p.chosen===op.id?' ✔ (اختيار العميل)':'')+'</td>'+(op.note?'<td>ملاحظة</td><td>'+esc(op.note)+'</td>':'')+'</tr>'+
      (mv.length?'<tr><td>أصناف تغيّر مكانها</td><td colspan="3">'+esc(mv.join('، '))+'</td></tr>':'')+'</table>'+
      (snaps[i]?'':'<div style="max-width:150mm;margin:4px auto">'+planSvg(o,i,{ghost:true})+'</div>')+(snaps[i]?'<div style="max-width:170mm;margin:6px auto"><div style="text-align:center;font-size:.85rem;color:#555">عرض ثلاثي الأبعاد</div><img alt="عرض ثلاثي الأبعاد" src="'+snaps[i]+'" style="width:100%;display:block"></div>':'')+'</div>';
  }).join('');
}
/* ---- شاشة العرض للعميل: غرفة ثلاثية الأبعاد (قابلة للتدوير) ---- */
var P3H={0:80,1:210,2:100,3:220,4:55,5:76,6:76,7:85,8:90,9:140,10:50,11:185};
var P3FL=[[203,170,128],[196,160,118],[210,178,136]];
function p3Clone(b){
  var c={},k;for(k in b)c[k]=b[k];
  c.rot=b.rot?b.rot.map(function(r){return {hx:r.hx,hy:r.hy,a:r.a};}):null;
  if(b.pl){c.pl={};for(k in b.pl)c.pl[k]=b.pl[k];c.pl.A=b.pl.A.map(function(q){return q.slice();});c.pl.B=b.pl.B.map(function(q){return q.slice();});}
  return c;
}
function p3Tpl(it,op){
  op=Math.round((op||0)*20)/20;
  var key=it.k+'|'+it.L+'x'+it.D+'|'+op;
  if(PP.tpl[key])return PP.tpl[key];
  var d=it.d||{},t=ftype(d,it.name),ti=FT.indexOf(t),L=it.L,W=it.D,H=num(d.h)>0?num(d.h):(P3H[ti]||80),a,r,secs=null,g,F;
  var st={yaw:0,pit:0,zoom:1,open:op,ci:0,cc:null,set:false,o:d};
  if(d.cc&&fvHex(d.cc)){st.cc=d.cc;}
  else if(d.fin!=null&&d.fin!==''&&FVFIN[+d.fin]){st.ci=+d.fin;}
  else{g=fvGuess(((it.u&&it.u.p&&it.u.p.color)||'')+' '+(d.note||'')+' '+it.name);if(g)st.cc=g.cc;}
  F=(st.cc&&fvHex(st.cc))||FVFIN[st.ci||0][1];
  try{
    r=fdef(t,d,L);
    if(hasInt(t))secs=getSecs(d,t,L,r);
    a=fvBuild({t:t,L:L,W:W,H:H,r:r,secs:secs},st);
  }catch(e){a=[];}
  a=(a||[]).filter(function(b){return b.tag!=='floor';});
  if(!a.length)fvB(a,0,0,0,L,W,H,fvHex(it.col)||F);
  return PP.tpl[key]={a:a,H:H,col:fvHexOf(F)};
}
function p3Ctx(o){
  var sc=getScope(o.id),us=planUnits(o),p=getPlan(sc,us),ch=250;
  PP.tpl={};
  us.forEach(function(it){var t=p3Tpl(it);if(t.H+30>ch)ch=t.H+30;});
  return {o:o,us:us,p:p,rw:num(p.rw)||400,rl:num(p.rl)||350,ch:Math.min(ch,420)};
}
function p3Target(idx){
  var C=PP.ctx,op=C.p.opts[idx]||C.p.opts[0],m={};
  C.us.forEach(function(it){var ps=op.pos[it.k];if(!ps)return;var b=planBox_(it,ps);m[it.k]={cx:ps.x+b.w/2,cy:ps.y+b.h/2,r:ps.r||0};});
  return m;
}
/* صندوق على الحائط: u0..u1 موضع على الحائط (إحداثيات المخطط)، th السماكة إلى الداخل */
function p3WB(a,rw,rl,wl,u0,u1,z0,z1,th,off,c,o){
  var x,y,l,w;
  if(wl==='t'){x=u0;l=u1-u0;w=th;y=rl-off-th;}
  else if(wl==='b'){x=u0;l=u1-u0;w=th;y=off;}
  else if(wl==='l'){x=off;l=th;y=rl-u1;w=u1-u0;}
  else{x=rw-off-th;l=th;y=rl-u1;w=u1-u0;}
  fvB(a,x,y,z0,l,w,z1-z0,c,o);
}
function p3Room(C,yaw){
  var rw=C.rw,rl=C.rl,ch=C.ch,p=C.p,t=14,a=[],sy=Math.sin(yaw),cy=Math.cos(yaw),i,j,n,pw;
  var far={t:rl*cy>1,b:-rl*cy>1,l:-rw*sy>1,r:rw*sy>1},WC=[201,197,201],PC=[216,212,216],TG={tag:'floor'};
  fvB(a,0,0,-4,rw,rl,4,[96,84,74],TG);
  n=Math.max(1,Math.round(rl/24));pw=rl/n;
  for(j=0;j<n;j++)fvB(a,0,j*pw,0,rw,pw-0.5,0.2,fvSh(P3FL[j%3],0.94+fvRnd(j+1)*0.1),TG);
  var e0=far.l?-t:0,e1=far.r?rw+t:rw;
  if(far.t)fvB(a,e0,rl,0,e1-e0,t,ch,WC,TG);
  if(far.b)fvB(a,e0,-t,0,e1-e0,t,ch,WC,TG);
  if(far.l)fvB(a,-t,0,0,t,rl,ch,WC,TG);
  if(far.r)fvB(a,rw,0,0,t,rl,ch,WC,TG);
  ['t','b','l','r'].forEach(function(w){
    if(!far[w])return;
    var len=(w==='t'||w==='b')?rw:rl,np=Math.max(1,Math.round(len/90)),m=14,gp=10,pwid=(len-2*m-gp*(np-1))/np,k,u0;
    p3WB(a,rw,rl,w,0,len,0,9,1.6,0,[243,241,239],TG);
    for(k=0;k<np;k++){u0=m+k*(pwid+gp);p3WB(a,rw,rl,w,u0,u0+pwid,26,ch-26,1.2,0,PC,TG);}
  });
  (p.marks||[]).forEach(function(mk){
    if(!far[mk.wall])return;
    var w=mk.wall,u0=num(mk.pos),u1=u0+(num(mk.len)||90),wh=[246,246,244];
    if(mk.t==='door'){
      p3WB(a,rw,rl,w,u0-4,u1+4,0,216,2.4,0,wh,TG);
      p3WB(a,rw,rl,w,u0,u1,0,210,3.4,0,[150,104,70],TG);
      p3WB(a,rw,rl,w,u1-14,u1-9,98,112,5.4,0,[205,175,95],TG);
    }else{
      p3WB(a,rw,rl,w,u0-4,u1+4,88,95,6,0,wh,TG);
      p3WB(a,rw,rl,w,u0,u1,95,215,3.2,0,wh,TG);
      p3WB(a,rw,rl,w,u0+5,u1-5,100,210,3.6,0,[176,214,238],TG);
      p3WB(a,rw,rl,w,(u0+u1)/2-1.5,(u0+u1)/2+1.5,100,210,4,0,wh,TG);
    }
  });
  [[-t,-t],[rw+t,-t],[rw+t,rl+t],[-t,rl+t]].forEach(function(q){[0,ch].forEach(function(z){fvB(a,q[0],q[1],z,0.1,0.1,0.1,[0,0,0],{al:0.001});});});
  return a;
}
function p3Cam(boxes,v,w,h){
  var mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  boxes.forEach(function(b){fvCorners(b).forEach(function(q){for(var k=0;k<3;k++){if(q[k]<mn[k])mn[k]=q[k];if(q[k]>mx[k])mx[k]=q[k];}});});
  var cx=(mn[0]+mx[0])/2,cy=(mn[1]+mx[1])/2,cz=(mn[2]+mx[2])/2;
  var R=Math.sqrt(Math.pow(mx[0]-mn[0],2)+Math.pow(mx[1]-mn[1],2)+Math.pow(mx[2]-mn[2],2))/2;
  var cyw=Math.cos(v.yaw),syw=Math.sin(v.yaw),cp=Math.cos(v.pit),sp=Math.sin(v.pit),D=R*2.7/v.zoom,f=0.4*Math.min(w,h*1.25)*2.7;
  return function(x,y,z){var px=x-cx,py=y-cy,pz=z-cz,x1=px*cyw-py*syw,y1=px*syw+py*cyw,q=f/(y1*cp-pz*sp+D);return [w/2+x1*q,h*0.5-(y1*sp+pz*cp)*q+h*0.02];};
}
function p3Frame(w,h,idx,shown,v,om){
  var C=PP.ctx,boxes=p3Room(C,v.yaw),items=[];
  C.us.forEach(function(it,i){
    var s=shown[it.k];if(!s)return;
    var tp=p3Tpl(it,om?om[it.k]:0),out=tp.a.map(p3Clone),CY=C.rl-s.cy,ang=-s.r*Math.PI/180;
    fvShift(out,s.cx-it.L/2,CY-it.D/2,0);
    if(Math.abs(s.r%360)>0.01)fvRotAll(out,s.cx,CY,ang);
    fvGroup(out,10+i);fvPush(boxes,out);
    items.push({it:it,cx:s.cx,CY:CY,ang:ang,H:tp.H});
  });
  var R=fvPolys({L:C.rw,W:C.rl,H:C.ch,t:FT[0]},boxes,{yaw:v.yaw,pit:v.pit,zoom:v.zoom,open:0},w,h);
  return {R:R,cam:p3Cam(boxes,v,w,h),items:items};
}
function p3Foot(cam,m,grow,z){
  var hw=m.it.L/2+grow,hd=m.it.D/2+grow,c=Math.cos(m.ang),s=Math.sin(m.ang);
  return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(function(q){return cam(m.cx+q[0]*c-q[1]*s,m.CY+q[0]*s+q[1]*c,z);});
}
function p3Paint(ctx,w,h,F,fl){
  var R=F.R,cam=F.cam,C=PP.ctx,sm=!!fl.small,i=0,n=R.polys.length;
  var g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#f8f9fc');g.addColorStop(1,'#e2e6ee');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  function path(p){ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);for(var k=1;k<p.length;k++)ctx.lineTo(p[k][0],p[k][1]);ctx.closePath();}
  function drawPoly(q){
    var col='rgb('+q.rgb[0]+','+q.rgb[1]+','+q.rgb[2]+')',nk=q.p.length,k;
    path(q.p);ctx.globalAlpha=q.al;ctx.fillStyle=col;ctx.fill();
    if(q.al>=1){ctx.strokeStyle=col;ctx.lineWidth=0.8;ctx.stroke();}
    ctx.globalAlpha=Math.min(1,q.al*0.9);ctx.strokeStyle=q.ly<0?'rgba(60,40,30,0.13)':'rgba(40,18,10,0.4)';ctx.lineWidth=0.7;
    for(k=0;k<nk;k++)if(q.e[k]){var A=q.p[k],B=q.p[(k+1)%nk];ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();}
    ctx.globalAlpha=1;
  }
  ctx.lineJoin='round';
  while(i<n&&R.polys[i].ly<0){drawPoly(R.polys[i]);i++;}
  F.items.forEach(function(m){[[7,0.09],[3.5,0.11],[1,0.14]].forEach(function(s){path(p3Foot(cam,m,s[0],0.4));ctx.fillStyle='rgba(40,25,10,'+s[1]+')';ctx.fill();});});
  if(fl.sel){
    F.items.forEach(function(m){if(m.it.k!==fl.sel)return;path(p3Foot(cam,m,4,0.5));ctx.fillStyle='rgba(255,196,40,.38)';ctx.fill();ctx.strokeStyle='#e0a100';ctx.lineWidth=3;ctx.stroke();});
  }
  if(fl.ghost&&fl.idx>0){
    planMoved(C.p,C.us,fl.idx).forEach(function(it){
      var a=C.p.opts[0].pos[it.k],m=F.items.filter(function(x){return x.it.k===it.k;})[0];if(!a||!m)return;
      var bb=planBox_(it,a),s0={cx:a.x+bb.w/2,CY:C.rl-(a.y+bb.h/2),ang:-(a.r||0)*Math.PI/180,it:it};
      var A=cam(s0.cx,s0.CY,0.6),B=cam(m.cx,m.CY,0.6),an=Math.atan2(B[1]-A[1],B[0]-A[0]);
      ctx.save();ctx.strokeStyle='#c0392b';ctx.fillStyle='#c0392b';ctx.lineWidth=2;ctx.setLineDash([7,5]);
      path(p3Foot(cam,s0,0.5,0.6));ctx.stroke();
      ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();ctx.setLineDash([]);
      ctx.beginPath();ctx.moveTo(B[0],B[1]);ctx.lineTo(B[0]-12*Math.cos(an-0.4),B[1]-12*Math.sin(an-0.4));ctx.lineTo(B[0]-12*Math.cos(an+0.4),B[1]-12*Math.sin(an+0.4));ctx.closePath();ctx.fill();
      ctx.restore();
    });
  }
  for(;i<n;i++)drawPoly(R.polys[i]);
  var fs=sm?10:(fl.all?18:12.5);
  ctx.textAlign='center';ctx.textBaseline='middle';
  F.items.forEach(function(m){
    if(sm||(!fl.all&&fl.sel!==m.it.k))return;
    var P=cam(m.cx,m.CY,m.H+6),on=!fl.all,t1=m.it.name,t2='\u200E'+fmt(m.it.L)+' × '+fmt(m.it.D)+(m.it.est?'*':'');
    ctx.font='600 '+fs+'px Tahoma,"Segoe UI",sans-serif';
    var tw=Math.max(ctx.measureText(t1).width,ctx.measureText(t2).width*0.85)+14,th=Math.round(fs*2.55),x=Math.max(tw/2+3,Math.min(w-tw/2-3,P[0])),y=Math.max(th/2+3,P[1]-th/2-4);
    ctx.fillStyle='rgba(255,255,255,0.94)';ctx.strokeStyle=on?'#e0a100':'#cfd5e0';ctx.lineWidth=on?2.2:1;
    ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x-tw/2,y-th/2,tw,th,8);else ctx.rect(x-tw/2,y-th/2,tw,th);ctx.fill();ctx.stroke();
    ctx.fillStyle='#1d2433';ctx.fillText(t1,x,y-th*0.17);
    ctx.font=(fs*0.82)+'px Tahoma,"Segoe UI",sans-serif';ctx.fillStyle='#6a7487';ctx.fillText(t2,x,y+th*0.24);
  });
  ctx.textBaseline='alphabetic';
}
function p3Hull(cam,m){
  var pts=[],c=Math.cos(m.ang),s=Math.sin(m.ang),z,q;
  [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(k){[0,m.H].forEach(function(z){pts.push(cam(m.cx+k[0]*m.it.L/2*c-k[1]*m.it.D/2*s,m.CY+k[0]*m.it.L/2*s+k[1]*m.it.D/2*c,z));});});
  pts.sort(function(a,b){return a[0]-b[0]||a[1]-b[1];});
  function cr(o,a,b){return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);}
  var lo=[],up=[],i;
  for(i=0;i<pts.length;i++){while(lo.length>1&&cr(lo[lo.length-2],lo[lo.length-1],pts[i])<=0)lo.pop();lo.push(pts[i]);}
  for(i=pts.length-1;i>=0;i--){while(up.length>1&&cr(up[up.length-2],up[up.length-1],pts[i])<=0)up.pop();up.push(pts[i]);}
  lo.pop();up.pop();return lo.concat(up);
}
function p3Hit(x,y){
  var best=null,by=-1e9;
  (PP.hits||[]).forEach(function(m){
    var h=m.hull,n=h.length,i,ok=true;
    for(i=0;i<n;i++){var a=h[i],b=h[(i+1)%n];if((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])<0){ok=false;break;}}
    if(ok){var cy=m.sy;if(cy>by){by=cy;best=m;}}
  });
  return best?best.it.k:null;
}
function p3Draw(cv,idx,shown,v,fl){
  var w=cv.clientWidth,h=cv.clientHeight;if(!w||!h)return;
  var dpr=Math.min(2,window.devicePixelRatio||1);
  if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);}
  var ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  fl.idx=idx;
  var F=p3Frame(w,h,idx,shown,v,fl.main?PP.open:null);
  if(fl.main){F.items.forEach(function(m){m.hull=p3Hull(F.cam,m);m.sy=F.cam(m.cx,m.CY,0)[1];});PP.hits=F.items;}
  p3Paint(ctx,w,h,F,fl);
}
function planPresent(o,idx){
  if(!PP)ppBuild();
  PP.oid=o.id;PP.mode='one';PP.idx=idx||0;PP.tpl={};PP.sel=null;PP.auto=false;PP.ghost=true;PP.anim=null;PP.vanim=null;PP.open={};PP.oanim=null;
  PP.view={yaw:-0.62,pit:0.55,zoom:0.92};
  PP.ctx=p3Ctx(o);PP.shown=p3Target(PP.idx);
  PP.el.style.display='flex';PP.bodyOv=document.body.style.overflow;document.body.style.overflow='hidden';
  ppRender();
}
function ppBuild(){
  var el=document.createElement('div');el.id='planP';el.setAttribute('role','dialog');
  el.innerHTML='<div class="pp-top"><b class="pp-title"></b><span class="pp-badge"></span><button type="button" class="pp-x" data-q="close" aria-label="إغلاق">✕</button></div>'+
    '<div class="pp-body"><aside class="pp-side"></aside><div class="pp-stage"><canvas class="pp-cv"></canvas><div class="pp-note"></div><div class="pp-tools"></div><div class="pp-grid"></div></div></div><div class="pp-status"></div>';
  document.body.appendChild(el);PP={el:el,oid:null,mode:'one',idx:0,tpl:{},ptr:{}};
  el.addEventListener('click',function(e){
    var c=e.target.closest('[data-q],[data-qi]');if(!c)return;
    var q=c.dataset.q,v=PP.view;
    if(c.dataset.qi!==undefined){PP.mode='one';PP.idx=+c.dataset.qi;PP.anim=null;PP.shown=p3Target(PP.idx);ppRender();return;}
    if(q==='close')ppClose();
    else if(q==='opt'){ppGo(+c.dataset.i,PP.mode==='one');PP.mode='one';ppRender();}
    else if(q==='cmp'){PP.mode=PP.mode==='cmp'?'one':'cmp';ppRender();}
    else if(q==='choose'){
      var C=PP.ctx,op=C.p.opts[PP.idx];C.p.chosen=(C.p.chosen===op.id)?'':op.id;C.p.touched=true;schedSave();ppRender();
    }
    else if(q==='selit'){PP.sel=(PP.sel===c.dataset.k)?null:c.dataset.k;ppPanel();ppTools();p3Loop();}
    else if(q==='vl')ppView({yaw:v.yaw-0.45});
    else if(q==='vr')ppView({yaw:v.yaw+0.45});
    else if(q==='vreset')ppView({yaw:-0.62,pit:0.55,zoom:0.92});
    else if(q==='vtop')ppView({yaw:0,pit:1.48,zoom:0.92});
    else if(q==='zin')ppView({zoom:Math.min(3.2,v.zoom*1.25)});
    else if(q==='zout')ppView({zoom:Math.max(0.5,v.zoom/1.25)});
    else if(q==='vopen'){
      var ks=p3OpenTargets(),tv=p3AllOpen(ks)?0:1,fr={},to={};
      ks.forEach(function(k){fr[k]=PP.open[k]||0;to[k]=tv;});
      PP.oanim={t0:performance.now(),dur:650,from:fr,to:to};ppTools();p3Loop();
    }
    else if(q==='vauto'){PP.auto=!PP.auto;ppTools();p3Loop();}
    else if(q==='ghost'){PP.ghost=!PP.ghost;ppTools();p3Loop();}
  });
  var cv=el.querySelector('.pp-cv');
  cv.addEventListener('pointerdown',function(e){PP.ptr[e.pointerId]={x:e.clientX,y:e.clientY};try{cv.setPointerCapture(e.pointerId);}catch(x){}PP.vanim=null;cv.style.cursor='grabbing';PP.dn={mv:0,n:Object.keys(PP.ptr).length};});
  cv.addEventListener('pointermove',function(e){
    var pt=PP.ptr[e.pointerId];if(!pt)return;
    var ks=Object.keys(PP.ptr),v=PP.view;
    if(ks.length>=2){
      var o2=PP.ptr[ks[0]===String(e.pointerId)?ks[1]:ks[0]],d0=Math.hypot(pt.x-o2.x,pt.y-o2.y),d1=Math.hypot(e.clientX-o2.x,e.clientY-o2.y);
      if(d0>0)v.zoom=Math.max(0.5,Math.min(3.2,v.zoom*d1/d0));
    }else{
      v.yaw+=(e.clientX-pt.x)*0.007;v.pit=Math.max(0.12,Math.min(1.5,v.pit+(e.clientY-pt.y)*0.005));
    }
    if(PP.dn)PP.dn.mv+=Math.abs(e.clientX-pt.x)+Math.abs(e.clientY-pt.y);pt.x=e.clientX;pt.y=e.clientY;p3Loop();
  });
  function up(e){
    var had=PP.ptr[e.pointerId];delete PP.ptr[e.pointerId];cv.style.cursor='grab';
    if(e.type==='pointerup'&&had&&PP.dn&&PP.dn.mv<6&&PP.dn.n===1){
      var r=cv.getBoundingClientRect(),k=p3Hit(e.clientX-r.left,e.clientY-r.top);
      PP.sel=(k&&k!==PP.sel)?k:null;ppPanel();ppTools();p3Loop();
    }
    if(!Object.keys(PP.ptr).length)PP.dn=null;
  }
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('wheel',function(e){e.preventDefault();PP.view.zoom=Math.max(0.5,Math.min(3.2,PP.view.zoom*Math.exp(-e.deltaY*0.0012)));p3Loop();},{passive:false});
  cv.addEventListener('dblclick',function(){ppView({yaw:-0.62,pit:0.55,zoom:0.92});});
  document.addEventListener('keydown',function(e){
    if(!PP||PP.el.style.display==='none')return;
    var n=PP.ctx.p.opts.length;
    if(e.key==='Escape')ppClose();
    else if(e.key==='ArrowLeft'){ppGo((PP.idx+1)%n,PP.mode==='one');PP.mode='one';ppRender();}
    else if(e.key==='ArrowRight'){ppGo((PP.idx-1+n)%n,PP.mode==='one');PP.mode='one';ppRender();}
  });
  function rs(){if(PP&&PP.el.style.display!=='none'){if(PP.mode==='cmp')ppGrid();else p3Loop();}}
  window.addEventListener('resize',rs);
  if(window.ResizeObserver)new ResizeObserver(rs).observe(el.querySelector('.pp-stage'));
}
function ppGo(idx,anim){
  var C=PP.ctx,to=p3Target(idx),from={};
  PP.idx=idx;
  if(!anim){PP.shown=to;PP.anim=null;return;}
  C.us.forEach(function(it){var s=PP.shown[it.k],t=to[it.k];if(!s||!t)return;from[it.k]={cx:s.cx,cy:s.cy,r:s.r};t.r2=s.r+(((t.r-s.r)%360+540)%360-180);});
  PP.anim={t0:performance.now(),dur:850,from:from,to:to};
}
function p3OpenTargets(){return PP.sel?[PP.sel]:PP.ctx.us.map(function(it){return it.k;});}
function p3AllOpen(ks){return ks.every(function(k){var v=PP.oanim&&PP.oanim.to[k]!=null?PP.oanim.to[k]:(PP.open[k]||0);return v>0.5;});}
function ppView(t){
  var v=PP.view;PP.vanim={t0:performance.now(),dur:550,from:{yaw:v.yaw,pit:v.pit,zoom:v.zoom},to:{yaw:t.yaw!=null?t.yaw:v.yaw,pit:t.pit!=null?t.pit:v.pit,zoom:t.zoom!=null?t.zoom:v.zoom}};
  p3Loop();
}
function p3Loop(){
  if(PP.raf||!PP)return;
  PP.raf=requestAnimationFrame(function(ts){
    PP.raf=0;if(PP.el.style.display==='none'||PP.mode!=='one')return;
    var again=false,ease=function(k){return k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;};
    if(PP.anim){
      var A=PP.anim,k=Math.max(0,Math.min(1,(ts-A.t0)/A.dur)),e=ease(k);
      Object.keys(A.to).forEach(function(key){var f=A.from[key],t=A.to[key];if(!f)return;PP.shown[key]={cx:f.cx+(t.cx-f.cx)*e,cy:f.cy+(t.cy-f.cy)*e,r:f.r+(t.r2-f.r)*e};});
      if(k>=1)PP.anim=null;else again=true;
    }
    if(PP.vanim){
      var V=PP.vanim,k2=Math.max(0,Math.min(1,(ts-V.t0)/V.dur)),e2=ease(k2);
      ['yaw','pit','zoom'].forEach(function(f){PP.view[f]=V.from[f]+(V.to[f]-V.from[f])*e2;});
      if(k2>=1)PP.vanim=null;else again=true;
    }
    if(PP.oanim){
      var Q=PP.oanim,k3=Math.max(0,Math.min(1,(ts-Q.t0)/Q.dur)),e3=ease(k3);
      Object.keys(Q.to).forEach(function(key){PP.open[key]=Q.from[key]+(Q.to[key]-Q.from[key])*e3;});
      if(k3>=1)PP.oanim=null;else again=true;
    }
    if(PP.auto){PP.view.yaw+=0.006;again=true;}
    ppDraw();
    if(again)p3Loop();
  });
}
function ppDraw(){
  if(!PP||PP.mode!=='one')return;
  p3Draw(PP.el.querySelector('.pp-cv'),PP.idx,PP.shown,PP.view,{ghost:PP.ghost&&PP.idx>0,sel:PP.sel,main:true});
}
function ppPanel(){
  var C=PP.ctx,p=C.p,mv={};
  planMoved(p,C.us,PP.idx).forEach(function(it){mv[it.k]=1;});
  var h='<h5>خيارات التوزيع</h5><div class="pp-opts">'+p.opts.map(function(x,i){
    return '<button type="button" class="pp-opt'+(PP.mode==='one'&&i===PP.idx?' on':'')+'" data-q="opt" data-i="'+i+'"><b>'+(p.chosen===x.id?'✔ ':'')+esc(x.name||('خيار '+(i+1)))+'</b>'+(x.note?'<small>'+esc(x.note)+'</small>':'')+'</button>';
  }).join('')+'</div><h5>الأصناف في الغرفة ('+C.us.length+')</h5><div class="pp-items">'+C.us.map(function(it){
    var tp=p3Tpl(it);
    return '<div class="pp-it'+(PP.sel===it.k?' on':'')+'" data-q="selit" data-k="'+esc(it.k)+'"><i class="pp-sw" style="background:'+tp.col+'"></i><span><b>'+esc(it.name)+'</b><small>'+fmt(it.L)+' × '+fmt(it.D)+' × '+fmt(tp.H)+' سم'+(it.qty>1?' — عدد '+fmt(it.qty):'')+'</small></span>'+(mv[it.k]?'<em>تغيّر موضعه</em>':'')+'</div>';
  }).join('')+'</div>';
  var op=p.opts[PP.idx];
  h+='<div class="pp-foot"><button type="button" class="pp-gold" data-q="choose">'+(p.chosen===op.id?'إلغاء اعتماد هذا الخيار':'✔ اعتماد هذا الخيار')+'</button></div>';
  PP.el.querySelector('.pp-side').innerHTML=h;
}
function ppTools(){
  var C=PP.ctx,n=C.p.opts.length,mvd=PP.idx>0&&planMoved(C.p,C.us,PP.idx).length>0;
  function b(q,t,on){return '<button type="button" data-q="'+q+'" class="'+(on?'on':'')+'">'+t+'</button>';}
  var op=p3AllOpen(p3OpenTargets());
  PP.el.querySelector('.pp-tools').innerHTML=b('vl','⟲ يسار')+b('vr','يمين ⟳')+b('vreset','منظور')+b('vtop','من أعلى')+b('vopen',op?'🚪 إغلاق الأبواب':'🚪 فتح الأبواب',op)+b('vauto','تدوير تلقائي',PP.auto)+b('zin','＋')+b('zout','－')+
    (mvd?b('ghost','المكان السابق',PP.ghost):'')+(n>1?b('cmp','⊞ مقارنة',PP.mode==='cmp'):'');
}
function ppStatus(){
  var C=PP.ctx;
  PP.el.querySelector('.pp-status').textContent=fmt(C.rw)+' × '+fmt(C.rl)+' سم  —  '+C.us.length+' صنف  —  الخيار '+(PP.idx+1)+' من '+C.p.opts.length+'  —  اسحب للتدوير، وبكرة الفأرة أو القرص للتكبير';
}
function ppGrid(){
  var C=PP.ctx,p=C.p,g=PP.el.querySelector('.pp-grid');
  g.innerHTML=p.opts.map(function(x,i){
    return '<div class="pp-card'+(p.chosen===x.id?' on':'')+'" data-qi="'+i+'"><h4>'+(p.chosen===x.id?'✔ ':'')+esc(x.name||('خيار '+(i+1)))+'</h4><canvas></canvas>'+(x.note?'<p>'+esc(x.note)+'</p>':'')+'</div>';
  }).join('')+'<div class="pp-leg">اضغط على أي خيار لعرضه بحجم كامل</div>';
  Array.prototype.forEach.call(g.querySelectorAll('.pp-card canvas'),function(cv,i){
    p3Draw(cv,i,p3Target(i),{yaw:PP.view.yaw,pit:PP.view.pit,zoom:Math.min(PP.view.zoom,0.95)},{ghost:i>0,small:true});
  });
}
function ppRender(){
  var C=PP.ctx,p=C.p,op=p.opts[PP.idx],o=C.o,el=PP.el,cmp=PP.mode==='cmp',bd=el.querySelector('.pp-badge');
  el.classList.toggle('pp-cmp',cmp);
  el.querySelector('.pp-title').textContent=(o.custName?o.custName+' — ':'')+(cmp?'مقارنة خيارات التوزيع':(op.name||('الخيار '+(PP.idx+1))));
  bd.textContent='✔ اختيار العميل';bd.style.display=(!cmp&&p.chosen===op.id)?'':'none';
  el.querySelector('.pp-note').textContent=cmp?'':(op.note||'');
  ppPanel();ppTools();ppStatus();
  if(cmp)ppGrid();else p3Loop();
}
function ppClose(){
  if(!PP)return;
  PP.el.style.display='none';PP.auto=false;document.body.style.overflow=PP.bodyOv||'';
  var o=orderBy(PP.oid);if(o&&scOrderId===o.id&&$('planBox'))planRender(o);
}

/* ================= عناصر التكلفة ================= */
var CSTS=['مسودة','معتمدة'];
var CCATS=['ألواح خشب','إكسسوارات','أقمشة وجلود','دهانات ومواد تشطيب','حديد ورخام وزجاج','أخرى'];
var INST_K=['تركيب في الموقع','تحميل','تغليف','نقل'];
var IND_B=['مبلغ ثابت','% من التكلفة المباشرة','بالساعة'];
var DEF_OPS=['قص ألواح','قص CNC','حفر CNC','صنفرة','دهان','تجميع'];
var DEF_IND=['إشراف','كهرباء','صيانة','إيجار','إدارة'];
var COST={
  mats:{t:'1) المواد الرئيسية والإكسسوارات',cols:[['cat','الفئة','sel',CCATS],['name','البند','text'],['unit','الوحدة','text'],['qty','الكمية','number'],['price','سعر الوحدة','number']],tot:function(r){return num(r.qty)*num(r.price);},add:{cat:CCATS[0],name:'',unit:'',qty:'',price:''}},
  ops:{t:'2) عمليات التشغيل وساعات العمل',cols:[['name','العملية','text','dlOps'],['hours','ساعات العمل','number'],['rate','أجر الساعة','number'],['note','ملاحظات','text']],tot:function(r){return num(r.hours)*num(r.rate);},add:{name:'',hours:'',rate:'',note:''}},
  ext:{t:'3) الخدمات الخارجية (دهان / زجاج / غيرها)',cols:[['name','الخدمة','text','dlExt'],['vendor','الجهة / المورد','text'],['cost','التكلفة','number'],['note','ملاحظات','text']],tot:function(r){return num(r.cost);},add:{name:'',vendor:'',cost:'',note:''}},
  inst:{t:'4) ساعات التركيب والتحميل والتغليف',cols:[['name','النشاط','sel',INST_K],['hours','ساعات العمل','number'],['rate','أجر الساعة','number'],['note','ملاحظات','text']],tot:function(r){return num(r.hours)*num(r.rate);},add:{name:INST_K[0],hours:'',rate:'',note:''}},
  ind:{t:'5) المصاريف غير المباشرة',cols:[['name','البند','text','dlInd'],['basis','أساس الاحتساب','sel',IND_B],['value','القيمة','number'],['note','ملاحظات','text']],add:{name:'',basis:IND_B[1],value:'',note:''}}
};
var COST_KEYS=['mats','ops','ext','inst','ind'];
var costs={},costOrderId=null;
function getCost(id){return costs[id]||(costs[id]={status:CSTS[0],note:'',mats:[],ops:[],ext:[],inst:[],ind:[]});}
function indCost(r,S){var v=num(r.value);return r.basis===IND_B[1]?S.direct*v/100:r.basis===IND_B[2]?v*S.hrs:v;}
function rowTot(k,r,S){return k==='ind'?indCost(r,S):COST[k].tot(r);}
function costSum(c,o){
  var S={};
  function sum(k){return c[k].reduce(function(a,r){return a+COST[k].tot(r);},0);}
  function hrs(k){return c[k].reduce(function(a,r){return a+num(r.hours);},0);}
  S.mats=sum('mats');S.ops=sum('ops');S.ext=sum('ext');S.inst=sum('inst');
  S.hrsOps=hrs('ops');S.hrsInst=hrs('inst');S.hrs=S.hrsOps+S.hrsInst;
  S.direct=S.mats+S.ops+S.ext+S.inst;
  S.ind=c.ind.reduce(function(a,r){return a+indCost(r,S);},0);
  S.total=S.direct+S.ind;
  S.price=o?num(o.net)-num(o.tax):0;
  S.profit=S.price-S.total;
  S.margin=S.price>0?S.profit/S.price*100:0;
  return S;
}
function costCat(m){
  var n=m.name+' '+(m.code||'');
  if(/لوح|ألواح|خشب|MDF|قشرة/i.test(n))return CCATS[0];
  if(/مسمار|مسامير|مفصل|مقبض|إكسسوار|اكسسوار|سكة|عجل/.test(n))return CCATS[1];
  if(/قماش|جلد|إسفنج|اسفنج|كتان|مخمل/.test(n))return CCATS[2];
  if(/دهان|لاكيه|ورنيش|معجون|صبغ/.test(n))return CCATS[3];
  if(/حديد|رخام|زجاج|ماسورة|مواسير|ألمنيوم/.test(n))return CCATS[4];
  return CCATS[5];
}
function subText(c,S,k){
  var v={mats:S.mats,ops:S.ops,ext:S.ext,inst:S.inst,ind:S.ind}[k];
  return 'إجمالي القسم: '+fmt(v)+((k==='ops'||k==='inst')?' — '+fmt(k==='ops'?S.hrsOps:S.hrsInst)+' ساعة':'');
}
function costSumHtml(S){
  function row(l,v,bold){return '<tr><td>'+(bold?'<b>'+l+'</b>':l)+'</td><td class="num">'+(bold?'<b>'+fmt(v)+'</b>':fmt(v))+'</td><td class="num">'+(S.price>0&&v?fmt(v/S.price*100)+'%':'')+'</td></tr>';}
  return '<table class="rec"><thead><tr><th>عنصر التكلفة</th><th>المبلغ</th><th>% من سعر البيع</th></tr></thead><tbody>'+
    row('المواد الرئيسية والإكسسوارات',S.mats)+row('عمليات التشغيل ('+fmt(S.hrsOps)+' ساعة)',S.ops)+row('الخدمات الخارجية',S.ext)+
    row('التركيب والتحميل والتغليف ('+fmt(S.hrsInst)+' ساعة)',S.inst)+row('إجمالي التكلفة المباشرة',S.direct,true)+row('المصاريف غير المباشرة',S.ind)+
    row('إجمالي التكلفة',S.total,true)+row('سعر البيع (قبل الضريبة)',S.price)+
    '<tr class="'+(S.profit<0?'warn':'')+'"><td><b>الربح / الخسارة</b></td><td class="num '+(S.profit<0?'late':'')+'"><b>'+fmt(S.profit)+'</b></td><td class="num"><b>'+fmt(S.margin)+'%</b></td></tr></tbody></table>'+
    (S.price<=0?'<div class="note bad">سعر الطلب صفر، تأكد من أسعار الأصناف في الطلب.</div>':S.profit<0?'<div class="note bad">التكلفة أعلى من سعر البيع، راجع التسعير أو عناصر التكلفة.</div>':'');
}
function costTables(c,S){
  return COST_KEYS.map(function(k){
    var cf=COST[k];
    var head='<tr>'+cf.cols.map(function(col){return '<th>'+col[1]+'</th>';}).join('')+'<th>الإجمالي</th><th></th></tr>';
    var rows=c[k].map(function(r,i){
      return '<tr data-s="'+k+'" data-i="'+i+'">'+cf.cols.map(function(col){
        var v=r[col[0]]==null?'':r[col[0]],a='data-s="'+k+'" data-i="'+i+'" data-k="'+col[0]+'"';
        if(col[2]==='sel')return '<td><select '+a+'>'+col[3].map(function(o){return '<option'+(o===v?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select></td>';
        return '<td><input '+a+' type="'+col[2]+'"'+(col[2]==='number'?' step="any" min="0"':'')+(col[3]?' list="'+col[3]+'"':'')+' value="'+esc(v)+'"></td>';
      }).join('')+'<td class="num rt">'+fmt(rowTot(k,r,S))+'</td><td><button class="btn sm red" data-a="cdel" data-s="'+k+'" data-i="'+i+'" type="button" aria-label="حذف البند">×</button></td></tr>';
    }).join('');
    var extra=k==='mats'?'<button class="btn ghost sm" data-a="cload" type="button">تحميل الخامات من حصر المواد</button>':
      k==='ops'?'<button class="btn ghost sm" data-a="cdefops" type="button">إضافة العمليات المعتادة</button>':
      k==='ind'?'<button class="btn ghost sm" data-a="cdefind" type="button">إضافة البنود المعتادة</button>':'';
    return '<div class="card"><h2>'+cf.t+'</h2><div class="scroll"><table class="rec mt"><thead>'+head+'</thead><tbody>'+rows+'</tbody></table></div>'+
      '<div class="bar" style="margin-top:8px"><button class="btn ghost sm" data-a="cadd" data-s="'+k+'" type="button">+ إضافة بند</button>'+extra+'<b class="csub" data-s="'+k+'">'+subText(c,S,k)+'</b></div></div>';
  }).join('');
}
function renderCost(){
  var list=orders.filter(function(o){return o.status!==STATUS[5];}).sort(function(a,b){return (b.orderDate||'').localeCompare(a.orderDate||'')||(b.orderNo||'').localeCompare(a.orderNo||'');});
  var cur=orderBy(costOrderId);
  if(!cur||cur.status===STATUS[5])costOrderId=list[0]?list[0].id:null;
  var sel=$('costOrder');
  sel.innerHTML=list.length?list.map(function(o){return '<option value="'+o.id+'">'+esc(o.orderNo+' — '+o.custName)+'</option>';}).join(''):'<option value="">لا توجد طلبات</option>';
  sel.value=costOrderId||'';
  var el=$('costBody'),o=orderBy(costOrderId);
  if(!o){el.innerHTML='<div class="card"><div class="empty">سجّل طلبًا أولًا ثم حدّد عناصر تكلفته هنا.</div></div>';return;}
  var c=getCost(o.id),S=costSum(c,o);
  el.innerHTML='<div class="card"><h2>بطاقة تكلفة الطلب — '+esc(o.orderNo)+' ('+esc(o.custName)+')</h2><div class="grid">'+
    '<div><label for="cStatus">حالة التكلفة</label><select id="cStatus" data-c="status">'+CSTS.map(function(s){return '<option'+(s===c.status?' selected':'')+'>'+s+'</option>';}).join('')+'</select></div>'+
    '<div class="wide"><label for="cNote">ملاحظات</label><input id="cNote" data-c="note" value="'+esc(c.note)+'"></div></div>'+
    '<div class="bar" style="margin-top:12px"><button class="btn gold" data-a="cprint" type="button">طباعة بطاقة التكلفة</button></div></div>'+
    '<div class="card"><h2>ملخص التكلفة والربحية</h2><div id="costSum">'+costSumHtml(S)+'</div></div>'+costTables(c,S);
}
function recalcCost(){
  var o=orderBy(costOrderId);if(!o)return;
  var c=getCost(o.id),S=costSum(c,o);
  $('costBody').querySelectorAll('tr[data-s]').forEach(function(tr){var k=tr.dataset.s,r=c[k][+tr.dataset.i];if(r)tr.querySelector('.rt').textContent=fmt(rowTot(k,r,S));});
  $('costBody').querySelectorAll('.csub').forEach(function(b){b.textContent=subText(c,S,b.dataset.s);});
  $('costSum').innerHTML=costSumHtml(S);
}
function loadCostMats(o,c){
  var r=orderNeeds(o),agg={};
  r.items.forEach(function(it){agg[it.mat]=(agg[it.mat]||0)+it.need;});
  var have={};c.mats.forEach(function(x){have[lkey(x.name)]=1;});
  var n=0;
  Object.keys(agg).forEach(function(id){var m=matBy(id);if(!m||have[lkey(m.name)])return;c.mats.push({cat:costCat(m),name:m.name,unit:m.unit,qty:r3(agg[id]),price:num(m.price)});n++;});
  var miss=r.missing.length?' — أصناف بلا حصر مواد: '+r.missing.join('، '):'';
  toast(n?'تم تحميل '+n+' خامة من حصر المواد'+miss:'لا توجد خامات جديدة للتحميل'+miss);
}
function printCost(o){
  var c=getCost(o.id),S=costSum(c,o);
  var h='<h2>بطاقة تكلفة الطلب</h2>'+kv([['رقم الطلب',o.orderNo,'العميل',o.custName,'موعد التسليم',o.deliveryDate],['حالة التكلفة',c.status,'سعر البيع (قبل الضريبة)',fmt(S.price),'الربح / الهامش',fmt(S.profit)+' / '+fmt(S.margin)+'%']]);
  COST_KEYS.forEach(function(k){
    var cf=COST[k];
    if(!c[k].length)return;
    var ex=(k==='mats')?1:0;
    h+='<table><thead><tr><th colspan="'+(cf.cols.length+1+ex)+'">'+cf.t+'</th></tr><tr>'+(ex?'<th>الصورة</th>':'')+cf.cols.map(function(col){return '<th>'+col[1]+'</th>';}).join('')+'<th>الإجمالي</th></tr></thead><tbody>'+
      c[k].map(function(r){return '<tr>'+(ex?'<td>'+pImg(r.img||matImgByName(r.name))+'</td>':'')+cf.cols.map(function(col){return '<td>'+esc(r[col[0]])+'</td>';}).join('')+'<td>'+fmt(rowTot(k,r,S))+'</td></tr>';}).join('')+
      '<tr><td colspan="'+(cf.cols.length+ex)+'"><b>'+subText(c,S,k)+'</b></td><td></td></tr></tbody></table>';
  });
  h+=costSumHtml(S);
  if(c.note)h+=kv([['ملاحظات',c.note]]);
  openSheet(h+sigs(['مدير الإنتاج','المحاسب','مدير المبيعات','الاعتماد']));
}

/* ================= تحويل المواد والقطع بين الأقسام ================= */
var XFS=['بانتظار الاستلام','مستلم','مستلم بفروقات'];
var XFK=['صرف مواد خام','نقل قطع بين الأقسام'];
var XFMAP={xfDate:'date',xfOrder:'orderId',xfKind:'kind',xfFrom:'from',xfTo:'to',xfSender:'sender',xfReceiver:'receiver',xfNotes:'notes',xfRecvDate:'recvDate',xfRecvBy:'recvBy',xfRecvNote:'recvNote'};
function defDepts(){return ['قسم القص والـ CNC','قسم التجميع والتركيب','قسم الدهان','قسم التنجيد','قسم التغليف والتجهيز'].map(function(n,i){return {id:'dp'+(i+1),name:n,head:''};});}
var depts=defDepts(),xfers=[],xfDraft=null;
function sto(){cfg.store=cfg.store||{name:'المخزن الرئيسي',head:''};return cfg.store;}
function dept(id){
  if(id==='STORE')return {id:'STORE',name:sto().name||'المخزن',head:sto().head||''};
  return depts.find(function(d){return d.id===id;})||null;
}
function dname(id){var d=dept(id);return d?d.name:'—';}
function dopts(sel,store){
  return '<option value="">— اختر —</option>'+(store?'<option value="STORE">'+esc(sto().name||'المخزن')+' (مخزن)</option>':'')+
    depts.map(function(d){return '<option value="'+d.id+'">'+esc(d.name)+'</option>';}).join('');
}
function nextXfNo(){
  var y=new Date().getFullYear(),mx=0;
  xfers.forEach(function(p){var m=/-(\d+)$/.exec(p.no||'');if(m&&p.no.indexOf(String(y))>-1)mx=Math.max(mx,parseInt(m[1],10));});
  return 'TR-'+y+'-'+('0000'+(mx+1)).slice(-4);
}
function xfTag(s){return '<span class="st '+(s===XFS[1]?'done':s===XFS[2]?'todo':'part')+'">'+esc(s)+'</span>';}
function renderDepts(){
  var s=sto();
  $('deptBody').innerHTML='<tr><td>—</td><td><input data-i="S" data-k="name" value="'+esc(s.name||'')+'" aria-label="اسم المخزن"></td><td><input data-i="S" data-k="head" value="'+esc(s.head||'')+'" placeholder="أمين المخزن" aria-label="أمين المخزن"></td><td><span class="sub">مصدر الخامات</span></td></tr>'+
    depts.map(function(d,i){
      return '<tr><td>'+(i+1)+'</td><td><input data-i="'+i+'" data-k="name" value="'+esc(d.name)+'" aria-label="اسم القسم"></td><td><input data-i="'+i+'" data-k="head" value="'+esc(d.head||'')+'" placeholder="مسؤول القسم" aria-label="مسؤول القسم"></td><td><button class="btn sm red" data-a="deptdel" data-i="'+i+'" type="button">حذف</button></td></tr>';
    }).join('');
  var names=[];
  materials.forEach(function(m){if(m.name&&names.indexOf(m.name)<0)names.push(m.name);});
  products().forEach(function(p){if(p.name&&names.indexOf(p.name)<0)names.push(p.name);});
  $('dlXfItems').innerHTML=names.map(function(n){return '<option value="'+esc(n)+'">';}).join('');
}
function renderXfList(){
  var l=xfers.slice().sort(function(a,b){return (b.no||'').localeCompare(a.no||'');});
  $('xfTbl').innerHTML=l.length?
    '<thead><tr><th>رقم التحويل</th><th>التاريخ</th><th>الطلب</th><th>من</th><th>إلى</th><th>النوع</th><th>البنود</th><th style="min-width:260px">تفاصيل الأصناف المنقولة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>'+
    l.map(function(x){
      var o=orderBy(x.orderId);
      return '<tr><td><b>'+esc(x.no)+'</b></td><td class="num">'+esc(x.date)+'</td><td>'+(o?esc(o.orderNo)+'<span class="sub">'+esc(o.custName)+'</span>':'—')+'</td>'+
        '<td>'+esc(dname(x.from))+'<span class="sub">'+esc(x.sender||'')+'</span></td><td>'+esc(dname(x.to))+'<span class="sub">'+esc(x.receiver||'')+'</span></td><td>'+esc(x.kind)+'</td><td class="num">'+(x.items.length+(x.prods||[]).length)+'</td><td>'+xfListDetails(x)+'</td><td>'+xfTag(x.status)+'</td>'+
        '<td><div class="bar"><button class="btn sm ghost" data-a="xfp" data-id="'+x.id+'" type="button">طباعة</button><button class="btn sm ghost" data-a="xfe" data-id="'+x.id+'" type="button">'+(x.confirmed?'عرض':'استلام / تعديل')+'</button><button class="btn sm red" data-a="xfx" data-id="'+x.id+'" type="button">حذف</button></div></td></tr>';
    }).join('')+'</tbody>'
    :'<tbody><tr><td class="empty">لا توجد تحويلات. ابدأ بتحويل «صرف مواد خام» من المخزن إلى أول قسم.</td></tr></tbody>';
}
function renderXfLoc(){
  var by={};
  xfers.forEach(function(x){
    var o=orderBy(x.orderId);if(!o)return;
    var e=by[x.orderId]||(by[x.orderId]={o:o,cur:null,pend:null});
    if(x.confirmed){if(!e.cur||((x.recvDate||'')+x.no)>((e.cur.recvDate||'')+e.cur.no))e.cur=x;}
    else if(!e.pend||x.no>e.pend.no)e.pend=x;
  });
  var keys=Object.keys(by);
  $('xfLocTbl').innerHTML=keys.length?
    '<thead><tr><th>الطلب</th><th>العميل</th><th>الموقع الحالي (آخر استلام)</th><th>المسؤول</th><th style="min-width:240px">ما تم استلامه (الأصناف والقطع)</th><th>تحويل قيد الاستلام</th></tr></thead><tbody>'+
    keys.map(function(k){
      var e=by[k],cd=e.cur?dept(e.cur.to):null;
      return '<tr><td><b>'+esc(e.o.orderNo)+'</b></td><td>'+esc(e.o.custName)+'</td><td>'+(cd?esc(cd.name)+'<span class="sub">'+esc(e.cur.no)+' — '+esc(e.cur.status)+'</span>':'<span class="sub">لم يتم استلام أي تحويل بعد</span>')+'</td><td>'+esc(cd?(e.cur.receiver||cd.head||''):'')+'</td><td>'+(e.cur?xfRecvSummary(e.cur):'<span class="sub">—</span>')+'</td><td>'+(e.pend?esc(e.pend.no)+': من '+esc(dname(e.pend.from))+' إلى '+esc(dname(e.pend.to)):'—')+'</td></tr>';
    }).join('')+'</tbody>'
    :'<tbody><tr><td class="empty">تظهر هنا مواقع الطلبات بعد تسجيل التحويلات.</td></tr></tbody>';
}
function renderXfItems(){
  var d=xfDraft;
  $('xfBody').innerHTML=d.items.map(function(it,i){
    var df=(it.recv===''||it.recv==null)?null:num(it.recv)-num(it.sent);
    function t(k,type){return '<td><input data-i="'+i+'" data-k="'+k+'" type="'+type+'"'+(type==='number'?' step="any" min="0"':'')+(k==='name'?' list="dlXfItems"':'')+' value="'+esc(it[k]==null?'':it[k])+'"></td>';}
    return '<tr><td>'+(i+1)+'</td>'+t('name','text')+t('unit','text')+t('sent','number')+t('recv','number')+'<td class="num xfd'+(df?' late':'')+'">'+(df===null?'—':fmt(df))+'</td>'+t('note','text')+'<td><button class="btn sm red" data-a="xfdel" data-i="'+i+'" type="button" aria-label="حذف البند">×</button></td></tr>';
  }).join('');
}
function renderXfEd(){
  var d=xfDraft;$('xfEdit').style.display=d?'block':'none';if(!d)return;
  $('xfEdTitle').textContent=d._new?'تحويل جديد':'تحويل '+d.no;
  $('xfNo').value=d.no;
  $('xfOrder').innerHTML='<option value="">— اختر الطلب —</option>'+orders.filter(function(o){return o.id===d.orderId||(o.status!==STATUS[4]&&o.status!==STATUS[5]);}).map(function(o){return '<option value="'+o.id+'">'+esc(o.orderNo+' — '+o.custName)+'</option>';}).join('');
  $('xfKind').innerHTML=opt(XFK);
  $('xfFrom').innerHTML=dopts(d.from,true);
  $('xfTo').innerHTML=dopts(d.to,false);
  Object.keys(XFMAP).forEach(function(id){$(id).value=d[XFMAP[id]]==null?'':d[XFMAP[id]];});
  renderXfItems();xfRenderProds();xfRenderSheets();
  if(d._new)$('xfWithCuts').checked=(d.from!=='STORE');
  $('xfState').innerHTML=d.confirmed?'<div class="note '+(d.status===XFS[2]?'bad':'ok')+'">'+(d.status===XFS[2]?'تم الاستلام مع وجود فروقات في الأعداد (موضحة في عمود الفرق).':'تم الاستلام وتطابقت الأعداد المرسلة مع المستلمة.')+'</div>':'<div class="note">بانتظار تأكيد الاستلام ومطابقة الأعداد من القسم المستلِم.</div>';
  $('xfConfirm').style.display=d.confirmed?'none':'';
  $('xfReopen').style.display=d.confirmed?'':'none';
}
function openXf(x){
  if(!orders.length){toast('سجّل طلبًا أولًا');return;}
  if(!depts.length){toast('أضف الأقسام الإنتاجية أولًا');return;}
  xfDraft=x?JSON.parse(JSON.stringify(x)):{id:uid(),no:nextXfNo(),date:today(),orderId:'',kind:XFK[0],from:'STORE',to:depts[0].id,sender:sto().head||'',receiver:depts[0].head||'',notes:'',items:[{name:'',unit:'',sent:'',recv:'',note:''}],status:XFS[0],confirmed:false,recvDate:'',recvBy:'',recvNote:'',prods:[],sheets:[],_new:true};
  xfDraft.prods=xfDraft.prods||[];xfDraft.sheets=xfDraft.sheets||[];
  renderXfEd();$('xfEdit').scrollIntoView({block:'start'});
}
function xfCheck(d){
  var ps=d.prods||[],ss=d.sheets||[],i,j;
  if(!d.orderId)return 'اختر الطلب';
  if(!d.from||!d.to)return 'حدد القسم المسلِّم والقسم المستلِم';
  if(d.from===d.to)return 'القسم المسلِّم والمستلِم لا يمكن أن يكونا نفس الجهة';
  if(!d.items.length&&!ps.length&&!ss.length)return 'أضف بندًا أو صنفًا واحدًا على الأقل';
  var seen={};
  for(i=0;i<d.items.length;i++){
    var it=d.items[i];
    if(!(it.name||'').trim())return 'اكتب اسم المادة أو القطعة في كل بند';
    if(num(it.sent)<=0)return 'الكمية المرسلة للبند "'+it.name+'" يجب أن تكون أكبر من صفر';
    var k=lkey(it.name);if(seen[k])return 'البند "'+it.name+'" مكرر، اجمع كمياته في سطر واحد';seen[k]=1;
  }
  for(i=0;i<ps.length;i++){
    var p=ps[i];
    if(!(p.name||'').trim())return 'اكتب اسم الصنف في كل صنف ضمن تفاصيل الأصناف';
    if(num(p.sent)<=0)return 'الكمية المرسلة للصنف "'+p.name+'" يجب أن تكون أكبر من صفر';
    for(j=0;j<(p.cuts||[]).length;j++){
      var c=p.cuts[j];
      if(!(c.name||'').trim())return 'اكتب اسم كل قطعة في قائمة قطع "'+p.name+'"';
      if(num(c.sent)<=0)return 'الكمية المرسلة للقطعة "'+c.name+'" (صنف "'+p.name+'") يجب أن تكون أكبر من صفر';
    }
  }
  for(i=0;i<ss.length;i++){
    if(!(ss[i].name||'').trim())return 'اكتب اسم الخامة / اللوح في جدول الألواح';
    if(num(ss[i].sent)<=0)return 'عدد الألواح المرسلة للبند "'+ss[i].name+'" يجب أن يكون أكبر من صفر';
  }
  return '';
}
function xfPersist(d,msg){
  delete d._new;
  var i=xfers.findIndex(function(x){return x.id===d.id;});
  if(i>-1)xfers[i]=d;else xfers.push(d);
  xfDraft=null;renderXfer();schedSave();toast(msg);
}
function xfOverWarn(d){
  var o=orderBy(d.orderId);if(!o||!(d.prods||[]).length||d.kind===XFK[0])return '';
  var us=mfgUnits(o),w=[];
  d.prods.forEach(function(p){
    var u=us.find(function(x){return lkey(x.name)===lkey(p.name);});if(!u)return;
    var tot=num(p.sent);
    xfers.forEach(function(x){
      if(x.id===d.id||x.orderId!==d.orderId||x.from!==d.from||x.kind===XFK[0])return;
      (x.prods||[]).forEach(function(q){if(lkey(q.name)===lkey(p.name))tot+=num(q.sent);});
    });
    if(tot>u.qty+1e-9)w.push(p.name+' (محوّل '+fmt(tot)+' من '+fmt(u.qty)+')');
  });
  return w.length?' — تنبيه: كمية محوّلة أكبر من كمية الطلب: '+w.join('، '):'';
}
function xfBlankFix(d){if(!d.items.length&&!(d.prods||[]).length&&!(d.sheets||[]).length)d.items.push({name:'',unit:'',sent:'',recv:'',note:''});}
function xfSave(){
  var d=xfDraft;if(!d)return;
  xfClean(d);
  var err=xfCheck(d);
  if(err){xfBlankFix(d);toast(err);renderXfEd();return;}
  if(d.confirmed)d.status=xfHasDiff(d)?XFS[2]:XFS[1];
  else d.status=XFS[0];
  xfPersist(d,'تم حفظ التحويل '+d.no+xfOverWarn(d));
}
function xfConfirm(){
  var d=xfDraft;if(!d)return;
  xfClean(d);
  var err=xfCheck(d);
  if(err){xfBlankFix(d);toast(err);renderXfEd();return;}
  if(xfMissingRecv(d)){toast('أدخل الكمية المستلمة فعليًا لكل بند وصنف وقطعة ولوح (أو اضغط «استلام الكل مطابقًا» ثم عدّل الفروقات)');return;}
  var diff=xfHasDiff(d);
  if(diff&&!(d.recvNote||'').trim()){toast('توجد فروقات أو أصناف غير سليمة. اكتب سبب الفرق في ملاحظات المطابقة');return;}
  d.confirmed=true;d.status=diff?XFS[2]:XFS[1];d.recvDate=d.recvDate||today();
  xfPersist(d,diff?'تم الاستلام مع فروقات في الأعداد':'تم الاستلام وتطابقت الأعداد');
}
function xfLoadMat(){
  var d=xfDraft,o=orderBy(d.orderId);
  if(!o){toast('اختر الطلب أولًا');return;}
  var j=jobs[o.id],items=[];
  if(j&&j.issued){j.issued.items.forEach(function(it){var m=matBy(it.mat);if(m)items.push({name:matLabel(m),unit:m.unit||'',sent:it.qty,recv:'',note:''});});}
  else{
    var r=aggNeeds(o);
    if(r.missing.length){toast('أكمل حصر المواد للأصناف: '+r.missing.join('، '));return;}
    Object.keys(r.agg).forEach(function(id){var m=matBy(id);if(m)items.push({name:matLabel(m),unit:m.unit||'',sent:r3(r.agg[id]),recv:'',note:''});});
  }
  if(!items.length){toast('لا توجد خامات لتحميلها لهذا الطلب');return;}
  d.items=items;renderXfItems();toast(j&&j.issued?'تم تحميل الخامات المصروفة للتصنيع':'تم تحميل الخامات المحسوبة من الحصر (لم تُصرف بعد)');
}
function xfLoadParts(){
  var d=xfDraft,o=orderBy(d.orderId);
  if(!o){toast('اختر الطلب أولًا');return;}
  var items=mfgUnits(o).map(function(u){return {name:u.name,unit:'قطعة',sent:u.qty,recv:'',note:''};});
  if(!items.length){toast('لا توجد أصناف بكميات في هذا الطلب');return;}
  d.items=items;renderXfItems();toast('تم تحميل قطع الطلب، عدّل الكميات المرسلة عند الحاجة');
}
/* ===== تفاصيل الأصناف المنقولة: المقاسات + الأبواب + الأدراج + الرفوف + قائمة قطع القص + الألواح ===== */
var XFC=['سليم','ناقص','تالف / به عيب'];
var SHEET_AREA=122*244;
function secTotals(secs){
  var sh=0,dr=0;
  (secs||[]).forEach(function(sc){
    var k=sc.k||'shelves';
    if(k==='shelves')sh+=ci(sc.n,3,30);
    else if(k==='hang')sh+=ci(sc.n,1,1);
    else if(k==='drawers')dr+=ci(sc.n,3,12);
    else if(k==='combo'){sh+=ci(sc.n,3,30);dr+=ci(sc.m,2,10);}
    else if(k==='mix'){(sc.parts||[]).forEach(function(p){if(p.p==='shelves')sh+=ci(p.n,2,30);else if(p.p==='drawers')dr+=ci(p.n,2,12);});}
  });
  return {sh:sh,dr:dr,cols:(secs||[]).length};
}
/* مواصفات الصنف كما اعتُمدت في «مراجعة النطاق» (دون إنشاء بيانات جديدة) */
function xfSpec(o,u){
  var sc=scopes[o.id],d=(sc&&sc.items&&sc.items[scKey(u)])||{};
  var t=ftype(d,u.name),L=num(d.l),W=num(d.w),H=num(d.h),r=fdef(t,d,L),sh=r.shelves,dr=r.drawers,cols=1;
  if(hasInt(t)){
    var ss=secTotals(getSecs(d,t,L,r));cols=Math.max(1,ss.cols);
    if(d.shelves===''||d.shelves==null)sh=ss.sh;
    if(d.drawers===''||d.drawers==null)dr=ss.dr;
  }
  return {type:t,l:L,w:W,h:H,doors:r.doors,drawers:dr,shelves:sh,cols:cols,color:(d.czs&&d.czs.body&&d.czs.body.n)||(u.p&&u.p.color)||'',note:d.note||''};
}
function xfSpecOfProd(p){
  return {type:FT.indexOf(p.type)>-1?p.type:FT[0],l:num(p.l),w:num(p.w),h:num(p.h),doors:p.doors,drawers:p.drawers,shelves:p.shelves,cols:p.cols||1};
}
/* قائمة القطع القياسية (سم، السماكة بالمليمتر). تقديرية وفق قواعد النجارة المعتادة وتُعدَّل يدويًا */
function xfCutList(sp){
  var t=sp.type,L=sp.l,W=sp.w,H=sp.h,D=ci(sp.doors,0,12),N=ci(sp.drawers,0,20),S=ci(sp.shelves,0,60),C=Math.max(1,ci(sp.cols,1,12)),a=[],T=1.8;
  function c(n,l,w,th,per){if(per>0&&l>0&&w>0)a.push({name:n,l:r1(l),w:r1(w),t:th,per:per});}
  function carcass(l,w,h,cols,shelves){
    c('جانب خارجي',h,w,18,2);
    c('سقف',l-2*T,w,18,1);
    c('قاعدة',l-2*T,w,18,1);
    if(cols>1)c('فاصل رأسي',h-2*T,w-1,18,cols-1);
    c('رف داخلي',(l-2*T-(cols-1)*T)/cols,w-2,18,shelves);
    c('ظهر',l-0.4,h-0.4,6,1);
  }
  function drawers(n,iw,w,dh){
    c('واجهة درج',iw-0.4,dh-0.4,18,n);
    c('جانب درج',w-5,dh-3,15,2*n);
    c('مؤخرة درج',iw-3.4,dh-3,15,n);
    c('قاع درج',iw-3.4,w-6,6,n);
  }
  if(!(L>0&&W>0&&H>0))return a;
  if(t===FT[1]){
    var dz=N>0?H*0.25:0;
    carcass(L,W,H,C,S);
    if(D>0)c('باب',H-dz-0.4,L/D-0.3,18,D);
    if(N>0)drawers(N,(L-2*T-(C-1)*T)/C,W,Math.max(8,Math.min(25,dz/N)));
  }else if(t===FT[4]){
    carcass(L,W,H,C,S);
    if(D>0)c('باب',H-0.4,L*0.3/D-0.3,18,D);
    if(N>0)drawers(N,L*0.3-2*T,W,Math.max(8,Math.min(20,(H-2*T)/N)));
  }else if(t===FT[10]){
    carcass(L,W,H,1,0);
    if(N>0)drawers(N,L-2*T,W,Math.max(8,(H-2*T)/N));
  }else if(t===FT[9]){
    var bh=H*0.5;
    carcass(L,W,bh,1,0);
    if(N>0)drawers(N,L-2*T,W,Math.max(8,(bh-2*T)/N));
  }else if(t===FT[11]){
    carcass(L,W,H,C,S);
  }else if(t===FT[6]){
    var ul=L*0.28;
    c('سطح المكتب',L,W,25,1);
    carcass(ul,W,H-2.5,1,0);
    if(N>0)drawers(N,ul-2*T,W,Math.max(8,(H-2.5-2*T)/N));
    c('جانب المكتب',H-2.5,W,18,1);
    c('لوح ساتر خلفي',L*0.68,H*0.55,18,1);
  }else if(t===FT[5]){
    var lg=Math.max(5,Math.min(L,W)*0.07);
    c('سطح الطاولة',L,W,25,1);
    c('رجل',H-2.5,lg,Math.round(lg*10),4);
    c('عارضة طولية',L-2*lg-4,6,20,2);
    c('عارضة عرضية',W-2*lg-4,6,20,2);
  }else if(t===FT[2]){
    var rh=Math.max(15,H*0.25);
    c('لوح رأس السرير',W,H,18,1);
    c('عارضة جانبية',L,rh,18,2);
    c('عارضة القدم',W,rh,18,1);
    c('شريحة قاعدة المرتبة',W-2*T,6,18,Math.ceil(L/8));
  }else if(t===FT[7]){
    c('عارضة طولية (إطار)',L,12,25,2);
    c('عارضة جانبية (إطار)',W-5,12,25,2);
    c('رجل',Math.min(8,H*0.1),4,40,4);
    c('هيكل مسند الظهر',L*0.8,H*0.45,18,1);
  }else if(t===FT[8]){
    var lg2=Math.max(3,Math.min(L,W)*0.09);
    c('رجل أمامية',H*0.46,lg2,Math.round(lg2*10),2);
    c('رجل خلفية',H,lg2,Math.round(lg2*10),2);
    c('قاعدة المقعد',L,W,18,1);
    c('مسند الظهر',L,H*0.3,18,1);
  }else if(t===FT[3]){
    [['سرير',{type:FT[2],l:L*0.55,w:W*0.48,h:H*0.45},1],
     ['كومدينو',{type:FT[10],l:L*0.09,w:W*0.17,h:H*0.4,drawers:2},2],
     ['دولاب',{type:FT[1],l:L*0.38,w:W*0.3,h:H,doors:D||3,drawers:0,shelves:4,cols:1},1],
     ['تسريحة',{type:FT[9],l:L*0.25,w:W*0.28,h:H*0.85,drawers:N||3},1]
    ].forEach(function(q){
      xfCutList(q[1]).forEach(function(k){k.name=q[0]+' — '+k.name;k.per=k.per*q[2];a.push(k);});
    });
  }else if(t===FT[0]){
    c('لوح علوي / سفلي',L,W,18,2);
    c('جانب',H-2*T,W,18,2);
    c('وجه أمامي / خلفي',L-2*T,H-2*T,18,2);
  }
  return a;
}
function xfMkCuts(list,qty){return list.map(function(k){return {name:k.name,l:k.l,w:k.w,t:k.t,per:k.per,sent:r3(k.per*num(qty)),recv:'',note:''};});}
function xfDfV(a,b){return (a===''||a==null)?null:num(a)-num(b);}
function xfDfT(a,b){var v=xfDfV(a,b);return v===null?'—':fmt(v);}
function xfPcs(p,k){return (p.cuts||[]).reduce(function(s,c){return s+num(c[k]);},0);}
function xfHasDiff(d){
  function df(a,b){return a===''||a==null||Math.abs(num(a)-num(b))>1e-9;}
  if(d.items.some(function(i){return df(i.recv,i.sent);}))return true;
  if((d.prods||[]).some(function(p){return df(p.recv,p.sent)||(p.cond&&p.cond!==XFC[0])||(p.cuts||[]).some(function(c){return df(c.recv,c.sent);});}))return true;
  return (d.sheets||[]).some(function(s){return df(s.recv,s.sent);});
}
function xfMissingRecv(d){
  function mi(o){return num(o.sent)>0&&(o.recv===''||o.recv==null);}
  if(d.items.some(mi))return true;
  if((d.prods||[]).some(function(p){return mi(p)||(p.cuts||[]).some(mi);}))return true;
  return (d.sheets||[]).some(mi);
}
function xfClean(d){
  d.items=d.items.filter(function(i){return (i.name||'').trim()||num(i.sent)>0||num(i.recv)>0;});
  d.prods=(d.prods||[]).filter(function(p){return (p.name||'').trim()||num(p.sent)>0||num(p.recv)>0;});
  d.prods.forEach(function(p){p.cuts=(p.cuts||[]).filter(function(c){return (c.name||'').trim()||num(c.sent)>0||num(c.recv)>0;});});
  d.sheets=(d.sheets||[]).filter(function(s){return (s.name||'').trim()||num(s.sent)>0||num(s.recv)>0;});
}
function xfPSum(p){
  var e=[];
  if(num(p.doors)>0)e.push('أبواب '+num(p.doors));
  if(num(p.drawers)>0)e.push('أدراج '+num(p.drawers));
  if(num(p.shelves)>0)e.push('رفوف '+num(p.shelves));
  var dm=(num(p.l)>0&&num(p.w)>0&&num(p.h)>0)?fmt(num(p.l))+'×'+fmt(num(p.w))+'×'+fmt(num(p.h))+' سم':'';
  var pc=xfPcs(p,'sent');
  return (p.name||'—')+' ×'+fmt(num(p.sent))+(dm?' ('+dm+')':'')+(e.length?' — '+e.join('، '):'')+(pc?' — '+fmt(pc)+' قطعة قص':'');
}
function xfListDetails(x){
  var ps=x.prods||[],l=ps.slice(0,3).map(function(p){return esc(xfPSum(p));});
  if(ps.length>3)l.push('… و'+(ps.length-3)+' أصناف أخرى');
  var sh=(x.sheets||[]).reduce(function(s,k){return s+num(k.sent);},0);
  if(sh)l.push('ألواح: '+fmt(sh));
  return l.length?'<span class="sub" style="font-size:.82rem;color:inherit">'+l.join('<br>')+'</span>':'<span class="sub">—</span>';
}
function xfRecvSummary(x){
  var ps=x.prods||[];
  if(!ps.length)return '<span class="sub">'+(x.items.length?esc(x.items.length+' بند (دون تفاصيل أصناف)'):'—')+'</span>';
  return ps.slice(0,4).map(function(p){
    var pc=xfPcs(p,'recv');
    return esc((p.name||'—')+': استلم '+fmt(num(p.recv))+' من '+fmt(num(p.sent))+(pc?' — '+fmt(pc)+' قطعة':'')+(p.cond&&p.cond!==XFC[0]?' ('+p.cond+')':''));
  }).join('<br>')+(ps.length>4?'<br>… و'+(ps.length-4)+' أخرى':'');
}
function xfRenderProds(){
  var d=xfDraft,box=$('xfProds');if(!d||!box)return;
  var ps=d.prods||[];
  if(!ps.length){box.innerHTML='<p class="hint">لم تُضف تفاصيل أصناف بعد. اضغط «تحميل أصناف الطلب بمقاساتها» لسحب كل صنف بطوله وعرضه وارتفاعه وعدد أبوابه وأدراجه ورفوفه من «مراجعة النطاق».</p>';return;}
  box.innerHTML=ps.map(function(p,i){
    function f(k,lab,type,cls){return '<div'+(cls?' class="'+cls+'"':'')+'><label>'+lab+'</label><input data-p="'+i+'" data-k="'+k+'" type="'+(type||'text')+'"'+(type==='number'?' step="any" min="0"':'')+(k==='name'?' list="dlXfItems"':'')+' value="'+esc(p[k]==null?'':p[k])+'"></div>';}
    var ty=FT.indexOf(p.type)>-1?p.type:FT[0],r={doors:ci(p.doors,0,12),drawers:ci(p.drawers,0,20),shelves:ci(p.shelves,0,60)};
    var pS=xfPcs(p,'sent'),pR=xfPcs(p,'recv'),nc=(p.cuts||[]).length;
    var cuts='';
    if(p.open&&nc){
      cuts='<div class="scroll" style="margin-top:8px"><table class="rec mt"><thead><tr><th>م</th><th style="min-width:150px">القطعة</th><th>الطول (سم)</th><th>العرض (سم)</th><th>السماكة (مم)</th><th>العدد للوحدة</th><th>المرسل</th><th>المستلم</th><th>الفرق</th><th>ملاحظة</th><th></th></tr></thead><tbody>'+
        p.cuts.map(function(c,j){
          function g(k,type){return '<td><input data-p="'+i+'" data-c="'+j+'" data-k="'+k+'" type="'+type+'"'+(type==='number'?' step="any" min="0" style="width:84px"':'')+' value="'+esc(c[k]==null?'':c[k])+'"></td>';}
          var df=xfDfV(c.recv,c.sent);
          return '<tr><td>'+(j+1)+'</td>'+g('name','text')+g('l','number')+g('w','number')+g('t','number')+g('per','number')+g('sent','number')+g('recv','number')+'<td class="num xfd'+(df?' late':'')+'">'+(df===null?'—':fmt(df))+'</td>'+g('note','text')+'<td><button class="btn sm red" data-a="xfcutdel" data-p="'+i+'" data-c="'+j+'" type="button" aria-label="حذف القطعة">×</button></td></tr>';
        }).join('')+
        '<tr><td colspan="6"><b>إجمالي القطع</b></td><td class="num"><b>'+fmt(pS)+'</b></td><td class="num"><b>'+(pR?fmt(pR):'')+'</b></td><td></td><td colspan="2"></td></tr></tbody></table></div>'+
        '<div class="bar" style="margin-top:6px"><button class="btn ghost sm" data-a="xfcutadd" data-p="'+i+'" type="button">+ إضافة قطعة</button></div>';
    }
    return '<div class="pbox" data-pbox="'+i+'">'+
      '<div class="phead"><b>صنف '+(i+1)+'</b><span class="sub" style="flex:1;margin:0">'+esc(furnDesc(ty,r))+'</span>'+
      '<div class="bar"><button class="btn ghost sm" data-a="xfcutgen" data-p="'+i+'" type="button">حساب القطع من المقاسات</button>'+
      '<button class="btn ghost sm" data-a="xfpcuts" data-p="'+i+'" type="button">'+(p.open?'إخفاء القطع':'عرض القطع ('+nc+' بند / '+fmt(pS)+' قطعة)')+'</button>'+
      '<button class="btn sm red" data-a="xfpdel" data-p="'+i+'" type="button" aria-label="حذف الصنف">×</button></div></div>'+
      '<div class="grid">'+f('name','اسم الصنف','text','wide')+
      '<div><label>نوع الأثاث</label><select data-p="'+i+'" data-k="type">'+FT.map(function(x){return '<option'+(x===ty?' selected':'')+'>'+x+'</option>';}).join('')+'</select></div>'+
      f('l','الطول (سم)','number')+f('w','العرض (سم)','number')+f('h','الارتفاع (سم)','number')+
      f('doors','عدد الأبواب','number')+f('drawers','عدد الأدراج','number')+f('shelves','عدد الرفوف','number')+
      f('color','اللون / التشطيب','text')+
      f('sent','الكمية المرسلة (صنف)','number')+f('recv','المستلمة فعليًا (صنف)','number')+
      '<div><label>الفرق</label><div class="num xfd'+(xfDfV(p.recv,p.sent)?' late':'')+'" style="min-height:34px;padding-top:6px">'+xfDfT(p.recv,p.sent)+'</div></div>'+
      '<div><label>حالة الاستلام</label><select data-p="'+i+'" data-k="cond">'+XFC.map(function(x){return '<option'+(x===(p.cond||XFC[0])?' selected':'')+'>'+x+'</option>';}).join('')+'</select></div>'+
      f('note','ملاحظات الصنف','text','wide')+'</div>'+
      (nc&&!p.open?'<p class="hint" style="margin:6px 0 0">قائمة القص: '+nc+' بند، إجمالي '+fmt(pS)+' قطعة'+(pR?' (المستلم '+fmt(pR)+')':'')+'.</p>':'')+
      (p.open&&!nc?'<p class="hint" style="margin:6px 0 0">لا توجد قطع. أدخل المقاسات ثم اضغط «حساب القطع من المقاسات» أو أضف القطع يدويًا.</p><div class="bar"><button class="btn ghost sm" data-a="xfcutadd" data-p="'+i+'" type="button">+ إضافة قطعة</button></div>':'')+
      cuts+'</div>';
  }).join('');
}
function xfRenderSheets(){
  var d=xfDraft,t=$('xfSheets');if(!d||!t)return;
  var ss=d.sheets||[];
  t.innerHTML=ss.length?
    '<thead><tr><th>م</th><th style="min-width:200px">الخامة / اللوح</th><th>السماكة (مم)</th><th>مقاس اللوح (سم)</th><th>عدد الألواح المرسلة</th><th>المستلمة فعليًا</th><th>الفرق</th><th>ملاحظة</th><th></th></tr></thead><tbody>'+
    ss.map(function(s,i){
      function g(k,type){return '<td><input data-sh="'+i+'" data-k="'+k+'" type="'+type+'"'+(type==='number'?' step="any" min="0"':'')+(k==='name'?' list="dlXfItems"':'')+' value="'+esc(s[k]==null?'':s[k])+'"></td>';}
      var df=xfDfV(s.recv,s.sent);
      return '<tr><td>'+(i+1)+'</td>'+g('name','text')+g('t','number')+g('size','text')+g('sent','number')+g('recv','number')+'<td class="num xfd'+(df?' late':'')+'">'+(df===null?'—':fmt(df))+'</td>'+g('note','text')+'<td><button class="btn sm red" data-a="xfshdel" data-sh="'+i+'" type="button" aria-label="حذف">×</button></td></tr>';
    }).join('')+'</tbody>':
    '<tbody><tr><td class="empty">لا توجد ألواح. اضغط «حساب الألواح من قائمة القطع» أو أضفها يدويًا (يُستخدم عند صرف الخامات للقص أو عند تسليم الألواح المقصوصة).</td></tr></tbody>';
}
function xfLoadProds(){
  var d=xfDraft,o=orderBy(d.orderId);
  if(!o){toast('اختر الطلب أولًا');return;}
  var withCuts=$('xfWithCuts').checked,us=mfgUnits(o),noDim=[],prods=[];
  us.forEach(function(u){
    var sp=xfSpec(o,u);
    if(!(sp.l>0&&sp.w>0&&sp.h>0))noDim.push(u.name);
    var p={name:u.name,type:sp.type,sent:u.qty,recv:'',l:sp.l||'',w:sp.w||'',h:sp.h||'',doors:sp.doors||'',drawers:sp.drawers||'',shelves:sp.shelves||'',cols:sp.cols,color:sp.color,cond:'',note:'',cuts:[],open:withCuts};
    if(withCuts){
      p.cuts=xfMkCuts(xfCutList(sp),u.qty);
      if(sp.type===FT[3]&&p.cuts.length)p.note='غرفة نوم كاملة: القطع موزعة تقديريًا على السرير وكومدينوين ودولاب وتسريحة، وتُعدَّل حسب التصميم الفعلي';
    }
    prods.push(p);
  });
  if(!prods.length){toast('لا توجد أصناف بكميات في هذا الطلب');return;}
  d.prods=prods;
  if(d.items.every(function(i){return !(i.name||'').trim()&&!num(i.sent)&&!num(i.recv);}))d.items=[];
  renderXfItems();xfRenderProds();
  toast(noDim.length?'تم التحميل. أصناف بلا مقاسات في «مراجعة النطاق»: '+noDim.join('، '):'تم تحميل الأصناف بمقاساتها'+(withCuts?' وقوائم قطعها':''));
}
function xfCalcSheets(){
  var d=xfDraft,by={},keep=(d.sheets||[]).filter(function(s){return !s.auto;});
  (d.prods||[]).forEach(function(p){(p.cuts||[]).forEach(function(c){
    var t=num(c.t);if(!(t>0&&t<=25))return;
    by[t]=(by[t]||0)+num(c.l)*num(c.w)*num(c.sent);
  });});
  var ks=Object.keys(by).sort(function(a,b){return b-a;});
  if(!ks.length){toast('لا توجد قوائم قطع لحساب الألواح منها');return;}
  d.sheets=keep.concat(ks.map(function(k){return {name:'لوح خشب / MDF '+k+' مم',t:+k,size:'122×244',sent:Math.max(1,Math.ceil(by[k]*1.15/SHEET_AREA)),recv:'',note:'تقدير من قائمة القطع شاملًا 15% هالك',auto:true};}));
  xfRenderSheets();toast('تم حساب عدد الألواح تقديريًا، عدّله حسب القص الفعلي');
}
function xfRecvAll(){
  var d=xfDraft;
  function fill(o){if(num(o.sent)>0&&(o.recv===''||o.recv==null))o.recv=o.sent;}
  d.items.forEach(fill);(d.sheets||[]).forEach(fill);
  (d.prods||[]).forEach(function(p){fill(p);(p.cuts||[]).forEach(fill);});
  renderXfItems();xfRenderProds();xfRenderSheets();toast('تم اعتماد المستلم = المرسل لكل البنود. عدّل أي فرق قبل تأكيد الاستلام');
}
function xfDiffCell(t,o){
  var host=t.closest('tr')||t.closest('[data-pbox]'),td=host&&host.querySelector('.xfd');
  if(!td)return;
  var v=xfDfV(o.recv,o.sent);
  td.textContent=v===null?'—':fmt(v);td.classList.toggle('late',!!v&&Math.abs(v)>1e-9);
}
function xfPrintDetails(d){
  var ps=d.prods||[],h='',c=d.confirmed;
  if(ps.length){
    h+='<h3 style="margin:12px 0 4px">تفاصيل الأصناف المنقولة</h3><table><thead><tr><th>م</th><th>الصنف</th><th>الصورة</th><th>النوع</th><th>المقاس (طول×عرض×ارتفاع سم)</th><th>أبواب</th><th>أدراج</th><th>رفوف</th><th>اللون / التشطيب</th><th>المرسل</th><th>المستلم</th><th>الفرق</th><th>الحالة</th></tr></thead><tbody>'+
      ps.map(function(p,i){
        var dm=(num(p.l)>0||num(p.w)>0||num(p.h)>0)?fmt(num(p.l))+' × '+fmt(num(p.w))+' × '+fmt(num(p.h)):'';
        return '<tr><td>'+(i+1)+'</td><td>'+esc(p.name)+(p.note?'<br><small>'+esc(p.note)+'</small>':'')+'</td><td>'+pImg(p.img||prodImgByName(p.name))+'</td><td>'+esc(p.type)+'</td><td>'+dm+'</td><td>'+(num(p.doors)||'')+'</td><td>'+(num(p.drawers)||'')+'</td><td>'+(num(p.shelves)||'')+'</td><td>'+esc(p.color)+'</td><td>'+fmt(num(p.sent))+'</td><td>'+(c?fmt(num(p.recv)):'')+'</td><td>'+(c?fmt(num(p.recv)-num(p.sent)):'')+'</td><td>'+(c?esc(p.cond||XFC[0]):'')+'</td></tr>';
      }).join('')+'</tbody></table>';
    ps.forEach(function(p){
      if(!(p.cuts||[]).length)return;
      h+='<div class="brk"><h3 style="margin:12px 0 4px">قائمة القطع — '+esc(p.name)+' (عدد '+fmt(num(p.sent))+')</h3><table><thead><tr><th>م</th><th>القطعة</th><th>الطول (سم)</th><th>العرض (سم)</th><th>السماكة (مم)</th><th>العدد للوحدة</th><th>المرسل</th><th>المستلم</th><th>الفرق</th><th>ملاحظة</th></tr></thead><tbody>'+
        p.cuts.map(function(k,j){return '<tr><td>'+(j+1)+'</td><td>'+esc(k.name)+'</td><td>'+fmt(num(k.l))+'</td><td>'+fmt(num(k.w))+'</td><td>'+fmt(num(k.t))+'</td><td>'+fmt(num(k.per))+'</td><td>'+fmt(num(k.sent))+'</td><td>'+(c?fmt(num(k.recv)):'')+'</td><td>'+(c?fmt(num(k.recv)-num(k.sent)):'')+'</td><td>'+esc(k.note)+'</td></tr>';}).join('')+
        '<tr><td colspan="6"><b>إجمالي القطع</b></td><td><b>'+fmt(xfPcs(p,'sent'))+'</b></td><td><b>'+(c?fmt(xfPcs(p,'recv')):'')+'</b></td><td><b>'+(c?fmt(xfPcs(p,'recv')-xfPcs(p,'sent')):'')+'</b></td><td></td></tr></tbody></table></div>';
    });
  }
  if((d.sheets||[]).length){
    h+='<div class="brk"><h3 style="margin:12px 0 4px">الألواح</h3><table><thead><tr><th>م</th><th>الخامة / اللوح</th><th>الصورة</th><th>السماكة (مم)</th><th>المقاس (سم)</th><th>المرسل</th><th>المستلم</th><th>الفرق</th><th>ملاحظة</th></tr></thead><tbody>'+
      d.sheets.map(function(s,i){return '<tr><td>'+(i+1)+'</td><td>'+esc(s.name)+'</td><td>'+pImg(s.img||matImgByName(s.name))+'</td><td>'+(num(s.t)||'')+'</td><td>'+esc(s.size)+'</td><td>'+fmt(num(s.sent))+'</td><td>'+(c?fmt(num(s.recv)):'')+'</td><td>'+(c?fmt(num(s.recv)-num(s.sent)):'')+'</td><td>'+esc(s.note)+'</td></tr>';}).join('')+'</tbody></table></div>';
  }
  return h;
}
/* ===== ملخص القطع المحوّلة مجمّعة بالمقاس ===== */
function xfPcRows(){
  var fo=$('xpOrder').value,ff=$('xpFrom').value,ft=$('xpTo').value,st=$('xpSt').value,q=lkey($('xpQ').value),by=$('xpBy').checked,map={};
  xfers.forEach(function(x){
    if(fo&&x.orderId!==fo)return;if(ff&&x.from!==ff)return;if(ft&&x.to!==ft)return;
    if(st==='c'&&!x.confirmed)return;if(st==='p'&&x.confirmed)return;
    var o=orderBy(x.orderId);
    (x.prods||[]).forEach(function(pr){(pr.cuts||[]).forEach(function(c){
      if(q&&lkey(c.name).indexOf(q)<0)return;
      var k=[lkey(c.name),r1(num(c.l)),r1(num(c.w)),num(c.t),by?x.orderId:''].join('|');
      var r=map[k]||(map[k]={name:c.name,l:r1(num(c.l)),w:r1(num(c.w)),t:num(c.t),sent:0,recv:0,pend:0,ords:{},routes:{},prods:{}});
      r.sent+=num(c.sent);
      if(x.confirmed)r.recv+=num(c.recv);else r.pend+=num(c.sent);
      if(o)r.ords[o.orderNo]=1;
      r.routes[dname(x.from)+' ← '+dname(x.to)]=1;
      if(pr.name)r.prods[pr.name]=1;
    });});
  });
  return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){
    return String(a.name).localeCompare(String(b.name),'ar')||b.l-a.l||b.w-a.w||a.t-b.t;
  });
}
function xfPcFill(id,html){var e=$(id),v=e.value;e.innerHTML=html;e.value=v;if(e.value!==v)e.value='';}
function renderXfPieces(){
  if(!$('xpOrder'))return;
  var withCuts=orders.filter(function(o){return xfers.some(function(x){return x.orderId===o.id&&(x.prods||[]).some(function(p){return (p.cuts||[]).length;});});});
  xfPcFill('xpOrder','<option value="">كل الطلبات</option>'+withCuts.map(function(o){return '<option value="'+o.id+'">'+esc(o.orderNo+' — '+o.custName)+'</option>';}).join(''));
  xfPcFill('xpFrom','<option value="">الكل</option>'+dopts(null,true).replace('<option value="">— اختر —</option>',''));
  xfPcFill('xpTo','<option value="">الكل</option>'+dopts(null,false).replace('<option value="">— اختر —</option>',''));
  var by=$('xpBy').checked,rows=xfPcRows(),ts=0,tr=0,tp=0;
  $('xfPcTbl').innerHTML=rows.length?
    '<thead><tr><th>م</th><th>القطعة</th><th>الطول (سم)</th><th>العرض (سم)</th><th>السماكة (مم)</th><th>العدد المرسل</th><th>المستلم</th><th>بانتظار الاستلام</th><th>المسار</th>'+(by?'<th>الطلب</th>':'<th>الطلبات</th>')+'<th>من الأصناف</th></tr></thead><tbody>'+
    rows.map(function(r,i){
      ts+=r.sent;tr+=r.recv;tp+=r.pend;
      return '<tr><td>'+(i+1)+'</td><td><b>'+esc(r.name)+'</b></td><td class="num">'+fmt(r.l)+'</td><td class="num">'+fmt(r.w)+'</td><td class="num">'+(r.t||'')+'</td><td class="num"><b>'+fmt(r.sent)+'</b></td><td class="num">'+fmt(r.recv)+'</td><td class="num">'+(r.pend?fmt(r.pend):'')+'</td><td>'+esc(Object.keys(r.routes).join('، '))+'</td><td>'+esc(Object.keys(r.ords).join('، '))+'</td><td>'+esc(Object.keys(r.prods).join('، '))+'</td></tr>';
    }).join('')+
    '<tr><td colspan="5"><b>الإجمالي ('+rows.length+' مقاس / نوع)</b></td><td class="num"><b>'+fmt(ts)+'</b></td><td class="num"><b>'+fmt(tr)+'</b></td><td class="num"><b>'+fmt(tp)+'</b></td><td colspan="3"></td></tr></tbody>'
    :'<tbody><tr><td class="empty">لا توجد قطع محوّلة بعد. أضف قائمة قطع القص داخل تحويل «نقل قطع» لتظهر هنا مجمّعة بمقاساتها.</td></tr></tbody>';
}
function csvXfPieces(){
  var rows=xfPcRows();if(!rows.length){toast('لا توجد قطع للتصدير');return;}
  function q(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}
  var out=[['القطعة','الطول (سم)','العرض (سم)','السماكة (مم)','العدد المرسل','المستلم','بانتظار الاستلام','المسار','الطلبات','من الأصناف'].map(q).join(',')];
  rows.forEach(function(r){out.push([r.name,r.l,r.w,r.t,r.sent,r.recv,r.pend,Object.keys(r.routes).join(' | '),Object.keys(r.ords).join(' | '),Object.keys(r.prods).join(' | ')].map(q).join(','));});
  var b=new Blob(['\ufeff'+out.join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download='pieces-summary-'+today()+'.csv';document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);
}
function printXfPieces(){
  var rows=xfPcRows(),ts=0,tr=0;if(!rows.length){toast('لا توجد قطع للطباعة');return;}
  var fl=[];
  if($('xpOrder').value){var o=orderBy($('xpOrder').value);if(o)fl.push('الطلب',o.orderNo);}
  if($('xpFrom').value)fl.push('من قسم',dname($('xpFrom').value));
  if($('xpTo').value)fl.push('إلى قسم',dname($('xpTo').value));
  openSheet('<h2>ملخص القطع المحوّلة بين الأقسام بمقاساتها</h2>'+(fl.length?kv([fl]):'')+
    '<table><thead><tr><th>م</th><th>القطعة</th><th>الطول (سم)</th><th>العرض (سم)</th><th>السماكة (مم)</th><th>المرسل</th><th>المستلم</th><th>المسار</th><th>الطلبات</th></tr></thead><tbody>'+
    rows.map(function(r,i){ts+=r.sent;tr+=r.recv;return '<tr><td>'+(i+1)+'</td><td>'+esc(r.name)+'</td><td>'+fmt(r.l)+'</td><td>'+fmt(r.w)+'</td><td>'+(r.t||'')+'</td><td>'+fmt(r.sent)+'</td><td>'+fmt(r.recv)+'</td><td>'+esc(Object.keys(r.routes).join('، '))+'</td><td>'+esc(Object.keys(r.ords).join('، '))+'</td></tr>';}).join('')+
    '<tr><td colspan="5"><b>الإجمالي</b></td><td><b>'+fmt(ts)+'</b></td><td><b>'+fmt(tr)+'</b></td><td colspan="2"></td></tr></tbody></table>'+
    sigs(['مسؤول القص','مسؤول التجميع','مدير الإنتاج']));
}
function printXf(d){
  var o=orderBy(d.orderId)||{},f=dept(d.from)||{},t=dept(d.to)||{};
  var ts=0,tr=0;
  var rows=d.items.map(function(it,i){
    ts+=num(it.sent);tr+=num(it.recv);
    var df=num(it.recv)-num(it.sent);
    return '<tr><td>'+(i+1)+'</td><td>'+esc(it.name)+'</td><td>'+pImg(matImgByName(it.name)||prodImgByName(it.name))+'</td><td>'+esc(it.unit)+'</td><td>'+fmt(num(it.sent))+'</td><td>'+(d.confirmed?fmt(num(it.recv)):'')+'</td><td>'+(d.confirmed?fmt(df):'')+'</td><td>'+esc(it.note)+'</td></tr>';
  }).join('');
  openSheet('<h2>نموذج '+(d.kind===XFK[0]?'صرف واستلام مواد خام':'استلام قطع بين الأقسام')+'</h2>'+
    kv([['رقم التحويل',d.no,'التاريخ',d.date,'رقم الطلب',o.orderNo||''],['العميل',o.custName||'','من قسم',f.name||'','إلى قسم',t.name||''],['المسلِّم',d.sender||f.head||'','المستلِم',d.receiver||t.head||'','النوع',d.kind]])+
    (d.items.length?'<table><thead><tr><th>م</th><th>المادة / القطعة</th><th>الصورة</th><th>الوحدة</th><th>الكمية المرسلة</th><th>الكمية المستلمة فعليًا</th><th>الفرق</th><th>ملاحظة</th></tr></thead><tbody>'+rows+
    '<tr><td colspan="4"><b>الإجمالي</b></td><td><b>'+fmt(ts)+'</b></td><td><b>'+(d.confirmed?fmt(tr):'')+'</b></td><td><b>'+(d.confirmed?fmt(tr-ts):'')+'</b></td><td></td></tr></tbody></table>':'')+xfPrintDetails(d)+
    (d.confirmed?kv([['تاريخ الاستلام',d.recvDate||'','استلمه فعليًا',d.recvBy||'','نتيجة المطابقة',d.status]]):kv([['حالة التحويل',d.status]]))+
    (d.notes?kv([['ملاحظات التحويل',d.notes]]):'')+(d.recvNote?kv([['ملاحظات المطابقة',d.recvNote]]):'')+
    '<p>أقرّ المستلم بمطابقة الأعداد والكميات أعلاه لما استلمه فعليًا، وأن أي فرق مبيّن في خانة الفرق.</p>'+
    sigs(['مسؤول القسم المسلِّم','مسؤول القسم المستلِم','مراقب الجودة','مدير الإنتاج']));
}

/* ================= مجسم ثلاثي الأبعاد تفاعلي (Canvas بدون مكتبات خارجية) ================= */
var FVFIN=[['خشب فاتح',[226,190,130]],['بلوط',[200,156,98]],['جوزي',[118,76,50]],['أبيض',[240,238,233]],['رمادي',[152,158,164]],['أسود',[52,50,53]],['بيج',[218,200,170]],['أزرق',[96,128,160]]];
var FVBOOK=[[170,60,56],[60,100,140],[210,170,70],[70,120,90],[120,80,130],[205,205,200],[92,72,62]];
var FVS={};
function fvClamp(v){return v<0?0:v>255?255:Math.round(v);}
function fvSh(c,k){return [fvClamp(c[0]*k),fvClamp(c[1]*k),fvClamp(c[2]*k)];}
function fvMix(c,d,k){return [fvClamp(c[0]+(d[0]-c[0])*k),fvClamp(c[1]+(d[1]-c[1])*k),fvClamp(c[2]+(d[2]-c[2])*k)];}
function fvRnd(s){var x=Math.sin(s*12.9898+78.233)*43758.5453;return x-Math.floor(x);}
var CLRS=[['أبيض','#f1efe9'],['بيج','#dac8aa'],['كريمي','#efe3c8'],['خشب فاتح','#e2be82'],['بلوط','#c89c62'],['جوزي','#764c32'],['بني غامق','#4a2f22'],['ماهوجني','#6b2d24'],['رمادي فاتح','#b9bdc2'],['رمادي','#989ea4'],['رمادي غامق','#5c6168'],['أسود','#343235'],['أزرق','#6080a0'],['كحلي','#2c3e5c'],['أخضر','#5d7f5a'],['زيتي','#6b6b3a'],['أحمر','#9a2a2a'],['عنابي','#6c1c2c'],['وردي','#d9a3a8'],['ذهبي','#c9a24b']];
function fvHex(x){var m=/^#?([0-9a-f]{6})$/i.exec(x||'');return m?[parseInt(m[1].substr(0,2),16),parseInt(m[1].substr(2,2),16),parseInt(m[1].substr(4,2),16)]:null;}
function fvHexOf(c){return '#'+c.map(function(v){var s=v.toString(16);return s.length<2?'0'+s:s;}).join('');}
function clrName(hex){
  var c=fvHex(hex),best=null,bd=1e9;if(!c)return '';
  CLRS.forEach(function(k){var q=fvHex(k[1]),d=Math.pow(q[0]-c[0],2)+Math.pow(q[1]-c[1],2)+Math.pow(q[2]-c[2],2);if(d<bd){bd=d;best=k[0];}});
  return best;
}
function fvGuess(txt){
  var s=String(txt||''),m=/#[0-9a-f]{6}/i.exec(s),i,ks;
  if(m)return {cc:m[0].toLowerCase()};
  ks=CLRS.slice().sort(function(a,b){return b[0].length-a[0].length;});
  for(i=0;i<ks.length;i++)if(s.indexOf(ks[i][0])>-1)return {cc:ks[i][1]};
  if(/وايت|white/i.test(s))return {cc:CLRS[0][1]};
  if(/بلاك|اسود|black/i.test(s))return {cc:CLRS[11][1]};
  if(/جراي|فضي|gr[ae]y/i.test(s))return {cc:CLRS[9][1]};
  if(/ماهوجني|ونج|wenge|قهوة|بني/.test(s))return {cc:CLRS[5][1]};
  if(/ازرق|نيلي|blue/i.test(s))return {cc:CLRS[12][1]};
  if(/سنديان|oak/i.test(s))return {cc:CLRS[4][1]};
  return null;
}
/* ---- بناء الصناديق ---- */
function fvB(a,x,y,z,l,w,h,c,o){
  if(!(l>0&&w>0&&h>0))return;
  var b={x:x,y:y,z:z,l:l,w:w,h:h,c:c,rot:null,al:1,tag:'',bias:0,g:0,lay:1,inw:null,em:0,lt:null,pl:null,gr:null};
  if(o){
    if(o.em)b.em=1;if(o.lt)b.lt=o.lt;if(o.rot)b.rot=o.rot.slice();if(o.al)b.al=o.al;if(o.tag)b.tag=o.tag;if(o.bias)b.bias=o.bias;if(o.lay)b.lay=o.lay;
    if(o.sk){
      var hs=[l/2,w/2,h/2],cc=[x+hs[0],y+hs[1],z+hs[2]];
      b.inw=[[0,-1,0],[0,1,0],[-1,0,0],[1,0,0],[0,0,1]].map(function(n){
        return (n[0]*(o.sk[0]-(cc[0]+n[0]*hs[0]))+n[1]*(o.sk[1]-(cc[1]+n[1]*hs[1]))+n[2]*(o.sk[2]-(cc[2]+n[2]*hs[2])))>0;
      });
    }
  }
  a.push(b);
}
function fvGroup(arr,g){arr.forEach(function(b){b.g=g;});}
function fvShift(arr,dx,dy,dz){arr.forEach(function(b){b.x+=dx;b.y+=dy;b.z+=dz;if(b.pl){[b.pl.A,b.pl.B].forEach(function(L2){L2.forEach(function(p){p[0]+=dx;p[1]+=dy;p[2]+=dz;});});}if(b.rot)b.rot=b.rot.map(function(r){return {hx:r.hx+dx,hy:r.hy+dy,a:r.a};});});}
function fvRotAll(arr,hx,hy,ang){arr.forEach(function(b){(b.rot||(b.rot=[])).push({hx:hx,hy:hy,a:ang});});}
function fvPush(a,tmp){tmp.forEach(function(b){a.push(b);});}
function fvCorners(b){
  var x=b.x,y=b.y,z=b.z,X=x+b.l,Y=y+b.w,Z=z+b.h;
  var P=[[x,y,z],[X,y,z],[X,Y,z],[x,Y,z],[x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z]],i,j;
  if(b.rot)for(i=0;i<b.rot.length;i++){
    var r=b.rot[i],c=Math.cos(r.a),s=Math.sin(r.a);
    for(j=0;j<8;j++){var dx=P[j][0]-r.hx,dy=P[j][1]-r.hy;P[j][0]=r.hx+dx*c-dy*s;P[j][1]=r.hy+dx*s+dy*c;}
  }
  return P;
}
/* ---- مكونات ---- */
function fvDrawer(a,x,y,z,wd,dep,dh,slide,C){
  var yy=y-slide,ft=1.8;
  fvB(a,x+0.3,yy-ft,z+0.3,wd-0.6,ft,dh-0.6,C.dw,{lay:2});
  if(wd>14&&dh>9)fvB(a,x+2.3,yy-ft-0.3,z+2.3,wd-4.6,0.3,dh-4.6,C.dwi,{bias:3,lay:2});
  if(C.hs!=='n'){
    var hl=C.hs==='h'?Math.min(wd*0.55,30):10,hh2=C.hs==='h'?2.4:1.2;
    fvB(a,x+wd/2-hl/2,yy-ft-1.2,z+dh/2-hh2/2,hl,1.2,hh2,C.mt,{bias:4,lay:2});
  }
  if(slide>0.5){
    var th=Math.max(2,dh*0.6),tl=Math.max(4,dep-3);
    fvB(a,x+1.2,yy,z+1,wd-2.4,tl,0.8,C.wi);
    fvB(a,x+1.2,yy,z+1,0.8,tl,th,C.wi);
    fvB(a,x+wd-2,yy,z+1,0.8,tl,th,C.wi);
    fvB(a,x+1.2,yy+tl-0.8,z+1,wd-2.4,0.8,th,C.wi);
  }
}
function fvDrawerStack(a,x,y,wd,dep,zb,zt,n,open,C){
  if(n<1)return;
  var dh=(zt-zb)/n,j;
  for(j=0;j<n;j++)fvDrawer(a,x,y,zb+j*dh,wd,dep,dh,open*dep*0.5,C);
}
function fvGlassDoor(a,xs,y,zb,w,hh,dt,rot,C){
  var fw=Math.min(3.5,w/4),o={rot:rot,lay:2};
  fvB(a,xs,y-dt,zb,fw,dt,hh,C.fr,o);fvB(a,xs+w-fw,y-dt,zb,fw,dt,hh,C.fr,o);
  fvB(a,xs+fw,y-dt,zb+hh-fw,w-2*fw,dt,fw,C.fr,o);fvB(a,xs+fw,y-dt,zb,w-2*fw,dt,fw,C.fr,o);
  var P={clear:[[200,228,236],0.3],smoke:[[64,52,46],0.62],mirror:[[196,212,224],0.9]}[C.gt]||[[200,228,236],0.3];
  fvB(a,xs+fw,y-dt*0.65,zb+fw,w-2*fw,0.5,hh-2*fw,P[0],{rot:rot,lay:2,al:P[1],bias:2});
  fvGlassLight(a,xs,y,zb,w,hh,dt,fw,rot,C);
}
function fvDoors(a,x0,L,y,z0,z1,n,open,C){
  if(n<1||z1-z0<4)return;
  if(C.dt==='slide'&&n>1){fvSlideDoors(a,x0,L,y,z0,z1,n,open,C);return;}
  var dw=L/n,dt=1.8,k,gs=-1,ge=-2,ds=doorSides(C.dsm,C.dsl,n);
  if(C.gt){
    var gn=Math.min(n,Math.max(1,C.gn));
    if(C.gp==='all'){gs=0;ge=n-1;}else if(C.gp==='left'){gs=0;ge=gn-1;}else if(C.gp==='right'){gs=n-gn;ge=n-1;}else{gs=Math.floor((n-gn)/2);ge=gs+gn-1;}
  }
  for(k=0;k<n;k++){
    var left=ds[k]==='L',hx=x0+(left?k*dw:(k+1)*dw),rot=[{hx:hx,hy:y,a:(left?-1:1)*open*1.8}];
    var xs=left?hx+0.15:hx-dw+0.15,hgt=z1-z0;
    if(k>=gs&&k<=ge){fvGlassDoor(a,xs,y,z0+0.15,dw-0.3,hgt-0.3,dt,rot,C);continue;}
    fvB(a,xs,y-dt,z0+0.15,dw-0.3,dt,hgt-0.3,C.w,{rot:rot,lay:2});
    if(dw>16&&hgt>16)fvB(a,xs+3,y-dt-0.3,z0+3.15,dw-6.3,0.3,hgt-6.3,C.wi,{rot:rot,bias:3,lay:2});
    if(C.hs==='n')continue;
    var zh=(hgt>150?z0+100:(z0+z1)/2);
    if(C.hs==='h'){
      var hl=Math.min(dw*0.6,26),xh=left?hx+dw-3.5-hl:hx-dw+3.5;
      fvB(a,xh,y-dt-1.4,zh-1.5,hl,1.4,3,C.mt,{rot:rot,bias:4,lay:2});
    }else{
      var xh2=left?hx+dw-5.5:hx-dw+4.3;
      fvB(a,xh2,y-dt-1.4,zh-8,1.2,1.4,16,C.mt,{rot:rot,bias:4,lay:2});
    }
  }
}
function fvShelves(a,u0,wd,vlo,vhi,n,tk,y0,iw,C,books,seed){
  var gap=(vhi-vlo-n*tk)/(n+1),v=vlo,i,k;
  for(i=0;i<=n;i++){
    if(books&&gap>=15&&wd>=14){
      var x=u0+1.2,lim=u0+wd-1.2,kk=0;
      while(x<lim-2&&kk<40){
        var rr=fvRnd(seed+i*7+kk*3.1),bw=1.6+rr*2.6,bh=Math.min(gap-2,gap*(0.55+fvRnd(seed+kk+i)*0.4)),col=FVBOOK[Math.floor(fvRnd(seed+kk*5+i)*FVBOOK.length)];
        if(rr<0.12){x+=4+rr*20;kk++;continue;}
        if(x+bw>lim)break;
        fvB(a,x,y0+iw*0.12,v,bw,Math.min(iw*0.7,24),bh,col);
        x+=bw+0.15;kk++;
      }
    }
    v+=gap;
    if(i<n){fvB(a,u0,y0,v,wd,iw,tk,C.wi);if(fvL(C,'sh'))fvB(a,u0+1,y0+2,v-0.9,wd-2,Math.max(2,iw-4),0.8,C.LC.c,{em:1,lt:{r:Math.max(12,Math.min(wd*0.3,30)),a:0.3,vis:C.gt?'':'open'}});v+=tk;}
  }
}
function fvClothes(a,u0,wd,rd,vb,W,maxH,seed){
  var cnt=Math.max(1,Math.floor(wd/6.5)),k;
  for(k=0;k<cnt;k++){
    var ch=Math.min(rd-vb-4,maxH*(0.7+fvRnd(seed+k)*0.3)),col=fvMix(FVBOOK[Math.floor(fvRnd(seed+k*2)*FVBOOK.length)],[200,200,200],0.25);
    fvB(a,u0+(k+0.5)*wd/cnt-1.5,W*0.42-9,rd-ch,3,Math.min(W*0.6,40),ch-2,col);
  }
}
function fvMixRun(a,u0,wd,vlo,vhi,parts,tk,y0,iw,W,dep,sl,C,seed){
  var ml=mixLayout(parts||[],vlo,vhi,tk);
  ml.forEach(function(q,qi){
    var nq,dq,jj;
    if(q.p==='shelves')fvShelves(a,u0,wd,q.vlo,q.vhi,ci(q.n,2,30),tk,y0,iw,C,false,seed+qi*5);
    else if(q.p==='hang'){var rq=q.vhi-6;fvB(a,u0+0.8,W*0.42-1,rq-1,wd-1.6,2,2,C.rd);fvClothes(a,u0,wd,rq,q.vlo,W,Math.min(105,rq-q.vlo-2),seed+qi);}
    else if(q.p==='drawers'){nq=ci(q.n,2,12);dq=(q.vhi-q.vlo)/Math.max(nq,1);for(jj=0;jj<nq;jj++)fvDrawer(a,u0,0,q.vlo+jj*dq,wd,dep,dq,sl,C);}
    if(qi<ml.length-1)fvB(a,u0,y0,q.vlo-tk,wd,iw,tk,C.wi);
  });
}
function fvCab(a,L,W,H,o,C,open){
  var secs=o.secs||[{k:'shelves',n:3}],tk=secTk(L,H),base=o.base||0,bk=Math.min(1,W*0.04),lay=secLayout(secs,L,H),i;
  var vb=base+tk,vt=H-tk;
  var SK=o.skin?{sk:[L/2,W/2,(base+H)/2]}:null;
  fvB(a,0,0,base,tk,W,H-base,C.w,SK);fvB(a,L-tk,0,base,tk,W,H-base,C.w,SK);
  fvB(a,tk,0,base,L-2*tk,W,tk,C.w,SK);
  fvB(a,0,0,H-tk,L,W,tk,C.w,SK);
  fvB(a,tk,W-bk,base+tk,L-2*tk,bk,H-base-2*tk,C.wi,SK);
  if(base>0){
    if(o.legs){var lg=Math.max(2.5,Math.min(L,W)*0.05);fvB(a,0,0,0,lg,lg,base,C.bs);fvB(a,L-lg,0,0,lg,lg,base,C.bs);fvB(a,0,W-lg,0,lg,lg,base,C.bs);fvB(a,L-lg,W-lg,0,lg,lg,base,C.bs);}
    else fvB(a,tk*1.5,1.5,0,L-3*tk,W-3,base,C.bs);
  }
  if(o.z0>vb){fvB(a,tk,0,o.z0,L-2*tk,W-bk,tk,C.w);vb=o.z0+tk;}
  if(!lay||vt-vb<5)return;
  var hh=vt-vb,iw=W-bk-1,y0=1,u=tk,n=secs.length;
  secs.forEach(function(sc,i){
    var wd=lay.ws[i],k=sc.k||'shelves',u0=u,nn,m,j,dh,dm,cap,sv,rd,r1v,r2v,dep=W-bk-3,sl=open*dep*0.5;
    if(k==='shelves')fvShelves(a,u0,wd,vb,vt,ci(sc.n,3,30),tk,y0,iw,C,o.books,u0+i*13);
    else if(k==='hang'){
      nn=ci(sc.n,1,1);cap=vt;
      if(nn&&hh>45){sv=vt-32;fvB(a,u0,y0,sv,wd,iw,tk,C.wi);cap=sv;}
      rd=cap-6;fvB(a,u0+0.8,W*0.42-1,rd-1,wd-1.6,2,2,C.rd);fvClothes(a,u0,wd,rd,vb,W,105,u0+i);
    }else if(k==='hang2'){
      r1v=vt-6;r2v=hh>=190?r1v-100:(r1v+vb)/2;if(r2v<vb+25)r2v=vb+(r1v-vb)/2;
      fvB(a,u0+0.8,W*0.42-1,r1v-1,wd-1.6,2,2,C.rd);fvB(a,u0+0.8,W*0.42-1,r2v-1,wd-1.6,2,2,C.rd);
      fvClothes(a,u0,wd,r1v,r2v+4,W,Math.min(70,r1v-r2v-6),u0+i);fvClothes(a,u0,wd,r2v,vb,W,100,u0+i+9);
    }else if(k==='drawers'){
      nn=ci(sc.n,3,12);dh=hh/Math.max(nn,1);
      for(j=0;j<nn;j++)fvDrawer(a,u0,0,vb+j*dh,wd,dep,dh,sl,C);
    }else if(k==='combo'){
      nn=ci(sc.n,3,30);m=ci(sc.m,2,10);dh=Math.min(20,hh*0.4/Math.max(m,1));dm=m*dh;
      for(j=0;j<m;j++)fvDrawer(a,u0,0,vb+j*dh,wd,dep,dh,sl,C);
      if(m)fvB(a,u0,y0,vb+dm,wd,iw,tk,C.wi);
      fvShelves(a,u0,wd,vb+dm+(m?tk:0),vt,nn,tk,y0,iw,C,false,0);
    }else if(k==='mix'){
      var ml=mixLayout(sc.parts||[],vb,vt,tk);
      ml.forEach(function(q,qi){
        var nq,dq,jj;
        if(q.p==='shelves')fvShelves(a,u0,wd,q.vlo,q.vhi,ci(q.n,2,30),tk,y0,iw,C,false,u0+qi*5);
        else if(q.p==='hang'){var rq=q.vhi-6;fvB(a,u0+0.8,W*0.42-1,rq-1,wd-1.6,2,2,C.rd);fvClothes(a,u0,wd,rq,q.vlo,W,Math.min(105,rq-q.vlo-2),u0+qi);}
        else if(q.p==='drawers'){nq=ci(q.n,2,12);dq=(q.vhi-q.vlo)/Math.max(nq,1);for(jj=0;jj<nq;jj++)fvDrawer(a,u0,0,q.vlo+jj*dq,wd,dep,dq,sl,C);}
        if(qi<ml.length-1)fvB(a,u0,y0,q.vlo-tk,wd,iw,tk,C.wi);
      });
    }
    if(k==='bay'){
      var bt=bayTop(sc,vb,vt,tk),cls=sc.cols||[],cw=bayColW(cls,wd,tk),cu=u0,tn=(sc.top&&sc.top.on)?ci(sc.top.n,0,6):0;
      if(bt.has){fvB(a,u0,y0,bt.vcol,wd,iw,tk,C.wi);if(tn>0)fvShelves(a,u0,wd,vt-bt.h,vt,tn,tk,y0,iw,C,false,u0+3);}
      cls.forEach(function(cl,cj){
        fvMixRun(a,cu,cw[cj],vb,bt.vcol,cl.parts,tk,y0,iw,W,dep,sl,C,u0+cj*11+i);
        if(cj<cls.length-1)fvB(a,cu+cw[cj],0,vb,tk,W-bk,bt.vcol-vb,C.w);
        cu+=cw[cj]+tk;
      });
    }
    if(i<n-1)fvB(a,u0+wd,0,vb,tk,W-bk,hh,C.w);
    u+=wd+tk;
  });
}
function fvSafe(a,L,W,H,secs,vb,vt,C,open){
  var sf=C.sf;if(!sf||!secs)return;
  var lay=secLayout(secs,L,H);if(!lay)return;
  var tk=lay.tk,bk=Math.min(1,W*0.04),si=Math.max(0,Math.min(secs.length-1,(parseInt(sf.sec,10)||1)-1)),u0=tk,j;
  for(j=0;j<si;j++)u0+=lay.ws[j]+tk;
  var wd=lay.ws[si],SZ=SFSZN[sf.size]||SFSZN.m,sw=Math.min(SZ[0],wd-4),sd=Math.min(SZ[1],W-bk-8),sh=Math.min(SZ[2],vt-vb-2);
  if(sw<10||sd<8||sh<8)return;
  var x=u0+(wd-sw)/2,y=W-bk-sd-0.5,z=sf.pos==='floor'?vb:sf.pos==='top'?vt-sh:(vb+vt)/2-sh/2,steel=[74,79,86],tmp;
  fvB(a,x,y,z,sw,sd,sh,steel);
  fvB(a,x+1.5,y-0.5,z+1.5,sw-3,0.5,sh-3,[96,102,110],{bias:3});
  fvB(a,x+sw-6,y-1.8,z+sh/2-4,1.6,1.8,8,[204,206,210],{bias:4});
  if(sf.lock==='key')fvB(a,x+sw*0.25,y-1.2,z+sh*0.45,2,0.8,4,[210,170,70],{bias:4});
  else if(sf.lock==='fp')fvB(a,x+sw*0.22,y-1.2,z+sh*0.42,5,0.8,6,[60,170,120],{bias:4});
  else{fvB(a,x+sw*0.15,y-1.2,z+sh*0.5,sw*0.32,0.8,sh*0.34,[28,32,38],{bias:4});fvB(a,x+sw*0.2,y-1.4,z+sh*0.78,3,0.6,1.6,[90,200,120],{bias:5});}
  var px=x-1.5,pw=sw+3,pz=z-1.5,ph=sh+3,py=y-3.4;
  tmp=[];fvB(tmp,px,py,pz,pw,1.2,ph,C.wi,{lay:2});
  fvRotAll(tmp,px,py,-open*1.7);fvPush(a,tmp);
}
function fvWardrobe(a,L,W,H,secs,r,C,open){
  var z0=r.drawers>0?H*0.25:0,base=Math.min(6,H*0.04);
  fvCab(a,L,W,H,{secs:secs,base:base,z0:z0,skin:true},C,open);
  if(C.sf){var tk0=secTk(L,H),vb0=(z0>base+tk0)?z0+tk0:base+tk0;fvSafe(a,L,W,H,secs,vb0,H-tk0,C,open);}
  if(z0>0)fvDrawerStack(a,0,0,L,W-4,base,z0,r.drawers,open,C);
  fvDoors(a,0,L,0,z0>0?z0:base+0.3,H-0.3,r.doors,open,C);
  fvWardLight(a,L,W,H,C);
}
function fvHbTop(shape,W,H,y){
  var u=(y-W/2)/(W/2),s,au;u=Math.max(-1,Math.min(1,u));au=Math.abs(u);
  if(shape==='arch'){s=H*0.72;return s+(H-s)*Math.sqrt(1-u*u);}
  if(shape==='round'){s=H*0.5;return s+(H-s)*Math.sqrt(1-u*u);}
  if(shape==='step')return (y>=W*0.3&&y<=W*0.7)?H:H*0.74;
  if(shape==='wing'){s=H*0.76;return au<0.45?s:(au>=0.72?H:s+(H-s)*((au-0.45)/0.27));}
  if(shape==='peak'){s=H*0.68;return s+(H-s)*(1-au);}
  if(shape==='wave')return H*0.88+H*0.12*Math.cos(u*Math.PI*3);
  if(shape==='crown')return au<0.34?H:(au<0.68?H*0.86:H*0.72);
  if(shape==='chamfer')return au<0.72?H:H*(1-0.22*((au-0.72)/0.28));
  return H;
}
function fvHbPts(shape,W,H,y0,y1,z0,z1,m){
  var n=Math.max(2,Math.ceil((y1-y0)/Math.max(2,W/36))),ys=[],i,top=[],zt,mxz=0;
  for(i=0;i<=n;i++)ys.push(y0+(y1-y0)*i/n);
  var brk=shape==='step'?[W*0.3,W*0.7]:shape==='crown'?[W*0.16,W*0.33,W*0.67,W*0.84]:shape==='wing'?[W*0.275,W*0.14]:[];
  if(brk.length){brk.forEach(function(s){if(s>y0&&s<y1){ys.push(s-0.01);ys.push(s+0.01);}});ys.sort(function(a,b){return a-b;});}
  for(i=0;i<ys.length;i++){zt=Math.min(z1,fvHbTop(shape,W,H,ys[i])-m);if(zt<z0)zt=z0;if(zt>mxz)mxz=zt;top.push([ys[i],zt]);}
  if(mxz-z0<0.8)return null;
  return [[y0,z0],[y1,z0]].concat(top.reverse());
}
function fvBed(a,L,W,H,C){
  var hb=Math.max(4,L*0.03),lg=Math.min(12,H*0.12),fh=H*0.22,mh=Math.max(14,H*0.2),shape=C.hbs||'flat',dv=C.hbd||'none',plat=C.bst==='plat',ups=C.ups||'none';
  var hc=ups==='none'?C.w:C.up,hpc=ups==='none'?C.wi:fvMix(C.up,[255,255,255],0.1),fc=ups==='full'?C.up:C.w,bt=ups==='none'?C.dk:fvSh(C.up,0.66);
  var px0=hb,px1=hb+0.9,m=Math.max(2,H*0.05),gap=Math.max(1.2,W*0.008),y0=W*0.04,y1=W*0.96,z0=H*0.55,n=Math.max(2,Math.min(8,C.hbn||3)),i;
  if(shape==='flat')fvB(a,0,0,0,hb,W,H,hc);
  else fvPrism(a,'x',fvHbPts(shape,W,H,0,W,0,H,0),0,hb,hc,{sm:true});
  function panel(ya,yb,za,zb,xo,col,mm){
    var xx=px0+(xo||0),cc=col||hpc,mg=mm==null?m:mm;
    if(shape==='flat'){var zt=Math.min(zb,H-mg);if(zt-za>0.8&&yb-ya>0.8)fvB(a,xx,ya,za,0.9,yb-ya,zt-za,cc,{bias:2});return;}
    var pts=fvHbPts(shape,W,H,ya,yb,za,zb,mg);if(pts)fvPrism(a,'x',pts,xx,xx+0.9,cc,{bias:2,sm:true});
  }
  if(shape==='flat'&&dv==='none')fvB(a,0,W*0.04,H*0.55,hb+0.4,W*0.92,H*0.4,hpc);
  else if(dv==='vert'){var pw=(y1-y0-(n-1)*gap)/n;for(i=0;i<n;i++)panel(y0+i*(pw+gap),y0+i*(pw+gap)+pw,z0,H);}
  else if(dv==='horiz'){var bh=(H-m-z0-(n-1)*gap)/n;for(i=0;i<n;i++)panel(y0,y1,z0+i*(bh+gap),z0+i*(bh+gap)+bh);}
  else if(dv==='grid'){
    var rws=(H-m-z0)>60?3:2,cpw=(y1-y0-(n-1)*gap)/n,rbh=(H-m-z0-(rws-1)*gap)/rws,rr,cc2;
    for(rr=0;rr<rws;rr++)for(cc2=0;cc2<n;cc2++)panel(y0+cc2*(cpw+gap),y0+cc2*(cpw+gap)+cpw,z0+rr*(rbh+gap),z0+rr*(rbh+gap)+rbh);
  }
  else if(dv==='frame'){
    var im=Math.max(3,W*0.05);
    panel(y0,y1,z0,H);
    panel(y0+im,y1-im,z0+im,H,0.9,fvMix(hpc,[255,255,255],0.14),m+im);
  }
  else{
    panel(y0,y1,z0,H);
    if(dv==='tuft'||dv==='tuftx'){
      var big=dv==='tuftx',sp=big?Math.max(16,Math.min(26,W/6)):Math.max(10,Math.min(16,W/9)),bs=big?3.4:2,cols=Math.floor((y1-y0)/sp),rows=Math.floor((H*0.95-z0)/sp),r2,c2;
      for(r2=0;r2<rows;r2++)for(c2=0;c2<cols;c2++){
        var yb=y0+(c2+0.5+(r2%2?0.5:0))*sp,zb2=z0+(r2+0.5)*sp;
        if(yb>y1-2||zb2>fvHbTop(shape,W,H,yb)-m-2)continue;
        fvB(a,px1,yb-bs/2,zb2-bs/2,big?1.8:1.2,bs,bs,bt,{bias:4});
      }
    }
  }
  fvB(a,L-hb*0.7,0,0,hb*0.7,W,H*0.35,fc);
  if(ups==='full')fvB(a,L-hb*0.7-0.6,1,H*0.35,hb*0.7+1.2,W-2,2.2,fvMix(C.up,[255,255,255],0.12));
  if(plat){
    fvB(a,hb,0,2.2,L-hb*1.7,W,lg+fh-2.2,fc);
    fvB(a,hb+4,4,0,L-hb*1.7-8,W-8,2.2,C.dk);
  }else{
    fvB(a,hb,0,lg,L-hb*1.7,W,fh,fc);
    fvB(a,hb,2,0,3,3,lg,C.dk);fvB(a,hb,W-5,0,3,3,lg,C.dk);fvB(a,L-hb*0.7-3,2,0,3,3,lg,C.dk);fvB(a,L-hb*0.7-3,W-5,0,3,3,lg,C.dk);
  }
  var zt2=lg+fh;
  fvB(a,hb+1,2.5,zt2,L-hb*1.7-2,W-5,mh,C.ma);
  fvB(a,hb+(L-hb*1.7)*0.38,1.5,zt2+mh,(L-hb*1.7)*0.6,W-3,2.4,C.fa);
  fvB(a,hb+3,W*0.07,zt2+mh,Math.min(32,L*0.16),W*0.4,10,C.pl);fvB(a,hb+3,W*0.53,zt2+mh,Math.min(32,L*0.16),W*0.4,10,C.pl);
  if(C.LC){
    if(fvL(C,'hb'))fvPrism(a,'x',fvHbPts(shape,W,H,-1.6,W+1.6,0.5,H+1.6,-1.6),-0.9,-0.05,C.LC.c,{em:1,sm:true,lt:{r:Math.max(W,H)*0.6,a:0.5,pt:1}});
    if(fvL(C,'rl')){
      fvB(a,px1,W*0.1,H*0.78,2.5,4,1.6,C.LC.c,{em:1,lt:{r:Math.max(14,H*0.25),a:0.5,pt:1}});
      fvB(a,px1,W*0.9-4,H*0.78,2.5,4,1.6,C.LC.c,{em:1,lt:{r:Math.max(14,H*0.25),a:0.5,pt:1}});
    }
    if(fvL(C,'bs'))fvB(a,hb+4,4,0.1,L-hb*1.7-8,W-8,0.5,C.LC.c,{em:1,lt:{r:Math.max(L,W)*0.3,a:0.4,fl:1,pt:1}});
  }
}
function fvBuild(S,st){
  var a=[],t=S.t,L=S.L,W=S.W,H=S.H,r=S.r,open=st.open||0,F=(st.cc&&fvHex(st.cc))||FVFIN[st.ci||0][1],tmp,i,lg,th;
  var oo=st.o||{},cz=oo.cz||{},gl=oo.gl||{},hdc=fvHex(cz.handle),drc=fvHex(cz.drawer),bsc=fvHex(cz.base);
  var C={w:F,wi:fvMix(F,[255,255,255],0.16),dk:fvSh(F,0.7),mt:hdc||[182,146,76],rd:[182,146,76],dw:drc||F,dwi:fvMix(drc||F,[255,255,255],0.16),bs:bsc||hdc||fvSh(F,0.7),fr:bsc||[38,36,38],hs:oo.hs||'v',gt:gl.t||'',gp:gl.pos||'mid',gn:parseInt(gl.n,10)||2,gl:[176,218,230],fa:((st.set&&(t===FT[7]||t===FT[8]))?fvSh(F,1.05):[200,206,212]),ma:[240,238,232],pl:[252,252,250],tv:[26,28,32]};
  C.mir=oo.mir||'rect';C.ns=oo.ns||'rect';C.bst=oo.bst||'legs';C.hbs=oo.hbs||'flat';C.hbd=oo.hbd||'none';C.hbn=parseInt(oo.hbn,10)||3;C.ups=oo.ups||'none';C.up=fvHex(oo.upc)||[196,182,168];C.dl=oo.dl||'std';C.dsd=oo.dsd||'r';C.dax=oo.dax||'none';C.dxs=oo.dxs||'l';C.dst=oo.dst||'none';C.sf=(oo.sf&&oo.sf.on&&(t===FT[1]||t===FT[3]))?oo.sf:null;C.dt=(t===FT[1]||t===FT[3])?(oo.dt||'swing'):'swing';
  C.dsm=oo.dsm||'mid';C.dsl=oo.dsl||null;var lt0=oo.lt||{};C.gd=lt0.gd||{};C.LC=lt0.on?{c:fvHex(lt0.c)||[255,208,138],p:lt0.p||[]}:null;
  if(t===FT[0])fvB(a,0,0,0,L,W,H,C.w);
  else if(t===FT[1])fvWardrobe(a,L,W,H,S.secs,r,C,open);
  else if(t===FT[2])fvBed(a,L,W,H,C);
  else if(t===FT[3]){
    fvB(a,-6,-6,-1.2,L+12,W+12,1.2,[226,214,200],{tag:'floor'});
    tmp=[];fvBed(tmp,L*0.55,W*0.48,Math.min(H*0.45,110),C);fvShift(tmp,0,W*0.26,0);fvGroup(tmp,1);fvPush(a,tmp);
    var nsH=Math.min(H*0.22,55),nl=Math.min(W*0.17,45),nd=Math.max(30,Math.min(L*0.09,40)),ys=[W*0.26-nl-3,W*0.74+3];
    ys.forEach(function(y0,yi){tmp=[];fvNight(tmp,nl,nd,nsH,[{k:'drawers',n:2}],0,false,C,open);fvRotAll(tmp,0,0,Math.PI/2);fvShift(tmp,nd,y0,0);fvGroup(tmp,2+yi);fvPush(a,tmp);});
    var wl=L*0.38,wd=W*0.3;tmp=[];fvWardrobe(tmp,wl,wd,H,defSecs(FT[1],wl,r),r,C,open);fvShift(tmp,L*0.62,W-wd,0);fvGroup(tmp,4);fvPush(a,tmp);
    var dlx=Math.min(W*0.28,110),dly=Math.min(L*0.25,50),dH=Math.min(H*0.85,150);
    tmp=[];fvDresser(tmp,dlx,dly,dH,r.drawers||3,C,open);fvRotAll(tmp,0,0,-Math.PI/2);fvShift(tmp,L-dly,W*0.08+dlx,0);fvGroup(tmp,5);fvPush(a,tmp);
  }
  else if(t===FT[4]){
    var base=Math.max(3,H*0.1);
    fvCab(a,L,W,H,{secs:S.secs,base:base,legs:true,skin:true},C,open);
    fvDoors(a,0,L*0.3,0,base+0.3,H-0.3,r.doors,open,C);
    fvDrawerStack(a,L*0.7,0,L*0.3,W-4,base,H,r.drawers,open,C);
    var tl=Math.min(L*0.75,160),tx=(L-tl)/2,th2=tl*0.5625;
    var T2={lay:2};fvB(a,L/2-15,W*0.42,H,30,16,1.6,C.tv,T2);fvB(a,L/2-4,W*0.46,H+1.6,8,3,6,C.tv,T2);
    fvB(a,tx,W*0.46+3,H+7,tl,2.6,th2,C.tv,T2);fvB(a,tx+1.4,W*0.46+2.7,H+8.4,tl-2.8,0.3,th2-2.8,[30,44,66],{bias:3,lay:2});
  }
  else if(t===FT[5]){
    lg=Math.max(5,Math.min(L,W)*0.07);th=Math.max(3,H*0.06);
    fvB(a,2,2,0,lg,lg,H-th,C.w);fvB(a,L-lg-2,2,0,lg,lg,H-th,C.w);fvB(a,2,W-lg-2,0,lg,lg,H-th,C.w);fvB(a,L-lg-2,W-lg-2,0,lg,lg,H-th,C.w);
    fvB(a,2+lg,3,H-th-6,L-2*lg-4,2,6,C.wi);fvB(a,2+lg,W-5,H-th-6,L-2*lg-4,2,6,C.wi);
    fvB(a,3,2+lg,H-th-6,2,W-2*lg-4,6,C.wi);fvB(a,L-5,2+lg,H-th-6,2,W-2*lg-4,6,C.wi);
    fvB(a,0,0,H-th,L,W,th,C.w);
  }
  else if(t===FT[6]){
    th=Math.max(2.5,H*0.04);var ul=L*0.28;
    fvB(a,0,0,0,Math.max(2.5,Math.min(4,L*0.03)),W,H-th,C.w);
    fvB(a,L*0.04,W-2.5,H*0.3,L*0.68,1.6,H*0.55,C.wi);
    tmp=[];fvCab(tmp,ul,W,H-th,{secs:[{k:'drawers',n:r.drawers}],base:0},C,open);fvShift(tmp,L*0.72,0,0);fvPush(a,tmp);
    fvB(a,0,0,H-th,L,W,th,C.w);
  }
  else if(t===FT[7]){
    var n=Math.max(1,r.shelves||2),lh=Math.min(8,H*0.1),Hh=H-lh;
    fvB(a,2,2,0,4,4,lh,C.dk);fvB(a,L-6,2,0,4,4,lh,C.dk);fvB(a,2,W-6,0,4,4,lh,C.dk);fvB(a,L-6,W-6,0,4,4,lh,C.dk);
    fvB(a,0,0,lh,L*0.1,W,Hh*0.62,C.fa);fvB(a,L*0.9,0,lh,L*0.1,W,Hh*0.62,C.fa);
    fvB(a,L*0.1,0,lh,L*0.8,W,Hh*0.3,C.fa);
    fvB(a,L*0.1,W*0.78,lh+Hh*0.3,L*0.8,W*0.22,Hh*0.7,C.fa);
    for(i=0;i<n;i++){
      var cw=L*0.8/n,cx=L*0.1+cw*i;
      fvB(a,cx+0.3,0,lh+Hh*0.3,cw-0.6,W*0.78,Hh*0.14,fvSh(C.fa,1.08));
      fvB(a,cx+0.3,W*0.66,lh+Hh*0.44,cw-0.6,W*0.14,Hh*0.42,fvSh(C.fa,1.1));
    }
  }
  else if(t===FT[8]){
    lg=Math.max(3,Math.min(L,W)*0.09);
    fvB(a,0,0,0,lg,lg,H*0.46,C.w);fvB(a,L-lg,0,0,lg,lg,H*0.46,C.w);
    fvB(a,0,W-lg,0,lg,lg,H,C.w);fvB(a,L-lg,W-lg,0,lg,lg,H,C.w);
    fvB(a,0,0,H*0.46,L,W,H*0.07,C.fa);
    fvB(a,0,W-lg*0.9,H*0.62,L,lg*0.9,H*0.3,C.w);
    fvB(a,lg,W-lg*0.9,H*0.53,L-2*lg,lg*0.9,H*0.06,C.wi);
  }
  else if(t===FT[9])fvDresser(a,L,W,H,r.drawers||3,C,open);
  else if(t===FT[10]){
    var bs=Math.min(10,H*0.14);
    fvNight(a,L,W,H,S.secs,bs,true,C,open);
  }
  else if(t===FT[11])fvCab(a,L,W,H,{secs:S.secs,base:0,books:true,skin:true},C,open);
  else fvB(a,0,0,0,L,W,H,C.w);
  var G=oo.gr;if(G&&G.on&&fvHex(G.c2))fvGradient(a,C,F,fvHex(G.c2),G.dir||'h');
  return a;
}
function fvDresserBody(a,L,W,H,nd,C,open){
  var dl=C.dl||'std',bh=dl==='std'?H*0.5:Math.min(78,H*0.55),tt=2.5,dwid,right,tk;
  if(dl==='std')fvCab(a,L,W,bh,{secs:[{k:'drawers',n:nd}],base:0,skin:true},C,open);
  else{
    fvB(a,0,0,bh-tt,L,W,tt,C.w);
    dwid=Math.min(Math.max(28,L*0.3),46);
    var blk=function(x0,wd2){var t=[];fvCab(t,wd2,W,bh-tt,{secs:[{k:'drawers',n:nd}],base:0,skin:true},C,open);fvShift(t,x0,0,0);fvPush(a,t);};
    if(dl==='knee2'){dwid=Math.max(20,Math.min(dwid,(L-48)/2));blk(0,dwid);blk(L-dwid,dwid);fvB(a,dwid,W-1.8,bh-tt-14,L-2*dwid,1.8,14,C.w);}
    else if(dl==='knee'){
      dwid=Math.max(20,Math.min(dwid,L-48));right=(C.dsd||'r')==='r';tk=Math.max(1.6,Math.min(3,L*0.02));
      blk(right?L-dwid:0,dwid);fvB(a,right?0:L-tk,0,0,tk,W,bh-tt,C.w);fvB(a,right?tk:dwid,W-1.8,bh-tt-14,L-dwid-tk,1.8,14,C.w);
    }else{
      var lg=Math.max(3,Math.min(L,W)*0.06);
      fvB(a,0,0,0,lg,lg,bh-tt,C.w);fvB(a,L-lg,0,0,lg,lg,bh-tt,C.w);fvB(a,0,W-lg,0,lg,lg,bh-tt,C.w);fvB(a,L-lg,W-lg,0,lg,lg,bh-tt,C.w);
      fvB(a,lg,W-1.8,bh-tt-12,L-2*lg,1.8,12,C.w);
    }
  }
  var mh=H-bh-4,mw=L*0.8,mz=bh+3.5,cx=L/2,kind=C.mir||'rect',fy=W-1.6,gy=W-1.9,lit=fvL(C,'mr');
  var fcol=lit?C.LC.c:C.dk,fo={sm:true,em:lit?1:0,lt:lit?{r:Math.max(mw,mh)*0.6,a:0.5,pt:1}:null};
  if(mh<4)return;
  if(kind==='rect'){
    fvB(a,L*0.1-1.5,fy,bh+2,L*0.8+3,1.4,H-bh-1,fcol,fo);
    fvB(a,L*0.1,gy,bh+3.5,L*0.8,0.3,mh,[190,222,232],{bias:3});
  }else{
    fvPrism(a,'y',fvMirPts(kind,cx,mz,mw,mh,1.5),fy,fy+1.4,fcol,fo);
    fvPrism(a,'y',fvMirPts(kind,cx,mz,mw,mh,0),gy,fy,[190,222,232],{bias:3,sm:true});
  }
}
function fvDresser(a,L,W,H,nd,C,open){
  var ax=C.dax||'none',aw=0,xo=0,tmp,Lt,dl=C.dl||'std';
  if(ax!=='none'){aw=Math.max(20,Math.min(L*0.28,48));if(aw>L*0.45)aw=L*0.45;}
  Lt=L-aw;xo=(ax!=='none'&&(C.dxs||'l')==='l')?aw:0;
  tmp=[];fvDresserBody(tmp,Lt,W,H,nd,C,open);fvShift(tmp,xo,0,0);fvPush(a,tmp);
  if(ax!=='none'){
    var ax0=xo?0:Lt,Ht;tmp=[];
    if(ax==='tower'){Ht=Math.min(H*0.85,130);fvCab(tmp,aw,W,Ht,{secs:[{k:'drawers',n:Math.max(4,Math.round(Ht/22))}],base:0,skin:true},C,open);}
    else if(ax==='cab'){Ht=Math.min(H*0.85,140);fvCab(tmp,aw,W,Ht,{secs:[{k:'shelves',n:3}],base:0,skin:true},C,open);fvDoors(tmp,0,aw,0,0.3,Ht-0.3,1,open,C);}
    else{Ht=Math.min(H*0.9,150);fvCab(tmp,aw,W,Ht,{secs:[{k:'shelves',n:4}],base:0,skin:true},C,open);}
    fvShift(tmp,ax0,0,0);fvPush(a,tmp);
  }
  var sk=C.dst||'none';
  if(sk!=='none'){
    var sw2=Math.min(38,Math.max(24,Lt*0.4)),sz=Math.min(46,H*0.32),cush=[196,160,140],lg2=3,kc=Lt/2;
    if(dl==='knee'){var dw=Math.max(20,Math.min(Math.min(Math.max(28,Lt*0.3),46),Lt-48));kc=(C.dsd||'r')==='r'?(Lt-dw)/2:(dw+Lt)/2;}
    var sx=xo+kc-sw2/2,sy=dl==='std'?-sw2-4:-sw2*0.3;
    tmp=[];
    [[0,0],[sw2-lg2,0],[0,sw2-lg2],[sw2-lg2,sw2-lg2]].forEach(function(p){fvB(tmp,sx+p[0],sy+p[1],0,lg2,lg2,sz-5,C.dk);});
    fvB(tmp,sx,sy,sz-5,sw2,sw2,5,cush);
    if(sk==='chair'){fvB(tmp,sx,sy,sz,3,3,30,C.dk);fvB(tmp,sx+sw2-3,sy,sz,3,3,30,C.dk);fvB(tmp,sx+3,sy,sz+10,sw2-6,2.5,17,cush);}
    fvPush(a,tmp);
  }
  fvBaseGlow(a,L,C);
}
function fvSpec(d,name){
  var t=ftype(d,name),L=num(d.l),W=num(d.w),H=num(d.h);
  if(!(L>0&&W>0&&H>0))return null;
  var r=fdef(t,d,L);
  return {t:t,L:L,W:W,H:H,r:r,secs:hasInt(t)?getSecs(d,t,L,r):null};
}
/* ---- الإسقاط والرسم ---- */
var FVF=[[[0,1,5,4],0,-1,0],[[3,2,6,7],0,1,0],[[0,3,7,4],-1,0,0],[[1,2,6,5],1,0,0],[[4,5,6,7],0,0,1]];
function fvPolys(S,boxes,st,w,h){
  var i,j,k,mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9],cs=[];
  boxes.forEach(function(b){var P=fvCorners(b);cs.push(P);P.forEach(function(p){for(k=0;k<3;k++){if(p[k]<mn[k])mn[k]=p[k];if(p[k]>mx[k])mx[k]=p[k];}});});
  var cx=(mn[0]+mx[0])/2,cy=(mn[1]+mx[1])/2,cz=(mn[2]+mx[2])/2;
  var R=Math.sqrt(Math.pow(mx[0]-mn[0],2)+Math.pow(mx[1]-mn[1],2)+Math.pow(mx[2]-mn[2],2))/2;
  var GR={};boxes.forEach(function(b,bi){var g=GR[b.g]||(GR[b.g]={mn:[1e9,1e9,1e9],mx:[-1e9,-1e9,-1e9]});cs[bi].forEach(function(p){for(var k=0;k<3;k++){if(p[k]<g.mn[k])g.mn[k]=p[k];if(p[k]>g.mx[k])g.mx[k]=p[k];}});});
  var cyw=Math.cos(st.yaw),syw=Math.sin(st.yaw),cp=Math.cos(st.pit),sp=Math.sin(st.pit);
  var D0=R*2.7,D=D0/st.zoom,f=0.4*Math.min(w,h*1.25)*2.7;
  function cam(x,y,z){var px=x-cx,py=y-cy,pz=z-cz,x1=px*cyw-py*syw,y1=px*syw+py*cyw;return [x1,y1*sp+pz*cp,y1*cp-pz*sp+D];}
  function scr(c){var q=f/c[2];return [w/2+c[0]*q,h*0.5-c[1]*q+h*0.02];}
  function P2(x,y,z){return scr(cam(x,y,z));}
  Object.keys(GR).forEach(function(k){var g=GR[k],c=cam((g.mn[0]+g.mx[0])/2,(g.mn[1]+g.mx[1])/2,(g.mn[2]+g.mx[2])/2);g.d=Math.sqrt(c[0]*c[0]+c[1]*c[1]+c[2]*c[2]);});
  var LV=[-0.35,0.65,-0.68],ln=Math.sqrt(LV[0]*LV[0]+LV[1]*LV[1]+LV[2]*LV[2]);LV=[LV[0]/ln,LV[1]/ln,LV[2]/ln];
  var polys=[],glows=[];
  boxes.forEach(function(b,bi){
    var P=cs[bi],ang=0;
    if(b.lt){
      var lt=b.lt,lo=(b.l>=b.w&&b.l>=b.h)?[0,3,4,7]:(b.w>=b.h?[0,1,4,5]:[0,1,2,3]),hi=(b.l>=b.w&&b.l>=b.h)?[1,2,5,6]:(b.w>=b.h?[2,3,6,7]:[4,5,6,7]);
      var avg=function(ix){var s=[0,0,0];ix.forEach(function(q2){s[0]+=P[q2][0];s[1]+=P[q2][1];s[2]+=P[q2][2];});return [s[0]/ix.length,s[1]/ix.length,s[2]/ix.length];};
      var GA=avg(lo),GB=avg(hi),ex=Math.max(b.l,b.w,b.h),gn=lt.pt?1:Math.max(1,Math.min(16,Math.ceil(ex/(lt.r*0.9)))),gi,gt;
      if(lt.pt){GA=avg([0,1,2,3,4,5,6,7]);GB=GA;}
      for(gi=0;gi<gn;gi++){
        gt=gn===1?0.5:gi/(gn-1);
        var gp=[GA[0]+(GB[0]-GA[0])*gt,GA[1]+(GB[1]-GA[1])*gt,GA[2]+(GB[2]-GA[2])*gt],gc2=cam(gp[0],gp[1],gp[2]),gs=scr(gc2);
        if(gc2[2]>1)glows.push({x:gs[0],y:gs[1],r:lt.r*f/gc2[2],a:lt.a*(gn>1?0.8:1),col:b.c,fl:lt.fl,vis:lt.vis});
      }
    }
    if(b.pl){
      var PA=b.pl.A.map(function(p){return fvRotPt(p,b.rot);}),PB=b.pl.B.map(function(p){return fvRotPt(p,b.rot);}),nn=PA.length,ct=[0,0,0],jj,fcs=[{v:PA,cap:1},{v:PB,cap:1}];
      for(jj=0;jj<nn;jj++){ct[0]+=PA[jj][0]+PB[jj][0];ct[1]+=PA[jj][1]+PB[jj][1];ct[2]+=PA[jj][2]+PB[jj][2];}
      ct=[ct[0]/(2*nn),ct[1]/(2*nn),ct[2]/(2*nn)];
      for(jj=0;jj<nn;jj++){var j2=(jj+1)%nn;fcs.push({v:[PA[jj],PA[j2],PB[j2],PB[jj]],cap:0});}
      fcs.forEach(function(fc){
        var V=fc.v,m=V.length,nx=0,ny=0,nz=0,gx=0,gy=0,gz=0,q,q2,p1,p2;
        for(q=0;q<m;q++){q2=(q+1)%m;p1=V[q];p2=V[q2];nx+=(p1[1]-p2[1])*(p1[2]+p2[2]);ny+=(p1[2]-p2[2])*(p1[0]+p2[0]);nz+=(p1[0]-p2[0])*(p1[1]+p2[1]);gx+=p1[0];gy+=p1[1];gz+=p1[2];}
        var nl=Math.sqrt(nx*nx+ny*ny+nz*nz);if(nl<1e-9)return;
        nx/=nl;ny/=nl;nz/=nl;gx/=m;gy/=m;gz/=m;
        if(nx*(gx-ct[0])+ny*(gy-ct[1])+nz*(gz-ct[2])<0){nx=-nx;ny=-ny;nz=-nz;}
        var n1x=nx*cyw-ny*syw,n1y=nx*syw+ny*cyw,ncx=n1x,ncy=n1y*sp+nz*cp,ncz=n1y*cp-nz*sp,gc=cam(gx,gy,gz);
        if(ncx*gc[0]+ncy*gc[1]+ncz*gc[2]>=0)return;
        var dot=ncx*LV[0]+ncy*LV[1]+ncz*LV[2],br=0.68+0.32*Math.max(0,dot);
        var rgb=b.em?[b.c[0],b.c[1],b.c[2]]:[fvClamp(b.c[0]*br),fvClamp(b.c[1]*br),fvClamp(b.c[2]*br)];
        rgb=fvGrad(b,rgb,br,ct,ct);
        var cc2=V.map(function(p){return cam(p[0],p[1],p[2]);}),sx=0,sy=0,sz=0,ee=[];
        cc2.forEach(function(c){sx+=c[0];sy+=c[1];sz+=c[2];});sx/=m;sy/=m;sz/=m;
        for(q=0;q<m;q++)ee.push(fc.cap?true:(b.pl.sm?(q===0||q===2):true));
        polys.push({p:cc2.map(scr),rgb:rgb,al:b.al,e:ee,gd:GR[b.g].d,ly:b.tag==='floor'?-1:b.lay,d:Math.sqrt(sx*sx+sy*sy+sz*sz)-b.bias,em:b.em,oc:(b.lt&&b.lt.vis==='open')?1:0});
      });
      return;
    }
    if(b.rot)b.rot.forEach(function(r){ang+=r.a;});
    var ca=Math.cos(ang),sa=Math.sin(ang);
    FVF.forEach(function(F,fi){
      var lyr=b.inw?(b.inw[fi]?0:2):b.lay;
      var nx=F[1]*ca-F[2]*sa,ny=F[1]*sa+F[2]*ca,nz=F[3];
      var n1x=nx*cyw-ny*syw,n1y=nx*syw+ny*cyw,ncx=n1x,ncy=n1y*sp+nz*cp,ncz=n1y*cp-nz*sp;
      var Q=F[0].map(function(ix){return P[ix];});
      var gx=(Q[0][0]+Q[2][0])/2,gy=(Q[0][1]+Q[2][1])/2,gz=(Q[0][2]+Q[2][2])/2,gc=cam(gx,gy,gz);
      if(ncx*gc[0]+ncy*gc[1]+ncz*gc[2]>=0)return;
      var dot=ncx*LV[0]+ncy*LV[1]+ncz*LV[2],br=0.68+0.32*Math.max(0,dot);
      var rgb=b.em?[b.c[0],b.c[1],b.c[2]]:[fvClamp(b.c[0]*br),fvClamp(b.c[1]*br),fvClamp(b.c[2]*br)];
      var v0=Q[0],v1=Q[1],v3=Q[3];
      var l1=Math.sqrt(Math.pow(v1[0]-v0[0],2)+Math.pow(v1[1]-v0[1],2)+Math.pow(v1[2]-v0[2],2));
      var l2=Math.sqrt(Math.pow(v3[0]-v0[0],2)+Math.pow(v3[1]-v0[1],2)+Math.pow(v3[2]-v0[2],2));
      var ns=1,nt=1,si,ti;
      if(b.gr&&!b.em){var gax=b.gr.ax,ds=Math.abs(v1[gax]-v0[gax]),dt2=Math.abs(v3[gax]-v0[gax]),span=(b.gr.mx-b.gr.mn)||1,kk=Math.max(1,Math.min(14,Math.ceil(Math.max(ds,dt2)/span*28)));if(ds>=dt2){if(ds>0.01)ns=kk;}else if(dt2>0.01)nt=kk;}
      function pt(s,t){return [v0[0]+(v1[0]-v0[0])*s+(v3[0]-v0[0])*t,v0[1]+(v1[1]-v0[1])*s+(v3[1]-v0[1])*t,v0[2]+(v1[2]-v0[2])*s+(v3[2]-v0[2])*t];}
      for(si=0;si<ns;si++)for(ti=0;ti<nt;ti++){
        var s0=si/ns,s1=(si+1)/ns,t0=ti/nt,t1=(ti+1)/nt;
        var cc=[pt(s0,t0),pt(s1,t0),pt(s1,t1),pt(s0,t1)].map(function(p){return cam(p[0],p[1],p[2]);});
        var mx2=(cc[0][0]+cc[2][0])/2,my2=(cc[0][1]+cc[2][1])/2,mz2=(cc[0][2]+cc[2][2])/2;
        polys.push({p:cc.map(scr),rgb:fvGrad(b,rgb,br,pt(s0,t0),pt(s1,t1)),al:b.al,e:[ti===0,si===ns-1,ti===nt-1,si===0],gd:GR[b.g].d,ly:b.tag==='floor'?-1:lyr,d:Math.sqrt(mx2*mx2+my2*my2+mz2*mz2)-b.bias,em:b.em,oc:(b.lt&&b.lt.vis==='open')?1:0});
      }
    });
  });
  polys.sort(function(A,B){if(A.ly<0||B.ly<0)return A.ly-B.ly;if(A.gd!==B.gd)return B.gd-A.gd;if(A.ly!==B.ly)return A.ly-B.ly;return B.d-A.d;});
  var pad=Math.max(mx[0]-mn[0],mx[1]-mn[1])*0.45+8,fz=mn[2];
  var floor=[P2(mn[0]-pad,mn[1]-pad,fz),P2(mx[0]+pad,mn[1]-pad,fz),P2(mx[0]+pad,mx[1]+pad,fz),P2(mn[0]-pad,mx[1]+pad,fz)];
  var sg=Math.max(mx[0]-mn[0],mx[1]-mn[1])*0.03+2;
  var shadow=[P2(mn[0]-sg,mn[1]-sg,fz),P2(mx[0]+sg*2,mn[1]-sg,fz),P2(mx[0]+sg*2,mx[1]+sg*2,fz),P2(mn[0]-sg,mx[1]+sg*2,fz)];
  var off=Math.max(S.L,S.W,S.H)*0.08+6,segs=[],labels=[];
  function dim(x1,y1,z1,x2,y2,z2,txt){
    var A=P2(x1,y1,z1),B=P2(x2,y2,z2),M=P2((x1+x2)/2,(y1+y2)/2,(z1+z2)/2);
    segs.push([A[0],A[1],B[0],B[1]]);labels.push({x:M[0],y:M[1],t:txt});
  }
  var ox=mn[0],oy=mn[1];
  dim(ox,oy-off,fz,ox+S.L,oy-off,fz,'الطول '+fmt(S.L));
  dim(mx[0]+off,oy,fz,mx[0]+off,oy+S.W,fz,'العرض '+fmt(S.W));
  dim(ox-off,oy-off,fz,ox-off,oy-off,fz+S.H,'الارتفاع '+fmt(S.H));
  return {polys:polys,glows:glows,floor:floor,shadow:shadow,segs:segs,labels:labels};
}
function fvPaint(ctx,w,h,S,st){
  var LT0=(st.o&&st.o.lt&&st.o.lt.on)?st.o.lt:null,NG=!!(LT0&&LT0.nt!==false&&S);
  var g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,NG?'#2a2e4d':'#fbf6f0');g.addColorStop(1,NG?'#1b1e36':'#efe6dc');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  if(!S){
    ctx.fillStyle='#76696a';ctx.font='15px Tahoma,sans-serif';ctx.textAlign='center';
    ctx.fillText('أدخل الطول والعرض والارتفاع لعرض المجسم ثلاثي الأبعاد',w/2,h/2);return;
  }
  var boxes=fvBuild(S,st),R=fvPolys(S,boxes,st,w,h);
  function path(p){ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);for(var i=1;i<p.length;i++)ctx.lineTo(p[i][0],p[i][1]);ctx.closePath();}
  path(R.floor);ctx.fillStyle=NG?'#34334a':'#e6dccf';ctx.fill();ctx.strokeStyle=NG?'#45445c':'#d3c5b4';ctx.lineWidth=1;ctx.stroke();
  path(R.shadow);ctx.fillStyle=NG?'rgba(0,0,0,0.4)':'rgba(60,38,28,0.2)';ctx.fill();
  ctx.lineJoin='round';
  R.polys.forEach(function(q){
    var qr=(NG&&!q.em)?[Math.round(q.rgb[0]*0.46),Math.round(q.rgb[1]*0.5),Math.round(q.rgb[2]*0.72)]:q.rgb,col='rgb('+qr[0]+','+qr[1]+','+qr[2]+')';
    path(q.p);ctx.globalAlpha=q.al;ctx.fillStyle=col;ctx.fill();
    if(q.al>=1){ctx.strokeStyle=col;ctx.lineWidth=0.8;ctx.stroke();}
    ctx.globalAlpha=Math.min(1,q.al*0.9);ctx.strokeStyle='rgba(40,18,10,0.4)';ctx.lineWidth=0.7;
    var nk=q.p.length;for(var k=0;k<nk;k++)if(q.e[k]){var A=q.p[k],B=q.p[(k+1)%nk];ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();}
    ctx.globalAlpha=1;
  });
  if(LT0&&R.glows.length){
    var LI=Math.max(0.2,Math.min(1,(parseFloat(LT0.i)||80)/100));
    ctx.save();ctx.globalCompositeOperation=NG?'lighter':'source-over';
    R.glows.forEach(function(gl){
      var aa=gl.a*LI*(gl.vis==='open'?Math.min(1,(st.open||0)*2.5):1)*(NG?1:0.55);
      if(aa<=0.01||gl.r<1)return;
      var rc=gl.col,c0='rgba('+rc[0]+','+rc[1]+','+rc[2]+',';
      ctx.save();ctx.translate(gl.x,gl.y);if(gl.fl)ctx.scale(1,0.45);
      var rg=ctx.createRadialGradient(0,0,0,0,0,gl.r);rg.addColorStop(0,c0+aa.toFixed(3)+')');rg.addColorStop(1,c0+'0)');
      ctx.fillStyle=rg;ctx.beginPath();ctx.arc(0,0,gl.r,0,6.3);ctx.fill();ctx.restore();
    });
    ctx.restore();
  }
  ctx.strokeStyle='#6c1214';ctx.fillStyle='#6c1214';ctx.lineWidth=1.3;
  R.segs.forEach(function(s){
    ctx.beginPath();ctx.moveTo(s[0],s[1]);ctx.lineTo(s[2],s[3]);ctx.stroke();
    [[s[0],s[1]],[s[2],s[3]]].forEach(function(e){ctx.beginPath();ctx.arc(e[0],e[1],2.4,0,6.3);ctx.fill();});
  });
  ctx.font='bold 13px Tahoma,"Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  R.labels.forEach(function(l){
    var tw=ctx.measureText(l.t).width+12;
    ctx.fillStyle='rgba(255,253,252,0.92)';ctx.fillRect(l.x-tw/2,l.y-10,tw,20);
    ctx.strokeStyle='#c99a3b';ctx.lineWidth=1;ctx.strokeRect(l.x-tw/2,l.y-10,tw,20);
    ctx.fillStyle='#6c1214';ctx.fillText(l.t,l.x,l.y+1);
  });
  ctx.textBaseline='alphabetic';
}
function fvDefState(host,d){
  var sk=host.dataset.sk,st=FVS[sk];
  if(!st)st=FVS[sk]={yaw:-0.62,pit:0.42,zoom:1,open:0,tgt:0,auto:false,ci:0,cc:null,set:false};
  if(d&&d.cc&&fvHex(d.cc)){st.cc=d.cc;st.set=true;}
  else if(d&&d.fin!=null&&d.fin!==''&&FVFIN[+d.fin]){st.ci=+d.fin;st.cc=null;st.set=true;}
  else if(!st.set){var g=fvGuess((host.dataset.col||'')+' '+(d&&d.note||''));if(g){st.cc=g.cc;st.set=true;}}
  return st;
}
function fvTypeDoors(d,name){var t=ftype(d,name);return t===FT[1]||t===FT[3]||t===FT[4];}
var MIRL={rect:'مستطيلة',sq:'مربعة',round:'دائرية',half:'نصف دائرية'};
var NSL={rect:'مستطيل بأدراج',round:'دائري',half:'نصف دائري (حرف D)'};
var BSTL={legs:'بأرجل',plat:'منصة صندوقية'};
var HBSL={flat:'مستقيم',arch:'مقوّس',round:'نصف دائري',step:'متدرج',wing:'أجنحة (جانبان مرتفعان)',peak:'هرمي (مثلث)',wave:'مموّج',crown:'تاج متدرج (ثلاث درجات)',chamfer:'زوايا مشطوفة'};
var HBDL={none:'بدون تقسيم',vert:'ألواح عمودية',horiz:'أحزمة أفقية',tuft:'كابتونيه (أزرار)',tuftx:'كابتونيه كبير (شيستر)',grid:'مربعات',frame:'إطار بارز'};
var UPSL={none:'بدون تنجيد (خشب)',head:'تنجيد الرأس فقط',full:'تنجيد الرأس والأطراف (الجانبين والقدم)'};
var UPPRE=[['بيج','#c4b6a8'],['رمادي فاتح','#bdbdbd'],['رمادي غامق','#6d6f73'],['كحلي','#2f3e5c'],['أخضر زيتي','#6b7550'],['عنابي','#6e2a3a'],['وردي باهت','#d9b8bd'],['أسود','#2c2c2e'],['أبيض','#f0ede6']];
var DLL={std:'أدراج أسفل المرآة (عادي)',knee:'مكان للكرسي في المنتصف + أدراج على جانب واحد',knee2:'مكان للكرسي في المنتصف + أدراج على الجانبين',open:'طاولة مفتوحة بدون أدراج'};
var DSIDE={r:'اليمين',l:'اليسار'};
var DAXL={none:'بدون ملحق',tower:'برج أدراج طويل',cab:'خزانة بباب',shelf:'رفوف مفتوحة'};
var DSTL={none:'بدون كرسي في الرسم',stool:'بوف (مقعد بدون ظهر)',chair:'كرسي بظهر'};
var SFPL={back:'خلف لوح الظهر (خلف الملابس)',floor:'أسفل الدولاب (على الأرضية)',top:'أعلى الدولاب (تحت السقف)'};
var SFSZ={s:'صغيرة (30×20×25 سم)',m:'متوسطة (40×30×35 سم)',l:'كبيرة (50×35×45 سم)'};
var SFSZN={s:[30,20,25],m:[40,30,35],l:[50,35,45]};
var SFLK={digital:'قفل رقمي',key:'قفل بمفتاح',fp:'بصمة إصبع'};
var MIXK=[['shelves','رفوف'],['hang','شماعة تعليق'],['drawers','أدراج'],['empty','فراغ / مساحة حرة']];
var DTL={swing:'مفصلي (يُفتح بالمفصلات)',slide:'سحّاب (جرّار)'};
var GRDL={h:'أفقي (من اليسار لليمين)',v:'عمودي (من الأسفل للأعلى)',vr:'عمودي (من الأعلى للأسفل)'};
var LTPRE=[['أبيض دافئ','#ffd08a'],['أبيض محايد','#f4f1e8'],['أبيض بارد','#cfe3ff'],['ذهبي','#ffb84d'],['أزرق','#4aa3ff'],['بنفسجي','#b583ff'],['وردي','#ff7ab8'],['أخضر','#6dff9c'],['أحمر','#ff5a4d']];
var GDP={h:{both:'أعلى وأسفل الزجاج',top:'أعلى الزجاج',bottom:'أسفل الزجاج',center:'منتصف الزجاج',three:'ثلاثة أشرطة'},v:{sides:'على الجانبين',left:'الجانب الأيسر',right:'الجانب الأيمن',center:'منتصف الزجاج',three:'ثلاثة أشرطة'}};
var GDO={h:'أفقي',v:'عمودي'};
var LTPL={gd:'إضاءة أبواب الزجاج',hb:'خلف رأس السرير (هالة)',rl:'إضاءة قراءة جانبية',bs:'إضاءة أرضية أسفل القطعة','in':'شريط ليد داخل الدولاب',sh:'تحت الرفوف',mr:'إطار المرآة'};
function fvRotPt(p,rot){
  var q=[p[0],p[1],p[2]],i,r,c,s,dx,dy;
  if(rot)for(i=0;i<rot.length;i++){r=rot[i];c=Math.cos(r.a);s=Math.sin(r.a);dx=q[0]-r.hx;dy=q[1]-r.hy;q[0]=r.hx+dx*c-dy*s;q[1]=r.hy+dx*s+dy*c;}
  return q;
}
function fvPrism(a,ax,pts,t0,t1,c,o){
  if(!pts||pts.length<3||!(t1>t0))return;
  var A=[],B=[],mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9],i,k,n0=a.length;
  function m3(p,t){return ax==='x'?[t,p[0],p[1]]:ax==='y'?[p[0],t,p[1]]:[p[0],p[1],t];}
  for(i=0;i<pts.length;i++){A.push(m3(pts[i],t0));B.push(m3(pts[i],t1));}
  A.concat(B).forEach(function(p){for(k=0;k<3;k++){if(p[k]<mn[k])mn[k]=p[k];if(p[k]>mx[k])mx[k]=p[k];}});
  fvB(a,mn[0],mn[1],mn[2],mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2],c,o);
  if(a.length>n0)a[a.length-1].pl={A:A,B:B,sm:!!(o&&o.sm)};
}
function fvGlassLight(a,xs,y,zb,w,hh,dt,fw,rot,C){
  if(!fvL(C,'gd')||!C.gt||C.gt==='mirror')return;
  var g=C.gd||{},o=g.o==='v'?'v':'h',p=g.p,ix=xs+fw,iw=w-2*fw,iz=zb+fw,ih=hh-2*fw,th=1.2,yy=y-0.3,r=Math.max(10,Math.min(iw,ih)*0.35),ps;
  if(iw<4||ih<4)return;
  function opt(){return {rot:rot,lay:2,em:1,lt:{r:r,a:0.38,vis:''}};}
  if(o==='h'){
    ps=p==='top'?[ih-th-0.4]:p==='bottom'?[0.4]:p==='center'?[ih/2-th/2]:p==='three'?[0.4,ih/2-th/2,ih-th-0.4]:[0.4,ih-th-0.4];
    ps.forEach(function(z){fvB(a,ix,yy,iz+z,iw,0.25,th,C.LC.c,opt());});
  }else{
    ps=p==='left'?[0.4]:p==='right'?[iw-th-0.4]:p==='center'?[iw/2-th/2]:p==='three'?[0.4,iw/2-th/2,iw-th-0.4]:[0.4,iw-th-0.4];
    ps.forEach(function(x){fvB(a,ix+x,yy,iz,th,0.25,ih,C.LC.c,opt());});
  }
}
function fvL(C,k){return !!(C.LC&&C.LC.p.indexOf(k)>-1);}
function fvBaseGlow(a,L,C){
  if(!fvL(C,'bs'))return;
  fvB(a,2,-0.6,0.2,L-4,1.2,0.7,C.LC.c,{em:1,lt:{r:Math.max(14,L*0.16),a:0.4,fl:1}});
}
function fvWardLight(a,L,W,H,C){
  if(!C.LC)return;
  var tk=secTk(L,H);
  if(fvL(C,'in'))fvB(a,tk+1.5,2.5,H-tk-1.3,L-2*tk-3,1.3,0.9,C.LC.c,{em:1,lt:{r:Math.max(14,Math.min(L*0.22,40)),a:0.42,vis:C.gt?'':'open'}});
  fvBaseGlow(a,L,C);
}
function fvPlan(kind,L,W,pad){
  var p=[],i,N=36,cx=L/2,cy=W/2,rx=L/2+pad,ry=W/2+pad,t;
  if(kind==='round'){for(i=0;i<N;i++){t=i/N*Math.PI*2;p.push([cx+rx*Math.cos(t),cy+ry*Math.sin(t)]);}return p;}
  p.push([cx+rx,W+pad]);
  for(i=0;i<=N/2;i++){t=i/(N/2)*Math.PI;p.push([cx+rx*Math.cos(t),W-(W+pad)*Math.sin(t)]);}
  p.push([cx-rx,W+pad]);return p;
}
function fvNight(a,L,W,H,secs,base,legs,C,open){
  var k=C.ns;
  if(k!=='round'&&k!=='half'){fvCab(a,L,W,H,{secs:secs,base:base,legs:legs,skin:true},C,open);return;}
  var bs=Math.max(base,Math.min(8,H*0.12)),tk=Math.max(1.6,Math.min(3,H*0.05)),zg=bs+(H-bs-tk)*0.5,e={sm:true};
  fvPrism(a,'z',fvPlan(k,L,W,-2),0,bs,C.bs,e);
  fvPrism(a,'z',fvPlan(k,L,W,0),bs,H-tk,C.w,e);
  fvPrism(a,'z',fvPlan(k,L,W,0.25),zg-0.3,zg+0.3,C.dk,e);
  fvPrism(a,'z',fvPlan(k,L,W,0.8),H-tk,H,C.wi,e);
  if(C.hs!=='n')[(zg+H-tk)/2,(bs+zg)/2].forEach(function(z){fvB(a,L/2-1.2,-1.4,z-1.2,2.4,1.4,2.4,C.mt,{bias:4});});
}
function fvMirPts(kind,cx,mz,mw,mh,pad){
  var p=[],i,N=40,t,s,r,cz,R;
  if(kind==='sq'){s=Math.min(mw,mh)/2;return [[cx-s-pad,mz-pad],[cx+s+pad,mz-pad],[cx+s+pad,mz+2*s+pad],[cx-s-pad,mz+2*s+pad]];}
  if(kind==='round'){s=Math.min(mw,mh)/2;r=s+pad;cz=mz+s;for(i=0;i<N;i++){t=i/N*Math.PI*2;p.push([cx+r*Math.cos(t),cz+r*Math.sin(t)]);}return p;}
  R=Math.min(mw,2*mh)/2+pad;p.push([cx+R,mz-pad]);
  for(i=0;i<=N/2;i++){t=i/(N/2)*Math.PI;p.push([cx+R*Math.cos(t),mz+R*Math.sin(t)]);}
  p.push([cx-R,mz-pad]);return p;
}
function fvSlideDoors(a,x0,L,y,z0,z1,n,open,C){
  var dw=L/n,dt=1.6,gp=0.5,tr=Math.min(n,3),ov=2,rt=1.4,k,gs=-1,ge=-2,zb=z0+rt,hh=z1-z0-2*rt;
  if(hh<4)return;
  if(C.gt){var gn=Math.min(n,Math.max(1,C.gn));if(C.gp==='all'){gs=0;ge=n-1;}else if(C.gp==='left'){gs=0;ge=gn-1;}else if(C.gp==='right'){gs=n-gn;ge=n-1;}else{gs=Math.floor((n-gn)/2);ge=gs+gn-1;}}
  var yo=y-(tr-1)*(dt+gp)-dt-0.2;
  fvB(a,x0,yo,z0,L,y-yo,rt,C.mt,{lay:2});
  fvB(a,x0,yo,z1-rt,L,y-yo,rt,C.mt,{lay:2});
  for(k=0;k<n;k++){
    var j=k%tr,yj=y-j*(dt+gp),sg=n===2?(k===0?1:0):(k<(n-1)/2?1:(k>(n-1)/2?-1:0)),sh=sg*open*dw*0.9;
    var xs=x0+k*dw-(k>0?ov/2:0)+sh,wd=dw+(k>0?ov/2:0)+(k<n-1?ov/2:0);
    if(k>=gs&&k<=ge)fvGlassDoor(a,xs,yj,zb,wd,hh,dt,null,C);
    else{
      fvB(a,xs,yj-dt,zb,wd,dt,hh,C.w,{lay:2});
      if(wd>16&&hh>16)fvB(a,xs+3,yj-dt-0.3,zb+3,wd-6,0.3,hh-6,C.wi,{bias:3,lay:2});
    }
    if(C.hs!=='n'){var hl=C.hs==='h'?30:18,xh=sg>=0?xs+wd-4:xs+2.6;fvB(a,xh,yj-dt-1,zb+hh/2-hl/2,1.4,1,hl,C.mt,{bias:4,lay:2});}
  }
}
function fvGradient(a,C,F,c2,dir){
  var ids=[C.w,C.wi],ax=dir==='h'?0:2,list=[],mn=1e9,mx=-1e9;
  if(C.dw===F){ids.push(C.dw);ids.push(C.dwi);}
  a.forEach(function(b){
    if(ids.indexOf(b.c)<0||b.em)return;
    var P=fvCorners(b),k;for(k=0;k<8;k++){if(P[k][ax]<mn)mn=P[k][ax];if(P[k][ax]>mx)mx=P[k][ax];}
    list.push(b);
  });
  list.forEach(function(b){var wi=(b.c===C.wi||b.c===C.dwi);b.gr={ax:ax,mn:mn,mx:mx,tg:wi?fvMix(c2,[255,255,255],0.16):c2,rev:dir==='vr'};});
}
function fvGrad(b,rgb,br,pa,pb){
  if(!b.gr||b.em)return rgb;
  var g=b.gr,pm=(pa[g.ax]+pb[g.ax])/2,t=(pm-g.mn)/((g.mx-g.mn)||1),m;
  t=t<0?0:t>1?1:t;if(g.rev)t=1-t;
  m=fvMix(b.c,g.tg,t);return [fvClamp(m[0]*br),fvClamp(m[1]*br),fvClamp(m[2]*br)];
}
function fvExtHtml(d,name){
  var t=ftype(d,name),room=t===FT[3],isB=room||t===FT[2],isW=room||t===FT[1],isD=room||t===FT[9],isN=room||t===FT[10];
  var gr=d.gr||{},lt=d.lt||{},h='',sh='';
  function opts(map,cur,def){return Object.keys(map).map(function(k){return '<option value="'+k+'"'+((cur||def)===k?' selected':'')+'>'+map[k]+'</option>';}).join('');}
  h+='<div class="fvsec fvgr"><b>بطاقة تدرج الألوان</b> <span class="hint">— اكتب كود اللون (مثل #fff) لتظهر درجاته ثم اضغط درجة لاعتمادها</span>'+
    '<div class="czrow"><label>كود اللون <input type="text" dir="ltr" data-x="grhex" placeholder="#fff" maxlength="7" autocomplete="off"></label>'+
    '<input type="color" data-x="grpick" value="#ffffff" aria-label="منتقي اللون">'+
    '<button type="button" class="btn gold sm" data-x="grapply">اعتماد كلون للجسم</button></div>'+
    '<div class="hint" data-x="grcap"></div><div class="grstrip" data-x="grstrip"></div>'+
    '<div class="czrow"><label><input type="checkbox" data-x="gron"> تدرج بين لونين</label>'+
    '<label>لون النهاية <input type="color" data-x="grc2" value="'+(fvHex(gr.c2)?gr.c2:'#8c8c8c')+'"></label>'+
    '<label>الاتجاه <select data-x="grdir">'+opts(GRDL,gr.dir,'h')+'</select></label></div>'+
    '<div class="grprev" data-x="grprev"></div></div>';
  if(isD)sh+='<label>شكل المرآة <select data-x="mir">'+opts(MIRL,d.mir,'rect')+'</select></label>'+
    '<label>تصميم التسريحة <select data-x="dl">'+opts(DLL,d.dl,'std')+'</select></label>'+
    '<label>جانب الأدراج <select data-x="dsd">'+opts(DSIDE,d.dsd,'r')+'</select></label>'+
    '<label>ملحق بجانب التسريحة <select data-x="dax">'+opts(DAXL,d.dax,'none')+'</select></label>'+
    '<label>جانب الملحق <select data-x="dxs">'+opts(DSIDE,d.dxs,'l')+'</select></label>'+
    '<label>الكرسي / البوف <select data-x="dst">'+opts(DSTL,d.dst,'none')+'</select></label>';
  if(isN)sh+='<label>شكل الكومدينو <select data-x="ns">'+opts(NSL,d.ns,'rect')+'</select></label>';
  if(isB)sh+='<label>قاعدة السرير <select data-x="bst">'+opts(BSTL,d.bst,'legs')+'</select></label>'+
    '<label>شكل رأس السرير <select data-x="hbs">'+opts(HBSL,d.hbs,'flat')+'</select></label>'+
    '<label>تنجيد السرير <select data-x="ups">'+opts(UPSL,d.ups,'none')+'</select></label>'+
    '<label>لون القماش <select data-x="upp"><option value="">— اختر —</option>'+UPPRE.map(function(p){return '<option value="'+p[1]+'">'+p[0]+'</option>';}).join('')+'</select></label>'+
    '<input type="color" data-x="upc" value="'+(fvHex(d.upc)?d.upc:'#c4b6a8')+'" aria-label="لون قماش التنجيد">'+
    '<label>شكل تنجيدة الرأس <select data-x="hbd">'+opts(HBDL,d.hbd,'none')+'</select></label>'+
    '<label>عدد الأقسام / الأعمدة <input type="number" data-x="hbn" min="2" max="8" value="'+(d.hbn||3)+'"'+((d.hbd==='vert'||d.hbd==='horiz'||d.hbd==='grid')?'':' disabled')+'></label>';
  if(isW)sh+='<label>نوع أبواب الدولاب <select data-x="dt">'+opts(DTL,d.dt,'swing')+'</select></label>';
  if(sh)h+='<div class="fvsec"><b>الأشكال والتقسيمات</b><div class="czrow">'+sh+'</div></div>';
  if(isD)h+='<div class="hint" style="margin:-4px 0 8px">الملحق الجانبي يُحتسب ضمن الطول الكلي للتسريحة. «جانب الأدراج» يعمل مع تصميم «مكان للكرسي + أدراج على جانب واحد».</div>';
  if(isW){
    var sf0=d.sf||{};
    h+='<div class="fvsec fvsf"><b>خزنة سرية داخل الدولاب</b> <span class="hint">— تُخفى خلف لوح يُفتح مع الأبواب ويظهر شكلها في الرسم عند فتح الدولاب</span>'+
      '<div class="czrow"><label><input type="checkbox" data-x="sfon"'+(sf0.on?' checked':'')+'> إضافة خزنة سرية</label>'+
      '<label>الموضع <select data-x="sfp">'+opts(SFPL,sf0.pos,'back')+'</select></label>'+
      '<label>في القسم رقم <input type="number" data-x="sfs" min="1" max="12" value="'+(sf0.sec||1)+'"></label>'+
      '<label>الحجم <select data-x="sfz">'+opts(SFSZ,sf0.size,'m')+'</select></label>'+
      '<label>القفل <select data-x="sfk">'+opts(SFLK,sf0.lock,'digital')+'</select></label></div></div>';
  }
  if(isB||isW||isD){
    var pos=[],cur=lt.p||[],pc=fvHex(lt.c)?lt.c:'#ffd08a',found=false;
    if(isB)pos.push('hb','rl');if(isW)pos.push('in','sh','gd');if(isD)pos.push('mr');pos.push('bs');
    h+='<div class="fvsec fvlt"><b>الإضاءة حسب طلب العميل</b>'+
      '<div class="czrow"><label><input type="checkbox" data-x="lton"'+(lt.on?' checked':'')+'> تفعيل الإضاءة</label>'+
      '<label>اللون <select data-x="ltpre">'+LTPRE.map(function(p){var s=p[1]===pc;if(s)found=true;return '<option value="'+p[1]+'"'+(s?' selected':'')+'>'+p[0]+'</option>';}).join('')+'<option value="custom"'+(found?'':' selected')+'>مخصص</option></select></label>'+
      '<input type="color" data-x="ltc" value="'+pc+'" aria-label="لون الإضاءة">'+
      '<label>الشدة <input type="range" data-x="lti" min="30" max="100" value="'+(lt.i||80)+'"></label>'+
      '<label><input type="checkbox" data-x="ltnt"'+(lt.nt===false?'':' checked')+'> عرض بوضع الليل</label></div>'+
      '<div class="czrow">'+pos.map(function(k){return '<label><input type="checkbox" data-x="ltp" value="'+k+'"'+(cur.indexOf(k)>-1?' checked':'')+'> '+LTPL[k]+'</label>';}).join('')+'</div>'+
      (isW?'<div class="czrow"><label>اتجاه إضاءة الزجاج <select data-x="gdo">'+opts(GDO,(lt.gd||{}).o,'h')+'</select></label>'+
      '<label>مكانها <select data-x="gdp">'+opts(GDP[(lt.gd||{}).o==='v'?'v':'h'],(lt.gd||{}).p,(lt.gd||{}).o==='v'?'sides':'both')+'</select></label>'+
      '<span class="hint">تعمل مع الزجاج الشفاف أو المدخن (اختره من «زجاج / مرايا»)</span></div>':'')+'</div>';
  }
  return h;
}
function fvPanelHtml(d,name){
  var h=fvPanelHtml0(d,name);
  return h.slice(0,h.length-6)+fvExtHtml(d,name)+'</div>';
}
function fvExtInit(host,st,czp,kick,fire,sync){
  function D(){return host._d;}
  function q(n){return czp.querySelector('[data-x="'+n+'"]');}
  function norm(v){v=String(v||'').trim().replace(/^#/,'');if(/^[0-9a-f]{3}$/i.test(v))v=v.split('').map(function(c){return c+c;}).join('');return /^[0-9a-f]{6}$/i.test(v)?'#'+v.toLowerCase():null;}
  function body(){return st.cc||fvHexOf(FVFIN[st.ci||0][1]);}
  function strip(hex){
    var c=fvHex(hex),box=q('grstrip'),out=[],seen={};if(!c||!box)return;
    function add(r){var h=fvHexOf(r);if(!seen[h]){seen[h]=1;out.push(h);}}
    [0.75,0.5,0.25].forEach(function(k){add(fvMix(c,[255,255,255],k));});
    add(c);
    [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8].forEach(function(k){add(fvMix(c,[0,0,0],k));});
    var cur=body();
    box.innerHTML=out.map(function(h){return '<button type="button" class="grsw'+(h===cur?' on':'')+'" data-gs="'+h+'" style="background:'+h+'" title="'+h+' — '+esc(clrName(h))+'" aria-label="'+h+'"></button>';}).join('');
    q('grcap').textContent='درجات اللون '+fvHexOf(c)+' ('+clrName(fvHexOf(c))+')';
  }
  function grp(){
    var d=D(),g=d.gr||{},on=!!g.on,c2=fvHex(g.c2)?g.c2:null,b=body(),dir=g.dir||'h',pv=q('grprev'),hx=q('grhex');
    q('gron').checked=on;q('grdir').value=dir;if(c2)q('grc2').value=c2;
    pv.style.background=(on&&c2)?'linear-gradient('+(dir==='h'?'to right':dir==='vr'?'to bottom':'to top')+','+b+','+c2+')':b;
    pv.textContent=(on&&c2)?'':'التدرج غير مفعّل — اللون الحالي';
    if(!hx.value)strip(b);
    else Array.prototype.forEach.call(czp.querySelectorAll('.grsw'),function(s){s.classList.toggle('on',s.dataset.gs===b);});
  }
  host._grp=grp;
  function hbnState(){var h=q('hbd'),n=q('hbn');if(h&&n)n.disabled=!(h.value==='vert'||h.value==='horiz'||h.value==='grid');}
  function defs(){var t=ftype(D(),host.dataset.nm),r=t===FT[3],o=[];if(r||t===FT[2])o.push('hb');if(r||t===FT[1]){o.push('in','sh');if(D().gl&&D().gl.t&&D().gl.t!=='mirror')o.push('gd');}if(r||t===FT[9])o.push('mr');return o;}
  function syncPos(){var p=(D().lt&&D().lt.p)||[];Array.prototype.forEach.call(czp.querySelectorAll('input[data-x="ltp"]'),function(i){i.checked=p.indexOf(i.value)>-1;});}
  function ctl(e){
    var t=e.target,x=t.dataset&&t.dataset.x;if(!x)return;
    var d=D(),g,l;
    if((x==='grhex'||x==='grpick')&&e.type!=='input')return;
    if(x==='grhex'){var h=norm(t.value);if(h){strip(h);q('grpick').value=h;}return;}
    if(x==='grpick'){q('grhex').value=t.value;strip(t.value);return;}
    if(x==='gron'||x==='grc2'||x==='grdir'){
      g=d.gr||(d.gr={on:false,c2:'',dir:'h'});
      if(x==='gron'){g.on=t.checked;if(g.on&&!fvHex(g.c2))g.c2=fvHexOf(fvMix(fvHex(body())||[255,255,255],[0,0,0],0.45));}
      else if(x==='grc2')g.c2=t.value;else g.dir=t.value;
      grp();kick();return;
    }
    if(x==='mir'||x==='ns'||x==='bst'||x==='hbs'||x==='hbd'||x==='dt'||x==='ups'||x==='dl'||x==='dsd'||x==='dax'||x==='dxs'||x==='dst'){d[x]=t.value;hbnState();kick();return;}
    if(x==='upc'){d.upc=t.value;kick();return;}
    if(x==='upp'){if(t.value){d.upc=t.value;var uc=q('upc');if(uc)uc.value=t.value;}kick();return;}
    if(x==='sfon'||x==='sfp'||x==='sfs'||x==='sfz'||x==='sfk'){
      var sf=d.sf||(d.sf={on:false,pos:'back',sec:1,size:'m',lock:'digital'});
      if(x==='sfon')sf.on=t.checked;else if(x==='sfp')sf.pos=t.value;else if(x==='sfs')sf.sec=Math.max(1,Math.min(12,parseInt(t.value,10)||1));else if(x==='sfz')sf.size=t.value;else sf.lock=t.value;
      kick();return;
    }
    if(x==='hbn'){d.hbn=Math.max(2,Math.min(8,parseInt(t.value,10)||3));kick();return;}
    if(x==='gdo'||x==='gdp'){
      l=d.lt||(d.lt={on:false,c:'#ffd08a',i:80,nt:true,p:[]});l.gd=l.gd||{};
      if(x==='gdo'){l.gd.o=t.value;l.gd.p=t.value==='v'?'sides':'both';var ps=q('gdp');ps.innerHTML=Object.keys(GDP[t.value]).map(function(k){return '<option value="'+k+'"'+(k===l.gd.p?' selected':'')+'>'+GDP[t.value][k]+'</option>';}).join('');}
      else l.gd.p=t.value;
      kick();return;
    }
    if(x.indexOf('lt')===0){
      l=d.lt||(d.lt={on:false,c:'#ffd08a',i:80,nt:true,p:[]});
      if(x==='lton'){l.on=t.checked;if(l.on&&!(l.p&&l.p.length)){l.p=defs();syncPos();}}
      else if(x==='ltpre'){if(t.value!=='custom'){l.c=t.value;q('ltc').value=t.value;}}
      else if(x==='ltc'){l.c=t.value;var pr=q('ltpre');pr.value='custom';LTPRE.forEach(function(p){if(p[1]===t.value)pr.value=p[1];});}
      else if(x==='lti')l.i=parseInt(t.value,10)||80;
      else if(x==='ltnt')l.nt=t.checked;
      else if(x==='ltp')l.p=Array.prototype.map.call(czp.querySelectorAll('input[data-x="ltp"]:checked'),function(i){return i.value;});
      kick();
    }
  }
  czp.addEventListener('input',ctl);czp.addEventListener('change',ctl);
  czp.addEventListener('click',function(e){
    var b=e.target.closest('button[data-gs],button[data-x="grapply"]');if(!b)return;
    var h=b.dataset.gs||norm(q('grhex').value);
    if(!h){toast('اكتب كود لون صحيح مثل #fff');return;}
    st.cc=h;st.set=true;var d=D();d.cc=h;d.fin='';
    var s=host.querySelector('select[data-f="col"]');if(s)s.value='';
    sync();kick();fire();
  });
  hbnState();grp();
}
function fvPanelHtml0(d,name){
  var gl=d.gl||{},sel=function(v,x){return v===x?' selected':'';},dr=fvTypeDoors(d,name);
  return '<div class="fvcz"><b>تخصيص طلب العميل</b> <span class="hint">— اضغط على أي لون لفتح كاتلوج الصور</span>'+
    '<div class="czrow">'+
      [['body','لون الجسم والأبواب'],['handle','لون المقابض'],['drawer','لون واجهات الأدراج'],['base','لون القاعدة والإطارات']].map(function(x){return '<button type="button" class="czbtn" data-cz="'+x[0]+'"><i></i>'+x[1]+(d.czs&&d.czs[x[0]]?' <small>— '+esc(d.czs[x[0]].n)+'</small>':'')+'</button>';}).join('')+
      '<button type="button" class="btn ghost sm" data-cz="reset">إعادة الألوان</button></div>'+
    '<div class="czrow">'+
      '<label>المقبض <select data-cz="hs"><option value="v"'+sel(d.hs||'v','v')+'>قضيب عمودي</option><option value="h"'+sel(d.hs,'h')+'>قضيب أفقي عريض</option><option value="n"'+sel(d.hs,'n')+'>بدون مقبض</option></select></label>'+
      (dr?'<label>زجاج / مرايا <select data-cz="gt"><option value="">بدون</option><option value="clear"'+sel(gl.t,'clear')+'>زجاج شفاف</option><option value="smoke"'+sel(gl.t,'smoke')+'>زجاج مدخن</option><option value="mirror"'+sel(gl.t,'mirror')+'>مرايا</option></select></label>'+
      '<label>مكانها <select data-cz="gp"><option value="mid"'+sel(gl.pos||'mid','mid')+'>الأبواب الوسطى</option><option value="right"'+sel(gl.pos,'right')+'>اليمين</option><option value="left"'+sel(gl.pos,'left')+'>اليسار</option><option value="all"'+sel(gl.pos,'all')+'>كل الأبواب</option></select></label>'+
      '<label>عدد أبواب الزجاج <input type="number" data-cz="gn" min="1" max="12" value="'+esc(gl.n||2)+'"></label>':'')+
    '</div></div>';
}
function fvMount(host,d,name){
  var st=fvDefState(host,d);
  host._d=d;
  host.innerHTML='<div class="fvbar">'+
    '<button type="button" class="btn sm" data-f="open">فتح / إغلاق الأبواب والأدراج</button>'+
    '<button type="button" class="btn ghost sm" data-f="auto">دوران تلقائي</button>'+
    '<button type="button" class="btn ghost sm" data-f="v0">مجسم</button>'+
    '<button type="button" class="btn ghost sm" data-f="v1">أمامي</button>'+
    '<button type="button" class="btn ghost sm" data-f="v2">جانبي</button>'+
    '<button type="button" class="btn ghost sm" data-f="v3">علوي</button>'+
    '<button type="button" class="btn ghost sm" data-f="zi" aria-label="تكبير">+</button>'+
    '<button type="button" class="btn ghost sm" data-f="zo" aria-label="تصغير">−</button>'+
    '<select data-f="col" aria-label="لون الخامة"><option value="">— اختر اللون —</option>'+FVFIN.map(function(x,i){return '<option value="'+i+'"'+(!st.cc&&st.set&&i===st.ci?' selected':'')+'>'+x[0]+'</option>';}).join('')+'</select>'+
    '<label class="fvcc" title="اختر أي لون تريده">لون مخصص <input type="color" data-f="cc" value="'+(st.cc||fvHexOf(FVFIN[st.ci||0][1]))+'"></label>'+
    '<button type="button" class="btn gold sm" data-f="png">حفظ صورة</button>'+
    '<button type="button" class="btn gold sm" data-f="asm">🎬 فيديو التركيب</button></div>'+
    fvPanelHtml(d,name)+
    '<canvas class="fvcv" role="img" aria-label="مجسم ثلاثي الأبعاد تفاعلي"></canvas>'+
    '<div class="fvhint">اسحب بالماوس أو بإصبعك لتدوير المجسم · الأرقام المعروضة هي الأبعاد المدخلة بالسم</div>';
  var cv=host.querySelector('canvas'),ctx=cv.getContext('2d'),raf=0,dpr=Math.min(2,window.devicePixelRatio||1),cw=0,ch=0;
  var ptrs={},lastD=0;
  function size(){
    var w=host.clientWidth||640;if(w<200)w=640;
    var hh=Math.round(Math.min(w*0.62,520));
    if(w===cw&&hh===ch)return;
    cw=w;ch=hh;cv.width=Math.round(w*dpr);cv.height=Math.round(hh*dpr);cv.style.height=hh+'px';
  }
  function paint(){
    if(!cv.isConnected)return;
    size();ctx.setTransform(dpr,0,0,dpr,0,0);st.o=host._d;
    fvPaint(ctx,cw,ch,fvSpec(host._d,host.dataset.nm),st);
  }
  function tick(){
    raf=0;if(!cv.isConnected)return;
    var busy=false;
    if(Math.abs(st.tgt-st.open)>0.004){st.open+=(st.tgt-st.open)*0.2;busy=true;}else st.open=st.tgt;
    if(st.auto){st.yaw+=0.012;busy=true;}
    paint();if(busy)raf=requestAnimationFrame(tick);
  }
  function kick(){if(!raf)raf=requestAnimationFrame(tick);}
  host._draw=kick;
  var czp=host.querySelector('.fvcz');
  function fire(){host.dispatchEvent(new Event('change',{bubbles:true}));}
  function bodyHex(){return st.cc||fvHexOf(FVFIN[st.ci||0][1]);}
  function curHex(k){var cz=host._d.cz||{};if(k==='body')return bodyHex();if(k==='handle')return cz.handle||'#b6924c';if(k==='drawer')return cz.drawer||bodyHex();return cz.base||cz.handle||'#4a3a2a';}
  function syncChips(){
    Array.prototype.forEach.call(czp.querySelectorAll('button.czbtn'),function(b){
      var k=b.dataset.cz,cz=host._d.cz||{},set=k==='body'?(st.set):!!cz[k];
      b.querySelector('i').style.background=curHex(k);b.style.borderStyle=set?'solid':'dashed';
    });
    var cc=host.querySelector('input[data-f="cc"]');if(cc)cc.value=bodyHex();if(host._grp)host._grp();
  }
  host._sync=syncChips;syncChips();fvExtInit(host,st,czp,kick,fire,syncChips);
  czp.addEventListener('click',function(e){
    var b=e.target.closest('button[data-cz]');if(!b)return;
    var k=b.dataset.cz,d2=host._d;
    if(k==='reset'){d2.cc='';d2.fin='';d2.cz={};d2.czs={};d2.gr=null;st.cc=null;st.ci=0;st.set=false;fvDefState(host,d2);syncChips();kick();fire();return;}
    var oo=orderBy(scOrderId)||{};
    catOpen({sk:host.dataset.sk,slot:'cz:'+k,cat:k==='handle'?'acc':'wood',multi:false,color:true,title:CZ_LAB[k],item:host.dataset.nm,order:oo.orderNo});
  });
  function readOpts(){
    var d2=host._d,q=function(n){return czp.querySelector('[data-cz="'+n+'"]');};
    d2.hs=q('hs').value;
    if(q('gt')){d2.gl={t:q('gt').value,pos:q('gp').value,n:Math.max(1,parseInt(q('gn').value,10)||2)};}
    kick();
  }
  czp.addEventListener('change',function(e){if(e.target.matches('select,input'))readOpts();});
  czp.addEventListener('input',function(e){if(e.target.matches('input[type=number]'))readOpts();});
  function clampPit(){st.pit=Math.max(0.04,Math.min(1.5,st.pit));}
  cv.addEventListener('pointerdown',function(e){ptrs[e.pointerId]={x:e.clientX,y:e.clientY};try{cv.setPointerCapture(e.pointerId);}catch(x){}cv.style.cursor='grabbing';st.auto=false;lastD=0;});
  cv.addEventListener('pointermove',function(e){
    var p=ptrs[e.pointerId];if(!p)return;
    var ids=Object.keys(ptrs);
    if(ids.length>=2){
      ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
      var A=ptrs[ids[0]],B=ptrs[ids[1]],dd=Math.sqrt(Math.pow(A.x-B.x,2)+Math.pow(A.y-B.y,2));
      if(lastD)st.zoom=Math.max(0.5,Math.min(3,st.zoom*dd/lastD));
      lastD=dd;
    }else{
      st.yaw+=(e.clientX-p.x)*0.01;st.pit+=(e.clientY-p.y)*0.008;clampPit();
      ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
    }
    kick();
  });
  function up(e){delete ptrs[e.pointerId];lastD=0;cv.style.cursor='grab';}
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  host.querySelector('.fvbar').addEventListener('click',function(e){
    var b=e.target.closest('button[data-f]');if(!b)return;
    var f=b.dataset.f;
    if(f==='open'){st.tgt=st.tgt?0:1;}
    else if(f==='auto'){st.auto=!st.auto;}
    else if(f==='v0'){st.yaw=-0.62;st.pit=0.42;st.auto=false;}
    else if(f==='v1'){st.yaw=0;st.pit=0.04;st.auto=false;}
    else if(f==='v2'){st.yaw=-Math.PI/2;st.pit=0.04;st.auto=false;}
    else if(f==='v3'){st.yaw=0;st.pit=1.5;st.auto=false;}
    else if(f==='zi'){st.zoom=Math.min(3,st.zoom*1.2);}
    else if(f==='zo'){st.zoom=Math.max(0.5,st.zoom/1.2);}
    else if(f==='png'){fvSave(cv);return;}
    else if(f==='asm'){asmOpen(host,st);return;}
    kick();
  });
  host.querySelector('select[data-f="col"]').addEventListener('change',function(e){
    if(this.value==='')return;
    st.ci=+this.value;st.cc=null;st.set=true;host._d.fin=st.ci;host._d.cc='';
    host.querySelector('input[data-f="cc"]').value=fvHexOf(FVFIN[st.ci][1]);host._sync();kick();
  });
  host.querySelector('input[data-f="cc"]').addEventListener('input',function(){
    st.cc=this.value;st.set=true;host._d.cc=this.value;host._d.fin='';
    host.querySelector('select[data-f="col"]').value='';host._sync();kick();
  });
  if(window.ResizeObserver)new ResizeObserver(function(){if(cv.isConnected){cw=0;kick();}}).observe(host);
  paint();
}
function fvRedraw(sk){
  var host=document.querySelector('.fv3[data-sk="'+sk+'"]');
  if(host&&host._draw)host._draw();
}
function fvSave(cv){
  cv.toBlob(function(b){
    if(!b)return;
    try{var f=new File([b],'furniture-3d.png',{type:'image/png'});
      if(navigator.canShare&&navigator.canShare({files:[f]})){navigator.share({files:[f],title:'مجسم ثلاثي الأبعاد'}).catch(function(){});return;}
    }catch(e){}
    var u=URL.createObjectURL(b),a=document.createElement('a');
    a.href=u;a.download='furniture-3d.png';document.body.appendChild(a);a.click();
    setTimeout(function(){a.remove();URL.revokeObjectURL(u);},900);toast('تم حفظ صورة المجسم');
  },'image/png');
}
function fvHasOpen(S,st){
  function sig(o){return JSON.stringify(fvBuild(S,{ci:st.ci,cc:st.cc,set:st.set,open:o,o:st.o}).map(function(b){return [Math.round(b.x*10),Math.round(b.y*10),b.rot&&b.rot.length?Math.round(b.rot[0].a*100):0];}));}
  return sig(0)!==sig(1);
}
function czPrint(d){
  var cz=d.cz||{},gl=d.gl||{},rows=[],body=fvHex(d.cc)?d.cc:(d.fin!==''&&d.fin!=null&&FVFIN[+d.fin]?fvHexOf(FVFIN[+d.fin][1]):'');
  function sw(hex){return fvHex(hex)?'<span style="display:inline-block;width:13px;height:13px;border-radius:50%;background:'+hex+';border:1px solid #555;vertical-align:middle"></span> '+esc(clrName(hex))+' ('+hex+')':'';}
  if(body)rows.push(['لون الجسم والأبواب',sw(body)]);
  if(cz.handle)rows.push(['لون المقابض',sw(cz.handle)]);
  if(cz.drawer)rows.push(['لون واجهات الأدراج',sw(cz.drawer)]);
  if(cz.base)rows.push(['لون القاعدة والإطارات',sw(cz.base)]);
  if(gl.t)rows.push(['الزجاج / المرايا',({clear:'زجاج شفاف',smoke:'زجاج مدخن',mirror:'مرايا'}[gl.t]||'')+' — '+({mid:'الأبواب الوسطى',right:'اليمين',left:'اليسار',all:'كل الأبواب'}[gl.pos||'mid'])+' — عدد '+esc(gl.n||2)]);
  if(d.hs&&d.hs!=='v')rows.push(['شكل المقبض',{h:'قضيب أفقي عريض',n:'بدون مقبض'}[d.hs]||'']);
  var bodyH=body||fvHexOf(FVFIN[0][1]);
  if(d.gr&&d.gr.on&&fvHex(d.gr.c2))rows.push(['تدرج لوني',sw(bodyH)+' ← '+sw(d.gr.c2)+' — '+(GRDL[d.gr.dir||'h']||'')]);
  if(d.mir)rows.push(['شكل المرآة',MIRL[d.mir]||'']);
  if(d.ns)rows.push(['شكل الكومدينو',NSL[d.ns]||'']);
  if(d.bst)rows.push(['قاعدة السرير',BSTL[d.bst]||'']);
  if(d.hbs)rows.push(['شكل رأس السرير',HBSL[d.hbs]||'']);
  if(d.ups&&d.ups!=='none')rows.push(['تنجيد السرير',UPSL[d.ups]+(fvHex(d.upc)?' — لون القماش '+sw(d.upc):'')]);
  if(d.hbd&&d.hbd!=='none')rows.push(['شكل تنجيدة رأس السرير',(HBDL[d.hbd]||'')+((d.hbd==='vert'||d.hbd==='horiz'||d.hbd==='grid')?' — عدد '+(d.hbn||3):'')]);
  if(d.dl&&d.dl!=='std')rows.push(['تصميم التسريحة',(DLL[d.dl]||'')+(d.dl==='knee'?' — الأدراج على '+DSIDE[d.dsd||'r']:'')]);
  if(d.dax&&d.dax!=='none')rows.push(['ملحق بجانب التسريحة',(DAXL[d.dax]||'')+' — على '+DSIDE[d.dxs||'l']]);
  if(d.dst&&d.dst!=='none')rows.push(['مقعد التسريحة',DSTL[d.dst]||'']);
  if(d.sf&&d.sf.on)rows.push(['خزنة سرية داخل الدولاب',(SFSZ[d.sf.size||'m']||'')+' — '+(SFPL[d.sf.pos||'back']||'')+' — في القسم رقم '+esc(d.sf.sec||1)+' — '+(SFLK[d.sf.lock||'digital']||'')]);
  if(d.dt)rows.push(['نوع أبواب الدولاب',DTL[d.dt]||'']);
  if(d.dsm&&d.dsm!=='mid'&&d.dt!=='slide'){var dsx=dsDesc(d,(d.dsl&&d.dsl.length)?d.dsl.length:fdef(FT[1],d,num(d.l)).doors);if(dsx)rows.push(['اتجاه فتح الأبواب',dsx]);}
  if(d.lt&&d.lt.on&&(d.lt.p||[]).indexOf('gd')>-1){var gd0=d.lt.gd||{},go=gd0.o==='v'?'v':'h';rows.push(['إضاءة الزجاج',GDO[go]+' — '+(GDP[go][gd0.p]||GDP[go][go==='v'?'sides':'both'])]);}
  if(d.lt&&d.lt.on)rows.push(['الإضاءة',(fvHex(d.lt.c)?sw(d.lt.c):'')+' — '+((d.lt.p||[]).map(function(k){return LTPL[k]||'';}).join('، '))+' — الشدة '+esc(d.lt.i||80)+'%'+(d.lt.nt===false?'':' — معروضة بوضع الليل')]);
  if(!rows.length)return '';
  return '<table class="kv">'+rows.map(function(r){return '<tr><td>'+r[0]+'</td><td colspan="5">'+r[1]+'</td></tr>';}).join('')+'</table>';
}
function fvSnap(sk,d,name){
  var el=document.getElementById('scPrMode'),mode=el?el.value:'auto',lt=d&&d.lt;
  if(mode==='both'&&lt&&lt.on&&(lt.p||[]).length)
    return '<p style="margin:8px 0 2px"><b>وضع النهار</b></p>'+fvSnap1(sk,d,name,'day')+'<p style="margin:8px 0 2px"><b>وضع الليل</b></p>'+fvSnap1(sk,d,name,'night');
  return fvSnap1(sk,d,name,mode);
}
function fvSnap1(sk,d0,name,mode){
  var d=d0;
  if(d0.lt&&d0.lt.on&&(mode==='day'||mode==='night')){d=Object.assign({},d0);d.lt=Object.assign({},d0.lt,{nt:mode==='night'});}
  var S=fvSpec(d,name);if(!S)return '';
  try{
    var host=document.querySelector('.fv3[data-sk="'+sk+'"]')||{dataset:{sk:sk,col:''}},b=fvDefState(host,d);
    var base={yaw:b.yaw,pit:b.pit,zoom:b.zoom,ci:b.ci,cc:b.cc,set:b.set,o:d};
    function img(open,w,h2){
      var cv=document.createElement('canvas');cv.width=w;cv.height=h2;
      fvPaint(cv.getContext('2d'),w,h2,S,{yaw:base.yaw,pit:base.pit,zoom:base.zoom,ci:base.ci,cc:base.cc,set:base.set,open:open,o:d});
      return cv.toDataURL('image/png');
    }
    var st='max-width:100%;height:auto;border:1px solid #ddd;border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,.25)';
    if(!fvHasOpen(S,base))
      return '<div style="text-align:center;margin:6px 0"><img alt="مجسم ثلاثي الأبعاد" src="'+img(0,760,470)+'" style="'+st+'"></div>';
    return '<div style="display:flex;gap:8px;margin:6px 0;align-items:flex-start">'+
      [['مغلق',0],['مفتوح',1]].map(function(x){return '<figure style="margin:0;flex:1;text-align:center"><img alt="مجسم ثلاثي الأبعاد '+x[0]+'" src="'+img(x[1],640,440)+'" style="width:100%;'+st+'"><figcaption><b>الوضع '+x[0]+'</b></figcaption></figure>';}).join('')+'</div>';
  }catch(e){return '';}
}

/* ================= عارض تركيب الصنف خطوة بخطوة (3D) + فيديو + تحميل ومشاركة ================= */
var ASM=null,asmKey=false;
var HWC={dow:[226,190,130],bolt:[205,208,214],lock:[201,154,59],pin:[205,208,214],nail:[70,70,76],scr:[205,208,214],fit:[182,146,76]};
var HWN={dow:'دويلة خشبية',bolt:'برغي كام',lock:'قفل كام',pin:'ركيزة رف',nail:'مسمار',scr:'برغي تثبيت',fit:'مقبض / تفصيلة'};
var HWORD=['dow','bolt','lock','pin','nail','scr','fit'];
function asmEase(p){p=Math.max(0,Math.min(1,p));return p<0.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;}
function asmClone(o){return JSON.parse(JSON.stringify(o));}
function asmName(b,mn,Lx,Wy,Hz){
  var c=b._k,cx=b.x+b.l/2-mn[0],cz=b.z+b.h/2-mn[2];
  if(c===0)return (b.l>Lx*0.5&&b.w>Wy*0.5)?'لوح القاعدة':'رجل / دعامة';
  if(c===1){
    if(b.l>Lx*0.5&&b.w<=Wy*0.15)return 'اللوح الخلفي';
    if(b.l<=Lx*0.2)return Math.abs(cx-Lx/2)<Lx*0.3?'فاصل عمودي':(cx<Lx/2?'الجانب الأيسر':'الجانب الأيمن');
    return 'لوح رأسي';
  }
  if(c===2){if(b.l>Lx*0.5&&b.w>Wy*0.4)return cz>Hz*0.85?'اللوح العلوي':'رف';return 'قطعة داخلية';}
  if(c===3)return b.h>=Hz*0.3?'باب':'واجهة درج';
  return c===5?'إضاءة':'مقبض / تفصيلة';
}
function asmContact(a,b){
  var A=[[a.x,a.x+a.l],[a.y,a.y+a.w],[a.z,a.z+a.h]],B=[[b.x,b.x+b.l],[b.y,b.y+b.w],[b.z,b.z+b.h]],ov=[],k;
  for(k=0;k<3;k++)ov.push(Math.min(A[k][1],B[k][1])-Math.max(A[k][0],B[k][0]));
  for(k=0;k<3;k++){
    var o1=(k+1)%3,o2=(k+2)%3;
    if(Math.abs(ov[k])<=0.8&&ov[o1]>1.5&&ov[o2]>1.5){
      var aLow=Math.abs(A[k][1]-B[k][0])<=0.8;
      return {ax:k,p:aLow?(A[k][1]+B[k][0])/2:(B[k][1]+A[k][0])/2,aLow:aLow,
        u:[Math.max(A[o1][0],B[o1][0]),Math.min(A[o1][1],B[o1][1])],v:[Math.max(A[o2][0],B[o2][0]),Math.min(A[o2][1],B[o2][1])]};
    }
  }
  return null;
}
function asmSum(list){
  var c={};list.forEach(function(h){c[h.type]=(c[h.type]||0)+1;});
  return HWORD.filter(function(t){return c[t];}).map(function(t){return c[t]+' '+HWN[t];}).join(' · ');
}
function asmPlan(S,d,st){
  var boxes=fvBuild(S,{ci:st.ci,cc:st.cc,set:st.set,open:0,o:d,yaw:0,pit:0,zoom:1});
  var M=Math.max(S.L,S.W,S.H),mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9],parts=[],stat=[],k,i,j;
  boxes.forEach(function(b){
    if(b.al===0)return;
    if(b.tag==='floor'){stat.push(b);return;}
    fvCorners(b).forEach(function(q){for(k=0;k<3;k++){if(q[k]<mn[k])mn[k]=q[k];if(q[k]>mx[k])mx[k]=q[k];}});
    parts.push(b);
  });
  if(!parts.length)return null;
  var Lx=mx[0]-mn[0],Wy=mx[1]-mn[1],Hz=mx[2]-mn[2],c0=[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2];
  parts.forEach(function(b){
    var md=Math.max(b.l,b.w,b.h),zt=b.z+b.h-mn[2],c;
    if(b.em)c=5;
    else if(md<M*0.12)c=4;
    else if(b.lay>=2||b.bias>0||(b.w<=Math.max(2.5,Wy*0.06)&&b.y-mn[1]<=Wy*0.12))c=3;
    else if(zt<=Hz*0.14&&b.h<=Hz*0.14)c=0;
    else if(b.h>=Hz*0.45)c=1;
    else c=2;
    b._k=c;b._n=asmName(b,mn,Lx,Wy,Hz);b._back=(c===1&&b._n==='اللوح الخلفي'&&b.y-mn[1]>Wy*0.5);
    var cx=b.x+b.l/2-c0[0],cy=b.y+b.w/2-c0[1],cz=b.z+b.h/2-c0[2];
    b._o=[cx*0.55,cy*0.55-(c===3?0.12*Wy+5:0),Math.max(cz*0.7+0.1*Hz+6,-b.z)];
  });
  var panels=parts.filter(function(b){return b._k<=3;}),fits=parts.filter(function(b){return b._k>3;});
  function srt(a,b){return (a.z-b.z)||(a.x-b.x);}
  var groups=[
    ['قطع القاعدة',panels.filter(function(b){return b._k===0;}).sort(srt)],
    ['الجوانب والفواصل',panels.filter(function(b){return b._k===1&&!b._back;}).sort(srt)],
    ['الرفوف والألواح الداخلية',panels.filter(function(b){return b._k===2;}).sort(srt)],
    ['اللوح الخلفي',panels.filter(function(b){return b._back;}).sort(srt)],
    ['الأبواب والواجهات',panels.filter(function(b){return b._k===3;}).sort(srt)]
  ];
  var steps=[{title:'ما في العلبة',sub:'',panels:[],hw:[],t0:0,t1:3.4,cam:-0.75}];
  groups.forEach(function(g){
    var arr=g[1],n=arr.length;if(!n)return;
    var sz=Math.ceil(n/5);
    for(i=0;i<n;i+=sz){
      var grp=arr.slice(i,i+sz);
      grp.forEach(function(b){b._st=steps.length;});
      steps.push({title:grp.length===1?'تركيب '+grp[0]._n:'تركيب '+g[0]+' ('+grp.length+')',panels:grp,hw:[]});
    }
  });
  if(fits.length)steps.push({title:'تركيب المقابض والتفاصيل',panels:[],hw:[]});
  var fitSt=steps.length-1,hw=[];
  function addHW(type,ax,m0,len,cross,pu,pv,au,av,st2,pre,L,off){
    var pos=[0,0,0],sz=[0,0,0],a=[];
    pos[ax]=m0;sz[ax]=len;pos[au]=pu-cross/2;sz[au]=cross;pos[av]=pv-cross/2;sz[av]=cross;
    fvB(a,pos[0],pos[1],pos[2],sz[0],sz[1],sz[2],HWC[type]);if(!a.length)return;
    a[0].bias=3;hw.push({type:type,b:a[0],st:st2,pre:pre,L:L,o:off,d:0.45});
  }
  var cp=panels.filter(function(b){return b._k<=2&&!b._back;});
  if(cp.length<=120)for(i=0;i<cp.length;i++)for(j=i+1;j<cp.length;j++){
    var a1=cp[i],b1=cp[j],ct=asmContact(a1,b1);if(!ct)continue;
    var later=(a1._st>b1._st)?a1:b1,ds=(later===a1)?(ct.aLow?-1:1):(ct.aLow?1:-1);
    var ax=ct.ax,au=(ax+1)%3,av=(ax+2)%3,pl=ct.p,off=[0,0,0];off[ax]=ds*14;
    if(ax===0&&(a1._n==='رف'||b1._n==='رف')&&(a1._k===1||b1._k===1)){
      var sh=a1._n==='رف'?a1:b1;
      [0.25,0.75].forEach(function(f){addHW('pin',0,ds>0?pl:pl-1.8,1.8,1.4,ct.u[0]+(ct.u[1]-ct.u[0])*f,sh.z-1.5,1,2,later._st,true,later,off);});
      continue;
    }
    var lu=ct.u[1]-ct.u[0],lv=ct.v[1]-ct.v[0],mainU=lu>=lv,len=mainU?lu:lv,lo=mainU?ct.u[0]:ct.v[0],oc=mainU?(ct.v[0]+ct.v[1])/2:(ct.u[0]+ct.u[1])/2;
    var n=Math.max(1,Math.min(3,Math.round(len/30))),q;
    for(q=0;q<2*n;q++){
      var pos=lo+(q+0.5)/(2*n)*len,pu=mainU?pos:oc,pv=mainU?oc:pos,po=mainU?[0,3]:[3,0];
      if(q%2===0){
        addHW('bolt',ax,ds>0?pl-2.0:pl-2.5,4.5,1.3,pu,pv,au,av,later._st,true,later,off);
        addHW('lock',ax,pl-0.6,1.2,3.2,pu+po[0],pv+po[1],au,av,later._st,true,later,off);
      }else addHW('dow',ax,ds>0?pl-1.5:pl-2.5,4,1.6,pu,pv,au,av,later._st,true,later,off);
    }
  }
  panels.filter(function(b){return b._back;}).forEach(function(bp){
    var sp=Math.max(18,2*(bp.l+bp.h)/36),yy=bp.y+bp.w-0.3,x,z;
    for(x=bp.x+1.4;x<=bp.x+bp.l-1.4;x+=sp){addHW('nail',1,yy,1.0,1.3,x,bp.z+1.4,0,2,bp._st,false,bp,[0,10,0]);addHW('nail',1,yy,1.0,1.3,x,bp.z+bp.h-1.4,0,2,bp._st,false,bp,[0,10,0]);}
    for(z=bp.z+1.4+sp;z<bp.z+bp.h-1.4-sp/2;z+=sp){addHW('nail',1,yy,1.0,1.3,bp.x+1.4,z,0,2,bp._st,false,bp,[0,10,0]);addHW('nail',1,yy,1.0,1.3,bp.x+bp.l-1.4,z,0,2,bp._st,false,bp,[0,10,0]);}
  });
  panels.filter(function(b){return b._k===3&&b.l>8&&b.h>8;}).forEach(function(f){
    [[3,3],[f.l-3,3],[3,f.h-3],[f.l-3,f.h-3]].forEach(function(c){addHW('scr',1,f.y-0.8,1.0,1.4,f.x+c[0],f.z+c[1],0,2,f._st,false,f,[0,-10,0]);});
  });
  fits.forEach(function(b){hw.push({type:'fit',b:b,st:fitSt,pre:false,L:null,o:[0,-10,8],d:0.45});});
  hw.forEach(function(h){steps[h.st].hw.push(h);});
  var emn=mn.slice(),emx=mx.slice(),prev=-0.75;
  panels.forEach(function(b){fvCorners(b).forEach(function(q){for(k=0;k<3;k++){var v=q[k]+b._o[k];if(v<emn[k])emn[k]=v;if(v>emx[k])emx[k]=v;}});});
  for(k=0;k<3;k++){emn[k]-=6;emx[k]+=6;}
  steps.forEach(function(sp2,i2){
    if(i2>0){
      sp2.t0=steps[i2-1].t1;sp2.t1=sp2.t0+3.1;
      var pre=sp2.hw.filter(function(h){return h.pre;}),af=sp2.hw.filter(function(h){return !h.pre;}),ab=sp2.panels.length?2.1:0.2;
      pre.forEach(function(h,q2){h.t0=sp2.t0+0.1+q2*Math.min(0.05,0.5/pre.length);});
      sp2.panels.forEach(function(b,q2){b._s=sp2.t0+0.95+q2*Math.min(0.3,0.6/sp2.panels.length);});
      af.forEach(function(h,q2){h.t0=sp2.t0+ab+q2*Math.min(0.04,0.4/af.length);});
      sp2.sub=asmSum(sp2.hw);
      var dx=0,dy=0;sp2.panels.forEach(function(b){dx+=(b.x+b.l/2-c0[0])/(Lx/2);dy+=(b.y+b.w/2-c0[1])/(Wy/2);});
      var m=sp2.panels.length,cam=-0.75;
      if(m){dx/=m;dy/=m;if(Math.sqrt(dx*dx+dy*dy)>=0.35)cam=Math.atan2(-dx,-dy)-0.5;}
      cam+=Math.PI*2*Math.round((prev-cam)/(Math.PI*2));sp2.cam=cam;prev=cam;
    }
  });
  var tot={};hw.forEach(function(h){tot[h.type]=(tot[h.type]||0)+1;});
  steps[0].sub=panels.length+' لوح/قطعة · '+hw.length+' قطعة تجهيز';
  var end=steps[steps.length-1].t1;
  return {S:S,panels:panels,stat:stat,steps:steps,hw:hw,tot:tot,mn:mn,mx:mx,emn:emn,emx:emx,buildEnd:end,total:end+7,
    dims:'الطول × العرض × الارتفاع: '+fmt(S.L)+' × '+fmt(S.W)+' × '+fmt(S.H)+' سم'};
}
function asmCur(P,T){var c=0,i;for(i=0;i<P.steps.length;i++)if(T>=P.steps[i].t0)c=i;return c;}
function asmStepEnd(P,i){return i===0?P.steps[0].t1-0.05:P.steps[i].t1-0.02;}
function asmYaw(P,T){
  var st=P.steps,y=st[0].cam,i,u,fin=(T-P.buildEnd-1.0)/5.5;
  for(i=1;i<st.length;i++){u=(T-(st[i].t0-0.1))/1.2;if(u<=0)break;y=st[i-1].cam+(st[i].cam-st[i-1].cam)*asmEase(u);}
  return y+Math.PI*2*asmEase(fin);
}
function asmScene(A,T){
  var P=A.P,arr=[],cnt={},pIn=0,hIn=0,s1=P.steps.length>1?P.steps[1].t0:0,cur=asmCur(P,T);
  P.stat.forEach(function(b){arr.push(b);});
  P.panels.forEach(function(b){
    var p=(T-b._s)/1.0,c;
    if(p>=1){arr.push(b);pIn++;return;}
    if(p<=0){
      var al=b._st===cur?1:(A.expl?(T<s1?1:0.28):(T<s1?1:Math.max(0,1-(T-s1)/0.5)));
      if(al<=0.01)return;
      c=asmClone(b);fvShift([c],b._o[0],b._o[1],b._o[2]);c.al=(b.al||1)*al;arr.push(c);return;
    }
    var f=1-asmEase(p);c=asmClone(b);fvShift([c],b._o[0]*f,b._o[1]*f,b._o[2]*f);
    c.c=fvMix(b.c,[255,205,110],0.4*Math.sin(Math.PI*p));arr.push(c);
  });
  P.hw.forEach(function(h){
    var p=(T-h.t0)/h.d;if(p<0)return;
    if(p>=1){
      hIn++;cnt[h.type]=(cnt[h.type]||0)+1;
      if(h.pre&&h.L&&T>=h.L._s+1.0)return;
      arr.push(h.b);return;
    }
    var f=1-asmEase(p),c=asmClone(h.b);fvShift([c],h.o[0]*f,h.o[1]*f,h.o[2]*f);
    c.c=fvMix(h.b.c,[255,255,255],0.5*Math.sin(Math.PI*p));arr.push(c);
  });
  return {arr:arr,cur:cur,pIn:pIn,hIn:hIn,cnt:cnt};
}
function asmPaint(A,T){
  var ctx=A.ctx,w=A.cv.width,h=A.cv.height,P=A.P,bh=130,sc=asmScene(A,T),g=ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'#fbf6f0');g.addColorStop(1,'#efe6dc');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  function ph(a){fvB(a,P.emn[0],P.emn[1],P.emn[2],1,1,1,[0,0,0]);a[a.length-1].al=0;fvB(a,P.emx[0]-1,P.emx[1]-1,P.emx[2]-1,1,1,1,[0,0,0]);a[a.length-1].al=0;}
  var tf=Math.max(0,Math.min(1,(T-P.buildEnd-1.0)/5.5)),cam={yaw:asmYaw(P,T)+A.dy,pit:0.42-0.08*asmEase(tf)+A.dp,zoom:0.95*A.zm,open:0};
  var Rg=null;
  if(A.ghost){var ga=P.panels.slice();ph(ga);Rg=fvPolys(P.S,ga,cam,w,h-bh);}
  ph(sc.arr);var R=fvPolys(P.S,sc.arr,cam,w,h-bh);
  function path(q){ctx.beginPath();ctx.moveTo(q[0][0],q[0][1]);for(var j=1;j<q.length;j++)ctx.lineTo(q[j][0],q[j][1]);ctx.closePath();}
  ctx.save();ctx.translate(0,12);
  path(R.floor);ctx.fillStyle='#e6dccf';ctx.fill();ctx.strokeStyle='#d3c5b4';ctx.lineWidth=1;ctx.stroke();
  path(R.shadow);ctx.fillStyle='rgba(60,38,28,0.2)';ctx.fill();
  if(Rg){
    ctx.strokeStyle='rgba(20,170,205,.6)';ctx.lineWidth=1.2;
    Rg.polys.forEach(function(q){if(q.al<=0)return;var nk=q.p.length;for(var k=0;k<nk;k++)if(q.e[k]){var a=q.p[k],b=q.p[(k+1)%nk];ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}});
  }
  ctx.lineJoin='round';
  R.polys.forEach(function(q){
    if(q.al<=0)return;
    var col='rgb('+q.rgb[0]+','+q.rgb[1]+','+q.rgb[2]+')';
    path(q.p);ctx.globalAlpha=q.al;ctx.fillStyle=col;ctx.fill();
    if(q.al>=1){ctx.strokeStyle=col;ctx.lineWidth=0.8;ctx.stroke();}
    ctx.globalAlpha=Math.min(1,q.al*0.9);ctx.strokeStyle='rgba(40,18,10,0.4)';ctx.lineWidth=0.7;
    var nk=q.p.length;for(var k=0;k<nk;k++)if(q.e[k]){var a=q.p[k],b=q.p[(k+1)%nk];ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
    ctx.globalAlpha=1;
  });
  ctx.restore();
  asmOverlay(ctx,w,h,P,T,bh,sc,A);
  return sc;
}
function asmOverlay(ctx,w,h,P,T,bh,sc,A){
  var y0=h-bh,N=P.steps.length-1,done=T>=P.buildEnd,cur=sc.cur,F='Tajawal,Tahoma,"Segoe UI",sans-serif',title,sub;
  if(done){title='تم التركيب بنجاح ✓';sub='الشكل النهائي للصنف';}
  else{title=P.steps[cur].title;sub=P.steps[cur].sub;}
  ctx.save();ctx.direction='rtl';ctx.textBaseline='middle';
  ctx.fillStyle='rgba(108,18,20,.95)';ctx.fillRect(0,y0,w,bh);ctx.fillStyle='#c99a3b';ctx.fillRect(0,y0,w,4);
  ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold 38px '+F;ctx.fillText(title,w/2+60,y0+46);
  ctx.fillStyle='#f5dcaa';ctx.font='22px '+F;ctx.fillText(sub||'',w/2+60,y0+90);
  ctx.textAlign='left';ctx.fillStyle='#f5dcaa';ctx.font='bold 21px '+F;
  ctx.fillText('الخطوة '+(done?N:cur)+'/'+N,24,y0+30);
  ctx.fillText('الألواح '+sc.pIn+'/'+P.panels.length,24,y0+62);
  ctx.fillText('التجهيزات '+sc.hIn+'/'+P.hw.length,24,y0+94);
  ctx.fillStyle='rgba(255,255,255,.25)';ctx.fillRect(0,h-8,w,8);ctx.fillStyle='#c99a3b';
  var pw=w*Math.min(1,T/P.total);ctx.fillRect(w-pw,h-8,pw,8);
  ctx.fillStyle='#6c1214';ctx.textAlign='right';ctx.font='bold 28px '+F;ctx.fillText('نيڤين للأثاث',w-28,36);
  ctx.textAlign='left';ctx.font='bold 26px '+F;ctx.fillText(P.name,28,36);
  ctx.fillStyle='#76696a';ctx.font='20px '+F;ctx.fillText(P.dims,28,68);
  if(T<1.8&&(A.recording||T<1.8)){
    ctx.globalAlpha=Math.min(1,(1.8-T)/0.5);ctx.fillStyle='rgba(108,18,20,.92)';ctx.fillRect(0,h*0.3,w,150);
    ctx.textAlign='center';ctx.fillStyle='#f5dcaa';ctx.font='28px '+F;ctx.fillText('طريقة تركيب',w/2,h*0.3+45);
    ctx.fillStyle='#fff';ctx.font='bold 48px '+F;ctx.fillText(P.name,w/2,h*0.3+100);
  }
  ctx.restore();
}
function asmUI(A,sc,T){
  var P=A.P,N=P.steps.length-1,cur=T>=P.buildEnd?N:sc.cur,k=cur+'|'+sc.pIn+'|'+sc.hIn;
  if(A.lastUI===k)return;A.lastUI=k;
  A.q('.asmcnt').textContent='الخطوة '+cur+'/'+N+' · الألواح '+sc.pIn+'/'+P.panels.length+' · التجهيزات '+sc.hIn+'/'+P.hw.length;
  if(!A.sliding)A.q('.asmsl').value=cur;
  Array.prototype.forEach.call(A.ov.querySelectorAll('b[data-t]'),function(b){b.textContent=sc.cnt[b.dataset.t]||0;});
}
function asmClose(){
  var A=ASM;if(!A)return;ASM=null;cancelAnimationFrame(A.raf);
  if(A.rec&&A.rec.state==='recording'){A.rec.onstop=null;try{A.rec.stop();}catch(e){}}
  A.ov.remove();
}
function asmRec(A){
  var msg=A.q('.asmmsg');
  if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){msg.textContent='هذا المتصفح لا يدعم تسجيل الفيديو — استخدم Chrome أو Safari حديث. يمكنك تصفّح الخطوات هنا.';return false;}
  var types=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'],mt='',chunks=[],rec,i;
  for(i=0;i<types.length;i++){if(MediaRecorder.isTypeSupported(types[i])){mt=types[i];break;}}
  try{rec=new MediaRecorder(A.cv.captureStream(30),mt?{mimeType:mt,videoBitsPerSecond:6000000}:{videoBitsPerSecond:6000000});}
  catch(e){msg.textContent='تعذّر تسجيل الفيديو على هذا الجهاز.';return false;}
  rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data);};
  rec.onstop=function(){
    var type=(rec.mimeType||mt||'video/webm').split(';')[0],ext=type.indexOf('mp4')>-1?'mp4':'webm';
    var blob=new Blob(chunks,{type:type}),name='niveen-assembly-'+String(A.P.name).replace(/[^\w\u0600-\u06FF-]+/g,'_')+'.'+ext;
    A.file={blob:blob,name:name,f:null};
    try{A.file.f=new File([blob],name,{type:type});}catch(e){}
    A.recording=false;A.ov.classList.remove('recing');
    Array.prototype.forEach.call(A.ov.querySelectorAll('button,input'),function(b){b.disabled=false;});
    msg.textContent='الفيديو جاهز ✓ — اضغط «تحميل» أو «مشاركة»'+(ext==='webm'?' (صيغة WebM: قد لا تفتح في بعض المعارض)':'');
  };
  A.rec=rec;rec.start(250);return true;
}
function asmMakeVideo(A){
  var msg=A.q('.asmmsg');
  if(!window.MediaRecorder){asmRec(A);return;}
  A.dy=0;A.dp=0;A.zm=1;A.expl=false;A.ghost=true;A.q('input[data-o=expl]').checked=false;A.q('input[data-o=ghost]').checked=true;
  A.T=0;A.tgt=0;A.file=null;A.dirty=true;
  if(!asmRec(A))return;
  A.recording=true;A.play=true;A.ov.classList.add('recing');
  Array.prototype.forEach.call(A.ov.querySelectorAll('button,input'),function(b){if(!b.matches('[data-a=x]'))b.disabled=true;});
  msg.textContent='جارٍ تسجيل الفيديو… (حوالي '+Math.round(A.P.total)+' ثانية)، لا تغلق النافذة';
  A.q('[data-a=play]').textContent='⏸';
}
function asmDownload(A){
  var F=A.file;if(!F)return;
  if(vdIOS()&&F.f&&navigator.canShare&&navigator.canShare({files:[F.f]})){navigator.share({files:[F.f],title:'فيديو تركيب '+A.P.name}).catch(function(){});toast('اختر «حفظ الفيديو» ليُحفظ في الصور');return;}
  var u=URL.createObjectURL(F.blob),a=document.createElement('a');a.href=u;a.download=F.name;document.body.appendChild(a);a.click();
  setTimeout(function(){a.remove();URL.revokeObjectURL(u);},4000);toast('تم تحميل الفيديو');
}
function asmShare(A){
  var F=A.file;if(!F)return;
  try{
    if(F.f&&navigator.canShare&&navigator.canShare({files:[F.f]})){
      navigator.share({files:[F.f],title:'فيديو تركيب '+A.P.name,text:'فيديو طريقة تركيب «'+A.P.name+'» — نيڤين للأثاث'}).catch(function(e){if(e&&e.name!=='AbortError')toast('تعذّرت المشاركة — استخدم «تحميل» ثم أرفق الفيديو يدويًا');});
      return;
    }
  }catch(e){}
  asmDownload(A);toast('هذا المتصفح لا يدعم مشاركة الملفات مباشرة — تم تحميل الفيديو، أرفقه في واتساب أو البريد');
}
function asmOpen(host,st){
  var S=fvSpec(host._d,host.dataset.nm);
  if(!S){toast('أدخل الطول والعرض والارتفاع أولًا');return;}
  var P=asmPlan(S,host._d,st);
  if(!P){toast('تعذّر إنشاء خطوات التركيب لهذا الصنف');return;}
  P.name=host.dataset.nm||'الصنف';
  asmClose();
  var N=P.steps.length-1,ov=document.createElement('div');ov.className='asmov';
  var chips=HWORD.filter(function(t){return P.tot[t];}).map(function(t){return '<span class="asmchip"><i style="background:rgb('+HWC[t].join(',')+')"></i>'+HWN[t]+' <b data-t="'+t+'">0</b>/'+P.tot[t]+'</span>';}).join('');
  ov.innerHTML='<div class="asmbox"><div class="asmtop"><b>🛠 خطوات تركيب: '+esc(P.name)+'</b><button type="button" class="btn ghost sm" data-a="x" style="color:#f5dcaa;border-color:#f5dcaa">إغلاق ✕</button></div>'+
    '<canvas width="1280" height="720"></canvas>'+
    '<div class="asmctl"><button class="btn sm" data-a="next" type="button" aria-label="الخطوة التالية">⏭</button><button class="btn gold sm" data-a="play" type="button" aria-label="تشغيل">▶</button><button class="btn sm" data-a="prev" type="button" aria-label="الخطوة السابقة">⏮</button>'+
    '<input class="asmsl" type="range" min="0" max="'+N+'" value="0" step="1" aria-label="الخطوة"><span class="asmcnt"></span></div>'+
    '<div class="asmopt"><label><input type="checkbox" data-o="expl"> منظر مفكّك</label><label><input type="checkbox" data-o="ghost" checked> الشكل النهائي (ظل سماوي)</label>'+
    '<button class="btn sm ghost" data-a="zi" type="button" style="color:#fff;border-color:#fff">＋</button><button class="btn sm ghost" data-a="zo" type="button" style="color:#fff;border-color:#fff">−</button><button class="btn sm ghost" data-a="rv" type="button" style="color:#fff;border-color:#fff">إعادة الزاوية</button>'+
    '<span style="color:#cbb">اسحب للتدوير · العجلة للتكبير · [ ] للتنقل · مسافة للتشغيل</span></div>'+
    '<div class="asminv">'+chips+'</div>'+
    '<div class="asmrow"><span class="asmmsg">اضغط «إنشاء الفيديو» ليُسجَّل شرح التركيب كاملًا (حوالي '+Math.round(P.total)+' ثانية) ثم يمكنك تحميله أو مشاركته.</span>'+
    '<button class="btn sm" data-a="mk" type="button">🎞 إنشاء الفيديو</button><button class="btn gold sm" data-a="dl" type="button" disabled>⬇ تحميل الفيديو</button><button class="btn gold sm" data-a="sh" type="button" disabled>📤 مشاركة</button></div></div>';
  document.body.appendChild(ov);
  var cv=ov.querySelector('canvas'),A={P:P,ov:ov,cv:cv,ctx:cv.getContext('2d'),raf:0,rec:null,file:null,T:0,tgt:0,play:false,expl:false,ghost:true,dy:0,dp:0,zm:1,dirty:true,recording:false,last:0,lastUI:'',sliding:false,
    q:function(x){return ov.querySelector(x);}};
  ASM=A;
  function go(i){var e=asmStepEnd(P,Math.max(0,Math.min(N,i)));A.play=false;A.q('[data-a=play]').textContent='▶';A.tgt=e;if(A.T>e)A.T=e;A.dirty=true;}
  function next(){var c=asmCur(P,A.T),e=asmStepEnd(P,c);A.play=false;A.q('[data-a=play]').textContent='▶';A.tgt=A.T<e-0.05?e:asmStepEnd(P,Math.min(N,c+1));}
  function prev(){var c=asmCur(P,A.T);go(c-1);if(c<=1&&A.T>1){A.T=0;A.tgt=0;}A.dirty=true;}
  function toggle(){
    if(A.recording)return;
    if(A.play){A.play=false;A.tgt=A.T;A.q('[data-a=play]').textContent='▶';}
    else{if(A.T>=P.total-0.05)A.T=0;A.play=true;A.q('[data-a=play]').textContent='⏸';}
    A.dirty=true;
  }
  A.next=next;A.prev=prev;A.toggle=toggle;
  ov.addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b||b.disabled)return;
    var a=b.dataset.a;
    if(a==='x')asmClose();else if(a==='next')next();else if(a==='prev')prev();else if(a==='play')toggle();
    else if(a==='zi'){A.zm=Math.min(3,A.zm*1.2);A.dirty=true;}else if(a==='zo'){A.zm=Math.max(0.5,A.zm/1.2);A.dirty=true;}
    else if(a==='rv'){A.dy=0;A.dp=0;A.zm=1;A.dirty=true;}
    else if(a==='mk')asmMakeVideo(A);else if(a==='dl')asmDownload(A);else if(a==='sh')asmShare(A);
  });
  ov.addEventListener('change',function(e){var t=e.target;if(t.dataset.o==='expl')A.expl=t.checked;else if(t.dataset.o==='ghost')A.ghost=t.checked;A.dirty=true;});
  var sl=A.q('.asmsl');
  sl.addEventListener('input',function(){A.sliding=true;go(+sl.value);});
  sl.addEventListener('change',function(){A.sliding=false;});
  var drag=null;
  cv.addEventListener('pointerdown',function(e){drag={x:e.clientX,y:e.clientY};try{cv.setPointerCapture(e.pointerId);}catch(x){}cv.style.cursor='grabbing';});
  cv.addEventListener('pointermove',function(e){if(!drag)return;A.dy+=(e.clientX-drag.x)*0.008;A.dp=Math.max(-0.35,Math.min(1.0,A.dp+(e.clientY-drag.y)*0.006));drag={x:e.clientX,y:e.clientY};A.dirty=true;});
  function up(){drag=null;cv.style.cursor='grab';}
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('wheel',function(e){e.preventDefault();A.zm=Math.max(0.5,Math.min(3,A.zm*(e.deltaY<0?1.1:1/1.1)));A.dirty=true;},{passive:false});
  if(!asmKey){asmKey=true;document.addEventListener('keydown',function(e){
    var X=ASM;if(!X)return;
    if(e.key==='Escape')asmClose();
    else if(e.key===']'||e.key==='ArrowLeft')X.next();
    else if(e.key==='['||e.key==='ArrowRight')X.prev();
    else if(e.key===' '&&!/^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test((e.target||{}).tagName||'')){e.preventDefault();X.toggle();}
  });}
  function loop(now){
    if(ASM!==A)return;
    var dt=A.last?Math.min(0.1,(now-A.last)/1000):0,moved=false;A.last=now;
    if(A.play){A.T+=dt;moved=true;if(A.T>=P.total){A.T=P.total;A.play=false;A.tgt=A.T;A.q('[data-a=play]').textContent='▶';if(A.recording&&A.rec&&A.rec.state==='recording')setTimeout(function(){try{A.rec.stop();}catch(e){}},600);}}
    else if(A.T<A.tgt){A.T=Math.min(A.tgt,A.T+dt*2.5);moved=true;}
    else if(A.T>A.tgt){A.T=A.tgt;moved=true;}
    if(moved||A.dirty||A.recording){A.dirty=false;asmUI(A,asmPaint(A,A.T),A.T);}
    A.raf=requestAnimationFrame(loop);
  }
  A.raf=requestAnimationFrame(loop);
}

/* ---------- منتقي الألوان لحقول اللون ---------- */
var clrPop=null,clrAnchor=null;
function clrClose(){if(clrPop){clrPop.remove();clrPop=null;clrAnchor=null;}}
function clrOpen(anchor,cb,cur){
  clrClose();
  var p=document.createElement('div');p.className='clrpop';
  p.innerHTML='<div class="clrgrid">'+CLRS.map(function(c,i){return '<button type="button" class="clrsw" data-i="'+i+'" title="'+c[0]+'" aria-label="'+c[0]+'" style="background:'+c[1]+'"></button>';}).join('')+'</div>'+
    '<label class="clrcus">لون مخصص <input type="color" value="'+(fvHex(cur)?cur:'#c89c62')+'"></label>';
  document.body.appendChild(p);
  var r=anchor.getBoundingClientRect(),w=p.offsetWidth,hh=p.offsetHeight;
  var top=r.bottom+4;if(top+hh>window.innerHeight-8)top=Math.max(8,r.top-hh-4);
  p.style.top=top+'px';p.style.left=Math.max(8,Math.min(window.innerWidth-w-8,r.right-w))+'px';
  p.addEventListener('click',function(e){var b=e.target.closest('.clrsw');if(b){var c=CLRS[+b.dataset.i];cb(c[0],c[1]);clrClose();}});
  var ci2=p.querySelector('input');
  ci2.addEventListener('input',function(){cb(clrName(this.value)+' '+this.value,this.value);});
  ci2.addEventListener('change',clrClose);
  clrPop=p;clrAnchor=anchor;
}
document.addEventListener('click',function(e){
  var t=e.target;
  if(t.matches&&t.matches('input[data-k="color"]')){
    if(clrAnchor===t)return;
    var m=/#[0-9a-f]{6}/i.exec(t.value);
    clrOpen(t,function(name){t.value=name;t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new Event('change',{bubbles:true}));},m?m[0]:'');
    return;
  }
  if(clrPop&&!clrPop.contains(t)&&!(clrAnchor&&clrAnchor.contains(t)))clrClose();
});
document.addEventListener('keydown',function(e){if(e.key==='Escape')clrClose();});
window.addEventListener('scroll',clrClose,true);

/* ================= كاتلوج الخامات والإكسسوارات ================= */
var CATS=[];
function seedSecs(){return [
  {id:'wood',name:'أخشاب وألواح',ico:'🪵',tone:'#a07048',core:1},
  {id:'acc',name:'إكسسوارات',ico:'🔩',tone:'#c99a3b',core:1},
  {id:'fab',name:'أقمشة وجلود',ico:'🧵',tone:'#7d8c6c',core:1},
  {id:'stone',name:'زجاج ورخام',ico:'🪟',tone:'#4f8a95'},
  {id:'oth',name:'أخرى',ico:'📦',tone:'#8e1c1f',core:1}];}
var catSecs=seedSecs(),catSecEdit=null;
function seedSubs(){
  var m={wood:['خشب عادي','خشب ملبس','خشب زان','خشب MDF','خشب أبلكاش'],
    acc:['مقابض','مفصلات','سكك أدراج','مسامير وبراغي','عجلات وأرجل','أقفال'],
    fab:['أقمشة','جلد طبيعي','جلد صناعي','إسفنج وحشو'],
    stone:['زجاج','رخام','جرانيت']},o=[];
  Object.keys(m).forEach(function(k){m[k].forEach(function(n,i){o.push({id:k+'_'+i,sec:k,name:n});});});
  return o;}
var catSubs=seedSubs(),catSub='all',catSubEdit=null;
function catSubById(id){for(var i=0;i<catSubs.length;i++)if(catSubs[i].id===id)return catSubs[i];return null;}
function catSubsOf(sec){return catSubs.filter(function(x){return x.sec===sec;});}
var SEC_ICOS=['🪵','🔩','🧵','🪟','📦','🎨','💡','🧱','🪑','🛏️','🔧','🧴','🪞','⚙️','🧰','✨'];
var SEC_TONES=['#a07048','#c99a3b','#7d8c6c','#4f8a95','#8e1c1f','#6b5b95','#b4575c','#3d4a34'];
function catSecById(id){for(var i=0;i<catSecs.length;i++)if(catSecs[i].id===id)return catSecs[i];return null;}
function catSync(){
  var have={};catSecs.forEach(function(x){have[x.id]=1;});
  seedSecs().forEach(function(x){if(x.core&&!have[x.id]){catSecs.push(x);have[x.id]=1;}});
  CATS.length=0;catSecs.forEach(function(x){CATS.push([x.id,x.name]);});
  if(Array.isArray(catSubs))catSubs=catSubs.filter(function(x){return x&&x.id&&x.name&&have[x.sec];});
  if(typeof catalog!=='undefined'&&Array.isArray(catalog))catalog.forEach(function(i){
    if(!have[i.cat])i.cat='oth';
    if(i.sub){var sb=catSubById(i.sub);if(!sb||sb.sec!==i.cat)i.sub='';}
  });
}
catSync();
var CAT_SLOTS=[
  {k:'wood',t:'نوع / لون الخشب',cat:'wood',multi:false,color:true},
  {k:'fab',t:'نوع القماش / الجلد',cat:'fab',multi:false,color:true},
  {k:'acc',t:'الإكسسوارات (مقابض، مفصلات، سكك…)',cat:'acc',multi:true},
  {k:'oth',t:'خامات أخرى (زجاج، رخام، تشطيب…)',cat:'oth',multi:true}
];
function catSlotList(d){return CAT_SLOTS.concat((d&&d.xs)||[]);}
var XS_HINTS=['لون الحديد / المعدن','نوع الرخام','نوع الزجاج','لون الدهان','نوع الإسفنج / المرتبة','لون الخياطة','نوع الإضاءة','تشطيب إضافي'];
var CZ_LAB={body:'لون الجسم والأبواب',handle:'لون المقابض',drawer:'لون واجهات الأدراج',base:'لون القاعدة والإطارات'};
function seedCatalog(){
  return ['خشب فاتح','بلوط','جوزي','بني غامق','ماهوجني','أبيض','كريمي','رمادي','أسود'].map(function(n,i){
    var c=CLRS.filter(function(x){return x[0]===n;})[0];
    return {id:'seed'+i,cat:'wood',name:n,code:'',hex:c?c[1]:'#c89c62',img:'',note:'لون مبدئي — استبدله بصورة العينة الفعلية',avail:true};
  });
}
var catalog=seedCatalog(),catCtx=null,catFilter='all',catQ='',catOnly=false,catManage=false,catEdit=null;
function catById(id){for(var i=0;i<catalog.length;i++)if(catalog[i].id===id)return catalog[i];return null;}
function catPattern(cat,hex){
  var c=fvHex(hex)?hex:'#d9d2cd';
  var p=cat==='fab'?'repeating-linear-gradient(0deg,rgba(0,0,0,.07) 0 1px,transparent 1px 4px),repeating-linear-gradient(90deg,rgba(255,255,255,.12) 0 1px,transparent 1px 4px)'
    :cat==='wood'?'repeating-linear-gradient(92deg,rgba(0,0,0,.08) 0 2px,transparent 2px 9px),repeating-linear-gradient(88deg,rgba(255,255,255,.1) 0 1px,transparent 1px 15px)'
    :'linear-gradient(135deg,rgba(255,255,255,.35),rgba(0,0,0,.12))';
  return 'background-color:'+c+';background-image:'+p;
}
function catThumb(it,sz){
  var cls='cthumb'+(sz?' '+sz:'');
  if(it&&it.img)return '<div class="'+cls+'"><img src="'+it.img+'" alt="'+esc(it.name)+'"></div>';
  return '<div class="'+cls+'" style="'+catPattern(it&&it.cat,it&&it.hex)+'"></div>';
}
function catCounts(){var c={all:catalog.length};CATS.forEach(function(x){c[x[0]]=0;});catalog.forEach(function(i){c[i.cat]=(c[i.cat]||0)+1;});return c;}
function catFiltered(){
  var q=catQ.trim().toLowerCase();
  return catalog.filter(function(i){
    if(catFilter!=='all'&&i.cat!==catFilter)return false;
    if(catSub==='none'){if(i.sub)return false;}else if(catSub!=='all'&&i.sub!==catSub)return false;
    if(catOnly&&i.avail===false)return false;
    if(q&&(i.name+' '+(i.code||'')+' '+(i.note||'')).toLowerCase().indexOf(q)<0)return false;
    return true;
  });
}
function catScItem(ctx){var sc=getScope(scOrderId);return sc.items[ctx.sk]||(sc.items[ctx.sk]={l:'',w:'',h:'',note:''});}
function catSnap(it){return {id:it.id,n:it.name,c:it.code||''};}
function catSelIds(ctx){
  var d=catScItem(ctx);
  if(ctx.slot.indexOf('cz:')===0){var s=(d.czs||{})[ctx.slot.slice(3)];return s?[s.id]:[];}
  var v=(d.cat||{})[ctx.slot];
  return v?(Array.isArray(v)?v:[v]).map(function(x){return x.id;}):[];
}
function catBack(){
  var ctx=catCtx;catCtx=null;catManage=false;catEdit=null;
  show('scope');
  if(ctx)setTimeout(function(){
    var h=document.querySelector('.fv3[data-sk="'+ctx.sk+'"]'),c=h&&h.closest('.card');
    if(c)c.scrollIntoView({block:'start'});
  },40);
}
function catOpenSubs(id){catFilter=id;catSub='all';catQ='';catOnly=false;catEdit=null;catSubEdit=null;catSecEdit=null;show('catsub');}
function catOpenItems(sub){catSub=sub;catQ='';catOnly=false;catEdit=null;catSubEdit=null;show('catsec');}
function catOpenSec(id){catFilter=id;catSub='all';catSubEdit=null;catQ='';catOnly=false;catEdit=null;catSecEdit=null;show('catsec');}
function catOpen(ctx){catCtx=ctx;catQ='';catOnly=false;catManage=false;catEdit=null;catSecEdit=null;
  if(ctx.cat&&catSecById(ctx.cat)){catOpenSec(ctx.cat);}else{catFilter='all';show('cat');}}
function catApply(it){
  var ctx=catCtx;if(!ctx)return;
  var d=catScItem(ctx),has=fvHex(it.hex);
  if(ctx.slot.indexOf('cz:')===0){
    var k=ctx.slot.slice(3);
    (d.czs||(d.czs={}))[k]=catSnap(it);
    if(has){if(k==='body'){d.cc=it.hex;d.fin='';}else{(d.cz||(d.cz={}))[k]=it.hex;}}
    catBack();return;
  }
  var cat=d.cat||(d.cat={});
  if(ctx.multi){
    var arr=cat[ctx.slot]||(cat[ctx.slot]=[]),at=-1;
    arr.forEach(function(x,j){if(x.id===it.id)at=j;});
    if(at>-1)arr.splice(at,1);else arr.push(catSnap(it));
    schedSave();catBannerRender();renderCatGrid();return;
  }
  cat[ctx.slot]=catSnap(it);
  var t=ftype(d,ctx.item);
  if(has&&(ctx.slot==='wood'||(ctx.slot==='fab'&&(t===FT[7]||t===FT[8]||t===FT[2])))){d.cc=it.hex;d.fin='';}
  catBack();
}
function catApplyHex(hex){
  var ctx=catCtx;if(!ctx||!fvHex(hex))return;
  var d=catScItem(ctx),snap={id:'',n:'لون مخصص — '+clrName(hex),c:hex,h:hex};
  if(ctx.slot.indexOf('cz:')===0){
    var k=ctx.slot.slice(3);(d.czs||(d.czs={}))[k]=snap;
    if(k==='body'){d.cc=hex;d.fin='';}else{(d.cz||(d.cz={}))[k]=hex;}
  }else{(d.cat||(d.cat={}))[ctx.slot]=snap;d.cc=hex;d.fin='';}
  catBack();
}
function catBannerHtml(){
  var ctx=catCtx;if(!ctx)return '';
  var n=catSelIds(ctx).length;
  return '<div class="catbanner"><div><b>اختر: '+esc(ctx.title)+'</b><span>للصنف «'+esc(ctx.item||'')+'»'+(ctx.order?' — طلب '+esc(ctx.order):'')+
    (ctx.multi?' · المختار الآن: '+n+' (اضغط على الصنف لإضافته أو إزالته)':' · اضغط على الصنف لاختياره')+'</span></div>'+
    '<div class="bar">'+(ctx.color?'<label class="clrcus" style="margin:0">لون مخصص <input type="color" data-a="catcolor" value="#c89c62"></label>':'')+
    '<button class="btn gold" type="button" data-a="catdone">'+(ctx.multi?'✓ تم — العودة للمراجعة':'← رجوع بدون اختيار')+'</button></div></div>';
}
function catBannerRender(){var h=catBannerHtml();['catBanner','catBanner2','catBanner3'].forEach(function(id){var b=$(id);if(b)b.innerHTML=h;});}
function catSubLabel(){var c=catSubById(catSub);return catSub==='none'?'غير مصنّف':(c?c.name:'كل الأصناف');}
function catScopeItems(){return catalog.filter(function(i){return i.cat===catFilter&&(catSub==='all'||(catSub==='none'?!i.sub:i.sub===catSub));});}
function catToolbarHtml(cnt){
  var s=catSecById(catFilter)||{name:'',ico:'',tone:'#a07048'};
  return '<div class="sechead" style="--sc:'+(fvHex(s.tone)?s.tone:'#a07048')+'"><span class="secico">'+esc(s.ico)+'</span><div><h2>'+esc(s.name)+' › '+esc(catSubLabel())+'</h2><small>'+catScopeItems().length+' صنف</small></div>'+
    '<button class="btn ghost sm" type="button" data-a="catsubs">← الأقسام الفرعية</button></div>'+
    '<div class="cattools"><input type="search" id="catSearch" placeholder="بحث بالاسم أو الكود…" value="'+esc(catQ)+'" aria-label="بحث في القسم">'+
    '<label class="chk" style="margin:0"><input type="checkbox" id="catOnly"'+(catOnly?' checked':'')+'> المتوفر فقط</label>'+
    '<button class="btn ghost sm" type="button" data-a="catmanage">'+(catManage?'إنهاء وضع الإدارة':'⚙ إدارة الأصناف')+'</button>'+
    (catManage?'<button class="btn gold sm" type="button" data-a="catnew">+ إضافة صنف</button><button class="btn ghost sm" type="button" data-a="catbulk">+ رفع عدة صور دفعة واحدة</button>':'')+'</div>';
}
function catEditHtml(){
  var e=catEdit;if(!e)return '';
  return '<div class="card cated"><h2>'+(e._new?'إضافة صنف للكاتلوج':'تعديل صنف')+'</h2><div class="catedgrid"><div class="catedimg">'+catThumb(e,'l')+
    '<div class="bar" style="margin-top:8px"><button class="btn ghost sm" type="button" data-a="catimg">'+(e.img?'تغيير الصورة':'+ رفع صورة')+'</button>'+(e.img?'<button class="btn ghost sm" type="button" data-a="catimgrm">حذف الصورة</button>':'')+'</div></div>'+
    '<div class="grid">'+
    '<div><label>القسم</label><select data-ce="cat">'+CATS.map(function(c){return '<option value="'+c[0]+'"'+(c[0]===e.cat?' selected':'')+'>'+c[1]+'</option>';}).join('')+'</select></div>'+
    '<div><label>القسم الفرعي</label><select data-ce="sub"><option value="">— بدون قسم فرعي —</option>'+catSubsOf(e.cat).map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===e.sub?' selected':'')+'>'+esc(x.name)+'</option>';}).join('')+'</select></div>'+
    '<div class="wide"><label>الاسم</label><input data-ce="name" value="'+esc(e.name)+'" placeholder="مثال: بلوط طبيعي / مقبض ذهبي 128مم"></div>'+
    '<div><label>الكود</label><input data-ce="code" value="'+esc(e.code)+'"></div>'+
    '<div><label>اللون التقريبي (يُستخدم في المجسم)</label><input type="color" data-ce="hex" value="'+(fvHex(e.hex)?e.hex:'#c89c62')+'"></div>'+
    '<div class="full"><label>ملاحظات (سماكة، مقاس، مورد، سعر…)</label><input data-ce="note" value="'+esc(e.note)+'"></div>'+
    '<div><label class="chk" style="margin:0"><input type="checkbox" data-ce="avail"'+(e.avail===false?'':' checked')+'> متوفر حاليًا</label></div></div></div>'+
    '<div class="bar" style="margin-top:12px"><button class="btn gold" type="button" data-a="catsave">حفظ</button><button class="btn ghost" type="button" data-a="catedcancel">إلغاء</button></div></div>';
}
function renderCatGrid(){
  var el=$('catGrid');if(!el)return;
  var list=catFiltered(),pick=!!catCtx,sel=pick?catSelIds(catCtx):[],multi=pick&&catCtx.multi;
  if(!list.length){
    el.innerHTML='<div class="empty" style="grid-column:1/-1">'+(catalog.length?'لا توجد أصناف في هذا القسم بعد أو لا يوجد صنف مطابق للبحث.':'الكاتلوج فارغ.')+(catManage?'':' اضغط «⚙ إدارة الأصناف» ثم «+ إضافة صنف» لإضافة صور أصنافك.')+'</div>';
    return;
  }
  el.innerHTML=list.map(function(i){
    var on=sel.indexOf(i.id)>-1;
    return '<article class="ccard'+(on?' sel':'')+(i.avail===false?' off':'')+'" data-id="'+esc(i.id)+'"><div class="cimgw">'+catThumb(i,'')+
      (i.img?'<button type="button" class="czoom" data-a="catzoom" aria-label="تكبير الصورة">⤢</button>':'')+
      (on?'<span class="cchk">✓</span>':'')+(i.avail===false?'<span class="coff">غير متوفر</span>':'')+'</div>'+
      '<div class="cinfo">'+(i.sub&&catSubById(i.sub)?'<span class="csub">'+esc(catSubById(i.sub).name)+'</span>':'')+'<b>'+esc(i.name)+'</b>'+(i.code?'<span class="ccode">'+esc(i.code)+'</span>':'')+(i.note?'<small>'+esc(i.note)+'</small>':'')+'</div>'+
      '<div class="cact">'+(pick?'<button type="button" class="btn sm '+(on&&multi?'red':'gold')+'" data-a="catsel">'+(multi?(on?'إزالة':'+ إضافة'):(on?'✓ مختار':'اختيار'))+'</button>':'')+
      (catManage?'<button type="button" class="btn ghost sm" data-a="catedit">تعديل</button><button type="button" class="btn ghost sm" data-a="catdel">حذف</button>':'')+'</div></article>';
  }).join('');
}
function catSecItems(id){return catalog.filter(function(i){return i.cat===id;});}
function catSecCard(s){
  var items=catSecItems(s.id),n=items.length,av=items.filter(function(i){return i.avail!==false;}).length;
  var pv=items.filter(function(i){return i.img;}).concat(items.filter(function(i){return !i.img;})).slice(0,4);
  var tone=fvHex(s.tone)?s.tone:'#a07048';
  return '<article class="secard" tabindex="0" role="link" data-sid="'+esc(s.id)+'" style="--sc:'+tone+'" aria-label="فتح قسم '+esc(s.name)+'">'+
    (n?'<div class="secprev n'+pv.length+'">'+pv.map(function(i){return catThumb(i,'');}).join('')+'</div>':'<div class="secprev none">'+esc(s.ico)+'</div>')+
    '<div class="secbody"><span class="secico">'+esc(s.ico)+'</span><div><b>'+esc(s.name)+'</b><small>'+(n?av+' متوفر من '+n+' صنف':'لا توجد أصناف بعد')+(catSubsOf(s.id).length?' · '+catSubsOf(s.id).length+' قسم فرعي':'')+'</small></div><span class="secnum">'+n+'</span></div>'+
    (catManage?'<div class="cact"><button type="button" class="btn ghost sm" data-a="secedit">تعديل</button>'+(s.core?'':'<button type="button" class="btn ghost sm" data-a="secdel">حذف</button>')+'</div>':'')+'</article>';
}
function catSecEditHtml(){
  var e=catSecEdit;if(!e)return '';
  return '<div class="card secform"><h2>'+(e._new?'إضافة قسم جديد للكاتلوج':'تعديل القسم')+'</h2><div class="grid">'+
    '<div class="wide"><label>اسم القسم</label><input data-se="name" maxlength="40" value="'+esc(e.name)+'" placeholder="مثال: حديد ومعادن / إضاءة / دهانات"></div>'+
    '<div class="full"><label>الأيقونة</label><div class="icopick">'+SEC_ICOS.map(function(x){return '<button type="button" data-ico="'+x+'" class="'+(x===e.ico?'on':'')+'" aria-label="أيقونة '+x+'">'+x+'</button>';}).join('')+'</div></div>'+
    '<div class="full"><label>لون القسم</label><div class="clrpick">'+SEC_TONES.map(function(x){return '<button type="button" data-tone="'+x+'" class="'+(x===e.tone?'on':'')+'" style="background:'+x+'" aria-label="لون '+x+'"></button>';}).join('')+'</div></div></div>'+
    '<div class="bar" style="margin-top:12px"><button class="btn gold" type="button" data-a="secsave">'+(e._new?'إضافة القسم':'حفظ')+'</button><button class="btn ghost" type="button" data-a="seccancel">إلغاء</button></div></div>';
}
function renderCatSecs(){
  var g=$('catSecGrid');if(!g)return;
  $('v-cat').classList.toggle('catpick',!!catCtx);
  catBannerRender();
  $('catSecTools').innerHTML='<div class="cattools"><span class="hint" style="flex:1;margin:0">'+catSecs.length+' أقسام · '+catalog.length+' صنف</span>'+
    '<button class="btn ghost sm" type="button" data-a="catmanage">'+(catManage?'إنهاء وضع الإدارة':'⚙ إدارة الأقسام')+'</button></div>';
  $('catSecEd').innerHTML=catSecEditHtml();
  g.innerHTML=catSecs.map(catSecCard).join('')+
    '<button type="button" class="secard secadd" data-a="secnew"><span class="plus">+</span><b>إضافة قسم جديد</b><small>أنشئ قسمًا لأي نوع خامات جديد</small></button>';
}
function catSubCard(s,sub){
  var tone=fvHex(s.tone)?s.tone:'#a07048',all=sub==='all',none=sub==='none';
  var items=catSecItems(s.id).filter(function(i){return all||(none?!i.sub:i.sub===sub.id);});
  var n=items.length,av=items.filter(function(i){return i.avail!==false;}).length;
  var pv=items.filter(function(i){return i.img;}).concat(items.filter(function(i){return !i.img;})).slice(0,4);
  var key=all?'all':(none?'none':sub.id),title=all?'كل أصناف القسم':(none?'غير مصنّف':sub.name);
  return '<article class="secard" tabindex="0" role="link" data-sub="'+esc(key)+'" style="--sc:'+tone+'" aria-label="فتح '+esc(title)+'">'+
    (n?'<div class="secprev n'+pv.length+'">'+pv.map(function(i){return catThumb(i,'');}).join('')+'</div>':'<div class="secprev none">'+esc(s.ico)+'</div>')+
    '<div class="secbody"><span class="secico">'+(all?'🗂️':(none?'📂':esc(s.ico)))+'</span><div><b>'+esc(title)+'</b><small>'+(n?av+' متوفر من '+n+' صنف':'لا توجد أصناف بعد')+'</small></div><span class="secnum">'+n+'</span></div>'+
    (catManage&&!all&&!none?'<div class="cact"><button type="button" class="btn ghost sm" data-a="subedit">تعديل</button><button type="button" class="btn ghost sm" data-a="subdel">حذف</button></div>':'')+'</article>';
}
function renderCatSubPage(){
  var g=$('catSubGrid');if(!g)return;
  var s=catSecById(catFilter);
  if(!s){catFilter='all';show('cat');return;}
  $('v-catsub').classList.toggle('catpick',!!catCtx);
  catBannerRender();
  var subs=catSubsOf(s.id),items=catSecItems(s.id),none=items.filter(function(i){return !i.sub;}).length;
  $('catSubHead').innerHTML='<div class="sechead" style="--sc:'+(fvHex(s.tone)?s.tone:'#a07048')+'"><span class="secico">'+esc(s.ico)+'</span><div><h2>'+esc(s.name)+'</h2><small>'+items.length+' صنف · '+subs.length+' قسم فرعي</small></div><button class="btn ghost sm" type="button" data-a="catsecs">← كل الأقسام</button></div>';
  $('catSubTools').innerHTML='<div class="cattools"><button class="btn ghost sm" type="button" data-a="catmanage">'+(catManage?'إنهاء وضع الإدارة':'⚙ إدارة الأقسام الفرعية')+'</button></div>';
  var e=catSubEdit;
  $('catSubEd').innerHTML=e?'<div class="card"><h2>'+(e._new?'إضافة قسم فرعي جديد في «'+esc(s.name)+'»':'تعديل القسم الفرعي')+'</h2><div class="subform"><div><label>اسم القسم الفرعي</label><input data-sn maxlength="40" value="'+esc(e.name)+'" placeholder="مثال: خشب بلوط / مقابض ذهبية"></div><button type="button" class="btn gold sm" data-a="subsave">'+(e._new?'إضافة القسم':'حفظ')+'</button><button type="button" class="btn ghost sm" data-a="subcancel">إلغاء</button></div></div>':'';
  g.innerHTML=catSubCard(s,'all')+subs.map(function(x){return catSubCard(s,x);}).join('')+(none&&subs.length?catSubCard(s,'none'):'')+
    '<button type="button" class="secard secadd" data-a="subnew"><span class="plus">+</span><b>إضافة قسم فرعي</b><small>أنشئ قسمًا فرعيًا جديدًا داخل «'+esc(s.name)+'»</small></button>';
}
function renderCatSec(){
  if(!$('catTop'))return;
  if(!catSecById(catFilter)){catFilter='all';show('cat');return;}
  $('v-catsec').classList.toggle('catpick',!!catCtx);
  catBannerRender();
  $('catTop').innerHTML=catToolbarHtml(catCounts());
  $('catEd').innerHTML=catEditHtml();
  renderCatGrid();
}
function renderCat(){if(curView==='catsec')renderCatSec();else if(curView==='catsub')renderCatSubPage();else renderCatSecs();}
/* ---- بند الكاتلوج داخل مراجعة النطاق ---- */
function catSlots(k,d){
  var cs=d.cat||{};
  var h='<div class="catslots"><b>مواصفات الخامات من الكاتلوج</b> <span class="hint">— اضغط «اختيار من الكاتلوج» لفتح صفحة صور الأصناف المتوفرة لديك</span><div class="slotgrid">';
  catSlotList(d).forEach(function(s){
    var v=cs[s.k],arr=v?(Array.isArray(v)?v:[v]):[];
    h+='<div class="slot'+(s.x?' xslot':'')+'"><div class="slh">'+esc(s.t)+(s.x?'<button type="button" class="slx" style="float:left;font-size:.8rem" data-a="xsdel" data-sk="'+k+'" data-slot="'+s.k+'" title="حذف هذا الخيار">حذف الخيار</button>':'')+'</div><div class="slsel">'+arr.map(function(x,i){
      var it=catById(x.id)||(x.h?{cat:'wood',hex:x.h,name:x.n}:{name:x.n});
      return '<div class="slchip">'+catThumb(it,'s')+'<span><b>'+esc(x.n)+'</b>'+(x.c&&!x.h?'<small>'+esc(x.c)+'</small>':'')+'</span><button type="button" class="slx" data-a="catrm" data-sk="'+k+'" data-slot="'+s.k+'" data-i="'+i+'" aria-label="إزالة">×</button></div>';
    }).join('')+'</div><button type="button" class="btn ghost sm" data-a="catpick" data-sk="'+k+'" data-slot="'+s.k+'">'+(arr.length?(s.multi?'+ إضافة / تعديل':'تغيير'):'اختيار من الكاتلوج')+'</button></div>';
  });
  h+='</div>';
  h+='<details class="xsadd"><summary class="btn ghost sm">+ إضافة خيار آخر للمواصفات</summary><div class="xsform">'+
    '<div><label>اسم الخيار</label><input data-xn="'+k+'" list="xsl_'+k+'" placeholder="مثال: لون الحديد، نوع الرخام…" maxlength="60"><datalist id="xsl_'+k+'">'+XS_HINTS.map(function(x){return '<option value="'+esc(x)+'">';}).join('')+'</datalist></div>'+
    '<div><label>يُختار من قسم الكاتلوج</label><select data-xc="'+k+'">'+CATS.map(function(c){return '<option value="'+c[0]+'"'+(c[0]==='oth'?' selected':'')+'>'+c[1]+'</option>';}).join('')+'</select></div>'+
    '<label class="chk" style="margin:0"><input type="checkbox" data-xm="'+k+'"> السماح باختيار أكثر من صنف</label>'+
    '<button type="button" class="btn gold sm" data-a="xsadd" data-sk="'+k+'">إضافة الخيار</button></div></details>';
  return h+'</div>';
}
function catScopeAct(o,b){
  var ac=b.dataset.a,sk=b.dataset.sk,slot=b.dataset.slot,d=getScope(o.id).items[sk];if(!d)return;
  if(ac==='xsadd'){
    var f=b.closest('.xsform'),nm=f.querySelector('[data-xn]').value.trim();
    if(!nm){toast('اكتب اسم الخيار أولًا');return;}
    var xs=d.xs||(d.xs=[]);
    if(catSlotList(d).some(function(x){return x.t===nm;})){toast('هذا الخيار موجود بالفعل');return;}
    xs.push({k:'x'+uid(),t:nm,cat:f.querySelector('[data-xc]').value,multi:f.querySelector('[data-xm]').checked,x:1});
    var y0=window.scrollY;renderScope();window.scrollTo(0,y0);schedSave();return;
  }
  if(ac==='xsdel'){
    if(!confirm('حذف هذا الخيار وما اختير فيه؟'))return;
    d.xs=(d.xs||[]).filter(function(x){return x.k!==slot;});if(d.cat)delete d.cat[slot];
    var y1=window.scrollY;renderScope();window.scrollTo(0,y1);schedSave();return;
  }
  if(ac==='catrm'){
    var cat=d.cat||{},v=cat[slot];
    if(Array.isArray(v))v.splice(+b.dataset.i,1);else delete cat[slot];
    var y=window.scrollY;renderScope();window.scrollTo(0,y);schedSave();return;
  }
  var s=catSlotList(d).filter(function(x){return x.k===slot;})[0],bx=$('scBody').querySelector('.fv3[data-sk="'+sk+'"]');
  catOpen({sk:sk,slot:slot,cat:s.cat,multi:s.multi,color:s.color,title:s.t,item:bx?bx.dataset.nm:'',order:o.orderNo});
}
function catPrint(d){
  var cs=d.cat||{},rows=[];
  function one(x){var it=catById(x.id),im=it&&it.img?'<img src="'+it.img+'" alt="" style="width:46px;height:46px;object-fit:cover;border:1px solid #999;vertical-align:middle;margin-inline-end:6px">':'';return im+esc(x.n)+(x.c&&!x.h?' ('+esc(x.c)+')':'');}
  catSlotList(d).forEach(function(s){var v=cs[s.k];if(!v)return;var a=Array.isArray(v)?v:[v];if(a.length)rows.push([s.t,a.map(one).join('<br>')]);});
  Object.keys(CZ_LAB).forEach(function(k){var x=(d.czs||{})[k];if(x)rows.push([CZ_LAB[k]+' (من الكاتلوج)',one(x)]);});
  if(!rows.length)return '';
  return '<table class="kv">'+rows.map(function(r){return '<tr><td>'+esc(r[0])+'</td><td colspan="5">'+r[1]+'</td></tr>';}).join('')+'</table>';
}
/* ---- قراءة الصور وضغطها واستخراج متوسط اللون ---- */
function catReadImg(file,cb){
  if(!/^image\//.test(file.type))return;
  var r=new FileReader();
  r.onload=function(){
    var im=new Image();
    im.onload=function(){
      var s=Math.min(1,640/Math.max(im.width,im.height)),c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));
      var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
      var hex='';
      try{
        var sm=document.createElement('canvas');sm.width=sm.height=12;
        var sx=sm.getContext('2d');sx.drawImage(c,c.width*0.15,c.height*0.15,c.width*0.7,c.height*0.7,0,0,12,12);
        var p=sx.getImageData(0,0,12,12).data,R=0,G=0,B=0,n=p.length/4,i;
        for(i=0;i<p.length;i+=4){R+=p[i];G+=p[i+1];B+=p[i+2];}
        hex=fvHexOf([Math.round(R/n),Math.round(G/n),Math.round(B/n)]);
      }catch(e){}
      cb(c.toDataURL('image/jpeg',0.74),hex);
    };
    im.onerror=function(){toast('تعذر قراءة الصورة');};
    im.src=r.result;
  };
  r.readAsDataURL(file);
}
function initCat(){
  var top=$('catTop'),grid=$('catGrid'),ed=$('catEd'),bn=$('catBanner');
  /* ---- صفحة بطاقات الأقسام الفرعية ---- */
  var sbg=$('catSubGrid'),sbe=$('catSubEd'),sbt=$('catSubTools'),sbh=$('catSubHead'),bn3=$('catBanner3');
  bn3.addEventListener('click',function(e){var b=e.target.closest('button[data-a]');if(b&&b.dataset.a==='catdone')catBack();});
  bn3.addEventListener('change',function(e){if(e.target.dataset.a==='catcolor')catApplyHex(e.target.value);});
  sbh.addEventListener('click',function(e){var b=e.target.closest('button[data-a]');if(b&&b.dataset.a==='catsecs'){catFilter='all';catSubEdit=null;show('cat');}});
  sbt.addEventListener('click',function(e){var b=e.target.closest('button[data-a]');if(b&&b.dataset.a==='catmanage'){catManage=!catManage;renderCat();}});
  function subFocus(){var i=sbe.querySelector('[data-sn]');if(i){sbe.scrollIntoView({block:'center'});i.focus();}}
  sbg.addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');
    if(b){
      var a=b.dataset.a;
      if(a==='subnew'){catSubEdit={_new:1,name:''};renderCat();subFocus();return;}
      var card=b.closest('.secard'),cur=card&&catSubById(card.dataset.sub);if(!cur)return;
      if(a==='subedit'){catSubEdit={id:cur.id,name:cur.name};renderCat();subFocus();}
      else if(a==='subdel')armDel(b,function(){
        catalog.forEach(function(i){if(i.sub===cur.id)i.sub='';});
        catSubs=catSubs.filter(function(x){return x.id!==cur.id;});
        renderCat();schedSave();toast('تم حذف القسم الفرعي — أصنافه انتقلت إلى «غير مصنّف»');
      });
      return;
    }
    var c=e.target.closest('.secard');if(c&&c.dataset.sub)catOpenItems(c.dataset.sub);
  });
  sbg.addEventListener('keydown',function(e){
    if(e.key!=='Enter'&&e.key!==' ')return;
    var c=e.target.closest('.secard');if(c&&c.dataset.sub&&e.target===c){e.preventDefault();catOpenItems(c.dataset.sub);}
  });
  sbe.addEventListener('input',function(e){if(e.target.dataset.sn!==undefined&&catSubEdit)catSubEdit.name=e.target.value;});
  sbe.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.dataset.sn!==undefined){e.preventDefault();var sb=sbe.querySelector('[data-a=subsave]');if(sb)sb.click();}});
  sbe.addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b||!catSubEdit)return;
    if(b.dataset.a==='subcancel'){catSubEdit=null;renderCat();}
    if(b.dataset.a==='subsave'){
      var nm=String(catSubEdit.name||'').trim();
      if(!nm){toast('اكتب اسم القسم الفرعي أولًا');return;}
      var dup=catSubsOf(catFilter).some(function(x){return x.id!==catSubEdit.id&&x.name.trim().toLowerCase()===nm.toLowerCase();});
      if(dup){toast('يوجد قسم فرعي بنفس الاسم في هذا القسم');return;}
      if(catSubEdit._new){catSubs.push({id:'u'+uid(),sec:catFilter,name:nm});toast('تمت إضافة القسم الفرعي «'+nm+'»');}
      else{var ex=catSubById(catSubEdit.id);if(ex)ex.name=nm;toast('تم حفظ القسم الفرعي');}
      catSubEdit=null;renderCat();schedSave();
    }
  });
  /* ---- صفحة الأقسام (بطاقات + إضافة قسم جديد) ---- */
  var sg=$('catSecGrid'),sed=$('catSecEd'),stl=$('catSecTools'),bn2=$('catBanner2');
  bn2.addEventListener('click',function(e){var b=e.target.closest('button[data-a]');if(b&&b.dataset.a==='catdone')catBack();});
  bn2.addEventListener('change',function(e){if(e.target.dataset.a==='catcolor')catApplyHex(e.target.value);});
  stl.addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');
    if(b&&b.dataset.a==='catmanage'){catManage=!catManage;if(!catManage)catSecEdit=null;renderCat();}
  });
  sg.addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');
    if(b){
      var a=b.dataset.a;
      if(a==='secnew'){catSecEdit={_new:1,name:'',ico:'📦',tone:SEC_TONES[3]};renderCat();sed.scrollIntoView({block:'center'});var inp=sed.querySelector('[data-se=name]');if(inp)inp.focus();return;}
      var card=b.closest('.secard'),s=card&&catSecById(card.dataset.sid);if(!s)return;
      if(a==='secedit'){catSecEdit={id:s.id,name:s.name,ico:s.ico,tone:s.tone};renderCat();sed.scrollIntoView({block:'center'});}
      else if(a==='secdel')armDel(b,function(){
        if(catSecItems(s.id).length){toast('القسم يحتوي أصنافًا — انقلها أو احذفها أولًا');return;}
        catSecs=catSecs.filter(function(x){return x.id!==s.id;});catSync();renderCat();schedSave();toast('تم حذف القسم');
      });
      return;
    }
    var c=e.target.closest('.secard');if(c&&c.dataset.sid)catOpenSubs(c.dataset.sid);
  });
  sg.addEventListener('keydown',function(e){
    if(e.key!=='Enter'&&e.key!==' ')return;
    var c=e.target.closest('.secard');if(c&&c.dataset.sid&&e.target===c){e.preventDefault();catOpenSubs(c.dataset.sid);}
  });
  sed.addEventListener('input',function(e){if(e.target.dataset.se==='name'&&catSecEdit)catSecEdit.name=e.target.value;});
  sed.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.dataset.se==='name'){e.preventDefault();var sb=sed.querySelector('[data-a=secsave]');if(sb)sb.click();}});
  sed.addEventListener('click',function(e){
    if(!catSecEdit)return;
    var ib=e.target.closest('[data-ico]'),tb=e.target.closest('[data-tone]');
    if(ib){catSecEdit.ico=ib.dataset.ico;sed.querySelectorAll('[data-ico]').forEach(function(x){x.classList.toggle('on',x===ib);});return;}
    if(tb){catSecEdit.tone=tb.dataset.tone;sed.querySelectorAll('[data-tone]').forEach(function(x){x.classList.toggle('on',x===tb);});return;}
    var b=e.target.closest('button[data-a]');if(!b)return;
    if(b.dataset.a==='seccancel'){catSecEdit=null;renderCat();}
    if(b.dataset.a==='secsave'){
      var nm=String(catSecEdit.name||'').trim();
      if(!nm){toast('اكتب اسم القسم أولًا');return;}
      var dup=catSecs.some(function(x){return x.id!==catSecEdit.id&&x.name.trim().toLowerCase()===nm.toLowerCase();});
      if(dup){toast('يوجد قسم بنفس الاسم');return;}
      if(catSecEdit._new){
        var ns={id:'s'+uid(),name:nm,ico:catSecEdit.ico,tone:catSecEdit.tone},oi=-1;
        catSecs.forEach(function(x,j){if(x.id==='oth')oi=j;});
        if(oi>-1)catSecs.splice(oi,0,ns);else catSecs.push(ns);
        toast('تمت إضافة القسم «'+nm+'»');
      }else{
        var ex=catSecById(catSecEdit.id);if(ex){ex.name=nm;ex.ico=catSecEdit.ico;ex.tone=catSecEdit.tone;}
        toast('تم حفظ القسم');
      }
      catSecEdit=null;catSync();renderCat();schedSave();
    }
  });
  function edThumb(){var w=ed.querySelector('.catedimg .cthumb');if(w&&catEdit)w.outerHTML=catThumb(catEdit,'l');}
  bn.addEventListener('click',function(e){var b=e.target.closest('button[data-a]');if(b&&b.dataset.a==='catdone')catBack();});
  bn.addEventListener('change',function(e){if(e.target.dataset.a==='catcolor')catApplyHex(e.target.value);});
  top.addEventListener('click',function(e){
    var p=e.target.closest('.catpill');
    if(p){catFilter=p.dataset.f;renderCat();return;}
    var b=e.target.closest('button[data-a]');if(!b)return;
    var a=b.dataset.a;
    if(a==='catsubs'){catEdit=null;catQ='';show('catsub');return;}
    if(a==='catmanage'){catManage=!catManage;if(!catManage)catEdit=null;renderCat();}
    if(a==='catnew'){
      catEdit={id:uid(),cat:catFilter!=='all'?catFilter:'wood',sub:(catSubById(catSub)?catSub:''),name:'',code:'',hex:'#c89c62',img:'',note:'',avail:true,_new:true};
      renderCat();ed.scrollIntoView({block:'center'});
    }
    if(a==='catbulk'){var m=$('catInMulti');m.value='';m.click();}
  });
  top.addEventListener('input',function(e){if(e.target.id==='catSearch'){catQ=e.target.value;renderCatGrid();}});
  top.addEventListener('change',function(e){if(e.target.id==='catOnly'){catOnly=e.target.checked;renderCatGrid();}});
  grid.addEventListener('click',function(e){
    var card=e.target.closest('.ccard');if(!card)return;
    var it=catById(card.dataset.id);if(!it)return;
    var b=e.target.closest('button[data-a]');
    if(b){
      var a=b.dataset.a;
      if(a==='catzoom'){if(it.img){$('lb').querySelector('img').src=it.img;$('lb').style.display='grid';}}
      else if(a==='catsel')catApply(it);
      else if(a==='catedit'){catEdit=JSON.parse(JSON.stringify(it));renderCat();ed.scrollIntoView({block:'center'});}
      else if(a==='catdel')armDel(b,function(){catalog=catalog.filter(function(x){return x.id!==it.id;});renderCat();schedSave();toast('تم حذف الصنف من الكاتلوج');});
      return;
    }
    if(catCtx)catApply(it);
  });
  ed.addEventListener('input',function(e){
    var t=e.target,f=t.dataset.ce;if(!f||!catEdit)return;
    catEdit[f]=t.type==='checkbox'?t.checked:t.value;
    if(f==='hex')catEdit.hexSet=true;
    if(f==='cat'){catEdit.sub='';renderCat();}else if(f==='hex')edThumb();
  });
  ed.addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b||!catEdit)return;
    var a=b.dataset.a;
    if(a==='catimg'){
      var f=$('catIn');f.value='';
      f.onchange=function(){var file=f.files[0];if(!file)return;catReadImg(file,function(url,hex){catEdit.img=url;if(hex&&!catEdit.hexSet)catEdit.hex=hex;renderCat();});};
      f.click();
    }
    if(a==='catimgrm'){catEdit.img='';renderCat();}
    if(a==='catedcancel'){catEdit=null;renderCat();}
    if(a==='catsave'){
      if(!String(catEdit.name||'').trim()){toast('اكتب اسم الصنف أولًا');return;}
      var o={id:catEdit.id,cat:catEdit.cat,sub:(catSubById(catEdit.sub)&&catSubById(catEdit.sub).sec===catEdit.cat)?catEdit.sub:'',name:catEdit.name.trim(),code:(catEdit.code||'').trim(),hex:catEdit.hex,img:catEdit.img||'',note:catEdit.note||'',avail:catEdit.avail!==false};
      var at=-1;catalog.forEach(function(x,j){if(x.id===o.id)at=j;});
      if(at>-1)catalog[at]=o;else catalog.push(o);
      catEdit=null;renderCat();schedSave();toast('تم حفظ الصنف في الكاتلوج');
    }
  });
  $('catInMulti').onchange=function(){
    var files=Array.prototype.slice.call(this.files||[]),cat=catFilter!=='all'?catFilter:(catCtx?catCtx.cat:'wood'),left=files.length,added=0;
    if(!left)return;
    files.forEach(function(file){
      catReadImg(file,function(url,hex){
        catalog.push({id:uid(),cat:cat,sub:(catSubById(catSub)&&catSubById(catSub).sec===cat?catSub:''),name:file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' '),code:'',hex:hex||'#c89c62',img:url,note:'',avail:true});
        added++;
        if(--left===0){renderCat();schedSave();toast('تمت إضافة '+added+' صنف — عدّل أسماءها من زر «تعديل»');}
      });
    });
  };
}


/* ================= معرض المنتجات: صور وفيديوهات بروابط من مواقع أخرى ================= */
var gallery=[],galCtx=null,galKind='all',galTag='all',galQ='',galManage=false,galEdit=null,galBulk=false;
function galById(id){for(var i=0;i<gallery.length;i++)if(gallery[i].id===id)return gallery[i];return null;}
function galSafe(u){u=String(u||'').trim();return /^\s*(javascript|vbscript):/i.test(u)?'':u;}
/* يحوّل الرابط إلى مصدر صالح للعرض: يوتيوب / فيميو / جوجل درايف / دروب بوكس / روابط مباشرة */
function galNorm(u,kind){
  u=galSafe(u);var r={k:(kind==='img'||kind==='vid')?kind:'',src:u,embed:'',thumb:''},m;
  if((m=u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/))){
    r.k='vid';r.embed='https://www.youtube.com/embed/'+m[1]+'?autoplay=1&rel=0';r.thumb='https://img.youtube.com/vi/'+m[1]+'/hqdefault.jpg';return r;}
  if((m=u.match(/vimeo\.com\/(?:video\/)?(\d+)/))){r.k='vid';r.embed='https://player.vimeo.com/video/'+m[1]+'?autoplay=1';return r;}
  if((m=u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]+)/))){
    if(r.k==='vid'){r.embed='https://drive.google.com/file/d/'+m[1]+'/preview';r.thumb='https://drive.google.com/thumbnail?id='+m[1]+'&sz=w800';}
    else{r.k='img';r.src='https://drive.google.com/thumbnail?id='+m[1]+'&sz=w1600';}
    return r;}
  if(/dropbox\.com\//i.test(u)&&!/[?&]raw=1/.test(u)){r.src=/[?&]dl=0/.test(u)?u.replace(/([?&])dl=0/,'$1raw=1'):u+(u.indexOf('?')>-1?'&':'?')+'raw=1';}
  if(!r.k)r.k=/\.(mp4|webm|mov|m4v|ogv|ogg)(\?|#|$)/i.test(u)?'vid':'img';
  return r;
}
function galKindOf(it){return galNorm(it.u,it.k).k;}
function galThumb(it,sz){
  var n=galNorm(it.u,it.k),cls='cthumb'+(sz?' '+sz:''),inner,fail="this.parentNode.classList.add('gfail');this.remove()";
  if(n.k==='img')return '<div class="'+cls+'"><img loading="lazy" src="'+esc(n.src)+'" alt="'+esc(it.t)+'" onerror="'+fail+'"></div>';
  var th=galSafe(it.th)||n.thumb;
  if(th)inner='<img loading="lazy" src="'+esc(th)+'" alt="'+esc(it.t)+'" onerror="'+fail+'">';
  else if(!n.embed&&n.src)inner='<video muted playsinline preload="metadata" src="'+esc(n.src)+'#t=0.5" onerror="'+fail+'"></video>';
  else inner='<div class="gph">🎬</div>';
  return '<div class="'+cls+'">'+inner+'<span class="gplay"></span></div>';
}
function galPlay(it){
  var n=galNorm(it.u,it.k),ov=$('gvOv'),bx=ov.querySelector('.gvbox');
  bx.innerHTML=n.embed?'<iframe src="'+esc(n.embed)+'" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>'
    :'<video src="'+esc(n.src)+'" controls autoplay playsinline></video>';
  ov.style.display='grid';
}
function galStop(){var ov=$('gvOv');if(!ov)return;ov.querySelector('.gvbox').innerHTML='';ov.style.display='none';}
function galPreview(it){
  var n=galNorm(it.u,it.k);
  if(n.k==='vid')galPlay(it);
  else{$('lb').querySelector('img').src=n.src;$('lb').style.display='grid';}
}
function galTitleFrom(u,k,i){
  var t='';try{t=decodeURIComponent(String(u).split(/[?#]/)[0].split('/').pop()||'').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();}catch(e){}
  if(!t||/^(watch|view|preview|file|embed|uc|open|thumbnail)$/i.test(t)||/^[\w-]{11,}$/.test(t))t=(k==='vid'?'فيديو ':'صورة ')+(i||'');
  return t.trim();
}
function galCounts(){var c={all:gallery.length,img:0,vid:0};gallery.forEach(function(i){c[galKindOf(i)]++;});return c;}
function galTags(){var m={},o=[];gallery.forEach(function(i){var t=(i.tag||'').trim();if(t&&!m[t]){m[t]=1;o.push(t);}});return o;}
function galFiltered(){
  var q=galQ.trim().toLowerCase();
  return gallery.filter(function(i){
    if(galKind!=='all'&&galKindOf(i)!==galKind)return false;
    if(galTag!=='all'&&(i.tag||'').trim()!==galTag)return false;
    if(q&&((i.t||'')+' '+(i.tag||'')+' '+(i.note||'')).toLowerCase().indexOf(q)<0)return false;
    return true;
  });
}
/* ---- الاختيار داخل مراجعة النطاق ---- */
function galScItem(ctx){var sc=getScope(scOrderId);return sc.items[ctx.sk]||(sc.items[ctx.sk]={l:'',w:'',h:'',note:''});}
function galSelIds(ctx){return (galScItem(ctx).gal||[]).map(function(x){return x.id;});}
function galSnap(it){return {id:it.id,t:it.t||'',u:it.u,k:galKindOf(it),th:it.th||''};}
function galOpen(ctx){galCtx=ctx;galKind='all';galTag='all';galQ='';galManage=false;galEdit=null;galBulk=false;show('gal');}
function galBack(){
  var ctx=galCtx;galCtx=null;galManage=false;galEdit=null;galBulk=false;
  show('scope');
  if(ctx)setTimeout(function(){
    var h=document.querySelector('.fv3[data-sk="'+ctx.sk+'"]'),c=h&&h.closest('.card');
    if(c)c.scrollIntoView({block:'start'});
  },40);
}
function galToggle(it){
  var ctx=galCtx;if(!ctx)return;
  var d=galScItem(ctx),arr=d.gal||(d.gal=[]),at=-1;
  arr.forEach(function(x,j){if(x.id===it.id)at=j;});
  if(at>-1)arr.splice(at,1);else arr.push(galSnap(it));
  schedSave();galBannerRender();renderGalGrid();
}
function galBannerHtml(){
  var c=galCtx;if(!c)return '';
  return '<div class="catbanner"><div><b>اختر من معرض المنتجات</b><span>للصنف «'+esc(c.item||'')+'»'+(c.order?' — طلب '+esc(c.order):'')+' · المختار الآن: '+galSelIds(c).length+' (اضغط على الصورة أو الفيديو لإضافته أو إزالته)</span></div>'+
    '<div class="bar"><button class="btn gold" type="button" data-a="galdone">✓ تم — العودة للمراجعة</button></div></div>';
}
function galBannerRender(){var b=$('galBanner');if(b)b.innerHTML=galBannerHtml();}
function galSlots(k,d){
  var arr=d.gal||[];
  return '<div class="catslots galslots"><b>منتجات من معرض المنتجات</b> <span class="hint">— اختر الصور والفيديوهات التي وافق عليها العميل فتُضاف إلى الطلب وتظهر في نموذج المراجعة المطبوع</span>'+
    '<div class="slsel" style="margin-top:8px">'+arr.map(function(x){
      var it=galById(x.id)||x;
      return '<div class="slchip"><button type="button" class="galtb" data-a="galview" data-sk="'+k+'" data-id="'+esc(x.id)+'" aria-label="معاينة">'+galThumb(it,'s')+'</button><span><b>'+esc(it.t||x.t||'')+'</b><small>'+(galKindOf(it)==='vid'?'فيديو':'صورة')+'</small></span><button type="button" class="slx" style="color:var(--navy)" data-a="galshare" data-sk="'+k+'" data-id="'+esc(x.id)+'" aria-label="مشاركة">📤</button><button type="button" class="slx" data-a="galrm" data-sk="'+k+'" data-id="'+esc(x.id)+'" aria-label="إزالة">×</button></div>';
    }).join('')+'</div>'+
    '<button type="button" class="btn ghost sm" style="margin-top:8px" data-a="galpick" data-sk="'+k+'">'+(arr.length?'+ إضافة / تعديل':'اختيار من معرض المنتجات')+'</button></div>';
}
function galShare(it,o){
  var text=(o&&o.custName?'مرحبًا '+o.custName+'، ':'')+(it.t||'منتج')+(galKindOf(it)==='vid'?' (فيديو)':'');
  if(navigator.share){navigator.share({title:it.t||'منتج',text:text,url:it.u}).catch(function(){});return;}
  var msg=text+'\n'+it.u;
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
  if(navigator.clipboard)navigator.clipboard.writeText(msg).catch(function(){});
  toast('تم فتح واتساب برابط المنتج');
}
function galScopeAct(o,b){
  var ac=b.dataset.a,sk=b.dataset.sk,d=getScope(o.id).items[sk];if(!d)return;
  if(ac==='galrm'){
    d.gal=(d.gal||[]).filter(function(x){return x.id!==b.dataset.id;});
    var y=window.scrollY;renderScope();window.scrollTo(0,y);schedSave();return;
  }
  if(ac==='galview'||ac==='galshare'){
    var id=b.dataset.id,it=galById(id)||(d.gal||[]).filter(function(x){return x.id===id;})[0];
    if(it){if(ac==='galshare')galShare(it,o);else galPreview(it);}return;
  }
  var bx=$('scBody').querySelector('.fv3[data-sk="'+sk+'"]');
  galOpen({sk:sk,item:bx?bx.dataset.nm:'',order:o.orderNo});
}
function galPrint(d){
  var a=d.gal||[];if(!a.length)return '';
  var cells=a.map(function(x){
    var it=galById(x.id)||x,n=galNorm(it.u,it.k),th=n.k==='img'?n.src:(galSafe(it.th)||n.thumb);
    return '<span style="display:inline-block;width:150px;margin:0 0 8px 10px;vertical-align:top;text-align:center;font-size:.82rem">'+
      (th?'<img src="'+esc(th)+'" alt="" style="width:150px;height:112px;object-fit:cover;border:1px solid #999;display:block;margin-bottom:3px">':'<span style="display:block;width:150px;height:112px;border:1px solid #999;line-height:112px">🎬</span>')+
      esc(it.t||x.t||'')+(n.k==='vid'?'<br><small style="direction:ltr;display:block;word-break:break-all;color:#555">🎬 '+esc(String(it.u).slice(0,60))+'</small>':'')+'</span>';
  }).join('');
  return '<table class="kv"><tr><td>منتجات مختارة من المعرض</td><td colspan="5">'+cells+'</td></tr></table>';
}
/* ---- صفحة المعرض ---- */
function galToolbarHtml(cnt){
  var tags=galTags();
  function pill(attr,v,t,n,on){return '<button type="button" class="catpill'+(on?' on':'')+'" '+attr+'="'+esc(v)+'">'+t+(n!=null?'<em>'+n+'</em>':'')+'</button>';}
  return '<div class="cattools"><input type="search" id="galSearch" placeholder="بحث بالاسم أو التصنيف…" value="'+esc(galQ)+'" aria-label="بحث في المعرض">'+
    '<button class="btn ghost sm" type="button" data-a="galmanage">'+(galManage?'إنهاء وضع الإدارة':'⚙ إدارة المعرض')+'</button>'+
    (galManage?'<button class="btn gold sm" type="button" data-a="galnew">+ إضافة رابط صورة / فيديو</button><button class="btn ghost sm" type="button" data-a="galbulk">+ إضافة عدة روابط</button>':'')+'</div>'+
    '<div class="catpills">'+pill('data-gk','all','الكل',cnt.all,galKind==='all')+pill('data-gk','img','🖼️ صور',cnt.img,galKind==='img')+pill('data-gk','vid','🎬 فيديوهات',cnt.vid,galKind==='vid')+'</div>'+
    (tags.length?'<div class="catpills" style="margin-top:8px">'+pill('data-gt','all','كل التصنيفات',null,galTag==='all')+tags.map(function(t){return pill('data-gt',t,esc(t),null,galTag===t);}).join('')+'</div>':'');
}
function galTagList(){return '<datalist id="galTagDl">'+galTags().map(function(t){return '<option value="'+esc(t)+'">';}).join('')+'</datalist>';}
function galEditHtml(){
  var e=galEdit,kinds=[['','تلقائي (حسب الرابط)'],['img','صورة'],['vid','فيديو']];
  if(e){
    return '<div class="card galform"><h2>'+(e._new?'إضافة صورة / فيديو للمعرض':'تعديل')+'</h2><div class="catedgrid"><div class="catedimg" id="galPrev">'+(e.u?galThumb(e,'l'):'<div class="cthumb l"><div class="gph">🖼️</div></div>')+'</div>'+
      '<div class="grid"><div class="full"><label>رابط الصورة أو الفيديو (من موقعك أو يوتيوب أو جوجل درايف أو دروب بوكس…)</label><input data-ge="u" type="url" inputmode="url" placeholder="https://example.com/images/bedroom-1.jpg" value="'+esc(e.u)+'"></div>'+
      '<div><label>النوع</label><select data-ge="k">'+kinds.map(function(c){return '<option value="'+c[0]+'"'+(c[0]===(e.k||'')?' selected':'')+'>'+c[1]+'</option>';}).join('')+'</select></div>'+
      '<div class="wide"><label>الاسم</label><input data-ge="t" value="'+esc(e.t)+'" placeholder="مثال: غرفة نوم مودرن"></div>'+
      '<div><label>التصنيف (اختياري)</label><input data-ge="tag" list="galTagDl" value="'+esc(e.tag)+'" placeholder="مثال: غرف نوم">'+galTagList()+'</div>'+
      '<div class="wide"><label>رابط صورة مصغّرة للفيديو (اختياري)</label><input data-ge="th" type="url" value="'+esc(e.th)+'" placeholder="اتركه فارغًا لاستخدام الصورة التلقائية"></div>'+
      '<div class="full"><label>ملاحظات (مقاسات، خامات، سعر…)</label><input data-ge="note" value="'+esc(e.note)+'"></div></div></div>'+
      '<div class="bar" style="margin-top:12px"><button class="btn gold" type="button" data-a="galsave">حفظ</button><button class="btn ghost" type="button" data-a="galedcancel">إلغاء</button></div></div>';
  }
  if(galBulk){
    return '<div class="card galform"><h2>إضافة عدة روابط دفعة واحدة</h2><div class="grid"><div class="full"><label>رابط في كل سطر — ويمكنك كتابة الاسم بعد الرمز |</label>'+
      '<textarea data-gb="txt" placeholder="https://example.com/img/bed1.jpg | غرفة نوم مودرن&#10;https://youtu.be/XXXXXXXXXXX | فيديو المطبخ&#10;https://example.com/videos/sofa.mp4"></textarea></div>'+
      '<div><label>التصنيف (اختياري)</label><input data-gb="tag" list="galTagDl" placeholder="مثال: غرف نوم">'+galTagList()+'</div></div>'+
      '<div class="bar" style="margin-top:12px"><button class="btn gold" type="button" data-a="galbulksave">إضافة الكل</button><button class="btn ghost" type="button" data-a="galedcancel">إلغاء</button></div></div>';
  }
  return '';
}
function renderGalGrid(){
  var el=$('galGrid');if(!el)return;
  var list=galFiltered(),pick=!!galCtx,sel=pick?galSelIds(galCtx):[];
  if(!list.length){
    el.innerHTML='<div class="empty" style="grid-column:1/-1">'+(gallery.length?'لا توجد عناصر مطابقة للبحث أو التصفية.':'المعرض فارغ.')+(galManage?(gallery.length?'':' اضغط «+ إضافة رابط صورة / فيديو» وألصق رابط الصورة أو الفيديو المرفوع على موقعك.'):' اضغط «⚙ إدارة المعرض» لإضافة روابط صورك وفيديوهاتك.')+'</div>';
    return;
  }
  el.innerHTML=list.map(function(i){
    var on=sel.indexOf(i.id)>-1,vid=galKindOf(i)==='vid';
    return '<article class="ccard'+(on?' sel':'')+'" data-id="'+esc(i.id)+'"><div class="cimgw">'+galThumb(i,'')+
      '<button type="button" class="czoom" data-a="galzoom" aria-label="'+(vid?'تشغيل':'تكبير')+'">'+(vid?'▶ تشغيل':'⤢')+'</button>'+(on?'<span class="cchk">✓</span>':'')+'</div>'+
      '<div class="cinfo"><b>'+esc(i.t||'')+'</b>'+(i.tag?'<span class="ccode">'+esc(i.tag)+'</span>':'')+(i.note?'<small>'+esc(i.note)+'</small>':'')+'</div>'+
      '<div class="cact"><button type="button" class="btn ghost sm" data-a="galshare">📤 مشاركة</button>'+(pick?'<button type="button" class="btn sm '+(on?'red':'gold')+'" data-a="galsel">'+(on?'إزالة من الطلب':'+ إضافة للطلب')+'</button>':'')+
      (galManage?'<button type="button" class="btn ghost sm" data-a="galedit">تعديل</button><button type="button" class="btn ghost sm" data-a="galdel">حذف</button>':'')+'</div></article>';
  }).join('');
}
function renderGal(){
  if(!$('galTop'))return;
  $('v-gal').classList.toggle('catpick',!!galCtx);
  galBannerRender();
  $('galTop').innerHTML=galToolbarHtml(galCounts());
  $('galEd').innerHTML=galEditHtml();
  renderGalGrid();
}
function initGal(){
  var top=$('galTop'),grid=$('galGrid'),ed=$('galEd'),bn=$('galBanner'),ov=$('gvOv');
  ov.addEventListener('click',function(e){if(e.target===ov||e.target.closest('.gvx'))galStop();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')galStop();});
  bn.addEventListener('click',function(e){var b=e.target.closest('button[data-a]');if(b&&b.dataset.a==='galdone')galBack();});
  top.addEventListener('click',function(e){
    var p=e.target.closest('[data-gk],[data-gt]');
    if(p){if(p.dataset.gk!==undefined)galKind=p.dataset.gk;else galTag=p.dataset.gt;renderGal();return;}
    var b=e.target.closest('button[data-a]');if(!b)return;var a=b.dataset.a;
    if(a==='galmanage'){galManage=!galManage;if(!galManage){galEdit=null;galBulk=false;}renderGal();}
    if(a==='galnew'){galEdit={id:uid(),u:'',k:'',t:'',tag:galTag!=='all'?galTag:'',th:'',note:'',_new:true};galBulk=false;renderGal();ed.scrollIntoView({block:'center'});}
    if(a==='galbulk'){galBulk=true;galEdit=null;renderGal();ed.scrollIntoView({block:'center'});}
  });
  top.addEventListener('input',function(e){if(e.target.id==='galSearch'){galQ=e.target.value;renderGalGrid();}});
  grid.addEventListener('click',function(e){
    var card=e.target.closest('.ccard');if(!card)return;
    var it=galById(card.dataset.id);if(!it)return;
    var b=e.target.closest('button[data-a]');
    if(b){
      var a=b.dataset.a;
      if(a==='galzoom')galPreview(it);
      else if(a==='galshare')galShare(it);
      else if(a==='galsel')galToggle(it);
      else if(a==='galedit'){galEdit=JSON.parse(JSON.stringify(it));galBulk=false;renderGal();ed.scrollIntoView({block:'center'});}
      else if(a==='galdel')armDel(b,function(){gallery=gallery.filter(function(x){return x.id!==it.id;});renderGal();refresh();toast('تم حذف العنصر من المعرض');});
      return;
    }
    if(galCtx)galToggle(it);else galPreview(it);
  });
  ed.addEventListener('input',function(e){
    var t=e.target,f=t.dataset.ge;if(!f||!galEdit)return;
    galEdit[f]=t.value;
  });
  ed.addEventListener('change',function(e){
    var t=e.target,f=t.dataset.ge;if(!f||!galEdit)return;
    if(f==='u'||f==='k'||f==='th'){var pv=$('galPrev');if(pv&&galEdit.u)pv.innerHTML=galThumb(galEdit,'l');}
  });
  ed.addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b)return;var a=b.dataset.a;
    if(a==='galedcancel'){galEdit=null;galBulk=false;renderGal();return;}
    if(a==='galsave'&&galEdit){
      var u=galSafe(galEdit.u);
      if(!u){toast('ألصق رابط الصورة أو الفيديو أولًا');return;}
      var k=galNorm(u,galEdit.k).k,t=String(galEdit.t||'').trim()||galTitleFrom(u,k,gallery.length+1);
      var o={id:galEdit.id,u:u,k:galEdit.k||'',t:t,tag:String(galEdit.tag||'').trim(),th:galSafe(galEdit.th),note:galEdit.note||''},at=-1;
      gallery.forEach(function(x,j){if(x.id===o.id)at=j;});
      if(at>-1)gallery[at]=o;else gallery.push(o);
      galEdit=null;renderGal();refresh();toast('تم حفظ العنصر في المعرض');
    }
    if(a==='galbulksave'){
      var ta=ed.querySelector('[data-gb=txt]'),tg=ed.querySelector('[data-gb=tag]'),lines=(ta?ta.value:'').split(/\n+/),added=0;
      lines.forEach(function(ln){
        ln=ln.trim();if(!ln)return;
        var p=ln.split('|'),u=galSafe(p[0]);if(!u)return;
        var k=galNorm(u,'').k,t=(p.slice(1).join('|')||'').trim()||galTitleFrom(u,k,gallery.length+1);
        gallery.push({id:uid(),u:u,k:'',t:t,tag:tg?tg.value.trim():'',th:'',note:''});added++;
      });
      if(!added){toast('لم يتم العثور على روابط صالحة');return;}
      galBulk=false;renderGal();refresh();toast('تمت إضافة '+added+' عنصر إلى المعرض');
    }
  });
}

/* ---------- ربط الأحداث للأقسام الجديدة ---------- */
function initNew(){
  /* نوع الخامة */
  initMatSecs();
  /* نطاق العمل */
  $('scOrder').onchange=function(){scOrderId=this.value;planSel=null;renderScope();};
  $('scBody').addEventListener('pointerdown',planDown);
  $('scBody').addEventListener('input',function(e){
    var t=e.target;if(!scOrderId)return;
    var sc=getScope(scOrderId);
    if(t.dataset.pl!==undefined){planInput(t);return;}
    if(t.dataset.pcap!==undefined){var pp0=sc.pano&&sc.pano[+t.dataset.pcap];if(pp0){pp0.cap=t.value;schedSave();}return;}
    if(t.dataset.bf!==undefined){if(t.tagName==='SELECT'||t.type==='checkbox')return;if(bayApply(t)){fvRedraw(t.dataset.bk);schedSave();}return;}
    if(t.dataset.ds!==undefined)return;
    if(t.dataset.sec!==undefined){
      var dd=sc.items[t.dataset.sec];
      if(dd&&dd.secs&&dd.secs[+t.dataset.si]){
        if(t.dataset.pi!==undefined){var pp=dd.secs[+t.dataset.si].parts;if(pp&&pp[+t.dataset.pi])pp[+t.dataset.pi][t.dataset.sf]=t.value;}
        else dd.secs[+t.dataset.si][t.dataset.sf]=t.value;
        fvRedraw(t.dataset.sec);
      }
      return;
    }
    if(t.dataset.sk!==undefined){
      var u=sc.items[t.dataset.sk]||(sc.items[t.dataset.sk]={l:'',w:'',h:'',note:''});
      u[t.dataset.k]=t.value;
      if(t.dataset.k!=='note'){fvRedraw(t.dataset.sk);}
      if((t.dataset.k==='l'||t.dataset.k==='w')&&$('planSvgBox')){var o9=orderBy(scOrderId);if(o9)planRefreshSvg(o9);}
    }else if(t.dataset.o)sc[t.dataset.o]=t.value;
  });
  $('scBody').addEventListener('change',function(e){
    var t=e.target;if(!scOrderId)return;
    if(t.dataset.pl!==undefined)return;
    if(t.dataset.pmode!==undefined){var pp1=getScope(scOrderId).pano&&getScope(scOrderId).pano[+t.dataset.pmode];if(pp1){pp1.mode=t.value;var y2=window.scrollY;renderScope();window.scrollTo(0,y2);schedSave();}return;}
    if(t.dataset.bf!==undefined){
      if(t.tagName==='SELECT'||t.type==='checkbox'){if(bayApply(t)){var yb=window.scrollY;renderScope();window.scrollTo(0,yb);schedSave();}}
      return;
    }
    if(t.dataset.ds==='mode'){
      var ddm=getScope(scOrderId).items[t.dataset.dsk],bxm=$('scBody').querySelector('.fv3[data-sk="'+t.dataset.dsk+'"]');
      if(ddm&&bxm){
        var nm=scDoorN(ddm,bxm.dataset.nm);
        if(t.value==='custom'&&!(ddm.dsl&&ddm.dsl.length))ddm.dsl=doorSides(ddm.dsm||'mid',ddm.dsl,nm);
        ddm.dsm=t.value;
        var ym=window.scrollY;renderScope();window.scrollTo(0,ym);schedSave();
      }
      return;
    }
    if((t.dataset.sec!==undefined&&(t.dataset.sf==='k'||t.dataset.sf==='p'))||t.dataset.k==='type'||t.dataset.k==='doors'){var yy0=window.scrollY;renderScope();window.scrollTo(0,yy0);}
    if(t.dataset.o==='status'){var sc=getScope(scOrderId);if(t.value===SCS[2]&&!sc.date)sc.date=today();renderScope();}
    renderCycle();
  });
  $('scBody').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b)return;
    var o=orderBy(scOrderId);if(!o)return;
    var ac=b.dataset.a;
    if(ac==='scpick'||ac==='scnav'){
      var ks=mfgUnits(o).map(scKey),cur=ks.indexOf(scSel[o.id]);
      if(ac==='scpick')scSel[o.id]=b.dataset.sk;
      else{var nx=ks[Math.max(0,Math.min(ks.length-1,(cur<0?0:cur)+(+b.dataset.d)))];if(nx!==undefined)scSel[o.id]=nx;}
      renderScope();
      if(ac==='scnav'){var tl=$('scBody').querySelector('.sctile');if(tl)tl.scrollIntoView({block:'start'});}
      return;
    }
    if(ac==='panoadd'||ac==='panoview'||ac==='panorm'){panoScopeAct(o,b);return;}
    if(ac.slice(0,4)==='plan'){planAct(o,b);return;}
    if(ac==='galpick'||ac==='galrm'||ac==='galview'||ac==='galshare'){galScopeAct(o,b);return;}
    if(ac==='catpick'||ac==='catrm'||ac==='xsadd'||ac==='xsdel'){catScopeAct(o,b);return;}
    if(ac==='dstog'||ac==='bydoors'||ac==='byauto1'||ac==='byauto2'||ac==='byclr'||ac==='byadd'||ac==='bydel'||ac==='bycoladd'||ac==='bycoldel'||ac==='bypadd'||ac==='bypdel'||ac==='bypup'||ac==='bypdn'){bayAct(ac,b,o);return;}
    if(ac==='secadd'||ac==='secdel'||ac==='secdef'||ac==='secclr'||ac==='secmix'||ac==='secmixnew'||ac==='mixadd'||ac==='mixdel'||ac==='mixup'||ac==='mixdn'){
      var dd=getScope(o.id).items[b.dataset.sk],bx=$('scBody').querySelector('.fv3[data-sk="'+b.dataset.sk+'"]');
      if(!dd||!bx)return;
      var t0=ftype(dd,bx.dataset.nm),L0=num(dd.l),r0=fdef(t0,dd,L0);
      if(ac==='secdef')dd.secs=JSON.parse(JSON.stringify(defSecs(t0,L0,r0)));
      if(ac==='secclr')dd.secs=[];
      if(ac==='secadd'){if(!dd.secs||!dd.secs.length)dd.secs=JSON.parse(JSON.stringify(defSecs(t0,L0,r0)));dd.secs.push({k:'shelves',w:'',n:3,m:''});}
      if(ac==='secdel'&&dd.secs)dd.secs.splice(+b.dataset.si,1);
      if(ac==='secmixnew'){if(!dd.secs||!dd.secs.length)dd.secs=JSON.parse(JSON.stringify(defSecs(t0,L0,r0)));dd.secs.push({k:'mix',w:'',n:'',m:'',parts:[{p:'hang',n:1,h:''},{p:'shelves',n:2,h:''},{p:'drawers',n:2,h:''}]});}
      if(ac==='secmix'&&dd.secs){var s0=dd.secs[+b.dataset.si];if(s0){s0.parts=mixFrom(s0);s0.k='mix';}}
      if(dd.secs&&(ac==='mixadd'||ac==='mixdel'||ac==='mixup'||ac==='mixdn')){
        var s1=dd.secs[+b.dataset.si];
        if(s1){
          s1.parts=s1.parts||[];var pi=+b.dataset.pi,tm;
          if(ac==='mixadd')s1.parts.push({p:'shelves',n:2,h:''});
          else if(ac==='mixdel')s1.parts.splice(pi,1);
          else if(ac==='mixup'&&pi>0){tm=s1.parts[pi];s1.parts[pi]=s1.parts[pi-1];s1.parts[pi-1]=tm;}
          else if(ac==='mixdn'&&pi<s1.parts.length-1){tm=s1.parts[pi];s1.parts[pi]=s1.parts[pi+1];s1.parts[pi+1]=tm;}
        }
      }
      var yy1=window.scrollY;renderScope();window.scrollTo(0,yy1);return;
    }
    if(b.dataset.a==='scprint')printScope(o);
    if(b.dataset.a==='scvideo')vdOpen(o);
    if(b.dataset.a==='scparse'){
      var sc=getScope(o.id),n=0;
      mfgUnits(o).forEach(function(u){
        var d=scItem(sc,u);
        if(num(d.l)>0||num(d.w)>0||num(d.h)>0)return;
        var p=parseSize(u.p?u.p.size:u.l.size);
        if(p){d.l=p[0];d.w=p[1];d.h=p[2];n++;}
      });
      renderScope();renderCycle();toast(n?'تم استخراج أبعاد '+n+' صنف (الطول × العرض × الارتفاع). راجعها مع العميل':'لم يُعثر على مقاسات بصيغة 200×90×76 في الطلب');
    }
  });
  /* التكلفة */
  $('costOrder').onchange=function(){costOrderId=this.value;renderCost();};
  $('costBody').addEventListener('input',function(e){
    var t=e.target;if(!costOrderId)return;
    var c=getCost(costOrderId);
    if(t.dataset.s&&t.dataset.k){var r=c[t.dataset.s][+t.dataset.i];if(r){r[t.dataset.k]=t.value;recalcCost();}}
    else if(t.dataset.c)c[t.dataset.c]=t.value;
  });
  $('costBody').addEventListener('change',function(){renderCycle();});
  $('costBody').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b)return;
    var o=orderBy(costOrderId);if(!o)return;
    var c=getCost(o.id),a=b.dataset.a;
    if(a==='cadd'){c[b.dataset.s].push(JSON.parse(JSON.stringify(COST[b.dataset.s].add)));renderCost();}
    if(a==='cdel'){c[b.dataset.s].splice(+b.dataset.i,1);renderCost();renderCycle();}
    if(a==='cload'){loadCostMats(o,c);renderCost();renderCycle();}
    if(a==='cdefops'){var h1={};c.ops.forEach(function(r){h1[lkey(r.name)]=1;});DEF_OPS.forEach(function(n){if(!h1[lkey(n)])c.ops.push({name:n,hours:'',rate:'',note:''});});renderCost();}
    if(a==='cdefind'){var h2={};c.ind.forEach(function(r){h2[lkey(r.name)]=1;});DEF_IND.forEach(function(n){if(!h2[lkey(n)])c.ind.push({name:n,basis:IND_B[1],value:'',note:''});});renderCost();}
    if(a==='cprint')printCost(o);
  });
  /* التحويلات */
  $('deptAdd').onclick=function(){depts.push({id:uid(),name:'',head:''});renderDepts();var r=$('deptBody').lastElementChild;if(r)r.querySelector('input').focus();};
  $('deptBody').addEventListener('input',function(e){
    var t=e.target;if(t.dataset.i===undefined)return;
    if(t.dataset.i==='S')sto()[t.dataset.k]=t.value;else depts[+t.dataset.i][t.dataset.k]=t.value;
  });
  $('deptBody').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a=deptdel]');if(!b)return;
    var d=depts[+b.dataset.i];
    if(xfers.some(function(x){return x.from===d.id||x.to===d.id;})){toast('القسم مستخدم في تحويلات مسجلة ولا يمكن حذفه');return;}
    armDel(b,function(){depts.splice(+b.dataset.i,1);renderDepts();});
  });
  $('xfNew').onclick=function(){openXf(null);};
  ['xpOrder','xpFrom','xpTo','xpSt','xpBy'].forEach(function(id){$(id).addEventListener('change',renderXfPieces);});
  $('xpQ').addEventListener('input',renderXfPieces);
  $('xpPrint').onclick=printXfPieces;
  $('xpCsv').onclick=csvXfPieces;
  $('xfTbl').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b)return;
    var x=xfers.find(function(y){return y.id===b.dataset.id;});if(!x)return;
    if(b.dataset.a==='xfp')printXf(x);
    if(b.dataset.a==='xfe')openXf(x);
    if(b.dataset.a==='xfx')armDel(b,function(){xfers=xfers.filter(function(y){return y.id!==x.id;});renderXfer();schedSave();toast('تم حذف '+x.no);});
  });
  $('xfEdit').addEventListener('input',function(e){
    var t=e.target;if(!xfDraft)return;
    if(XFMAP[t.id]){xfDraft[XFMAP[t.id]]=t.value;return;}
    if(t.dataset.p!==undefined&&t.dataset.k){
      var pp=xfDraft.prods[+t.dataset.p];if(!pp)return;
      if(t.dataset.c!==undefined){var cc=pp.cuts[+t.dataset.c];if(!cc)return;cc[t.dataset.k]=t.value;xfDiffCell(t,cc);}
      else{pp[t.dataset.k]=t.value;if(t.dataset.k==='sent'||t.dataset.k==='recv')xfDiffCell(t,pp);}
      return;
    }
    if(t.dataset.sh!==undefined&&t.dataset.k){
      var sx=xfDraft.sheets[+t.dataset.sh];if(!sx)return;
      sx[t.dataset.k]=t.value;if(t.dataset.k==='name'||t.dataset.k==='t'||t.dataset.k==='size'||t.dataset.k==='sent')sx.auto=false;
      xfDiffCell(t,sx);return;
    }
    if(t.dataset.i!==undefined&&t.dataset.k){
      var it=xfDraft.items[+t.dataset.i];if(!it)return;
      it[t.dataset.k]=t.value;
      var tr=t.closest('tr'),td=tr&&tr.querySelector('.xfd');
      if(td){
        if(it.recv===''||it.recv==null){td.textContent='—';td.classList.remove('late');}
        else{var df=num(it.recv)-num(it.sent);td.textContent=fmt(df);td.classList.toggle('late',Math.abs(df)>1e-9);}
      }
    }
  });
  $('xfEdit').addEventListener('change',function(e){
    var t=e.target;if(!xfDraft)return;
    if(t.dataset.p!==undefined&&t.dataset.c===undefined&&t.dataset.k==='sent'){
      var p0=xfDraft.prods[+t.dataset.p];
      if(p0){(p0.cuts||[]).forEach(function(c){if(num(c.per)>0)c.sent=r3(num(c.per)*num(p0.sent));});xfRenderProds();}
      return;
    }
    if(t.dataset.p!==undefined&&t.dataset.c!==undefined&&t.dataset.k==='per'){
      var p1=xfDraft.prods[+t.dataset.p],c1=p1&&p1.cuts[+t.dataset.c];
      if(c1){c1.sent=r3(num(c1.per)*num(p1.sent));xfRenderProds();}
      return;
    }
    if(t.id==='xfFrom'){var f=dept(t.value);if(f){xfDraft.sender=f.head||'';$('xfSender').value=xfDraft.sender;}}
    if(t.id==='xfTo'){var g=dept(t.value);if(g){xfDraft.receiver=g.head||'';$('xfReceiver').value=xfDraft.receiver;}}
    if(t.id==='xfKind'&&t.value===XFK[0]){
      xfDraft.from='STORE';if(!xfDraft.to)xfDraft.to=depts[0]?depts[0].id:'';
      var f2=dept('STORE'),g2=dept(xfDraft.to);
      xfDraft.sender=f2.head||'';xfDraft.receiver=g2?g2.head||'':'';
      renderXfEd();
    }
  });
  $('xfEdit').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b||!xfDraft)return;
    var a=b.dataset.a;
    if(a==='xfadd'){xfDraft.items.push({name:'',unit:'',sent:'',recv:'',note:''});renderXfItems();}
    if(a==='xfdel'){if(xfDraft.items.length>1){xfDraft.items.splice(+b.dataset.i,1);renderXfItems();}}
    if(a==='xfloadmat')xfLoadMat();
    if(a==='xfloadparts')xfLoadParts();
    if(a==='xfloadprods')xfLoadProds();
    if(a==='xfprodadd'){xfDraft.prods.push({name:'',type:FT[0],sent:'',recv:'',l:'',w:'',h:'',doors:'',drawers:'',shelves:'',cols:1,color:'',cond:'',note:'',cuts:[],open:false});xfRenderProds();}
    if(a==='xfpdel'){xfDraft.prods.splice(+b.dataset.p,1);xfRenderProds();}
    if(a==='xfpcuts'){var pq=xfDraft.prods[+b.dataset.p];if(pq){pq.open=!pq.open;xfRenderProds();}}
    if(a==='xfcutgen'){
      var pg=xfDraft.prods[+b.dataset.p];if(!pg)return;
      var lst=xfCutList(xfSpecOfProd(pg));
      if(!lst.length){toast('أدخل الطول والعرض والارتفاع ونوع الأثاث أولًا ');return;}
      pg.cuts=xfMkCuts(lst,pg.sent);pg.open=true;xfRenderProds();toast('تم حساب قائمة القطع من المقاسات');
    }
    if(a==='xfcutadd'){var pa=xfDraft.prods[+b.dataset.p];if(pa){pa.cuts=pa.cuts||[];pa.cuts.push({name:'',l:'',w:'',t:18,per:1,sent:r3(num(pa.sent)),recv:'',note:''});pa.open=true;xfRenderProds();}}
    if(a==='xfcutdel'){var pd=xfDraft.prods[+b.dataset.p];if(pd){pd.cuts.splice(+b.dataset.c,1);xfRenderProds();}}
    if(a==='xfshadd'){xfDraft.sheets.push({name:'',t:18,size:'122×244',sent:'',recv:'',note:''});xfRenderSheets();}
    if(a==='xfshdel'){xfDraft.sheets.splice(+b.dataset.sh,1);xfRenderSheets();}
    if(a==='xfshcalc')xfCalcSheets();
    if(a==='xfrecvall')xfRecvAll();
    if(a==='xfsave')xfSave();
    if(a==='xfconfirm')xfConfirm();
    if(a==='xfreopen'){xfDraft.confirmed=false;xfDraft.status=XFS[0];renderXfEd();}
    if(a==='xfprint')printXf(xfDraft);
    if(a==='xfcancel'){xfDraft=null;renderXfEd();}
  });
}

/* ================= المستخدمون والصلاحيات (يحددها المدير) ================= */
var VIEW_NAMES={home:'الرئيسية',dash:'لوحة المتابعة',form:'تسجيل طلب',list:'سجل الطلبات',scope:'مراجعة النطاق',cost:'عناصر التكلفة',cycle:'الدورة المستندية',mats:'المواد والحصر',panel:'حاسبة الألواح',mrp:'احتياج الخامات',pr:'طلبات الشراء',xfer:'تحويل الأقسام',job:'مراحل التصنيع',cat:'كاتلوج الخامات',gal:'معرض المنتجات'};
var SECS=['dash','form','list','scope','cat','gal','cost','cycle','mats','panel','mrp','pr','xfer','job'];
var PRESETS={'مبيعات / مندوب':['form','list','scope','cat','gal'],'مخزن / مشتريات':['mats','mrp','pr','xfer'],'إنتاج / ورشة':['job','xfer'],'محاسب':['dash','cost']};
var curUser=null,accDraft=null;
function pinHash(p){return hsh('pin:'+p);}
function pinsOn(){return !!cfg.admin;}
function can(v){if(!curUser)return false;if(v==='catsec'||v==='catsub')v='cat';if(curUser.id==='admin'||v==='home')return true;return (curUser.views||[]).indexOf(v)>-1||((v==='cat'||v==='gal')&&(curUser.views||[]).indexOf('scope')>-1)||(v==='panel'&&(curUser.views||[]).indexOf('mats')>-1);}
function applyRole(){
  var u=null;
  if(!pinsOn())u={id:'admin',name:'المدير'};
  else{
    var id=null;try{id=sessionStorage.getItem('uid');}catch(e){}
    if(id==='admin')u={id:'admin',name:'المدير'};
    else u=(cfg.users||[]).filter(function(x){return x.id===id;})[0]||null;
  }
  document.body.className=document.body.className.replace(/\br-\w+\b/g,'').trim();
  if(!u){
    curUser=null;document.body.classList.add('locking');$('lockScr').style.display='grid';$('lockPin').value='';$('lockErr').style.display='none';
    setTimeout(function(){$('lockPin').focus();},50);return;
  }
  curUser=u;
  document.body.classList.add(u.id==='admin'?'r-admin':'r-user');document.body.classList.remove('locking');$('lockScr').style.display='none';
  document.querySelectorAll('.hcard[data-go]').forEach(function(c){c.style.display=can(c.dataset.go)?'':'none';});
  var rb=$('roleBtn');rb.style.display=pinsOn()?'':'none';rb.textContent='👤 '+u.name+' — خروج';
  if(u.id==='admin'&&!accDraft)renderAcc(true);
  if(!can(curView))show('home');
}
function accFromCfg(){return (cfg.users||[]).map(function(u){return {id:u.id,name:u.name,pinNew:'',hasPin:!!u.pin,views:(u.views||[]).slice()};});}
function renderAcc(force){
  if(force||!accDraft)accDraft=accFromCfg();
  $('accAdminSt').innerHTML=cfg.admin?'<span class="st done">✓ مفعّل</span>':'<span class="st na">غير محدد</span>';
  $('accAdmin').value='';
  $('accUsers').innerHTML=accDraft.length?accDraft.map(function(u,i){
    return '<div class="card" style="box-shadow:none;margin-bottom:12px" data-u="'+i+'"><div class="grid">'+
      '<div class="wide"><label>اسم المستخدم</label><input data-f="name" value="'+esc(u.name)+'" placeholder="مثال: أحمد — المخزن"></div>'+
      '<div><label>الرمز '+(u.hasPin?'<span class="st done">✓ مفعّل</span>':'<span class="st todo">مطلوب</span>')+'</label><input type="password" inputmode="numeric" autocomplete="new-password" data-f="pin" placeholder="'+(u.hasPin?'اتركه لإبقاء الحالي':'4 خانات أو أكثر')+'"></div></div>'+
      '<div class="bar" style="margin:10px 0 6px"><b>الأقسام المسموحة:</b>'+Object.keys(PRESETS).map(function(k){return '<button class="btn sm ghost" type="button" data-a="preset" data-n="'+esc(k)+'">'+esc(k)+'</button>';}).join('')+'<button class="btn sm ghost" type="button" data-a="presetall">الكل</button><button class="btn sm ghost" type="button" data-a="presetnone">لا شيء</button></div>'+
      '<div class="chips">'+SECS.map(function(v){return '<label class="chk chip"><input type="checkbox" data-f="view" data-v="'+v+'"'+(u.views.indexOf(v)>-1?' checked':'')+'>'+esc(VIEW_NAMES[v])+'</label>';}).join('')+'</div>'+
      '<div class="bar" style="margin-top:10px"><button class="btn sm red" type="button" data-a="udel">حذف المستخدم</button></div></div>';
  }).join(''):'<div class="empty">لا يوجد مستخدمون بعد. اضغط «إضافة مستخدم».</div>';
}
function saveAcc(){
  var adm=$('accAdmin').value.trim(),admH=cfg.admin||'';
  if(adm){if(adm.length<4){toast('رمز المدير يجب أن يكون 4 خانات أو أكثر');return;}admH=pinHash(adm);}
  if(!admH){toast('حدّد رمز المدير أولًا');return;}
  var users=[],seen={};seen[admH]='المدير';
  for(var i=0;i<accDraft.length;i++){
    var d=accDraft[i],old=(cfg.users||[]).filter(function(x){return x.id===d.id;})[0],nm=(d.name||'').trim(),ph=old?old.pin:'';
    if(!nm){toast('اكتب اسم كل مستخدم');return;}
    if(d.pinNew){if(d.pinNew.length<4){toast('رمز '+nm+' يجب أن يكون 4 خانات أو أكثر');return;}ph=pinHash(d.pinNew);}
    if(!ph){toast('حدّد رمزًا للمستخدم '+nm);return;}
    if(seen[ph]){toast('رمز '+nm+' يتشابه مع رمز '+seen[ph]+'، اختر رمزًا مختلفًا');return;}
    seen[ph]=nm;
    users.push({id:d.id,name:nm,pin:ph,views:d.views.slice()});
  }
  cfg.admin=admH;cfg.users=users;delete cfg.pins;
  try{sessionStorage.setItem('uid','admin');}catch(e){}
  accDraft=null;schedSave();applyRole();renderAcc(true);toast('تم حفظ المستخدمين والصلاحيات. ستُطلب الرموز عند فتح التطبيق على أي جهاز');
}
function initAccess(){
  $('lockGo').onclick=function(){
    var h=pinHash($('lockPin').value.trim()),hit=null;
    if(cfg.admin&&cfg.admin===h)hit='admin';
    else (cfg.users||[]).forEach(function(u){if(u.pin&&u.pin===h)hit=u.id;});
    if(!hit){$('lockErr').style.display='block';$('lockPin').value='';$('lockPin').focus();return;}
    try{sessionStorage.setItem('uid',hit);}catch(e){}
    applyRole();show('home');
  };
  $('lockPin').addEventListener('keydown',function(e){if(e.key==='Enter')$('lockGo').click();});
  $('roleBtn').onclick=function(){try{sessionStorage.removeItem('uid');}catch(e){}accDraft=null;applyRole();};
  $('accAdd').onclick=function(){if(!accDraft)accDraft=accFromCfg();accDraft.push({id:uid(),name:'',pinNew:'',hasPin:false,views:[]});renderAcc();};
  $('accSave').onclick=saveAcc;
  $('accClear').onclick=function(){armDel(this,function(){delete cfg.admin;delete cfg.users;delete cfg.pins;accDraft=null;schedSave();applyRole();renderAcc(true);toast('أُلغيت الحماية، التطبيق مفتوح للجميع');});};
  var box=$('accUsers');
  function ud(t){var c=t.closest('[data-u]');return c?accDraft[+c.dataset.u]:null;}
  box.addEventListener('input',function(e){var t=e.target,u=ud(t);if(!u)return;if(t.dataset.f==='name')u.name=t.value;if(t.dataset.f==='pin')u.pinNew=t.value.trim();});
  box.addEventListener('change',function(e){
    var t=e.target,u=ud(t);if(!u||t.dataset.f!=='view')return;
    var k=u.views.indexOf(t.dataset.v);
    if(t.checked&&k<0)u.views.push(t.dataset.v);if(!t.checked&&k>-1)u.views.splice(k,1);
  });
  box.addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b)return;var u=ud(b);if(!u)return;
    if(b.dataset.a==='preset'){u.views=PRESETS[b.dataset.n].slice();renderAcc();}
    if(b.dataset.a==='presetall'){u.views=SECS.slice();renderAcc();}
    if(b.dataset.a==='presetnone'){u.views=[];renderAcc();}
    if(b.dataset.a==='udel')armDel(b,function(){accDraft.splice(+b.closest('[data-u]').dataset.u,1);renderAcc();});
  });
  $('prOrd').onchange=function(){prOrdId=this.value;renderPrOrd();};
  $('prOrdAll').onchange=function(){prOrdAll=this.checked;};
  $('prOrdMake').onclick=makePrForOrder;
  renderAcc(true);
}

/* ---------- طلب خامات لطلب محدد ---------- */
var prOrdId='',prOrdAll=false;
function renderPrOrd(){
  var list=orders.filter(function(o){return o.status!==STATUS[4]&&o.status!==STATUS[5];}).sort(function(a,b){return (a.deliveryDate||'').localeCompare(b.deliveryDate||'');});
  if(!list.some(function(o){return o.id===prOrdId;}))prOrdId=list[0]?list[0].id:'';
  $('prOrd').innerHTML=list.length?list.map(function(o){return '<option value="'+o.id+'">'+esc(o.orderNo+' — '+o.custName+' (تسليم '+o.deliveryDate+')')+'</option>';}).join(''):'<option value="">لا توجد طلبات مفتوحة</option>';
  $('prOrd').value=prOrdId;$('prOrdAll').checked=prOrdAll;
  var o=orderBy(prOrdId),el=$('prOrdItems');
  if(!o){el.innerHTML='<div class="empty">لا توجد طلبات مفتوحة.</div>';return;}
  el.innerHTML=ordImgStrip(o)+'<div class="scroll"><table class="rec"><thead><tr><th>م</th><th>رقم الصنف</th><th>الصنف</th><th>المقاس</th><th>اللون / التشطيب</th><th>الكمية</th><th>الحصر</th></tr></thead><tbody>'+
    (o.lines||[]).map(function(l,i){
      var us=mfgUnits({lines:[l]}),ok=us.length&&us.every(function(u){var b=findBom({code:u.code,name:u.name});return b&&b.comps.length;});
      return '<tr><td>'+(i+1)+'</td><td>'+esc(l.code)+'</td><td>'+esc(l.name)+((l.parts&&l.parts.length)?'<span class="sub">'+esc(partsText(l))+'</span>':'')+'</td><td>'+esc(l.size)+'</td><td>'+esc(l.color)+'</td><td class="num">'+esc(l.qty)+(num(l.free)?' + '+esc(l.free):'')+'</td><td>'+(ok?'<span class="st done">✓ محصور</span>':'<span class="st todo">○ بلا حصر</span>')+'</td></tr>';
    }).join('')+'</tbody></table></div>'+(o.notes?'<p class="hint" style="margin-top:8px">ملاحظات: '+esc(o.notes)+'</p>':'');
}
function makePrForOrder(){
  var o=orderBy(prOrdId);if(!o){toast('اختر طلبًا');return;}
  if(!materials.length){toast('أضف الخامات أولًا في دليل الخامات');return;}
  var r=aggNeeds(o);
  if(r.missing.length){toast('أصناف بلا حصر مواد: '+r.missing.join('، '));return;}
  var oo=onOrderMap(),lines=[];
  Object.keys(r.agg).forEach(function(id){
    var m=matBy(id);if(!m)return;
    var q=prOrdAll?r.agg[id]:Math.max(0,r3(r.agg[id]-num(m.stock)-(oo[id]||0)));
    if(q>0)lines.push({mat:id,qty:Math.ceil(q*100)/100,price:num(m.price),note:'',img:m.img||''});
  });
  if(!lines.length){toast('المخزون وطلبات الشراء الحالية تغطي احتياج هذا الطلب');return;}
  var req=o.deliveryDate?addDays(o.deliveryDate,-num(cfg.mfgDays)):'';
  if(req&&req<today())req=today();
  prDraft={id:uid(),no:nextPrNo(),date:today(),req:req,supplier:'',status:PRS[0],notes:'طلب خامات للطلب '+o.orderNo,orders:[o.id],lines:lines,applied:false,_new:true};
  renderPrEd();$('prEdit').scrollIntoView({block:'start'});toast('جهّزت طلب شراء بخامات الطلب '+o.orderNo+'، راجعه ثم احفظه');
}

/* ---------- الحفظ التلقائي ---------- */
var loaded=false,lastStr='',saveTimer=null,pendingSave=false,dbp=null,fh=null,fhOk=false,pendingNext=null;
function setState(kind,text){var b=$('saveState');b.className='savepill '+kind;b.textContent=text;}
function hhmm(){var d=new Date();return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}
function idb(){
  if(dbp)return dbp;
  dbp=new Promise(function(res,rej){
    if(!window.indexedDB){rej(new Error('no idb'));return;}
    var r=indexedDB.open('ammar-furniture',1);
    r.onupgradeneeded=function(){r.result.createObjectStore('kv');};
    r.onsuccess=function(){res(r.result);};
    r.onerror=function(){rej(r.error);};
    r.onblocked=function(){rej(new Error('blocked'));};
  });
  return dbp;
}
function idbGet(k){return idb().then(function(db){return new Promise(function(res,rej){var q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=function(){res(q.result);};q.onerror=function(){rej(q.error);};});});}
function idbSet(k,v){return idb().then(function(db){return new Promise(function(res,rej){var t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=function(){res();};t.onerror=function(){rej(t.error);};t.onabort=function(){rej(t.error);};});});}
function ensureNewTpls(){if(!tpls['سرير منجّد'])tpls['سرير منجّد']=DEF_TPLS['سرير منجّد'].slice();}
function restoreAll(d){
  orders=d.orders||[];materials=d.materials||[];boms=d.boms||[];prs=d.prs||[];jobs=d.jobs||{};
  scopes=d.scopes||{};costs=d.costs||{};depts=d.depts||defDepts();xfers=d.xfers||[];
  catalog=Array.isArray(d.catalog)?d.catalog:seedCatalog();
  gallery=Array.isArray(d.gallery)?d.gallery:[];
  catSubs=Array.isArray(d.catSubs)?d.catSubs:seedSubs();
  catSecs=(Array.isArray(d.catSecs)&&d.catSecs.length)?d.catSecs:seedSecs();catSync();
  if(d.cfg)cfg=d.cfg;
  if(d.tpls&&typeof d.tpls==='object'&&Object.keys(d.tpls).length)tpls=d.tpls;
  ensureNewTpls();
  $('mfgDays').value=cfg.mfgDays;
}
function schedSave(){
  if(!loaded)return;
  pendingSave=true;setState('pending','● جارٍ الحفظ…');
  clearTimeout(saveTimer);saveTimer=setTimeout(doSave,450);
}
function writeFile(str){
  if(!fh||!fhOk)return Promise.resolve();
  return fh.createWritable().then(function(w){return w.write(str).then(function(){return w.close();});});
}
function doSave(){
  clearTimeout(saveTimer);
  var str=exportAll();
  if(str===lastStr){pendingSave=false;setState('ok','✓ محفوظ '+hhmm());return Promise.resolve();}
  return idbSet('state',str).then(function(){
    lastStr=str;pendingSave=false;
    return writeFile(str).then(function(){setState('ok','✓ محفوظ '+hhmm()+(fhOk?' (+ملف)':''));},function(){fhOk=false;setState('warn','⚠ تعذّر الحفظ في الملف المربوط');fileInfo();});
  },function(){pendingSave=false;setState('warn','⚠ تعذّر الحفظ التلقائي');});
}
function fileInfo(){
  var el=$('fileInfo'),b=$('fileLink');
  if(!window.showSaveFilePicker){b.style.display='none';el.textContent='ربط ملف تلقائي متاح في متصفحي Chrome وEdge على الكمبيوتر. في غيرهما استخدم تصدير نسخة JSON.';return;}
  if(fh&&fhOk){el.textContent='الملف المربوط: '+(fh.name||'')+' — يُحدَّث تلقائيًا مع كل حفظ.';b.textContent='تغيير الملف المربوط';}
  else if(fh){el.textContent='يلزم إعادة تفعيل الإذن للملف '+(fh.name||'')+'.';b.textContent='إعادة تفعيل الملف المربوط';}
  else{el.textContent='لا يوجد ملف مربوط.';b.textContent='ربط ملف للحفظ التلقائي';}
}
function linkFile(){
  var pick;
  if(fh&&!fhOk){pick=fh.requestPermission({mode:'readwrite'}).then(function(p){if(p!=='granted')throw new Error('denied');});}
  else{pick=window.showSaveFilePicker({suggestedName:'furniture-data.json',types:[{description:'JSON',accept:{'application/json':['.json']}}]}).then(function(h){fh=h;return idbSet('fh',h).catch(function(){});});}
  pick.then(function(){fhOk=true;return writeFile(exportAll());}).then(function(){fileInfo();toast('تم ربط الملف وحفظ البيانات فيه');setState('ok','✓ محفوظ '+hhmm()+' (+ملف)');})
    .catch(function(){fileInfo();});
}
function initStore(){
  if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(function(){});
  idbGet('state').then(function(str){
    if(str){
      var d=JSON.parse(str);restoreAll(d);
      if(!formDirty){editingId=null;fillForm(blank());}
      if(orders.length)toast('تم استرجاع '+orders.length+' طلب محفوظ');
    }
    return idbGet('fh').catch(function(){return null;});
  }).then(function(h){
    if(h){fh=h;return h.queryPermission({mode:'readwrite'}).then(function(p){fhOk=(p==='granted');}).catch(function(){});}
  }).then(function(){
    loaded=true;lastStr=exportAll();applyRole();refresh();fileInfo();setState('ok','✓ الحفظ التلقائي مفعّل');
  }).catch(function(){
    setState('warn','⚠ الحفظ التلقائي غير متاح هنا — افتح الملف مباشرة في المتصفح');applyRole();
  });
  $('saveState').onclick=function(){if(loaded){doSave().then(function(){toast('تم الحفظ');});}else toast('الحفظ التلقائي غير متاح في هذا العرض. حمّل الملف وافتحه في المتصفح.');};
  $('fileLink').onclick=linkFile;
  /* حفظ فوري عند مغادرة الصفحة أو إخفائها */
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&loaded&&pendingSave)doSave();});
  window.addEventListener('pagehide',function(){if(loaded&&pendingSave)doSave();});
  /* تحذير عند إغلاق الصفحة وفيها بيانات غير محفوظة */
  window.addEventListener('beforeunload',function(e){
    if(formDirty||bomDraft||prDraft||xfDraft||pendingSave){e.preventDefault();e.returnValue='';}
  });
  /* أي كتابة في الحقول تُجدول الحفظ (الخامات، المراحل ...) */
  document.addEventListener('input',function(){schedSave();});
  document.addEventListener('change',function(){schedSave();});
  /* حارس النموذج */
  $('v-form').addEventListener('input',function(){formDirty=true;});
  $('v-form').addEventListener('change',function(){formDirty=true;});
  $('v-form').addEventListener('click',function(e){var b=e.target.closest('button');if(b&&b.id!=='saveBtn'&&b.id!=='resetBtn')formDirty=true;});
  $('dlgSave').onclick=function(){save();if(saveOk){$('dlg').style.display='none';var n=pendingNext;pendingNext=null;if(n)n();}};
  $('dlgDiscard').onclick=function(){formDirty=false;editingId=null;fillForm(blank());$('dlg').style.display='none';var n=pendingNext;pendingNext=null;if(n)n();};
  $('dlgStay').onclick=function(){$('dlg').style.display='none';pendingNext=null;};
}
function guard(next){if(!formDirty){next();return;}pendingNext=next;$('dlg').style.display='grid';}
function nav(v){if(curView==='form'&&v!=='form')guard(function(){show(v);});else show(v);}

/* ---------- events ---------- */
function init(){
  build();
  fillForm(blank());
  document.querySelectorAll('.tab').forEach(function(t){t.onclick=function(){nav(t.dataset.v);};});
  $('homeBtn').onclick=function(){nav('home');};
  document.querySelectorAll('[data-go]').forEach(function(c){c.onclick=function(){nav(c.dataset.go);};});
  $('addOrdImg').onclick=function(){
    if(curImgs.length>=6){toast('الحد الأقصى 6 صور لكل طلب');return;}
    pickImage(function(d){curImgs.push({src:d,cap:''});renderOrdImgs();});
  };
  $('ordImgs').addEventListener('input',function(e){var t=e.target;if(t.dataset.i!==undefined&&t.tagName==='INPUT')curImgs[+t.dataset.i].cap=t.value;});
  $('ordImgs').addEventListener('click',function(e){var b=e.target.closest('button[data-i]');if(b){curImgs.splice(+b.dataset.i,1);renderOrdImgs();}});
  $('addLine').onclick=function(){$('linesBody').appendChild(lineRow());renum();};
  $('v-form').addEventListener('input',calc);
  $('saveBtn').onclick=save;
  $('resetBtn').onclick=function(){guard(function(){editingId=null;fillForm(blank());toast('نموذج جديد');});};
  ['q','fStatus','fBranch','fLate'].forEach(function(id){$(id).addEventListener('input',renderList);});
  $('listMode').addEventListener('click',function(e){var b=e.target.closest('button[data-m]');if(b)setListMode(b.dataset.m);});
  $('recTbl').addEventListener('click',function(e){
    var b=e.target.closest('button[data-a]');if(!b)return;
    var o=orders.find(function(x){return x.id===b.dataset.id;});if(!o)return;
    if(b.dataset.a==='print')printSheet(o);
    if(b.dataset.a==='edit'){editingId=o.id;fillForm(o);show('form');}
    if(b.dataset.a==='del'){
      if(b.dataset.armed){
        if(jobs[o.id]&&jobs[o.id].issued){toast('صُرفت خامات هذا الطلب. ألغِ الصرف من مراحل التصنيع قبل الحذف.');return;}
        if(xfers.some(function(x){return x.orderId===o.id;})){toast('للطلب تحويلات بين الأقسام. احذفها أولًا من تبويب تحويل الأقسام.');return;}
        orders=orders.filter(function(x){return x.id!==o.id;});delete jobs[o.id];delete scopes[o.id];delete costs[o.id];refresh();toast('تم حذف الطلب '+o.orderNo);}
      else{b.dataset.armed='1';b.textContent='تأكيد الحذف';setTimeout(function(){if(b.isConnected){delete b.dataset.armed;b.textContent='حذف';}},3000);}
    }
  });
  $('doPrint').onclick=function(){printWhenReady();};
  addViewPrintButtons();
  $('closeSheet').onclick=function(){$('sheetWrap').style.display='none';};
  $('pdfOrders').onclick=printOrdersPdf;$('csvOrders').onclick=exportOrders;$('csvLines').onclick=exportLines;
  $('bkExport').onclick=function(){download('furniture-production-backup-'+today()+'.json',exportAll(),'application/json');toast('تم تصدير النسخة الاحتياطية');};
  $('bkImportBtn').onclick=function(){$('bkImport').click();};
  $('bkImport').onchange=function(e){
    var f=e.target.files[0];if(!f)return;
    var r=new FileReader();
    r.onload=function(){
      try{
        var d=JSON.parse(r.result);
        if(!d||typeof d!=='object')throw 0;
        var a=importAll(d);refresh();
        toast('تم الاستيراد: '+a.o+' طلب، '+a.m+' خامة، '+a.b+' حصر، '+a.p+' طلب شراء');
      }catch(x){toast('الملف غير صالح. استخدم ملف نسخة احتياطية صادرًا من هذا السجل.');}
      e.target.value='';
    };
    r.readAsText(f);
  };
  $('sampleBtn').onclick=sample;
  document.addEventListener('keydown',function(e){if(e.key==='Escape')$('sheetWrap').style.display='none';});
  initProd();
  initParts();
  initNew();
  initCat();initGal();
  initAccess();
  refresh();
  initStore();
}

/* ---------- مشاركة موحّدة: window.share الخاصة بالمنصة ثم navigator.share ثم النسخ/التنزيل ---------- */
function appShare(title,text,file,fname){
  try{
    if(file&&navigator.canShare){var f=new File([file],fname,{type:'application/json'});
      if(navigator.canShare({files:[f]}))return navigator.share({files:[f],title:title}).catch(function(){});}
  }catch(e){}
  if(!file||file.length<30000){
    var msg=file||text;
    try{if(typeof window.share==='function'){window.share(title,msg);return Promise.resolve();}}catch(e){}
    if(navigator.share)return navigator.share({title:title,text:msg}).catch(function(){});
    if(navigator.clipboard&&text){return navigator.clipboard.writeText(msg).then(function(){toast('تم نسخ النص إلى الحافظة');});}
  }
  if(file){download(fname,file,'application/json');toast('تم تنزيل الملف');}
  return Promise.resolve();
}
/* ---------- المشاركة والمزامنة ---------- */
$('bkShare').onclick=function(){appShare('نسخة احتياطية - سجل الأثاث','',exportAll(),'furniture-backup-'+today()+'.json');};
var SY=null,syBusy=false,syLast='',shadow={},syTimer=null;
function syInfo(t){$('syncInfo').textContent=t;}
function hsh(x){var h=5381,i=x.length;while(i)h=(h*33)^x.charCodeAt(--i);return (h>>>0).toString(36)+'.'+x.length;}
function sk(k){return k.replace(/[.$#\[\]\/]/g,'_');}
function sBase(){return SY.u.replace(/\/+$/,'')+'/ws/'+encodeURIComponent(SY.c);}
function curMap(){
  var m={};
  orders.forEach(function(x){m[sk('o_'+x.id)]={k:'o_'+x.id,o:x};});
  materials.forEach(function(x){m[sk('m_'+x.id)]={k:'m_'+x.id,o:x};});
  boms.forEach(function(x){m[sk('b_'+x.id)]={k:'b_'+x.id,o:x};});
  prs.forEach(function(x){m[sk('p_'+x.id)]={k:'p_'+x.id,o:x};});
  depts.forEach(function(x){m[sk('d_'+x.id)]={k:'d_'+x.id,o:x};});
  xfers.forEach(function(x){m[sk('x_'+x.id)]={k:'x_'+x.id,o:x};});
  Object.keys(scopes).forEach(function(k){m[sk('s_'+k)]={k:'s_'+k,o:scopes[k]};});
  Object.keys(costs).forEach(function(k){m[sk('c_'+k)]={k:'c_'+k,o:costs[k]};});
  Object.keys(jobs).forEach(function(k){m[sk('j_'+k)]={k:'j_'+k,o:jobs[k]};});
  m.cfg={k:'cfg',o:cfg};m.tpls={k:'tpls',o:tpls};
  Object.keys(m).forEach(function(x){m[x].s=JSON.stringify(m[x].o);});
  return m;
}
function applyRec(r){
  var k=r.k,pre=k.slice(0,2),id=k.slice(2),arr={o_:orders,m_:materials,b_:boms,p_:prs,d_:depts,x_:xfers}[pre];
  if(k==='cfg'){if(!r.del){cfg=JSON.parse(r.d);$('mfgDays').value=cfg.mfgDays;applyRole();}return;}
  if(k==='tpls'){if(!r.del){tpls=JSON.parse(r.d);ensureNewTpls();}return;}
  if(pre==='s_'){if(r.del)delete scopes[id];else scopes[id]=JSON.parse(r.d);return;}
  if(pre==='c_'){if(r.del)delete costs[id];else costs[id]=JSON.parse(r.d);return;}
  if(pre==='j_'){if(r.del)delete jobs[id];else jobs[id]=JSON.parse(r.d);return;}
  if(!arr)return;
  var i=-1;arr.forEach(function(x,n){if(String(x.id)===id)i=n;});
  if(r.del){if(i>=0)arr.splice(i,1);return;}
  var o=JSON.parse(r.d);if(i>=0)arr[i]=o;else arr.push(o);
}
function syPull(){
  return fetch(sBase()+'/idx.json').then(function(r){if(!r.ok)throw {st:r.status};return r.json();}).then(function(idx){
    idx=idx||{};var cur=curMap(),need=[];
    Object.keys(idx).forEach(function(k){var sh=shadow[k];if(!sh||idx[k]>sh.t)need.push(k);});
    var got=0,p=Promise.resolve();
    need.forEach(function(k){p=p.then(function(){
      var c=cur[k],sh=shadow[k];
      if(c&&(!sh||hsh(c.s)!==sh.h))return;
      return fetch(sBase()+'/recs/'+k+'.json').then(function(r){return r.json();}).then(function(r){
        if(!r)return;applyRec(r);got++;
        if(r.del)shadow[k]={t:r.t,h:'del'};
        else shadow[k]={t:r.t,h:hsh(JSON.stringify(JSON.parse(r.d)))};
      });
    });});
    return p.then(function(){if(got){refresh();schedSave();}return got;});
  });
}
function syPush(){
  var cur=curMap(),upd={},pend={},n=0,now=Date.now();
  Object.keys(cur).forEach(function(k){var h=hsh(cur[k].s),sh=shadow[k];
    if(!sh||sh.h!==h){var t=Math.max(now,(sh?sh.t:0)+1);upd['recs/'+k]={t:t,k:cur[k].k,d:cur[k].s};upd['idx/'+k]=t;pend[k]={t:t,h:h};n++;}});
  Object.keys(shadow).forEach(function(k){if(!cur[k]&&shadow[k].h!=='del'){var t=Math.max(now,shadow[k].t+1);
    upd['recs/'+k]={t:t,k:k.replace(/^(.._)/,'$1'),del:1};upd['idx/'+k]=t;pend[k]={t:t,h:'del'};n++;}});
  if(!n)return Promise.resolve(0);
  var keys=Object.keys(pend),p=Promise.resolve();
  for(var i=0;i<keys.length;i+=12)(function(ch){p=p.then(function(){
    var body={};ch.forEach(function(k){body['recs/'+k]=upd['recs/'+k];body['idx/'+k]=upd['idx/'+k];});
    return fetch(sBase()+'.json',{method:'PATCH',body:JSON.stringify(body)}).then(function(r){if(!r.ok)throw {st:r.status};ch.forEach(function(k){shadow[k]=pend[k];});});
  });})(keys.slice(i,i+12));
  return p.then(function(){return n;});
}
function syTick(){
  if(!SY||syBusy||!loaded)return Promise.resolve();
  syBusy=true;
  return syPull().then(function(){return syPush();}).then(function(){
    syInfo('✓ متصل ومتزامن — آخر تحديث '+hhmm());
    return idbSet('sync',{u:SY.u,c:SY.c,shadow:shadow}).catch(function(){});
  }).catch(function(e){syInfo(syErr(e));})
  .then(function(){syBusy=false;});
}
function normUrl(u){
  u=(u||'').trim();if(u&&!/^https?:\/\//i.test(u))u='https://'+u;
  try{return new URL(u).origin;}catch(e){return u.replace(/\/+$/,'');}
}
function syErr(e){
  var st=e&&e.st;
  if(st===401||st===403)return '⚠ رفضت Firebase الاتصال (صلاحيات): افتح Realtime Database ← Rules وضع read و write بقيمة true ثم اضغط Publish.';
  if(st===404)return '⚠ رابط قاعدة البيانات غير صحيح (404). انسخ الرابط من أعلى صفحة Realtime Database وليس من شريط عنوان المتصفح.';
  if(st===423)return '⚠ قاعدة البيانات معطّلة أو غير مفعّلة (423). أنشئ Realtime Database وليس Firestore.';
  if(st)return '⚠ خطأ من الخادم ('+st+'). تحقق من الرابط وقواعد Firebase.';
  return '⚠ تعذّر الوصول إلى الخادم: تحقق من الإنترنت ومن كتابة الرابط بدقة (https://...firebaseio.com أو ...firebasedatabase.app)، وأن التطبيق يسمح بالاتصال بالإنترنت. ستُعاد المحاولة تلقائيًا وبياناتك محفوظة محليًا.';
}
function syStart(u,c){
  u=normUrl(u);
  SY={u:u,c:c};$('syncUrl').value=u;$('syncCode').value=c;
  clearInterval(syTimer);syTimer=setInterval(syTick,5000);syInfo('جارٍ الاتصال…');syTick();
}
$('syncOn').onclick=function(){
  var u=normUrl($('syncUrl').value),c=$('syncCode').value.trim();
  if(!/^https:\/\/.+\..+/.test(u)||/console\.firebase|google\.com/.test(u)){toast('أدخل رابط قاعدة Realtime Database وليس رابط لوحة Firebase');return;}
  if(c.length<4){toast('اختر رمز مساحة عمل من 4 أحرف على الأقل');return;}
  shadow={};idbSet('sync',{u:u,c:c,shadow:{}}).catch(function(){});syStart(u,c);toast('تم تفعيل المزامنة');
};
$('syncNow').onclick=function(){if(!SY){toast('فعّل المزامنة أولًا');return;}syTick().then(function(){toast($('syncInfo').textContent.charAt(0)==='✓'?'تمت المزامنة':'تعذّرت المزامنة — راجع الرسالة تحت الرمز');});};
$('syncOff').onclick=function(){clearInterval(syTimer);SY=null;idbSet('sync',null).catch(function(){});syInfo('المزامنة غير مفعّلة.');toast('تم إيقاف المزامنة، وبياناتك باقية على هذا الجهاز');};
$('syncInvite').onclick=function(){
  if(!SY){toast('فعّل المزامنة أولًا');return;}
  var code=btoa(encodeURIComponent(JSON.stringify({u:SY.u,c:SY.c})));
  var txt='رمز الانضمام لسجل طلبات الأثاث (الصقه في خانة «انضمام برمز»):\n'+code;
  appShare('دعوة للمزامنة',txt);
};
$('syncJoin').onclick=function(){
  try{var raw=$('joinCode').value.trim().split(/\s+/).pop(),d=JSON.parse(decodeURIComponent(atob(raw)));
    if(!d.u||!d.c)throw 0;shadow={};idbSet('sync',{u:d.u,c:d.c,shadow:{}}).catch(function(){});syStart(d.u,d.c);$('joinCode').value='';toast('تم الانضمام، ستظهر البيانات خلال لحظات');
  }catch(e){toast('رمز الدعوة غير صالح');}
};
idbGet('sync').then(function(c){if(c&&c.u){shadow=c.shadow||{};syStart(c.u,c.c);}}).catch(function(){});
window.addEventListener('online',syTick);
document.addEventListener('visibilitychange',function(){if(!document.hidden)syTick();});

/* ================= فيديو عرض تفاصيل الطلب (موشن جرافيك) ================= */
var VD={ov:null,cv:null,ctx:null,mc:null,mx:null,o:null,tl:null,t:0,play:false,raf:0,last:0,dirty:true,port:false,rec:null,recOn:false,logo:null,imgs:{},keyH:null,W:1280,H:720,sc:1};
var VDC={wine:'#8e1c1f',deep:'#5a0f11',gold:'#c99a3b',goldL:'#f5dcaa',cream:'#fbf6f0',cream2:'#efe6dc',ink:'#2a1c1c',muted:'#76696a',teal:'#1f7673',green:'#2f7a4b',red:'#c62828',beige:'#e0cfc5'};
var VDF='Tahoma,"Segoe UI","Noto Sans Arabic",Arial,sans-serif';
function vdClamp(x,a,b){return x<a?a:x>b?b:x;}
function vdS(x){return vdClamp(x,0,1);}
function vdEo(x){x=vdS(x);return 1-Math.pow(1-x,3);}
function vdEio(x){x=vdS(x);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;}
function vdDate(s){var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||'');return m?m[3]+'/'+m[2]+'/'+m[1]:(s||'');}
function vdRR(c,x,y,w,h,r){r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();}
function vdT(c,txt,x,y,size,color,align,weight,alpha){
  c.save();c.direction='rtl';c.textAlign=align||'right';c.textBaseline='alphabetic';
  c.font=(weight||'700')+' '+size+'px '+VDF;c.fillStyle=color;
  if(alpha!=null)c.globalAlpha=c.globalAlpha*alpha;
  c.fillText(String(txt),x,y);c.restore();
}
function vdFit(c,txt,maxW,size,min,weight){
  c.save();var s=size;
  while(s>min){c.font=(weight||'700')+' '+s+'px '+VDF;if(c.measureText(String(txt)).width<=maxW)break;s-=2;}
  c.restore();return s;
}
function vdWrap(c,txt,maxW,size,weight,maxLines){
  c.save();c.font=(weight||'600')+' '+size+'px '+VDF;
  var words=String(txt||'').replace(/\s+/g,' ').trim().split(' '),lines=[],cur='';
  words.forEach(function(w){
    var t=cur?cur+' '+w:w;
    if(c.measureText(t).width>maxW&&cur){lines.push(cur);cur=w;}else cur=t;
  });
  if(cur)lines.push(cur);
  c.restore();
  if(maxLines&&lines.length>maxLines){lines=lines.slice(0,maxLines);lines[maxLines-1]=lines[maxLines-1].replace(/\s*\S*$/,'')+'…';}
  return lines;
}
function vdImg(src){
  if(!src)return null;
  var m=VD.imgs[src];
  if(!m){m=VD.imgs[src]=new Image();m.onload=function(){VD.dirty=true;};m.src=src;}
  return m.complete&&m.naturalWidth?m:null;
}
function vdLogoImg(){
  if(!VD.logo){
    var el=document.querySelector('.hbanner img')||document.querySelector('.sheetlogo img');
    if(el&&el.src){VD.logo=new Image();VD.logo.onload=function(){VD.dirty=true;};VD.logo.src=el.src;}
  }
  return VD.logo&&VD.logo.complete&&VD.logo.naturalWidth?VD.logo:null;
}
function vdLogo(c,cx,cy,h,alpha){
  var im=vdLogoImg();if(!im)return;
  var w=h*im.naturalWidth/im.naturalHeight;
  c.save();c.globalAlpha*=(alpha==null?1:alpha);c.drawImage(im,cx-w/2,cy-h/2,w,h);c.restore();
}
/* ---- بيانات الأصناف ---- */
function vdState(d,u,sk){
  var base=FVS[sk],st={yaw:-0.62,pit:0.42,zoom:1,open:0,tgt:0,auto:false,ci:0,cc:null,set:false};
  if(base){st.ci=base.ci||0;st.cc=base.cc||null;st.set=!!base.set;}
  if(d.cc&&fvHex(d.cc)){st.cc=d.cc;st.set=true;}
  else if(d.fin!=null&&d.fin!==''&&FVFIN[+d.fin]){st.ci=+d.fin;st.cc=null;st.set=true;}
  else if(!st.set){var g=fvGuess(((u.p&&u.p.color)||'')+' '+(d.note||''));if(g){st.cc=g.cc;st.set=true;}}
  st.o=d;return st;
}
function vdMats(d){
  var out=[],cs=d.cat||{};
  catSlotList(d).forEach(function(s){
    var v=cs[s.k];if(!v)return;
    var a=Array.isArray(v)?v:[v];if(!a.length)return;
    out.push({t:s.t,items:a.map(function(x){var it=catById(x.id)||{};return {n:x.n||it.name||'',c:(x.c&&!x.h)?x.c:'',h:x.h||it.hex||'',img:it.img||''};})});
  });
  return out;
}
function vdCols(d,st){
  var out=[],cz=d.cz||{},czs=d.czs||{};
  function hexOf(k){
    if(k==='body')return st.set?(st.cc||fvHexOf(FVFIN[st.ci||0][1])):'';
    return cz[k]||'';
  }
  ['body','handle','drawer','base'].forEach(function(k){
    var hx=hexOf(k);if(!fvHex(hx)&&!czs[k])return;
    var nm=(czs[k]&&czs[k].n)||(fvHex(hx)?clrName(hx):'');
    out.push({t:CZ_LAB[k],h:fvHex(hx)?hx:'',n:nm});
  });
  return out;
}
function vdRows(it){
  var sp=it.sp,d=it.d,R=[];
  R.push(['نوع الأثاث',sp.type]);
  if(sp.cols>1)R.push(['عدد الأعمدة / الأقسام',sp.cols]);
  if(sp.doors>0)R.push(['عدد الأبواب',sp.doors]);
  if(sp.drawers>0)R.push(['عدد الأدراج',sp.drawers]);
  if(sp.shelves>0)R.push(['أرفف / وسائد',sp.shelves]);
  if(d.gl&&d.gl.t)R.push(['الزجاج / المرايا',({clear:'زجاج شفاف',smoke:'زجاج مدخن',mirror:'مرايا'}[d.gl.t]||'زجاج')]);
  if(d.lt&&d.lt.on)R.push(['الإضاءة','إضاءة ليد مدمجة']);
  return R;
}
function vdBuild(o){
  var sc=scopes[o.id]||{status:SCS[0],date:'',by:'',note:'',items:{}},us=mfgUnits(o),S=[],items=[];
  S.push({k:'intro',d:4.6});
  us.forEach(function(u,i){
    var sk=scKey(u),d0=(sc.items&&sc.items[sk])||{l:'',w:'',h:'',note:''},d=d0;
    if(!(num(d.l)>0&&num(d.w)>0&&num(d.h)>0)){
      var pz=parseSize(u.p?u.p.size:u.l.size);
      if(pz){d={};for(var q in d0)d[q]=d0[q];d.l=pz[0];d.w=pz[1];d.h=pz[2];}
    }
    var S3=fvSpec(d,u.name),st=vdState(d,u,sk);
    var it={u:u,d:d,sp:xfSpec(o,u),S:S3,st:st,name:u.name||'صنف',idx:i+1,n:us.length,rows:null,mats:vdMats(d),cols:vdCols(d,st)};
    it.rows=vdRows(it);
    it.ho=false;try{it.ho=!!(S3&&fvHasOpen(S3,st));}catch(e){}
    it.ph1=it.mats.length>0||it.cols.length>0||!!(it.d.note);
    items.push(it);
    S.push({k:'item',d:it.ph1?15:9,it:it,sp:it.ph1?8.4:99});
  });
  S.push({k:'outro',d:6.2});
  var t=0;S.forEach(function(s){s.t0=t;t+=s.d;});
  return {S:S,total:t,items:items,sc:sc};
}
/* ---- الخلفيات والإطار ---- */
function vdBg(c,W,H,dark,t){
  var g=c.createLinearGradient(0,0,W,H);
  if(dark){g.addColorStop(0,'#4a0c0e');g.addColorStop(.55,VDC.deep);g.addColorStop(1,'#7a1619');}
  else{g.addColorStop(0,VDC.cream);g.addColorStop(1,VDC.cream2);}
  c.fillStyle=g;c.fillRect(0,0,W,H);
  if(dark){
    var rg=c.createRadialGradient(W/2,H*.45,10,W/2,H*.45,Math.max(W,H)*.6);
    rg.addColorStop(0,'rgba(201,154,59,.20)');rg.addColorStop(1,'rgba(201,154,59,0)');
    c.fillStyle=rg;c.fillRect(0,0,W,H);
  }
}
function vdCube(c,cx,cy,sz,ang,alpha){
  var P=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(function(p){
    var x=p[0]*Math.cos(ang)-p[1]*Math.sin(ang),y=p[0]*Math.sin(ang)+p[1]*Math.cos(ang),z=p[2];
    return [cx+(x-y)*0.866*sz,cy+(x+y)*0.5*sz-z*sz];
  });
  c.save();c.globalAlpha*=alpha;c.strokeStyle=VDC.gold;c.lineWidth=1.6;
  [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(function(e){c.beginPath();c.moveTo(P[e[0]][0],P[e[0]][1]);c.lineTo(P[e[1]][0],P[e[1]][1]);c.stroke();});
  c.restore();
}
function vdFooter(c,W,H,o,t,total){
  var fh=H>W?64:56;
  c.save();
  c.fillStyle=VDC.deep;c.fillRect(0,H-fh,W,fh);
  c.fillStyle='rgba(255,255,255,.12)';c.fillRect(0,H-fh,W,3);
  c.fillStyle=VDC.gold;c.fillRect(0,H-fh,W*vdS(t/total),3);
  vdLogo(c,W-24-(fh-18)*1.1,H-fh/2+1,fh-18,1);
  vdT(c,'مراجعة نطاق العمل',28,H-fh/2+7,18,VDC.beige,'left','600');
  c.restore();
}
/* ---- المشاهد ---- */
function vdIntro(c,W,H,lt,o){
  var P=H>W,cx=W/2,cy=P?H*.42:H*.43;
  vdCube(c,W*.13,H*.30,P?60:84,lt*.7+.4,.30*vdEo(lt/1.2));
  vdCube(c,W*.88,H*.72,P?70:96,-lt*.6+1,.26*vdEo(lt/1.4));
  var wl=vdEo((lt-.15)/1.1)*(W*.42);
  c.save();c.strokeStyle='rgba(201,154,59,.55)';c.lineWidth=1.5;
  c.beginPath();c.moveTo(cx-wl,H*.2);c.lineTo(cx+wl,H*.2);c.moveTo(cx-wl,H*.8);c.lineTo(cx+wl,H*.8);c.stroke();c.restore();
  var s=vdEo((lt-.5)/1.3),lh=P?200:240;
  c.save();c.translate(cx,cy);c.scale(.86+.14*s,.86+.14*s);
  var rg=c.createRadialGradient(0,0,10,0,0,lh*1.6);rg.addColorStop(0,'rgba(245,220,170,'+(.22*s)+')');rg.addColorStop(1,'rgba(245,220,170,0)');
  c.fillStyle=rg;c.fillRect(-lh*2,-lh*1.6,lh*4,lh*3.2);
  vdLogo(c,0,0,lh,s);c.restore();
  if(!vdLogoImg())vdT(c,'نيفين للأثاث',cx,cy,64,VDC.goldL,'center','700',s);
  var gl=vdEo((lt-1.7)/.9)*(P?300:420);
  c.fillStyle=VDC.gold;c.fillRect(cx-gl/2,cy+lh*.62,gl,3);
  var a2=vdEo((lt-2.3)/.8);
  vdT(c,'عرض تفاصيل طلب العميل',cx,cy+lh*.62+(P?64:70)+(1-a2)*18,P?40:46,'#fff','center','700',a2);
  var a3=vdEo((lt-3)/.8);
  vdT(c,'المقاسات والتفاصيل والخامات',cx,cy+lh*.62+(P?116:128)+(1-a3)*14,P?26:28,VDC.goldL,'center','600',a3);
}
function vdCard(c,x,y,w,h,r){
  c.save();c.shadowColor='rgba(90,15,17,.16)';c.shadowBlur=22;c.shadowOffsetY=8;
  c.fillStyle='#fff';vdRR(c,x,y,w,h,r||16);c.fill();c.restore();
  c.save();c.strokeStyle='rgba(201,154,59,.55)';c.lineWidth=1.4;vdRR(c,x,y,w,h,r||16);c.stroke();c.restore();
}
function vdOrder(c,W,H,lt,o,TL){
  var P=H>W,fh=P?64:56,pad=P?36:56,top=P?70:60;
  var a0=vdEo(lt/.7);
  vdT(c,'بيانات طلب العميل',W-pad,top+(1-a0)*16,P?30:34,VDC.wine,'right','800',a0);
  c.fillStyle=VDC.gold;c.fillRect(W-pad-(P?150:190)*vdEo((lt-.3)/.8),top+14,(P?150:190)*vdEo((lt-.3)/.8),4);
  var info=[['اسم العميل',o.custName],['رقم الطلب',o.orderNo],['رقم التليفون',o.phone],['موقع التركيب',((o.address||'')+' '+(o.area||'')).trim()],['تاريخ الطلب',vdDate(o.orderDate)],['موعد التسليم',vdDate(o.deliveryDate)]].filter(function(r){return r[1];});
  var cx,cy,cw,ch;
  if(P){cx=pad;cy=top+50;cw=W-pad*2;ch=Math.min(540,info.length*86+36);}
  else{cx=W*.46;cy=top+50;cw=W-cx-pad;ch=H-cy-fh-36;}
  var ca=vdEo((lt-.4)/.7);c.save();c.globalAlpha=ca;vdCard(c,cx,cy+(1-ca)*20,cw,ch);c.restore();
  var rh=Math.min(P?86:80,(ch-36)/Math.max(1,info.length));
  info.forEach(function(r,i){
    var s=vdEo((lt-.9-i*.3)/.6),y=cy+34+i*rh+rh*.62;
    c.save();c.globalAlpha=s;
    vdT(c,r[0],cx+cw-26+(1-s)*50,y-(i===0?4:0),P?20:20,VDC.muted,'right','600');
    var big=i===0,sz=vdFit(c,r[1],cw-52,big?(P?40:44):(P?28:30),18,'800');
    vdT(c,r[1],cx+cw-26+(1-s)*50,y+(P?34:34),sz,big?VDC.wine:VDC.ink,'right','800');
    if(i<info.length-1){c.fillStyle='rgba(201,154,59,.30)';c.fillRect(cx+24,y+(P?46:46),cw-48,1);}
    c.restore();
  });
  var ix,iy,iw,ih;
  if(P){ix=pad;iy=cy+ch+30;iw=W-pad*2;ih=H-iy-fh-24;}
  else{ix=pad;iy=cy;iw=cx-pad-28;ih=ch;}
  var ia=vdEo((lt-.6)/.7);c.save();c.globalAlpha=ia;vdCard(c,ix,iy+(1-ia)*20,iw,ih);c.restore();
  vdT(c,'الأصناف المطلوبة ('+TL.items.length+')',ix+iw-24,iy+46,24,VDC.wine,'right','800',ia);
  var maxN=Math.max(1,Math.floor((ih-70)/(P?50:52))),list=TL.items,more=0;
  if(list.length>maxN){more=list.length-(maxN-1);list=list.slice(0,maxN-1);}
  var lh=P?50:52;
  list.forEach(function(it,i){
    var s=vdEo((lt-1.4-i*.28)/.55),y=iy+66+i*lh+30;
    c.save();c.globalAlpha=s;
    c.fillStyle=VDC.gold;c.beginPath();c.arc(ix+iw-30+(1-s)*40,y-8,6,0,6.3);c.fill();
    var q='× '+fmt(it.u.qty),nmw=iw-48-90;
    var sz=vdFit(c,it.name,nmw,P?24:24,16,'700');
    vdT(c,it.name,ix+iw-50+(1-s)*40,y,sz,VDC.ink,'right','700');
    vdT(c,q,ix+26-(1-s)*40,y,P?22:22,VDC.wine,'left','800');
    c.restore();
  });
  if(more>0){var sm=vdEo((lt-1.4-list.length*.28)/.55);vdT(c,'و '+more+' أصناف أخرى …',ix+iw-50,iy+66+list.length*lh+30,20,VDC.muted,'right','600',sm);}
}
function vdLayout(W,H){
  var P=H>W,fh=P?64:56;
  if(P)return {P:1,hdr:{x:0,y:0,w:W,h:150},model:{x:24,y:164,w:W-48,h:540},panel:{x:24,y:722,w:W-48,h:H-722-fh-14}};
  return {P:0,hdr:{x:0,y:0,w:W,h:104},model:{x:36,y:116,w:640,h:H-116-fh-16},panel:{x:704,y:116,w:W-704-40,h:H-116-fh-16}};
}
function vdModel(c,L,it,lt,ph){
  var m=L.model;
  var mw=Math.round(m.w*VD.sc),mh=Math.round(m.h*VD.sc);
  if(!VD.mc||VD.mc.width!==mw||VD.mc.height!==mh){VD.mc=document.createElement('canvas');VD.mc.width=mw;VD.mc.height=mh;VD.mx=VD.mc.getContext('2d');}
  var st=it.st;
  st.yaw=-0.62+lt*0.46;
  st.pit=0.40+0.07*Math.sin(lt*0.7);
  st.zoom=0.9+0.1*vdEo(lt/1.4);
  if(it.ho){
    st.open=vdEio((lt-3.4)/1.1);
  }else st.open=0;
  st.o=it.d;
  VD.mx.setTransform(VD.sc,0,0,VD.sc,0,0);VD.mx.clearRect(0,0,m.w,m.h);
  try{fvPaint(VD.mx,m.w,m.h,it.S,st);}catch(e){VD.mx.fillStyle='#efe6dc';VD.mx.fillRect(0,0,m.w,m.h);}
  c.save();
  c.shadowColor='rgba(90,15,17,.22)';c.shadowBlur=24;c.shadowOffsetY=8;c.fillStyle='#fff';vdRR(c,m.x,m.y,m.w,m.h,18);c.fill();
  c.restore();
  c.save();vdRR(c,m.x,m.y,m.w,m.h,18);c.clip();c.drawImage(VD.mc,m.x,m.y,m.w,m.h);c.restore();
  c.save();c.strokeStyle=VDC.gold;c.lineWidth=2;vdRR(c,m.x,m.y,m.w,m.h,18);c.stroke();c.restore();
  c.save();c.fillStyle='rgba(90,15,17,.88)';vdRR(c,m.x+14,m.y+14,170,34,17);c.fill();c.restore();
  vdT(c,'مجسم ثلاثي الأبعاد',m.x+99,m.y+37,16,VDC.goldL,'center','700');
}
function vdItemHdr(c,L,it,lt,ph,W){
  var h=L.hdr,P=L.P,pad=P?28:40,a=vdEo(lt/.6);
  c.save();c.globalAlpha=a;
  vdT(c,'صنف '+it.idx+' من '+it.n,W-pad,P?42:40,P?20:20,VDC.gold,'right','700');
  var nmw=W-pad*2-(P?0:200),sz=vdFit(c,it.name,nmw,P?44:46,24,'800');
  var lines=[it.name];
  if(P&&sz<=24){lines=vdWrap(c,it.name,W-pad*2,28,'800',2);sz=28;}
  lines.forEach(function(ln,i){vdT(c,ln,W-pad,(P?88:86)+i*(sz+6),sz,VDC.wine,'right','800');});
  var q='الكمية: '+fmt(it.u.qty);
  c.fillStyle=VDC.gold;vdRR(c,pad,P?22:26,P?150:160,40,20);c.fill();
  vdT(c,q,pad+(P?75:80),P?49:53,20,'#2a1a02','center','800');
  var ph3=ph===1?'الخامات والتشطيبات':'المقاسات والتفاصيل';
  vdT(c,ph3,W-pad,h.h-(P?10:8),P?18:18,VDC.muted,'right','600');
  c.fillStyle=VDC.gold;c.fillRect(W-pad-(P?220:240)*vdEo((lt-.2)/.7),h.h-4,(P?220:240)*vdEo((lt-.2)/.7),3);
  c.restore();
}
function vdPanel0(c,L,it,lp,out){
  var p=L.panel,P=L.P,sp=it.sp,dims=[['الطول',num(it.d.l)],['العرض',num(it.d.w)],['الارتفاع',num(it.d.h)]];
  var dh=P?112:128,gap=14,dw=(p.w-gap*2)/3;
  c.save();c.globalAlpha=1-out;c.translate(-out*60,0);
  dims.forEach(function(d,i){
    var s=vdEo((lp-.15-i*.2)/.6),x=p.x+p.w-(i+1)*dw-i*gap+(1-s)*60;
    c.save();c.globalAlpha*=s;vdCard(c,x,p.y,dw,dh,14);
    vdT(c,d[0]+' (سم)',x+dw/2,p.y+34,P?18:19,VDC.muted,'center','600');
    var v=d[1]>0?fmt(Math.round(d[1]*vdEo((lp-.4-i*.2)/1.1)*10)/10):'—';
    vdT(c,v,x+dw/2,p.y+dh-26,P?44:50,VDC.wine,'center','800');
    c.restore();
  });
  var rows=it.rows,ry=p.y+dh+18,avail=p.h-dh-18,rh=Math.min(P?60:58,avail/Math.max(1,rows.length));
  rows.forEach(function(r,i){
    var s=vdEo((lp-.8-i*.24)/.55),y=ry+i*rh,x=p.x+(1-s)*70;
    c.save();c.globalAlpha*=s;
    c.fillStyle=i%2?'rgba(255,255,255,.55)':'rgba(201,154,59,.10)';vdRR(c,x,y+3,p.w,rh-6,10);c.fill();
    c.fillStyle=VDC.gold;c.fillRect(x+p.w-5,y+10,5,rh-20);
    vdT(c,r[0],x+p.w-22,y+rh/2+7,P?20:21,VDC.muted,'right','600');
    var sz=vdFit(c,r[1],p.w*.5,P?24:25,16,'800');
    vdT(c,r[1],x+22,y+rh/2+8,sz,VDC.ink,'left','800');
    c.restore();
  });
  c.restore();
}
function vdSwatch(c,x,y,sz,hex,img){
  c.save();vdRR(c,x,y,sz,sz,8);c.clip();
  if(img)c.drawImage(img,x,y,sz,sz);
  else{c.fillStyle=fvHex(hex)?hex:'#d8cfc8';c.fillRect(x,y,sz,sz);}
  c.restore();
  c.save();c.strokeStyle='rgba(42,28,28,.35)';c.lineWidth=1.2;vdRR(c,x,y,sz,sz,8);c.stroke();c.restore();
}
function vdPanel1(c,L,it,lp){
  var p=L.panel,P=L.P,y=p.y,k=0,R=p.x+p.w;
  function reveal(){var s=vdEo((lp-.1-k*.22)/.55);k++;return s;}
  var nl=it.d.note?vdWrap(c,it.d.note,p.w-44,P?20:20,'600',3):[],noteH=nl.length?34+nl.length*28+12:0;
  if(it.cols.length){
    var s=reveal(),n=it.cols.length,cw=(p.w-(n-1)*10)/n,chH=P?96:104;
    c.save();c.globalAlpha=s;
    vdT(c,'الألوان',R+(1-s)*50,y+22,22,VDC.wine,'right','800');y+=34;
    it.cols.forEach(function(q,i){
      var x=p.x+p.w-(i+1)*cw-i*10+(1-s)*50;
      vdCard(c,x,y,cw,chH,12);
      vdSwatch(c,x+cw/2-18,y+10,36,q.h,null);
      vdT(c,q.t,x+cw/2,y+68,vdFit(c,q.t,cw-12,P?15:16,11,'700'),VDC.muted,'center','700');
      if(q.n)vdT(c,q.n,x+cw/2,y+(P?88:92),vdFit(c,q.n,cw-12,P?15:16,11,'800'),VDC.ink,'center','800');
    });
    c.restore();y+=chH+16;
  }
  var mats=it.mats,avail=p.y+p.h-y-noteH;
  if(mats.length&&avail>60){
    var rowH=vdClamp(avail/mats.length-8,52,P?80:84),maxM=Math.max(1,Math.floor(avail/(rowH+8))),shown=mats.slice(0,maxM);
    shown.forEach(function(m){
      var s=reveal(),x0=R+(1-s)*50,chH=rowH-28,sw=chH-8,cnt=Math.min(3,m.items.length);
      c.save();c.globalAlpha=s;
      vdT(c,m.t,x0,y+18,P?19:20,VDC.wine,'right','800');
      var chipW=Math.min(P?220:200,(p.w-20)/cnt-8);
      m.items.slice(0,3).forEach(function(q,j){
        var cx=x0-j*(chipW+8)-chipW;
        c.fillStyle='#fff';vdRR(c,cx,y+26,chipW,chH,10);c.fill();
        c.strokeStyle='rgba(201,154,59,.5)';c.lineWidth=1;vdRR(c,cx,y+26,chipW,chH,10);c.stroke();
        vdSwatch(c,cx+chipW-sw-4,y+30,sw,q.h,vdImg(q.img));
        var tw=chipW-sw-20,tx=cx+chipW-sw-12;
        var ln=chH>=46?vdWrap(c,q.n,tw,15,'700',2):[q.n],sz=vdFit(c,ln[0],tw,15,10,'700');
        ln.forEach(function(t2,i2){vdT(c,t2,tx,y+26+chH/2+(ln.length>1?-4+i2*18:6)+(q.c?-6:0),sz,VDC.ink,'right','700');});
        if(q.c)vdT(c,q.c,tx,y+26+chH-6,vdFit(c,q.c,tw,12,9,'600'),VDC.muted,'right','600');
      });
      if(m.items.length>3)vdT(c,'+'+(m.items.length-3),x0-3*(chipW+8)+chipW*.4,y+26+chH/2+6,18,VDC.muted,'right','800');
      c.restore();y+=rowH+8;
    });
    if(mats.length>maxM){var s9=reveal();vdT(c,'و '+(mats.length-maxM)+' خامات أخرى …',R,y+12,17,VDC.muted,'right','600',s9);y+=22;}
  }
  if(nl.length){
    var s2=reveal(),by=Math.min(y+6,p.y+p.h-noteH+12),bh=noteH-12;
    c.save();c.globalAlpha=s2;
    c.fillStyle='rgba(201,154,59,.14)';vdRR(c,p.x+(1-s2)*60,by,p.w,bh,12);c.fill();
    c.fillStyle=VDC.gold;c.fillRect(R-5+(1-s2)*60,by+8,5,bh-16);
    vdT(c,'ملاحظات',R-20+(1-s2)*60,by+26,17,VDC.wine,'right','800');
    nl.forEach(function(t2,i){vdT(c,t2,R-20+(1-s2)*60,by+30+(i+1)*26,20,VDC.ink,'right','600');});
    c.restore();
  }
}
function vdItem(c,W,H,lt,sc,o){
  var L=vdLayout(W,H),it=sc.it,sw=sc.sp;
  var ph=lt>=sw?1:0;
  vdModel(c,L,it,lt,ph);
  vdItemHdr(c,L,it,lt,ph,W);
  if(ph===0)vdPanel0(c,L,it,lt,vdEio((lt-(sw-.5))/.5));
  else vdPanel1(c,L,it,lt-sw);
}
function vdOutro(c,W,H,lt,o,TL){
  var P=H>W,cx=W/2,sc=TL.sc,lg=P?120:92,y=(P?90:34);
  var al=vdEo(lt/.8);
  vdLogo(c,cx,y+lg/2,lg,al);y+=lg+(P?58:44);
  var a0=vdEo((lt-.3)/.7);
  vdT(c,'ملخص مراجعة النطاق',cx,y+(1-a0)*16,P?38:40,'#fff','center','800',a0);
  var gw=vdEo((lt-.6)/.8)*(P?260:320);c.fillStyle=VDC.gold;c.fillRect(cx-gw/2,y+16,gw,3);
  y+=P?60:48;
  var st=sc.status||SCS[0],col=st===SCS[2]?VDC.green:st===SCS[3]?VDC.red:VDC.gold,a1=vdEo((lt-.9)/.6),bw=P?440:480,bh=P?58:52;
  c.save();c.globalAlpha=a1;c.fillStyle=col;vdRR(c,cx-bw/2,y,bw,bh,bh/2);c.fill();c.restore();
  vdT(c,'حالة المراجعة: '+st,cx,y+bh/2+9,P?24:25,(st===SCS[2]||st===SCS[3])?'#fff':'#2a1a02','center','800',a1);
  y+=bh+(P?30:24);
  var meta=[];
  if(sc.by)meta.push('راجع النطاق: '+sc.by);
  if(sc.date)meta.push('تاريخ المراجعة: '+vdDate(sc.date));
  meta.push('عدد الأصناف: '+TL.items.length);
  var ml=vdWrap(c,meta.join('   •   '),W-80,P?22:23,'600',2),sm=vdEo((lt-1.3)/.6);
  ml.forEach(function(t2,i){vdT(c,t2,cx,y+i*34+(1-sm)*12,P?22:23,VDC.goldL,'center','600',sm);});
  y+=ml.length*34+(P?10:6);
  var fy=H-(P?70:46);
  if(sc.note){
    var s=vdEo((lt-1.9)/.7),bw2=Math.min(W-80,P?640:920),ls=P?32:30,maxL=Math.max(1,Math.min(P?6:4,Math.floor((fy-y-110)/ls))),lines=vdWrap(c,sc.note,bw2-56,P?22:22,'600',maxL),nh=56+lines.length*ls;
    c.save();c.globalAlpha=s;c.fillStyle='rgba(255,255,255,.09)';vdRR(c,cx-bw2/2,y,bw2,nh,16);c.fill();
    c.strokeStyle='rgba(201,154,59,.6)';c.lineWidth=1.3;vdRR(c,cx-bw2/2,y,bw2,nh,16);c.stroke();c.restore();
    vdT(c,'ملاحظات العميل / التعديلات المطلوبة',cx+bw2/2-26,y+34,20,VDC.gold,'right','800',s);
    lines.forEach(function(t2,i){vdT(c,t2,cx+bw2/2-26,y+38+(i+1)*ls-4,P?22:22,'#fff','right','600',s);});
  }
  vdT(c,'شكرًا لثقتكم بنا — نيفين للأثاث',cx,fy,P?28:28,VDC.goldL,'center','700',vdEo((lt-2.9)/.9));
}
/* ---- الإطار الكامل ---- */
function vdFrame(t){
  var c=VD.ctx,W=VD.W,H=VD.H,TL=VD.tl,o=VD.o;
  var i=0;while(i<TL.S.length-1&&t>=TL.S[i+1].t0)i++;
  var sc=TL.S[i],lt=t-sc.t0,dark=function(s){return s.k==='intro'||s.k==='outro';};
  c.setTransform(VD.sc,0,0,VD.sc,0,0);c.globalAlpha=1;c.imageSmoothingQuality='high';
  vdBg(c,W,H,dark(sc),t);
  var nx=TL.S[i+1],tail=sc.d-lt;
  if(nx&&dark(nx)!==dark(sc)&&tail<.5){c.globalAlpha=vdEio(1-tail/.5);vdBg(c,W,H,dark(nx),t);c.globalAlpha=1;}
  var fi=sc.k==='intro'?1:vdEo(lt/.35),fo=nx?vdS(tail/.4):1;
  c.globalAlpha=Math.min(fi,fo);
  if(sc.k==='intro')vdIntro(c,W,H,lt,o);
  else if(sc.k==='order')vdOrder(c,W,H,lt,o,TL);
  else if(sc.k==='item')vdItem(c,W,H,lt,sc,o);
  else vdOutro(c,W,H,lt,o,TL);
  c.globalAlpha=1;
  if(sc.k!=='intro'&&sc.k!=='outro')vdFooter(c,W,H,o,t,TL.total);
  else{c.fillStyle=VDC.gold;c.fillRect(0,H-4,W*vdS(t/TL.total),4);}
}
/* ---- المشغّل ---- */
function vdFmt(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2);}
function vdUI(){
  if(!VD.ov)return;
  var r=VD.ov.querySelector('#vdSeek'),tm=VD.ov.querySelector('#vdTime'),pb=VD.ov.querySelector('#vdPlay');
  r.value=Math.round(VD.t/VD.tl.total*1000);
  tm.textContent=vdFmt(VD.t)+' / '+vdFmt(VD.tl.total);
  var rb=VD.ov.querySelector('.vdrecb');if(rb&&VD.recOn)rb.textContent='● جارٍ التسجيل… '+Math.round(VD.t/VD.tl.total*100)+'%';
  pb.textContent=VD.play?'⏸':(VD.t>=VD.tl.total-.01?'↺':'▶');
}
function vdSize(){
  VD.W=VD.port?720:1280;VD.H=VD.port?1280:720;
  VD.cv.width=Math.round(VD.W*VD.sc);VD.cv.height=Math.round(VD.H*VD.sc);
  VD.cv.style.aspectRatio=VD.W+' / '+VD.H;
  VD.mc=null;VD.dirty=true;
}
function vdTick(ts){
  VD.raf=0;if(!VD.ov)return;
  var dt=VD.last?Math.min(.1,(ts-VD.last)/1000):0;VD.last=ts;
  if(VD.play){
    VD.t+=dt;VD.dirty=true;
    if(VD.t>=VD.tl.total){VD.t=VD.tl.total-.001;VD.play=false;if(VD.recOn)setTimeout(vdRecStop,350);}
  }
  if(VD.dirty){VD.dirty=false;try{vdFrame(VD.t);}catch(e){console.error(e);}vdUI();}
  VD.raf=requestAnimationFrame(vdTick);
}
function vdSeek(v){if(VD.recOn)return;VD.t=v/1000*VD.tl.total;VD.dirty=true;}
function vdPlayPause(){
  if(VD.recOn)return;
  if(!VD.play&&VD.t>=VD.tl.total-.01)VD.t=0;
  VD.play=!VD.play;VD.dirty=true;
}
function vdIOS(){return /iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
function vdRecStart(hq,forShare){
  if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){toast('المتصفح لا يدعم تسجيل الفيديو. استخدم Chrome أو Safari حديث');return;}
  var types=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'],mt='';
  for(var i=0;i<types.length;i++){if(MediaRecorder.isTypeSupported(types[i])){mt=types[i];break;}}
  VD.file=null;vdShowShare(false);
  VD.sc=hq?1.5:1;vdSize();
  var chunks=[],rec,bps=hq?16000000:6000000;
  try{rec=new MediaRecorder(VD.cv.captureStream(30),mt?{mimeType:mt,videoBitsPerSecond:bps}:{videoBitsPerSecond:bps});}
  catch(e){VD.sc=1;vdSize();toast('تعذّر بدء التسجيل على هذا الجهاز');return;}
  rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data);};
  rec.onstop=function(){
    VD.recOn=false;if(VD.ov)VD.ov.classList.remove('rec');
    VD.sc=1;if(VD.cv)vdSize();
    var type=(rec.mimeType||mt||'video/webm').split(';')[0],ext=type.indexOf('mp4')>-1?'mp4':'webm';
    var blob=new Blob(chunks,{type:type}),name='niveen-scope-'+String(VD.o.orderNo||'').replace(/[^\w\u0600-\u06FF-]+/g,'_')+(hq?'-1080p':'-720p')+'.'+ext;
    try{VD.file={blob:blob,name:name,type:type,f:new File([blob],name,{type:type})};}catch(e){VD.file={blob:blob,name:name,type:type,f:null};}
    vdShowShare(true,forShare?'الفيديو جاهز للمشاركة ✓ — اضغط «مشاركة»':'يمكنك أيضًا مشاركة هذا الفيديو مباشرة');
    if(forShare)return;
    if(vdIOS()){
      try{var f=new File([blob],name,{type:type});
        if(navigator.canShare&&navigator.canShare({files:[f]})){navigator.share({files:[f],title:'فيديو مراجعة النطاق'}).catch(function(){});toast('اختر «حفظ الفيديو» من القائمة ليُحفظ في الصور');return;}
      }catch(e){}
    }
    var u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();
    setTimeout(function(){a.remove();URL.revokeObjectURL(u);},4000);
    toast(ext==='webm'?'تم التنزيل (صيغة WebM قد لا تفتح في بعض المعارض)':'تم تنزيل الفيديو إلى هاتفك (مجلد التنزيلات)');
  };
  VD.rec=rec;VD.recOn=true;VD.ov.classList.add('rec');
  VD.t=0;VD.play=true;VD.dirty=true;rec.start(250);
}
function vdShowShare(on,msg){
  if(!VD.ov)return;
  var row=VD.ov.querySelector('#vdShareRow');if(!row)return;
  row.classList.toggle('on',!!on);VD.ov.classList.toggle('hasf',!!on);
  if(msg!==undefined)row.querySelector('b').textContent=msg;
}
function vdShareText(){var o=VD.o||{};return 'مرحبًا '+(o.custName||'')+'، هذا فيديو مراجعة نطاق طلبك رقم '+(o.orderNo||'')+' — نيڤين للأثاث.';}
function vdSaveFile(){
  var F=VD.file;if(!F)return;
  var u=URL.createObjectURL(F.blob),a=document.createElement('a');a.href=u;a.download=F.name;document.body.appendChild(a);a.click();
  setTimeout(function(){a.remove();URL.revokeObjectURL(u);},4000);
  toast('تم حفظ الفيديو');
}
function vdShareNow(){
  var F=VD.file;if(!F)return;
  try{
    if(F.f&&navigator.canShare&&navigator.canShare({files:[F.f]})){
      navigator.share({files:[F.f],title:'فيديو مراجعة النطاق — '+((VD.o&&VD.o.orderNo)||''),text:vdShareText()}).catch(function(e){if(e&&e.name!=='AbortError')toast('تعذّرت المشاركة — استخدم «حفظ الفيديو» ثم أرفقه يدويًا');});
      return;
    }
  }catch(e){}
  vdSaveFile();
  toast('هذا المتصفح لا يدعم مشاركة الملفات مباشرة — تم حفظ الفيديو، أرفقه في واتساب أو البريد');
}
function vdWhats(){
  var o=VD.o||{},ph=String(o.phone||'').replace(/[^\d+]/g,''),num='';
  if(ph.indexOf('+')===0)num=ph.slice(1);else if(ph.indexOf('00')===0)num=ph.slice(2);
  window.open('https://wa.me/'+num+'?text='+encodeURIComponent(vdShareText()),'_blank');
  toast('بعد فتح المحادثة أرفق الفيديو المحفوظ (زر «حفظ الفيديو»)');
}
function vdRecStop(){if(VD.rec&&VD.rec.state!=='inactive')VD.rec.stop();}
function vdClose(){
  if(VD.recOn){if(!confirm('التسجيل جارٍ. هل تريد إيقافه وإغلاق النافذة؟'))return;VD.recOn=false;try{VD.rec.onstop=null;vdRecStop();}catch(e){}}
  VD.play=false;VD.file=null;if(VD.raf)cancelAnimationFrame(VD.raf);VD.raf=0;
  if(VD.keyH)document.removeEventListener('keydown',VD.keyH);
  if(VD.ov)VD.ov.remove();VD.ov=null;VD.cv=null;VD.ctx=null;VD.mc=null;VD.sc=1;
  document.documentElement.style.overflow='';
}
function vdCss(){
  if(document.getElementById('vdCss'))return;
  var s=document.createElement('style');s.id='vdCss';
  s.textContent='.vdov{position:fixed;inset:0;z-index:99990;background:rgba(20,6,7,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:10px;direction:rtl;font-family:'+VDF+'}'+
  '.vdtop{width:min(1280px,100%);display:flex;align-items:center;justify-content:space-between;color:#f5dcaa;font-weight:700;font-size:1rem}'+
  '.vdov canvas{max-width:100%;max-height:calc(100vh - 150px);max-height:calc(100dvh - 150px);background:#000;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.6);border:1px solid rgba(201,154,59,.5)}'+
  '.vdbar{width:min(1280px,100%);display:flex;flex-wrap:wrap;align-items:center;gap:8px;color:#f5dcaa}'+
  '.vdbar input[type=range]{flex:1 1 160px;min-width:120px;accent-color:#c99a3b;direction:ltr}'+
  '.vdb{border:1px solid #c99a3b;background:transparent;color:#f5dcaa;border-radius:10px;padding:8px 14px;font:inherit;font-weight:700;cursor:pointer;min-height:40px}'+
  '.vdb.g{background:linear-gradient(135deg,#e2b960,#c99a3b);color:#2a1a02}.vdb:disabled{opacity:.5}'+
  '.vdov select{background:#3a0b0d;color:#f5dcaa;border:1px solid #c99a3b;border-radius:10px;padding:8px;font:inherit;min-height:40px}'+
  '#vdTime{font-variant-numeric:tabular-nums;min-width:84px;text-align:center;direction:ltr}'+
  '.vdb.stop{display:none}.vdov.rec .vdb.stop{display:inline-block}.vdrecb{display:none;color:#ff8a80;font-weight:800}.vdov.rec .vdrecb{display:inline}.vdov.rec .vdb:not(.stop),.vdov.rec select,.vdov.rec input{pointer-events:none;opacity:.5}'+
  '.vdshare{width:min(1280px,100%);display:none;flex-wrap:wrap;align-items:center;gap:8px;background:rgba(201,154,59,.16);border:1px solid #c99a3b;border-radius:12px;padding:8px 12px;color:#f5dcaa}.vdshare.on{display:flex}.vdshare b{flex:1 1 180px}.vdov.hasf canvas{max-height:calc(100vh - 215px);max-height:calc(100dvh - 215px)}';
  document.head.appendChild(s);
}
function vdOpen(o){
  if(VD.ov)vdClose();
  var us=mfgUnits(o);
  if(!us.length){toast('لا توجد أصناف في هذا الطلب لعرضها');return;}
  var sc=scopes[o.id],anyDim=us.some(function(u){var d=sc&&sc.items&&sc.items[scKey(u)];return d&&num(d.l)>0&&num(d.w)>0&&num(d.h)>0||parseSize(u.p?u.p.size:u.l.size);});
  if(!anyDim)toast('أدخل أبعاد الأصناف أولًا ليظهر المجسم داخل الفيديو');
  vdCss();vdLogoImg();
  VD.sc=1;VD.o=o;VD.tl=vdBuild(o);VD.t=0;VD.play=true;VD.last=0;VD.dirty=true;VD.recOn=false;
  VD.tl.S.forEach(function(s){if(s.it){s.it.mats.forEach(function(m){m.items.forEach(function(q){vdImg(q.img);});});}});
  var ov=document.createElement('div');ov.className='vdov';ov.setAttribute('role','dialog');ov.setAttribute('aria-label','فيديو عرض تفاصيل الطلب');
  ov.innerHTML='<div class="vdtop"><span>🎬 فيديو عرض الطلب — '+esc(o.orderNo||'')+' ('+esc(o.custName||'')+')</span><button type="button" class="vdb" id="vdClose" aria-label="إغلاق">✕ إغلاق</button></div>'+
    '<canvas id="vdCv"></canvas>'+
    '<div class="vdbar"><button type="button" class="vdb" id="vdPlay" aria-label="تشغيل / إيقاف">⏸</button>'+
    '<input type="range" id="vdSeek" min="0" max="1000" value="0" aria-label="موضع الفيديو"><span id="vdTime">0:00</span>'+
    '<select id="vdFmt" aria-label="شكل الفيديو"><option value="l">أفقي 16:9 (شاشة / عرض)</option><option value="p">عمودي 9:16 (واتساب / جوال)</option></select>'+
    '<button type="button" class="vdb g" id="vdHQ">⬇ تحميل للهاتف بجودة عالية (1080p)</button><button type="button" class="vdb" id="vdRec">⬇ تنزيل سريع (720p)</button><button type="button" class="vdb g" id="vdShare">📤 مشاركة الفيديو</button><button type="button" class="vdb stop" id="vdStop">■ إيقاف التسجيل</button><span class="vdrecb">● جارٍ التسجيل…</span></div>'+
    '<div class="vdshare" id="vdShareRow"><b></b><button type="button" class="vdb g" id="vdShareNow">📤 مشاركة (واتساب وتطبيقات التواصل)</button><button type="button" class="vdb" id="vdSave">⬇ حفظ الفيديو</button><button type="button" class="vdb" id="vdWa">💬 فتح واتساب</button></div>';
  document.body.appendChild(ov);document.documentElement.style.overflow='hidden';
  VD.ov=ov;VD.cv=ov.querySelector('#vdCv');VD.ctx=VD.cv.getContext('2d');
  VD.port=window.innerHeight>window.innerWidth*1.15;
  ov.querySelector('#vdFmt').value=VD.port?'p':'l';vdSize();
  ov.querySelector('#vdClose').onclick=vdClose;
  ov.querySelector('#vdPlay').onclick=vdPlayPause;
  ov.querySelector('#vdSeek').oninput=function(){vdSeek(+this.value);};
  ov.querySelector('#vdFmt').onchange=function(){if(VD.recOn)return;VD.port=this.value==='p';VD.file=null;vdShowShare(false);vdSize();};
  ov.querySelector('#vdRec').onclick=function(){vdRecStart(false);};
  ov.querySelector('#vdHQ').onclick=function(){vdRecStart(true);};
  ov.querySelector('#vdStop').onclick=vdRecStop;
  ov.querySelector('#vdShare').onclick=function(){
    if(VD.recOn)return;
    if(VD.file){vdShareNow();return;}
    toast('جارٍ تجهيز الفيديو للمشاركة… انتظر حتى ينتهي التسجيل ثم اضغط «مشاركة»');
    vdRecStart(false,true);
  };
  ov.querySelector('#vdShareNow').onclick=vdShareNow;
  ov.querySelector('#vdSave').onclick=vdSaveFile;
  ov.querySelector('#vdWa').onclick=vdWhats;
  VD.keyH=function(e){if(e.key==='Escape')vdClose();else if(e.key===' '&&e.target.tagName!=='INPUT'&&e.target.tagName!=='SELECT'){e.preventDefault();vdPlayPause();}};
  document.addEventListener('keydown',VD.keyH);
  VD.raf=requestAnimationFrame(vdTick);
}

init();
})();
