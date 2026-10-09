(() => {
  const artwork = document.querySelector("#artwork");
  const replay = document.querySelector("#replay");
  const particles = document.querySelector("#particles");
  if (!artwork) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function makeParticles() {
    if (!particles || reducedMotion || particles.childElementCount) return;
    const count = window.matchMedia("(max-width: 700px)").matches ? 13 : 24;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i += 1) {
      const dot = document.createElement("span");
      dot.className = "particle";
      dot.style.left = (2 + Math.random() * 96) + "%";
      dot.style.setProperty("--duration", (9 + Math.random() * 11) + "s");
      dot.style.setProperty("--delay", (-Math.random() * 16) + "s");
      dot.style.setProperty("--drift", ((Math.random() - .5) * 90) + "px");
      fragment.appendChild(dot);
    }
    particles.appendChild(fragment);
  }
  function replayReveal() {
    if (reducedMotion) return;
    artwork.classList.remove("is-revealing");
    void artwork.offsetWidth;
    artwork.classList.add("is-revealing");
  }
  artwork.classList.add("is-revealing");
  if (replay) replay.addEventListener("click", replayReveal);
  makeParticles();
})();