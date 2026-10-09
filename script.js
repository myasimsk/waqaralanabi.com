(() => {
  const page = document.querySelector("#prelaunch");
  const replayButton = document.querySelector("#replayReveal");
  if (!page) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function startReveal() {
    page.classList.remove("is-revealed", "is-replaying");
    // Force a reflow so the CSS animations can be replayed reliably.
    void page.offsetWidth;
    page.classList.add("is-revealed");
  }

  if (reduceMotion) {
    page.classList.add("is-revealed");
  } else {
    window.addEventListener("load", () => {
      window.setTimeout(startReveal, 350);
    }, { once: true });
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
      }, 100);
    });
  }
})();
