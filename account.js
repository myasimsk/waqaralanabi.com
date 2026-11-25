(() => {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  const KEY = "wa-customer-preview";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {profile:{name:"",email:"",phone:""},addresses:[],active:"profile"}; } catch { return {profile:{name:"",email:"",phone:""},addresses:[],active:"profile"}; } };
  let data = read();
  const save = () => localStorage.setItem(KEY, JSON.stringify(data));
  const safe = value => String(value || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const root = document.createElement("div");
  root.id = "waAccountRoot";
  root.innerHTML = '<div class="wa-account-backdrop" data-account-close></div><section class="wa-account-panel" role="dialog" aria-modal="true" aria-labelledby="waAccountTitle" aria-hidden="true"><header class="wa-account-head"><div><p class="eyebrow">YOUR WA WORLD</p><h2 id="waAccountTitle">My account</h2></div><button type="button" class="wa-account-close" aria-label="Close account" data-account-close>×</button></header><div class="wa-account-preview">PREVIEW EXPERIENCE · ACCOUNT DATA IS SAVED ONLY IN THIS BROWSER</div><div class="wa-account-layout"><nav class="wa-account-tabs" aria-label="Account sections"><button type="button" data-tab="profile">Profile</button><button type="button" data-tab="orders">Orders</button><button type="button" data-tab="addresses">Addresses</button></nav><div class="wa-account-content" id="waAccountContent"></div></div></section>';
  document.body.appendChild(root);
  const panel = $(".wa-account-panel", root), content = $("#waAccountContent", root);
  const render = () => {
    root.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === data.active));
    if (data.active === "profile") {
      content.innerHTML = '<p class="eyebrow">ACCOUNT DETAILS</p><h3>Your details.</h3><p class="wa-account-muted">Keep your contact information up to date for a smoother experience.</p><form id="waProfileForm" class="wa-account-form"><label>Full name<input name="name" autocomplete="name" value="'+safe(data.profile.name)+'" placeholder="Your full name" required></label><label>Email address<input name="email" type="email" autocomplete="email" value="'+safe(data.profile.email)+'" placeholder="you@example.com" required></label><label>Phone number<input name="phone" type="tel" autocomplete="tel" value="'+safe(data.profile.phone)+'" placeholder="+92 3XX XXXXXXX"></label><button class="wa-account-primary" type="submit">Save details ↗</button><p class="wa-account-feedback" id="waProfileFeedback" aria-live="polite"></p></form><p class="wa-account-security">This preview does not create a secure login or store passwords. Real customer authentication will be connected before launch.</p>';
      $("#waProfileForm",content).addEventListener("submit", e => { e.preventDefault(); const f=new FormData(e.currentTarget); data.profile={name:f.get("name").trim(),email:f.get("email").trim(),phone:f.get("phone").trim()}; save(); $("#waProfileFeedback",content).textContent="Your details have been saved on this device."; });
    } else if (data.active === "orders") {
      content.innerHTML = '<p class="eyebrow">YOUR PURCHASES</p><h3>Order history.</h3><div class="wa-account-empty"><span>WA / 00</span><h4>Your first order is waiting.</h4><p>Once online ordering launches, confirmed purchases and delivery updates will appear here.</p><small>No real orders are connected in this preview.</small></div>';
    } else {
      content.innerHTML = '<p class="eyebrow">DELIVERY DETAILS</p><h3>Saved addresses.</h3><p class="wa-account-muted">Add an address to see how delivery details will be managed.</p><form id="waAddressForm" class="wa-account-form"><label>Address label<input name="label" placeholder="Home, Work…" required></label><label>Full delivery address<textarea name="address" rows="3" placeholder="House, street, area" required></textarea></label><div class="wa-account-two"><label>City<input name="city" placeholder="City" required></label><label>Postcode<input name="postcode" placeholder="Postcode"></label></div><button class="wa-account-primary" type="submit">Add address ↗</button></form><div class="wa-address-list">'+(data.addresses.length?data.addresses.map((a,i)=>'<article class="wa-address-card"><div><b>'+safe(a.label)+'</b><p>'+safe(a.address)+'<br>'+safe(a.city)+' '+safe(a.postcode)+'</p></div><button type="button" data-delete-address="'+i+'" aria-label="Delete '+safe(a.label)+' address">Remove</button></article>').join(""):'<p class="wa-account-empty-note">No saved addresses yet.</p>')+'</div>';
      $("#waAddressForm",content).addEventListener("submit",e=>{e.preventDefault();const f=new FormData(e.currentTarget);data.addresses.push({label:f.get("label").trim(),address:f.get("address").trim(),city:f.get("city").trim(),postcode:f.get("postcode").trim()});save();render();});
      content.querySelectorAll("[data-delete-address]").forEach(b=>b.addEventListener("click",()=>{data.addresses.splice(Number(b.dataset.deleteAddress),1);save();render();}));
    }
  };
  const open = () => { data=read(); render(); root.classList.add("open"); panel.setAttribute("aria-hidden","false"); document.body.style.overflow="hidden"; };
  const close = () => { root.classList.remove("open"); panel.setAttribute("aria-hidden","true"); document.body.style.overflow=""; };
  root.querySelectorAll("[data-account-close]").forEach(b=>b.addEventListener("click",close));
  root.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{data.active=b.dataset.tab;render();}));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&root.classList.contains("open"))close();});
  const headerActions = document.querySelector(".header-actions");
  if(headerActions){const b=document.createElement("button");b.type="button";b.className="wa-account-trigger";b.textContent="Account";b.setAttribute("aria-label","Open customer account");b.addEventListener("click",open);headerActions.insertBefore(b,headerActions.firstChild);}
  const mobileNav = document.querySelector(".mobile-app-nav");
  if(mobileNav){const b=document.createElement("button");b.type="button";b.className="app-nav-item wa-mobile-account";b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21c.5-4.1 3.2-6.2 7.5-6.2s7 2.1 7.5 6.2"/></svg><span>Account</span>';b.addEventListener("click",open);mobileNav.appendChild(b);}
})();