(() => {
  const page = document.querySelector("#prelaunch");
  const replayButton = document.querySelector("#replayReveal");
  const particleLayer = document.querySelector("#particles");
  if (!page) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isSmallScreen = window.matchMedia("(max-width: 700px)").matches;

  function seedParticles() {
    if (!particleLayer || reduceMotion) return;
    const count = isSmallScreen ? 12 : 22;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i += 1) {
      const particle = document.createElement("span");
      particle.className = "particle";
      particle.style.left = (3 + Math.random() * 94) + "%";
      particle.style.setProperty("--duration", (8 + Math.random() * 9) + "s");
      particle.style.setProperty("--delay", (-Math.random() * 15) + "s");
      particle.style.setProperty("--drift", ((Math.random() - 0.5) * 100) + "px");
      fragment.appendChild(particle);
    }
    particleLayer.appendChild(fragment);
  }

  function startReveal() {
    page.classList.remove("is-revealed", "is-replaying");
    void page.offsetWidth;
    page.classList.add("is-revealed");
  }

  seedParticles();

  if (reduceMotion) {
    page.classList.add("is-revealed");
  } else {
    window.addEventListener("load", () => window.setTimeout(startReveal, 220), { once: true });
  }

  if (replayButton) {
    replayButton.addEventListener("click", () => {
      if (reduceMotion) {
        startReveal();
        return;
      }
      page.classList.add("is-replaying");
      page.classList.remove("is-revealed");
      window.setTimeout(() => {
        page.classList.remove("is-replaying");
        void page.offsetWidth;
        page.classList.add("is-revealed");
      }, 80);
    });
  }

  // Restrained pointer parallax adds depth on desktop without moving the logo artwork itself.
  if (!reduceMotion && !isSmallScreen) {
    const stage = document.querySelector(".stage");
    window.addEventListener("pointermove", (event) => {
      if (!stage || event.pointerType !== "mouse") return;
      const x = (event.clientX / window.innerWidth - 0.5) * 7;
      const y = (event.clientY / window.innerHeight - 0.5) * 5;
      stage.style.translate = x + "px " + y + "px";
    }, { passive: true });
    window.addEventListener("pointerleave", () => {
      if (stage) stage.style.translate = "0 0";
    });
  }
})();