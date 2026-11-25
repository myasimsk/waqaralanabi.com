(() => {
const products=[
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
function renderProducts(){let list=products.filter(p=>(activeFilter==="All"||p.category===activeFilter)&&(p.name.toLowerCase().includes(query.toLowerCase())||p.category.toLowerCase().includes(query.toLowerCase())));const sort=$("#sortSelect").value;if(sort==="low")list.sort((a,b)=>a.price-b.price);if(sort==="high")list.sort((a,b)=>b.price-a.price);if(sort==="name")list.sort((a,b)=>a.name.localeCompare(b.name));$("#productTotal").textContent=String(list.length).padStart(2,"0")+" pieces";$("#productGrid").innerHTML=list.map(p=>`<article class="product-card"><div class="product-image-wrap"><img class="product-image" src="${p.image}" alt="${p.name}" loading="lazy"><span class="product-badge">${p.badge}</span><button class="quick-add" data-add="${p.id}">View piece <span>↗</span></button></div><div class="product-meta"><div class="product-category">${p.category} / WA EDIT</div><div class="product-title-row"><h3 class="product-title">${p.name}</h3><span class="product-price">${money(p.price)}</span></div><div class="product-colors" aria-label="Available colors">${p.colors.map(c=>`<span class="swatch" title="${c[0]}" style="background:${c[1]}"></span>`).join("")}<span class="color-count">${p.colors.length} colours</span></div><div class="product-sizes">S · M · L · XL</div></div></article>`).join("")||'<p>No pieces found. Try another search.</p>';$$("[data-add]").forEach(b=>b.addEventListener("click",()=>openProductOptions(Number(b.dataset.add))))}
function saveBag(){localStorage.setItem("wa-preview-bag",JSON.stringify(bag));renderBag()}
let optionProduct=null,optionColor="",optionSize="M";
function openProductOptions(id){
 const p=products.find(x=>x.id===id);if(!p)return;
 optionProduct=p;optionColor=p.colors[0][0];optionSize="M";
 const gallery=editorialReferences(p);
 $("#productOptionsContent").innerHTML=`<div class="options-visual"><img class="options-product-image" id="activeProductImage" src="${gallery[0]}" alt="${p.name} — editorial reference"><div class="options-gallery-thumbs">${gallery.map((src,i)=>`<button type="button" class="options-gallery-thumb ${i===0?"selected":""}" data-gallery-image="${src}" aria-label="Show reference image ${i+1}" aria-pressed="${i===0}"><img src="${src}" alt="" loading="lazy"></button>`).join("")}</div><span class="options-image-note">EDITORIAL IMAGE REFERENCES · NOT FINAL PRODUCT PHOTOGRAPHY</span></div><div class="options-product-info"><p class="eyebrow">${p.category} / WA EDIT</p><h2 id="productOptionsTitle">${p.name}</h2><p class="options-price">${money(p.price)}</p><p class="options-description">${productDetails[p.id].intro}</p><div class="options-detail-block"><span>DESIGN NOTES</span><p>${productDetails[p.id].design}</p></div><div class="options-detail-block"><span>THE WA DETAIL</span><p>${productDetails[p.id].brand}</p></div><fieldset class="option-field"><legend>Colour: <strong id="selectedColour">${optionColor}</strong></legend><div class="option-swatches">${p.colors.map((c,i)=>`<button type="button" class="option-swatch ${i===0?"selected":""}" data-option-color="${c[0]}" aria-label="${c[0]}" aria-pressed="${i===0}" title="${c[0]}" style="--swatch:${c[1]}"></button>`).join("")}</div></fieldset><fieldset class="option-field"><legend>Size</legend><div class="option-sizes">${p.sizes.map((s,i)=>`<button type="button" class="option-size ${s===optionSize?"selected":""}" data-option-size="${s}" aria-pressed="${s===optionSize}">${s}</button>`).join("")}</div></fieldset><button type="button" class="button button-burgundy options-add-button" id="confirmAddToBag">Add to bag <span>↗</span></button><details class="options-size-guide"><summary>Size guide & fit</summary><p>Available sizes: S, M, L and XL. The measurement chart for this piece will be added before the store opens. Contact us for fit guidance.</p><a href="mailto:info@waqaralanabi.com?subject=Size%20and%20Fit">Ask us about your size ↗</a></details><p class="options-size-note">Preview store only — checkout is not active yet.</p></div>`;
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
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeProductOptions();closeBag()}});
function renderBag(){const count=bag.reduce((n,x)=>n+x.qty,0);$("#bagCount").textContent=count;$("#drawerCount").textContent="("+count+")";$("#subtotal").textContent=money(bag.reduce((n,x)=>n+products.find(p=>p.id===x.id).price*x.qty,0));$("#bagItems").innerHTML=bag.length?bag.map((x,i)=>{const p=products.find(p=>p.id===x.id);return `<div class="bag-line"><img src="${p.image}" alt=""><div><h3>${p.name}</h3><p>${x.color} · Size ${x.size}</p><p>${money(p.price)}</p><div class="qty-controls"><button data-qty="${i}" data-delta="-1" aria-label="Decrease quantity">−</button><span>${x.qty}</span><button data-qty="${i}" data-delta="1" aria-label="Increase quantity">+</button></div></div><button class="remove-item" data-remove="${i}" aria-label="Remove item">×</button></div>`}).join(""):'<div class="empty-bag">Your bag is waiting for something special.</div>';$$("[data-qty]").forEach(b=>b.onclick=()=>{const i=+b.dataset.qty;bag[i].qty+=+b.dataset.delta;if(bag[i].qty<1)bag.splice(i,1);saveBag()});$$("[data-remove]").forEach(b=>b.onclick=()=>{bag.splice(+b.dataset.remove,1);saveBag()})}
function openBag(){$("#bagDrawer").classList.add("open");$("#drawerBackdrop").classList.add("open");$("#bagDrawer").setAttribute("aria-hidden","false");document.body.style.overflow="hidden"}function closeBag(){$("#bagDrawer").classList.remove("open");$("#drawerBackdrop").classList.remove("open");$("#bagDrawer").setAttribute("aria-hidden","true");document.body.style.overflow=""}
let toastTimer;function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2600)}
$("#filters").addEventListener("click",e=>{const b=e.target.closest("[data-filter]");if(!b)return;activeFilter=b.dataset.filter;$$(".filter").forEach(x=>x.classList.toggle("active",x.dataset.filter===activeFilter));renderProducts()});$$(".desktop-nav [data-filter],.mobile-menu [data-filter],.category-tile[data-filter],.footer-column [data-filter]").forEach(a=>a.addEventListener("click",()=>{activeFilter=a.dataset.filter;$$(".filter").forEach(x=>x.classList.toggle("active",x.dataset.filter===activeFilter));renderProducts();$("#mobileMenu").classList.remove("open")}));$("#sortSelect").onchange=renderProducts;$("#bagOpen").onclick=openBag;$("#bagContinue").onclick=closeBag;$("#bagClose").onclick=closeBag;$("#drawerBackdrop").onclick=closeBag;$("#checkoutButton").onclick=()=>toast("Online checkout will be available at launch.");$("#menuToggle").onclick=()=>$("#mobileMenu").classList.toggle("open");$("#searchToggle").onclick=()=>{$("#searchBar").classList.toggle("open");if($("#searchBar").classList.contains("open"))$("#searchInput").focus()};$("#searchClose").onclick=()=>{$("#searchBar").classList.remove("open");query="";$("#searchInput").value="";renderProducts()};$("#searchInput").oninput=e=>{query=e.target.value;renderProducts()};$("#newsletterForm").onsubmit=e=>{e.preventDefault();$("#newsletterMessage").textContent="Thanks — newsletter signup will be connected before launch.";toast("Thank you for your interest.")};$("#backTop").onclick=e=>{e.preventDefault();window.scrollTo({top:0,behavior:"smooth"})};document.addEventListener("keydown",e=>{if(e.key==="Escape")closeBag()});renderProducts();renderBag();

/* Mobile app navigation actions and active destination state */
const mobileSearchAction=$("#mobileSearchAction"),mobileBagAction=$("#mobileBagAction"),mobileBagCount=$("#mobileBagCount");
if(mobileSearchAction)mobileSearchAction.addEventListener("click",()=>{$("#searchBar").classList.add("open");$("#searchInput").focus();});
if(mobileBagAction)mobileBagAction.addEventListener("click",openBag);
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

/* Footer navigation: open the selected policy panel before scrolling to it */
$$('.footer-column a[href^="#footer-policy-"]').forEach(link=>link.addEventListener("click",()=>{
 const panel=document.querySelector(link.getAttribute("href"));
 if(panel&&panel.tagName.toLowerCase()==="details")panel.open=true;
}));
})();