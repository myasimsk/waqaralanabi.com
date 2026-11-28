(() => {
"use strict";
const $ = (selector, root=document) => root.querySelector(selector);
const API = window.WA_API_BASE || ((location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "http://127.0.0.1:4000" : "/api");
const state = {admin:null,customerOffset:0,orderOffset:0,limit:20,customerSearch:"",orderSearch:"",orderStatus:"",newsletterOffset:0,newsletterSearch:"",currentView:"overview"};
const escapeHtml = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const number = value => Number(value || 0).toLocaleString();
const money = (minor,currency) => {
  const amount = Number(minor || 0) / 100;
  try { return new Intl.NumberFormat(undefined,{style:"currency",currency:currency || "PKR",maximumFractionDigits:2}).format(amount); }
  catch { return (currency || "") + " " + amount.toFixed(2); }
};
const date = value => value ? new Date(value).toLocaleString() : "—";
const notice = message => { const el=$("#notice"); el.textContent=message || ""; el.classList.toggle("show",Boolean(message)); };
async function api(path, options={}) {
  const response = await fetch(API + path,{credentials:"include",headers:{"Content-Type":"application/json",...(options.headers || {})},...options});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) { const error = new Error(body.message || body.error || "The request could not be completed."); error.status=response.status; throw error; }
  return body;
}
function showLogin(show) { $("#loginScreen").classList.toggle("hidden",!show); }
function setView(name) {
  state.currentView=name;
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  const titles={overview:"Overview",customers:"Customers",inventory:"Inventory",orders:"Orders",returns:"Returns & exchanges","activity":"Activity log",newsletter:"Newsletter"};
  $("#pageTitle").textContent=titles[name] || "Overview";
  notice("");
  if(name==="inventory") loadInventory();
  if(name==="customers") loadCustomers();
  if(name==="orders") loadOrders();
  if(name==="returns") void loadReturns();
  if(name==="activity") loadActivity();
  if(name==="newsletter") loadNewsletter();
}
function status(value) { const v=String(value || "unknown"); return '<span class="status '+escapeHtml(v)+'">'+escapeHtml(v.replace(/_/g," "))+'</span>'; }
async function loadOverview() {
  const [customers,orders,overview] = await Promise.all([
    api("/admin/customers?limit=1&offset=0"),
    api("/admin/orders?limit=5&offset=0"),
    api("/admin/overview")
  ]);
  $("#metricCustomers").textContent=number(customers.pagination.total);
  $("#metricOrders").textContent=number(overview.orders.total);
  $("#metricRevenue").textContent=money(overview.revenue.paidMinor,overview.revenue.currency);
  $("#metricPending").textContent=number(overview.orders.pendingPayment);
  $("#metricFulfilment").textContent=number(overview.orders.inFulfilment);
  $("#metricStock").textContent=number(overview.inventory.availableUnits);
  const recent = orders.orders || [];
  $("#recentOrders").innerHTML=recent.length?recent.map(o=>'<tr><td><b>'+escapeHtml(o.order_number)+'</b></td><td>'+escapeHtml(o.customer_name || o.customer_email || "Guest")+'</td><td>'+status(o.status)+'</td><td>'+money(o.total_minor,o.currency)+'</td></tr>').join(""):'<tr><td colspan="4" class="empty-cell">No orders have been recorded yet.</td></tr>';
  $("#metricLoyalty").textContent="NOT LIVE";
  $("#todayStamp").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase();
}
let inventoryCache=[];
async function loadInventory(){ $("#inventoryRows").innerHTML='<tr><td colspan="9" class="empty-cell">Loading inventory…</td></tr>';try{const d=await api("/admin/inventory");inventoryCache=d.inventory||[];const p=new Map();inventoryCache.forEach(x=>p.set(x.product_id,{id:x.product_id,name:x.name}));$("#inventoryProducts").textContent=number(p.size);$("#inventoryVariants").textContent=number(inventoryCache.filter(x=>x.variant_id).length);$("#inventoryAvailable").textContent=number(inventoryCache.reduce((n,x)=>n+Number(x.available_quantity||0),0));$("#inventoryReserved").textContent=number(inventoryCache.reduce((n,x)=>n+Number(x.reserved_quantity||0),0));$("#inventoryLow").textContent=number(inventoryCache.filter(x=>x.variant_id&&x.low_stock).length);$("#variantProduct").innerHTML=p.size?[...p.values()].map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.name)+'</option>').join(""):'<option value="">Create a product first</option>';renderInventory();}catch(e){$("#inventoryRows").innerHTML='<tr><td colspan="9" class="empty-cell">'+escapeHtml(e.message)+'</td></tr>';}}
function renderInventory(){const term=$("#inventorySearch").value.trim().toLowerCase(),f=$("#inventoryFilter").value;const rows=inventoryCache.filter(x=>[x.name,x.slug,x.sku,x.colour,x.size].some(v=>String(v||"").toLowerCase().includes(term))&&(f==="all"||(f==="low"&&x.low_stock)||(f==="out"&&x.variant_id&&Number(x.available_quantity||0)===0)||(f==="reserved"&&x.variant_id&&Number(x.reserved_quantity||0)>0)||(f==="inactive"&&!x.product_active)));$("#inventoryRows").innerHTML=rows.length?rows.map(x=>{if(!x.variant_id)return '<tr><td><b>'+escapeHtml(x.name)+'</b><small class="table-subline">No variants yet</small><button class="row-action" data-edit-product="'+escapeHtml(x.product_id)+'">Edit</button></td><td colspan="7">—</td><td><button class="row-action" data-product-status="'+escapeHtml(x.product_id)+'" data-active="'+String(!x.product_active)+'">'+(x.product_active?'Deactivate':'Activate')+'</button></td></tr>';const a=Number(x.available_quantity||0),s=!x.product_active?'Inactive':(!x.variant_active?'Variant inactive':(a===0?'Out of stock':(x.low_stock?'Low stock':'In stock')));return '<tr class="'+(x.low_stock?'low-stock-row':'')+'"><td><b>'+escapeHtml(x.name)+'</b><small class="table-subline">'+escapeHtml(x.sku)+'</small><button class="row-action" data-edit-variant="'+escapeHtml(x.variant_id)+'">Edit variant</button></td><td>'+escapeHtml(x.colour)+'</td><td>'+escapeHtml(x.size)+'</td><td>'+number(x.stock_on_hand)+'</td><td>'+number(x.reserved_quantity)+'</td><td><b>'+number(a)+'</b></td><td>'+number(x.low_stock_threshold)+'</td><td><span class="stock-pill '+(x.low_stock?'warning':(a===0?'danger':'good'))+'">'+escapeHtml(s)+'</span></td><td><form class="stock-adjust" data-stock-form="'+escapeHtml(x.variant_id)+'"><input name="stockOnHand" aria-label="New total stock quantity" title="New total units on hand; cannot be below reserved units" type="number" min="'+number(x.reserved_quantity)+'" value="'+number(x.stock_on_hand)+'" required><input name="reason" aria-label="Reason for stock adjustment" placeholder="Reason required (e.g. received 12)" minlength="5" maxlength="500" required><button>Save</button></form></td></tr>';}).join(""):'<tr><td colspan="9" class="empty-cell">No matching inventory records.</td></tr>';$("#inventoryRows").querySelectorAll("[data-stock-form]").forEach(form=>form.addEventListener("submit",async e=>{e.preventDefault();const v=new FormData(form),b=form.querySelector("button");b.disabled=true;try{await api("/admin/inventory/variants/"+encodeURIComponent(form.dataset.stockForm)+"/stock",{method:"PATCH",body:JSON.stringify({stockOnHand:Number(v.get("stockOnHand")),reason:String(v.get("reason")).trim()})});notice("Stock updated and recorded in the admin activity log.");await loadInventory();}catch(err){notice(err.message);b.disabled=false;}}));$("#inventoryRows").querySelectorAll("[data-edit-product]").forEach(b=>b.addEventListener("click",()=>{const p=inventoryCache.find(x=>x.product_id===b.dataset.editProduct);if(!p)return;const f=$("#editProductForm");f.elements.productId.value=p.product_id;f.elements.name.value=p.name||"";f.elements.slug.value=p.slug||"";f.elements.category.value=p.category||"Unisex";f.elements.price.value=(Number(p.price_minor||0)/100).toFixed(2);f.elements.description.value=p.description||"";f.elements.imageUrls.value=(p.image_urls|| (p.image_url?[p.image_url]:[])).join("\n");f.elements.isActive.checked=Boolean(p.product_active);f.hidden=false;f.scrollIntoView({behavior:"smooth",block:"center"});}));
$("#inventoryRows").querySelectorAll("[data-edit-variant]").forEach(b=>b.addEventListener("click",()=>{const v=inventoryCache.find(x=>x.variant_id===b.dataset.editVariant);if(!v)return;const f=$("#editVariantForm");f.elements.variantId.value=v.variant_id;f.elements.sku.value=v.sku||"";f.elements.colour.value=v.colour||"";f.elements.size.value=v.size||"M";f.elements.lowStockThreshold.value=Number(v.low_stock_threshold||0);f.elements.isActive.checked=Boolean(v.variant_active);f.hidden=false;f.scrollIntoView({behavior:"smooth",block:"center"});}));
$("#inventoryRows").querySelectorAll("[data-product-status]").forEach(b=>b.addEventListener("click",async()=>{b.disabled=true;try{await api("/admin/inventory/products/"+encodeURIComponent(b.dataset.productStatus)+"/status",{method:"PATCH",body:JSON.stringify({isActive:b.dataset.active==="true"})});notice("Product status updated.");await loadInventory();}catch(e){notice(e.message);b.disabled=false;}}));}
$("#productForm").addEventListener("submit",async e=>{e.preventDefault();const f=e.currentTarget,v=new FormData(f),b=f.querySelector("button");b.disabled=true;try{await api("/admin/inventory/products",{method:"POST",body:JSON.stringify({name:String(v.get("name")).trim(),slug:String(v.get("slug")).trim(),description:String(v.get("description")||"").trim(),category:v.get("category"),priceMinor:Math.round(Number(v.get("price"))*100),currency:"PKR",imageUrls:String(v.get("imageUrls")||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean),isActive:v.get("isActive")==="on"})});f.reset();notice("Product created. Add its variants next.");await loadInventory();}catch(e){notice(e.message);}finally{b.disabled=false;}});
$("#editProductForm").addEventListener("submit",async e=>{e.preventDefault();const f=e.currentTarget,v=new FormData(f),b=f.querySelector("button[type=submit]");b.disabled=true;try{await api("/admin/inventory/products/"+encodeURIComponent(v.get("productId")),{method:"PATCH",body:JSON.stringify({name:String(v.get("name")).trim(),slug:String(v.get("slug")).trim(),description:String(v.get("description")||"").trim(),category:v.get("category"),priceMinor:Math.round(Number(v.get("price"))*100),currency:"PKR",imageUrls:String(v.get("imageUrls")||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean),isActive:v.get("isActive")==="on"})});f.hidden=true;notice("Product details updated.");await loadInventory();}catch(err){notice(err.message);}finally{b.disabled=false;}});
$("#cancelProductEdit").addEventListener("click",()=>{$("#editProductForm").hidden=true;});
$("#editVariantForm").addEventListener("submit",async e=>{e.preventDefault();const f=e.currentTarget,v=new FormData(f),b=f.querySelector("button[type=submit]");b.disabled=true;try{await api("/admin/inventory/variants/"+encodeURIComponent(v.get("variantId")),{method:"PATCH",body:JSON.stringify({sku:String(v.get("sku")).trim(),colour:String(v.get("colour")).trim(),size:v.get("size"),lowStockThreshold:Number(v.get("lowStockThreshold")),isActive:v.get("isActive")==="on"})});f.hidden=true;notice("Variant details updated. Stock quantities were not changed.");await loadInventory();}catch(err){notice(err.message);}finally{b.disabled=false;}});
$("#cancelVariantEdit").addEventListener("click",()=>{$("#editVariantForm").hidden=true;});
$("#variantForm").addEventListener("submit",async e=>{e.preventDefault();const f=e.currentTarget,v=new FormData(f),b=f.querySelector("button"),id=v.get("productId");b.disabled=true;try{await api("/admin/inventory/products/"+encodeURIComponent(id)+"/variants",{method:"POST",body:JSON.stringify({sku:String(v.get("sku")).trim(),colour:String(v.get("colour")).trim(),size:v.get("size"),stockOnHand:Number(v.get("stockOnHand")),lowStockThreshold:Number(v.get("lowStockThreshold"))})});f.reset();await loadInventory();$("#variantProduct").value=id;notice("Variant added to inventory.");}catch(e){notice(e.message);}finally{b.disabled=false;}});
$("#refreshInventory").addEventListener("click",loadInventory);$("#inventorySearch").addEventListener("input",renderInventory);$("#inventoryFilter").addEventListener("change",renderInventory);

async function loadCustomers() {
  $("#customerRows").innerHTML='<tr><td colspan="7" class="empty-cell">Loading customers…</td></tr>';
  try {
    const query=new URLSearchParams({search:state.customerSearch,limit:String(state.limit),offset:String(state.customerOffset)});
    const data=await api("/admin/customers?"+query.toString());
    $("#customerRows").innerHTML=data.customers.length?data.customers.map(c=>'<tr><td><b>'+escapeHtml(c.full_name)+'</b></td><td>'+escapeHtml(c.email)+'</td><td>'+number(c.order_count)+'</td><td>'+money(c.lifetime_order_value_minor,"PKR")+'</td><td>'+number(c.loyalty_points)+'</td><td>'+status(c.status)+'</td><td><button class="row-action" data-customer="'+escapeHtml(c.id)+'">View ↗</button></td></tr>').join(""):'<tr><td colspan="7" class="empty-cell">No matching customers found.</td></tr>';
    $("#customerPageInfo").textContent=(data.pagination.total?state.customerOffset+1:0)+"–"+Math.min(state.customerOffset+state.limit,data.pagination.total)+" of "+data.pagination.total;
    $("#customerPrev").disabled=state.customerOffset===0;
    $("#customerNext").disabled=state.customerOffset+state.limit>=data.pagination.total;
    $("#customerRows").querySelectorAll("[data-customer]").forEach(b=>b.addEventListener("click",()=>loadCustomerDetail(b.dataset.customer)));
  } catch(e) { $("#customerRows").innerHTML='<tr><td colspan="7" class="empty-cell">'+escapeHtml(e.message)+'</td></tr>'; }
}
async function loadCustomerDetail(id) {
  const panel=$("#customerDetail"); panel.hidden=false; panel.innerHTML='<p class="empty-cell">Loading customer record…</p>';
  try {
    const data=await api("/admin/customers/"+encodeURIComponent(id));
    const c=data.customer;
    panel.innerHTML='<div class="detail-head"><div><p class="eyebrow">CUSTOMER RECORD</p><h3>'+escapeHtml(c.full_name)+'</h3><p>'+escapeHtml(c.email)+'</p></div><button class="detail-close" id="closeCustomerDetail">Close ×</button></div><div class="detail-grid"><div class="detail-item"><small>ACCOUNT STATUS</small><b>'+status(c.status)+'</b></div><div class="detail-item"><small>PHONE</small><b>'+escapeHtml(c.phone || "Not provided")+'</b></div><div class="detail-item"><small>MEMBER SINCE</small><b>'+escapeHtml(date(c.created_at))+'</b></div><div class="detail-item"><small>ORDERS</small><b>'+number(data.orders.length)+'</b></div><div class="detail-item"><small>LOYALTY BALANCE</small><b>'+number(data.loyalty && data.loyalty.points_balance)+' points</b></div><div class="detail-item"><small>EMAIL VERIFIED</small><b>'+escapeHtml(c.email_verified_at?"Yes":"No")+'</b></div></div><h3 style="margin:22px 0 10px">Recent orders</h3><div class="table-wrap"><table><thead><tr><th>ORDER</th><th>DATE</th><th>STATUS</th><th>TOTAL</th></tr></thead><tbody>'+(data.orders.length?data.orders.map(o=>'<tr><td>'+escapeHtml(o.order_number)+'</td><td>'+escapeHtml(date(o.placed_at))+'</td><td>'+status(o.status)+'</td><td>'+money(o.total_minor,o.currency)+'</td></tr>').join(""):'<tr><td colspan="4" class="empty-cell">No orders linked to this account.</td></tr>')+'</tbody></table></div>';
    $("#closeCustomerDetail").addEventListener("click",()=>panel.hidden=true);
  } catch(e) { panel.innerHTML='<p class="empty-cell">'+escapeHtml(e.message)+'</p>'; }
}
async function loadOrders() {
  $("#orderRows").innerHTML='<tr><td colspan="7" class="empty-cell">Loading orders…</td></tr>';
  try {
    const query=new URLSearchParams({search:state.orderSearch,limit:String(state.limit),offset:String(state.orderOffset)});
    if(state.orderStatus) query.set("status",state.orderStatus);
    const data=await api("/admin/orders?"+query.toString());
    $("#orderRows").innerHTML=data.orders.length?data.orders.map(o=>'<tr><td><b>'+escapeHtml(o.order_number)+'</b></td><td>'+escapeHtml(o.customer_name || o.customer_email || "Guest")+'</td><td>'+escapeHtml(date(o.placed_at))+'</td><td>'+status(o.status)+'</td><td>'+status(o.payment_status)+'</td><td>'+money(o.total_minor,o.currency)+'</td><td><button class="row-action" data-order="'+escapeHtml(o.order_number)+'">Details ↗</button></td></tr>').join(""):'<tr><td colspan="7" class="empty-cell">No matching orders found.</td></tr>';
    $("#orderPageInfo").textContent=(data.pagination.total?state.orderOffset+1:0)+"–"+Math.min(state.orderOffset+state.limit,data.pagination.total)+" of "+data.pagination.total;
    $("#orderPrev").disabled=state.orderOffset===0;
    $("#orderNext").disabled=state.orderOffset+state.limit>=data.pagination.total;
    $("#orderRows").querySelectorAll("[data-order]").forEach(b=>b.addEventListener("click",()=>loadOrderDetail(b.dataset.order)));
  } catch(e) { $("#orderRows").innerHTML='<tr><td colspan="7" class="empty-cell">'+escapeHtml(e.message)+'</td></tr>'; }
}
async function loadOrderDetail(orderNumber) {
  const panel=$("#orderDetail"); panel.hidden=false; panel.innerHTML='<p class="empty-cell">Loading order…</p>';
  try {
    const data=await api("/admin/orders/"+encodeURIComponent(orderNumber));
    const o=data.order;
    let receiptActions="";
    if(o.payment_method==="bank_transfer"){
      const statusCopy={pending:"Receipt awaiting review.",approved:"Receipt approved.",rejected:"Receipt rejected. The customer can upload a replacement."};
      receiptActions='<p class="table-subline">'+(statusCopy[o.receipt_status]||"Waiting for the customer to upload a payment screenshot.")+'</p>';
      if(o.receipt_status){
        receiptActions+='<button class="row-action" id="viewTransferProof" type="button">View payment screenshot ↗</button><div id="transferProofPreview"></div>';
      }
      if(o.status==="pending_payment"&&o.receipt_status==="pending"){
        receiptActions+='<button class="row-action" id="approveTransfer" type="button">Approve payment</button><button class="row-action" id="rejectTransfer" type="button">Reject proof</button>';
      }
    }
    panel.innerHTML='<div class="detail-head"><div><p class="eyebrow">ORDER DETAILS</p><h3>'+escapeHtml(o.order_number)+'</h3><p>'+escapeHtml(o.customer_name || o.customer_email || "Guest")+'</p></div><button class="detail-close" id="closeOrderDetail">Close ×</button></div><div class="detail-grid"><div class="detail-item"><small>ORDER STATUS</small><b>'+status(o.status)+'</b></div><div class="detail-item"><small>PAYMENT STATUS</small><b>'+status(o.payment_status)+'</b></div><div class="detail-item"><small>ORDER TOTAL</small><b>'+money(o.total_minor,o.currency)+'</b></div><div class="detail-item"><small>PAYMENT METHOD</small><b>'+escapeHtml(o.payment_method||"Not recorded")+'</b></div><div class="detail-item"><small>DELIVERY CHARGE</small><b>'+(o.shipping_quote_required?"To be confirmed":money(o.shipping_minor,o.currency))+'</b></div><div class="detail-item"><small>PLACED</small><b>'+escapeHtml(date(o.placed_at))+'</b></div></div><div class="order-payment-actions">'+receiptActions+'</div><div class="order-payment-actions"><p class="table-subline">'+(o.order_number.startsWith("WAT-")?"Simulated fulfilment · no shipment or payment collection":"Order fulfilment")+'</p>'+(o.status==="pending_payment"?'<button class="row-action" data-order-status="cancelled" type="button">Cancel order</button>':o.status==="confirmed"?'<button class="row-action" data-order-status="processing" type="button">Mark processing</button><button class="row-action" data-order-status="cancelled" type="button">Cancel order</button>':o.status==="processing"?'<button class="row-action" data-order-status="shipped" type="button">Mark shipped</button><button class="row-action" data-order-status="cancelled" type="button">Cancel order</button>':o.status==="shipped"?'<button class="row-action" data-order-status="delivered" type="button">Mark delivered</button>':'<span class="table-subline">No further fulfilment actions.</span>')+'</div><h3 style="margin:22px 0 10px">Items</h3><div class="table-wrap"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>SIZE</th><th>COLOUR</th><th>QTY</th><th>LINE TOTAL</th></tr></thead><tbody>'+(data.items.length?data.items.map(i=>'<tr><td>'+escapeHtml(i.product_name_snapshot)+'</td><td>'+escapeHtml(i.sku_snapshot || "—")+'</td><td>'+escapeHtml(i.size_snapshot || "—")+'</td><td>'+escapeHtml(i.color_snapshot || "—")+'</td><td>'+number(i.quantity)+'</td><td>'+money(i.line_total_minor,o.currency)+'</td></tr>').join(""):'<tr><td colspan="6" class="empty-cell">No line items recorded.</td></tr>')+'</tbody></table></div>';
    $("#closeOrderDetail").addEventListener("click",()=>panel.hidden=true);
    const proofButton=$("#viewTransferProof");
    if(proofButton)proofButton.addEventListener("click",async()=>{
      const preview=$("#transferProofPreview");
      proofButton.disabled=true;
      preview.textContent="Loading receipt…";
      try{
        const response=await fetch(API+"/admin/orders/"+encodeURIComponent(orderNumber)+"/bank-transfer-proof",{credentials:"include"});
        if(!response.ok)throw new Error("No transfer proof is available.");
        const blob=await response.blob(),url=URL.createObjectURL(blob);
        const download=document.createElement("a");
        download.href=url;
        download.download=response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]||"payment-receipt";
        download.textContent="Download receipt";
        preview.replaceChildren(download);
        if(["image/png","image/jpeg","image/webp"].includes(blob.type)){
          const image=document.createElement("img");
          image.src=url;
          image.alt="Uploaded payment screenshot";
          image.style.display="block";
          image.style.maxWidth="100%";
          preview.prepend(image);
        }
        setTimeout(()=>URL.revokeObjectURL(url),300000);
      }catch(error){preview.textContent=error.message;}
      finally{proofButton.disabled=false;}
    });
    panel.querySelectorAll("[data-order-status]").forEach(action=>action.addEventListener("click",async()=>{const next=action.dataset.orderStatus;const promptText=next==="cancelled"?"Reason for cancelling this order:":"Operational note for this status change:";const reason=window.prompt(promptText);if(!reason||reason.trim().length<5)return;action.disabled=true;try{await api("/admin/orders/"+encodeURIComponent(orderNumber)+"/status",{method:"PATCH",body:JSON.stringify({status:next,reason:reason.trim()})});notice(next==="shipped"?"Order marked shipped. COD stock has been deducted from available inventory.":next==="cancelled"?"Order cancelled and reserved stock released.":"Order status updated.");await loadOrders();await loadOrderDetail(orderNumber);if(state.currentView==="inventory")await loadInventory();}catch(error){notice(error.message);}finally{action.disabled=false;}}));
    for(const [id,decision] of [["approveTransfer","approve"],["rejectTransfer","reject"]]){const action=$("#"+id);if(action)action.addEventListener("click",async()=>{const reason=window.prompt(decision==="approve"?"Enter the bank transaction reference or verification note:":"Enter the reason for rejecting this receipt:");if(!reason||reason.trim().length<5)return;action.disabled=true;try{await api("/admin/orders/"+encodeURIComponent(orderNumber)+"/bank-transfer-review",{method:"PATCH",body:JSON.stringify({decision,reason:reason.trim()})});notice(decision==="approve"?"Payment approved and inventory committed.":"Receipt rejected. The customer can submit a replacement.");await loadOrders();await loadOrderDetail(orderNumber);}catch(error){notice(error.message);}finally{action.disabled=false;}});}
  } catch(e) { panel.innerHTML='<p class="empty-cell">'+escapeHtml(e.message)+'</p>'; }
}
async function loadReturns(){
  const panel=$("#returnRequests");
  panel.textContent="Loading requests…";
  try{
    const {requests}=await api("/admin/returns");
    panel.innerHTML=requests.length?requests.map(item=>{
      const exchange=item.kind==="exchange";
      const editable=["owner","manager"].includes(state.admin?.role);
      const available={requested:["approve","decline"],approved:["receive"],received:["complete"]}[item.status]||[];
      const labels={approve:exchange?"Approve and create replacement":"Approve return",decline:"Decline request",receive:"Mark item received",complete:exchange?"Complete exchange":"Record simulated refund"};
      const products=item.items.map(line=>'<li>'+escapeHtml(line.name+' · '+(line.colour||"")+' '+(line.size||"")+' × '+line.quantity)+' · '+money(line.creditMinor)+'</li>').join("");
      const replacements=item.replacement_items.map(line=>'<li>'+escapeHtml(line.name+' · '+line.colour+' '+line.size+' × '+line.quantity)+' · '+money(Number(line.price_minor)*line.quantity)+'</li>').join("");
      const photos=(item.photos||[]).map(photo=>{
        const url=API+"/admin/returns/"+encodeURIComponent(item.id)+"/photos/"+encodeURIComponent(photo.id);
        const label=escapeHtml(photo.name+" · Item "+photo.unit+" · "+(photo.side==="front"?"Front":"Back"));
        return '<a href="'+escapeHtml(url)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+escapeHtml(url)+'" alt="'+label+'"><span>'+label+'</span></a>';
      }).join("");
      return '<article class="return-request"><h3>'+escapeHtml(exchange?"Exchange":"Refund")+' · '+escapeHtml(item.order_number)+'</h3><p>'+status(item.status)+' · Item credit '+money(item.credit_minor)+'</p><ul>'+products+'</ul><p>'+escapeHtml(item.reason)+'</p>'+
        (photos?'<h4>Item photos</h4><div class="return-photo-grid">'+photos+'</div>':'<p>No item photos submitted.</p>')+
        (replacements?'<h4>Replacement items</h4><ul>'+replacements+'</ul>':"")+
        (item.replacement_order_number?'<p>Replacement '+escapeHtml(item.replacement_order_number)+' · '+money(item.replacement_total_minor)+' due including '+money(item.shipping_minor)+' shipping.</p>':"")+
        (Number(item.refund_minor)>0?'<p>Refund amount: '+money(item.refund_minor)+'</p>':"")+
        (item.admin_note?'<p>'+escapeHtml(item.admin_note)+'</p>':"")+
        (editable&&available.length?'<form data-return-review="'+escapeHtml(item.id)+'"><label>Action<select name="action">'+available.map(action=>'<option value="'+action+'">'+escapeHtml(labels[action])+'</option>').join("")+'</select></label>'+
          (exchange&&item.status==="requested"?'<label data-return-shipping>Exchange shipping charge (PKR)<input name="shipping" type="number" min="0" max="10000" step="0.01" required></label>':"")+
          '<label>Note for customer<input name="note" minlength="5" maxlength="500" required></label><button class="row-action" type="submit">Save review</button><p role="status"></p></form>':"")+'</article>';
    }).join(""):"<p>No return or exchange requests yet.</p>";
    panel.querySelectorAll("[data-return-review]").forEach(form=>{
      const action=form.elements.action,shipping=form.elements.shipping;
      if(shipping)action.onchange=()=>{shipping.disabled=action.value!=="approve";shipping.closest("label").hidden=shipping.disabled;};
      form.addEventListener("submit",async event=>{
        event.preventDefault();
        const fields=new FormData(form),button=form.querySelector("button"),report=form.querySelector("[role=status]");
        button.disabled=true;
        try{
          await api("/admin/returns/"+encodeURIComponent(form.dataset.returnReview),{method:"PATCH",body:JSON.stringify({
            action:fields.get("action"),note:fields.get("note"),
            shippingMinor:fields.has("shipping")?Math.round(Number(fields.get("shipping"))*100):undefined
          })});
          await loadReturns();
          notice("Request updated.");
        }catch(error){report.textContent=error.message;button.disabled=false;}
      });
    });
  }catch(error){panel.textContent=error.message;}
}
async function loadNewsletter(){
  $("#newsletterRows").innerHTML='<tr><td colspan="3" class="empty-cell">Loading subscribers…</td></tr>';
  try {
    const query=new URLSearchParams({search:state.newsletterSearch,limit:String(state.limit),offset:String(state.newsletterOffset)});
    const data=await api("/admin/newsletter?"+query.toString());
    $("#newsletterRows").innerHTML=data.subscribers.length?data.subscribers.map(x=>'<tr><td><b>'+escapeHtml(x.email)+'</b></td><td>'+escapeHtml(date(x.consented_at))+'</td><td>'+escapeHtml(date(x.created_at))+'</td></tr>').join(""):'<tr><td colspan="3" class="empty-cell">No active subscribers found.</td></tr>';
    $("#newsletterPageInfo").textContent=(data.pagination.total?state.newsletterOffset+1:0)+"–"+Math.min(state.newsletterOffset+state.limit,data.pagination.total)+" of "+data.pagination.total;
    $("#newsletterPrev").disabled=state.newsletterOffset===0;
    $("#newsletterNext").disabled=state.newsletterOffset+state.limit>=data.pagination.total;
  } catch(e) { $("#newsletterRows").innerHTML='<tr><td colspan="3" class="empty-cell">'+escapeHtml(e.message)+'</td></tr>'; }
}
async function loadActivity() {
  $("#activityRows").innerHTML='<tr><td colspan="4" class="empty-cell">Loading activity…</td></tr>';
  try {
    const data=await api("/admin/audit-logs?limit=50&offset=0");
    $("#activityRows").innerHTML=data.auditLogs.length?data.auditLogs.map(a=>'<tr><td>'+escapeHtml(date(a.created_at))+'</td><td>'+escapeHtml(a.admin_email || "Former admin")+'</td><td>'+escapeHtml(a.action)+'</td><td>'+escapeHtml(a.reason || "—")+'</td></tr>').join(""):'<tr><td colspan="4" class="empty-cell">No administrative actions have been recorded.</td></tr>';
  } catch(e) { $("#activityRows").innerHTML='<tr><td colspan="4" class="empty-cell">'+escapeHtml(e.message)+'</td></tr>'; }
}
async function enterAdmin(admin) {
  state.admin=admin; $("#adminEmail").textContent=admin.email; $("#adminRole").textContent=admin.role.toUpperCase();
  showLogin(false); setView("overview");
  try { await loadOverview(); } catch(e) { notice(e.message); }
}
$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault(); const button=$(".login-submit"); button.disabled=true; $("#loginFeedback").textContent="Verifying credentials…";
  try { const data=await api("/admin/login",{method:"POST",body:JSON.stringify({email:$("#loginEmail").value.trim(),password:$("#loginPassword").value})}); $("#loginPassword").value=""; $("#loginFeedback").textContent=""; await enterAdmin(data.admin); }
  catch(error) { $("#loginFeedback").textContent=error.status===429?"Too many attempts. Please wait before trying again.":error.message; }
  finally { button.disabled=false; }
});
$("#logoutButton").addEventListener("click",async()=>{try{await api("/admin/logout",{method:"POST"});}catch{} state.admin=null; showLogin(true); $("#loginEmail").focus();});
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.go)));
$("#customerSearchButton").addEventListener("click",()=>{state.customerSearch=$("#customerSearch").value.trim();state.customerOffset=0;loadCustomers();});
$("#customerSearch").addEventListener("keydown",e=>{if(e.key==="Enter")$("#customerSearchButton").click();});
$("#customerPrev").addEventListener("click",()=>{state.customerOffset=Math.max(0,state.customerOffset-state.limit);loadCustomers();});
$("#customerNext").addEventListener("click",()=>{state.customerOffset+=state.limit;loadCustomers();});
$("#orderSearchButton").addEventListener("click",()=>{state.orderSearch=$("#orderSearch").value.trim();state.orderStatus=$("#orderStatus").value;state.orderOffset=0;loadOrders();});
$("#orderSearch").addEventListener("keydown",e=>{if(e.key==="Enter")$("#orderSearchButton").click();});
$("#orderPrev").addEventListener("click",()=>{state.orderOffset=Math.max(0,state.orderOffset-state.limit);loadOrders();});
$("#orderNext").addEventListener("click",()=>{state.orderOffset+=state.limit;loadOrders();});
$("#newsletterSearchButton").addEventListener("click",()=>{state.newsletterSearch=$("#newsletterSearch").value.trim();state.newsletterOffset=0;loadNewsletter();});
$("#newsletterSearch").addEventListener("keydown",e=>{if(e.key==="Enter")$("#newsletterSearchButton").click();});
$("#newsletterPrev").addEventListener("click",()=>{state.newsletterOffset=Math.max(0,state.newsletterOffset-state.limit);loadNewsletter();});
$("#newsletterNext").addEventListener("click",()=>{state.newsletterOffset+=state.limit;loadNewsletter();});
$("#refreshNewsletter").addEventListener("click",loadNewsletter);
(async()=>{try{const data=await api("/admin/me");await enterAdmin(data.admin);}catch{showLogin(true);}})();
})();