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
const editorialReferences=p=>[p.image,"https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=82","https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=900&q=82","https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=82"];
const productDetails={1:{intro:"A clean everyday polo with a considered silhouette.",design:"Collared neckline · Half sleeves · Small WA monogram on the left chest",brand:"Monogram colour: white on black; black on burgundy and white."},2:{intro:"Relaxed tailoring with pleats for a considered everyday shape.",design:"Relaxed fit · Pleated front · Four launch colour options",brand:"Designed for the WA everyday wardrobe."},3:{intro:"A coordinated two-piece look built around ease and proportion.",design:"Matching top and bottom · Extended shirt length · Four launch colours",brand:"No visible logo or monogram on the co-ord set."},4:{intro:"A wide-leg silhouette for ease and structure in everyday dressing.",design:"Wide-leg cut · Four launch colour options",brand:"A versatile separate for a considered rotation."},5:{intro:"A winter layer with a clean, collarless silhouette.",design:"Full sleeves · Collarless neckline · Black, burgundy and beige",brand:"No logo on the front; large WA logo on the back."},6:{intro:"A relaxed boxy-fit shirt with a distinctive back statement.",design:"Boxy silhouette · Black, burgundy, olive green and beige",brand:"People not trends on the back in a vertical layout."},7:{intro:"An everyday boxy tee with the WA point of view built into the details.",design:"Boxy fit · Black, burgundy, olive green and beige",brand:"WA monogram on the front; People not trends on the back."}};
let activeFilter="All",query="",bag=JSON.parse(localStorage.getItem("wa-preview-bag")||"[]");
const countries={PK:{name:"Pakistan",currency:"PKR",flag:"🇵🇰",available:true},US:{name:"United States",currency:"USD",flag:"🇺🇸",available:false},AU:{name:"Australia",currency:"AUD",flag:"🇦🇺",available:false},GB:{name:"United Kingdom",currency:"GBP",flag:"🇬🇧",available:false},AE:{name:"United Arab Emirates",currency:"AED",flag:"🇦🇪",available:false}};
let selectedCountry=localStorage.getItem("wa-country")||"PK";

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const themeToggle=$("#themeToggle");
const savedTheme=localStorage.getItem("wa-theme")==="dark"?"dark":"light";
function applyTheme(theme){document.documentElement.dataset.theme=theme;localStorage.setItem("wa-theme",theme);themeToggle.innerHTML='<span class="theme-icon" aria-hidden="true">'+(theme==="dark"?"☀":"☾")+'</span>';themeToggle.setAttribute("aria-label",theme==="dark"?"Switch to light mode":"Switch to dark mode");themeToggle.setAttribute("title",theme==="dark"?"Switch to light mode":"Switch to dark mode");}
applyTheme(savedTheme);
themeToggle.addEventListener("click",()=>applyTheme(document.documentElement.dataset.theme==="dark"?"light":"dark"));

const money=n=>new Intl.NumberFormat(selectedCountry==="PK"?"en-PK":"en-US",{style:"currency",currency:countries[selectedCountry].currency,maximumFractionDigits:0}).format(n);
function openCountryGate(){$("#countryGate").classList.remove("is-hidden");document.body.classList.add("country-gate-open");}
function closeCountryGate(){if(selectedCountry!=="PK")return;$("#countryGate").classList.add("is-hidden");document.body.classList.remove("country-gate-open");}
function syncCountryUI(){$("#countrySwitch").innerHTML=countries[selectedCountry].flag+" <span>"+countries[selectedCountry].currency+"</span>⌄";$("#countryContinue").innerHTML="Enter "+countries[selectedCountry].name+" store <span>↗</span>";$$(".country-option").forEach(b=>{const chosen=b.dataset.country===selectedCountry;b.classList.toggle("selected",chosen);b.setAttribute("aria-pressed",String(chosen));});}
$$(".country-option").forEach(b=>b.addEventListener("click",()=>{if(b.dataset.country!=="PK"){toast("This market is coming soon. Pakistan is currently available.");return;}selectedCountry=b.dataset.country;localStorage.setItem("wa-country",selectedCountry);syncCountryUI();}));
$("#countryContinue").addEventListener("click",()=>{selectedCountry="PK";localStorage.setItem("wa-country","PK");syncCountryUI();$("#countryGate").classList.add("is-hidden");document.body.classList.remove("country-gate-open");});
syncCountryUI();
/* WA Frequency: turn the brand attitude into a real product-discovery interaction */
const frequencyChoices={
 quiet:{query:"sweatshirt",title:"LOWKEY MODE: ON.",copy:"Easy layers. Relaxed energy. Start with the pieces that do the most without saying too much.",link:"SHOW ME THE OFF-DUTY FITS"},
 bold:{query:"tee",title:"NO BLENDING IN.",copy:"A statement without trying too hard. Find the pieces that let your presence do the talking.",link:"FIND MY STATEMENT PIECE"},
 form:{query:"trouser",title:"CLEAN. CONSIDERED. YOU.",copy:"Strong silhouettes, clean lines, no unnecessary noise. Build your rotation around the fit.",link:"BUILD MY ROTATION"}
};
const frequencyResult=$("#frequencyResult");
$$("[data-frequency]").forEach(card=>card.addEventListener("click",()=>{
 const choice=frequencyChoices[card.dataset.frequency];
 $$("[data-frequency]").forEach(other=>other.setAttribute("aria-pressed",String(other===card)));
 frequencyResult.querySelector("span").textContent=choice.title;
 frequencyResult.querySelector("p").textContent=choice.copy;
 const link=frequencyResult.querySelector("a");link.textContent=choice.link+" ↓";
 query=choice.query;$("#searchInput").value="";
 activeFilter="All";$$(".filter").forEach(x=>x.classList.toggle("active",x.dataset.filter==="All"));
 renderProducts();
 $("#shop").scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
}));


/* Reliable landing campaign CTA navigation */
const campaignLink=document.querySelector(".drop-intro-link");
if(campaignLink){
 campaignLink.addEventListener("click",function(event){
  event.preventDefault();
  const destination=document.getElementById("lookbook");
  if(destination) destination.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
 });
}
/* Lookbook frames act like a campaign navigation, not static decoration */
const lookbookSearch={quiet:"sweatshirt",bold:"tee",form:"trouser"};
$$("[data-look]").forEach(frame=>frame.addEventListener("click",()=>{
 const look=frame.dataset.look;
 query=lookbookSearch[look]||"";$("#searchInput").value="";
 activeFilter="All";$$(".filter").forEach(x=>x.classList.toggle("active",x.dataset.filter==="All"));
 renderProducts();
 $("#shop").scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
 toast("LOOKBOOK / "+look.toUpperCase()+" — pieces selected");
}));
/* Tiny progress line gives the long editorial page a tactile, app-like feel */
const progress=document.createElement("div");progress.className="wa-scroll-progress";progress.setAttribute("aria-hidden","true");document.body.appendChild(progress);
const updateProgress=()=>{const max=document.documentElement.scrollHeight-window.innerHeight;progress.style.transform="scaleX("+ (max>0?window.scrollY/max:0) +")"};
window.addEventListener("scroll",updateProgress,{passive:true});window.addEventListener("resize",updateProgress);updateProgress();
renderProducts();renderBag();
$("#countrySwitch").addEventListener("click",openCountryGate);
function renderProducts(){
 let list=products.filter(p=>(activeFilter==="All"||p.category===activeFilter)&&(p.name.toLowerCase().includes(query.toLowerCase())||p.category.toLowerCase().includes(query.toLowerCase())));
 const sort=$("#sortSelect").value;
 if(sort==="low")list.sort((a,b)=>a.price-b.price);
 if(sort==="high")list.sort((a,b)=>b.price-a.price);
 if(sort==="name")list.sort((a,b)=>a.name.localeCompare(b.name));
 $("#productTotal").textContent=String(list.length).padStart(2,"0")+" pieces";
 $("#productGrid").innerHTML=list.map((p,index)=>`<article class="product-card" style="--card-index:${index}">
  <div class="product-image-wrap">
   <img class="product-image" src="${p.image}" alt="${p.name} — campaign reference" loading="lazy">
   <span class="product-badge">${p.badge}</span>
   <button class="quick-add" type="button" data-add="${p.id}" aria-label="View ${p.name} details">Explore piece <span>↗</span></button>
   <span class="product-image-index">WA / ${String(p.id).padStart(2,"0")}</span>
  </div>
  <div class="product-meta">
   <div class="product-category">${p.category} / WA EDIT</div>
   <div class="product-title-row"><h3 class="product-title">${p.name}</h3><span class="product-price">${money(p.price)}</span></div>
   <div class="product-colors" aria-label="Choose a colour to view product options">
    ${p.colors.map((c,i)=>`<button class="swatch-button ${i===0?"is-default":""}" type="button" data-swatch-product="${p.id}" data-swatch-color="${c[0]}" aria-label="View ${p.name} in ${c[0]}" title="${c[0]}" style="--swatch:${c[1]}"><span class="swatch"></span></button>`).join("")}
    <span class="color-count">${p.colors.length} colours</span>
   </div>
   <div class="product-sizes">S · M · L · XL</div>
  </div>
 </article>`).join("")||'<p class="shop-empty">No pieces found. Try another search.</p>';
 $$("#productGrid [data-add]").forEach(button=>button.addEventListener("click",()=>openProductOptions(button.dataset.add)));
 $$("#productGrid [data-swatch-product]").forEach(button=>button.addEventListener("click",()=>openProductOptions(button.dataset.swatchProduct,button.dataset.swatchColor)));
}
function saveBag(){localStorage.setItem("wa-preview-bag",JSON.stringify(bag));renderBag()}
let optionProduct=null,optionColor="",optionSize="M";
function openProductOptions(id, initialColor=null){
 const p=products.find(x=>String(x.id)===String(id));if(!p)return;
 optionProduct=p;optionColor=p.colors.some(c=>c[0]===initialColor)?initialColor:p.colors[0][0];optionSize="M";
 const gallery=editorialReferences(p);
 const details=productDetails[p.id]||{intro:p.description||'A considered piece from the WA collection.',design:'Available in selected colours and sizes.',brand:'People not trends.'};
 $("#productOptionsContent").innerHTML=`<div class="options-visual"><img class="options-product-image" id="activeProductImage" src="${gallery[0]}" alt="${p.name} — editorial reference"><div class="options-gallery-thumbs">${gallery.map((src,i)=>`<button type="button" class="options-gallery-thumb ${i===0?"selected":""}" data-gallery-image="${src}" aria-label="Show reference image ${i+1}" aria-pressed="${i===0}"><img src="${src}" alt="" loading="lazy"></button>`).join("")}</div><span class="options-image-note">EDITORIAL IMAGE REFERENCES · NOT FINAL PRODUCT PHOTOGRAPHY</span></div><div class="options-product-info"><p class="eyebrow">${p.category} / WA EDIT</p><h2 id="productOptionsTitle">${p.name}</h2><p class="options-price">${money(p.price)}</p><p class="options-description">${details.intro}</p><div class="options-detail-block"><span>DESIGN NOTES</span><p>${details.design}</p></div><div class="options-detail-block"><span>THE WA DETAIL</span><p>${details.brand}</p></div><fieldset class="option-field"><legend>Colour: <strong id="selectedColour">${optionColor}</strong></legend><div class="option-swatches">${p.colors.map((c,i)=>`<button type="button" class="option-swatch ${c[0]===optionColor?"selected":""}" data-option-color="${c[0]}" aria-label="${c[0]}" aria-pressed="${c[0]===optionColor}" title="${c[0]}" style="--swatch:${c[1]}"></button>`).join("")}</div></fieldset><fieldset class="option-field"><legend>Size</legend><div class="option-sizes">${p.sizes.map((s,i)=>`<button type="button" class="option-size ${s===optionSize?"selected":""}" data-option-size="${s}" aria-pressed="${s===optionSize}">${s}</button>`).join("")}</div></fieldset><button type="button" class="button button-burgundy options-add-button" id="confirmAddToBag">Add to bag <span>↗</span></button><details class="options-size-guide"><summary>Size guide & fit</summary><p>Available sizes: S, M, L and XL. The measurement chart for this piece will be added before the store opens. Contact us for fit guidance.</p><a href="mailto:info@waqaralanabi.com?subject=Size%20and%20Fit">Ask us about your size ↗</a></details><p class="options-size-note">Preview store only — checkout is not active yet.</p></div>`;
 $("#productOptionsModal").classList.add("open");$("#productOptionsBackdrop").classList.add("open");$("#productOptionsModal").setAttribute("aria-hidden","false");document.body.style.overflow="hidden";
}
function closeProductOptions(){$("#productOptionsModal").classList.remove("open");$("#productOptionsBackdrop").classList.remove("open");$("#productOptionsModal").setAttribute("aria-hidden","true");if(!$("#bagDrawer").classList.contains("open"))document.body.style.overflow="";optionProduct=null}
$("#productOptionsClose").addEventListener("click",closeProductOptions);
$("#productOptionsBackdrop").addEventListener("click",closeProductOptions);
$("#productOptionsContent").addEventListener("click",e=>{
 const galleryBtn=e.target.closest("[data-gallery-image]");if(galleryBtn){$("#activeProductImage").src=galleryBtn.dataset.galleryImage;$$("[data-gallery-image]").forEach(b=>{const active=b===galleryBtn;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",String(active))});return}
 const colorBtn=e.target.closest("[data-option-color]");
 if(colorBtn&&optionProduct){optionColor=colorBtn.dataset.optionColor;$$("[data-option-color]").forEach(b=>{const active=b===colorBtn;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",String(active))});$("#selectedColour").textContent=optionColor;return}
 const sizeBtn=e.target.closest("[data-option-size]");
 if(sizeBtn){optionSize=sizeBtn.dataset.optionSize;$$("[data-option-size]").forEach(b=>{const active=b===sizeBtn;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",String(active))});return}
 if(e.target.closest("#confirmAddToBag")&&optionProduct){
  const p=optionProduct,found=bag.find(x=>x.id===p.id&&x.size===optionSize&&x.color===optionColor);
  if(found)found.qty++;else bag.push({id:p.id,size:optionSize,color:optionColor,qty:1});
  closeProductOptions();saveBag();toast(p.name+" added to your bag");openBag();
 }
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeCheckoutPreview();closeProductOptions();closeBag()}});
function renderBag(){const count=bag.reduce((n,x)=>n+x.qty,0);const subtotal=bag.reduce((n,x)=>n+(products.find(p=>String(p.id)===String(x.id))?.price||0)*x.qty,0);$("#bagCount").textContent=count;$("#drawerCount").textContent="("+count+")";$("#subtotal").textContent=money(subtotal);const checkout=$("#checkoutButton");if(checkout)checkout.disabled=count===0;$("#bagItems").innerHTML=bag.length?bag.map((x,i)=>{const p=products.find(p=>String(p.id)===String(x.id));if(!p)return '';return `<div class="bag-line"><img src="${p.image}" alt=""><div><h3>${p.name}</h3><p>${x.color} · Size ${x.size}</p><p>${money(p.price)}</p><div class="qty-controls"><button data-qty="${i}" data-delta="-1" aria-label="Decrease quantity">−</button><span>${x.qty}</span><button data-qty="${i}" data-delta="1" aria-label="Increase quantity">+</button></div></div><button class="remove-item" data-remove="${i}" aria-label="Remove item">×</button></div>`}).join(""):'<div class="empty-bag">Your bag is waiting for something special.</div>';$$("[data-qty]").forEach(b=>b.onclick=()=>{const i=+b.dataset.qty;bag[i].qty+=+b.dataset.delta;if(bag[i].qty<1)bag.splice(i,1);saveBag()});$$("[data-remove]").forEach(b=>b.onclick=()=>{bag.splice(+b.dataset.remove,1);saveBag()})}
/* A transparent, non-transactional checkout preview while commerce is being built */
function openCheckoutPreview(){
 if(!bag.length){toast("Your bag is empty.");return;}
 const count=bag.reduce((n,item)=>n+item.qty,0);
 const subtotal=bag.reduce((n,item)=>n+(products.find(p=>String(p.id)===String(item.id))?.price||0)*item.qty,0);
 $("#checkoutPreviewCount").textContent=String(count).padStart(2,"0");
 $("#checkoutPreviewSubtotal").textContent=money(subtotal);
 $("#checkoutPreviewModal").classList.add("open");
 $("#checkoutPreviewBackdrop").classList.add("open");
 $("#checkoutPreviewModal").setAttribute("aria-hidden","false");
}
function closeCheckoutPreview(){
 $("#checkoutPreviewModal").classList.remove("open");
 $("#checkoutPreviewBackdrop").classList.remove("open");
 $("#checkoutPreviewModal").setAttribute("aria-hidden","true");
}
function openBag(){$("#searchBar").classList.remove("open");$("#bagDrawer").classList.add("open");$("#drawerBackdrop").classList.add("open");$("#bagDrawer").setAttribute("aria-hidden","false");document.body.style.overflow="hidden"}function closeBag(){$("#bagDrawer").classList.remove("open");$("#drawerBackdrop").classList.remove("open");$("#bagDrawer").setAttribute("aria-hidden","true");document.body.style.overflow="";}
let toastTimer;function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2600)}
$("#filters").addEventListener("click",e=>{const b=e.target.closest("[data-filter]");if(!b)return;activeFilter=b.dataset.filter;$$(".filter").forEach(x=>x.classList.toggle("active",x.dataset.filter===activeFilter));renderProducts()});$$(".desktop-nav [data-filter],.mobile-menu [data-filter],.category-tile[data-filter],.footer-column [data-filter]").forEach(a=>a.addEventListener("click",()=>{activeFilter=a.dataset.filter;$$(".filter").forEach(x=>x.classList.toggle("active",x.dataset.filter===activeFilter));renderProducts();$("#mobileMenu").classList.remove("open")}));$("#sortSelect").onchange=renderProducts;$("#bagOpen").onclick=openBag;$("#bagContinue").onclick=closeBag;$("#bagClose").onclick=closeBag;$("#drawerBackdrop").onclick=closeBag;$("#checkoutButton").onclick=openCheckoutPreview;$("#checkoutPreviewClose").onclick=closeCheckoutPreview;$("#checkoutPreviewBackdrop").onclick=closeCheckoutPreview;$("#checkoutReturnToBag").onclick=closeCheckoutPreview;$("#menuToggle").onclick=()=>$("#mobileMenu").classList.toggle("open");$("#searchToggle").onclick=()=>{$("#searchBar").classList.toggle("open");if($("#searchBar").classList.contains("open"))$("#searchInput").focus()};$("#searchClose").onclick=()=>{$("#searchBar").classList.remove("open");query="";$("#searchInput").value="";renderProducts()};$("#searchInput").oninput=e=>{query=e.target.value;renderProducts()};$("#newsletterForm").onsubmit=e=>{e.preventDefault();$("#newsletterMessage").textContent="Thanks — newsletter signup will be connected before launch.";toast("Thank you for your interest.")};$("#backTop").onclick=e=>{e.preventDefault();window.scrollTo({top:0,behavior:"smooth"})};document.addEventListener("keydown",e=>{if(e.key==="Escape")closeBag()});renderProducts();renderBag();

/* Mobile app navigation actions and active destination state */
const mobileSearchAction=$("#mobileSearchAction"),mobileBagAction=$("#mobileBagAction"),mobileBagCount=$("#mobileBagCount");
if(mobileSearchAction)mobileSearchAction.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();closeBag();const bar=$("#searchBar");bar.classList.toggle("open");if(bar.classList.contains("open"))$("#searchInput").focus({preventScroll:true});});
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

/* Storefront motion system: progressive reveals and restrained scroll feedback */
document.documentElement.classList.add("wa-motion-ready");
const revealTargets=[".intro",".wa-frequency",".category-editorial",".wa-lookbook",".shop-section",".manifesto",".service-strip",".newsletter",".footer-main"];
revealTargets.forEach(selector=>{const el=document.querySelector(selector);if(el)el.classList.add("wa-scroll-reveal");});
if("IntersectionObserver" in window&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches){
 const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(entry.isIntersecting){entry.target.classList.add("wa-visible");revealObserver.unobserve(entry.target);}
 }),{threshold:.12,rootMargin:"0px 0px -45px 0px"});
 document.querySelectorAll(".wa-scroll-reveal").forEach(el=>revealObserver.observe(el));
}else{document.querySelectorAll(".wa-scroll-reveal").forEach(el=>el.classList.add("wa-visible"));}
const mainHeader=document.querySelector(".site-header");
const syncHeaderDepth=()=>{if(mainHeader)mainHeader.classList.toggle("wa-scrolled",window.scrollY>12);};
window.addEventListener("scroll",syncHeaderDepth,{passive:true});syncHeaderDepth();


/* Database-backed catalogue with a safe editorial fallback. */
const WA_API_BASE="http://127.0.0.1:4000";
const colourHex={"Black":"#111111","Burgundy":"#741F2B","White":"#F7F7F2","Beige":"#DCC9A8","Cream":"#F1E6D2","Chocolate Brown":"#4A2C20","Chocolate":"#4A2C20","Taupe":"#A89A88","Charcoal":"#55514E","Brown":"#49352C","Olive Green":"#4B5135"};
async function connectLiveCatalogue(){
 try{
  const response=await fetch(WA_API_BASE+"/catalog",{headers:{"Accept":"application/json"}});
  if(!response.ok)throw new Error("Catalogue API returned "+response.status);
  const payload=await response.json();
  if(!Array.isArray(payload.products)||payload.products.length===0){console.info("WA catalogue is empty; keeping editorial preview products.");return;}
  const previousBag=bag;
  products=payload.products.map(item=>{
   const variants=Array.isArray(item.variants)?item.variants:[];
   const colours=[...new Set(variants.map(v=>v.colour))],sizes=[...new Set(variants.map(v=>v.size))];
   const reference=products.find(p=>p.name.toLowerCase()===String(item.name).toLowerCase());
   const image=item.image_url||reference?.image||"https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=82";
   return {id:String(item.id),name:item.name,category:item.category,price:Number(item.price_minor)/100,description:item.description||"",image,badge:"WA EDIT",colors:(colours.length?colours:["Black"]).map(name=>[name,colourHex[name]||"#B8A99A"]),sizes:sizes.length?sizes:["S","M","L","XL"],variants};
  });
  bag=previousBag.filter(item=>products.some(p=>String(p.id)===String(item.id)));
  saveBag();renderProducts();
  console.info("WA live catalogue loaded:",products.length,"products");
 }catch(error){console.warn("WA live catalogue unavailable; using preview catalogue.",error);}
}
connectLiveCatalogue();
/* Footer navigation: open the selected policy panel before scrolling to it */
$$('.footer-column a[href^="#footer-policy-"]').forEach(link=>link.addEventListener("click",()=>{
 const panel=document.querySelector(link.getAttribute("href"));
 if(panel&&panel.tagName.toLowerCase()==="details")panel.open=true;
}));
})();