(() => {
"use strict";
const $ = (selector, root=document) => root.querySelector(selector);
const API = window.WA_API_BASE || "http://127.0.0.1:4000";
const state = {admin:null,customerOffset:0,orderOffset:0,limit:20,customerSearch:"",orderSearch:"",orderStatus:"",currentView:"overview"};
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
  const titles={overview:"Overview",customers:"Customers",orders:"Orders","activity":"Activity log"};
  $("#pageTitle").textContent=titles[name] || "Overview";
  notice("");
  if(name==="customers") loadCustomers();
  if(name==="orders") loadOrders();
  if(name==="activity") loadActivity();
}
function status(value) { const v=String(value || "unknown"); return '<span class="status '+escapeHtml(v)+'">'+escapeHtml(v.replace(/_/g," "))+'</span>'; }
async function loadOverview() {
  const [customers,orders] = await Promise.all([
    api("/admin/customers?limit=1&offset=0"),
    api("/admin/orders?limit=5&offset=0")
  ]);
  $("#metricCustomers").textContent=number(customers.pagination.total);
  $("#metricOrders").textContent=number(orders.pagination.total);
  const recent = orders.orders || [];
  $("#recentOrders").innerHTML=recent.length?recent.map(o=>'<tr><td><b>'+escapeHtml(o.order_number)+'</b></td><td>'+escapeHtml(o.customer_name || o.customer_email || "Guest")+'</td><td>'+status(o.status)+'</td><td>'+money(o.total_minor,o.currency)+'</td></tr>').join(""):'<tr><td colspan="4" class="empty-cell">No orders have been recorded yet.</td></tr>';
  $("#metricLoyalty").textContent="—";
  $("#todayStamp").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase();
}
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
    panel.innerHTML='<div class="detail-head"><div><p class="eyebrow">ORDER DETAILS</p><h3>'+escapeHtml(o.order_number)+'</h3><p>'+escapeHtml(o.customer_name || o.customer_email || "Guest")+'</p></div><button class="detail-close" id="closeOrderDetail">Close ×</button></div><div class="detail-grid"><div class="detail-item"><small>ORDER STATUS</small><b>'+status(o.status)+'</b></div><div class="detail-item"><small>PAYMENT STATUS</small><b>'+status(o.payment_status)+'</b></div><div class="detail-item"><small>ORDER TOTAL</small><b>'+money(o.total_minor,o.currency)+'</b></div><div class="detail-item"><small>PLACED</small><b>'+escapeHtml(date(o.placed_at))+'</b></div></div><h3 style="margin:22px 0 10px">Items</h3><div class="table-wrap"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>SIZE</th><th>COLOUR</th><th>QTY</th><th>LINE TOTAL</th></tr></thead><tbody>'+(data.items.length?data.items.map(i=>'<tr><td>'+escapeHtml(i.product_name_snapshot)+'</td><td>'+escapeHtml(i.sku_snapshot || "—")+'</td><td>'+escapeHtml(i.size_snapshot || "—")+'</td><td>'+escapeHtml(i.color_snapshot || "—")+'</td><td>'+number(i.quantity)+'</td><td>'+money(i.line_total_minor,o.currency)+'</td></tr>').join(""):'<tr><td colspan="6" class="empty-cell">No line items recorded.</td></tr>')+'</tbody></table></div>';
    $("#closeOrderDetail").addEventListener("click",()=>panel.hidden=true);
  } catch(e) { panel.innerHTML='<p class="empty-cell">'+escapeHtml(e.message)+'</p>'; }
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
(async()=>{try{const data=await api("/admin/me");await enterAdmin(data.admin);}catch{showLogin(true);}})();
})();