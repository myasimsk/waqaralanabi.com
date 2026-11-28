(() => {
  "use strict";
  const $ = (selector, root=document) => root.querySelector(selector);
  const API = window.WA_API_BASE || ((location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "http://127.0.0.1:4000" : "/api");
  let previewClaim=null;
  let previewEnabled=false;
  const state = { customer:null, active:"profile", orders:[], addresses:[], loyalty:null, busy:false };
  const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = (minor, currency="PKR") => {
    try { return new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(Number(minor||0)/100); }
    catch { return currency+" "+(Number(minor||0)/100).toFixed(2); }
  };
  const date = value => value ? new Date(value).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}) : "—";
  async function api(path, options={}) {
    const response = await fetch(API+path,{credentials:"include",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
    const body = await response.json().catch(()=>({}));
    if (!response.ok) { const error=new Error(body.message||body.error||"We couldn't complete that request."); error.status=response.status; throw error; }
    return body;
  }
  const root=document.createElement("div");
  root.id="waAccountRoot";
  root.innerHTML='<div class="wa-account-backdrop" data-account-close></div><section class="wa-account-panel" role="dialog" aria-modal="true" aria-labelledby="waAccountTitle" aria-hidden="true"><header class="wa-account-head"><div><p class="eyebrow">YOUR WA WORLD</p><h2 id="waAccountTitle">My account</h2></div><div class="wa-account-head-actions"><button type="button" class="wa-account-signout" id="waSignOut" hidden>Sign out</button><button type="button" class="wa-account-close" aria-label="Close account" data-account-close>×</button></div></header><div class="wa-account-preview" id="waAccountNotice">YOUR WA ACCOUNT · SECURE CUSTOMER ACCESS</div><div class="wa-account-layout"><nav class="wa-account-tabs" id="waAccountTabs" aria-label="Account sections" hidden><button type="button" data-tab="profile">Profile</button><button type="button" data-tab="orders">Orders</button><button type="button" data-tab="addresses">Addresses</button><button type="button" data-tab="loyalty">Loyalty</button><button type="button" data-tab="returns" hidden>Returns &amp; exchanges</button></nav><div class="wa-account-content" id="waAccountContent" aria-live="polite"></div></div></section>';
  document.body.appendChild(root);
  const panel=$(".wa-account-panel",root), content=$("#waAccountContent",root), tabs=$("#waAccountTabs",root);
  function feedback(message,kind="") { const el=$("#waAccountFeedback",content); if(el){el.textContent=message;el.className="wa-account-feedback"+(kind?" "+kind:"");} }
  function authScreen(mode="login",message="") {
    state.customer=null; tabs.hidden=true; $("#waSignOut",root).hidden=true;
    $("#waAccountTitle",root).textContent="Your WA Account";
    const login=mode==="login";
    const register=mode==="register";
    const verify=mode==="verify";
    const reset=mode==="reset";
    let body="";
    if(mode==="preview" && previewClaim){
      body='<p class="eyebrow">PREVIEW ACCOUNT</p><h3>Create your account.</h3><p class="wa-account-muted">Register with your completed test order. Use a synthetic account name and a password dedicated to this preview.</p><form id="waPreviewRegisterForm" class="wa-account-form"><label>Test order email<input type="email" disabled value="'+safe(previewClaim.email)+'"></label><label>Full name<input name="fullName" maxlength="120" required></label><label>Create password<input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><button class="wa-account-primary" type="submit">Create preview account ↗</button></form><div class="wa-account-auth-links"><button type="button" data-auth="login">Back to sign in</button></div>';
    }
    if(login) body='<p class="eyebrow">WELCOME BACK</p><h3>Sign in.</h3><p class="wa-account-muted">Access your orders, personal details and saved delivery addresses.</p><form id="waLoginForm" class="wa-account-form"><label>Email address<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="wa-account-primary" type="submit">Sign in ↗</button></form><div class="wa-account-auth-links"><button type="button" data-auth="register">Create an account after your first order</button><button type="button" data-auth="reset">Forgot password?</button></div>';
    if(register) body='<p class="eyebrow">FIRST ORDER, THEN YOUR WA ACCOUNT</p><h3>Create your account.</h3><p class="wa-account-muted">Use the order number and email address from your first purchase. We will verify that you own the email before creating your account.</p><form id="waRegisterForm" class="wa-account-form"><label>Order number<input name="orderNumber" autocomplete="off" placeholder="Your order number" required></label><label>Order email address<input name="email" type="email" autocomplete="email" placeholder="Email used at checkout" required></label><button class="wa-account-primary" type="submit">Send verification code ↗</button></form><div class="wa-account-auth-links"><button type="button" data-auth="login">Already have an account? Sign in</button></div>';
    if(verify) body='<p class="eyebrow">EMAIL VERIFICATION</p><h3>Check your inbox.</h3><p class="wa-account-muted">Enter the six-digit code sent to your order email, then choose your account name and password.</p><form id="waVerifyForm" class="wa-account-form"><label>Verification code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label><label>Full name<input name="fullName" autocomplete="name" required></label><label>Create password<input name="password" type="password" minlength="12" autocomplete="new-password" required><small>Use at least 12 characters.</small></label><button class="wa-account-primary" type="submit">Create account ↗</button></form><div class="wa-account-auth-links"><button type="button" data-auth="register">Back to order details</button></div>';
    if(reset) body='<p class="eyebrow">ACCOUNT RECOVERY</p><h3>Reset password.</h3><p class="wa-account-muted">Request a verification code using your account email, then choose a new password.</p><form id="waResetRequestForm" class="wa-account-form"><label>Email address<input name="email" type="email" autocomplete="email" required></label><button class="wa-account-primary" type="submit">Send reset code ↗</button></form><form id="waResetCompleteForm" class="wa-account-form wa-account-reset-complete"><label>Six-digit code<input name="code" inputmode="numeric" maxlength="6" required></label><label>New password<input name="newPassword" type="password" minlength="12" autocomplete="new-password" required></label><button class="wa-account-primary" type="submit">Update password ↗</button></form><div class="wa-account-auth-links"><button type="button" data-auth="login">Back to sign in</button></div>';
    if(previewEnabled && login){
      body=body.replace('<button type="button" data-auth="register">Create an account after your first order</button><button type="button" data-auth="reset">Forgot password?</button>',previewClaim?'<button type="button" data-auth="preview">Create an account from your test order</button>':'<p class="wa-account-muted">Place a test order to create a preview account. Use a unique example.test email for each new account.</p>');
    }
    content.innerHTML=body+'<p class="wa-account-feedback" id="waAccountFeedback" role="status">'+safe(message)+'</p><p class="wa-account-security">Your account details are securely stored with WA. Never share your password or verification code.</p>';
    content.querySelectorAll("[data-auth]").forEach(button=>button.addEventListener("click",()=>authScreen(button.dataset.auth)));
    const previewForm=$("#waPreviewRegisterForm",content);
    if(previewForm)previewForm.addEventListener("submit",async event=>{
      event.preventDefault();
      const fields=new FormData(previewForm), claim=previewClaim;
      await run(async()=>{
        const password=fields.get("password");
        await api("/auth/register/preview",{method:"POST",body:JSON.stringify({...claim,fullName:fields.get("fullName"),password})});
        previewClaim=null;
        await api("/auth/login",{method:"POST",body:JSON.stringify({email:claim.email,password})});
        state.active="orders";
        await loadAccount();
      });
    });
    const loginForm=$("#waLoginForm",content);
    if(loginForm) loginForm.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(loginForm);await run(async()=>{const result=await api("/auth/login",{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password")})});state.customer=result.customer;await loadAccount();});});
    const registerForm=$("#waRegisterForm",content);
    if(registerForm) registerForm.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(registerForm);await run(async()=>{await api("/auth/register/request-code",{method:"POST",body:JSON.stringify({orderNumber:f.get("orderNumber"),email:f.get("email")})});state.registration={orderNumber:String(f.get("orderNumber")).trim(),email:String(f.get("email")).trim()};authScreen("verify","If the order is eligible, a code has been generated for its email address. In this local development preview, check the backend terminal for the development-only code.");});});
    const verifyForm=$("#waVerifyForm",content);
    if(verifyForm) verifyForm.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(verifyForm);await run(async()=>{await api("/auth/register/complete",{method:"POST",body:JSON.stringify({...state.registration,code:f.get("code"),fullName:f.get("fullName"),password:f.get("password")})});const result=await api("/auth/login",{method:"POST",body:JSON.stringify({email:state.registration.email,password:f.get("password")})});state.customer=result.customer;await loadAccount();});});
    const resetRequest=$("#waResetRequestForm",content);
    if(resetRequest) resetRequest.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(resetRequest);await run(async()=>{await api("/auth/password/request-reset-code",{method:"POST",body:JSON.stringify({email:f.get("email")})});$("#waResetCompleteForm",content).dataset.email=String(f.get("email"));feedback("If an active account exists, a reset code has been generated. Check the backend terminal in this local development preview.");});});
    const resetComplete=$("#waResetCompleteForm",content);
    if(resetComplete) resetComplete.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(resetComplete);await run(async()=>{await api("/auth/password/complete-reset",{method:"POST",body:JSON.stringify({email:resetComplete.dataset.email,code:f.get("code"),newPassword:f.get("newPassword")})});authScreen("login","Password updated. Please sign in with your new password.");});});
  }
  async function run(task) {
    if(state.busy)return;state.busy=true;
    const buttons=content.querySelectorAll("button[type=submit]");buttons.forEach(b=>{b.disabled=true;b.dataset.oldText=b.textContent;b.textContent="Please wait…";});
    try{await task();}catch(error){feedback(error.message,"error");}
    finally{state.busy=false;buttons.forEach(b=>{b.disabled=false;if(b.dataset.oldText)b.textContent=b.dataset.oldText;});}
  }
  async function loadAccount() {
    const [profile,orders,addresses,loyalty]=await Promise.all([
      api("/account/profile"),api("/account/orders?limit=50&offset=0"),api("/account/addresses"),api("/account/loyalty")
    ]);
    state.customer=profile.customer;state.orders=orders.orders||[];state.addresses=addresses.addresses||[];state.loyalty=loyalty.loyalty;
    renderAccount();
  }
  function renderAccount() {
    tabs.hidden=false;$("#waSignOut",root).hidden=false;
    $('[data-tab="returns"]',root).hidden=!previewEnabled;
    tabs.classList.toggle("has-returns",previewEnabled);
    $("#waAccountTitle",root).textContent=(state.customer.fullName||"Your")+"’s WA Account";
    $("#waAccountNotice",root).textContent="SIGNED IN · YOUR DETAILS ARE PRIVATE TO YOUR ACCOUNT";
    root.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===state.active));
    if(state.active==="profile") renderProfile();
    else if(state.active==="orders") renderOrders();
    else if(state.active==="addresses") renderAddresses();
    else if(state.active==="returns")void renderReturns();
    else renderLoyalty();
  }
  function renderProfile() {
    const c=state.customer;
    content.innerHTML='<p class="eyebrow">ACCOUNT DETAILS</p><h3>Your details.</h3><p class="wa-account-muted">Keep your contact information up to date for a smoother experience.</p><form id="waProfileForm" class="wa-account-form"><label>Full name<input name="fullName" autocomplete="name" value="'+safe(c.fullName)+'" required></label><label>Email address<input value="'+safe(c.email)+'" type="email" disabled><small>Email changes require a separate verification process.</small></label><label>Phone number<input name="phone" type="tel" autocomplete="tel" value="'+safe(c.phone||"")+'" placeholder="+92 3XX XXXXXXX"></label><button class="wa-account-primary" type="submit">Save details ↗</button></form><p class="wa-account-feedback" id="waAccountFeedback" role="status"></p><p class="wa-account-security">Member since '+safe(date(c.memberSince))+'. '+(c.emailVerifiedAt?'Your email address is verified.':'Email verification is pending.')+'</p>';
    $("#waProfileForm",content).addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await run(async()=>{const result=await api("/account/profile",{method:"PATCH",body:JSON.stringify({fullName:f.get("fullName"),phone:f.get("phone")||null})});state.customer={...state.customer,...result.customer};renderProfile();feedback("Your details have been updated.");});});
  }
  function renderOrders() {
    const steps=[["confirmed","Confirmed"],["processing","Preparing"],["shipped","Shipped"],["delivered","Delivered"]];
    const html=state.orders.length?state.orders.map(o=>{
      const current=steps.findIndex(s=>s[0]===o.status);
      const cancelled=o.status==="cancelled";
      const progress=cancelled?'<p class="wa-order-cancelled">This order was cancelled. Contact WA if you need assistance.</p>':
        '<ol class="wa-order-progress" aria-label="Order progress">'+steps.map((step,index)=>'<li class="'+(current>=index?"is-complete":current===index-1?"is-current":"")+'"><span class="wa-order-step-dot" aria-hidden="true"></span><span>'+step[1]+'</span></li>').join("")+'</ol>'+
        (o.status==="pending_payment"?'<p class="wa-order-pending">Awaiting payment confirmation. Your order will move into fulfilment once payment is confirmed.</p>':"");
      const subject=encodeURIComponent("Help with order "+o.order_number);
      let receipt="";
      if(o.payment_method==="bank_transfer"&&o.status==="pending_payment"){
        if(o.receipt_status==="pending")receipt='<p class="wa-order-pending">Receipt uploaded. Awaiting admin review.</p>';
        else receipt='<form class="wa-account-form" data-transfer-order="'+safe(o.order_number)+'"><p class="wa-order-pending">'+(o.receipt_status==="rejected"?"The receipt was rejected. You can upload a replacement.":"Upload a payment screenshot for admin review.")+'</p><label>Payment screenshot<input type="file" name="receipt" accept="image/png,image/jpeg,image/webp,application/pdf" required></label><button class="wa-account-primary" type="submit">Upload receipt</button><p role="status" aria-live="polite"></p></form>';
      }
      return '<article class="wa-account-order"><div class="wa-account-order-head"><div><b>'+safe(o.order_number)+'</b><small>'+safe(date(o.placed_at))+'</small></div><span class="wa-account-status">'+safe(String(o.status).replace(/_/g," "))+'</span></div>'+progress+receipt+'<div class="wa-account-order-lines">'+(o.items||[]).map(i=>'<div><span>'+safe(i.productName)+' · '+safe(i.color||"")+' / '+safe(i.size||"")+' × '+safe(i.quantity)+'</span><b>'+money(i.lineTotalMinor,o.currency)+'</b></div>').join("")+'</div><div class="wa-account-order-total"><span>'+safe(String(o.payment_status||"pending").replace(/_/g," "))+'</span><b>'+money(o.total_minor,o.currency)+'</b></div><a class="wa-order-help" href="mailto:info@waqaralanabi.com?subject='+subject+'">NEED HELP WITH THIS ORDER? ↗</a></article>';
    }).join(""):'<div class="wa-account-empty"><span>WA / 00</span><h4>Your first order is waiting.</h4><p>Once you place an order, its details and updates will appear here.</p></div>';
    content.innerHTML='<p class="eyebrow">YOUR PURCHASES</p><h3>Order history.</h3><p class="wa-account-muted">Follow each order from confirmation to delivery. Status updates appear here when WA processes your order.</p><div class="wa-account-orders">'+html+'</div>';
    content.querySelectorAll("[data-transfer-order]").forEach(form=>form.addEventListener("submit",async event=>{
      event.preventDefault();
      const button=form.querySelector("button"), message=form.querySelector("[role=status]");
      button.disabled=true;
      message.textContent="Uploading receipt…";
      try{
        await window.WAUploadTransferReceipt(form.dataset.transferOrder,form.elements.receipt.files[0]);
        state.orders=(await api("/account/orders?limit=50&offset=0")).orders;
        if(state.active==="orders")renderOrders();
      }catch(error){
        message.textContent=error.message;
        button.disabled=false;
      }
    }));
  }
  function renderAddresses() {
    const list=state.addresses.length?state.addresses.map(a=>'<article class="wa-address-card"><div><b>'+safe(a.label||"Delivery address")+(a.is_default?' <span class="wa-address-default">DEFAULT</span>':'')+'</b><p>'+safe(a.recipient_name)+' · '+safe(a.phone||"")+'<br>'+safe(a.address_line_1)+' '+safe(a.address_line_2||"")+'<br>'+safe(a.city)+' '+safe(a.region||"")+' '+safe(a.postal_code||"")+' · '+safe(a.country_code)+'</p><div class="wa-address-actions">'+(!a.is_default?'<button type="button" data-default-address="'+safe(a.id)+'">Make default</button>':'')+'<button type="button" data-delete-address="'+safe(a.id)+'">Remove</button></div></div></article>').join(""):'<p class="wa-account-empty-note">No saved addresses yet.</p>';
    content.innerHTML='<p class="eyebrow">DELIVERY DETAILS</p><h3>Saved addresses.</h3><p class="wa-account-muted">Manage the places where your WA orders are delivered.</p><form id="waAddressForm" class="wa-account-form"><label>Address label<input name="label" placeholder="Home, Work…" maxlength="40"></label><label>Recipient name<input name="recipientName" autocomplete="name" required></label><label>Phone number<input name="phone" type="tel" required></label><label>Address line 1<input name="addressLine1" autocomplete="address-line1" required></label><label>Address line 2<input name="addressLine2" autocomplete="address-line2"></label><div class="wa-account-two"><label>City<input name="city" autocomplete="address-level2" required></label><label>Region / province<input name="region" autocomplete="address-level1"></label></div><div class="wa-account-two"><label>Postcode<input name="postalCode" autocomplete="postal-code"></label><label>Country code<input name="countryCode" value="PK" maxlength="2" required></label></div><label class="wa-account-check"><input type="checkbox" name="isDefault"> Set as default address</label><button class="wa-account-primary" type="submit">Save address ↗</button></form><div class="wa-address-list">'+list+'</div><p class="wa-account-feedback" id="waAccountFeedback" role="status"></p>';
    $("#waAddressForm",content).addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await run(async()=>{await api("/account/addresses",{method:"POST",body:JSON.stringify({label:f.get("label")||null,recipientName:f.get("recipientName"),phone:f.get("phone"),addressLine1:f.get("addressLine1"),addressLine2:f.get("addressLine2")||null,city:f.get("city"),region:f.get("region")||null,postalCode:f.get("postalCode")||null,countryCode:f.get("countryCode"),isDefault:f.get("isDefault")==="on"})});state.addresses=(await api("/account/addresses")).addresses;renderAddresses();feedback("Address saved successfully.");});});
    content.querySelectorAll("[data-delete-address]").forEach(b=>b.addEventListener("click",async()=>run(async()=>{await api("/account/addresses/"+encodeURIComponent(b.dataset.deleteAddress),{method:"DELETE"});state.addresses=(await api("/account/addresses")).addresses;renderAddresses();feedback("Address removed.");})));
    content.querySelectorAll("[data-default-address]").forEach(b=>b.addEventListener("click",async()=>run(async()=>{await api("/account/addresses/"+encodeURIComponent(b.dataset.defaultAddress)+"/default",{method:"POST"});state.addresses=(await api("/account/addresses")).addresses;renderAddresses();feedback("Default address updated.");})));
  }
  function renderLoyalty() {
    const l=state.loyalty||{};
    content.innerHTML='<p class="eyebrow">WA REWARDS</p><h3>Your loyalty.</h3><div class="wa-account-loyalty"><span>POINTS BALANCE</span><strong>'+safe(l.balance||"0")+'</strong><p>Lifetime earned: '+safe(l.lifetimeEarned||"0")+'</p></div><div class="wa-account-loyalty-grid"><div><small>Pending</small><b>'+safe(l.pendingPoints||"0")+'</b></div><div><small>Available earned</small><b>'+safe(l.availableEarned||"0")+'</b></div><div><small>Redeemed</small><b>'+safe(l.redeemedPoints||"0")+'</b></div><div><small>Expired</small><b>'+safe(l.expiredPoints||"0")+'</b></div></div><p class="wa-account-security">'+(previewEnabled?'Preview rewards earn one test point per PKR 100 when a linked order is marked delivered.':'The WA loyalty programme is not active yet.')+'</p>';
  }
  function showPanel(){
    root.classList.add("open");panel.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";
  }
  document.addEventListener("wa-preview-order",event=>{previewClaim=event.detail;previewEnabled=true;});
  document.addEventListener("wa-preview-account",event=>{
    previewClaim=event.detail;previewEnabled=true;showPanel();authScreen("preview");
  });
  async function renderReturns(){
    content.innerHTML='<h3>Returns & exchanges</h3><p role="status">Loading eligible orders…</p>';
    try{
      const data=await api("/account/returns");
      if(state.active!=="returns")return;
      const {orders,requests}=data;
      const requestDetails=requests.map(item=>{
        const products=item.items.map(line=>safe(line.name)+" × "+safe(line.quantity)).join(", ");
        const payment=item.replacement_order_number
          ? '<p>Replacement '+safe(item.replacement_order_number)+' · '+money(item.replacement_total_minor)+' due, including '+money(item.shipping_minor)+' exchange shipping.</p>'
          : "";
        const refund=Number(item.refund_minor)>0?'<p>'+ (item.status==="completed"?"Refund recorded: ":"Refund amount: ")+money(item.refund_minor)+'</p>':"";
        return '<article class="wa-account-order"><b>'+safe(item.kind==="refund"?"Refund":"Exchange")+' · '+safe(item.order_number)+'</b><p>'+products+'</p><p>'+safe(item.status)+' · '+money(item.credit_minor)+' item credit</p>'+payment+refund+(item.admin_note?'<p>'+safe(item.admin_note)+'</p>':"")+'</article>';
      }).join("");
      content.innerHTML='<h3>Returns & exchanges</h3><p class="wa-account-muted">Select the items you want to return within 7 days of delivery. Refunds are processed within 7–10 days after WA receives and checks the item.</p>'+
        (orders.length?'<label>Choose an order<select id="waReturnOrder">'+orders.map(order=>'<option value="'+safe(order.id)+'">'+safe(order.order_number)+' · Delivered '+safe(date(order.delivered_at))+'</option>').join("")+'</select></label><div id="waReturnEditor"></div>':'<p>No delivered, paid orders are eligible right now.</p>')+
        (requestDetails?'<h4>Your requests</h4>'+requestDetails:"");
      if(!orders.length)return;
      const picker=$("#waReturnOrder",content);
      const editor=$("#waReturnEditor",content);
      let catalogue=null;
      async function edit(){
        const order=orders.find(item=>item.id===picker.value);
        if(!order)return;
        const requestId=crypto.randomUUID?.()??Array.from(crypto.getRandomValues(new Uint8Array(16)),(byte,index)=>
          ((index===6?(byte&15)|64:index===8?(byte&63)|128:byte).toString(16).padStart(2,"0"))
        ).join("").replace(/^(........)(....)(....)(....)/,"$1-$2-$3-$4-");
        editor.innerHTML='<form class="wa-account-form" id="waReturnForm"><fieldset><legend>Items to send back</legend>'+order.items.map(item=>'<label>'+safe(item.name)+' · '+safe(item.colour||"")+' '+safe(item.size||"")+'<select data-return-item="'+safe(item.id)+'" aria-label="'+safe(item.name+' '+(item.colour||"")+' '+(item.size||"")+' quantity')+'">'+Array.from({length:Math.min(item.remainingQuantity,10)+1},(_,i)=>'<option value="'+i+'">'+(i===0?"Keep this item":"Return "+i)+'</option>').join("")+'</select></label>').join("")+'</fieldset><fieldset id="waReturnPhotos" hidden><legend>Item photos</legend><p>Upload a clear front and back photo for each selected item. Show the original tags in the photos. Use JPG, PNG or WebP, up to 2 MB each and 5 MB total.</p><div data-photo-fields></div></fieldset><label>Request type<select name="kind"><option value="refund">Return for a refund</option><option value="exchange">Exchange for another product</option></select></label><div id="waReplacement" hidden></div><label>Reason<textarea name="reason" minlength="3" maxlength="500" required></textarea></label><label class="wa-account-check"><input type="checkbox" name="condition" required> The selected items are unused and unwashed, with all original tags attached.</label><div id="waReturnEstimate" aria-live="polite"></div><button class="wa-account-primary" type="submit">Submit request ↗</button><p id="waAccountFeedback" role="status"></p></form>';
        const form=$("#waReturnForm",editor), replacement=$("#waReplacement",form);
        const selectedItems=()=>Array.from(form.querySelectorAll("[data-return-item]")).map(field=>({id:field.dataset.returnItem,quantity:Number(field.value)})).filter(item=>item.quantity>0);
        const photoSection=$("#waReturnPhotos",form), photoFields=photoSection.querySelector("[data-photo-fields]");
        function syncPhotos(){
          const active=new Set();
          for(const line of selectedItems()){
            const item=order.items.find(item=>item.id===line.id);
            for(let unit=1;unit<=line.quantity;unit++){
              const key=line.id+"-"+unit;
              active.add(key);
              if(photoFields.querySelector('[data-photo-key="'+key+'"]'))continue;
              const row=document.createElement("div");
              row.dataset.photoKey=key;
              row.className="wa-return-replacement";
              row.innerHTML='<b>'+safe([item.name,item.colour,item.size].filter(Boolean).join(" · "))+' · Item '+unit+'</b>'+["front","back"].map(side=>'<label>'+ (side==="front"?"Front photo":"Back photo")+'<input type="file" data-side="'+side+'" accept="image/jpeg,image/png,image/webp" required></label>').join("");
              photoFields.append(row);
            }
          }
          for(const row of photoFields.children.length?[...photoFields.children]:[]){
            if(!active.has(row.dataset.photoKey))row.remove();
          }
          photoSection.hidden=active.size===0;
        }
        async function itemsWithPhotos(){
          const items=selectedItems();
          if(!items.length)throw new Error("Select at least one item.");
          const inputs=[...photoFields.querySelectorAll("input")];
          const files=inputs.map(input=>input.files[0]);
          if(files.some(file=>!file||!["image/jpeg","image/png","image/webp"].includes(file.type)||!file.size||file.size>2*1024*1024)){
            throw new Error("Choose a JPG, PNG or WebP file up to 2 MB for every front and back photo.");
          }
          if(files.reduce((total,file)=>total+file.size,0)>5*1024*1024)throw new Error("Your photos must be 5 MB or less in total.");
          const read=file=>new Promise((resolve,reject)=>{
            const reader=new FileReader();
            reader.onload=()=>resolve({mime:file.type,data:String(reader.result).split(",")[1]});
            reader.onerror=()=>reject(new Error("Could not read a photo. Please choose it again."));
            reader.readAsDataURL(file);
          });
          return Promise.all(items.map(async item=>({...item,photos:await Promise.all(
            Array.from({length:item.quantity},async (_,index)=>{
              const row=photoFields.querySelector('[data-photo-key="'+item.id+'-'+(index+1)+'"]');
              const [front,back]=await Promise.all(["front","back"].map(side=>read(row.querySelector('[data-side="'+side+'"]').files[0])));
              return {front,back};
            })
          )})));
        }
        const chosenReplacement=()=>Array.from(replacement.querySelectorAll("[data-replacement-row]")).map(row=>({
          id:row.querySelector("select").value,quantity:Number(row.querySelector("input").value)
        })).filter(row=>row.id);
        const options=()=>catalogue.flatMap(product=>product.variants.filter(variant=>variant.available).map(variant=>({id:variant.id,name:product.name,colour:variant.colour,size:variant.size,price:Number(product.price_minor)})));
        function estimate(){
          const credit=selectedItems().reduce((sum,line)=>{
            const item=order.items.find(item=>item.id===line.id);
            return sum+Math.floor(Number(item.remainingMinor)*line.quantity/item.remainingQuantity);
          },0);
          let summary="Selected item credit: "+money(credit);
          if(form.elements.kind.value==="exchange"){
            const chosen=chosenReplacement();
            if(!chosen.length){
              $("#waReturnEstimate",form).textContent=summary+" · Choose a replacement to see the difference.";
              return;
            }
            const subtotal=chosen.reduce((sum,line)=>sum+(options().find(item=>item.id===line.id)?.price||0)*line.quantity,0);
            summary+=" · Replacement total: "+money(subtotal)+" · Difference: "+money(Math.max(0,subtotal-credit))+" before exchange shipping.";
            if(credit>subtotal)summary+=" Remaining credit for refund: "+money(credit-subtotal)+".";
          }
          $("#waReturnEstimate",form).textContent=summary;
        }
        function addReplacement(){
          const row=document.createElement("div");
          row.className="wa-return-replacement";
          row.dataset.replacementRow="";
          row.innerHTML='<label>Replacement option<select required><option value="">Choose a size and colour</option>'+options().map(item=>'<option value="'+safe(item.id)+'">'+safe(item.name+' · '+item.colour+' · '+item.size)+' · '+money(item.price)+'</option>').join("")+'</select></label><label>Quantity<input type="number" min="1" max="10" value="1" required></label><button type="button">Remove</button>';
          replacement.insertBefore(row,replacement.querySelector("[data-add-replacement]"));
          row.querySelector("button").onclick=()=>{row.remove();estimate();};
          estimate();
        }
        async function showReplacement(){
          const exchange=form.elements.kind.value==="exchange";
          replacement.hidden=!exchange;
          if(!exchange){replacement.innerHTML="";estimate();return;}
          if(!replacement.children.length){
            replacement.textContent="Loading replacement products…";
            try{catalogue??=(await api("/catalog")).products;}
            catch(error){replacement.textContent=error.message;return;}
            if(form.elements.kind.value!=="exchange")return;
            replacement.innerHTML='<p>Choose the products for your replacement order. WA will confirm stock and the courier charge before approval.</p><button type="button" data-add-replacement>Add another product</button>';
            replacement.querySelector("button").onclick=addReplacement;
            addReplacement();
          }
        }
        form.addEventListener("input",event=>{
          if(event.target.matches("[data-return-item]"))syncPhotos();
          estimate();
        });
        form.elements.kind.addEventListener("change",()=>void showReplacement());
        form.addEventListener("submit",async event=>{
          event.preventDefault();
          const fields=new FormData(form);
          await run(async()=>{
            await api("/account/returns",{method:"POST",body:JSON.stringify({
              requestId,orderId:order.id,kind:fields.get("kind"),reason:fields.get("reason"),
              eligibleCondition:fields.get("condition")==="on",items:await itemsWithPhotos(),
              replacement:fields.get("kind")==="exchange"?chosenReplacement():[],
            })});
            await renderReturns();
          });
        });
        estimate();
      }
      picker.addEventListener("change",()=>void edit());
      void edit();
    }catch(error){
      if(state.active==="returns")content.innerHTML='<h3>Returns & exchanges</h3><p role="status">'+safe(error.message)+'</p>';
    }
  }
  async function open() {
    showPanel();
    const config=await api("/checkout/config").catch(()=>null);
    previewEnabled=Boolean(config?.previewOrdersEnabled);
    try{const result=await api("/auth/me");state.customer=result.customer;await loadAccount();}
    catch(error){if(error.status===401)authScreen("login");else authScreen("login","Account service is currently unavailable. Please try again.");}
  }
  function close(){root.classList.remove("open");panel.setAttribute("aria-hidden","true");document.body.style.overflow="";}
  root.querySelectorAll("[data-account-close]").forEach(b=>b.addEventListener("click",close));
  root.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{state.active=b.dataset.tab;renderAccount();}));
  $("#waSignOut",root).addEventListener("click",async()=>{try{await api("/auth/logout",{method:"POST"});}catch{}state.customer=null;state.orders=[];state.addresses=[];authScreen("login","You have been signed out.");});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&root.classList.contains("open"))close();});
  const headerActions=document.querySelector(".header-actions");
  if(headerActions){const button=document.createElement("button");button.type="button";button.className="wa-account-trigger";button.textContent="Account";button.setAttribute("aria-label","Open customer account");button.addEventListener("click",open);headerActions.insertBefore(button,headerActions.firstChild);}
  const mobileNav=document.querySelector(".mobile-app-nav");
  if(mobileNav){const button=document.createElement("button");button.type="button";button.className="app-nav-item wa-mobile-account";button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21c.5-4.1 3.2-6.2 7.5-6.2"/></svg><span>Account</span>';button.addEventListener("click",open);mobileNav.appendChild(button);}
})();
