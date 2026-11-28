(() => {
let products=[
{id:1,name:"Signature Polo Shirt",category:"Men",price:6500,colors:[["Black","#111111"],["Burgundy","#741F2B"],["White","#F7F7F2"]],sizes:["S","M","L","XL"],image:"https://images.unsplash.com/photo-1625910513413-5fc45e2f4c0c?auto=format&fit=crop&w=900&q=82",badge:"SIGNATURE"},
{id:2,name:"Relaxed Pleated Trousers",category:"Men",price:8900,colors:[["Black","#111111"],["Beige","#DCC9A8"],["Charcoal","#55514e"],["Brown","#49352c"]],sizes:["S","M","L","XL"],image:"https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=82",badge:"EVERYDAY"},
{id:3,name:"Women's Co-ord Set",category:"Women",price:14500,colors:[["Black","#111111"],["Cream","#F1E6D2"],["Chocolate Brown","#4A2C20"],["Burgundy","#741F2B"]],sizes:["S","M","L","XL"],image:"https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=82",badge:"TWO-PIECE SET"},
{id:4,name:"Wide-Leg Trousers",category:"Women",price:9200,colors:[["Black","#111111"],["Cream","#F1E6D2"],["Taupe","#a89a88"],["Chocolate","#4A2C20"]],sizes:["S","M","L","XL"],image:"https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=900&q=82",badge:"RELAXED FIT"},
{id:5,name:"WA Signature Sweatshirt",category:"Unisex",price:8500,colors:[["Black","#111111"],["Burgundy","#741F2B"],["Beige","#DCC9A8"]],sizes:["S","M","L","XL"],image:"https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=82",badge:"WINTER ESSENTIAL"},
{id:6,name:"Boxy-Fit Shirt",category:"Unisex",price:7800,colors:[["Black","#111111"],["Burgundy","#741F2B"],["Olive Green","#4B5135"],["Beige","#DCC9A8"]],sizes:["S","M","L","XL"],image:"https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=900&q=82",badge:"RELAXED SILHOUETTE"},
{id:7,name:"People Not Trends Boxy Tee",category:"Unisex",price:4800,colors:[["Black","#111111"],["Burgundy","#741F2B"],["Olive Green","#4B5135"],["Beige","#DCC9A8"]],sizes:["S","M","L","XL"],image:"https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=82",badge:"WA STATEMENT"}
];
const editorialReferences=p=>p.galleryImages?.length?p.galleryImages:[p.image,"https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=82","https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=900&q=82","https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=82"];
const productDetails={1:{intro:"A clean everyday polo with a considered silhouette.",design:"Collared neckline · Half sleeves · Small WA monogram on the left chest",brand:"Monogram colour: white on black; black on burgundy and white."},2:{intro:"Relaxed tailoring with pleats for a considered everyday shape.",design:"Relaxed fit · Pleated front · Four launch colour options",brand:"Designed for the WA everyday wardrobe."},3:{intro:"A coordinated two-piece look built around ease and proportion.",design:"Matching top and bottom · Extended shirt length · Four launch colours",brand:"No visible logo or monogram on the co-ord set."},4:{intro:"A wide-leg silhouette for ease and structure in everyday dressing.",design:"Wide-leg cut · Four launch colour options",brand:"A versatile separate for a considered rotation."},5:{intro:"A winter layer with a clean, collarless silhouette.",design:"Full sleeves · Collarless neckline · Black, burgundy and beige",brand:"No logo on the front; large WA logo on the back."},6:{intro:"A relaxed boxy-fit shirt with a distinctive back statement.",design:"Boxy silhouette · Black, burgundy, olive green and beige",brand:"People not trends on the back in a vertical layout."},7:{intro:"An everyday boxy tee with the WA point of view built into the details.",design:"Boxy fit · Black, burgundy, olive green and beige",brand:"WA monogram on the front; People not trends on the back."}};
const memoryStorage=new Map();
const storage={
 getItem(key){
  if(memoryStorage.has(key))return memoryStorage.get(key);
  try{return window.localStorage.getItem(key);}catch{return null;}
 },
 setItem(key,value){
  memoryStorage.set(key,value);
  try{window.localStorage.setItem(key,value);}catch{}
 },
 removeItem(key){
  memoryStorage.set(key,null);
  try{window.localStorage.removeItem(key);}catch{}
 }
};
function readBag(){
 try{
  const saved=JSON.parse(storage.getItem("wa-preview-bag")||"[]");
  return Array.isArray(saved)?saved.filter(item=>item&&(typeof item.id==="number"||typeof item.id==="string")&&typeof item.size==="string"&&typeof item.color==="string"&&Number.isSafeInteger(item.qty)&&item.qty>0):[];
 }catch{return [];}
}
let activeFilter="All",query="",bag=readBag();
let pendingCatalogue=null;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const themeToggle=$("#themeToggle");
const savedTheme=storage.getItem("wa-theme")==="dark"?"dark":"light";
function applyTheme(theme){document.documentElement.dataset.theme=theme;storage.setItem("wa-theme",theme);themeToggle.innerHTML='<span class="theme-icon" aria-hidden="true">'+(theme==="dark"?"☀":"☾")+'</span>';themeToggle.setAttribute("aria-label",theme==="dark"?"Switch to light mode":"Switch to dark mode");themeToggle.setAttribute("title",theme==="dark"?"Switch to light mode":"Switch to dark mode");}
applyTheme(savedTheme);
themeToggle.addEventListener("click",()=>applyTheme(document.documentElement.dataset.theme==="dark"?"light":"dark"));

const currency=new Intl.NumberFormat("en-PK",{style:"currency",currency:"PKR",maximumFractionDigits:0});
const money=n=>currency.format(n);
function openCountryGate(){
 setMobileMenu(false);
 const gate=$("#countryGate");
 gate.classList.remove("is-hidden");
 document.body.classList.add("country-gate-open");
 for(const element of document.body.children){
  if(element!==gate)element.inert=true;
 }
 $("#countryContinue").focus({preventScroll:true});
}
renderProducts();renderBag();
$("#countrySwitch").addEventListener("click",()=>location.assign("./"));
function renderProducts(){
 let list=products.filter(p=>(activeFilter==="All"||p.category===activeFilter)&&(p.name.toLowerCase().includes(query.toLowerCase())||p.category.toLowerCase().includes(query.toLowerCase())));
 const sort=$("#sortSelect").value;
 if(sort==="low")list.sort((a,b)=>a.price-b.price);
 if(sort==="high")list.sort((a,b)=>b.price-a.price);
 if(sort==="name")list.sort((a,b)=>a.name.localeCompare(b.name));
 $("#productTotal").textContent=list.length+(list.length===1?" piece":" pieces");
 $("#productGrid").innerHTML=list.map((p,index)=>`<article class="product-card" style="--card-index:${index}">
  <div class="product-image-wrap">
   <img class="product-image" src="${escapeTestHtml(p.image)}" alt="${escapeTestHtml(p.name)} — campaign reference" loading="lazy">
   <button class="quick-add" type="button" data-add="${escapeTestHtml(p.id)}" aria-label="View ${escapeTestHtml(p.name)} details">Choose options <span aria-hidden="true">↗</span></button>
  </div>
  <div class="product-meta">
   <div class="product-category">${escapeTestHtml(p.category)}</div>
   <div class="product-title-row"><h3 class="product-title">${escapeTestHtml(p.name)}</h3><span class="product-price">${money(p.price)}</span></div>
   <div class="product-colors" aria-label="Choose a colour to view product options">
    ${p.colors.map((c,i)=>`<button class="swatch-button ${i===0?"is-default":""}" type="button" data-swatch-product="${escapeTestHtml(p.id)}" data-swatch-color="${escapeTestHtml(c[0])}" aria-label="View ${escapeTestHtml(p.name)} in ${escapeTestHtml(c[0])}" title="${escapeTestHtml(c[0])}" style="--swatch:${c[1]}"><span class="swatch"></span></button>`).join("")}
    <span class="color-count">${p.colors.length} colours</span>
   </div>
   <div class="product-sizes">${escapeTestHtml(p.sizes.join(" · "))}</div>
  </div>
 </article>`).join("")||'<div class="shop-empty"><p>No pieces match your filters.</p><button type="button" id="clearCollection">Clear filters</button></div>';
 $("#clearCollection")?.addEventListener("click",()=>{setCollectionSearch("");setCollectionFilter("All");$("#collectionSearch").focus();});
 $$("#productGrid [data-add]").forEach(button=>{
  button.closest(".product-image-wrap").addEventListener("click",()=>openProductOptions(button.dataset.add));
 });
 $$("#productGrid [data-swatch-product]").forEach(button=>button.addEventListener("click",()=>openProductOptions(button.dataset.swatchProduct,button.dataset.swatchColor)));
}
function saveBag(){storage.setItem("wa-preview-bag",JSON.stringify(bag));renderBag()}
let optionProduct=null,optionColor="",optionSize="M";
function openProductOptions(id, initialColor=null){
 const p=products.find(x=>String(x.id)===String(id));if(!p)return;
 optionProduct=p;
 optionColor=p.colors.some(c=>c[0]===initialColor)?initialColor:p.colors[0][0];
 const sizes=p.variants?.length?p.sizes.filter(size=>p.variants.some(variant=>variant.colour===optionColor&&variant.size===size&&variant.available)):p.sizes;
 optionSize=sizes.includes("M")?"M":sizes[0]||"";
 const gallery=editorialReferences(p);
 const details=productDetails[p.id]||{intro:p.description||'A considered piece from the WA collection.',design:'Available in selected colours and sizes.',brand:'People not trends.'};
 $("#productOptionsContent").innerHTML=`<div class="options-visual"><img class="options-product-image" id="activeProductImage" src="${escapeTestHtml(gallery[0])}" alt="${escapeTestHtml(p.name)} — editorial reference"><div class="options-gallery-thumbs">${gallery.map((src,i)=>`<button type="button" class="options-gallery-thumb ${i===0?"selected":""}" data-gallery-image="${escapeTestHtml(src)}" aria-label="Show reference image ${i+1}" aria-pressed="${i===0}"><img src="${escapeTestHtml(src)}" alt="" loading="lazy"></button>`).join("")}</div><span class="options-image-note">${p.galleryImages?.length?"PRODUCT PHOTOGRAPHY":"EDITORIAL IMAGE REFERENCES · NOT FINAL PRODUCT PHOTOGRAPHY"}</span></div><div class="options-product-info"><p class="eyebrow">${escapeTestHtml(p.category)}</p><h2 id="productOptionsTitle">${escapeTestHtml(p.name)}</h2><p class="options-price">${money(p.price)}</p><p class="options-description">${escapeTestHtml(details.intro)}</p><div class="options-detail-block"><span>DESIGN NOTES</span><p>${escapeTestHtml(details.design)}</p></div><div class="options-detail-block"><span>THE WA DETAIL</span><p>${escapeTestHtml(details.brand)}</p></div><fieldset class="option-field"><legend>Colour: <strong id="selectedColour">${escapeTestHtml(optionColor)}</strong></legend><div class="option-swatches">${p.colors.map((c,i)=>`<button type="button" class="option-swatch ${c[0]===optionColor?"selected":""}" data-option-color="${escapeTestHtml(c[0])}" aria-label="${escapeTestHtml(c[0])}" aria-pressed="${c[0]===optionColor}" title="${escapeTestHtml(c[0])}" style="--swatch:${c[1]}"></button>`).join("")}</div></fieldset><fieldset class="option-field"><legend>Size</legend><div class="option-sizes">${p.sizes.map((s,i)=>{const available=!p.variants?.length||p.variants.some(v=>v.colour===optionColor&&v.size===s&&v.available);return `<button type="button" class="option-size ${s===optionSize?"selected":""}" data-option-size="${escapeTestHtml(s)}" aria-pressed="${s===optionSize}" ${available?"":"disabled"}>${escapeTestHtml(s)}</button>`}).join("")}</div></fieldset><button type="button" class="button button-burgundy options-add-button" id="confirmAddToBag">Add to bag <span>↗</span></button><details class="options-size-guide"><summary>Size guide & fit</summary><p>Available sizes: S, M, L and XL. The measurement chart for this piece will be added before the store opens. Contact us for fit guidance.</p><a href="mailto:info@waqaralanabi.com?subject=Size%20and%20Fit">Ask us about your size ↗</a></details><p class="options-size-note">Preview collection — final retail prices and stock will be confirmed before ordering opens.</p></div>`;
 $("#productOptionsModal").classList.add("open");$("#productOptionsBackdrop").classList.add("open");$("#productOptionsModal").setAttribute("aria-hidden","false");document.body.style.overflow="hidden";
}
function closeProductOptions(){$("#productOptionsModal").classList.remove("open");$("#productOptionsBackdrop").classList.remove("open");$("#productOptionsModal").setAttribute("aria-hidden","true");if(!$("#bagDrawer").classList.contains("open"))document.body.style.overflow="";optionProduct=null;applyPendingCatalogue()}
$("#productOptionsClose").addEventListener("click",closeProductOptions);
$("#productOptionsBackdrop").addEventListener("click",closeProductOptions);
$("#productOptionsContent").addEventListener("click",e=>{
 const galleryBtn=e.target.closest("[data-gallery-image]");if(galleryBtn){$("#activeProductImage").src=galleryBtn.dataset.galleryImage;$$("[data-gallery-image]").forEach(b=>{const active=b===galleryBtn;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",String(active))});return}
 const colorBtn=e.target.closest("[data-option-color]");
 if(colorBtn&&optionProduct){optionColor=colorBtn.dataset.optionColor;$$("[data-option-color]").forEach(b=>{const active=b===colorBtn;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",String(active))});$("#selectedColour").textContent=optionColor;$$("#productOptionsContent [data-option-size]").forEach(sizeButton=>{const available=!optionProduct.variants?.length||optionProduct.variants.some(v=>v.colour===optionColor&&v.size===sizeButton.dataset.optionSize&&v.available);sizeButton.disabled=!available;if(!available&&sizeButton.dataset.optionSize===optionSize){const first=optionProduct.sizes.find(size=>!optionProduct.variants?.length||optionProduct.variants.some(v=>v.colour===optionColor&&v.size===size&&v.available));if(first)optionSize=first;}});const activeSize=$$("#productOptionsContent [data-option-size]").find(b=>b.dataset.optionSize===optionSize&&!b.disabled);$$("#productOptionsContent [data-option-size]").forEach(b=>{const active=b===activeSize;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",String(active));});return}
 const sizeBtn=e.target.closest("[data-option-size]");
 if(sizeBtn){optionSize=sizeBtn.dataset.optionSize;$$("[data-option-size]").forEach(b=>{const active=b===sizeBtn;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",String(active))});return}
 if(e.target.closest("#confirmAddToBag")&&optionProduct){
  const p=optionProduct;if(p.variants?.length){const selected=p.variants.find(v=>v.colour===optionColor&&v.size===optionSize);if(!selected||!selected.available){toast("This colour and size is currently unavailable.");return;}}const found=bag.find(x=>String(x.id)===String(p.id)&&x.size===optionSize&&x.color===optionColor);
  if(found)found.qty++;else bag.push({id:p.id,size:optionSize,color:optionColor,qty:1});
  closeProductOptions();saveBag();toast(p.name+" added to your bag");openBag();
 }
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeCheckoutPreview();closeProductOptions();closeBag()}});
function renderBag(){const count=bag.reduce((n,x)=>n+x.qty,0);const subtotal=bag.reduce((n,x)=>n+(products.find(p=>String(p.id)===String(x.id))?.price||0)*x.qty,0);$("#bagCount").textContent=count;$("#drawerCount").textContent="("+count+")";$("#subtotal").textContent=money(subtotal);const checkout=$("#checkoutButton");if(checkout)checkout.disabled=count===0;$("#bagItems").innerHTML=bag.length?bag.map((x,i)=>{const p=products.find(p=>String(p.id)===String(x.id));if(!p)return '';return `<div class="bag-line"><img src="${escapeTestHtml(p.image)}" alt=""><div><h3>${escapeTestHtml(p.name)}</h3><p>${escapeTestHtml(x.color)} · Size ${escapeTestHtml(x.size)}</p><p>${money(p.price)}</p><div class="qty-controls"><button data-qty="${i}" data-delta="-1" aria-label="Decrease quantity">−</button><span>${x.qty}</span><button data-qty="${i}" data-delta="1" aria-label="Increase quantity">+</button></div></div><button class="remove-item" data-remove="${i}" aria-label="Remove item">×</button></div>`}).join(""):'<div class="empty-bag">Your bag is waiting for something special.</div>';$$("[data-qty]").forEach(b=>b.onclick=()=>{const i=+b.dataset.qty;bag[i].qty+=+b.dataset.delta;if(bag[i].qty<1)bag.splice(i,1);saveBag()});$$("[data-remove]").forEach(b=>b.onclick=()=>{bag.splice(+b.dataset.remove,1);saveBag()})}
/* Customer checkout: server-authoritative prices and stock; PKR / Pakistan only. */
let previewCheckoutAttempt=null;
function createCheckoutKey(){
 if(typeof crypto.randomUUID==="function")return crypto.randomUUID();
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;
 bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("");
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join("-");
}
function currentBagSubtotal(){return bag.reduce((sum,item)=>sum+(products.find(p=>String(p.id)===String(item.id))?.price||0)*item.qty,0);}
function openCheckoutPreview(){
 if(!bag.length){toast("Your bag is empty.");return;}
 $("#checkoutPreviewSubtotal").textContent=money(currentBagSubtotal());
 $("#waCheckoutTotal").textContent=money(currentBagSubtotal());
 $("#waCheckoutError").textContent="";
 syncCheckoutReceipt();
 $("#waCheckoutForm").hidden=false;
 $("#waCheckoutResult").hidden=true;
 $("#checkoutPreviewModal").classList.add("open");
 $("#checkoutPreviewBackdrop").classList.add("open");
 $("#checkoutPreviewModal").setAttribute("aria-hidden","false");
}
function closeCheckoutPreview(){
 $("#checkoutPreviewModal").classList.remove("open");
 $("#checkoutPreviewBackdrop").classList.remove("open");
 $("#checkoutPreviewModal").setAttribute("aria-hidden","true");
 applyPendingCatalogue();
}
function checkoutVariantItems(){
 return bag.map(item=>{
  const product=products.find(p=>String(p.id)===String(item.id));
  const variant=product?.variants?.find(v=>v.colour===item.color&&v.size===item.size&&v.available);
  if(!product||!variant?.id)throw new Error("One or more selected pieces are not currently available for online ordering. Please refresh the collection.");
  return {variantId:variant.id,quantity:item.qty};
 });
}
function readTestOrders(){try{const value=JSON.parse(storage.getItem(WA_TEST_ORDERS_KEY)||"[]");return Array.isArray(value)?value:[];}catch{return [];}}
function readTestStock(){try{const value=JSON.parse(storage.getItem(WA_TEST_STOCK_KEY)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}catch{return {};}}
function testStockKey(item){return String(item.id)+"|"+String(item.color)+"|"+String(item.size);}
function escapeTestHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));}
function renderTestOrders(){
 const target=$("#waTestOrdersList");if(!target)return;
 const orders=readTestOrders();
 target.innerHTML=orders.length?orders.map(order=>'<article class="wa-test-order-card"><div><strong>'+escapeTestHtml(order.orderNumber)+'</strong><small>'+new Date(order.createdAt).toLocaleString()+'</small></div><p>'+escapeTestHtml(order.customer.fullName)+' · '+escapeTestHtml(order.customer.city)+'</p><p>'+order.items.map(item=>escapeTestHtml(item.productName)+' — '+escapeTestHtml(item.colour)+' / '+escapeTestHtml(item.size)+' × '+item.quantity).join('<br>')+'</p><b>'+money(order.total)+'</b><small>TEST ONLY · PAYMENT NOT COLLECTED</small></article>').join(""):'<p class="wa-test-empty">No test orders have been placed in this browser yet.</p>';
}
function showTestCheckoutResult(order, databaseBacked=false, claim=null, receiptFile=null){
 const form=$("#waCheckoutForm"),result=$("#waCheckoutResult");
 form.hidden=true;result.hidden=false;
 result.innerHTML='<p class="eyebrow">TEST ORDER / NOT REAL</p><h3>Test order<br><em>recorded.</em></h3><p class="wa-order-number">TEST ORDER NUMBER <strong>'+escapeTestHtml(order.orderNumber)+'</strong></p><div class="wa-order-summary"><div><span>Merchandise subtotal</span><strong>'+money(order.subtotal)+'</strong></div><div><span>Shipping simulation</span><strong>FREE</strong></div><div class="wa-order-total"><span>Payment</span><strong>NOT COLLECTED</strong></div></div><p class="wa-test-mode-warning">'+(databaseBacked?"This test order was saved to the preview database. No payment or delivery will occur.":"This order was saved in this browser. No payment or delivery will occur.")+'</p><button type="button" class="button button-burgundy" id="waFinishCheckout">Continue exploring</button>';
 if(order.paymentMethod==="bank_transfer"){
  const upload=document.createElement("div");
  upload.className="wa-bank-instructions";
  upload.innerHTML='<h4>Payment screenshot</h4><p>Upload a sample receipt for admin review. This is a test order.</p><label class="wa-receipt-label">Choose screenshot<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf"></label><button type="button" class="button button-burgundy">Upload receipt</button><p role="status" aria-live="polite"></p>';
  result.insertBefore(upload,$("#waFinishCheckout"));
  const input=upload.querySelector("input"),button=upload.querySelector("button"),message=upload.querySelector("[role=status]");
  const submit=async file=>{
   button.disabled=true;
   input.disabled=true;
   message.textContent="Uploading receipt…";
   try{
    await window.WAUploadTransferReceipt(order.orderNumber,file,claim?.accessToken);
    message.textContent="Receipt uploaded. Awaiting admin review.";
   }catch(error){
    message.textContent=error.message;
    button.disabled=false;
    input.disabled=false;
   }
  };
  button.onclick=()=>submit(input.files?.[0]||receiptFile);
  if(receiptFile)void submit(receiptFile);
 }
 $("#waCheckoutReceiptFile").value="";
 if(claim){
  const claimButton=document.createElement("button");
  claimButton.type="button";
  claimButton.className="button button-burgundy";
  claimButton.textContent="Create preview account";
  result.appendChild(claimButton);
  claimButton.onclick=()=>{
   closeCheckoutPreview();closeBag();
   document.dispatchEvent(new CustomEvent("wa-preview-account",{detail:claim}));
  };
 }
 bag=[];saveBag();
 $("#waFinishCheckout").onclick=()=>{bag=[];saveBag();closeCheckoutPreview();closeBag();};
 renderTestOrders();
}
$("#waTestOrdersRefresh")?.addEventListener("click",renderTestOrders);
$("#waClearTestOrders")?.addEventListener("click",()=>{if(!window.confirm("Clear all test orders and reset simulated test stock in this browser?"))return;storage.removeItem(WA_TEST_ORDERS_KEY);storage.removeItem(WA_TEST_STOCK_KEY);renderTestOrders();toast("Local test orders and test stock cleared.");});
$("#waTestOrdersPanel")?.addEventListener("toggle",event=>{if(event.target.open)renderTestOrders();});
function validateTransferReceipt(file){
 if(!file)throw new Error("Choose a payment screenshot first.");
 if(file.size===0||file.size>5*1024*1024)throw new Error("Choose a receipt no larger than 5 MB.");
 if(!["image/png","image/jpeg","image/webp","application/pdf"].includes(file.type))throw new Error("Upload a JPG, PNG, WebP or PDF receipt.");
}

window.WAUploadTransferReceipt=async function(orderNumber,file,accessToken){
 validateTransferReceipt(file);
 const dataBase64=await new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result).split(",")[1]);
  reader.onerror=()=>reject(new Error("Could not read this file."));
  reader.readAsDataURL(file);
 });
 const response=await fetch(WA_API_BASE+"/checkout/orders/"+encodeURIComponent(orderNumber)+"/bank-transfer-proof",{
  method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},
  body:JSON.stringify({fileName:file.name,mimeType:file.type,dataBase64,accessToken}),
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok&&data.error!=="PROOF_ALREADY_RECEIVED")throw new Error(data.message||"Receipt upload failed. Please try again.");
};

function syncCheckoutReceipt(){
 const bank=$("#waCheckoutForm input[value=bank_transfer]").checked;
 $("#waCheckoutReceipt").hidden=!bank;
 $("#waCheckoutReceiptFile").disabled=!bank;
}
$("#waCheckoutForm").addEventListener("change",event=>{
 if(event.target.name==="paymentMethod")syncCheckoutReceipt();
});
$("#waCheckoutForm").addEventListener("submit",async event=>{
 event.preventDefault();const form=event.currentTarget,button=$("#waPlaceOrder"),error=$("#waCheckoutError"),data=new FormData(form);
 button.disabled=true;button.textContent="Placing order…";error.textContent="";
 try{
  const bankTransfer=data.get("paymentMethod")==="bank_transfer";
  const receiptFile=bankTransfer?$("#waCheckoutReceiptFile").files?.[0]:null;
  if(receiptFile)validateTransferReceipt(receiptFile);
  if(bankTransfer&&!WA_DATABASE_PREVIEW)throw new Error("Bank transfer testing requires the preview API. Try again after the catalogue connects.");
  if(!WA_DATABASE_PREVIEW){
   const customer={fullName:String(data.get("fullName")).trim(),email:String(data.get("email")).trim(),phone:String(data.get("phone")).trim(),addressLine1:String(data.get("addressLine1")).trim(),addressLine2:String(data.get("addressLine2")).trim(),city:String(data.get("city")).trim(),region:String(data.get("region")).trim(),postalCode:String(data.get("postalCode")).trim(),countryCode:"PK"};
   const stock=readTestStock();
   const items=bag.map(item=>{const product=products.find(p=>String(p.id)===String(item.id));if(!product)throw new Error("A product in your bag is no longer available. Refresh and try again.");const key=testStockKey(item);const available=stock[key]===undefined?10:Number(stock[key]);if(item.qty>available)throw new Error(product.name+" ("+item.color+", "+item.size+") has only "+available+" test units remaining.");return {productId:String(product.id),productName:product.name,colour:item.color,size:item.size,quantity:item.qty,unitPrice:product.price,lineTotal:product.price*item.qty,stockKey:key};});
   if(!items.length)throw new Error("Your bag is empty.");
   const total=items.reduce((sum,item)=>sum+item.lineTotal,0);
   const order={orderNumber:"WAT-"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+Math.random().toString(36).slice(2,8).toUpperCase(),createdAt:new Date().toISOString(),status:"TEST_ORDER",paymentStatus:"NOT_COLLECTED",paymentMethod:String(data.get("paymentMethod"))==="bank_transfer"?"TEST_BANK_TRANSFER":"TEST_CASH_ON_DELIVERY",customer,items:items.map(({stockKey,...item})=>item),subtotal:total,shipping:0,total,currency:"PKR",testOnly:true};
   const orders=readTestOrders();orders.unshift(order);storage.setItem(WA_TEST_ORDERS_KEY,JSON.stringify(orders));
   items.forEach(item=>{stock[item.stockKey]=(stock[item.stockKey]===undefined?10:Number(stock[item.stockKey]))-item.quantity;});storage.setItem(WA_TEST_STOCK_KEY,JSON.stringify(stock));
   showTestCheckoutResult(order);
  }else{
   const items=checkoutVariantItems();
   const body={fullName:String(data.get("fullName")).trim(),email:String(data.get("email")).trim(),phone:String(data.get("phone")).trim(),addressLine1:String(data.get("addressLine1")).trim(),addressLine2:String(data.get("addressLine2")).trim(),city:String(data.get("city")).trim(),region:String(data.get("region")).trim(),postalCode:String(data.get("postalCode")).trim(),countryCode:"PK",paymentMethod:String(data.get("paymentMethod")),items};
   const fingerprint=JSON.stringify(body);
   if(previewCheckoutAttempt?.fingerprint!==fingerprint){
    previewCheckoutAttempt={fingerprint,key:createCheckoutKey()};
   }
   body.idempotencyKey=previewCheckoutAttempt.key;
   const response=await fetch(WA_API_BASE+"/checkout/orders",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(body)});
   const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||payload.error||"We could not place your order. Please check your details and try again.");
   if(!payload.order?.orderNumber?.startsWith("WAT-"))throw new Error("The preview order response was incomplete. Please retry the same checkout.");
   const total=Number(payload.order.totalMinor)/100;
   previewCheckoutAttempt=null;
   const claim=payload.accessToken?{orderNumber:payload.order.orderNumber,email:body.email,accessToken:payload.accessToken}:null;
   if(claim)document.dispatchEvent(new CustomEvent("wa-preview-order",{detail:claim}));
   showTestCheckoutResult({orderNumber:payload.order.orderNumber,subtotal:total,paymentMethod:body.paymentMethod},true,claim,receiptFile);
  }
 }catch(err){error.textContent=err.message||"Checkout is temporarily unavailable."; }
 finally{button.disabled=false;button.innerHTML='Place order <span>↗</span>';}
});
function setMobileMenu(open){
 const menu=$("#mobileMenu"),toggle=$("#menuToggle");
 menu.classList.toggle("open",open);
 toggle.setAttribute("aria-expanded",String(open));
 toggle.setAttribute("aria-label",open?"Close menu":"Open menu");
}
function openBag(){setMobileMenu(false);$("#searchBar").classList.remove("open");$("#bagDrawer").classList.add("open");$("#drawerBackdrop").classList.add("open");$("#bagDrawer").setAttribute("aria-hidden","false");document.body.style.overflow="hidden"}function closeBag(){$("#bagDrawer").classList.remove("open");$("#drawerBackdrop").classList.remove("open");$("#bagDrawer").setAttribute("aria-hidden","true");document.body.style.overflow="";}
let toastTimer;function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2600)}
function setCollectionFilter(category){
 activeFilter=category;
 $$("#filters [data-filter]").forEach(button=>{
  const selected=button.dataset.filter===category;
  button.classList.toggle("active",selected);
  button.setAttribute("aria-pressed",String(selected));
 });
 renderProducts();
}
function setCollectionSearch(value){
 query=value.trim();
 if($("#searchInput").value!==value)$("#searchInput").value=value;
 if($("#collectionSearch").value!==value)$("#collectionSearch").value=value;
 renderProducts();
}
$("#filters").addEventListener("click",event=>{
 const button=event.target.closest("[data-filter]");
 if(button)setCollectionFilter(button.dataset.filter);
});
$$("a[data-filter]").forEach(link=>link.addEventListener("click",()=>{
 setCollectionSearch("");
 setCollectionFilter(link.dataset.filter);
 setMobileMenu(false);
}));
$$("[data-look]").forEach(button=>button.addEventListener("click",()=>{
 setCollectionFilter("All");
 setCollectionSearch(button.dataset.look);
 $("#shop").scrollIntoView();
}));
$("#collectionSearch").addEventListener("input",event=>setCollectionSearch(event.target.value));
$("#sortSelect").onchange=renderProducts;$("#bagOpen").onclick=openBag;$("#bagContinue").onclick=closeBag;$("#bagClose").onclick=closeBag;$("#drawerBackdrop").onclick=closeBag;$("#checkoutButton").onclick=openCheckoutPreview;$("#checkoutPreviewClose").onclick=closeCheckoutPreview;$("#checkoutPreviewBackdrop").onclick=closeCheckoutPreview;$("#menuToggle").onclick=()=>{
 $("#searchBar").classList.remove("open");
 setMobileMenu(!$("#mobileMenu").classList.contains("open"));
};
$("#mobileMenu").addEventListener("click",event=>{if(event.target.closest("a"))setMobileMenu(false);});
document.addEventListener("pointerdown",event=>{
 if(!event.target.closest("#mobileMenu,#menuToggle"))setMobileMenu(false);
});$("#searchToggle").onclick=()=>{$("#searchBar").classList.toggle("open");if($("#searchBar").classList.contains("open"))$("#searchInput").focus()};$("#searchClose").onclick=()=>$("#searchBar").classList.remove("open");
$("#searchInput").oninput=event=>setCollectionSearch(event.target.value);
$("#searchInput").addEventListener("keydown",event=>{
 if(event.key==="Enter"){
  event.preventDefault();
  $("#searchBar").classList.remove("open");
  $("#searchInput").blur();
  $("#shop").scrollIntoView();
 }
});
$("#newsletterForm").onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,email=form.elements.email.value.trim(),consent=form.elements.consent.checked,website=form.elements.website.value,button=form.querySelector("button[type=submit]"),message=$("#newsletterMessage");if(!consent){message.textContent="Please confirm consent to receive updates.";return;}button.disabled=true;button.textContent="Joining…";message.textContent="Saving your signup…";try{const response=await fetch(WA_API_BASE+"/newsletter",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({email,consent,website})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||"We could not save your signup. Please try again.");message.textContent="You’re signed up for collection updates.";form.reset();toast("You’re on the WA list.");}catch(error){message.textContent=error.message||"Signup is temporarily unavailable. Please try again.";toast("We couldn’t complete your signup.");}finally{button.disabled=false;button.textContent="Sign up ↗";}};$("#backTop").onclick=e=>{e.preventDefault();window.scrollTo({top:0,behavior:"smooth"})};document.addEventListener("keydown",e=>{if(e.key==="Escape")closeBag()});renderProducts();renderBag();

/* Mobile app navigation actions and active destination state */
const mobileSearchAction=$("#mobileSearchAction"),mobileBagAction=$("#mobileBagAction"),mobileBagCount=$("#mobileBagCount");
if(mobileSearchAction)mobileSearchAction.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();closeBag();setMobileMenu(false);const bar=$("#searchBar");bar.classList.toggle("open");if(bar.classList.contains("open"))$("#searchInput").focus({preventScroll:true});});
if(mobileBagAction)mobileBagAction.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openBag();});
const syncMobileBagCount=()=>{if(mobileBagCount)mobileBagCount.textContent=String(bag.reduce((n,x)=>n+x.qty,0));};
const originalRenderBag=renderBag;
renderBag=function(){originalRenderBag();syncMobileBagCount();};
syncMobileBagCount();
const mobileNavItems=$$(".mobile-app-nav .app-nav-item");
mobileNavItems.forEach(item=>item.addEventListener("click",()=>{
 mobileNavItems.forEach(x=>x.classList.toggle("is-active",x===item));
}));
const mobileNavSections=[["#top",0],["#shop",1],["#story",4]];
if("IntersectionObserver" in window){
 const navObserver=new IntersectionObserver(entries=>{
  const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
  if(!visible)return;
  const target=mobileNavSections.find(([selector])=>document.querySelector(selector)===visible.target);
  if(target)mobileNavItems.forEach((item,index)=>item.classList.toggle("is-active",index===target[1]));
 },{rootMargin:"-25% 0px -60% 0px",threshold:[0,.15,.4]});
 mobileNavSections.forEach(([selector])=>{const section=document.querySelector(selector);if(section)navObserver.observe(section);});
}

const mainHeader=document.querySelector(".site-header");
const syncHeaderDepth=()=>{if(mainHeader)mainHeader.classList.toggle("wa-scrolled",window.scrollY>12);};
window.addEventListener("scroll",syncHeaderDepth,{passive:true});syncHeaderDepth();


/* Database-backed catalogue with a safe editorial fallback. */
let WA_DATABASE_PREVIEW=false;
const WA_TEST_ORDERS_KEY="wa-test-orders-v1";
const WA_TEST_STOCK_KEY="wa-test-stock-v1";
const WA_API_BASE=window.WA_API_BASE||((location.hostname==="localhost"||location.hostname==="127.0.0.1")?"http://127.0.0.1:4000":"/api");
const colourHex={"Black":"#111111","Burgundy":"#741F2B","White":"#F7F7F2","Beige":"#DCC9A8","Cream":"#F1E6D2","Chocolate Brown":"#4A2C20","Chocolate":"#4A2C20","Taupe":"#A89A88","Charcoal":"#55514E","Brown":"#49352C","Olive Green":"#4B5135"};
async function connectLiveCatalogue(){
 try{
  const config=await fetch(WA_API_BASE+"/checkout/config",{cache:"no-store"});
  if(!config.ok||!(await config.json()).previewOrdersEnabled)return;
  const response=await fetch(WA_API_BASE+"/catalog",{headers:{"Accept":"application/json"}});
  if(!response.ok)throw new Error("Catalogue API returned "+response.status);
  const payload=await response.json();
  if(!Array.isArray(payload.products)||payload.products.length===0){console.info("WA catalogue is empty; keeping editorial preview products.");return;}
  pendingCatalogue=payload.products;
  applyPendingCatalogue();
 }catch(error){console.warn("WA live catalogue unavailable; using preview catalogue.",error);}
}
function applyPendingCatalogue(){
 if(!pendingCatalogue||optionProduct||$("#checkoutPreviewModal").classList.contains("open"))return;
 const availableProducts=pendingCatalogue;
 pendingCatalogue=null;
 const previousProducts=products;
 const previousBag=bag;
 products=availableProducts.map(item=>{
  const variants=Array.isArray(item.variants)?item.variants:[];
  const colours=[...new Set(variants.map(v=>v.colour))],sizes=[...new Set(variants.map(v=>v.size))];
  const reference=products.find(p=>p.name.toLowerCase()===String(item.name).toLowerCase());
  const galleryImages=(Array.isArray(item.image_urls)&&item.image_urls.length?item.image_urls:[item.image_url])
   .filter(url=>typeof url==="string"&&/^https:\/\//i.test(url));
  const image=galleryImages[0]||reference?.image||"https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=82";
  return {id:String(item.id),name:item.name,category:item.category,price:Number(item.price_minor)/100,description:item.description||"",image,galleryImages,badge:"WA EDIT",colors:(colours.length?colours:["Black"]).map(name=>[name,colourHex[name]||"#B8A99A"]),sizes:sizes.length?sizes:["S","M","L","XL"],variants};
 });
 bag=previousBag.flatMap(item=>{
  const previous=previousProducts.find(p=>String(p.id)===String(item.id));
  const current=products.find(p=>String(p.id)===String(item.id)||p.name===previous?.name);
  return current?.variants.some(v=>v.colour===item.color&&v.size===item.size&&v.available)
   ? [{...item,id:current.id}] : [];
 });
 WA_DATABASE_PREVIEW=true;
 $("#bagDrawer .wa-test-mode-warning").textContent="TEST MODE · Preview orders are saved for testing. No payment is collected.";
 $("#checkoutPreviewModal .wa-test-mode-banner").textContent="TEST MODE ACTIVE · Use an example.test or example.invalid email. Orders are saved to the preview database.";
 $("#waCheckoutForm .wa-checkout-legal").textContent="TEST ONLY · No payment will be collected and no delivery will occur.";
 $("#waCheckoutForm input[name=email]").placeholder="customer@example.test";
 $("#waCheckoutForm input[value=cod]").checked=true;
 syncCheckoutReceipt();
 $("#waTestOrdersPanel").hidden=true;
 saveBag();renderProducts();
 console.info("WA live catalogue loaded:",products.length,"products");
}
if(new URLSearchParams(location.search).get("store")!=="pk")openCountryGate();
connectLiveCatalogue();
/* Footer navigation: open the selected policy panel before scrolling to it */
$$('.footer-column a[href^="#footer-policy-"]').forEach(link=>link.addEventListener("click",()=>{
 const panel=document.querySelector(link.getAttribute("href"));
 if(panel&&panel.tagName.toLowerCase()==="details")panel.open=true;
}));
})();