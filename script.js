(() => {
 const particles=document.querySelector("#particles");
 const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 if(!particles||reduce)return;
 const count=window.matchMedia("(max-width:700px)").matches?12:22;
 const fragment=document.createDocumentFragment();
 for(let i=0;i<count;i++){
  const dot=document.createElement("span");dot.className="particle";
  dot.style.left=(2+Math.random()*96)+"%";
  dot.style.setProperty("--duration",(10+Math.random()*12)+"s");
  dot.style.setProperty("--delay",(-Math.random()*18)+"s");
  dot.style.setProperty("--drift",((Math.random()-.5)*90)+"px");
  fragment.appendChild(dot);
 }
 particles.appendChild(fragment);
})();